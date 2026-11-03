// La réponse d'un acquéreur à une proposition, quel que soit le canal.
//
// MAV (02/11), après l'essai RCS : « j'ai cliqué pas intéressé et ça
// fonctionne. Si on pouvait faire la même chose dans les e-mails ce serait
// génial (sans changer la façon dont on les envoie) ». D'où un seul endroit
// pour ce que vaut un « Pas intéressé » — le bouton de la carte RCS, le « 2 »
// du SMS de repli, le lien d'un e-mail — et des liens SIGNÉS, posés dans
// chaque e-mail au moment de l'envoi, sans rien changer à la route d'envoi.
//
// Code serveur (clé de service). PAS un module « use server » : ces fonctions
// ne sont pas appelables depuis le navigateur ; la page /reponse passe par une
// action qui vérifie la signature d'abord.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY!}` });

type Doc = Record<string, unknown>;
const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function lire<T>(chemin: string): Promise<T[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, { headers: H(), cache: "no-store" }).catch(() => null);
  return res?.ok ? ((await res.json()) as T[]) : [];
}

async function patcher(table: string, id: string, patch: Doc) {
  if (!SB_KEY) return;
  await fetch(`${SB_URL}/rest/v1/rpc/bo_patch_doc`, {
    method: "POST",
    headers: { ...H(), "Content-Type": "application/json" },
    body: JSON.stringify({ p_table: table, p_id: id, p_patch: patch }),
    cache: "no-store",
  }).catch(() => undefined);
}

/* ------------------------------------------------------------ Signature */

export type Reponse = "oui" | "non";

/* La clé de signature est DÉRIVÉE de la clé de service, jamais elle-même :
   aucune variable nouvelle à poser chez Vercel, et la signature ne révèle rien
   de la clé. Changer la clé de service invaliderait les liens déjà partis —
   c'est le prix, il est acceptable. */
const cle = () => createHash("sha256").update(`fi-reponse-mail:${SB_KEY ?? ""}`).digest();

export function signer(propositionId: string, r: Reponse): string {
  return createHmac("sha256", cle()).update(`${propositionId}|${r}`).digest("base64url").slice(0, 22);
}

export function signatureValide(propositionId: string, r: string, s: string): r is Reponse {
  if ((r !== "oui" && r !== "non") || !/^[\w-]{22}$/.test(s) || !/^[\w-]{6,80}$/.test(propositionId)) return false;
  const attendu = Buffer.from(signer(propositionId, r));
  const donne = Buffer.from(s);
  return attendu.length === donne.length && timingSafeEqual(attendu, donne);
}

export function lienReponse(base: string, propositionId: string, r: Reponse): string {
  return `${base.replace(/\/+$/, "")}/reponse?p=${encodeURIComponent(propositionId)}&r=${r}&s=${signer(propositionId, r)}`;
}

/* ------------------------------------------------------- Dans l'e-mail */

/** La phrase que les e-mails portaient avant les liens (#358) : les liens la remplacent. */
const ANCIENNE_PHRASE = /^Pas intéressé \? Un mot en réponse.*$/m;

/**
 * Le texte de l'e-mail, avec les liens de CE destinataire.
 *
 * Le corps a pu être retouché par l'agent : on ne réécrit rien d'autre. Les
 * liens prennent la place de l'ancienne phrase « Pas intéressé ? Un mot en
 * réponse… » si elle est là, sinon ils se posent avant « Cordialement », sinon
 * à la fin.
 */
export function avecLiens(
  texte: string,
  liens: { libelle?: string; oui: string; non: string }[],
): string {
  if (liens.length === 0) return texte;
  const bloc = liens.length === 1
    ? [
      `Intéressé ? Un clic et je vous rappelle : ${liens[0].oui}`,
      `Pas intéressé ? Un clic et je ne vous relance plus sur ce dossier : ${liens[0].non}`,
    ].join("\n")
    : [
      "Votre avis sur chaque dossier, en un clic :",
      ...liens.flatMap((l) => [
        `  • ${l.libelle ?? "Dossier"}`,
        `    Intéressé : ${l.oui}`,
        `    Pas intéressé : ${l.non}`,
      ]),
    ].join("\n");
  if (ANCIENNE_PHRASE.test(texte)) return texte.replace(ANCIENNE_PHRASE, bloc);
  const i = texte.search(/^Cordialement/m);
  if (i >= 0) return `${texte.slice(0, i)}${bloc}\n\n${texte.slice(i)}`;
  return `${texte.trimEnd()}\n\n${bloc}`;
}

/**
 * Les propositions d'une commercialisation, par adresse : elles sont créées
 * AVANT l'envoi (`createCommercialisation`), une par personne, avec l'adresse
 * servie (`mail_adresse`). C'est la source sûre ; `propositionsParEmail` ne
 * sert qu'à compléter.
 */
export async function propositionsDeCommercialisation(commId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!SB_KEY || !commId) return out;
  const rows = await lire<{ id: string; email: string | null }>(
    `bo_proposition?select=id,email:data->>mail_adresse&data->>COMMERCIALISATION=eq.${encodeURIComponent(commId)}&limit=5000`,
  );
  for (const r of rows) {
    const e = (r.email ?? "").trim().toLowerCase();
    if (e && !out.has(e)) out.set(e, r.id);
  }
  return out;
}

/**
 * Pour une salve d'un immeuble : la dernière proposition de chaque adresse.
 * Une adresse sans proposition (saisie à la main, contact inconnu) part sans
 * liens — l'e-mail reste celui d'avant.
 */
