"use server";

// Les relances — la partie qui lit et qui écrit.
//
// Les règles sont dans lib/bo/relances.ts, sans réseau et testées. Ici on va
// chercher les lignes et on repose les marques.
//
// Doctrine §7.1, inchangée : l'application PRÉPARE, l'agent ENVOIE. Rien ne
// part d'ici. « Marquer relancé » se pose APRÈS l'envoi, à la main, et c'est
// volontaire : marquer avant reviendrait à effacer de la liste des gens à qui
// on n'a rien écrit.

import { revalidatePath } from "next/cache";
import {
  FENETRE_DEFAUT, JOURS_RELANCE, PLAFOND_RELANCES, aRelancer, grouperParClient, joursDepuis,
  type BilanRelances, type PropositionRelance,
} from "./relances";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;


const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Lit une table du miroir, en pages.
 *
 * PostgREST plafonne une réponse à 1 000 lignes quoi qu'on demande dans
 * `limit` : un `limit=4000` rend mille lignes sans le dire, et l'écran affiche
 * alors une liste tronquée qui a l'air complète. On pagine donc à l'en-tête
 * `Range` jusqu'à ce qu'une page revienne incomplète.
 */
const PAGE = 1000;

async function pgBrut(chemin: string, plafond = 4000): Promise<Record<string, unknown>[]> {
  if (!SB_KEY) return [];
  const out: Record<string, unknown>[] = [];
  for (let d = 0; d < plafond; d += PAGE) {
    const f = Math.min(d + PAGE, plafond) - 1;
    const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        Range: `${d}-${f}`, "Range-Unit": "items",
      },
      cache: "no-store",
    });
    if (!res.ok) break;
    const rows = (await res.json()) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < f - d + 1) break;
  }
  return out;
}

/** Les documents `data` d'une table du miroir, paginés. */
async function pg(chemin: string, plafond = 4000): Promise<Record<string, unknown>[]> {
  const rows = await pgBrut(chemin, plafond);
  return rows.map((r) => r.data as Record<string, unknown>).filter(Boolean);
}

