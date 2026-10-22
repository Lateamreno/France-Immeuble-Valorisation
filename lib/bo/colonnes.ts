// Où un immeuble atterrit sur le dashboard après un envoi.
//
// Module à part, et sans directive serveur, pour deux raisons : `lib/bo/actions.ts`
// porte "use server" et n'a donc pas le droit d'exporter autre chose que des
// fonctions asynchrones, et cette règle mérite d'être vérifiable seule — c'est
// elle qui décide de la colonne où MAV verra le bien le lendemain matin.

/** Les libellés exacts du miroir Bubble. Le rang est en tête de la chaîne. */
export const STATUT_AB = "5 - Commercialisé (A/B)";
export const STATUT_TOUS = "6 - Commercialisé (all)";

/** Le rang d'un statut : « 6 - Commercialisé (all) » → 6. */
export function rangStatut(statut: string | undefined): number {
  return parseInt(String(statut ?? "").split(" ")[0], 10) || 0;
}

/**
 * La colonne du dashboard où l'immeuble doit atterrir après un envoi, ou
 * `null` s'il n'a pas à bouger.
 *
 * MAV : « quand on envoie au A et au B ça passe dans la deuxième colonne de
 * commercialisation, et quand on envoie au C et au D ça passe dans la
 * dernière ». C'est la lecture même du tableau : on montre d'abord aux
 * meilleurs clients, et le bien ne descend dans « tous les clients » que le
 * jour où on l'ouvre au-delà.
 *
 * Deux garde-fous qui comptent autant que la règle :
 *
 *   • un acquéreur SANS grade compte comme « tous les clients ». Ne pas le
 *     faire laisserait un bien largement diffusé afficher « A/B », et on
 *     relancerait une diffusion déjà faite ;
 *
 *   • on n'avance jamais à reculons. Un bien déjà en « tous clients », ou passé
 *     sous offre, au compromis, vendu, ne redescend pas parce qu'on a écrit à
 *     deux clients A. Le statut ne fait que monter.
 */
export function colonneApres(
  statutActuel: string | undefined,
  notes: (string | undefined)[],
): string | null {
  const rang = rangStatut(statutActuel);
  // Au-delà de la commercialisation (offre, compromis, acte, vente) : on ne
  // touche à rien. Une relance ne fait pas ressortir un bien sous compromis.
  if (rang >= 7) return null;
  const tous = notes.some((n) => !n || n === "C" || n === "D");
  const vise = tous ? 6 : 5;
  if (rang >= vise) return null;
  return vise === 6 ? STATUT_TOUS : STATUT_AB;
}
