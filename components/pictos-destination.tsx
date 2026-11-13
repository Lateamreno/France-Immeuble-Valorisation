/**
 * Les pictos de destination d'un lot ou d'une recherche — UNE source pour tout
 * le BO (retour #444, MAV, 28/09) : « Logement une maison, Commerce un panier,
 * Bureau une mallette, Entrepôt un bâtiment industriel. J'aimerais que tu
 * appliques ces changements sur tous les endroits où on utilise ces pictos,
 * notamment l'état locatif. »
 *
 * Quatre jeux de dessins vivaient chacun dans leur écran (état locatif, prix,
 * estimation, dossier, cartes de recherche) et ne disaient pas la même chose
 * du même mot. Les tracés sont des contours (stroke), à poser dans un
 * `<svg viewBox="0 0 24 24">` dont le style fixe le trait.
 */
import type { ReactNode } from "react";

export const PICTOS_DEST: Record<string, ReactNode> = {
  /* Une maison : le toit, les murs, la porte. */
  Logement: <><path d="M3.5 11.5 12 4l8.5 7.5" /><path d="M6 10v10h12V10" /><path d="M10 20v-5.5h4V20" /></>,
  /* Un panier : l'anse, la corbeille évasée, deux traits de vannerie. */
  Commerce: <><path d="M3.5 10h17l-1.6 9.2a1.5 1.5 0 0 1-1.5 1.3H6.6a1.5 1.5 0 0 1-1.5-1.3z" /><path d="M8 10 12 4l4 6" /><path d="M9.5 14v3.5M12 14v3.5M14.5 14v3.5" /></>,
  /* Une mallette : le corps, la poignée, le fermoir. */
  Bureau: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2" /><path d="M3 13h18" /><path d="M11 13v2h2v-2" /></>,
  /* Un bâtiment industriel : la toiture en dents de scie et la cheminée. */
  Logistique: <><path d="M3 20V9l5 3V9l5 3V9l5 3v8z" /><path d="M18.5 12V5h2.5v8" /><path d="M3 20h18" /><path d="M7 20v-4h3v4M13 20v-4h3v4" /></>,
  /* Une voûte, pas un toit : la cave et l'entrepôt portaient le même dessin à
     un détail près (retour #249). */
  Cave: <><path d="M4 20.5V12a8 8 0 0 1 16 0v8.5" /><path d="M8.5 20.5V12a3.5 3.5 0 0 1 7 0v8.5" /><path d="M2.5 20.5h19" /></>,
  Parking: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M10 16V9h3a2.5 2.5 0 0 1 0 5h-3" /></>,
  Annexe: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 12h6" /></>,
};

/**
 * Les mêmes, en plein (retour MAV du 26/10 sur l'état locatif : « les pictos
 * en plein plutôt qu'en trait pour le type de lot », comme le BO Bubble).
 * À dessiner dans un `.destic.plein` : le fond prend la couleur, les détails
 * (anse, poignée, lettre P) gardent leur trait ou se découpent en blanc.
 */
const DETAIL = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ENCRE = { fill: "none", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const PICTOS_DEST_PLEIN: Record<string, ReactNode> = {
  Logement: <path d="M12 3.2 2.6 11.4h2.6V21h5.2v-5.6h3.2V21h5.2v-9.6h2.6z" />,
  Commerce: <><path d="M3 10h18l-1.9 9.7A1.7 1.7 0 0 1 17.4 21H6.6a1.7 1.7 0 0 1-1.7-1.3z" /><path d="M8 10 12 4l4 6" {...DETAIL} /></>,
  Bureau: <><rect x="2.5" y="8" width="19" height="12.5" rx="2" /><path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2" {...DETAIL} /><path d="M2.5 13.5h19" {...ENCRE} /></>,
  Logistique: <><path d="M2.5 20.5V9l5 3V9l5 3V9l5 3V4.5h3v16z" /></>,
  Cave: <path fillRule="evenodd" d="M3.5 21V12a8.5 8.5 0 0 1 17 0v9zM9 21v-8.5a3 3 0 0 1 6 0V21z" />,
  Parking: <><circle cx="12" cy="12" r="9.5" /><path d="M10 16.5v-9h3a2.6 2.6 0 0 1 0 5.2h-3" {...ENCRE} /></>,
  Annexe: <><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M8.5 12h7" {...ENCRE} /></>,
};

/**
 * Les quatre destinations qu'une recherche vise, dans l'ordre de MAV. Les
 * parkings « ne font pas partie des critères de recherche de toute façon ».
 */
export const DESTINATIONS_RECHERCHE: { cle: string; titre: string; d: ReactNode }[] = [
  { cle: "Logement", titre: "Logement", d: PICTOS_DEST.Logement },
  { cle: "Commerce", titre: "Commerce", d: PICTOS_DEST.Commerce },
  { cle: "Bureau", titre: "Bureau", d: PICTOS_DEST.Bureau },
  { cle: "Logistique", titre: "Entrepôt", d: PICTOS_DEST.Logistique },
];
