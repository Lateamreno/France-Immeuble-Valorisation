/**
 * Le nombre d'étages d'un immeuble, déduit de son état locatif (retour #403).
 *
 * MAV : « il n'y a aucun endroit où on indique le nombre d'étages… il peut se
 * calculer automatiquement avec l'état locatif ». Chaque lot porte son étage
 * (« 0 », « RDC », « 3 », « -1 »…) : le plus haut étage habité est le nombre
 * d'étages sur rez-de-chaussée. Les valeurs aberrantes — un numéro de lot
 * tapé dans la case, « 112 » — sont ignorées plutôt que d'inventer une tour.
 */
export function etagesDepuisLots(lots: { etage?: unknown }[]): number | undefined {
  let max: number | undefined;
  for (const l of lots) {
    const v = etageDeLot(l.etage);
    if (v === undefined || v < 0 || v > 40) continue;
    if (max === undefined || v > max) max = v;
  }
  return max;
}

/** Un étage lisible en nombre : « RDC » et « rez » valent 0, « 2e » vaut 2. */
export function etageDeLot(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  if (/^(rdc|rez|rez-de-chauss[ée]e)$/.test(s)) return 0;
  const m = s.match(/^(-?\d{1,2})(?:er|e|ème|eme)?(?:\s*[ée]tage)?$/);
  return m ? Number(m[1]) : undefined;
}