/** Le nombre exact de lignes que rend une requête, sans les rapatrier. */
async function compter(chemin: string): Promise<number> {
  if (!SB_KEY) return 0;
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      Prefer: "count=exact", Range: "0-0",
    },
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const n = Number(res.headers.get("content-range")?.split("/")[1]);
  return Number.isFinite(n) ? n : 0;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture Supabase ${res.status} : ${(await res.text()).slice(0, 200)}`);
}

/** La date de référence d'une proposition : le dernier geste connu. */
const dernierGeste = (p: Record<string, unknown>) =>
  S(p.date_last_relance) ?? S(p.date_envoi) ?? S(p["Created Date"]);

function versRelance(p: Record<string, unknown>, nom: string): PropositionRelance {
  return {
    id: String(p._id),
    immeubleId: String(p.IMMEUBLE ?? ""),
    contactId: S(p.ACHETEUR),
    nom,
    email: S(p.mail_adresse),
    statut: String(p.Statut ?? ""),
    depuis: dernierGeste(p),
    stop: p.stop_relances_yn === true,
    commentaire: S(p.commentaire),
  };
}

/**
 * Qui faut-il relancer aujourd'hui, et sur quoi.
 *
 * Le regroupement PAR CLIENT est le cœur du sujet : un acquéreur à qui l'on
 * doit trois relances reçoit un e-mail, pas trois.
 */
export async function relancesDues(
  jours = JOURS_RELANCE,
  fenetre = FENETRE_DEFAUT,
): Promise<BilanRelances> {
  const maintenant = Date.now();
  const borne = new Date(maintenant - fenetre * 86400000).toISOString();

  /* On filtre côté base : 27 000 propositions ne transitent pas par le serveur
     applicatif pour en garder 1 200. Le tri fin (statuts clos, coupures) se
     refait ensuite en mémoire — la base ne connaît pas nos règles. */
  const q = [
    "bo_proposition?select=data",
    "data->>Statut=eq." + encodeURIComponent("Envoyée"),
    "data->>stop_relances_yn=not.eq.true",
    "data->>ACHETEUR=not.is.null",
    `or=(data->>date_last_relance.gte.${borne},data->>date_envoi.gte.${borne})`,
    "order=id",
  ].join("&");
  const brutes = await pg(q, 6000);

  /* Les contacts et les immeubles, en une passe chacun. */
  const contactIds = [...new Set(brutes.map((p) => String(p.ACHETEUR ?? "")).filter(Boolean))];
  const immeubleIds = [...new Set(brutes.map((p) => String(p.IMMEUBLE ?? "")).filter(Boolean))];
  const [contacts, immeubles] = await Promise.all([
    parPaquets("bo_contact", contactIds),
    parPaquets("bo_immeuble", immeubleIds),
  ]);

  const nomDe = (id: string) => {
    const c = contacts.get(id);
    if (!c) return "Acquéreur";
    return `${S(c["prénom"]) ?? ""} ${S(c.nom) ?? ""}`.trim() || S(c.email) || "Acquéreur";
  };
  const libelles = new Map(
    [...immeubles.entries()].map(([id, im]) => [
      id,
      {
        libelle: [
          S(im.adresse_ville) ? `${S(im.adresse_ville)}${S(im.adresse_zipcode) ? ` (${S(im.adresse_zipcode)})` : ""}` : undefined,
          [S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ") || undefined,
        ].filter(Boolean).join(" — ") || "Immeuble",
        prix: typeof im.prix_hai === "number"
          ? `${Math.round(im.prix_hai as number).toLocaleString("fr-FR")} €`
          : undefined,
      },
    ]),
  );

  const props = brutes.map((p) => versRelance(p, nomDe(String(p.ACHETEUR ?? ""))));
  const clients = grouperParClient(props, libelles, maintenant, jours);

  /* Ce que la fenêtre laisse dehors. On le compte plutôt que de le taire :
     l'agent doit savoir qu'il existe un arriéré, et de quelle taille. */
  const horsFenetre = await compterHorsFenetre(borne);

  return { clients, horsFenetre, jours, fenetre };
}

async function parPaquets(table: string, ids: string[]) {
  const out = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 200) {
    const lot = ids.slice(i, i + 200);
    const filtre = `(${lot.map((x) => `"${x.replace(/"/g, "")}"`).join(",")})`;
    const rows = await pg(`${table}?select=data&id=in.${encodeURIComponent(filtre)}`, 200);
    for (const r of rows) out.set(String(r._id), r);
  }
  return out;
}

/**
 * L'arriéré : ce que la fenêtre laisse dehors.
 *
 * Le nombre de propositions se demande à la base (`count=exact`) plutôt que de
 * rapatrier quinze mille lignes pour les compter ici. Le nombre d'acquéreurs
 * distincts, lui, se calcule bien sur les lignes — mais on n'en tire que
 * l'identifiant, pas le document entier.
 */
async function compterHorsFenetre(borne: string) {
  if (!SB_KEY) return { propositions: 0, clients: 0 };
  /* L'arriéré, c'est exactement la NÉGATION du filtre de fenêtre : une
     proposition encore ouverte dont le dernier geste — relance ou envoi —
     précède la borne. Le premier jet ne prenait que celles jamais relancées et
     rendait zéro : la plupart des vieux dossiers ONT été relancés, il y a trois
     ans. Une bannière d'arriéré qui affiche zéro est pire qu'absente. */
  const filtres = [
    "data->>Statut=eq." + encodeURIComponent("Envoyée"),
    "data->>stop_relances_yn=not.eq.true",
    "data->>ACHETEUR=not.is.null",
    `not.or=(data->>date_last_relance.gte.${borne},data->>date_envoi.gte.${borne})`,
  ].join("&");
  const propositions = await compter(`bo_proposition?select=id&${filtres}`);

  /* Le nombre d'acquéreurs distincts demande les lignes — mais seulement leur
     identifiant, et en pages tirées ensemble : dix-sept mille lignes à la
     queue leu leu feraient attendre l'écran pour une bannière. */
  const chemin = `bo_proposition?select=a:data->>ACHETEUR&${filtres}&order=id`;
  const pages = Math.min(Math.ceil(propositions / PAGE), 30);
  const lots = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      fetch(`${SB_URL}/rest/v1/${chemin}`, {
        headers: {
          apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
          Range: `${i * PAGE}-${(i + 1) * PAGE - 1}`, "Range-Unit": "items",
        },
        cache: "no-store",
      }).then((r) => (r.ok ? (r.json() as Promise<{ a?: string }[]>) : [])).catch(() => [])),
  );
  const vus = new Set<string>();
  for (const lot of lots) for (const r of lot) if (r.a) vus.add(r.a);
  return { propositions, clients: vus.size };
}

/* --------------------------------------------------------- Écritures */

/** Marque un lot de propositions comme relancées aujourd'hui. */
export async function marquerRelances(propositionIds: string[]) {
  const now = new Date().toISOString();
  let n = 0;
  for (const id of propositionIds) {
    try {
      await rpc("bo_patch_doc", {
        p_table: "bo_proposition",
        p_id: id,
        p_patch: { date_last_relance: now, date_modif: now, "Modified Date": now },
      });
      n++;
    } catch {
      /* Une ligne qui résiste n'annule pas les autres : le contraire laisserait
         la moitié d'une relance marquée sans qu'on sache laquelle. */
    }
  }
  revalidatePath("/relances");
  revalidatePath("/propositions");
  return { marquees: n, total: propositionIds.length };
}

/**
 * Envoie les relances préparées, une personne après l'autre.
 *
 * MAV : « faut qu'on puisse relancer toutes les personnes à relancer en même
 * temps. » C'est ce bouton — mais l'envoi reste un geste d'agent : l'écran a
 * listé les destinataires, montré chaque message, et c'est un clic explicite
 * qui déclenche la salve (doctrine §7.1). Rien ne part tout seul.
 *
 * Séquentiel et espacé, comme les salves : une rafale de connexions sur la
 * même boîte se fait limiter aussi sûrement qu'un volume excessif. Un échec
 * n'arrête pas les suivants et n'est jamais marqué relancé — sinon la personne
 * disparaîtrait de la liste sans avoir rien reçu.
 */
export async function envoyerRelances(
  envois: { contactId: string; email: string; objet: string; corps: string; propositionIds: string[] }[],
  agentId?: string,
  repondreA?: string,
) {
  const { envoiPossible, envoyerPourAgent } = await import("@/lib/bo/mail");
  if (!(await envoiPossible(agentId))) {
    throw new Error(
      "Aucune boîte d'envoi n'est branchée : les messages ne peuvent pas partir. "
      + "Utilisez « Ouvrir dans le client mail » en attendant.",
    );
  }
  const lot = envois.slice(0, PLAFOND_RELANCES);
  const now = new Date().toISOString();
  const journal: string[] = [];
  let envoyes = 0;
  let echecs = 0;

  for (const e of lot) {
    try {
      await envoyerPourAgent(agentId, {
        to: e.email, subject: e.objet, text: e.corps, replyTo: repondreA,
      });
      envoyes++;
      for (const id of e.propositionIds) {
        await rpc("bo_patch_doc", {
          p_table: "bo_proposition",
          p_id: id,
          p_patch: { date_last_relance: now, date_modif: now, "Modified Date": now },
        }).catch(() => {});
      }
    } catch (err) {
      echecs++;
      journal.push(`${e.email} : ${err instanceof Error ? err.message : "échec d'envoi"}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  revalidatePath("/relances");
  revalidatePath("/propositions");
  return { envoyes, echecs, journal, restants: Math.max(0, envois.length - lot.length) };
}