export async function propositionsParEmail(immeubleId: string, emails: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!SB_KEY || emails.length === 0) return out;
  const props = await lire<{ id: string; data: Doc }>(
    `bo_proposition?select=id,data&data->>IMMEUBLE=eq.${encodeURIComponent(immeubleId)}&order=bubble_created.desc.nullslast&limit=2000`,
  );
  const parContact = new Map<string, string>();
  for (const p of props) {
    const c = S(p.data.ACHETEUR);
    if (c && !parContact.has(c)) parContact.set(c, p.id);
  }
  const ids = [...parContact.keys()];
  for (let i = 0; i < ids.length; i += 150) {
    const paquet = ids.slice(i, i + 150).map((x) => `"${x}"`).join(",");
    const contacts = await lire<{ id: string; email: string | null }>(`bo_contact?select=id,email:data->>email&id=in.(${paquet})`);
    for (const c of contacts) {
      const e = (c.email ?? "").trim().toLowerCase();
      if (e && !out.has(e)) out.set(e, parContact.get(c.id)!);
    }
  }
  const voulus = new Set(emails.map((e) => e.trim().toLowerCase()));
  for (const e of [...out.keys()]) if (!voulus.has(e)) out.delete(e);
  return out;
}

/** « Sens (89) » pour chaque immeuble : le libellé d'une ligne de liens. */
export async function libellesImmeubles(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!SB_KEY || ids.length === 0) return out;
  const rows = await lire<{ id: string; data: Doc }>(`bo_immeuble?select=id,data&id=in.(${ids.map((x) => `"${x}"`).join(",")})`);
  for (const r of rows) {
    const ville = S(r.data.adresse_ville) ?? "Immeuble";
    const cp = S(r.data.adresse_zipcode) ?? "";
    out.set(r.id, `${ville}${cp ? ` (${cp.slice(0, 2)})` : ""}`);
  }
  return out;
}

/* ------------------------------------------------------------ La réponse */

/** Ce que la page de réponse montre : l'immeuble, et si c'est déjà fait. */
export async function propositionPourReponse(propositionId: string): Promise<{ titre: string; statut: string } | null> {
  const [p] = await lire<{ id: string; data: Doc }>(`bo_proposition?select=id,data&id=eq.${encodeURIComponent(propositionId)}&limit=1`);
  if (!p) return null;
  const imId = S(p.data.IMMEUBLE);
  const lib = imId ? (await libellesImmeubles([imId])).get(imId) : undefined;
  return { titre: lib ? `l'immeuble de ${lib}` : "ce dossier", statut: String(p.data.Statut ?? "") };
}

/**
 * Refuse une proposition et coupe ses relances (MAV, 02/11), comme « Pas pour
 * moi » depuis le compte client. Une proposition déjà avancée (visite, offre,
 * vente) ne recule pas : seules ses relances sont coupées. Ses jumelles —
 * même acquéreur, même immeuble, encore « Envoyée » — suivent, sinon l'une
 * d'elles le relancerait la semaine suivante.
 */
export async function refuserProposition(propositionId: string, canal: string): Promise<boolean> {
  const [p] = await lire<{ id: string; data: Doc }>(`bo_proposition?select=id,data&id=eq.${encodeURIComponent(propositionId)}&limit=1`);
  if (!p) return false;
  const acheteur = S(p.data.ACHETEUR);
  const immeuble = S(p.data.IMMEUBLE);
  const jumelles = acheteur && immeuble
    ? await lire<{ id: string; data: Doc }>(
      `bo_proposition?select=id,data&data->>ACHETEUR=eq.${encodeURIComponent(acheteur)}&data->>IMMEUBLE=eq.${encodeURIComponent(immeuble)}&id=neq.${encodeURIComponent(p.id)}&data->>Statut=eq.${encodeURIComponent("Envoyée")}&limit=20`,
    )
    : [];
  const now = new Date().toISOString();
  const motif = `Pas intéressé (${canal})`;
  for (const x of [p, ...jumelles]) {
    const avance = /^(Visite|Offre|Vendu)/.test(String(x.data.Statut ?? ""));
    await patcher("bo_proposition", x.id, {
      ...(avance ? {} : { Statut: "Refusée (sans offre)", motif_refus: motif, date_fin: now }),
      stop_relances_yn: true,
      stop_relances_le: now,
      stop_relances_motif: motif,
      date_modif: now,
      "Modified Date": now,
    });
  }
  /* Le compte client du site suit : la proposition y passe refusée. */
  if (acheteur) {
    const { deposerCompte } = await import("./compte-site");
    await deposerCompte(acheteur).catch(() => undefined);
  }
  return true;
}

/**
 * La réponse du client, rangée sur la proposition là où l'écran la lit déjà
 * (« Réponse SMS » jusqu'ici ; `retour_canal` dit d'où elle vient).
 */
export async function noterRetourClient(propositionId: string, texte: string, canal: string): Promise<boolean> {
  const [p] = await lire<{ id: string }>(`bo_proposition?select=id&id=eq.${encodeURIComponent(propositionId)}&limit=1`);
  if (!p) return false;
  const now = new Date().toISOString();
  await patcher("bo_proposition", p.id, {
    retour_sms: texte,
    retour_sms_le: now,
    retour_sms_lu: false,
    retour_canal: canal,
    date_modif: now,
    "Modified Date": now,
  });
  return true;
}

/** « Intéressé » : rangé sur la proposition, sans automatisme (comme le RCS). */
export const noterInteret = (propositionId: string, canal: string) => noterRetourClient(propositionId, "Intéressé", canal);
