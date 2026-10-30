// Les formulaires du site France Immeuble, reçus par le BO (contrat §6, lot 3).
//
// Le site poste sur /api/site/lead ; ce fichier fait le travail. Trois
// formulaires, trois traitements :
//   - Vendre / Estimer → un immeuble au statut « 1 - FORMULAIRE », sous la même
//     vignette que les anciens formulaires (le suivi « Formulaire » porte le
//     texte que la carte affiche) ;
//   - Recherche → le contact, retrouvé par e-mail ou créé avec la note D, et
//     une recherche par ligne du formulaire ;
//   - Contact depuis une fiche à vendre → une DEMANDE DE DOSSIER dans
//     Questions, rattachée au bien et à son agent.
//
// Le site réessaie tout ce qui n'a pas reçu 200 (file `leads_outbox`). Chaque
// objet créé porte donc un identifiant tiré de la référence du formulaire :
// un réessai retrouve ce qui existe et ne crée rien de plus. Aucun e-mail ne
// part vers le visiteur, et rien ne se publie : on enregistre, c'est tout.

import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { deposerCompte, effacerCompte, effacerPieceDuSite, lirePieceDuSite } from "@/lib/bo/compte-site";
import { capturerFacadeRue, enregistrerRecherche, saveAdresse } from "@/lib/bo/actions";
import { getAgents } from "@/lib/bubble/server";
import { AGENT_DEFAUT_INITIALES } from "@/lib/bo/agent-defaut";
import { CIBLES } from "@/lib/referentiels";

const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* ------------------------------------------------------------------ Base */

async function lire(chemin: string): Promise<{ id: string; data: Record<string, unknown> }[]> {
  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const res = await fetch(`${BO_URL}/rest/v1/${chemin}`, {
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Lecture ${res.status} : ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function rpc(fn: string, args: Record<string, unknown>) {
  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const res = await fetch(`${BO_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture ${fn} ${res.status} : ${(await res.text()).slice(0, 200)}`);
}

const present = async (table: string, id: string) =>
  (await lire(`${table}?select=id&id=eq.${encodeURIComponent(id)}&limit=1`)).length > 0;

/**
 * Existe, ou a existé : une fiche passée à la corbeille compte comme traitée.
 * La base refuse d'ailleurs de la recréer (déclencheur
 * `trg_bo_refuser_reinsertion`) : un complément qui arrive après que l'agent a
 * supprimé le formulaire ne doit pas le ressusciter, ni boucler en erreur.
 */
const existe = async (table: string, id: string) =>
  (await present(table, id)) ||
  (await lire(`bo_trash?select=id&id=eq.${encodeURIComponent(id)}&src_table=eq.${table}&limit=1`).catch(() => [])).length > 0;

/** Insère, puis relit : un 200 au site doit vouloir dire « c'est dans la base ». */
async function inserer(table: string, id: string, doc: Record<string, unknown>) {
  await rpc("bo_insert_doc", { p_table: table, p_id: id, p_doc: sansVides(doc) });
  if (!(await present(table, id))) throw new Error(`${table} ${id} : l'insertion n'a rien laissé dans la base.`);
}

const sansVides = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/* -------------------------------------------------------------- Lecture */

const T = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const N = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const L = (v: unknown) => (Array.isArray(v) ? v.map((x) => T(x, 120)).filter((x): x is string => !!x) : []);

/** Une référence UUID, ou rien : c'est elle qui fabrique les identifiants. */
function reference(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s.replace(/-/g, "") : null;
}

export class LeadInvalide extends Error {}

/**
 * Pas encore rangeable (règle du 30/10, demande du site) : le BO ne répond 200
 * que si l'envoi est réellement enregistré. Un envoi qu'il ne sait pas encore
 * lire, ou qui arrive avant celui dont il dépend, reçoit un 503 : le site le
 * garde dans sa file et le réessaie, rien ne se perd.
 */
export class LeadPasPret extends Error {}

/* ---------------------------------------------------------- Les agents */

async function agentParDefaut(): Promise<string | undefined> {
  const agents = await getAgents().catch(() => []);
  return (agents.find((a) => a.initials === AGENT_DEFAUT_INITIALES) ?? agents[0])?.id;
}

/* ---------------------------------------------------------- Le contact */

/**
 * Le contact du formulaire : retrouvé par son e-mail, sinon créé. Un contact
 * existant n'est jamais modifié (sa note, son agent restent ceux du BO) ; un
 * nouveau reçoit la note D quand le contrat le demande.
 */
async function contactDuLead(ref: string, p: {
  prenom?: string; nom?: string; email?: string; telephone?: string;
  source: string; agentId?: string; noteD: boolean; vendeur?: boolean; acheteur?: boolean;
  /** La clé du compte du site, quand le formulaire vient d'un compte (§9.4). */
  compte?: string | null;
}): Promise<{ id: string; nouveau: boolean }> {
  if (p.compte) {
    const deja = await contactParCompte(p.compte);
    if (deja) return { id: deja, nouveau: false };
  }
  if (p.email) {
    // ilike sans joker : « _ » et « % » sont fréquents dans une adresse.
    const motif = p.email.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
    const [c] = await lire(`bo_contact?select=id,data&data->>email=ilike.${encodeURIComponent(motif)}&limit=1`);
    if (c) return { id: c.id, nouveau: false };
  }
  /* Retour #511 : « il a créé un contact alors qu'il y a déjà le numéro de
     portable associé à quelqu'un ». Après l'e-mail, le téléphone. */
  const parTel = await contactParTelephone(p.telephone, p.nom);
  if (parTel) return { id: parTel, nouveau: false };
  const id = `app_site_${ref}_c`;
  if (await existe("bo_contact", id)) return { id, nouveau: false };
  const now = new Date().toISOString();
  await inserer("bo_contact", id, {
    "prénom": p.prenom,
    nom: p.nom ?? (p.email ? p.email.split("@")[0] : "Contact du site"),
    email: p.email?.toLowerCase(),
    portable: p.telephone,
    Source: p.source,
    source: p.source,
    Note: p.noteD ? "D" : undefined,
    vendeur: p.vendeur ?? false,
    acheteur: p.acheteur ?? false,
    agent: false,
    archived: false,
    SUIVI: p.agentId,
    "Created Date": now,
    "Modified Date": now,
  });
  return { id, nouveau: true };
}

/** Les neuf derniers chiffres d'un numéro : « +33 6 12… », « 06.12… » et « 0612… » se rejoignent. */
const neufChiffres = (v: unknown) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
};

/**
 * Un contact qui porte déjà ce numéro (portable ou fixe). La base stocke les
 * numéros sous toutes les formes : on ramène large sur les quatre derniers
 * chiffres, puis on compare les neuf derniers. Plusieurs fiches : celle qui
 * porte le même nom, sinon la plus récemment modifiée.
 */
async function contactParTelephone(tel?: string, nom?: string): Promise<string | null> {
  const cle = neufChiffres(tel);
  if (!cle) return null;
  const motif = encodeURIComponent(`*${cle.slice(-4, -2)}*${cle.slice(-2)}`);
  const candidats = await lire(
    `bo_contact?select=id,data&or=(data->>portable.ilike.${motif},data->>fixe.ilike.${motif})&limit=300`,
  );
  const memes = candidats.filter((c) => c.data.archived !== true && [c.data.portable, c.data.fixe].some((v) => neufChiffres(v) === cle));
  if (!memes.length) return null;
  const n = (nom ?? "").trim().toLowerCase();
  const homonyme = n ? memes.find((c) => String(c.data.nom ?? "").trim().toLowerCase() === n) : undefined;
  const recent = [...memes].sort((x, y) => String(y.data["Modified Date"] ?? "").localeCompare(String(x.data["Modified Date"] ?? "")))[0];
  return (homonyme ?? recent).id;
}

/** La clé d'un compte du site : un UUID, sinon rien. */
function cleCompte(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
}

async function contactParCompte(compte: string): Promise<string | null> {
  const [c] = await lire(`bo_contact?select=id&data->>site_compte=eq.${encodeURIComponent(compte)}&limit=1`);
  return c?.id ?? null;
}

/** Rattache un contact au compte du site, puis dépose ce que le compte doit montrer. */
async function rattacher(contactId: string, compte: string | null) {
  if (!compte) return;
  const [c] = await lire(`bo_contact?select=id,data&id=eq.${encodeURIComponent(contactId)}`);
  if (c && c.data.site_compte !== compte) {
    await rpc("bo_patch_doc", { p_table: "bo_contact", p_id: contactId, p_patch: { site_compte: compte, site_compte_le: new Date().toISOString() } });
  }
  after(async () => { await deposerCompte(contactId).catch(() => undefined); });
}

/** Un suivi « Formulaire » : c'est son texte que la carte du tableau de bord affiche. */
async function suiviFormulaire(id: string, p: { agentId?: string; contactId: string; immeubleId?: string; notes: string }) {
  if (await existe("bo_suivi", id)) return;
  const now = new Date().toISOString();
  await inserer("bo_suivi", id, {
    Type: "Formulaire",
    AGENT: p.agentId,
    CONTACT: p.contactId,
    IMMEUBLEs: p.immeubleId ? [p.immeubleId] : [],
    Canals: ["Formulaire"],
    notes: p.notes,
    Statut: "Traité",
    date_start: now,
    "Created Date": now,
    "Modified Date": now,
  });
  if (p.immeubleId) {
    await rpc("bo_append_ref", { p_table: "bo_immeuble", p_id: p.immeubleId, p_key: "SUIVIs", p_value: id }).catch(() => undefined);
  }
  await rpc("bo_append_ref", { p_table: "bo_contact", p_id: p.contactId, p_key: "SUIVIs", p_value: id }).catch(() => undefined);
}

/* ------------------------------------------------------ Notes du client */

/** « (30/10/26 CLIENT) » : la date de Paris, et CLIENT à la place des initiales (#577). */
function enTeteClient(d = new Date()): string {
  const [jj, mm, aa] = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "2-digit",
  }).format(d).split("/");
  return `(${jj}/${mm}/${aa} CLIENT) `;
}