/**
 * Coupe — ou rétablit — les relances sur une proposition.
 *
 * C'est la demande de la PERSONNE, pas un réglage d'agence : « ne me relancez
 * plus là-dessus ». On la respecte donc partout, y compris dans la relance
 * hebdomadaire, et elle se rétablit d'un clic si le client change d'avis.
 */
export async function couperRelances(propositionId: string, couper: boolean, immeubleId?: string) {
  return couperRelancesLot([propositionId], couper, immeubleId);
}

/**
 * Coupe — ou rétablit — les relances sur plusieurs propositions d'un coup.
 *
 * Utile parce qu'une même personne porte souvent DEUX lignes sur le même
 * immeuble (l'envoi et le téléchargement du dossier). Ne couper que celle qui
 * s'affiche laisserait la jumelle rappeler quelqu'un qui vient de demander
 * qu'on le laisse tranquille.
 */
export async function couperRelancesLot(propositionIds: string[], couper: boolean, immeubleId?: string) {
  const now = new Date().toISOString();
  for (const id of propositionIds) {
    await rpc("bo_patch_doc", {
      p_table: "bo_proposition",
      p_id: id,
      p_patch: { stop_relances_yn: couper, date_modif: now, "Modified Date": now },
    });
  }
  if (immeubleId) revalidatePath(`/bien/${immeubleId}`);
  revalidatePath("/relances");
  revalidatePath("/propositions");
}

/**
 * Note ce que l'acquéreur a répondu.
 *
 * Un retour REMET LA PENDULE À ZÉRO : on ne relance pas quelqu'un qui vient de
 * répondre. C'est la raison d'être du champ — sans ça, « il étudie le dossier »
 * se ferait relancer le lundi suivant.
 */
export async function noterRetour(propositionId: string, texte: string, immeubleId?: string) {
  const now = new Date().toISOString();
  await rpc("bo_patch_doc", {
    p_table: "bo_proposition",
    p_id: propositionId,
    p_patch: {
      commentaire: texte.trim() || null,
      date_last_relance: now,
      date_modif: now,
      "Modified Date": now,
    },
  });
  if (immeubleId) revalidatePath(`/bien/${immeubleId}`);
  revalidatePath("/relances");
  revalidatePath("/propositions");
}

