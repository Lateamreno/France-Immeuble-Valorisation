"use server";

// Sociétés et propriétaires multiples — les écritures (retour #489).
//
// Le modèle est décrit dans lib/societes.ts. Ici : créer ou compléter une
// société, rattacher ou détacher un associé avec sa fonction, et, côté bien,
// ajouter ou retirer un propriétaire et désigner la société détentrice.
//
// Toutes les écritures passent par les fonctions SQL du miroir (`bo_insert_doc`,
// `bo_patch_doc`), qui posent `app_modified` : c'est ce qui protège ces lignes
// de la synchro Bubble (fonction bubble-sync v5/v6).

import { revalidatePath, revalidateTag } from "next/cache";
import {
  cleSociete, lireSocieteDoc, type Associe, type SocieteEntite, type SocieteNommee,
} from "@/lib/societes";
import {
  lireSociete, lireSocietes, nommerSocietes, societesDeContact, societesDeContacts,
} from "@/lib/bo/societes-lecture";

const SB_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const newId = () =>
  `app_${Date.now()}x${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;

async function rpc(fn: string, args: Record<string, unknown>) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  /* Même règle que `rpc` dans lib/bo/actions.ts : toute écriture décroche
     l'étiquette de cache de sa table, sinon l'écran ne voit rien changer. */
  const table = typeof args.p_table === "string" ? args.p_table : "";
  if (table) revalidateTag(table, { expire: 0 });
}

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const propre = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== ""));

/* ------------------------------------------------------------- Lectures */

/** Une société, telle qu'un écran client peut la demander. */
export async function chargerSociete(id: string): Promise<SocieteEntite | null> {
  return lireSociete(id);
}

/** Les sociétés d'un contact, pour la fiche et pour le mandat. */
export async function chargerSocietesDuContact(contactId: string): Promise<SocieteEntite[]> {
  return societesDeContact(contactId);
}

/** Les sociétés de plusieurs contacts (les propriétaires d'un bien). */
export async function chargerSocietesDesContacts(ids: string[]): Promise<SocieteEntite[]> {
  return societesDeContacts(ids);
}

export type SocieteTrouvee = SocieteNommee;

/** Recherche une société du BO par raison sociale ou SIREN. */
export async function chercherSocietes(q: string): Promise<SocieteTrouvee[]> {
  const t = (q ?? "").trim();
  if (!SB_KEY || t.length < 2) return [];
  const motif = `*${t.replace(/[%,()*]/g, " ").trim()}*`;
  const chiffres = t.replace(/\D/g, "");
  const p = new URLSearchParams({ select: "data", limit: "15", order: "data->>nom.asc" });
  p.set("or", `(data->>nom.ilike.${motif}${chiffres.length >= 3 ? `,data->>siren.ilike.*${chiffres}*` : ""})`);
  const res = await fetch(`${SB_URL}/rest/v1/bo_societe?${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return [];
  const rows = (await res.json().catch(() => [])) as { data: Record<string, unknown> }[];
  const socs = rows.map((r) => lireSocieteDoc(r.data));
  return nommerSocietes(socs);
}

/** Les sociétés d'une liste d'identifiants, avec leurs associés nommés. */
export async function chargerSocietesNommees(ids: string[]): Promise<SocieteTrouvee[]> {
  return nommerSocietes(await lireSocietes(ids));
}

/** Les sociétés d'un contact, associés nommés. */
export async function chargerSocietesNommeesDuContact(contactId: string): Promise<SocieteTrouvee[]> {
  return nommerSocietes(await societesDeContact(contactId));
}

/* ------------------------------------------------------------ Écritures */

export type SocieteSaisie = {
  nom: string;
  forme?: string;
  siren?: string;
  rcs?: string;
  capital?: number;
  siege?: string;
  kbis?: string;
  kbisLe?: string;
  representante?: SocieteEntite["representante"];
};