/**
 * Retour #577 : tout ce que le client écrit — dans le formulaire ou depuis son
 * compte — s'ajoute aux notes de l'immeuble, en bloc daté signé CLIENT. Un
 * réessai du site n'ajoute rien : un texte déjà présent n'est pas recopié.
 */
async function noterClient(immeubleId: string, texte: string | undefined) {
  const t = texte?.trim();
  if (!t) return;
  const [im] = await lire(`bo_immeuble?select=id,data&id=eq.${encodeURIComponent(immeubleId)}`);
  if (!im) return;
  const avant = String(im.data.notes ?? "");
  if (avant.includes(t)) return;
  const notes = `${avant.trimEnd()}${avant.trim() ? "\n\n" : ""}${enTeteClient()}${t}`;
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: { notes, "Modified Date": new Date().toISOString() } });
}

/* -------------------------------------------- Le dossier du vendeur */

/* L'état locatif saisi sur le site, traduit dans les listes du BO
   (lib/referentiels.ts). Une valeur que le site n'envoie pas encore ne casse
   rien : elle part en commentaire du lot, mot pour mot. */
const TYPE_LOT_SITE: Record<string, { Destination: string; Type_lot?: string }> = {
  habitation_t1: { Destination: "Logement", Type_lot: "T1" },
  habitation_t2: { Destination: "Logement", Type_lot: "T2" },
  habitation_t3: { Destination: "Logement", Type_lot: "T3" },
  habitation_t4: { Destination: "Logement", Type_lot: "T4" },
  habitation_t5plus: { Destination: "Logement", Type_lot: "T5" },
  habitation_maison: { Destination: "Logement", Type_lot: "Maison" },
  habitation: { Destination: "Logement" },
  bureau: { Destination: "Bureau", Type_lot: "Bureaux" },
  commerce: { Destination: "Commerce", Type_lot: "Local commercial" },
  local_activite: { Destination: "Logistique", Type_lot: "Local d'activites" },
  parking: { Destination: "Parking", Type_lot: "Parking" },
  cave: { Destination: "Cave", Type_lot: "Cave" },
  autre: { Destination: "Annexe", Type_lot: "Autre" },
};
const ETAT_SITE: Record<string, string> = {
  bon: "Bon etat", moyen: "Etat d'usage", rafraichissement: "Etat d'usage", travaux: "Travaux",
};
const BAIL_SITE: Record<string, string> = {
  nu_89: "Nu", meuble: "Meuble", mobilite: "Meuble", nu_48: "Loi 48", commercial_369: "3/6/9",
  professionnel: "Professionnel", derogatoire: "Précaire", precaire: "Précaire", civil: "Civil", autre: "n.c.",
};
const MOTS_SITE: Record<string, string> = {
  rafraichissement: "à rafraîchir", mobilite: "bail mobilité", derogatoire: "bail dérogatoire",
  conge_en_cours: "congé en cours", procedure: "procédure en cours",
};

/** Un lot du site, en lot du BO. Le commentaire garde ce que la liste du BO ne dit pas. */
function lotDuSite(l: Record<string, unknown>, rang: number) {
  const type = T(l.type, 40) ?? "";
  const t = TYPE_LOT_SITE[type];
  const statut = T(l.statut, 40) ?? "";
  const libre = statut === "libre";
  const bail = T(l.bail, 40) ?? "";
  /* « n.c. » se lit comme un lot libre dans tout le BO : un lot occupé sans
     type de bail prend le bail courant de sa destination. */
  const bailParDefaut = t?.Destination === "Commerce" || t?.Destination === "Bureau" || t?.Destination === "Logistique" ? "3/6/9" : "Nu";
  const Type_bail = libre ? "Vide" : BAIL_SITE[bail] && BAIL_SITE[bail] !== "n.c." ? BAIL_SITE[bail] : bailParDefaut;
  const etat = T(l.etat, 40) ?? "";
  const dpe = T(l.dpe, 4)?.toUpperCase();
  const num = T(String(l.numero ?? ""), 40);
  const numero = num && /^\d+$/.test(num) ? Number(num) : rang;
  const aDire = [
    num && !/^\d+$/.test(num) ? `Lot « ${num} »` : null,
    !t && type ? `Type déclaré : ${type}` : null,
    MOTS_SITE[etat] ?? (!ETAT_SITE[etat] && etat ? `État déclaré : ${etat}` : null),
    !libre && MOTS_SITE[bail] ? MOTS_SITE[bail] : null,
    !libre && !BAIL_SITE[bail] ? (bail ? `Bail déclaré : ${bail}` : "Type de bail non précisé") : null,
    MOTS_SITE[statut] ?? null,
  ].filter(Boolean);
  const surface = N(l.surfaceCarrez);
  const auLot = t?.Destination === "Cave" || t?.Destination === "Parking";
  return {
    numero, ordre: rang,
    Destination: t?.Destination ?? "Annexe",
    Type_lot: t?.Type_lot,
    Etat: ETAT_SITE[etat],
    Type_bail,
    /* MAV, 30/10 : le site n'a qu'une case de loyer. Lot vide : elle va au
       potentiel. Lot loué : elle remplit l'actuel ET le potentiel. */
    loyer: libre ? undefined : N(l.loyerMensuelHC),
    loyer_max: N(l.loyerMensuelHC),
    surface_carrez: auLot ? undefined : surface,
    surface_sol: auLot ? surface : undefined,
    Type_dpe: dpe && /^[A-G]$/.test(dpe) ? dpe : undefined,
    commentaire: aDire.length ? `Déclaré par le vendeur — ${aDire.join(" · ")}` : "Déclaré par le vendeur",
  };
}

/** Le dossier en une phrase, pour le suivi et les notes. */
function resumeDossier(lots: Record<string, unknown>[], taxe?: number, teom?: number): string {
  const libre = (l: Record<string, unknown>) => String(l.statut ?? "") === "libre";
  const loyers = lots.reduce((s, l) => s + (libre(l) ? 0 : N(l.loyerMensuelHC) ?? 0), 0);
  const potentiels = lots.reduce((s, l) => s + (libre(l) ? N(l.loyerMensuelHC) ?? 0 : 0), 0);
  return [
    `État locatif transmis par le vendeur : ${lots.length} lot${lots.length > 1 ? "s" : ""}`
      + (loyers ? `, ${eur(loyers)} HC par mois (${eur(loyers * 12)} par an)` : "")
      + (potentiels ? `, plus ${eur(potentiels)} HC par mois de loyer potentiel sur les lots vides` : ""),
    taxe ? `Taxe foncière : ${eur(taxe)} par an${teom ? `, dont ${eur(teom)} de TEOM récupérée sur les locataires` : ""}` : null,
  ].filter(Boolean).join(". ") + ".";
}

/**
 * `estimation`, état `dossier` (30/10) : l'état locatif lot par lot, la taxe
 * foncière et le commentaire du vendeur, sous la référence de son estimation.
 *
 * Rien de ce qu'un agent a saisi n'est écrasé : si l'immeuble a déjà des lots
 * saisis au BO, ceux du vendeur ne sont pas créés — ils partent dans les notes,
 * en clair, pour que l'agent compare ; une taxe foncière déjà renseignée reste
 * la sienne. Le 200 ne part qu'après relecture des lots en base.
 */
async function recevoirDossier(ref: string, b: Record<string, unknown>) {
  const immeubleId = `app_site_${ref}`;
  const [im] = await lire(`bo_immeuble?select=id,data&id=eq.${immeubleId}`);
  if (!im) {
    /* Supprimé par l'agent : rien à quoi rattacher le dossier, et le réessayer
       ne le ferait pas revenir. */
    if (await existe("bo_immeuble", immeubleId)) return { deja: true, id: immeubleId };
    throw new LeadPasPret("Le formulaire de cette estimation n'est pas encore arrivé.");
  }
  if (im.data.site_dossier_ref === ref) return { deja: true, id: immeubleId };

  const lotsSite = Array.isArray(b.lots) ? (b.lots as Record<string, unknown>[]).filter((l) => l && typeof l === "object").slice(0, 200) : [];
  const taxe = N(b.taxeFonciere);
  const teom = N(b.teom);
  const commentaire = T(b.commentaire, 5000);

  const existants = await lire(`bo_lot?select=id,data&data->>IMMEUBLE=eq.${encodeURIComponent(immeubleId)}&limit=500`);
  const saisisParAgent = existants.filter((l) => l.data.site_dossier !== ref);
  const now = new Date().toISOString();
  let lotsCrees = 0;
  if (lotsSite.length && saisisParAgent.length === 0) {
    /* Un réessai interrompu a pu laisser une partie des lots : on ne crée que
       ceux qui manquent (un identifiant passé par la corbeille ne se recrée pas). */
    const deja = new Set(existants.map((l) => l.id));
    for (const [i, l] of lotsSite.entries()) {
      const id = `app_site_${ref}_l${i + 1}`;
      if (deja.has(id)) continue;
      await rpc("bo_insert_doc", {
        p_table: "bo_lot", p_id: id,
        p_doc: sansVides({ IMMEUBLE: immeubleId, ...lotDuSite(l, i + 1), site_dossier: ref, "Created Date": now, "Modified Date": now }),
      });
    }
    const relus = await lire(`bo_lot?select=id&data->>IMMEUBLE=eq.${encodeURIComponent(immeubleId)}&data->>site_dossier=eq.${ref}&limit=500`);
    if (relus.length !== lotsSite.length) throw new Error(`Lots du dossier : ${relus.length} en base sur ${lotsSite.length} envoyés.`);
    lotsCrees = relus.length;
  }

  /* La taxe foncière, au bon endroit : une charge « Taxe Foncière » de
     l'immeuble, la TEOM en part récupérable. Jamais par-dessus celle de l'agent. */
  if (taxe) {
    const charges = await lire(`bo_charge?select=id,data&data->>IMMEUBLE=eq.${encodeURIComponent(immeubleId)}&data->>Type_charge=eq.${encodeURIComponent("Taxe Foncière")}&limit=1`);
    if (charges.length === 0) {
      await inserer("bo_charge", `app_site_${ref}_tf`, {
        IMMEUBLE: immeubleId, Type_charge: "Taxe Foncière",
        total_an: taxe, recup_an: teom, non_recup_an: Math.max(0, taxe - (teom ?? 0)),
        commentaire: "Déclarée par le vendeur sur le site", "Created Date": now, "Modified Date": now,
      });
    }
  }
  await rpc("bo_recompute_immeuble", { p_id: immeubleId });

  /* Les notes : le commentaire du vendeur, et — si ses lots n'ont pas été
     créés parce que l'agent en avait saisi — son état locatif en clair. */
  const resume = resumeDossier(lotsSite, taxe, teom);
  const detail = lotsSite.length && !lotsCrees
    ? "\nLots déclarés (non créés : l'état locatif du BO a déjà des lots saisis par un agent) :\n"
      + lotsSite.map((l, i) => {
        const x = lotDuSite(l, i + 1);
        return `- Lot ${x.numero} : ${[x.Type_lot ?? x.Destination, x.surface_carrez ?? x.surface_sol ? `${x.surface_carrez ?? x.surface_sol} m²` : null, x.Type_bail === "Vide" ? `libre${x.loyer_max ? `, loyer potentiel ${eur(x.loyer_max)}/mois HC` : ""}` : `${x.Type_bail}${x.loyer ? `, ${eur(x.loyer)}/mois HC` : ""}`, x.Type_dpe ? `DPE ${x.Type_dpe}` : null].filter(Boolean).join(", ")}`;
      }).join("\n")
    : "";
  await noterClient(immeubleId, [commentaire, `${resume}${detail}`].filter(Boolean).join("\n\n"));
  const [s1] = await lire(`bo_suivi?select=id,data&id=eq.app_site_${ref}_s1`);
  if (s1 && !String(s1.data.notes ?? "").includes(resume)) {
    await rpc("bo_patch_doc", { p_table: "bo_suivi", p_id: s1.id, p_patch: { notes: `${String(s1.data.notes ?? "")}\n\n${resume}`.trim(), "Modified Date": now } });
  }
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: { site_dossier_ref: ref, site_dossier_le: now, "Modified Date": now } });
  const contactId = T(im.data.PROPRIETAIRE);
  if (contactId) await rattacher(contactId, cleCompte(b.compte));
  return { deja: false, id: immeubleId };
}

