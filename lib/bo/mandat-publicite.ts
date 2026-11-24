/**
 * Ce que le mandat dit de la publicité, selon le réglage « Publication en
 * ligne » de la fiche (`publication_web_yn`).
 *
 * MAV, 23/11/26 : « j'ai rédigé un mandat simple sans pub mais je vois toujours
 * la mention pouvoir de mettre de la publicité sur tout support ». Le document
 * imprimé ne lisait pas le réglage : la ligne des pouvoirs était écrite en dur,
 * alors que l'écran promettait une commercialisation confidentielle. Les deux
 * phrases qui parlent de publicité sortent désormais d'ici.
 *
 * Fichier pur, sans import : c'est ce qui le rend testable.
 */

export type ClausesPublicite = {
  /** La ligne des « pouvoirs conférés » au mandataire. */
  pouvoir: string;
  /** La fin de la ligne « remettre les pièces », côté mandant. */
  piecesSansLesquelles: string;
};

export function clausesPublicite(enLigne: boolean): ClausesPublicite {
  if (enLigne) {
    return {
      pouvoir: "Engager toute publicité sur tout support à sa convenance, les frais restant à sa charge.",
      piecesSansLesquelles: "sans lesquels aucune publicité ne peut être engagée",
    };
  }
  return {
    // Pas de « son seul fichier d'acquéreurs » : la ligne du dessus l'autorise à
    // proposer le bien « à toute personne de son choix », celle du dessous à
    // requérir un confrère. Le mandat interdit l'annonce, pas la présentation.
    // Une phrase, pas trois : la page des obligations n'a que quatre lignes de
    // marge avant son pied (mesuré sur le mandat n° 2121 et le banc d'essai).
    pouvoir: "Commercialiser le bien sans publicité : sauf accord écrit du Mandant, le Mandataire s’interdit toute annonce, "
      + "sur son site internet, sur les portails immobiliers comme sur tout autre support.",
    piecesSansLesquelles: "sans lesquels le bien ne peut être présenté",
  };
}