/** La société du BO qui porte ce SIREN (ou ce nom), s'il y en a une. */
async function dejaConnue(s: { siren?: string; nom?: string }): Promise<SocieteEntite | null> {
  const k = cleSociete(s);
  if (!k || !SB_KEY) return null;
  const p = new URLSearchParams({ select: "data", limit: "20" });
  const siren = (s.siren ?? "").replace(/\D/g, "");
  if (siren) {
    p.append("data->>siren", `ilike.*${siren.slice(0, 3)}*${siren.slice(3, 6)}*${siren.slice(6)}*`);
  } else {
    p.append("data->>nom", `ilike.${(s.nom ?? "").replace(/[%,()*]/g, " ").trim()}`);
  }
  const res = await fetch(`${SB_URL}/rest/v1/bo_societe?${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const rows = (await res.json().catch(() => [])) as { data: Record<string, unknown> }[];
  return rows.map((r) => lireSocieteDoc(r.data)).find((x) => cleSociete(x) === k) ?? null;
}

/**
 * Crée une société — ou complète celle qui existe déjà sous ce SIREN / ce
 * nom — et y rattache, s'il est donné, un premier associé. Rend l'identifiant.
 * Les valeurs fournies l'emportent sur celles en base (c'est la saisie du
 * jour), sauf à effacer : ne rien saisir n'est pas effacer.
 */
export async function creerOuCompleterSociete(
  s: SocieteSaisie,
  associe?: Associe,
): Promise<string> {
  const nom = S(s.nom);
  if (!nom) throw new Error("La raison sociale est obligatoire.");
  const existante = await dejaConnue({ siren: s.siren, nom });
  if (existante) {
    const patch = propre({
      nom, forme: S(s.forme), siren: S(s.siren), rcs: S(s.rcs),
      capital: s.capital, siege: S(s.siege), kbis: S(s.kbis), kbisLe: S(s.kbisLe),
      representante: s.representante?.nom ? s.representante : undefined,
    });
    const associes = associe ? fusionnerAssocie(existante.associes, associe) : existante.associes;
    if (JSON.stringify(associes) !== JSON.stringify(existante.associes)) patch.associes = associes;
    if (Object.keys(patch).length) {
      await rpc("bo_patch_doc", { p_table: "bo_societe", p_id: existante.id, p_patch: patch });
      revalider(existante.id, associes);
    }
    return existante.id;
  }
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_societe",
    p_id: id,
    p_doc: propre({
      nom, forme: S(s.forme), siren: S(s.siren), rcs: S(s.rcs),
      capital: s.capital, siege: S(s.siege), kbis: S(s.kbis), kbisLe: S(s.kbisLe),
      representante: s.representante?.nom ? s.representante : undefined,
      associes: associe ? [associe] : [],
      "Created Date": now, "Modified Date": now,
    }),
  });
  revalider(id, associe ? [associe] : []);
  return id;
}

function fusionnerAssocie(liste: Associe[], a: Associe): Associe[] {
  const i = liste.findIndex((x) => x.contactId === a.contactId);
  if (i < 0) return [...liste, { contactId: a.contactId, fonction: S(a.fonction) }];
  const out = [...liste];
  out[i] = { contactId: a.contactId, fonction: S(a.fonction) ?? out[i].fonction };
  return out;
}

function revalider(societeId: string, associes: Associe[]) {
  revalidatePath(`/societe/${societeId}`);
  for (const a of associes) revalidatePath(`/contact/${a.contactId}`);
  revalidatePath("/", "layout");
}

/** Modifie l'identité d'une société (raison sociale, immatriculation, siège…). */
export async function majSociete(id: string, patch: Partial<SocieteSaisie>) {
  const clean = propre({
    nom: S(patch.nom), forme: S(patch.forme), siren: S(patch.siren), rcs: S(patch.rcs),
    capital: patch.capital, siege: S(patch.siege), kbis: S(patch.kbis), kbisLe: S(patch.kbisLe),
    representante: patch.representante,
  });
  if (!Object.keys(clean).length) return;
  clean["Modified Date"] = new Date().toISOString();
  await rpc("bo_patch_doc", { p_table: "bo_societe", p_id: id, p_patch: clean });
  const s = await lireSociete(id);
  revalider(id, s?.associes ?? []);
}

/** Rattache un contact à une société avec sa fonction (ou change la fonction). */
export async function rattacherAssocie(societeId: string, contactId: string, fonction?: string) {
  const s = await lireSociete(societeId);
  if (!s || !contactId) return;
  const associes = fusionnerAssocie(s.associes, { contactId, fonction });
  /* Changer une fonction se fait en écrivant la nouvelle, même vide. */
  const i = associes.findIndex((x) => x.contactId === contactId);
  if (i >= 0) associes[i] = { contactId, fonction: S(fonction) };
  await rpc("bo_patch_doc", {
    p_table: "bo_societe", p_id: societeId,
    p_patch: { associes, "Modified Date": new Date().toISOString() },
  });
  revalider(societeId, associes);
}

/** Détache un contact d'une société. */
export async function detacherAssocie(societeId: string, contactId: string) {
  const s = await lireSociete(societeId);
  if (!s) return;
  const associes = s.associes.filter((x) => x.contactId !== contactId);
  await rpc("bo_patch_doc", {
    p_table: "bo_societe", p_id: societeId,
    p_patch: { associes, "Modified Date": new Date().toISOString() },
  });
  revalider(societeId, [...s.associes]);
}

/* ------------------------------------------- Propriétaires d'un immeuble */

async function lireImmeuble(id: string): Promise<Record<string, unknown> | null> {
  if (!SB_KEY) return null;
  const p = new URLSearchParams({ select: "data", limit: "1" });
  p.append("id", `eq.${id}`);
  const res = await fetch(`${SB_URL}/rest/v1/bo_immeuble?${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const rows = (await res.json().catch(() => [])) as { data: Record<string, unknown> }[];
  return rows[0]?.data ?? null;
}

/** La liste complète des propriétaires d'un immeuble : le principal (que
 *  Bubble connaît) en tête, puis les autres indivisaires. */
function proprietairesDe(im: Record<string, unknown>): string[] {
  const principal = S(im.PROPRIETAIRE);
  const autres = Array.isArray(im.PROPRIETAIREs) ? (im.PROPRIETAIREs as unknown[]).map(String).filter(Boolean) : [];
  return [...new Set([principal, ...autres].filter((x): x is string => !!x))];
}

/** Ajoute un propriétaire (indivisaire) à un immeuble. Le premier devient
 *  aussi le propriétaire principal si la fiche n'en avait pas. */
export async function ajouterProprietaire(immeubleId: string, contactId: string) {
  const im = await lireImmeuble(immeubleId);
  if (!im || !contactId) return;
  const liste = proprietairesDe(im);
  if (liste.includes(contactId)) return;
  liste.push(contactId);
  const patch: Record<string, unknown> = { PROPRIETAIREs: liste, "Modified Date": new Date().toISOString() };
  if (!S(im.PROPRIETAIRE)) patch.PROPRIETAIRE = contactId;
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: patch });
  revalidatePath(`/bien/${immeubleId}`);
  revalidatePath(`/contact/${contactId}`);
}

