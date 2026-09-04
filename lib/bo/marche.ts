/**
 * Le prix d'un immeuble face à son marché (retours #324, #326).
 *
 * Les quatre méthodes de la maison — rendement sur loyers actuels, rendement
 * sur loyers potentiels, prix au m² du secteur, prix au m² plus travaux — et
 * le tableau « Actuel / Potentiel » qui dit de combien on s'écarte du secteur,
 * vivaient jusqu'ici tout entiers dans l'écran d'estimation.
 *
 * MAV a demandé le même curseur et le même tableau dans la recherche
 * d'acquéreurs : « mets juste une barre défilante avec le même tableau
 * actuel/potentiel que d'habitude, pour voir le prix en fonction de ce que ça
 * donne par rapport au marché ». Recopier le calcul aurait garanti qu'un jour
 * les deux écrans annoncent deux rendements différents pour le même immeuble.
 * Il est donc ici, une fois, et les deux écrans le lisent.
 *
 * Rien dans ce fichier ne touche à React ni à la base : ce sont des fonctions
 * pures, testables et utilisables des deux côtés.
 */

import { loyerStocke } from "./secteur-unites";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Préfixe des colonnes de référence du secteur, par destination. */
export const DEST_PREFIX: Record<string, string> = {
  Logement: "hab", Commerce: "com", Bureau: "bur", Parking: "parking", Cave: "cave",
};

export type LigneDest = {
  dest: string;
  lots: number;
  surface: number;
  /** Surface effectivement louée — le dénominateur du loyer actuel au m². */
  surfaceOcc: number;
  /** Loyers annuels en cours. */
  loyer: number;
  /** Loyers annuels potentiels. */
  max: number;
};

export type AggLocatif = {
  lots: number;
  carrez: number;
  carrezOcc: number;
  loyersAn: number;
  loyersMaxAn: number;
  occupation: number;
  destinations: string[];
  parDest: LigneDest[];
};

/** L'état locatif agrégé, tel que le prix le consomme. */
export function aggLocatif(lots: Record<string, unknown>[]): AggLocatif {
  const dests = [...new Set(lots.map((l) => String(l.Destination ?? "")).filter(Boolean))];
  const occ = lots.filter((l) => (num(l.loyer) ?? 0) > 0);
  return {
    lots: lots.length,
    carrez: lots.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0),
    carrezOcc: occ.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0),
    loyersAn: lots.reduce((s, l) => s + (num(l.loyer) ?? 0), 0) * 12,
    loyersMaxAn: lots.reduce((s, l) => s + (num(l.loyer_max) ?? num(l.loyer) ?? 0), 0) * 12,
    occupation: lots.length ? Math.round((occ.length / lots.length) * 100) : 0,
    destinations: dests,
    parDest: dests.map((d) => {
      const ls = lots.filter((l) => String(l.Destination ?? "") === d);
      return {
        dest: d,
        lots: ls.length,
        surface: ls.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0),
        surfaceOcc: ls.filter((l) => (num(l.loyer) ?? 0) > 0)
          .reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0),
        loyer: ls.reduce((s, l) => s + (num(l.loyer) ?? 0), 0) * 12,
        max: ls.reduce((s, l) => s + (num(l.loyer_max) ?? num(l.loyer) ?? 0), 0) * 12,
      };
    }),
  };
}

export type RefsMarche = { loyer: number; prix: number; renta: number };

/**
 * Les références du secteur, pondérées par les surfaces.
 *
 * Le loyer se stocke au mois ; les commerces se saisissent à l'année (#269).
 * Tout revient au mois avant d'être pondéré, sinon un commerce pèse douze fois
 * son poids. Le rendement global se déduit — il ne se saisit pas.
 */