/* ------------------------------------------------- Vendre / Estimer */

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const LOTS: [string, string, string][] = [
  ["lotsHabitation", "logement", "logements"],
  ["lotsCommerces", "commerce", "commerces"],
  ["lotsBureaux", "bureau", "bureaux"],
  ["lotsActivite", "local d'activité", "locaux d'activité"],
];

/** Le texte de la carte, à la façon des anciens formulaires. */
function texteEstimation(b: Record<string, unknown>, complement: boolean): string {
  const lignes: string[] = [];
  const message = T(b.message, 5000);
  lignes.push(complement ? `Complément du formulaire${message ? ` : ${message}` : ""}` : message ?? "Formulaire sans message.");
  for (const [cle, un, plusieurs] of LOTS) {
    const n = N(b[cle]);
    if (n) lignes.push(`- ${n} ${n > 1 ? plusieurs : un}`);
  }
  const surface = N(b.surface);
  const loyer = N(b.loyerAnnuel);
  const valeur = N(b.valeurEstimee);
  const details = [
    surface ? `Surface : ${surface.toLocaleString("fr-FR")} m²` : null,
    loyer ? `Loyers annuels : ${eur(loyer)}` : null,
    T(b.occupation) ? `Occupation : ${T(b.occupation)}` : null,
    T(b.travaux) ? `Travaux à prévoir : ${T(b.travaux)}` : null,
    T(b.echeance) ? `Échéance de vente : ${T(b.echeance)}` : null,
    valeur ? `Valeur estimée par le propriétaire : ${eur(valeur)}` : null,
  ].filter(Boolean);
  if (details.length) lignes.push("", ...(details as string[]));
  return lignes.join("\n");
}

/** Géocodage de l'adresse saisie, par la Base adresse nationale. */
async function geocoder(q: string) {
  for (const url of [
    `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=1&index=address`,
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`,
  ]) {
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) continue;
    const d = (await r.json().catch(() => null)) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }[];
    } | null;
    const f = d?.features?.[0];
    if (f?.properties && f.geometry?.coordinates && Number(f.properties.score ?? 1) >= 0.5) {
      return {
        numero: T(f.properties.housenumber),
        rue: T(f.properties.street) ?? T(f.properties.name),
        cp: T(f.properties.postcode),
        ville: T(f.properties.city),
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        label: T(f.properties.label) ?? q,
      };
    }
  }
  return null;
}

async function recevoirEstimation(ref: string, b: Record<string, unknown>) {
  /* Trois envois sous la même référence : le formulaire, son complément, et
     l'état locatif du vendeur. Un état inconnu n'est pas « déjà reçu » : c'est
     un envoi que le BO ne sait pas encore lire, donc un 503 (règle du 30/10). */
  const etat = b.etat === undefined || b.etat === null || b.etat === "" ? "principal" : String(b.etat);
  if (etat === "dossier") return recevoirDossier(ref, b);
  if (etat !== "principal" && etat !== "complement") throw new LeadPasPret(`État d'estimation inconnu : ${etat.slice(0, 40)}`);
  const complement = etat === "complement";
  const formulaire = b.formulaire === "estimer" ? "estimer" : "vendre";
  const source = formulaire === "estimer" ? "Site - Formulaire estimer" : "Site - Formulaire Vendre";
  const immeubleId = `app_site_${ref}`;
  const agentId = await agentParDefaut();
  const dejaLa = await existe("bo_immeuble", immeubleId);

  // Le complément d'un formulaire déjà reçu : on complète la même fiche.
  if (complement && dejaLa) {
    const [im] = await lire(`bo_immeuble?select=id,data&id=eq.${immeubleId}`);
    if (!im) return { deja: true, id: immeubleId }; // supprimé par l'agent entre-temps
    if (im.data.site_lead_complement_le || (await existe("bo_suivi", `app_site_${ref}_s2`))) return { deja: true, id: immeubleId };
    const lots = ["lotsHabitation", "lotsCommerces", "lotsBureaux", "lotsActivite"].map((k) => N(b[k]) ?? 0);
    // Le complément ne redit pas ce que le principal a déjà dit.
    const avant = String(im?.data.form ?? "");
    const ajout = texteEstimation(b, true).split("\n")
      .filter((l, i) => i === 0 || !l.trim() || !avant.includes(l))
      .join("\n").replace(/\n{3,}/g, "\n\n").trim();
    await rpc("bo_patch_doc", {
      p_table: "bo_immeuble",
      p_id: immeubleId,
      p_patch: sansVides({
        surface_carrez: N(b.surface),
        fin_loyers_an: N(b.loyerAnnuel),
        lots_tot: lots.some((n) => n > 0) ? lots.reduce((s, n) => s + n, 0) : undefined,
        "occupé": T(b.occupation) ? T(b.occupation) !== "Libre" : undefined,
        form: `${avant}\n\n${ajout}`.trim(),
        site_lead_complement_le: new Date().toISOString(),
        "Modified Date": new Date().toISOString(),
      }),
    });
    await noterClient(immeubleId, ajout);
    /* Le complément rejoint le suivi du formulaire au lieu d'en ouvrir un
       second : la carte du tableau de bord affiche le DERNIER suivi, et elle
       doit continuer de montrer le message du propriétaire. */
    const [s1] = await lire(`bo_suivi?select=id,data&id=eq.app_site_${ref}_s1`);
    if (s1) {
      await rpc("bo_patch_doc", {
        p_table: "bo_suivi", p_id: s1.id,
        p_patch: { notes: `${String(s1.data.notes ?? "")}\n\n${ajout}`.trim(), "Modified Date": new Date().toISOString() },
      });
    } else {
      await suiviFormulaire(`app_site_${ref}_s2`, {
        agentId: T(im.data.AGENT) ?? agentId, contactId: T(im.data.PROPRIETAIRE) ?? "", immeubleId, notes: ajout,
      });
    }
    return { deja: false, id: immeubleId };
  }
  if (dejaLa) {
    /* Le principal après son complément (la file du site a pu les inverser) :
       la fiche existe, il lui manque le texte et le suivi du principal. */
    const suivi = `app_site_${ref}_s1`;
    if (await existe("bo_suivi", suivi)) return { deja: true, id: immeubleId };
    const [im] = await lire(`bo_immeuble?select=id,data&id=eq.${immeubleId}`);
    if (!im) return { deja: true, id: immeubleId };
    const texte = texteEstimation(b, false);
    await rpc("bo_patch_doc", {
      p_table: "bo_immeuble",
      p_id: immeubleId,
      p_patch: { form: `${texte}\n\n${String(im?.data.form ?? "")}`.trim(), "Modified Date": new Date().toISOString() },
    });
    await suiviFormulaire(suivi, {
      agentId: T(im?.data.AGENT) ?? agentId, contactId: T(im?.data.PROPRIETAIRE) ?? "", immeubleId, notes: texte,
    });
    await noterClient(immeubleId, texte);
    return { deja: false, id: immeubleId };
  }

  // Le formulaire principal (ou un complément arrivé avant lui : il fait foi).
  const ville = T(b.ville, 120);
  const cp = T(b.codePostal, 10);
  const rue = T(b.rue, 200);
  if (!ville && !cp) throw new LeadInvalide("Ni ville ni code postal : impossible de situer l'immeuble.");
  const compte = cleCompte(b.compte);
  const { id: contactId } = await contactDuLead(ref, {
    prenom: T(b.prenom, 80), nom: T(b.nom, 80), email: T(b.email, 200), telephone: T(b.telephone, 40),
    source, agentId, noteD: false, vendeur: true, compte,
  });
  const lots = ["lotsHabitation", "lotsCommerces", "lotsBureaux", "lotsActivite"].map((k) => N(b[k]) ?? 0);
  const texte = texteEstimation(b, complement);
  const now = new Date().toISOString();
  await inserer("bo_immeuble", immeubleId, {
    Statut: "1 - FORMULAIRE",
    archived: false,
    standby: false,
    standby_Statut: "Traité",
    vendu: false,
    AGENT: agentId,
    PROPRIETAIRE: contactId,
    source,
    form: texte,
    notes: `${enTeteClient()}${texte}`,
    adresse_numero_rue: T(b.numero, 20),
    adresse_rue: rue,
    adresse_zipcode: cp,
    adresse_ville: ville,
    adresse_dpt: cp ? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2)) : undefined,
    surface_carrez: N(b.surface),
    fin_loyers_an: N(b.loyerAnnuel),
    lots_tot: lots.some((n) => n > 0) ? lots.reduce((s, n) => s + n, 0) : undefined,
    "occupé": T(b.occupation) ? T(b.occupation) !== "Libre" : undefined,
    date_contact_form: now,
    site_lead_ref: ref,
    "Created Date": now,
    "Modified Date": now,
  });
  await rpc("bo_append_ref", { p_table: "bo_contact", p_id: contactId, p_key: "IMMEUBLES", p_value: immeubleId }).catch(() => undefined);
  await suiviFormulaire(`app_site_${ref}_s${complement ? 2 : 1}`, { agentId, contactId, immeubleId, notes: texte });
  // Depuis le compte : l'immeuble apparaît aussitôt, « en cours d'estimation » (§9.3).
  await rattacher(contactId, compte);

  /* L'adresse géocodée et la façade : après la réponse, pour que le site ait
     son 200 sans attendre le réseau. Un échec ici ne défait rien. */
  after(async () => {
    const q = [T(b.numero), rue, cp, ville].filter(Boolean).join(" ");
    const g = q ? await geocoder(q).catch(() => null) : null;
    if (g) {
      await saveAdresse(immeubleId, {
        numero: g.numero ?? T(b.numero), rue: g.rue ?? rue, cp: g.cp ?? cp, ville: g.ville ?? ville,
        lat: g.lat, lon: g.lon, label: g.label,
      }).catch(() => undefined);
      await capturerFacadeRue(immeubleId).catch(() => undefined);
    }
  });
  return { deja: false, id: immeubleId };
}