/**
 * La recherche de l'acquéreur d'une proposition, prête pour la modale.
 *
 * MAV : « quand on clique sur refus on demande si on veut modifier la recherche
 * et ça ouvre la modale recherche si on dit oui. » Un refus est le moment où
 * l'on APPREND quelque chose sur le client — « trop cher », « pas ce secteur » —
 * et c'est exactement là que le critère mérite d'être corrigé. Trois minutes
 * plus tard on est passé à autre chose et la recherche reste fausse.
 *
 * On rend `null` quand l'acquéreur n'a aucune recherche : l'écran propose alors
 * d'en créer une, avec le contact déjà posé.
 */
export async function departRechercheDeProposition(propositionId: string) {
  const props = await pg(
    `bo_proposition?select=data&id=eq.${encodeURIComponent(propositionId)}`, 1,
  );
  const p = props[0];
  if (!p) return null;
  const contactId = S(p.ACHETEUR);

  /* La proposition porte souvent sa recherche d'origine ; sinon on prend la
     plus récente de l'acquéreur — c'est celle sur laquelle il vit. */
  const liees = Array.isArray(p.RECHERCHEs) ? (p.RECHERCHEs as unknown[]).map(String) : [];
  let r: Record<string, unknown> | undefined;
  if (liees.length) {
    const m = await parPaquets("bo_recherche", liees.slice(0, 5));
    r = [...m.values()].sort(cmpRecent)[0];
  }
  if (!r && contactId) {
    const autres = await pg(
      `bo_recherche?select=data&data->>ACHETEUR=eq.${encodeURIComponent(contactId)}&order=id`, 200,
    );
    r = autres.sort(cmpRecent)[0];
  }

  const c = contactId ? (await parPaquets("bo_contact", [contactId])).get(contactId) : undefined;
  const contact = c
    ? {
        id: String(c._id),
        nom: `${S(c["prénom"]) ?? ""} ${S(c.nom) ?? ""}`.trim() || S(c.email) || "Contact",
        tel: S(c.portable) ?? S(c.fixe),
        email: S(c.email),
      }
    : undefined;

  if (!r) return { recherche: null, contact };

  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const liste = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).map(String) : []);
  return {
    contact,
    recherche: {
      id: String(r._id),
      destinations: liste("Destinations"),
      /* Villes et départements sont deux listes en base ; la modale les
         resépare sur la forme du code, comme l'écran Recherches. */
      lieux: [
        ...liste("villes").filter((v) => !/^\d{13}x\d+$/.test(v)),
        ...liste("dpts").filter((v) => /^\d{2,3}[AB]?$/.test(v)),
      ],
      commentaire: S(r.commentaire),
      contact,
      brut: {
        cible: S(r.Cible),
        prixMin: n(r.prix_min), prixMax: n(r.prix_max),
        surfaceMin: n(r.surface_min), surfaceMax: n(r.surface_max),
        occupMin: n(r.occup_min), occupMax: n(r.occup_max),
        renta: n(r.renta),
      },
    },
  };
}

const cmpRecent = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  String(b["Modified Date"] ?? b["Created Date"] ?? "").localeCompare(
    String(a["Modified Date"] ?? a["Created Date"] ?? ""),
  );

/**
 * Toutes les propositions d'un immeuble qui méritent une relance.
 *
 * Rend la liste plutôt que de la relancer : l'écran affiche qui est concerné,
 * l'agent valide. Le nombre est presque toujours une surprise — d'où le refus
 * de le faire d'un clic aveugle.
 */
export async function propositionsARelancer(immeubleId: string, jours = JOURS_RELANCE) {
  const maintenant = Date.now();
  const rows = await pg(
    `bo_proposition?select=data&data->>IMMEUBLE=eq.${encodeURIComponent(immeubleId)}&order=id`,
    3000,
  );
  const contactIds = [...new Set(rows.map((p) => String(p.ACHETEUR ?? "")).filter(Boolean))];
  const contacts = await parPaquets("bo_contact", contactIds);
  const nomDe = (id: string) => {
    const c = contacts.get(id);
    if (!c) return "Acquéreur";
    return `${S(c["prénom"]) ?? ""} ${S(c.nom) ?? ""}`.trim() || S(c.email) || "Acquéreur";
  };
  return rows
    .map((p) => versRelance(p, nomDe(String(p.ACHETEUR ?? ""))))
    .filter((p) => aRelancer(p, maintenant, jours))
    .map((p) => ({ ...p, jours: joursDepuis(p.depuis, maintenant) }))
    .sort((a, b) => (b.jours ?? 999) - (a.jours ?? 999));
}
