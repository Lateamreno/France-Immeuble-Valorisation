"use server";

/**
 * Les villes que l'on tape dans une recherche, prédites depuis le référentiel
 * officiel des communes (geo.api.gouv.fr, sans clé) — MAV, 12/11 : « je n'ai
 * toujours pas les prédictions des villes géolocalisées pour la modification
 * des critères de recherche ». Les plus peuplées d'abord : « Saint-Denis »
 * donne celle de La Réunion et celle du 93, puis les villages homonymes.
 *
 * La recherche n'enregistre que le NOM de la ville (le format hérité de
 * Bubble) : deux homonymes ne se distinguent donc pas au matching. Le
 * département affiché sert à choisir, pas à filtrer.
 *
 * On n'envoie à l'API que ce que l'agent a tapé (un début de nom de ville),
 * jamais rien d'un contact.
 */
export type VillePredite = { nom: string; departement: string; population?: number };

export async function predireVilles(saisie: string): Promise<VillePredite[]> {
  const q = saisie.trim();
  if (q.length < 2 || q.length > 60) return [];
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,codeDepartement,population&boost=population&limit=8`;
  const r = await fetch(url, { next: { revalidate: 604800 } }).catch(() => null);
  if (!r?.ok) return [];
  const j = (await r.json().catch(() => [])) as { nom?: string; codeDepartement?: string; population?: number }[];
  return j
    .filter((c) => c.nom)
    .map((c) => ({ nom: String(c.nom), departement: String(c.codeDepartement ?? ""), population: c.population }));
}
