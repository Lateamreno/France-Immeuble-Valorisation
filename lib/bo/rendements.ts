// Rendements d'un immeuble à un prix donné.
//
// Les mêmes formules que celles figées dans les estimations (voir
// createEstimation) : un prix affiché sur la fiche et un prix figé dans un
// dossier doivent donner exactement les mêmes chiffres, sinon le vendeur
// tombe sur deux vérités.

export type ContexteRendement = {
  /** Loyers HC annuels encaissés aujourd'hui. */
  loyers: number;
  /** Loyers HC annuels une fois tout reloué au potentiel. */
  loyersMax: number;
  /** Charges annuelles non récupérables. */
  charges: number;
  /** Travaux à prévoir (bâti + lots). */
  travaux: number;
  /** Surface Carrez totale. */
  surface: number;
  /** Surface Carrez des lots occupés — pour un loyer au m² qui veut dire quelque chose. */
  surfaceOccupee: number;
};

export type Colonne = {
  loyerM2?: number;
  prixM2?: number;
  brut?: number;
  net?: number;
  acteEnMain?: number;
};

const pc = (x: number) => Math.round(x * 1000) / 10;

/**
 * Les deux colonnes du tableau : ce que l'immeuble rapporte aujourd'hui, et
 * ce qu'il rapporterait une fois reloué et les travaux faits.
 *
 * Le « acte en main » ajoute 7,5 % de frais d'acquisition, comme le BO.
 */
export function rendements(hai: number, c: ContexteRendement): { actuel: Colonne; potentiel: Colonne } {
  const haiTravaux = hai + c.travaux;
  const col = (loyers: number, prix: number, surfaceLoyer: number): Colonne => ({
    loyerM2: surfaceLoyer > 0 && loyers > 0 ? Math.round((loyers / 12 / surfaceLoyer) * 10) / 10 : undefined,
    prixM2: c.surface > 0 && prix > 0 ? Math.round(prix / c.surface) : undefined,
    brut: prix > 0 ? pc(loyers / prix) : undefined,
    net: prix > 0 ? pc((loyers - c.charges) / prix) : undefined,
    acteEnMain: prix > 0 ? pc((loyers - c.charges) / (prix * 1.075)) : undefined,
  });
  return {
    actuel: col(c.loyers, hai, c.surfaceOccupee || c.surface),
    potentiel: col(c.loyersMax, haiTravaux, c.surface),
  };
}

/** Écart en % d'une valeur par rapport à la référence de secteur. */
export function ecart(valeur?: number, reference?: number) {
  if (valeur === undefined || !reference) return undefined;
  return Math.round(((valeur - reference) / reference) * 100);
}