/* ------------------------------------------------------------ Recherche */

const DESTINATIONS = new Set(["Logement", "Commerce", "Bureau", "Logistique", "Hôtel", "Parking"]);

async function recevoirRecherche(ref: string, b: Record<string, unknown>) {
  const recherches = Array.isArray(b.recherches) ? (b.recherches as Record<string, unknown>[]).slice(0, 10) : [];
  if (!T(b.email) && !T(b.telephone)) throw new LeadInvalide("Ni e-mail ni téléphone.");
  const agentId = await agentParDefaut();
  const source = "Site - Formulaire recherche";
  const compte = cleCompte(b.compte);
  const contact = await contactDuLead(ref, {
    prenom: T(b.prenom, 80), nom: T(b.nom, 80), email: T(b.email, 200), telephone: T(b.telephone, 40),
    source, agentId, noteD: true, acheteur: true, compte,
  });
  let creees = 0;
  for (const [i, r] of recherches.entries()) {
    const id = `app_site_${ref}_r${i + 1}`;
    if (await existe("bo_recherche", id)) continue;
    const cible = T(r.cible);
    await enregistrerRecherche({
      contactId: contact.id,
      cible: cible && CIBLES.includes(cible) ? cible : undefined,
      destinations: L(r.destinations).filter((d) => DESTINATIONS.has(d)),
      villes: L(r.villes),
      departements: L(r.departements).map((d) => d.toUpperCase()).filter((d) => /^(\d{2}|2A|2B|97\d)$/.test(d)),
      prixMin: N(r.prixMin),
      prixMax: N(r.prixMax),
      renta: N(r.rendementMin),
      commentaire: T(r.commentaire, 2000),
      exclusions: { destinations: [], villes: [], departements: [], regions: [] },
    }, agentId, { id, source });
    creees++;
  }
  const resume = recherches.map((r, i) => {
    const prix = [N(r.prixMin), N(r.prixMax)].map((x) => (x ? eur(x) : "…")).join(" à ");
    return `Recherche ${i + 1} : ${T(r.cible) ?? "cible non précisée"}, ${L(r.departements).join(", ") || "tous départements"}, ${prix}`;
  });
  await suiviFormulaire(`app_site_${ref}_s1`, {
    agentId, contactId: contact.id,
    notes: [`Formulaire de recherche du site${contact.nouveau ? "" : " (contact déjà connu)"}.`, ...resume].join("\n"),
  });
  await rattacher(contact.id, compte);
  return { deja: creees === 0 && recherches.length > 0, id: contact.id };
}

/* ------------------------------------------- Contact depuis une fiche */

const arrondi = (n: number) => Math.round(n / 10_000) * 10_000;

/**
 * La recherche de quelqu'un qui demande un dossier (MAV, 21/10 : « il faut
 * aussi créer la recherche »). Ses critères se déduisent du bien demandé : le
 * département, une fourchette de prix autour de celui du bien, les
 * destinations de ses lots. La cible reste vide : l'agent la précise à
 * l'appel. Un contact connu qui cherche déjà dans ce département garde sa
 * recherche, on ne lui en ajoute pas une seconde.
 */
async function rechercheDeLaDemande(
  ref: string, contact: { id: string; nouveau: boolean },
  im: { id: string; data: Record<string, unknown> }, titre: string | undefined, agentId?: string,
): Promise<string | undefined> {
  const cp = T(im.data.adresse_zipcode) ?? "";
  const dept = T(im.data.adresse_dpt) ?? (cp.startsWith("97") ? cp.slice(0, 3) : cp.slice(0, 2));
  if (!contact.nouveau && dept) {
    const siennes = await lire(`bo_recherche?select=id,data&data->>ACHETEUR=eq.${encodeURIComponent(contact.id)}&limit=50`).catch(() => []);
    const deja = siennes.find((r) => r.data.archived !== true && Array.isArray(r.data.dpts) && (r.data.dpts as unknown[]).includes(dept));
    if (deja) return deja.id;
  }
  const id = `app_site_${ref}_r1`;
  if (await existe("bo_recherche", id)) return id;
  const lots = await lire(`bo_lot?select=data&data->>IMMEUBLE=eq.${encodeURIComponent(im.id)}&limit=300`).catch(() => []);
  const destinations = [...new Set(lots.map((l) => String(l.data.Destination ?? "")).filter((d) => DESTINATIONS.has(d)))];
  const prix = N(im.data.prix_hai);
  await enregistrerRecherche({
    contactId: contact.id,
    destinations,
    villes: [],
    departements: dept ? [dept] : [],
    prixMin: prix ? arrondi(prix * 0.7) : undefined,
    prixMax: prix ? arrondi(prix * 1.3) : undefined,
    commentaire: `Créée depuis une demande de dossier sur le site${titre ? ` (${titre})` : ""}. Critères déduits du bien, à confirmer à l'appel.`,
    exclusions: { destinations: [], villes: [], departements: [], regions: [] },
  }, agentId, { id, source: "Site - Fiche à vendre" });
  return id;
}

async function recevoirContact(ref: string, b: Record<string, unknown>) {
  const questionId = `app_site_${ref}`;
  if (await existe("bo_question", questionId)) return { deja: true, id: questionId };
  if (!T(b.email) && !T(b.telephone)) throw new LeadInvalide("Ni e-mail ni téléphone.");
  const bienId = T(b.bien, 80);
  const [im] = bienId ? await lire(`bo_immeuble?select=id,data&id=eq.${encodeURIComponent(bienId)}`) : [];
  /* Retour #513 : la demande n'est attribuée à personne. Le contact (et sa
     recherche) va à l'agent qui la traite réellement — au premier appel, envoi
     de dossier, refus ou clôture (voir `attribuerAuTraitant`). */
  const source = "Site - Fiche à vendre";
  const compte = cleCompte(b.compte);
  const contact = await contactDuLead(ref, {
    prenom: T(b.prenom, 80), nom: T(b.nom, 80), email: T(b.email, 200), telephone: T(b.telephone, 40),
    source, noteD: true, acheteur: true, compte,
  });
  const rechercheId = im ? await rechercheDeLaDemande(ref, contact, im, T(b.bienTitre, 200), undefined) : undefined;
  const now = new Date().toISOString();
  await inserer("bo_question", questionId, {
    source,
    demande_dossier: true,
    ended: false,
    message: T(b.message, 5000) ?? (T(b.bienTitre) ? `Demande de dossier : ${T(b.bienTitre)}` : "Demande de dossier"),
    email: T(b.email, 200)?.toLowerCase(),
    "téléphone": T(b.telephone, 40),
    Projet: T(b.projet, 200),
    IMMEUBLE: im ? im.id : undefined,
    bien_titre: T(b.bienTitre, 200),
    CONTACT: contact.id,
    RECHERCHE: rechercheId,
    searchfield: [T(b.prenom), T(b.nom), T(b.email), T(b.bienTitre)].filter(Boolean).join(" ").toLowerCase(),
    "Created Date": now,
    "Modified Date": now,
  });
  await rattacher(contact.id, compte);
  return { deja: false, id: questionId };
}

/* ------------------------------------------------- Le compte (§9.4) */

/** Le contact rattaché au compte ; tant que le site n'a pas envoyé `compte`, on réessaiera. */
async function contactDuCompte(b: Record<string, unknown>): Promise<{ compte: string; contactId: string }> {
  const compte = cleCompte(b.compte);
  if (!compte) throw new LeadInvalide("Clé de compte absente ou qui n'est pas un UUID.");
  const contactId = await contactParCompte(compte);
  // Erreur passagère (500) : le rattachement `compte` est peut-être encore dans la file du site.
  if (!contactId) throw new LeadPasPret("Compte pas encore rattaché à un contact.");
  return { compte, contactId };
}

