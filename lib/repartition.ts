/* La répartition des honoraires entre l'agence et ses agents commerciaux
 * (retour #574, barème du contrat d'agent co).
 *
 * Une vente a deux apports : l'affaire (l'agent qui détient le bien) et
 * l'acheteur (l'agent qui suit la fiche de l'acquéreur). Chaque apport génère
 * la moitié des honoraires HT. Sur ce qu'il génère, l'agent co touche :
 *   · 50 % tant que son CA HT cumulé de l'année civile reste ≤ 150 000 € ;
 *   · 55 % pour la partie entre 150 000,01 € et 300 000 € ;
 *   · 60 % pour la partie au-delà de 300 000 €.
 * Soit 25 / 27,5 / 30 % des honoraires par apport. Les tranches sont
 * marginales : seule la partie qui franchit un seuil change de taux.
 *
 * Ce que la direction apporte reste à l'agence. MAV, 27/10 : la direction voit
 * « ce que garde l'agence » — les honoraires moins les parts des agents co.
 */

export const TRANCHES: { jusqua: number; taux: number }[] = [
  { jusqua: 150_000, taux: 0.5 },
  { jusqua: 300_000, taux: 0.55 },
  { jusqua: Infinity, taux: 0.6 },
];

/** La part de l'agent sur `ca` € HT générés, son cumul de l'année étant `cumul` avant. */
export function partAgent(ca: number, cumul: number): number {
  let part = 0;
  let bas = Math.max(0, cumul);
  let reste = Math.max(0, ca);
  for (const t of TRANCHES) {
    if (reste <= 0) break;
    const place = t.jusqua - bas;
    if (place <= 0) continue;
    const tranche = Math.min(reste, place);
    part += tranche * t.taux;
    reste -= tranche;
    bas += tranche;
  }
  return part;
}

export type Repartition = {
  /** La part de chaque agent co, par identifiant d'agent. */
  parts: Map<string, number>;
  /** Ce que garde l'agence. */
  agence: number;
  /** Le CA HT que chaque agent co génère sur cette affaire (pour son cumul). */
  generes: Map<string, number>;
};

/**
 * Répartit les honoraires HT d'une vente. `estAgentCo` dit qui est agent
 * commercial (rémunéré au barème) ; les autres — la direction, un apport
 * inconnu — laissent leur moitié à l'agence.
 */
export function repartir(o: {
  honos: number;
  agentAffaire?: string;
  agentAcheteur?: string;
  estAgentCo: (agentId: string) => boolean;
  cumuls: Map<string, number>;
}): Repartition {
  const generes = new Map<string, number>();
  for (const a of [o.agentAffaire, o.agentAcheteur]) {
    if (a && o.estAgentCo(a)) generes.set(a, (generes.get(a) ?? 0) + o.honos / 2);
  }
  const parts = new Map<string, number>();
  for (const [a, ca] of generes) parts.set(a, partAgent(ca, o.cumuls.get(a) ?? 0));
  const verse = [...parts.values()].reduce((s, x) => s + x, 0);
  return { parts, agence: o.honos - verse, generes };
}
