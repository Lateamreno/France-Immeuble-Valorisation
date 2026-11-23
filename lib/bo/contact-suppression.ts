/**
 * Supprimer un contact : corbeille ou simple retrait des listes ?
 *
 * MAV, 23/11/26 : « le formulaire pour supprimer un contact n'est pas complet
 * (la liste déroulante est bizarre). Par ailleurs ça ne supprime pas le
 * client, il ne disparaît pas après suppression. » Deux défauts : la fenêtre
 * proposait les motifs d'archivage d'un IMMEUBLE (« Ne souhaite pas vendre »,
 * « Mandat expiré »…), et une fiche supprimée restait dans la liste et dans la
 * recherche.
 *
 * La règle : un faux contact ou un essai auquel rien n'est rattaché part à la
 * corbeille (`bo_trash`, récupérable) — il n'y a rien à garder. Tout autre
 * contact est retiré des listes et gardé avec son motif, pour que l'historique
 * de ses propositions, de ses biens et de ses mandats reste lisible.
 *
 * Fichier pur, sans import : c'est ce qui le rend testable.
 */

export const MOTIF_SPAM = "Spam ou faux contact";
const MOTIF_ESSAI = "C'était un test";

/** Les motifs proposés pour un contact — pas ceux d'un immeuble. */
export const MOTIFS_SUPPRESSION_CONTACT = [
  MOTIF_SPAM, MOTIF_ESSAI, "Doublon", "Mauvaises coordonnées", "Autre",
];

/** Ce qui tient à une fiche contact. */
export type Attaches = {
  immeubles: number; recherches: number; propositions: number; mandats: number; suivis: number;
};

export const rienAttache = (a: Attaches) =>
  a.immeubles + a.recherches + a.propositions + a.mandats + a.suivis === 0;

/** Le motif demande-t-il la corbeille (s'il n'y a rien à garder) ? */
export const motifCorbeille = (motif: string) => motif === MOTIF_SPAM || motif === MOTIF_ESSAI;

export function destinSuppression(motif: string, a: Attaches): "corbeille" | "retrait" {
  return motifCorbeille(motif) && rienAttache(a) ? "corbeille" : "retrait";
}

/** Ce qui retient une fiche, en clair : « 2 propositions et 1 recherche ». */
export function ceQuiRetient(a: Attaches): string {
  const n = (k: number, un: string, plusieurs: string) => (k ? `${k} ${k > 1 ? plusieurs : un}` : "");
  const parts = [
    n(a.immeubles, "bien", "biens"), n(a.mandats, "mandat", "mandats"),
    n(a.propositions, "proposition", "propositions"), n(a.recherches, "recherche", "recherches"),
    n(a.suivis, "ligne de suivi", "lignes de suivi"),
  ].filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

/** Ce que la fenêtre annonce avant le clic. */
export function annonceSuppression(motif: string): string {
  return motifCorbeille(motif)
    ? "La fiche part à la corbeille : elle disparaît du BO. Si un bien, une recherche, une proposition ou un mandat lui est rattaché, "
      + "elle est seulement retirée des listes, pour ne pas perdre cet historique."
    : "La fiche sort de la liste et de la recherche des contacts. Elle est gardée avec son motif : l’historique de ses propositions "
      + "et de ses mandats reste lisible, et elle se retrouve sous « Contacts supprimés ».";
}