/** `compte` : le site a vérifié l'adresse, le BO rattache la personne et dépose. */
async function recevoirCompte(ref: string, b: Record<string, unknown>) {
  const compte = cleCompte(b.compte);
  if (!compte) throw new LeadInvalide("Clé de compte absente ou qui n'est pas un UUID.");
  if (!T(b.email)) throw new LeadInvalide("Le rattachement exige l'adresse e-mail vérifiée.");
  const agentId = await agentParDefaut();
  const contact = await contactDuLead(ref, {
    prenom: T(b.prenom, 80), nom: T(b.nom, 80), email: T(b.email, 200), telephone: T(b.telephone, 40),
    source: "Site - Compte client", agentId, noteD: true, compte,
  });
  const deja = (await contactParCompte(compte)) === contact.id;
  await rattacher(contact.id, compte);
  return { deja, id: contact.id };
}

/** `recherche_compte` : le client crée, modifie ou supprime une recherche depuis son compte. */
async function recevoirRechercheCompte(ref: string, b: Record<string, unknown>) {
  const { contactId } = await contactDuCompte(b);
  const cle = cleCompte(b.cle);
  if (!cle) throw new LeadInvalide("Clé de recherche absente ou qui n'est pas un UUID.");
  const suivi = `app_site_${ref}_s1`;
  if (await existe("bo_suivi", suivi)) return { deja: true, id: contactId };
  const [deja] = await lire(`bo_recherche?select=id,data&data->>site_cle=eq.${cle}&data->>ACHETEUR=eq.${encodeURIComponent(contactId)}&limit=1`);
  let notes: string;
  if (b.action === "supprimer") {
    if (deja) {
      await rpc("bo_patch_doc", {
        p_table: "bo_recherche", p_id: deja.id,
        p_patch: { archived: true, motif_archivage: "Supprimée par le client depuis son compte", date_modif: new Date().toISOString() },
      });
    }
    notes = "Recherche supprimée par le client depuis son compte.";
  } else {
    const cible = T(b.cible);
    const saisie = {
      contactId,
      cible: cible && CIBLES.includes(cible) ? cible : undefined,
      destinations: L(b.destinations).filter((d) => DESTINATIONS.has(d)),
      villes: L(b.villes),
      departements: L(b.departements).map((d) => d.toUpperCase()).filter((d) => /^(\d{2}|2A|2B|97\d)$/.test(d)),
      prixMin: N(b.prixMin), prixMax: N(b.prixMax), renta: N(b.rendementMin),
      commentaire: T(b.commentaire, 2000),
      exclusions: { destinations: [], villes: [], departements: [], regions: [] },
    };
    const agentId = await agentParDefaut();
    if (deja) {
      await enregistrerRecherche({ ...saisie, id: deja.id }, agentId);
    } else {
      const id = await enregistrerRecherche(saisie, agentId, { id: `app_site_${cle.replace(/-/g, "")}_r`, source: "Site - Compte client" });
      await rpc("bo_patch_doc", { p_table: "bo_recherche", p_id: id, p_patch: { site_cle: cle } });
    }
    const prix = [N(b.prixMin), N(b.prixMax)].map((x) => (x ? eur(x) : "…")).join(" à ");
    notes = `Recherche ${deja ? "modifiée" : "créée"} par le client depuis son compte : ${cible ?? "cible non précisée"}, ${L(b.departements).join(", ") || "tous départements"}, ${prix}.`;
  }
  await suiviFormulaire(suivi, { agentId: await agentParDefaut(), contactId, notes });
  after(async () => { await deposerCompte(contactId).catch(() => undefined); });
  return { deja: false, id: contactId };
}

const REPONSES: Record<string, { statut: string; libelle: string }> = {
  interesse: { statut: "Intéressé", libelle: "Intéressé" },
  visite: { statut: "Intéressé", libelle: "Demande une visite" },
  pas_pour_moi: { statut: "Refusée (sans offre)", libelle: "Pas pour moi" },
};

/** Une question à l'agent du bien : demande de visite, intérêt, prix du propriétaire. */
async function questionCompte(id: string, p: {
  nature: "visite" | "interet" | "prix" | "message" | "appel" | "offre"; contactId: string; immeubleId: string; message: string; source: string;
}) {
  if (await existe("bo_question", id)) return;
  const [c] = await lire(`bo_contact?select=id,data&id=eq.${encodeURIComponent(p.contactId)}`);
  // Retour #513 : pas d'attribution d'office ; c'est celui qui traite qui la prend.
  const now = new Date().toISOString();
  await inserer("bo_question", id, {
    source: p.source,
    nature: p.nature,
    ended: false,
    message: p.message,
    email: T(c?.data.email),
    "téléphone": T(c?.data.portable) ?? T(c?.data.fixe),
    IMMEUBLE: p.immeubleId || undefined,
    CONTACT: p.contactId,
    "Created Date": now,
    "Modified Date": now,
  });
}

/** `reponse` : intéressé, demande de visite ou pas pour moi, sur une proposition du compte. */
async function recevoirReponse(ref: string, b: Record<string, unknown>) {
  const { contactId } = await contactDuCompte(b);
  const cle = cleCompte(b.proposition);
  const r = REPONSES[String(b.reponse ?? "")];
  if (!cle || !r) throw new LeadInvalide("Proposition ou réponse illisible.");
  const [p] = await lire(`bo_proposition?select=id,data&data->>site_cle=eq.${cle}&data->>ACHETEUR=eq.${encodeURIComponent(contactId)}&limit=1`);
  if (!p) throw new LeadInvalide("Proposition inconnue pour ce compte.");
  if (p.data.site_reponse_ref === ref) return { deja: true, id: p.id };
  const statut = String(p.data.Statut ?? "");
  /* La réponse du client ne fait jamais reculer un dossier : une visite faite,
     une offre ou une vente gardent leur statut. */
  const avance = /^(Visite|Offre|Vendu)/.test(statut);
  const now = new Date().toISOString();
  await rpc("bo_patch_doc", {
    p_table: "bo_proposition", p_id: p.id,
    p_patch: {
      ...(avance ? {} : { Statut: r.statut }),
      ...(b.reponse === "pas_pour_moi" && !avance ? { motif_refus: "Pas pour moi (réponse depuis son compte)", date_fin: now, stop_relances_yn: true } : {}),
      site_reponse: String(b.reponse), site_repondu_le: now, site_reponse_ref: ref, date_modif: now,
    },
  });
  const immeubleId = T(p.data.IMMEUBLE) ?? "";
  const message = `${r.libelle}${T(b.message, 2000) ? ` : ${T(b.message, 2000)}` : ""}`;
  if (b.reponse === "pas_pour_moi") {
    await suiviFormulaire(`app_site_${ref}_s1`, { agentId: await agentParDefaut(), contactId, immeubleId, notes: `Réponse depuis son compte : ${message}` });
  } else {
    await questionCompte(`app_site_${ref}`, {
      nature: b.reponse === "visite" ? "visite" : "interet", contactId, immeubleId, message, source: "Site - Compte client",
    });
  }
  after(async () => { await deposerCompte(contactId).catch(() => undefined); });
  return { deja: false, id: p.id };
}

/** `prix_proprietaire` : le propriétaire propose son prix depuis son compte. */
async function recevoirPrixProprietaire(ref: string, b: Record<string, unknown>) {
  const { contactId } = await contactDuCompte(b);
  const cle = cleCompte(b.bien);
  const prix = N(b.prix);
  if (!cle || !prix) throw new LeadInvalide("Bien ou prix illisible.");
  const im = await immeubleDuCompte(contactId, cle);
  const id = `app_site_${ref}`;
  if (await existe("bo_question", id)) return { deja: true, id };
  const message = `Prix souhaité par le propriétaire : ${eur(prix)}${T(b.message, 2000) ? `\n${T(b.message, 2000)}` : ""}`;
  await questionCompte(id, { nature: "prix", contactId, immeubleId: im.id, source: "Site - Compte client", message });
  await noterClient(im.id, message);
  return { deja: false, id };
}

/**
 * L'immeuble désigné par sa clé neutre, À CONDITION qu'il appartienne au
 * contact du compte. C'est le BO qui tranche, sur ses propres fiches : le
 * site ne peut pas viser l'immeuble d'un autre en changeant une clé.
 */
async function immeubleDuCompte(contactId: string, cle: string) {
  const [im] = await lire(`bo_immeuble?select=id,data&data->>site_cle=eq.${cle}&limit=1`);
  const proprietaires = [T(im?.data.PROPRIETAIRE), ...(Array.isArray(im?.data.PROPRIETAIREs) ? (im!.data.PROPRIETAIREs as unknown[]).map((x) => T(x)) : [])];
  if (!im || !proprietaires.includes(contactId)) throw new LeadInvalide("Ce bien n'appartient pas à ce compte.");
  return im;
}

/* Les pièces qu'on demande au propriétaire (contrat §10.2), et leur libellé
   au coffre de l'immeuble. */
const CATEGORIES_PIECE: Record<string, string> = {
  titre: "Titre de propriété", baux: "Bail", diagnostics: "Diagnostic",
  taxe: "Taxe foncière", charges: "Charges / travaux", autre: "Pièce du propriétaire",
  /* Point 3 du 30/10 : plans et photos, déposés avec le dossier vendeur. */
  plans: "Plan", photos: "Photo",
};
/** Les formats acceptés, et le type qu'on leur donne au coffre. */
const FORMATS: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
};
/** 25 Mo : la limite du coffre. */
const TAILLE_MAX = 25 * 1024 * 1024;
const nomSur = (name: string) =>
  name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "_").slice(0, 120);

/**
 * `document` (lot 5) : une pièce déposée par le propriétaire depuis son compte.
 *
 * Le site la pose dans son seau privé ; le BO la rapatrie au coffre de
 * l'immeuble, puis l'efface du site — le site n'en garde pas de copie, une
 * fuite de sa base ou de son stockage n'expose donc aucun titre ni aucun bail.
 * Le chemin vient du site mais ne peut viser que le dossier de CE compte.
 */
