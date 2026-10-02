// Ce qu'une recherche acquéreur refuse explicitement (retour #332).
//
// MAV : « il faut aussi pouvoir faire des exclusions sur les typologies de
// biens et sur les villes / régions / départements. En général si un client me
// dit qu'il veut de l'habitation, dès qu'un immeuble contient de l'habitation
// il le reçoit ; mais s'il veut QUE de l'habitation et qu'il ne regarde pas
// s'il y a du mixte, alors on exclut le commerce. Pareil pour les sociétés qui
// ne recherchent que du commercial : on sélectionne commercial et on exclut
// habitation, sinon ils auraient reçu tous les immeubles qui contiennent des
// commerces, y compris les immeubles mixtes à dominante habitation. »
//
// Une exclusion n'est donc pas le complément d'une inclusion. « Je veux du
// logement » laisse passer le mixte — c'est voulu, un immeuble d'habitation
// avec une boulangerie au pied reste un immeuble d'habitation. « Je ne veux
// pas de commerce » le refuse. Les deux listes coexistent, et c'est
// l'exclusion qui tranche en dernier.
//
// Elles vivent dans `fi_recherche_exclusion` : Bubble réécrit les tables `bo_*`
// toutes les nuits et effacerait des champs qu'il ne connaît pas.
import "server-only";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type Exclusions = {
  destinations: string[];
  villes: string[];
  departements: string[];
  regions: string[];
};

export const EXCLUSIONS_VIDES: Exclusions = {
  destinations: [], villes: [], departements: [], regions: [],
};

const liste = (v: unknown) =>
  Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : [];

const normaliser = (r: Record<string, unknown> | undefined): Exclusions => ({
  destinations: liste(r?.destinations),
  villes: liste(r?.villes),
  departements: liste(r?.departements),
  regions: liste(r?.regions),
});

/** Les exclusions d'une recherche, vides quand rien n'a été saisi. */
export async function lireExclusions(rechercheId: string): Promise<Exclusions> {
  const t = await lireExclusionsDe([rechercheId]);
  return t.get(rechercheId) ?? EXCLUSIONS_VIDES;
}

/**
 * Les exclusions de plusieurs recherches, en un aller-retour.
 *
 * L'écran Recherches en charge 1 900 d'un coup : une requête par recherche
 * mettrait l'écran à genoux. Sans clé de service — en développement local — on
 * rend une table vide plutôt que de tomber : les exclusions sont un
 * raffinement, pas une condition de fonctionnement.
 */
export async function lireExclusionsDe(ids: string[]): Promise<Map<string, Exclusions>> {
  const out = new Map<string, Exclusions>();
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!SB_KEY || uniques.length === 0) return out;

  /* Par paquets : l'URL d'un `in.(…)` de 1 900 identifiants dépasse ce qu'un
     serveur accepte sur une ligne de requête. */
  for (let i = 0; i < uniques.length; i += 300) {
    const lot = uniques.slice(i, i + 300);
    const url =
      `${SB_URL}/rest/v1/fi_recherche_exclusion` +
      `?select=recherche_id,destinations,villes,departements,regions` +
      `&recherche_id=in.(${lot.map((x) => `"${x}"`).join(",")})`;
    const res = await fetch(url, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      cache: "no-store",
    }).catch(() => null);
    if (!res?.ok) continue;
    const rows = (await res.json()) as Record<string, unknown>[];
    for (const r of rows) out.set(String(r.recherche_id), normaliser(r));
  }
  return out;
}

/** Enregistre les exclusions d'une recherche ; une ligne toute vide est effacée. */
export async function ecrireExclusions(rechercheId: string, e: Exclusions) {
  if (!SB_KEY) return;
  const vide = !e.destinations.length && !e.villes.length && !e.departements.length && !e.regions.length;
  const entetes = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };
  if (vide) {
    await fetch(
      `${SB_URL}/rest/v1/fi_recherche_exclusion?recherche_id=eq.${encodeURIComponent(rechercheId)}`,
      { method: "DELETE", headers: entetes },
    ).catch(() => null);
    return;
  }
  await fetch(`${SB_URL}/rest/v1/fi_recherche_exclusion`, {
    method: "POST",
    headers: entetes,
    body: JSON.stringify({
      recherche_id: rechercheId,
      destinations: e.destinations,
      villes: e.villes,
      departements: e.departements,
      regions: e.regions,
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => null);
}
