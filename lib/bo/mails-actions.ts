"use server";

/* Écritures du module Mails (retour #108).
 *
 * Elles vont dans NOS tables `fi_*`, jamais dans le miroir `bo_*` : Bubble
 * réécrit `bo_*` chaque nuit, tout ce qu'on y poserait disparaîtrait.
 *
 * Doctrine d'envoi, héritée du netlinking et rappelée par MAV : l'application
 * prépare, un humain envoie. Aucune fonction ici ne part toute seule — une
 * salve se construit, se compte, s'aperçoit, et n'est expédiée que sur un
 * geste explicite.
 */

import { revalidateTag, updateTag } from "next/cache";
import {
  envoiPossible, envoyerEnMasse, envoyerPourAgent, expediteurMasse, masseConfiguree,
} from "@/lib/bo/mail";

/**
 * Au-delà, une salve ne peut plus partir d'une boîte personnelle.
 *
 * MAV : « pour les envois de masse faut que ça parte de SendGrid, sinon je
 * vais avoir trop d'e-mails envoyés dans ma boîte. » C'est vrai, et il y a
 * pire que l'encombrement : les fournisseurs plafonnent le sortant, et la
 * réputation de l'adresse qui envoie est celle qui trinque. Une poignée de
 * messages passe encore ; une campagne, non.
 */
const PLAFOND_BOITE_PERSO = 25;

/** Au-delà, la fenêtre « Nouveau message » renvoie vers la salve. */
const PLAFOND_UNITAIRE = 10;

/**
 * Le plafond de la journée, tous envois de masse confondus.
 *
 * MAV : « j'enverrai rarement plus de 5 000 messages par jour, limite il
 * faudrait simplement mettre une limite dans le BO pour ne pas l'atteindre et
 * pas faire de bêtise. »
 *
 * 5 000 par jour est précisément le seuil au-delà duquel Gmail vous classe
 * « expéditeur en masse » et vous impose ses obligations — taux de plainte
 * sous 0,3 %, authentification complète, désabonnement en un clic. On s'arrête
 * donc AVANT, avec une marge : franchir la ligne par mégarde un jour de grosse
 * salve coûterait des semaines de réputation.
 *
 * Le compte porte sur la journée civile et sur les salves réellement parties.
 * Réglable par la variable d'environnement `PLAFOND_JOUR` si le besoin change.
 *
 * NON exportée : ce fichier est un « use server », il ne peut exporter que des
 * fonctions asynchrones. Une constante y passe la compilation et fait tomber
 * la page à l'exécution. Sa valeur sort par `quotaDuJour()`.
 */
const PLAFOND_JOUR = Math.max(1, Number(process.env.PLAFOND_JOUR ?? 4000));

/** Ce qui est déjà parti aujourd'hui, et ce qu'il reste avant le plafond. */
export async function quotaDuJour(): Promise<{ envoyes: number; reste: number; plafond: number }> {
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const lignes = await lire<{ envoyes: number | null }>(
    "fi_salve",
    `select=envoyes&statut=eq.envoyee&envoye_at=gte.${debut.toISOString()}`,
  ).catch(() => [] as { envoyes: number | null }[]);
  const envoyes = lignes.reduce((s, l) => s + (l.envoyes ?? 0), 0);
  return { envoyes, reste: Math.max(0, PLAFOND_JOUR - envoyes), plafond: PLAFOND_JOUR };
}

/** Ce que l'écran de salve doit savoir avant d'envoyer : par où ça part.
 *
 *  L'agent est passé parce que l'expéditeur en dépend : avec un sous-domaine
 *  d'envoi, la salve part sous SON adresse, et l'écran doit annoncer celle
 *  qu'il verra vraiment — pas une adresse de service qui ne servira pas. */
export async function routeDeSalve(agent?: { nom?: string; email?: string }): Promise<{
  relais: boolean;
  expediteur: string;
  plafondBoitePerso: number;
  /** Le compteur du jour, pour l'afficher avant d'appuyer (plafond quotidien). */
  quota: { envoyes: number; reste: number; plafond: number };
}> {
  return {
    relais: masseConfiguree(),
    expediteur: expediteurMasse(agent),
    plafondBoitePerso: PLAFOND_BOITE_PERSO,
    quota: await quotaDuJour(),
  };
}
import { fusionner, valeursDe, type Expediteur, type RefPrenoms } from "@/lib/mails/fusion";
import type { Candidat, Cible, Filtres } from "@/lib/mails/audience";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Écriture REST sur une de nos tables, puis décrochage de son étiquette de
 *  cache — sans quoi l'agent enregistre et ne voit rien changer. */