async function recevoirDocument(ref: string, b: Record<string, unknown>) {
  /* Deux portes. Avec `bien` : une pièce sur un immeuble du compte (lot 5).
     Avec `estimation` (point 3 du 30/10) : une pièce du dossier vendeur,
     rattachée à l'immeuble né de cette estimation, avant même qu'il paraisse
     dans le compte — le vendeur n'est alors pas forcément connecté. */
  const refEstimation = reference(b.estimation);
  let compte: string | null;
  let contactId: string;
  let im: { id: string; data: Record<string, unknown> };
  let prefixe: string;
  if (refEstimation) {
    const [trouve] = await lire(`bo_immeuble?select=id,data&id=eq.app_site_${refEstimation}`);
    if (!trouve) {
      if (await existe("bo_immeuble", `app_site_${refEstimation}`)) throw new LeadInvalide("L'immeuble de cette estimation a été supprimé dans le BO.");
      throw new LeadPasPret("L'estimation de ce dossier n'est pas encore arrivée.");
    }
    im = trouve;
    compte = cleCompte(b.compte);
    contactId = T(im.data.PROPRIETAIRE) ?? "";
    /* Le chemin ne peut viser que le dossier de CETTE estimation (ou du compte). */
    prefixe = compte ?? String(b.estimation).trim().toLowerCase();
  } else {
    const c = await contactDuCompte(b);
    compte = c.compte;
    contactId = c.contactId;
    const cle = cleCompte(b.bien);
    if (!cle) throw new LeadInvalide("Bien (ou estimation) absent ou illisible.");
    im = await immeubleDuCompte(contactId, cle);
    prefixe = compte;
  }
  const categorie = T(b.categorie, 40) ?? "autre";
  if (!(categorie in CATEGORIES_PIECE)) throw new LeadInvalide("Catégorie de pièce inconnue.");
  const chemin = T(b.chemin, 400);
  if (!chemin || !chemin.startsWith(`${prefixe}/`) || chemin.includes("..") || chemin.includes("//")) {
    throw new LeadInvalide("Chemin de pièce invalide : il doit commencer par la clé du compte, ou par la référence de l'estimation.");
  }
  const nom = T(b.nom, 160) ?? chemin.split("/").pop()!;
  const ext = nom.split(".").pop()?.toLowerCase() ?? "";
  if (!FORMATS[ext]) throw new LeadInvalide(`Format refusé (.${ext}) : PDF, image, Word, Excel ou OpenDocument.`);

  /* MAV, 30/10 : les photos du dossier vendeur vont directement dans l'onglet
     Photos (un PDF étiqueté « photos » reste une pièce du coffre). */
  if (categorie === "photos" && FORMATS[ext].startsWith("image/")) {
    return recevoirPhoto(ref, chemin, nom, im.id, contactId, compte, !!refEstimation);
  }

  const id = `app_site_${ref}_d`;
  if (await existe("bo_app_document", id)) {
    // Déjà rangée : on retente seulement l'effacement côté site.
    await effacerPieceDuSite(chemin);
    return { deja: true, id };
  }
  const piece = await lirePieceDuSite(chemin);
  // Passager (500) : le site réessaiera.
  if (!piece) throw new Error("Pièce introuvable dans le seau du site, ou site injoignable.");
  if (piece.taille === 0 || piece.taille > TAILLE_MAX) throw new LeadInvalide("Fichier vide ou de plus de 25 Mo.");

  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente.");
  const path = `documents/${im.id}/${randomUUID()}-${nomSur(nom)}`;
  const up = await fetch(`${BO_URL}/storage/v1/object/bo-files/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${BO_KEY}`, "Content-Type": FORMATS[ext], "x-upsert": "true" },
    body: new Uint8Array(piece.octets),
    cache: "no-store",
  });
  if (!up.ok) throw new Error(`Coffre ${up.status} : ${(await up.text()).slice(0, 200)}`);

  const now = new Date().toISOString();
  await inserer("bo_app_document", id, {
    IMMEUBLE: im.id,
    name: `${CATEGORIES_PIECE[categorie]} — ${nom}`,
    file_name: nom, path, format: FORMATS[ext], size_kB: Math.round(piece.taille / 1024),
    source: refEstimation ? "Site - Dossier vendeur" : "Site - Compte client",
    site_compte: compte ?? undefined, site_categorie: categorie, site_cle: randomUUID(),
    "Created Date": now, "Modified Date": now,
  });
  if (contactId) {
    await suiviFormulaire(`app_site_${ref}_s1`, {
      agentId: T(im.data.AGENT) ?? (await agentParDefaut()), contactId, immeubleId: im.id,
      notes: `Pièce déposée par le propriétaire ${refEstimation ? "avec son dossier vendeur" : "depuis son compte sur le site"} : ${CATEGORIES_PIECE[categorie]} — ${nom}. Rangée au coffre de l'immeuble.`,
    });
  }
  await effacerPieceDuSite(chemin);
  if (contactId) after(() => deposerCompte(contactId).then(() => undefined, () => undefined));
  return { deja: false, id };
}

/**
 * Une photo du propriétaire, rangée dans l'onglet Photos comme celles d'un
 * agent : redressée, réduite et convertie en JPEG (HEIC compris). Elle arrive
 * « À classer » et hors du dossier de vente : c'est l'agent qui la regarde,
 * la rattache (façade, communes, lot) et décide de la montrer.
 */
async function recevoirPhoto(
  ref: string, chemin: string, nom: string, immeubleId: string,
  contactId: string, compte: string | null, avecDossier: boolean,
) {
  const id = `app_site_${ref}_p`;
  if (await existe("bo_photo", id)) {
    await effacerPieceDuSite(chemin);
    return { deja: true, id };
  }
  const piece = await lirePieceDuSite(chemin);
  if (!piece) throw new Error("Photo introuvable dans le seau du site, ou site injoignable.");
  if (piece.taille === 0 || piece.taille > TAILLE_MAX) throw new LeadInvalide("Fichier vide ou de plus de 25 Mo.");
  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente.");

  const ext = nom.split(".").pop()?.toLowerCase() ?? "";
  const { versWeb } = await import("@/lib/bo/images");
  let web: Awaited<ReturnType<typeof versWeb>>;
  try {
    web = await versWeb(new File([new Uint8Array(piece.octets)], nom, { type: FORMATS[ext] }));
  } catch (e) {
    throw new LeadInvalide(`Photo illisible : ${e instanceof Error ? e.message : String(e)}`);
  }
  const base = `photos/${immeubleId}/${id}-${nomSur(nom).replace(/\.[^.]+$/, "")}`;
  for (const [suffixe, octets] of [["", web.pleine], ["-min", web.vignette]] as const) {
    const up = await fetch(`${BO_URL}/storage/v1/object/bo-files/${base}${suffixe}.jpg`, {
      method: "POST",
      headers: { Authorization: `Bearer ${BO_KEY}`, "Content-Type": "image/jpeg", "x-upsert": "true" },
      body: new Uint8Array(octets),
      cache: "no-store",
    });
    if (!up.ok) throw new Error(`Photos ${up.status} : ${(await up.text()).slice(0, 200)}`);
  }

  const now = new Date().toISOString();
  await inserer("bo_photo", id, {
    IMMEUBLE: immeubleId,
    image: `storage:${base}.jpg`, compressed: `storage:${base}-min.jpg`,
    format: "image/jpeg", largeur: web.largeur, hauteur: web.hauteur,
    size_kB: Math.round(web.pleine.length / 1024),
    order: 999, show_in_doss: false, show_in_ann: false, show_in_est: false,
    source: avecDossier ? "Site - Dossier vendeur" : "Site - Compte client",
    file_name: nom, site_compte: compte ?? undefined,
    date: now, "Created Date": now, "Modified Date": now,
  });
  if (contactId) {
    const [im] = await lire(`bo_immeuble?select=id,data&id=eq.${encodeURIComponent(immeubleId)}`);
    await suiviFormulaire(`app_site_${ref}_s1`, {
      agentId: T(im?.data.AGENT) ?? (await agentParDefaut()), contactId, immeubleId,
      notes: `Photo déposée par le propriétaire ${avecDossier ? "avec son dossier vendeur" : "depuis son compte sur le site"} : ${nom}. Rangée dans l'onglet Photos, à classer.`,
    });
  }
  await effacerPieceDuSite(chemin);
  if (contactId) after(() => deposerCompte(contactId).then(() => undefined, () => undefined));
  return { deja: false, id };
}

/**
 * Le bien dont parle le client, s'il en désigne un : un immeuble de son compte
 * (`bien`, propriétaire) ou un bien qu'on lui a proposé (`proposition`,
 * acquéreur) — jamais un autre : c'est le BO qui vérifie, sur ses fiches.
 */
async function bienVise(contactId: string, b: Record<string, unknown>) {
  const cleBien = cleCompte(b.bien);
  const cleProposition = cleCompte(b.proposition);
  let immeubleId: string | undefined;
  let propositionId: string | undefined;
  if (cleBien) immeubleId = (await immeubleDuCompte(contactId, cleBien)).id;
  else if (cleProposition) {
    const [p] = await lire(`bo_proposition?select=id,data&data->>site_cle=eq.${cleProposition}&data->>ACHETEUR=eq.${encodeURIComponent(contactId)}&limit=1`);
    if (!p) throw new LeadInvalide("Proposition inconnue pour ce compte.");
    immeubleId = T(p.data.IMMEUBLE);
    propositionId = p.id;
  }
  const [im] = immeubleId ? await lire(`bo_immeuble?select=id,data&id=eq.${encodeURIComponent(immeubleId)}`) : [];
  return { immeubleId, propositionId, im, proprietaire: !!cleBien };
}

/**
 * Les pièces jointes d'un envoi : posées par le site dans son seau, sous le
 * dossier du compte. Le BO les rapatrie — au coffre de l'immeuble s'il y en a
 * un, sinon dans le dossier du contact — ; l'appelant les efface du site une
 * fois l'envoi rangé (`effacerPieces`), comme les pièces du §10.
 */