/** Retire un propriétaire. Le principal ne se retire pas : il se change
 *  (bouton « Changer de propriétaire », qui laisse une trace). */
export async function retirerProprietaire(immeubleId: string, contactId: string) {
  const im = await lireImmeuble(immeubleId);
  if (!im || !contactId || S(im.PROPRIETAIRE) === contactId) return;
  const liste = proprietairesDe(im).filter((x) => x !== contactId);
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble", p_id: immeubleId,
    p_patch: { PROPRIETAIREs: liste, "Modified Date": new Date().toISOString() },
  });
  revalidatePath(`/bien/${immeubleId}`);
  revalidatePath(`/contact/${contactId}`);
}

/**
 * Désigne la société qui détient l'immeuble (`SOCIETE_PROPRIETAIRE`), ou
 * l'efface. Si la société n'est associée à aucun des propriétaires du bien,
 * elle est rattachée au propriétaire principal — fonction à préciser sur sa
 * fiche : un bien est toujours porté par des personnes (décision MAV).
 */
export async function definirSocieteDetentrice(immeubleId: string, societeId: string | null) {
  const im = await lireImmeuble(immeubleId);
  if (!im) return;
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble", p_id: immeubleId,
    p_patch: { SOCIETE_PROPRIETAIRE: societeId, "Modified Date": new Date().toISOString() },
  });
  if (societeId) {
    const s = await lireSociete(societeId);
    const proprios = proprietairesDe(im);
    if (s && proprios.length && !s.associes.some((a) => proprios.includes(a.contactId))) {
      await rattacherAssocie(societeId, proprios[0]);
    }
    revalidatePath(`/societe/${societeId}`);
  }
  revalidatePath(`/bien/${immeubleId}`);
}
