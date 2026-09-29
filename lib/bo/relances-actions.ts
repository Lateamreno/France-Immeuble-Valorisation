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
  FENETRE_DEFAUT, JOURS_RELANCE, PLAFOND_RELANCES, aRelancer, grouperParClient, joursDepuis, motifHorsVente,
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

function versRelance(p: Record<string, unknown>, nom: string, horsVente?: string): PropositionRelance {
  return {
    horsVente,
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
  const { derniersDossiers } = await import("./piece-dossier");
  const { lienDuDossier, urlPdfDossier, nomPdfDossier } = await import("./lien-dossier");
  const { resumeDepuisDoc, objetDepuisDoc } = await import("./resume-immeuble");
  const { sourcePdfDossier } = await import("./piece-dossier");
  const [contacts, immeubles, dossiers] = await Promise.all([
    parPaquets("bo_contact", contactIds),
    parPaquets("bo_immeuble", immeubleIds),
    derniersDossiers(immeubleIds),
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
        resume: resumeDepuisDoc(im),
        court: objetDepuisDoc(im),
        /* Le lien transfer.it du dernier dossier et sa date (MAV, 28/09), et
           si ce dossier a un PDF à joindre. */
        ...(() => {
          const d = dossiers.get(id);
          const l = lienDuDossier(d);
          return {
            lien: l?.url, lienPerime: l?.aRemplacer, lienExpireLe: l?.expireLe,
            sansPdf: !d || !sourcePdfDossier(d),
            dossierId: d ? String(d._id ?? "") || undefined : undefined,
            dossierVersion: d && Number(d.version) > 0 ? Number(d.version) : undefined,
            pdf: urlPdfDossier(d),
            pdfNom: d ? nomPdfDossier(S(im.adresse_ville), d.version) : undefined,
          };
        })(),
      },
    ]),
  );

  /* Un immeuble archivé, vendu ou retiré sort de la relance (MAV, 25/09). */
  const props = brutes.map((p) => versRelance(p, nomDe(String(p.ACHETEUR ?? "")), motifHorsVente(immeubles.get(String(p.IMMEUBLE ?? "")))));
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
export async function marquerRelances(propositionIds: string[], chemins: string[] = []) {
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
  for (const c of chemins) revalidatePath(c);
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
  envois: { contactId: string; email: string; objet: string; corps: string; propositionIds: string[]; immeubleIds?: string[] }[],
  agentId?: string,
  repondreA?: string,
  /** Pages à rafraîchir en plus (la fiche contact d'où part la relance). */
  chemins: string[] = [],
  /**
   * La relance GROUPÉE part par le relais SendGrid (MAV, 29/09 : « option
   * SendGrid ») : sous l'adresse agence de l'agent, réponse vers lui, sans
   * toucher à la boîte OVH ni à son plafond. `salveId` est la ligne
   * `fi_salve` ouverte pour cette salve : elle porte le compte, et c'est par
   * elle que le plafond du jour la voit. La relance d'UNE personne reste sur
   * la boîte de l'agent : c'est une conversation.
   */
  options: { voie?: "boite" | "masse"; salveId?: string; avant?: { envoyes: number; echecs: number } } = {},
) {
  const mail = await import("@/lib/bo/mail");
  const { envoyerPourAgent } = mail;
  const parRelais = options.voie === "masse";
  if (parRelais && !mail.masseConfiguree()) {
    throw new Error("Route d'envoi en masse (SendGrid) non configurée : la relance groupée ne peut pas partir.");
  }
  if (!parRelais && !(await mail.envoiPossible(agentId))) {
    throw new Error(
      "Aucune boîte d'envoi n'est branchée : les messages ne peuvent pas partir. "
      + "Utilisez « Ouvrir dans le client mail » en attendant.",
    );
  }
  /* Par le relais : l'expéditeur est l'agent, sous son adresse agence, et le
     plafond du jour (tous envois de masse confondus) se vérifie AVANT le lot. */
  let agentMasse: { nom?: string; email?: string } = {};
  if (parRelais) {
    agentMasse = await agentExpediteur(agentId);
    const { quotaDuJour } = await import("./mails-actions");
    const q = await quotaDuJour();
    if (q.envoyes + envois.length > q.plafond) {
      throw new Error(
        `Plafond du jour : ${q.envoyes} message${q.envoyes > 1 ? "s" : ""} déjà parti${q.envoyes > 1 ? "s" : ""} sur ${q.plafond}, `
        + `il en reste ${q.reste}. Reprenez demain.`,
      );
    }
  }
  const lot = envois.slice(0, PLAFOND_RELANCES);
  const now = new Date().toISOString();
  const journal: string[] = [];
  let envoyes = 0;
  let echecs = 0;

  /* MAV (28/09) : « je veux qu'il y ait toujours une pièce jointe physique ».
     Le dernier dossier de chaque immeuble est lu UNE fois pour toute la salve,
     puis joint à chaque relance qui parle de cet immeuble. Un dossier sans PDF
     est signalé dans le journal, il n'arrête pas l'envoi. */
  const { derniersDossiers, lirePiece, nomPieceDossier, sourcePdfDossier } = await import("./piece-dossier");
  /* Un envoi qui n'annonce pas ses immeubles (relance directe depuis une
     carte) les retrouve par ses propositions : sans ça, il partait sans PDF
     et sans contrôle du lien (vu le 28/09 sur Sens). */
  const sansImmeubles = lot.filter((e) => !e.immeubleIds?.length);
  if (sansImmeubles.length) {
    const ids = [...new Set(sansImmeubles.flatMap((e) => e.propositionIds))];
    const props = await parPaquets("bo_proposition", ids).catch(() => new Map<string, Record<string, unknown>>());
    for (const e of sansImmeubles) {
      e.immeubleIds = [...new Set(e.propositionIds.map((id) => S(props.get(id)?.IMMEUBLE) ?? "").filter(Boolean))];
    }
  }
  const tousImmeubles = [...new Set(lot.flatMap((e) => e.immeubleIds ?? []))];
  const dossiers = await derniersDossiers(tousImmeubles);
  const pieces = new Map<string, { nom: string; contenu: Buffer; type: string }>();
  for (const imId of tousImmeubles) {
    const d = dossiers.get(imId);
    const src = d ? sourcePdfDossier(d) : null;
    if (!d || !src) { journal.push(`Immeuble ${imId} : aucun PDF de dossier à joindre.`); continue; }
    const r = await lirePiece({ nom: nomPieceDossier(S(d.ville) ?? undefined, d.version), ...src });
    if (r.ok) pieces.set(imId, r.piece);
    else journal.push(`Immeuble ${imId} : ${r.message}`);
  }

  /* Le lien transfer.it est OBLIGATOIRE (MAV, 28/09 : « de telle façon qu'on
     envoie toujours un lien ») : un immeuble sans lien valable retient la
     relance, et le journal dit où le poser. Contrôle côté serveur, pas
     seulement à l'écran. */
  const { lienDuDossier } = await import("./lien-dossier");
  const sansLien = new Set(tousImmeubles.filter((id) => { const l = lienDuDossier(dossiers.get(id)); return !l || l.aRemplacer; }));

  for (const e of lot) {
    const bloques = (e.immeubleIds ?? []).filter((id) => sansLien.has(id));
    if (bloques.length) {
      echecs++;
      journal.push(`${e.email} : pas de lien transfer.it valable sur ${bloques.length > 1 ? "des dossiers" : "le dossier"} — à poser sur la fiche (Dossiers).`);
      continue;
    }
    try {
      const attachments = (e.immeubleIds ?? [])
        .map((id) => pieces.get(id))
        .filter((p): p is { nom: string; contenu: Buffer; type: string } => !!p)
        .map((p) => ({ filename: p.nom, content: p.contenu, contentType: p.type }));
      if (parRelais) {
        await mail.envoyerEnMasse({
          to: e.email, subject: e.objet, text: e.corps,
          replyTo: repondreA ?? agentMasse.email, agent: agentMasse,
          pieces: attachments.length ? attachments.map((a) => ({ nom: a.filename, contenu: a.content, type: a.contentType })) : undefined,
        });
      } else {
        await envoyerPourAgent(agentId, {
          to: e.email, subject: e.objet, text: e.corps, replyTo: repondreA,
          attachments: attachments.length ? attachments : undefined,
        });
      }
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
      journal.push(`E-mail ${e.email} : ${err instanceof Error ? err.message : "échec d'envoi"}`);
    }
    await new Promise((r) => setTimeout(r, parRelais ? 150 : 400));
  }

  /* Le compte de la salve, sur sa ligne : c'est elle que lit le journal des
     salves (Mails › Salves) et le plafond du jour. */
  if (options.salveId) {
    const avant = options.avant ?? { envoyes: 0, echecs: 0 };
    await ecrireFi("fi_salve", "PATCH", {
      envoyes: avant.envoyes + envoyes, echecs: avant.echecs + echecs,
      journal: journal.slice(0, 50), envoye_at: new Date().toISOString(),
    }, `id=eq.${encodeURIComponent(options.salveId)}`).catch(() => undefined);
  }

  revalidatePath("/relances");
  revalidatePath("/propositions");
  for (const c of chemins) revalidatePath(c);
  return { envoyes, echecs, journal, restants: Math.max(0, envois.length - lot.length) };
}

