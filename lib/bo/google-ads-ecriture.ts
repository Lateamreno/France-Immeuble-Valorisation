// Écrire dans Google Ads (Acquisition, lot 2 — MAV, 10/11 : « je veux aussi
// l'écriture, depuis le BO et depuis Claude »). Le SEUL chemin des écritures :
// garde-fous (google-ads-changements.ts), application, journal
// (`fi_ads_journal`). Le BO et Claude passent par la même porte, avec les
// mêmes refus ; seule la `source` du journal les distingue.
//
// Module serveur seulement.
import { etatAds, lireAds, muter, viderCacheLecture } from "@/lib/bo/google-ads";
import { budgetsDe, inverse, libelle, operation, refus, type Changement, type EtatCompte } from "@/lib/bo/google-ads-changements";
import { periodeDe } from "@/lib/bo/acquisition";

const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const entetes = () => ({ apikey: BO_KEY ?? "", Authorization: `Bearer ${BO_KEY ?? ""}`, "Content-Type": "application/json" });

/* ------------------------------------------------------------ Plafond */

/** Le plafond de dépense par jour (somme des budgets actifs), ou null s'il n'est pas posé. */
export async function lirePlafond(): Promise<number | null> {
  if (!BO_KEY) return null;
  const r = await fetch(`${BO_URL}/rest/v1/fi_reglages?cle=eq.google_ads&select=valeurs`, { headers: entetes(), cache: "no-store" }).catch(() => null);
  const [l] = r?.ok ? ((await r.json()) as { valeurs?: { plafond_jour?: number } }[]) : [];
  const p = l?.valeurs?.plafond_jour;
  return typeof p === "number" && p > 0 ? p : null;
}

/** Réservé au BO (direction) : Claude ne pose jamais son propre plafond. */
export async function poserPlafond(euros: number | null, par: string | null): Promise<void> {
  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const r = await fetch(`${BO_URL}/rest/v1/fi_reglages?on_conflict=cle`, {
    method: "POST",
    headers: { ...entetes(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ cle: "google_ads", valeurs: { plafond_jour: euros }, maj_le: new Date().toISOString(), maj_par: par }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Plafond non enregistré : ${r.status}`);
}

/* ------------------------------------------------------------ Journal */

export type LigneJournal = {
  id: number; quand: string; source: "bo" | "claude"; par: string | null; motif: string | null;
  changement: Changement; libelle: string; ok: boolean; erreur: string | null;
  ressource_creee: string | null; inverse: Changement | null; annule_le: string | null;
};

export async function lireJournal(limite = 50): Promise<LigneJournal[]> {
  if (!BO_KEY) return [];
  const r = await fetch(`${BO_URL}/rest/v1/fi_ads_journal?select=*&order=quand.desc&limit=${limite}`, { headers: entetes(), cache: "no-store" }).catch(() => null);
  return r?.ok ? r.json() : [];
}

async function journaliser(l: Omit<LigneJournal, "id" | "quand" | "annule_le">): Promise<number | null> {
  if (!BO_KEY) return null;
  const r = await fetch(`${BO_URL}/rest/v1/fi_ads_journal?select=id`, {
    method: "POST",
    headers: { ...entetes(), Prefer: "return=representation" },
    body: JSON.stringify(l),
    cache: "no-store",
  }).catch(() => null);
  const [x] = r?.ok ? ((await r.json()) as { id: number }[]) : [];
  return x?.id ?? null;
}

/* ------------------------------------------------------------ Écrire */

/** L'état du compte tel que Google le voit À L'INSTANT (pas de cache). */
export async function etatCompte(): Promise<EtatCompte> {
  const e = await etatAds();
  if (!e.pret) throw new Error("Google Ads n'est pas branché.");
  const [l, plafondJour] = await Promise.all([lireAds(periodeDe(7), true), lirePlafond()]);
  for (const s of ["campagnes", "groupes", "motsCles", "zones", "exclusions", "annonces"] as const) {
    if (l.erreurs[s]) throw new Error(`Lecture de l'état impossible (${s}) : ${l.erreurs[s]}`);
  }
  return {
    compte: e.compte, plafondJour,
    campagnes: l.campagnes, groupes: l.groupes, motsCles: l.motsCles,
    exclusions: l.exclusions, zones: l.zones, annonces: l.annonces,
  };
}

export type Resultat = { libelle: string; ok: boolean; message?: string; journal?: number | null };

/**
 * Applique une série de changements, un par un : un refus ou une erreur
 * n'empêche pas les suivants, et chacun laisse sa ligne au journal.
 * `essai` : Google vérifie (validateOnly) sans rien changer, rien n'est journalisé.
 */
export async function appliquer(
  changements: Changement[],
  q: { source: "bo" | "claude"; par: string | null; motif?: string | null; essai?: boolean },
): Promise<Resultat[]> {
  if (!Array.isArray(changements) || changements.length === 0) return [];
  if (changements.length > 50) throw new Error("50 changements au plus par envoi.");
  const e = await etatCompte();
  const budgets = budgetsDe(e);
  const out: Resultat[] = [];
  for (const c of changements) {
    let texte: string;
    try {
      texte = libelle(c, e);
    } catch {
      texte = "Changement illisible";
    }
    const motifRefus = refus(c, e, budgets);
    if (motifRefus) {
      const id = q.essai ? null : await journaliser({ source: q.source, par: q.par, motif: q.motif ?? null, changement: c, libelle: texte, ok: false, erreur: `Refusé : ${motifRefus}`, ressource_creee: null, inverse: null });
      out.push({ libelle: texte, ok: false, message: `Refusé : ${motifRefus}`, journal: id });
      continue;
    }
    const op = operation(c, e);
    try {
      const [creee] = await muter(op.service, [op.operation], !!q.essai);
      if (q.essai) {
        out.push({ libelle: texte, ok: true, message: "Vérifié par Google, rien n'a changé." });
        continue;
      }
      const id = await journaliser({ source: q.source, par: q.par, motif: q.motif ?? null, changement: c, libelle: texte, ok: true, erreur: null, ressource_creee: creee || null, inverse: inverse(c, e, creee) });
      out.push({ libelle: texte, ok: true, journal: id });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      const id = q.essai ? null : await journaliser({ source: q.source, par: q.par, motif: q.motif ?? null, changement: c, libelle: texte, ok: false, erreur: m, ressource_creee: null, inverse: null });
      out.push({ libelle: texte, ok: false, message: m, journal: id });
    }
  }
  if (!q.essai) viderCacheLecture();
  return out;
}

/** « Annuler » une ligne du journal : applique son geste inverse, avec les mêmes garde-fous. */
export async function annuler(id: number, q: { source: "bo" | "claude"; par: string | null }): Promise<Resultat> {
  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const r = await fetch(`${BO_URL}/rest/v1/fi_ads_journal?id=eq.${id}&select=*`, { headers: entetes(), cache: "no-store" });
  const [l] = r.ok ? ((await r.json()) as LigneJournal[]) : [];
  if (!l) throw new Error("Ligne du journal introuvable.");
  if (!l.inverse) throw new Error("Ce changement ne se défait pas d'un clic : à reprendre dans Google Ads.");
  if (l.annule_le) throw new Error("Déjà annulé.");
  const [res] = await appliquer([l.inverse], { ...q, motif: `Annulation de : ${l.libelle}` });
  if (res?.ok) {
    await fetch(`${BO_URL}/rest/v1/fi_ads_journal?id=eq.${id}`, {
      method: "PATCH", headers: entetes(), body: JSON.stringify({ annule_le: new Date().toISOString() }), cache: "no-store",
    });
  }
  return res;
}
