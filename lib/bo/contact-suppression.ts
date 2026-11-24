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
      + "elle est seulement retirée des listes, pour ne pas perdre cet historique — et elle ne reçoit plus aucun dossier."
    : "La fiche sort de la liste et de la recherche des contacts, ses recherches sont retirées et ses relances coupées : "
      + "elle ne reçoit plus aucun dossier. Elle est gardée avec son motif, l’historique reste lisible, "
      + "et elle se retrouve sous « Contacts supprimés ».";
}

/* ------------------------------------------------------------------------
   Un contact supprimé ne reçoit plus rien (MAV, 23/11 : « il ne faut pas
   qu'elle continue à recevoir les recherches, surtout pas »).

   Deux verrous. À la suppression, ses recherches encore actives sont retirées
   et les relances de ses propositions coupées — avec une marque, pour que
   « Rétablir » rende exactement ce qui a été retiré, et rien de plus. Et à la
   lecture, le matching et les relances écartent tout contact supprimé, même
   si une recherche avait échappé au premier verrou.
   ------------------------------------------------------------------------ */

export const MOTIF_RECHERCHE_CONTACT_SUPPRIME = "Contact supprimé";

type Doc = { id: string; data: Record<string, unknown> };

/** Les recherches à retirer avec le contact : celles qui ne le sont pas déjà. */
export function recherchesARetirer(recherches: Doc[]): string[] {
  return recherches.filter((r) => r.data.archived !== true).map((r) => r.id);
}

/** Les propositions dont il faut couper les relances : envoyées, pas déjà coupées. */
export function relancesACouper(propositions: Doc[]): string[] {
  return propositions
    .filter((p) => String(p.data.Statut ?? "") === "Envoyée" && p.data.stop_relances_yn !== true)
    .map((p) => p.id);
}

/** Au rétablissement : seulement ce que la suppression avait elle-même retiré. */
export function recherchesARendre(recherches: Doc[]): string[] {
  return recherches.filter((r) => r.data.archived === true && r.data.retiree_avec_contact === true).map((r) => r.id);
}
export function relancesARendre(propositions: Doc[]): string[] {
  return propositions.filter((p) => p.data.stop_relances_yn === true && p.data.relances_coupees_avec_contact === true).map((p) => p.id);
}

/** Le contact est-il supprimé (retiré des listes) ? */
export const contactSupprime = (c: Record<string, unknown> | undefined | null) => c?.archived === true;
