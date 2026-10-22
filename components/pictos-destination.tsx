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
 * Les quatre destinations qu'une recherche vise, dans l'ordre de MAV. Les
 * parkings « ne font pas partie des critères de recherche de toute façon ».
 */
export const DESTINATIONS_RECHERCHE: { cle: string; titre: string; d: ReactNode }[] = [
  { cle: "Logement", titre: "Logement", d: PICTOS_DEST.Logement },
  { cle: "Commerce", titre: "Commerce", d: PICTOS_DEST.Commerce },
  { cle: "Bureau", titre: "Bureau", d: PICTOS_DEST.Bureau },
  { cle: "Logistique", titre: "Entrepôt", d: PICTOS_DEST.Logistique },
];
