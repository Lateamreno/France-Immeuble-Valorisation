/**
 * La disposition des cadres de signature, selon le nombre de signataires
 * (le mandataire compris).
 *
 * MAV, 23/11/26 : sur le banc d'essai, un mandat à quatre mandants — cinq
 * signataires — rangeait ses cadres sur trois lignes de deux, et le cinquième
 * passait sous le pied de page. La page « Mentions légales et signatures »
 * laisse la place de deux lignes de cadres de 30 mm, pas de trois.
 *
 * La règle : jusqu'à quatre signataires, deux colonnes comme avant. À partir
 * de cinq, trois colonnes : cinq ou six signataires tiennent sur deux lignes,
 * à la hauteur habituelle. Au-delà, les cadres rétrécissent pour que trois,
 * puis quatre lignes tiennent encore. Mesuré au navigateur sur le banc
 * d'essai (/mandat-essai). Aucun mandat réel n'a plus de trois mandants à ce
 * jour.
 *
 * Fichier pur, sans import : c'est ce qui le rend testable.
 */

export type DispositionSignatures = {
  colonnes: 2 | 3;
  /** Hauteur du cadre où l'on signe, en millimètres. */
  cadreMm: number;
  /** Espace entre deux lignes de cadres, en millimètres. */
  ecartMm: number;
};

export function dispositionSignatures(signataires: number): DispositionSignatures {
  if (signataires <= 4) return { colonnes: 2, cadreMm: 30, ecartMm: 7 };
  if (signataires <= 6) return { colonnes: 3, cadreMm: 30, ecartMm: 7 };
  if (signataires <= 9) return { colonnes: 3, cadreMm: 17, ecartMm: 5 };
  return { colonnes: 3, cadreMm: 11, ecartMm: 4 };
}

/** Le nombre de lignes de cadres que cela fait. */
export const lignesDeSignatures = (signataires: number) =>
  Math.ceil(signataires / dispositionSignatures(signataires).colonnes);