async function rapatrierPieces(
  b: Record<string, unknown>, ref: string, contactId: string, immeubleId: string | undefined, libelle: string,
): Promise<{ nom: string; path: string; format: string }[]> {
  const liste = Array.isArray(b.pieces) ? (b.pieces as unknown[]).slice(0, 5) : [];
  const compte = cleCompte(b.compte);
  const pieces: { nom: string; path: string; format: string }[] = [];
  for (const [i, x] of liste.entries()) {
    const pj = (x ?? {}) as Record<string, unknown>;
    const chemin = T(pj.chemin, 400);
    if (!chemin || !compte || !chemin.startsWith(`${compte}/`) || chemin.includes("..")) throw new LeadInvalide("Chemin de pièce jointe invalide.");
    const nom = T(pj.nom, 160) ?? chemin.split("/").pop()!;
    const ext = nom.split(".").pop()?.toLowerCase() ?? "";
    if (!FORMATS[ext]) throw new LeadInvalide(`Format de pièce jointe refusé (.${ext}).`);
    const piece = await lirePieceDuSite(chemin);
    if (!piece) throw new Error("Pièce jointe introuvable dans le seau du site, ou site injoignable.");
    if (piece.taille === 0 || piece.taille > TAILLE_MAX) throw new LeadInvalide("Pièce jointe vide ou de plus de 25 Mo.");
    if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente.");
    const path = `${immeubleId ? `documents/${immeubleId}` : `messages/${contactId}`}/${ref}-${i}-${nomSur(nom)}`;
    const up = await fetch(`${BO_URL}/storage/v1/object/bo-files/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${BO_KEY}`, "Content-Type": FORMATS[ext], "x-upsert": "true" },
      body: new Uint8Array(piece.octets), cache: "no-store",
    });
    if (!up.ok) throw new Error(`Coffre ${up.status} : ${(await up.text()).slice(0, 200)}`);
    pieces.push({ nom, path, format: FORMATS[ext] });
    const docId = `app_site_${ref}_pj${i}`;
    if (immeubleId && !(await existe("bo_app_document", docId))) {
      const maintenant = new Date().toISOString();
      await inserer("bo_app_document", docId, {
        IMMEUBLE: immeubleId, name: `${libelle} — ${nom}`, file_name: nom, path, format: FORMATS[ext],
        size_kB: Math.round(piece.taille / 1024), source: "Site - Compte client",
        site_compte: compte, site_categorie: "autre", site_cle: randomUUID(),
        "Created Date": maintenant, "Modified Date": maintenant,
      });
    }
  }
  return pieces;
}

async function effacerPieces(b: Record<string, unknown>) {
  const liste = Array.isArray(b.pieces) ? (b.pieces as unknown[]).slice(0, 5) : [];
  for (const pj of liste) await effacerPieceDuSite(String((pj as Record<string, unknown>).chemin));
}

