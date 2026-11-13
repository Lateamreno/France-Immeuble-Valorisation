/**
 * Une ville de recherche, nommée sans ambiguïté (MAV, 13/11) : « quand
 * j'ajoute la ville de Saint-Denis, c'est cette ville et pas une autre. Si j'ai
 * choisi Saint-Denis 974, c'est Saint-Denis 974. »
 *
 * La recherche garde une liste de textes (`villes`, format hérité de Bubble).
 * Une ville choisie dans les prédictions s'y écrit avec son département :
 * « Saint-Denis (93) ». C'est lisible tel quel partout où la liste s'affiche
 * (carte de recherche, compte du site, mailing), et le matching sait la lire :
 * même nom ET même département.
 *
 * Les villes saisies avant, sans département, gardent la règle d'avant
 * (« Saint-Denis » vaut pour toutes les Saint-Denis) : on ne devine pas après
 * coup laquelle l'agent voulait.
 */

const MOTIF = /^(.+?)\s*\((\d{2,3}|2[AB])\)$/i;

/** « Saint-Denis » + « 93 » → « Saint-Denis (93) ». */
export const etiquetteVille = (nom: string, departement: string) => `${nom.trim()} (${departement.trim().toUpperCase()})`;

/** « Saint-Denis (93) » → { nom: « Saint-Denis », departement: « 93 » } ; sans département, departement absent. */
export function lireVille(v: string): { nom: string; departement?: string } {
  const m = MOTIF.exec(v.trim());
  return m ? { nom: m[1].trim(), departement: m[2].toUpperCase() } : { nom: v.trim() };
}

/** Comparaison à plat : accents, traits d'union, apostrophes et casse ne comptent pas. */
export const aPlatVille = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’'`-]/g, " ").replace(/\s+/g, " ").trim();

/**
 * La ville de la recherche désigne-t-elle la ville de l'immeuble ?
 * - avec département : même nom (à plat) et même département ;
 * - sans département (saisie ancienne) : la règle d'avant, nom égal ou contenu.
 */
export function memeVille(entree: string, villeBien: string | undefined, dptBien: string | undefined): boolean {
  const bien = aPlatVille(villeBien ?? "");
  if (!bien) return false;
  const { nom, departement } = lireVille(entree);
  const v = aPlatVille(nom);
  if (!v) return false;
  if (departement) {
    const d = (dptBien ?? "").replace(/^0/, "").toUpperCase();
    return v === bien && !!d && departement.replace(/^0/, "") === d;
  }
  return v === bien || v.includes(bien) || bien.includes(v);
}
