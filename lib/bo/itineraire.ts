/**
 * L'itinéraire Google Maps entre l'immeuble et un point d'intérêt.
 *
 * Retour #215 : « les liens ici c'est obligé que ce soit des liens Google Maps
 * depuis l'adresse de l'immeuble jusqu'au point d'intérêt en question. Ici il
 * faut que je remplisse à la main le nom de chaque item, la durée et le type de
 * moyen de locomotion. » Une recherche Google ouvrait une page de résultats :
 * il fallait ensuite retrouver le lieu, lancer l'itinéraire, revenir. Un
 * itinéraire ouvert d'un clic donne le nom ET la durée d'un coup — les deux
 * cases à remplir.
 *
 * Le même calcul sert aux deux écrans qui posent la question (l'onglet
 * Emplacement et la liste « ce qui reste à saisir »), pour qu'un lien ouvert
 * ici et là-bas mène exactement au même endroit.
 */

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Les moyens de locomotion du BO, et leur nom chez Google. */
const TRAJET: Record<string, string> = {
  "à pied": "walking",
  "en voiture": "driving",
  "en transport": "transit",
  "en transports": "transit",
  "à vélo": "bicycling",
};

export const MOYENS = ["à pied", "en voiture", "en transport", "à vélo"] as const;

/**
 * Les six points d'intérêt du BO, dans l'ordre de la page Emplacement.
 *
 * `label` est celui du dossier imprimé, `cherche` ce qu'on demande à Google
 * quand le point n'a pas encore de nom. Une seule table pour les trois écrans
 * qui les manipulent — l'onglet Emplacement, la liste des manques et le
 * dossier — sans quoi ils finissent par ne plus parler des mêmes lieux.
 */
export const POINTS = [
  { cle: "gare", label: "Trains", court: "Transports", cherche: "gare" },
  { cle: "bus", label: "Bus", court: "Bus", cherche: "arrêt de bus" },
  { cle: "route", label: "Axes routiers", court: "Axes routiers", cherche: "accès autoroute" },
  { cle: "school", label: "Ecoles", court: "Écoles", cherche: "école" },
  { cle: "com", label: "Commerces", court: "Commerces", cherche: "supermarché" },
  { cle: "autre", label: "Autres", court: "Autre", cherche: "commerces" },
] as const;

export const adresseImmeuble = (im: Record<string, unknown>) =>
  [S(im.adresse_numero_rue), S(im.adresse_rue), S(im.adresse_zipcode), S(im.adresse_ville)]
    .filter(Boolean).join(" ").trim();

export function itineraireGoogle(
  im: Record<string, unknown>,
  /** Le lieu visé : son nom saisi, à défaut le type cherché (« gare »). */
  vers: string,
  opts: { geo?: unknown; moyen?: string } = {},
): string {
  const ville = `${S(im.adresse_zipcode)} ${S(im.adresse_ville)}`.trim();
  /* Les coordonnées du point retenu priment sur son nom (retour #186) :
     « Carrefour Bordeaux » emmenait Google à l'hypermarché de la zone
     commerciale plutôt qu'au supermarché d'en face. */
  const cible = S(opts.geo) || `${vers} ${ville}`.trim();
  const mode = TRAJET[S(opts.moyen).trim().toLowerCase()] ?? "walking";
  return `https://www.google.com/maps/dir/?api=1`
    + `&origin=${encodeURIComponent(adresseImmeuble(im))}`
    + `&destination=${encodeURIComponent(cible)}`
    + `&travelmode=${mode}`;
}

/** « Itinéraire à pied », « Itinéraire en voiture » — le libellé du lien. */
export const libelleItineraire = (moyen?: string) =>
  `Itinéraire ${S(moyen).trim() || "à pied"}`;