/** L'agent tel qu'il signe une salve : nom affiché et adresse (le Reply-To). */
async function agentExpediteur(agentId?: string): Promise<{ nom?: string; email?: string }> {
  if (!agentId) return {};
  const { getAgentFiche } = await import("@/lib/bubble/server");
  const a = await getAgentFiche(agentId).catch(() => null);
  if (!a) return {};
  return {
    nom: [a["prénom"], a.nom].filter(Boolean).join(" ").trim() || undefined,
    email: typeof a.email === "string" && a.email.includes("@") ? a.email : undefined,
  };
}

/** Écrit dans nos tables `fi_*` (jamais dans le miroir `bo_*`). */
async function ecrireFi(table: string, methode: "POST" | "PATCH", corps: Record<string, unknown>, filtre = "") {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const res = await fetch(`${SB_URL}/rest/v1/${table}${filtre ? `?${filtre}` : ""}`, {
    method: methode,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: JSON.stringify(corps),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture ${table} ${res.status} : ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Record<string, unknown>[];
}

/**
 * Le récapitulatif d'une salve de relances, dans la boîte de l'agent (MAV,
 * 29/09 : « ok pour un récap à la fin de chaque salve »). C'est sa trace :
 * les relances groupées partent par le relais, elles ne sont pas dans ses
 * « Envoyés ». Part de sa boîte vers lui-même ; à défaut, par le relais.
 * Rend l'adresse servie, ou la raison de l'échec.
 */
export async function recapSalveRelances(r: {
  titre: string; agentId?: string; voie: "masse" | "boite"; expediteur?: string;
  objet: string; corps: string;
  mails: { fait: number; total: number; echecs: number };
  sms: { fait: number; total: number; echecs: number };
  journal: string[];
  destinataires: string[];
  arretee?: boolean;
  smsTexte?: string;
}): Promise<{ ok: boolean; adresse?: string; message?: string }> {
  const mail = await import("@/lib/bo/mail");
  const adresse = await mail.adresseCopieCachee(r.agentId);
  if (!adresse) return { ok: false, message: "aucune adresse pour le récapitulatif (MAIL_COPIE ou boîte de l'agent)" };
  const quand = new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
  const pl = (n: number, m: string) => `${n} ${m}${n > 1 ? "s" : ""}`;
  const etat = r.arretee ? "arrêtée avant la fin" : "terminée";
  const bilanMails = r.mails.total ? `${r.mails.fait} / ${r.mails.total} e-mail${r.mails.total > 1 ? "s" : ""} envoyé${r.mails.fait > 1 ? "s" : ""}${r.mails.echecs ? ` · ${pl(r.mails.echecs, "échec")}` : ""}` : "pas d'e-mail";
  const bilanSms = r.sms.total ? `${r.sms.fait} / ${r.sms.total} SMS envoyé${r.sms.fait > 1 ? "s" : ""}${r.sms.echecs ? ` · ${pl(r.sms.echecs, "échec")}` : ""}` : "pas de SMS";
  const sujet = `Récapitulatif — ${r.titre} : ${bilanMails}${r.sms.total ? `, ${bilanSms}` : ""}`;
  const lignes = [
    `${r.titre} — salve ${etat} le ${quand}.`,
    ``,
    `E-mails : ${bilanMails}.`,
    `SMS : ${bilanSms}.`,
    `Route : ${r.voie === "masse" ? `relais SendGrid${r.expediteur ? `, expéditeur ${r.expediteur}` : ""}` : "votre boîte"}.`,
    ``,
    `Objet envoyé : ${r.objet}`,
    ``,
    `--- Message envoyé ---`,
    r.corps.trim(),
    `--- fin du message ---`,
    ...(r.smsTexte ? [``, `--- SMS envoyé ---`, r.smsTexte.trim(), `--- fin du SMS ---`] : []),
    ``,
    r.journal.length ? `Échecs et remarques (${r.journal.length}) :` : `Aucun échec.`,
    ...r.journal.slice(0, 60).map((l) => `  • ${l}`),
    ...(r.journal.length > 60 ? [`  … et ${r.journal.length - 60} de plus, voir Mails › Salves.`] : []),
    ``,
    `Destinataires (${r.destinataires.length}) :`,
    ...r.destinataires.map((d) => `  • ${d}`),
    ``,
    `Ce récapitulatif est envoyé automatiquement par le back-office à la fin de chaque salve de relances.`,
  ];
  const texte = lignes.join("\n");
  try {
    await mail.envoyerPourAgent(r.agentId, { to: adresse, subject: sujet, text: texte });
    return { ok: true, adresse };
  } catch (e1) {
    if (!mail.masseConfiguree()) return { ok: false, message: e1 instanceof Error ? e1.message : String(e1) };
    try {
      const a = await agentExpediteur(r.agentId);
      await mail.envoyerEnMasse({ to: adresse, subject: sujet, text: texte, replyTo: a.email, agent: a });
      return { ok: true, adresse };
    } catch (e2) {
      return { ok: false, message: e2 instanceof Error ? e2.message : String(e2) };
    }
  }
}

/**
 * Par où part une relance groupée, et sous quelle adresse : ce que la fenêtre
 * annonce avant le clic. Le relais SendGrid s'il est configuré, la boîte de
 * l'agent sinon (avec son plafond horaire).
 */
export async function voieRelancesGroupees(agentId?: string): Promise<{
  voie: "masse" | "boite"; expediteur: string; repondreA?: string;
}> {
  const { masseConfiguree, expediteurDe } = await import("@/lib/bo/mail");
  if (!masseConfiguree()) return { voie: "boite", expediteur: "" };
  const a = await agentExpediteur(agentId);
  return { voie: "masse", expediteur: expediteurDe(a), repondreA: a.email };
}

/**
 * Ouvre la ligne de salve d'une relance groupée par le relais : le journal
 * des salves la montre en direct, et le plafond du jour la compte.
 */
export async function ouvrirSalveRelances(s: {
  titre: string; total: number; objet: string; corps: string; agentId?: string; immeubleId?: string;
}): Promise<string> {
  try {
    const [cree] = await ecrireFi("fi_salve", "POST", {
      agent_id: s.agentId ?? null,
      libelle: s.titre,
      cible: "relances",
      filtres: { relance: true, immeubleId: s.immeubleId ?? null, total: s.total },
      objet: s.objet, corps: s.corps,
      destinataires: [],
      statut: "envoyee", envoyes: 0, echecs: 0,
      envoye_at: new Date().toISOString(),
    });
    return String(cree?.id ?? "");
  } catch {
    /* Sans ligne, la salve part quand même : le journal la manquera, pas les
       destinataires. */
    return "";
  }
}

/**
 * Ce que la boîte a envoyé dans l'heure : le nombre de propositions marquées
 * relancées depuis soixante minutes, et la première d'entre elles — c'est elle
 * qui dit quand la fenêtre se libère. La salve (components/salve-relances.tsx)
 * s'en sert pour tenir le plafond horaire toute seule, y compris après une
 * page fermée et rouverte.
 */
export async function relancesDerniereHeure(): Promise<{ n: number; premiere: string | null }> {
  const depuis = new Date(Date.now() - 3_600_000).toISOString();
  const rows = await pgBrut(
    `bo_proposition?select=d:data->>date_last_relance&data->>date_last_relance=gte.${encodeURIComponent(depuis)}&order=data->>date_last_relance.asc`,
    1000,
  );
  const dates = rows.map((r) => S(r.d) ?? "").filter(Boolean);
  return { n: dates.length, premiere: dates[0] ?? null };
}

/** L'envoi est-il possible depuis la boîte de cet agent ? L'écran le demande
 *  avant de proposer un bouton qui enverrait dans le vide. */
export async function relanceEnvoiPossible(agentId?: string) {
  const { envoiPossible } = await import("@/lib/bo/mail");
  return envoiPossible(agentId);
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

  const contact = await contactDe(contactId);
  if (!r) return { recherche: null, contact };
  return { contact, recherche: versDepart(r, contact) };
}

/**
 * Une recherche précise, prête pour la modale (#366 : sur la fiche contact,
 * la vignette d'une recherche matchée l'ouvre directement en modification).
 */
export async function departRecherche(rechercheId: string) {
  const r = (await parPaquets("bo_recherche", [rechercheId])).get(rechercheId);
  if (!r) return null;
  const contact = await contactDe(S(r.ACHETEUR));
  return { contact, recherche: versDepart(r, contact) };
}

async function contactDe(contactId?: string) {
  const c = contactId ? (await parPaquets("bo_contact", [contactId])).get(contactId) : undefined;
  return c
    ? {
        id: String(c._id),
        nom: `${S(c["prénom"]) ?? ""} ${S(c.nom) ?? ""}`.trim() || S(c.email) || "Contact",
        tel: S(c.portable) ?? S(c.fixe),
        email: S(c.email),
      }
    : undefined;
}

function versDepart(
  r: Record<string, unknown>,
  contact?: { id: string; nom: string; tel?: string; email?: string },
) {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const liste = (k: string) => (Array.isArray(r[k]) ? (r[k] as unknown[]).map(String) : []);
  return {
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
  const [contacts, ims] = await Promise.all([parPaquets("bo_contact", contactIds), parPaquets("bo_immeuble", [immeubleId])]);
  const horsVente = motifHorsVente(ims.get(immeubleId));
  const nomDe = (id: string) => {
    const c = contacts.get(id);
    if (!c) return "Acquéreur";
    return `${S(c["prénom"]) ?? ""} ${S(c.nom) ?? ""}`.trim() || S(c.email) || "Acquéreur";
  };
  /* Le portable, pour que la relance groupée puisse aussi partir en SMS
     (MAV, 29/09 : « modifier le texte des relances par e-mail et SMS »). */
  const telDe = (id: string) => S(contacts.get(id)?.portable);
  return rows
    .map((p) => versRelance(p, nomDe(String(p.ACHETEUR ?? "")), horsVente))
    .filter((p) => aRelancer(p, maintenant, jours))
    .map((p) => ({ ...p, jours: joursDepuis(p.depuis, maintenant), tel: telDe(p.contactId ?? "") }))
    .sort((a, b) => (b.jours ?? 999) - (a.jours ?? 999));
}

/* ---------------------------------------------------- La file des salves
   (lib/bo/relances-file.ts) : la salve est écrite en base et c'est le serveur
   qui l'envoie, page ouverte ou non. Ces actions sont ce que les écrans et la
   pastille appellent. */

export async function lancerSalveRelances(s: {
  titre: string; agentId?: string; agentNom?: string; immeubleId?: string;
  mails: { contactId: string; email: string; objet: string; corps: string; propositionIds: string[]; immeubleIds?: string[] }[];
  sms: { contactId?: string; tel?: string; immeubleId: string; libelle: string; propositionIds: string[]; texte?: string }[];
  chemins?: string[];
}) {
  const file = await import("./relances-file");
  /* Une seule salve à la fois : la file est courte et lisible. */
  const active = await file.etat();
  if (active) return { ok: false as const, message: `Une relance est déjà en cours (${active.titre}) : attendez sa fin, ou arrêtez-la depuis la pastille.`, etat: active };
  const etat = await file.inscrire(s);
  return { ok: true as const, etat };
}

/** Fait avancer une salve pendant `budgetMs` au plus (plafonné à 45 s). */
export async function tournerSalveRelances(id: string, budgetMs = 40_000) {
  const file = await import("./relances-file");
  return file.tourner(id, Math.max(3_000, Math.min(45_000, budgetMs)));
}

export async function etatSalveRelances(id?: string) {
  const file = await import("./relances-file");
  return file.etat(id);
}

/** La salve à montrer dans la pastille : en cours, ou finie depuis peu. */
export async function derniereSalveRelances() {
  const file = await import("./relances-file");
  return file.derniere();
}

export async function arreterSalveRelances(id: string) {
  const file = await import("./relances-file");
  return file.arreter(id);
}
