// Lecture des sociétés (`bo_societe`) côté serveur — voir lib/societes.ts
// pour le modèle. Pas de « use server » ici : ces fonctions servent aux
// chargeurs de pages (getBien, getContact, la page société), pas aux écrans.
//
// La table est petite et change au fil des saisies : on la lit sans cache,
// comme les comptes clients, plutôt que de l'étiqueter dans le cache des
// pages du miroir.

import { lireSocieteDoc, type SocieteEntite, type SocieteNommee } from "@/lib/societes";

const SB_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function lire(table: string, p: URLSearchParams): Promise<Record<string, unknown>[]> {
  if (!SB_KEY) return [];
  p.set("select", "data");
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return [];
  const rows = (await res.json().catch(() => [])) as { data: Record<string, unknown> }[];
  return rows.map((r) => r.data);
}

export async function lireSociete(id: string): Promise<SocieteEntite | null> {
  if (!id) return null;
  const p = new URLSearchParams({ limit: "1" });
  p.append("id", `eq.${id}`);
  const [d] = await lire("bo_societe", p);
  return d ? lireSocieteDoc(d) : null;
}

export async function lireSocietes(ids: string[]): Promise<SocieteEntite[]> {
  const propres = [...new Set(ids.filter(Boolean))];
  if (!propres.length) return [];
  const p = new URLSearchParams({ limit: String(propres.length) });
  p.append("id", `in.(${propres.map((v) => `"${v}"`).join(",")})`);
  return (await lire("bo_societe", p)).map(lireSocieteDoc);
}

/** Les sociétés dont ce contact est associé. */
export async function societesDeContact(contactId: string): Promise<SocieteEntite[]> {
  if (!contactId) return [];
  const p = new URLSearchParams({ limit: "50", order: "data->>nom.asc" });
  p.append("data", `cs.${JSON.stringify({ associes: [{ contactId }] })}`);
  return (await lire("bo_societe", p)).map(lireSocieteDoc);
}

/** Les sociétés de plusieurs contacts, sans doublon, triées par nom. */
export async function societesDeContacts(contactIds: string[]): Promise<SocieteEntite[]> {
  const ids = [...new Set(contactIds.filter(Boolean))];
  const listes = await Promise.all(ids.map((id) => societesDeContact(id)));
  const vues = new Map<string, SocieteEntite>();
  for (const l of listes) for (const s of l) vues.set(s.id, s);
  return [...vues.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Les immeubles qu'une société détient (`SOCIETE_PROPRIETAIRE`). */
export async function immeublesDeSociete(societeId: string): Promise<Record<string, unknown>[]> {
  if (!societeId) return [];
  const p = new URLSearchParams({ limit: "100" });
  p.append("data->>SOCIETE_PROPRIETAIRE", `eq.${societeId}`);
  return lire("bo_immeuble", p);
}

/** Les mandats où cette société est mandante : par identifiant (mandats
 *  saisis depuis le BO) et, pour ceux d'avant, par SIREN ou raison sociale. */
export async function mandatsDeSociete(s: SocieteEntite): Promise<Record<string, unknown>[]> {
  const p1 = new URLSearchParams({ limit: "100" });
  p1.append("data", `cs.${JSON.stringify({ mandants: [{ societeId: s.id }] })}`);
  const p2 = new URLSearchParams({ limit: "100" });
  const siren = (s.siren ?? "").replace(/\D/g, "");
  if (siren) p2.append("data->>siren", `eq.${s.siren}`);
  else p2.append("data->>raison_sociale", `ilike.${s.nom.replace(/[%,()*]/g, " ")}`);
  const [a, b] = await Promise.all([lire("bo_mandat", p1), lire("bo_mandat", p2)]);
  const vus = new Map<string, Record<string, unknown>>();
  for (const m of [...a, ...b]) vus.set(String(m._id), m);
  return [...vus.values()].sort((x, y) => String(y["Created Date"] ?? "").localeCompare(String(x["Created Date"] ?? "")));
}

/** Nomme les associés de chaque société (prénom + nom du contact). */
export async function nommerSocietes(socs: SocieteEntite[]): Promise<SocieteNommee[]> {
  const contacts = await contactsParIds(socs.flatMap((s) => s.associes.map((a) => a.contactId)));
  const nomDe = (id: string) => {
    const c = contacts.get(id);
    return c ? `${String(c["prénom"] ?? "")} ${String(c.nom ?? "")}`.trim() || String(c.email ?? id) : id;
  };
  return socs.map((s) => ({
    ...s,
    associesNommes: s.associes.map((a) => ({ contactId: a.contactId, nom: nomDe(a.contactId), fonction: a.fonction })),
  }));
}

/** Les contacts d'une liste d'identifiants, pour nommer les associés. */
export async function contactsParIds(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const propres = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, Record<string, unknown>>();
  if (!propres.length) return out;
  const p = new URLSearchParams({ limit: String(propres.length) });
  p.append("id", `in.(${propres.map((v) => `"${v}"`).join(",")})`);
  for (const c of await lire("bo_contact", p)) out.set(String(c._id), c);
  return out;
}