/** Un suivi « Formulaire » ou « Message » venu du compte, rattaché au contact et à l'immeuble. */
async function suiviCompte(id: string, p: {
  type: string; contactId: string; immeubleId?: string; agentId?: string; notes: string; extra?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  await inserer("bo_suivi", id, {
    Type: p.type, AGENT: p.agentId, CONTACT: p.contactId,
    IMMEUBLEs: p.immeubleId ? [p.immeubleId] : [], Canals: ["Site"],
    notes: p.notes, Statut: "Traité", ...p.extra,
    date_start: now, "Created Date": now, "Modified Date": now,
  });
  if (p.immeubleId) await rpc("bo_append_ref", { p_table: "bo_immeuble", p_id: p.immeubleId, p_key: "SUIVIs", p_value: id }).catch(() => undefined);
  await rpc("bo_append_ref", { p_table: "bo_contact", p_id: p.contactId, p_key: "SUIVIs", p_value: id }).catch(() => undefined);
}

/**
 * `message` (V2, MAV 30/10 : « ok pour construire cela ») : le client écrit à
 * son agent depuis son compte. Le message entre au suivi du contact (et de
 * l'immeuble visé), dans les notes de l'immeuble, et dans les Questions de
 * l'agent jusqu'à ce qu'il réponde depuis le panneau « Son compte sur le site ».
 * La réponse revient au client par le dépôt (`compte_messages`).
 *
 * Une « Demande d'appel » (demande du site, 30/10) arrive comme un message :
 * elle devient une question de nature `appel`, en tête des Questions.
 */
async function recevoirMessage(ref: string, b: Record<string, unknown>) {
  const { contactId } = await contactDuCompte(b);
  const texte = T(b.texte, 5000) ?? T(b.message, 5000);
  if (!texte) throw new LeadInvalide("Message vide.");
  const id = `app_site_${ref}`;
  if (await existe("bo_suivi", id)) return { deja: true, id };
  const { immeubleId, im, proprietaire } = await bienVise(contactId, b);
  /* Plusieurs conversations par client, nommées : sans clé de conversation,
     le message ouvre la sienne. La clé est rendue au site telle qu'il l'a
     envoyée (UUID avec tirets). */
  const conversation = reference(b.conversation)
    ? String(b.conversation).trim().toLowerCase()
    : String(b.ref).trim().toLowerCase();
  const titre = T(b.titre, 120);
  const pieces = await rapatrierPieces(b, ref, contactId, immeubleId, "Message du client");
  await suiviCompte(id, {
    type: "Message", contactId, immeubleId, agentId: T(im?.data.AGENT), notes: texte,
    extra: {
      site_message: "client", site_conversation: conversation, site_titre: titre,
      site_pieces: pieces.length ? pieces.map(({ nom, path }) => ({ nom, path })) : undefined,
    },
  });
  const appel = /demande d.appel/i.test(titre ?? "");
  await questionCompte(`${id}_q`, {
    nature: appel ? "appel" : "message", contactId, immeubleId: immeubleId ?? "", source: "Site - Compte client",
    message: appel ? `Demande d'appel : ${texte}` : texte,
  });
  if (immeubleId && proprietaire) await noterClient(immeubleId, texte);
  await effacerPieces(b);
  after(() => deposerCompte(contactId).then(() => undefined, () => undefined));
  return { deja: false, id };
}

const CRENEAUX: Record<string, string> = { matin: "le matin", apres_midi: "l'après-midi", soir: "en soirée" };
const OBJETS_RDV: Record<string, string> = { visite: "Visite", estimation: "Estimation", signature: "Signature", autre: "Rendez-vous" };

/**
 * `rendez_vous` (§13) : une DEMANDE. Elle entre dans les Questions (nature
 * `rendez_vous`) ; l'agent la confirme ou l'annule, et l'état revient au
 * client par `compte_rendez_vous`.
 */
async function recevoirRendezVous(ref: string, b: Record<string, unknown>) {
  const { contactId } = await contactDuCompte(b);
  const id = `app_site_${ref}`;
  if (await existe("bo_question", id)) return { deja: true, id };
  const date = T(b.date, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw new LeadInvalide("Date illisible (AAAA-MM-JJ).");
  const creneau = T(b.creneau, 20) ?? "";
  if (!CRENEAUX[creneau] && !/^\d{1,2}:\d{2}$/.test(creneau)) throw new LeadInvalide("Créneau illisible.");
  const objet = OBJETS_RDV[T(b.objet, 20) ?? ""] ? T(b.objet, 20)! : "autre";
  const { immeubleId, proprietaire } = await bienVise(contactId, b);
  const [a, m, j] = date.split("-");
  const quand = `${j}/${m}/${a.slice(2)} ${CRENEAUX[creneau] ?? `à ${creneau.replace(":", "h")}`}`;
  const texte = T(b.texte, 2000);
  const message = `${OBJETS_RDV[objet]} demandée pour le ${quand}.${texte ? `\n${texte}` : ""}`;
  const [c] = await lire(`bo_contact?select=id,data&id=eq.${encodeURIComponent(contactId)}`);
  const now = new Date().toISOString();
  await inserer("bo_question", id, {
    source: "Site - Compte client", nature: "rendez_vous", ended: false, message,
    email: T(c?.data.email), "téléphone": T(c?.data.portable) ?? T(c?.data.fixe),
    IMMEUBLE: immeubleId, CONTACT: contactId,
    rdv_date: date, rdv_creneau: creneau, rdv_objet: objet, rdv_etat: "demande",
    "Created Date": now, "Modified Date": now,
  });
  if (immeubleId && proprietaire) await noterClient(immeubleId, message);
  after(() => deposerCompte(contactId).then(() => undefined, () => undefined));
  return { deja: false, id };
}

const FINANCEMENTS: Record<string, string> = { comptant: "comptant", pret: "avec prêt", mixte: "apport et prêt" };

/**
 * `offre_acquereur` (§13) : une offre sur un bien proposé. Elle se range
 * comme une offre saisie par l'agent (« En cours », rattachée à l'acquéreur,
 * qui passe en B) et l'agent est prévenu dans les Questions. Le site donne le
 * prix offert : net vendeur et honoraires sont répartis au prorata du prix
 * affiché, à vérifier par l'agent. Le vendeur ne la voit que si l'agent la
 * lui transmet.
 */
async function recevoirOffreAcquereur(ref: string, b: Record<string, unknown>) {
  const { contactId } = await contactDuCompte(b);
  const id = `app_site_${ref}`;
  if (await existe("bo_offre", id)) return { deja: true, id };
  const montant = N(b.montant);
  if (!montant || montant <= 0) throw new LeadInvalide("Montant illisible.");
  if (!cleCompte(b.proposition)) throw new LeadInvalide("L'offre doit désigner une proposition.");
  const { immeubleId, im } = await bienVise(contactId, { proposition: b.proposition });
  if (!immeubleId || !im) throw new LeadInvalide("Le bien de cette proposition n'est plus dans le BO.");
  const pieces = await rapatrierPieces(b, ref, contactId, immeubleId, "Offre de l'acquéreur");
  const hai = N(im.data.prix_hai), nv = N(im.data.prix_nv);
  const prixNv = hai && nv && hai > 0 && nv <= hai ? Math.round((montant * nv) / hai) : undefined;
  const jours = N(b.validite_jours);
  const financement = FINANCEMENTS[T(b.financement, 20) ?? ""];
  const apport = N(b.apport);
  const conditions = T(b.conditions, 3000);
  const now = new Date();
  const commentaire = [
    "Offre faite depuis son compte sur le site.",
    financement ? `Financement ${financement}${apport ? `, apport ${eur(apport)}` : ""}.` : apport ? `Apport ${eur(apport)}.` : null,
    conditions ? `Conditions : ${conditions}` : null,
    prixNv ? "Net vendeur et honoraires répartis au prorata du prix affiché : à vérifier." : "Net vendeur à renseigner.",
  ].filter(Boolean).join("\n");
  await inserer("bo_offre", id, {
    IMMEUBLEs: [immeubleId], Statut: "En cours", date: now.toISOString(),
    ACHETEURs: [contactId], prix_hai: montant, prix_nv: prixNv,
    honos_ttc: prixNv !== undefined ? montant - prixNv : undefined,
    honos_ht: prixNv !== undefined ? Math.round((montant - prixNv) / 1.2) : undefined,
    validite_jours: jours, date_expiration: jours ? new Date(now.getTime() + jours * 86_400_000).toISOString() : undefined,
    commentaire, source: "Site - Compte client",
    pdf: pieces.find((x) => x.format === "application/pdf") ? `storage:${pieces.find((x) => x.format === "application/pdf")!.path}` : undefined,
    site_financement: T(b.financement, 20), site_apport: apport,
    "Created Date": now.toISOString(), "Modified Date": now.toISOString(),
  });
  /* Retour #525 : celui qui fait une offre passe en B (on ne fait que monter). */
  const [c] = await lire(`bo_contact?select=id,data&id=eq.${encodeURIComponent(contactId)}`);
  if (c && c.data.Note !== "A" && c.data.Note !== "B") {
    await rpc("bo_patch_doc", { p_table: "bo_contact", p_id: contactId, p_patch: { Note: "B", note_auto: { de: c.data.Note ?? null, motif: "offre", le: now.toISOString() } } });
  }
  await questionCompte(`${id}_q`, {
    nature: "offre", contactId, immeubleId, source: "Site - Compte client",
    message: `Offre à ${eur(montant)}${jours ? `, valable ${jours} jours` : ""}.\n${commentaire}`,
  });
  await effacerPieces(b);
  after(() => deposerCompte(contactId).then(() => undefined, () => undefined));
  return { deja: false, id };
}

/**
 * `profil_investisseur` (§13) : rangé sur la fiche contact ; un nouvel envoi
 * remplace le précédent. L'agent le lit dans « Son compte sur le site ».
 */
async function recevoirProfilInvestisseur(ref: string, b: Record<string, unknown>) {
  const { contactId } = await contactDuCompte(b);
  const [c] = await lire(`bo_contact?select=id,data&id=eq.${encodeURIComponent(contactId)}`);
  const ancien = (c?.data.profil_investisseur ?? {}) as Record<string, unknown>;
  if (ancien.ref === ref) return { deja: true, id: contactId };
  const pieces = await rapatrierPieces(b, ref, contactId, undefined, "Profil investisseur");
  const achat = T(b.achat_en, 20);
  const profil = {
    ref, recu_le: new Date().toISOString(),
    achat_en: achat === "societe" ? "societe" : achat === "nom_propre" ? "nom_propre" : undefined,
    societe: T(b.societe, 160), siren: T(b.siren, 14)?.replace(/\s/g, ""),
    immeubles_detenus: N(b.immeubles_detenus), budget: N(b.budget), apport: N(b.apport),
    financement: FINANCEMENTS[T(b.financement, 20) ?? ""] ? T(b.financement, 20) : undefined,
    presentation: T(b.presentation, 5000),
    pieces: pieces.map(({ nom, path }) => ({ nom, path })),
  };
  await rpc("bo_patch_doc", { p_table: "bo_contact", p_id: contactId, p_patch: { profil_investisseur: JSON.parse(JSON.stringify(profil)) } });
  await suiviCompte(`app_site_${ref}`, {
    type: "Formulaire", contactId,
    notes: `Profil investisseur ${Object.keys(ancien).length ? "mis à jour" : "renseigné"} depuis son compte : `
      + [profil.achat_en === "societe" ? `achète en société${profil.societe ? ` (${profil.societe})` : ""}` : profil.achat_en ? "achète en nom propre" : null,
        profil.budget ? `budget ${eur(profil.budget)}` : null, profil.apport ? `apport ${eur(profil.apport)}` : null,
        profil.financement ? `financement ${FINANCEMENTS[profil.financement]}` : null,
        profil.immeubles_detenus !== undefined ? `${profil.immeubles_detenus} immeuble(s) détenu(s)` : null]
        .filter(Boolean).join(", ") + ".",
  }).catch(() => undefined);
  await effacerPieces(b);
  return { deja: false, id: contactId };
}

/**
 * `coordonnees` (MAV, 30/10) : le client change lui-même son prénom, son nom,
 * son téléphone ou son e-mail depuis « Mon profil » du site. Le site a prouvé
 * la nouvelle adresse par un code ; `ancien_email` n'est là que si elle a
 * changé. La fiche contact suit, et l'historique dit ce qui a changé.
 */
async function recevoirCoordonnees(ref: string, b: Record<string, unknown>) {
  const { contactId } = await contactDuCompte(b);
  const [c] = await lire(`bo_contact?select=id,data&id=eq.${encodeURIComponent(contactId)}`);
  if (!c) throw new LeadPasPret("Contact introuvable.");
  if (c.data.site_coordonnees_ref === ref) return { deja: true, id: contactId };
  const email = T(b.email, 200)?.toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new LeadInvalide("Adresse e-mail illisible.");
  const nouveau: Record<string, string | undefined> = {
    "prénom": T(b.prenom, 80), nom: T(b.nom, 80), portable: T(b.telephone, 40), email,
  };
  const libelles: Record<string, string> = { "prénom": "prénom", nom: "nom", portable: "téléphone", email: "e-mail" };
  const changes: string[] = [];
  const patch: Record<string, unknown> = { site_coordonnees_ref: ref, "Modified Date": new Date().toISOString() };
  for (const [k, v] of Object.entries(nouveau)) {
    if (!v) continue;
    const avant = T(c.data[k]);
    const pareil = k === "portable" ? neufChiffres(avant) === neufChiffres(v) : (avant ?? "").toLowerCase() === v.toLowerCase();
    if (pareil) continue;
    patch[k] = v;
    changes.push(`${libelles[k]} : ${avant ?? "—"} → ${v}`);
  }
  /* L'ancienne adresse reste lisible sur la fiche : une réponse à un vieux
     mail doit encore retrouver la personne. */
  if (patch.email && T(c.data.email)) {
    const anciens = Array.isArray(c.data.emails_anciens) ? (c.data.emails_anciens as unknown[]).map((x) => T(x)).filter(Boolean) as string[] : [];
    patch.emails_anciens = [...new Set([...anciens, T(c.data.email)!.toLowerCase()])];
  }
  await rpc("bo_patch_doc", { p_table: "bo_contact", p_id: contactId, p_patch: patch });
  if (changes.length) {
    await suiviCompte(`app_site_${ref}`, {
      type: "Formulaire", contactId,
      notes: `Coordonnées modifiées par le client depuis son compte :\n${changes.join("\n")}`,
    }).catch(() => undefined);
  }
  return { deja: false, id: contactId };
}

/** `compte_supprime` : le BO efface ses dépôts et retire la clé ; le contact reste. */
async function recevoirCompteSupprime(_ref: string, b: Record<string, unknown>) {
  const compte = cleCompte(b.compte);
  if (!compte) throw new LeadInvalide("Clé de compte absente ou qui n'est pas un UUID.");
  const contactId = await contactParCompte(compte);
  if (contactId) {
    await rpc("bo_patch_doc", {
      p_table: "bo_contact", p_id: contactId,
      p_patch: { site_compte: null, site_compte_supprime_le: new Date().toISOString() },
    });
  }
  await effacerCompte(compte);
  return { deja: !contactId, id: contactId ?? "" };
}

/* -------------------------------------------------------------- Entrée */

export async function recevoirLead(b: Record<string, unknown>): Promise<{ deja: boolean; id: string }> {
  const ref = reference(b.ref);
  if (!ref) throw new LeadInvalide("Référence absente ou qui n'est pas un UUID.");
  switch (b.type) {
    case "estimation": return recevoirEstimation(ref, b);
    case "recherche_acquereur": return recevoirRecherche(ref, b);
    case "contact": return recevoirContact(ref, b);
    case "compte": return recevoirCompte(ref, b);
    case "recherche_compte": return recevoirRechercheCompte(ref, b);
    case "reponse": return recevoirReponse(ref, b);
    case "prix_proprietaire": return recevoirPrixProprietaire(ref, b);
    case "compte_supprime": return recevoirCompteSupprime(ref, b);
    case "document": return recevoirDocument(ref, b);
    case "message": return recevoirMessage(ref, b);
    case "rendez_vous": return recevoirRendezVous(ref, b);
    case "offre_acquereur": return recevoirOffreAcquereur(ref, b);
    case "profil_investisseur": return recevoirProfilInvestisseur(ref, b);
    case "coordonnees": return recevoirCoordonnees(ref, b);
    /* Règle du 30/10 (§11.1) : un type que le BO ne sait pas encore lire est
       gardé en file par le site (503), jamais jeté. */
    default: throw new LeadPasPret(`Type d'envoi pas encore lu par le BO : ${String(b.type).slice(0, 40)}`);
  }
}

/* ------------------------------------------------- Tableau de bord */

/** Les demandes ouvertes d'un agent (dossier, visite, intérêt, prix), pour le compteur du tableau de bord. */
export async function demandesDossierOuvertes(agentId: string): Promise<number> {
  const rows = await lire(
    "bo_question?select=id,data&data->>ended=eq.false&or=(data->>demande_dossier.eq.true,data->>nature.not.is.null)&limit=500",
  ).catch(() => []);
  /* Les demandes ne sont plus attribuées d'office (#513) : une demande sans
     agent compte pour tout le monde, une demande attribuée pour son agent. */
  return rows.filter((q) => {
    const suivi = q.data["suivi par"];
    const liste = Array.isArray(suivi) ? suivi : suivi ? [suivi] : [];
    return liste.length === 0 || liste.includes(agentId);
  }).length;
}
