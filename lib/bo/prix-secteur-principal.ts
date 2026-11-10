// Le prix au m² du secteur à montrer dans le dossier (#615, MAV 10/11).
//
// « Il y a écrit prix des logements mais quand l'affectation c'est 100 % autre
// chose, on met l'affectation principale […] en général il faudra mettre le
// prix au m² de la chose la plus représentée en surface dans l'immeuble, sauf
// si les loyers habitation représentent plus de 50 % de l'immeuble : alors on
// laisse le prix des logements. »
//
// Module pur.

export type DestinationPrix = "Logement" | "Commerce" | "Bureau" | "Logistique";

const PREFIXE: Record<DestinationPrix, string> = { Logement: "hab", Commerce: "com", Bureau: "bur", Logistique: "log" };
export const LIBELLE_PRIX: Record<DestinationPrix, string> = {
  Logement: "Prix des logements",
  Commerce: "Prix des commerces",
  Bureau: "Prix des bureaux",
  Logistique: "Prix des locaux d'activité",
};

const nb = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** La destination qui fait l'immeuble, au sens du prix au m². */
export function destinationPrincipale(lots: Record<string, unknown>[]): DestinationPrix {
  const loyer = (l: Record<string, unknown>) => nb(l.loyer) || nb(l.loyer_max);
  const totalLoyers = lots.reduce((s, l) => s + loyer(l), 0);
  const loyersHab = lots.filter((l) => l.Destination === "Logement").reduce((s, l) => s + loyer(l), 0);
  if (totalLoyers > 0 && loyersHab / totalLoyers > 0.5) return "Logement";
  const surfaces = new Map<DestinationPrix, number>();
  for (const l of lots) {
    const d = String(l.Destination ?? "") as DestinationPrix;
    if (!PREFIXE[d]) continue; // caves, parkings, annexes : accessoires
    surfaces.set(d, (surfaces.get(d) ?? 0) + (nb(l.surface_carrez) || nb(l.surface_sol)));
  }
  const [premiere] = [...surfaces.entries()].sort((a, b) => b[1] - a[1]);
  return premiere && premiere[1] > 0 ? premiere[0] : "Logement";
}

/** Le libellé et la valeur : le prix RETENU du secteur pour cette destination, à défaut le prix d'ensemble. */
export function prixSecteurPrincipal(lots: Record<string, unknown>[], secteur: Record<string, unknown> | null) {
  const dest = destinationPrincipale(lots);
  const v = nb(secteur?.[`${PREFIXE[dest]}_prix_retenu`]) || nb(secteur?.["0 - prix"]);
  return { dest, libelle: LIBELLE_PRIX[dest], valeur: v || undefined, source: dest === "Logement" ? "Notaires" : "Secteur" };
}
