/**
 * Quelles photos partent dans le dossier de vente (retour #322).
 *
 * MAV : « limite le nombre de pages de photos à 2. Par ailleurs dans les
 * photos tu autosélectionnes les 16 premières photos pour apparaître dans le
 * dossier. Quand 16 photos sont déjà sélectionnées et qu'on essaye d'en
 * sélectionner une autre, ça nous met un popup pour dire qu'il faut en
 * désélectionner. »
 *
 * Deux pages de huit : seize photos, pas dix-sept. Le dossier tronquait
 * silencieusement au-delà — l'agent cochait vingt photos et n'en voyait que
 * seize à l'impression, sans savoir lesquelles étaient tombées.
 *
 * L'autosélection ne s'écrit PAS en base : rien ne doit modifier la fiche
 * parce qu'on a simplement ouvert un écran. Elle est donc *implicite* — tant
 * que personne n'a coché quoi que ce soit, la sélection est « les seize
 * premières », et c'est cette même règle qui sert l'écran Photos, le compteur
 * et l'impression. Au premier clic de l'agent, l'écran matérialise la
 * sélection implicite en cases réellement cochées : à partir de là, c'est lui
 * qui décide, et l'ordre des photos ne rebat plus les cartes derrière lui.
 */

export const MAX_PHOTOS_DOSSIER = 16;
export const PHOTOS_PAR_PAGE = 8;

/**
 * Ce qui n'est pas une photo du bien : la principale a sa propre page de
 * couverture, les captures de cadastre, de carte et de vue de rue sont des
 * pièces de travail (retour #179).
 */
export const HORS_DOSSIER = new Set(["Principale", "Cadastre", "Carte", "Vue de rue"]);

export type PhotoDossier = {
  id: string;
  type?: string;
  ordre: number;
  dossier: boolean;
};

/** Les photos qui peuvent prétendre au dossier, dans l'ordre d'impression. */
export function eligiblesDossier<T extends PhotoDossier>(photos: T[]): T[] {
  return photos
    .filter((p) => !HORS_DOSSIER.has(p.type ?? ""))
    .slice()
    .sort((a, b) => a.ordre - b.ordre);
}

/**
 * La sélection effective, plafonnée à seize.
 *
 * `auto` dit si elle vient du défaut (personne n'a encore coché) ou d'un choix
 * de l'agent : l'écran s'en sert pour expliquer ce qu'il montre.
 */
export function selectionDossier<T extends PhotoDossier>(
  photos: T[],
): { retenues: T[]; auto: boolean } {
  const eligibles = eligiblesDossier(photos);
  const cochees = eligibles.filter((p) => p.dossier);
  if (cochees.length > 0) {
    return { retenues: cochees.slice(0, MAX_PHOTOS_DOSSIER), auto: false };
  }
  return { retenues: eligibles.slice(0, MAX_PHOTOS_DOSSIER), auto: true };
}

/** Le nombre de pages de photos qu'imprimera le dossier : 0, 1 ou 2. */
export const pagesPhotos = (n: number) =>
  Math.min(2, Math.ceil(Math.min(n, MAX_PHOTOS_DOSSIER) / PHOTOS_PAR_PAGE));