export function refsGlobales(
  secteur: Record<string, unknown> | undefined,
  parDest: LigneDest[],
): RefsMarche {
  const s = secteur ?? {};
  let sl = 0, sp = 0, st = 0;
  for (const d of parDest) {
    if (d.surface <= 0) continue;
    const px = DEST_PREFIX[d.dest] ?? "autre";
    const l = loyerStocke(num(s[`${px}_loyer_retenu`]) ?? num(s["0 - loyer_mois"]), d.dest);
    const p = num(s[`${px}_prix_retenu`]) ?? num(s["0 - prix"]);
    if (l === undefined && p === undefined) continue;
    st += d.surface; sl += (l ?? 0) * d.surface; sp += (p ?? 0) * d.surface;
  }
  const loyer = st > 0 && sl > 0 ? sl / st : num(s["0 - loyer_mois"]) ?? 0;
  const prix = st > 0 && sp > 0 ? sp / st : num(s["0 - prix"]) ?? 0;
  const renta = loyer > 0 && prix > 0 ? (loyer * 12 * 100) / prix : num(s["0 - renta _%"]) ?? 0;
  return { loyer, prix, renta };
}

export type PistesPrix = {
  /** Combien de méthodes ont abouti. */
  nbCandidates: number;
  /** Le plus bas et le plus haut des prix obtenus, 0 s'il n'y en a aucun. */
  mini: number;
  maxi: number;
  /** Leur moyenne, arrondie au millier : le prix proposé par défaut. */
  auto: number;
  /** Bornes du curseur, élargies de 10 % pour laisser de l'arbitrage. */
  bornes: { min: number; max: number } | null;
  /** Le prix qui met l'immeuble au rendement du secteur, loyers en cours. */
  pRendement: number;
  /** Le prix qui met l'immeuble au rendement du secteur, loyers potentiels. */
  pRendementMax: number;
  /** Le prix qui met l'immeuble au prix du m² du secteur. */
  pM2: number;
  /** Le même, travaux compris. */
  pM2Max: number;
};

export function pistesPrix(agg: AggLocatif, refs: RefsMarche, travaux: number): PistesPrix {
  const pRendement = refs.renta > 0 ? agg.loyersAn / (refs.renta / 100) : 0;
  const pRendementMax = refs.renta > 0 ? agg.loyersMaxAn / (refs.renta / 100) : 0;
  const pM2 = agg.carrez * refs.prix;
  const pM2Max = agg.carrez * refs.prix + travaux;
  const candidates = [pRendement, pRendementMax, pM2, pM2Max].filter((x) => x > 0);
  const auto = candidates.length
    ? Math.round(candidates.reduce((s, x) => s + x, 0) / candidates.length / 1000) * 1000
    : 0;
  const mini = candidates.length > 0 ? Math.min(...candidates) : 0;
  const maxi = candidates.length > 0 ? Math.max(...candidates) : 0;
  let bornes: { min: number; max: number } | null = null;
  if (candidates.length > 0) {
    const min = Math.floor((mini * 0.9) / 5000) * 5000;
    const max = Math.ceil((maxi * 1.1) / 5000) * 5000;
    bornes = { min, max: Math.max(max, min + 5000) };
  }
  return {
    nbCandidates: candidates.length, mini, maxi,
    auto, bornes, pRendement, pRendementMax, pM2, pM2Max,
  };
}

/** L'écart en pourcentage à une référence, 0 quand la référence manque. */
export const ecartRef = (v: number, ref: number) =>
  ref > 0 ? Math.round(((v - ref) / ref) * 100) : 0;

/** Loyer actuel au m² : sur la surface LOUÉE, pas sur la surface totale. */
export const loyerM2Actuel = (agg: AggLocatif) =>
  agg.carrezOcc > 0 ? agg.loyersAn / 12 / agg.carrezOcc : 0;

/** Loyer potentiel au m² : sur toute la surface, puisque tout serait loué. */
export const loyerM2Potentiel = (agg: AggLocatif) =>
  agg.carrez > 0 ? agg.loyersMaxAn / 12 / agg.carrez : 0;