/** Lecture simple, sans cache : le compteur du jour doit dire le vrai. */
async function lire<T>(table: string, qs = ""): Promise<T[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${table}${qs ? `?${qs}` : ""}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

async function ecrire(
  table: string,
  methode: "POST" | "PATCH" | "DELETE",
  corps?: unknown,
  filtre = "",
  entete: Record<string, string> = {},
) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const res = await fetch(`${SB_URL}/rest/v1/${table}${filtre ? `?${filtre}` : ""}`, {
    method: methode,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...entete,
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture ${table} ${res.status} : ${(await res.text()).slice(0, 200)}`);
  revalidateTag(table, { expire: 0 });
  try { updateTag(table); } catch { /* hors action serveur */ }
  const txt = await res.text();
  return txt ? (JSON.parse(txt) as Record<string, unknown>[]) : [];
}

/* ---------------- Dossiers ---------------- */

/** Déplace des messages : suppression = corbeille, pas d'effacement. Le corps
 *  du message vit dans le miroir, l'effacer ne servirait qu'à le voir revenir
 *  à la synchro suivante. */
export async function classerMails(
  ids: string[],
  dossier: "reception" | "envoyes" | "indesirables" | "corbeille",
  agentId?: string,
) {
  if (ids.length === 0) return;
  await ecrire(
    "fi_mail_etat",
    "POST",
    ids.map((mail_id) => ({ mail_id, dossier, maj_at: new Date().toISOString(), maj_par: agentId ?? null })),
    "",
    { Prefer: "resolution=merge-duplicates,return=representation" },
  );
}

export async function marquerLu(ids: string[], lu: boolean, agentId?: string) {
  if (ids.length === 0) return;
  /* On ne connaît pas forcément le dossier d'un message jamais déplacé : on
     pose la ligne avec son dossier naturel côté appelant, ici on ne touche
     qu'au drapeau de lecture quand la ligne existe déjà. */
  await ecrire("fi_mail_etat", "PATCH", { lu, maj_at: new Date().toISOString(), maj_par: agentId ?? null },
    `mail_id=in.(${ids.map((i) => `"${i}"`).join(",")})`);
}

/* ---------------- Messages types ---------------- */

export type MessageTypePatch = {
  libelle?: string;
  cible?: string | null;
  objet?: string;
  corps?: string;
  favori?: boolean;
};

export async function creerMessageType(m: MessageTypePatch & { agentId?: string }) {
  const [cree] = await ecrire("fi_message_type", "POST", {
    libelle: m.libelle?.trim() || "Sans titre",
    cible: m.cible ?? null,
    objet: m.objet ?? "",
    corps: m.corps ?? "",
    agent_id: m.agentId ?? null,
    favori: m.favori ?? false,
  });
  return String(cree?.id ?? "");
}

export async function majMessageType(id: string, m: MessageTypePatch) {
  await ecrire("fi_message_type", "PATCH",
    { ...m, updated_at: new Date().toISOString() }, `id=eq.${id}`);
}

/** On archive plutôt qu'on efface : un message type peut être cité par une
 *  salve déjà partie, son texte fait partie de la trace. */
export async function archiverMessageType(id: string) {
  await ecrire("fi_message_type", "PATCH",
    { archive: true, updated_at: new Date().toISOString() }, `id=eq.${id}`);
}

/* ---------------- Brouillons ---------------- */

export type BrouillonPatch = {
  objet?: string;
  corps?: string;
  destinataires?: { contactId?: string; email: string; nom?: string }[];
  messageTypeId?: string | null;
};

export async function creerBrouillon(b: BrouillonPatch & { agentId?: string; origine?: "manuel" | "automatisation" }) {
  const [cree] = await ecrire("fi_brouillon", "POST", {
    agent_id: b.agentId ?? null,
    objet: b.objet ?? "",
    corps: b.corps ?? "",
    destinataires: b.destinataires ?? [],
    message_type_id: b.messageTypeId ?? null,
    origine: b.origine ?? "manuel",
    /* Un brouillon posé par une automatisation attend explicitement un
       humain : c'est le garde-fou « pas d'envoi dans le dos du commercial ». */
    statut: b.origine === "automatisation" ? "a_valider" : "brouillon",
  });
  return String(cree?.id ?? "");
}

export async function majBrouillon(id: string, b: BrouillonPatch) {
  await ecrire("fi_brouillon", "PATCH", {
    objet: b.objet, corps: b.corps, destinataires: b.destinataires,
    message_type_id: b.messageTypeId,
    updated_at: new Date().toISOString(),
  }, `id=eq.${id}`);
}

export async function supprimerBrouillon(id: string) {
  await ecrire("fi_brouillon", "PATCH",
    { statut: "abandonne", updated_at: new Date().toISOString() }, `id=eq.${id}`);
}

/* ---------------- Envoi ---------------- */

/** Envoi unitaire, depuis la fenêtre « Nouveau message ».
 *
 *  L'expéditeur reste TOUJOURS la boîte authentifiée : un serveur refuse
 *  d'envoyer au nom d'une adresse dont on n'a pas les clés — Exchange en
 *  particulier. C'est l'adresse de l'agent qui part en `Reply-To`, pour que la
 *  réponse lui revienne à lui. */
export async function envoyerUnMessage(m: {
  to: string;
  objet: string;
  corps: string;
  /** Adresse de l'agent : elle sert de Reply-To, jamais de From. */
  repondreA?: string;
  /** L'agent expéditeur : on part de SA boîte quand elle est branchée. */
  agentId?: string;
  brouillonId?: string;
}) {
  if (!m.to.trim()) throw new Error("Aucun destinataire.");
  /* Cette fenêtre sert la correspondance du quotidien — une réponse, quelques
     destinataires. Au-delà, ce n'est plus un message, c'est une campagne : elle
     a son écran, son ciblage et sa route d'envoi. */
  const combien = m.to.split(",").map((x) => x.trim()).filter(Boolean).length;
  if (combien > PLAFOND_UNITAIRE) {
    throw new Error(
      `${combien} destinataires : passez par « Envoyer une salve ». Cette fenêtre part de votre `
      + `boîte personnelle, elle n'est pas faite pour l'envoi groupé.`,
    );
  }
  const r = await envoyerPourAgent(m.agentId, {
    to: m.to.trim(), subject: m.objet, text: m.corps, replyTo: m.repondreA,
  });
  if (m.brouillonId) {
    await ecrire("fi_brouillon", "PATCH",
      { statut: "envoye", envoye_at: new Date().toISOString() }, `id=eq.${m.brouillonId}`);
  }
  /* Le message est parti ; reste à dire s'il figure bien dans « Envoyés ». Un
     message introuvable après coup, c'est un message qu'on croit non envoyé. */
  return { copieDansEnvoyes: r.via === "smtp" ? undefined : r.copieDansEnvoyes };
}

/** Charge le vivier à la demande : contacts + immeubles + recherches, c'est
 *  lourd, l'écran Mails ne doit pas le payer tant qu'on n'ouvre pas la salve. */
export async function chargerVivier() {
  const { vivierMails } = await import("@/lib/bubble/server");
  return vivierMails();
}

/* ---------------- Salves ---------------- */

/** Enregistre une salve préparée. Elle ne part pas : elle attend `lancerSalve`.
 *  Séparer les deux gestes est volontaire — on veut pouvoir relire la liste
 *  des destinataires avant que quoi que ce soit ne sorte. */
export async function preparerSalve(s: {
  libelle: string;
  /** Une salve peut viser plusieurs types de clients à la fois (retour #121). */
  cibles: Cible[];
  filtres: Filtres;
  objet: string;
  corps: string;
  destinataires: { contactId: string; email: string; nom: string }[];
  messageTypeId?: string | null;
  agentId?: string;
}) {
  const [cree] = await ecrire("fi_salve", "POST", {
    agent_id: s.agentId ?? null,
    libelle: s.libelle || s.objet || "Salve",
    /* La colonne reste du texte : plusieurs cibles s'y écrivent séparées par
       une virgule, et le détail complet vit dans `filtres`. */
    cible: s.cibles.join(","),
    filtres: s.filtres,
    message_type_id: s.messageTypeId ?? null,
    objet: s.objet,
    corps: s.corps,
    destinataires: s.destinataires,
    statut: "a_valider",
  });
  return String(cree?.id ?? "");
}

export type ResultatSalve = { envoyes: number; echecs: number; journal: string[] };

/** Expédie une salve déjà préparée, une adresse après l'autre.
 *
 *  Séquentiel et espacé volontairement : une rafale de trois cents connexions
 *  sur la même boîte, c'est le meilleur moyen de se faire limiter par le
 *  serveur sortant et de finir en spam. Mieux vaut une minute de plus qu'un
 *  domaine grillé. */
export async function lancerSalve(
  salveId: string,
  candidats: Candidat[],
  ref: RefPrenoms,
  agent: Expediteur,
  /** L'agent expéditeur : sert de Reply-To, et de repli si besoin. */
  agentId?: string,
  /** Accepté explicitement à l'écran : partir de la boîte personnelle faute de
   *  relais dédié. Volontairement pénible, et plafonné. */
  viaBoitePerso?: boolean,
): Promise<ResultatSalve> {
  /* L'aiguillage, et le seul endroit où il se décide. Une salve passe par le
     relais dédié ; la boîte personnelle n'est acceptée qu'en dépannage, sur un
     petit volume, et seulement si on l'a demandé à l'écran. */
  const parRelais = masseConfiguree();

  /* Le plafond de la journée, avant tout le reste : il ne sert à rien de
     refuser au 4 001ᵉ message d'une salve déjà à moitié partie. On compte ce
     qui est sorti aujourd'hui, on y ajoute cette salve, et on tranche avant
     d'ouvrir la moindre connexion. */
  const q = await quotaDuJour();
  if (q.envoyes + candidats.length > PLAFOND_JOUR) {
    throw new Error(
      `Plafond du jour atteint : ${q.envoyes} message${q.envoyes > 1 ? "s" : ""} déjà envoyé${q.envoyes > 1 ? "s" : ""} `
      + `sur ${PLAFOND_JOUR}. Cette salve en ajouterait ${candidats.length}, il n'en reste que ${q.reste}. `
      + "Au-delà de 5 000 par jour, Gmail vous classe « expéditeur en masse » : mieux vaut étaler sur deux jours.",
    );
  }

  if (!parRelais) {
    if (!viaBoitePerso) {
      throw new Error(
        "Route d'envoi en masse non configurée. Une salve ne doit pas partir d'une boîte personnelle : "
        + "elle sature les « Envoyés », se fait couper par le plafond du fournisseur, et une plainte "
        + "abîmerait la réputation de l'adresse de tous les jours.",
      );
    }
    if (candidats.length > PLAFOND_BOITE_PERSO) {
      throw new Error(
        `${candidats.length} destinataires, c'est trop pour une boîte personnelle `
        + `(${PLAFOND_BOITE_PERSO} au maximum). Configurez la route d'envoi en masse.`,
      );
    }
    if (!(await envoiPossible(agentId))) {
      throw new Error("Aucune boîte e-mail branchée : allez la brancher dans Mails → Ma boîte e-mail.");
    }
  }

  const [salve] = await ecrire("fi_salve", "PATCH", { statut: "a_valider" }, `id=eq.${salveId}`);
  const objet = String(salve?.objet ?? "");
  const corps = String(salve?.corps ?? "");
  if (!objet.trim() || !corps.trim()) throw new Error("Salve sans objet ou sans texte.");

  const journal: string[] = [];
  let envoyes = 0;
  let echecs = 0;

  for (const c of candidats) {
    const v = valeursDe(c, ref, agent);
    const o = fusionner(objet, v);
    const b = fusionner(corps, v);
    try {
      if (parRelais) {
        await envoyerEnMasse({
          to: c.email, subject: o.texte, text: b.texte,
          replyTo: agent.email, agent,
        });
      } else {
        await envoyerPourAgent(agentId, {
          to: c.email, subject: o.texte, text: b.texte, replyTo: agent.email,
        });
      }
      envoyes += 1;
      if (b.manquants.length) journal.push(`${c.email} · envoyé, champs vides : ${b.manquants.join(", ")}`);
    } catch (e) {
      echecs += 1;
      journal.push(`${c.email} · ÉCHEC : ${e instanceof Error ? e.message : String(e)}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  await ecrire("fi_salve", "PATCH", {
    statut: "envoyee",
    envoyes, echecs,
    journal: journal.slice(0, 500),
    envoye_at: new Date().toISOString(),
  }, `id=eq.${salveId}`);

  return { envoyes, echecs, journal };
}

export async function abandonnerSalve(id: string) {
  await ecrire("fi_salve", "PATCH", { statut: "abandonnee" }, `id=eq.${id}`);
}
