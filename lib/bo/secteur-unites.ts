/**
 * L'unité dans laquelle un marché se cote, destination par destination
 * (retours #269 et #270).
 *
 * MAV : « le loyer des commerces en général est affiché en loyer par m² par an
 * et pas par mois, donc je veux que la donnée que j'ai à rentrer pour les
 * bureaux, commerces et entrepôts soit le loyer annuel. Pour les logements,
 * caves et parkings ça reste un loyer par mois — d'ailleurs pour les caves
 * c'est un loyer par mois par cave et pas par m², pareil pour les parkings. »
 * Et : « pour les caves et parkings c'est prix par parking, pas prix par m². »
 *
 * Ce sont les conventions du métier, pas des préférences d'affichage : un
 * commerce se négocie à tant du mètre carré par an, une place de parking à
 * tant la place. Saisir dans la mauvaise unité fait passer un loyer pour douze
 * fois moins, ce qui se voit tout de suite sur le rendement.
 *
 * CE QUI EST STOCKÉ NE CHANGE PAS : la base garde un loyer MENSUEL, au m²
 * pour les destinations qui ont une surface, à l'unité pour les caves et les
 * parkings. Toute la chaîne de calcul — rendement, capitalisation, estimation,
 * dossier — continue de lire la même chose. Seules la saisie et l'affichage
 * passent dans l'unité du métier, par les deux fonctions du bas.
 */

/** Le loyer se cote à l'année, au m² : commerces, bureaux, entrepôts. */
const LOYER_ANNUEL = new Set(["Commerce", "Bureau", "Logistique"]);

/** Ces lots se comptent et se cotent à l'unité, jamais au m². */
const AU_LOT: Record<string, string> = { Cave: "cave", Parking: "place" };

export type UniteSecteur = {
  /** Le loyer se saisit à l'année plutôt qu'au mois. */
  loyerAnnuel: boolean;
  /** Le prix et le loyer portent sur un lot entier, pas sur un m². */
  parLot: boolean;
  /** « place », « cave » — le mot qui suit « par ». Vide hors de ce cas. */
  lot: string;
  loyerUnite: string;
  prixUnite: string;
  /** Ce qu'on écrit sous le champ pour lever toute ambiguïté. */
  loyerAide?: string;
};

export function uniteSecteur(destination: string): UniteSecteur {
  const lot = AU_LOT[destination] ?? "";
  if (lot) {
    return {
      loyerAnnuel: false, parLot: true, lot,
      loyerUnite: `€/mois par ${lot}`,
      prixUnite: `€ par ${lot}`,
      loyerAide: `Une ${lot} se loue au mois et se vend à l'unité : ni l'un ni l'autre ne se rapporte à une surface.`,
    };
  }
  if (LOYER_ANNUEL.has(destination)) {
    return {
      loyerAnnuel: true, parLot: false, lot: "",
      loyerUnite: "€/m²/an",
      prixUnite: "€/m²",
      loyerAide: "Les baux commerciaux se négocient au m² par an : c'est le loyer annuel qui se saisit ici.",
    };
  }
  return { loyerAnnuel: false, parLot: false, lot: "", loyerUnite: "€/m²/mois", prixUnite: "€/m²" };
}

/** De ce qui est stocké (mensuel) vers ce que l'agent lit et saisit. */
export const loyerAffiche = (stocke: number | undefined, destination: string) =>
  stocke === undefined ? undefined : uniteSecteur(destination).loyerAnnuel ? stocke * 12 : stocke;

/** De ce que l'agent a saisi vers ce qu'on stocke (mensuel). */
export const loyerStocke = (saisi: number | undefined, destination: string) =>
  saisi === undefined ? undefined : uniteSecteur(destination).loyerAnnuel ? saisi / 12 : saisi;

/* --- Les annonces de caves et de parkings (retour #270) ------------------- */

const slug = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Les liens vers les annonces de caves et de parkings de la commune.
 *
 * MAV : « tu me mets un lien leboncoin et un lien seloger pour me montrer les
 * annonces de parking dans la ville ». Aucun des deux sites ne publie de prix
 * au m² pour ces lots — il n'y en a pas — donc la seule référence disponible
 * est le marché lui-même, annonce par annonce.
 *
 * Deux URL de formes différentes, et c'est assumé : leboncoin accepte une
 * recherche par mot-clé restreinte à la commune, SeLoger range ses annonces
 * par ville et par nature d'opération. Sur SeLoger, le mot « parking » se
 * choisit donc dans les filtres de la page plutôt que dans l'adresse : mieux
 * vaut une page juste où il reste un clic à faire qu'une URL inventée qui
 * ouvre une liste vide sans dire pourquoi.
 */
export function annoncesLot(
  destination: string,
  lieu: { ville?: string | null; cp?: string | null },
  quoi: "vente" | "location",
): { cle: string; label: string; href: string }[] {
  if (!uniteSecteur(destination).parLot) return [];
  const ville = (lieu.ville ?? "").trim();
  const cp = (lieu.cp ?? "").trim();
  if (!ville) return [];
  const mot = destination === "Cave" ? "cave" : "parking";
  const dep = cp.startsWith("97") || cp.startsWith("98") ? cp.slice(0, 3) : cp.slice(0, 2);
  return [
    {
      cle: "leboncoin", label: "leboncoin",
      href: `https://www.leboncoin.fr/recherche?category=${quoi === "location" ? "10" : "9"}`
        + `&text=${encodeURIComponent(mot)}`
        + `&locations=${encodeURIComponent(cp ? `${ville}_${cp}` : ville)}`,
    },
    {
      cle: "seloger", label: "SeLoger",
      href: `https://www.seloger.com/immobilier/${quoi === "location" ? "locations" : "achat"}/immo-${slug(ville)}${dep ? `-${dep}` : ""}/`,
    },
  ];
}
