// L'origine des formulaires du site, rangée dans `fi_lead_origine`
// (Acquisition, lot 1). Écrite à l'arrivée du formulaire, relue par la page
// Acquisition. Table fermée aux rôles publics : seule la clé de service la lit.
import { TYPES_FORMULAIRE, type Origine } from "@/lib/bo/acquisition";

const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const T = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Note d'où vient un formulaire. Le premier envoi d'une `ref` fait foi (un
 * complément ou un réessai ne réécrit rien) ; un envoi qui n'est pas un
 * formulaire (mise à jour de compte, pièce, message) n'est pas compté.
 */
export async function noterOrigine(ref: string, b: Record<string, unknown>, docId: string): Promise<void> {
  const type = String(b.type ?? "");
  if (!BO_KEY || !TYPES_FORMULAIRE[type]) return;
  /* Une estimation n'est un formulaire qu'à son envoi principal. */
  if (type === "estimation" && b.etat !== undefined && b.etat !== null && b.etat !== "" && b.etat !== "principal") return;
  const a = (b.attribution && typeof b.attribution === "object" ? b.attribution : {}) as Record<string, unknown>;
  const ligne = {
    ref, type, doc_id: docId || null,
    gclid: T(a.gclid) ?? T(a.gbraid) ?? T(a.wbraid),
    utm_source: T(a.utm_source, 120), utm_medium: T(a.utm_medium, 120), utm_campaign: T(a.utm_campaign, 200),
    utm_term: T(a.utm_term, 200), utm_content: T(a.utm_content, 200),
    landing: T(a.landing, 1000), referrer: T(a.referrer, 1000),
  };
  await fetch(`${BO_URL}/rest/v1/fi_lead_origine?on_conflict=ref`, {
    method: "POST",
    headers: {
      apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}`, "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(ligne),
    cache: "no-store",
  });
}

export type LeadOrigine = Origine & { ref: string; type: string; doc_id: string | null; recu_le: string };

async function lire<T>(chemin: string): Promise<T[]> {
  if (!BO_KEY) return [];
  const r = await fetch(`${BO_URL}/rest/v1/${chemin}`, {
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Lecture ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Les formulaires reçus depuis une date (AAAA-MM-JJ, heure de Paris). */
export async function originesDepuis(du: string): Promise<LeadOrigine[]> {
  return lire<LeadOrigine>(`fi_lead_origine?select=*&recu_le=gte.${du}T00:00:00%2B01:00&order=recu_le.desc&limit=5000`);
}

/** La date du tout premier formulaire noté : avant elle, on ne sait rien. */
export async function premiereOrigine(): Promise<string | null> {
  const [r] = await lire<{ recu_le: string }>("fi_lead_origine?select=recu_le&order=recu_le.asc&limit=1").catch(() => []);
  return r?.recu_le ?? null;
}

/** Statuts d'un mandat qui a été signé (« Expiré » l'a été aussi). */
const SIGNES = ["En cours", "Vendu", "Expiré"];

/**
 * Les immeubles, parmi ceux donnés, qui portent un mandat signé. Une
 * estimation du site crée l'immeuble `app_site_<ref>` : c'est par lui que
 * le formulaire rejoint le mandat.
 */
export async function immeublesSousMandat(ids: string[]): Promise<Set<string>> {
  const voulus = new Set(ids.filter(Boolean));
  const out = new Set<string>();
  if (voulus.size === 0) return out;
  /* Quelques centaines de mandats signés en tout : on les lit d'un coup. */
  const rows = await lire<{ IMMEUBLEs?: string[] | null }>(
    `bo_mandat?select=IMMEUBLEs:data->IMMEUBLEs&data->>Statut=in.(${SIGNES.map((s) => encodeURIComponent(`"${s}"`)).join(",")})&limit=5000`,
  );
  for (const r of rows) for (const id of r.IMMEUBLEs ?? []) if (voulus.has(id)) out.add(id);
  return out;
}
