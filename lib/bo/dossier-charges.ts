/**
 * Le tableau des charges de la page « État financier », quand il est long.
 *
 * Décidé par MAV le 20/11/26, sur le dossier d'Argenteuil dont douze lignes de
 * charges poussaient le tableau « Rendement » hors de la page :
 *  1. d'abord resserrer les lignes, sans toucher aux polices ;
 *  2. au-delà de treize charges, ne garder sur la page que les taxes (foncière,
 *     bureaux, balayage…) et réunir le reste sur une ligne qui dit combien de
 *     postes elle additionne ;
 *  3. et donner alors le détail complet sur une page à la suite.
 */
import { TAXES } from "../referentiels";

export type LigneCharge = {
  type: string; total?: number; recup?: number; nonRecup?: number; postes?: number;
  /** Décidé sur le type d'origine, avant qu'une précision n'allonge le libellé. */
  taxe?: boolean;
};

/**
 * Le nom imprimé d'une charge : son type, précisé quand l'agent l'a nommée
 * (« Entretien — chaudière »). Une ligne « Autre » précisée ne garde que sa
 * précision : « Autre — gardiennage » n'apprend rien de plus que « Gardiennage ».
 */
export function nomCharge(type: string, precision?: string): string {
  const p = (precision ?? "").trim();
  if (!p) return type || "Charge";
  return !type || type === "Autre" ? p.charAt(0).toUpperCase() + p.slice(1) : `${type} — ${p}`;
}

/** Jusqu'à treize charges, tout tient sur la page une fois les lignes resserrées. */
export const SEUIL_REPLI = 13;
/** Lignes de revenus et de charges que la page porte à l'interligne normal (mesuré : 5 + 2). */
const LIGNES_A_L_AISE = 7;
/** Lignes que la page de détail porte à l'interligne normal. */
const DETAIL_A_L_AISE = 22;

export const estUneTaxe = (type: string) => TAXES.has(type) || /taxe|balayage|imp[ôo]t/i.test(type);

const somme = (l: LigneCharge[], k: "total" | "recup" | "nonRecup") =>
  l.some((c) => c[k] !== undefined) ? l.reduce((s, c) => s + (c[k] ?? 0), 0) : undefined;

export function chargesDuDossier(charges: LigneCharge[], nbRevenus: number): {
  /** Ce que la page « État financier » imprime. */
  lignes: LigneCharge[];
  /** Vrai : la page resserre ses lignes pour tenir. */
  tasse: boolean;
  /** Le détail complet, sur sa propre page — seulement quand la page a regroupé. */
  detail?: { lignes: LigneCharge[]; tasse: boolean };
} {
  if (charges.length <= SEUIL_REPLI) {
    return { lignes: charges, tasse: charges.length + nbRevenus > LIGNES_A_L_AISE };
  }
  const taxe = (c: LigneCharge) => c.taxe ?? estUneTaxe(c.type);
  const taxes = charges.filter(taxe);
  const autres = charges.filter((c) => !taxe(c));
  const lignes: LigneCharge[] = autres.length
    ? [...taxes, { type: "Autres charges", postes: autres.length, total: somme(autres, "total"), recup: somme(autres, "recup"), nonRecup: somme(autres, "nonRecup") }]
    : taxes;
  return {
    lignes,
    tasse: lignes.length + nbRevenus > LIGNES_A_L_AISE,
    detail: { lignes: charges, tasse: charges.length > DETAIL_A_L_AISE },
  };
}
