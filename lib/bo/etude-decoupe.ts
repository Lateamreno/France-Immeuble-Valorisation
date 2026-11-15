/**
 * Étude de vente à la découpe (MAV, 14-15/11/26) — le calcul, sans réseau.
 *
 * Les ventes DVF autour de l'immeuble, rangées par typologie de lot, donnent
 * un prix au m² du quartier ; multiplié par la surface de nos lots, il donne
 * la valeur de l'immeuble vendu lot par lot.
 *
 * Décisions de MAV :
 * - historique court : 6 mois, 12 au plus (« un an max, idéalement 6 mois ») ;
 * - rayon de 300 m au départ ;
 * - présentation par typologie (option A) ;
 * - ventes avec annexes gardées, mais signalées ;
 * - on écarte une vente, ou tout un immeuble (standing) ;
 * - libre ET occupé : l'occupé passe par un rendement type par typologie ;
 * - les ventes à la même adresse restent dans le calcul ;
 * - caves et parkings : DVF ne les distingue pas, ils se chiffrent au forfait.
 *
 * Ce module ne fait que calculer : il sert au serveur (premier calcul) et à
 * l'écran (recalcul immédiat quand on écarte une référence).
 */

/** Une vente DVF d'un seul local (appartement, maison ou local d'activité). */
export type VenteDvf = {
  /** Identifiant de la mutation DVF (unique, stable). */
  id: string;
  /** Date de la vente, AAAA-MM-JJ. */
  date: string;
  /** A : appartement, M : maison, L : local industriel, commercial ou assimilé. */
  type: "A" | "M" | "L";
  /** Pièces principales (0 pour un local). */
  pieces: number;
  /** Surface réelle bâtie, m². */
  surface: number;
  /** Surface Carrez du premier lot, quand DVF la donne. */
  carrez?: number;
  /** Valeur foncière de la mutation, €. */
  prix: number;
  /** Dépendances (caves, parkings) vendues dans la même mutation. */
  annexes: number;
  /** « 6 », « 55 ter »… */
  numero: string;
  voie: string;
  commune: string;
  insee: string;
  /** Clé d'adresse BAN (« 92050_9670_00055_ter ») : elle relie la vente à son bâtiment. */
  cleAdresse: string;
  lat: number;
  lon: number;
};

/** Une vente placée par rapport à l'immeuble étudié. */
export type Reference = VenteDvf & { distance: number; prixM2: number };

export type CleTypo = string; // « A2 » : appartement 2 pièces ; « L » : local ; « M4 » : maison 4 pièces

export const FORFAITS = ["Parking", "Cave"] as const;
export type Forfait = (typeof FORFAITS)[number];

/** Ce que l'agent a réglé ; gardé sur la fiche (`etude_decoupe`). */
export type ReglagesEtude = {
  /** Ventes écartées (identifiant de mutation) → motif. */
  ventesExclues: Record<string, string>;
  /** Immeubles écartés (clé d'adresse) → motif. Écarte toutes leurs ventes. */
  immeublesExclus: Record<string, string>;
  /** Ventes repérées d'office (hors marché) que l'agent a reprises. */
  reprises: string[];
  /** Rendement type par typologie, en % (valeur occupée = loyer annuel / rendement). */
  rendements: Record<CleTypo, number>;
  /** Prix à l'unité des annexes vendues séparément. */
  forfaits: Partial<Record<Forfait, number>>;
};

export const REGLAGES_VIDES: ReglagesEtude = {
  ventesExclues: {}, immeublesExclus: {}, reprises: [], rendements: {}, forfaits: {},
};

/* Les paliers de recherche : d'abord le plus proche et le plus récent, puis on
   élargit le temps (12 mois au plus), puis l'espace (MAV : 300 m au début). */
export const PALIERS: readonly { rayon: number; mois: number }[] = [
  { rayon: 300, mois: 6 },
  { rayon: 300, mois: 12 },
  { rayon: 450, mois: 12 },
  { rayon: 600, mois: 12 },
];
/** Le nombre de ventes sous lequel on passe au palier suivant. */
export const MINIMUM_REFS = 8;
/** La surface des références : celle de nos lots, à ± 20 %. */
export const TOLERANCE_SURFACE = 0.2;
export const RAYON_MAX = 600;
export const MOIS_MAX = 12;

const N = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Distance en mètres entre deux points (haversine). */
export function distance(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const p = Math.PI / 180;
  const h = 0.5 - Math.cos((bLat - aLat) * p) / 2
    + (Math.cos(aLat * p) * Math.cos(bLat * p) * (1 - Math.cos((bLon - aLon) * p))) / 2;
  return Math.round(2 * 6371e3 * Math.asin(Math.sqrt(h)));
}

/** « AAAA-MM-JJ » moins n mois. */
export function moinsMois(date: string, mois: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - mois);
  return d.toISOString().slice(0, 10);
}

/**
 * La typologie DVF d'un de nos lots, ou le forfait qui le chiffre.
 * Un T2 se compare aux appartements de 2 pièces ; un studio à ceux d'une
 * pièce ; un commerce, un bureau ou un local d'activité aux « locaux » de DVF,
 * qui ne les distingue pas.
 */
export function typologieDuLot(l: Record<string, unknown>): { cle: CleTypo; libelle: string } | { forfait: Forfait } | null {
  const dest = S(l.Destination);
  const type = S(l.Type_lot);
  if (dest === "Parking" || /^(Parking|Box)$/i.test(type)) return { forfait: "Parking" };
  if (dest === "Cave" || /^Cave$/i.test(type)) return { forfait: "Cave" };
  if (dest === "Annexe") return null;
  if (dest === "Commerce" || dest === "Bureau" || dest === "Logistique") return { cle: "L", libelle: "Locaux" };
  if (dest !== "Logement") return null;
  if (/maison/i.test(type)) {
    const p = Number(/T(\d)/i.exec(type)?.[1] ?? 0);
    return p ? { cle: `M${p}`, libelle: `Maison ${p} p.` } : { cle: "M", libelle: "Maison" };
  }
  if (/studio|chambre/i.test(type)) return { cle: "A1", libelle: "Studio / T1" };
  const p = Number(/T(\d)/i.exec(type)?.[1] ?? 0);
  if (p === 1) return { cle: "A1", libelle: "Studio / T1" };
  if (p >= 2) return { cle: `A${Math.min(p, 5)}`, libelle: p >= 5 ? "T5 et plus" : `T${p}` };
  return { cle: "A?", libelle: "Logement (type à saisir)" };
}

/** La surface d'un lot pour le calcul : Carrez, à défaut au sol. */
export const surfaceLot = (l: Record<string, unknown>) => N(l.surface_carrez) || N(l.surface_sol) || 0;

/** Le loyer annuel en cours d'un lot (0 s'il est libre). */
export const loyerAnnuel = (l: Record<string, unknown>) => (N(l.loyer) ?? 0) * 12;

/** Une vente correspond-elle à la typologie ? */
function memeTypo(r: VenteDvf, cle: CleTypo): boolean {
  if (cle === "L") return r.type === "L";
  if (cle === "A?") return r.type === "A";
  if (cle === "M") return r.type === "M";
  const t = cle[0], p = Number(cle.slice(1));
  if (r.type !== t) return false;
  return p >= 5 ? r.pieces >= 5 : r.pieces === p;
}

export const mediane = (v: number[]) => {
  if (v.length === 0) return undefined;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
export const quartile = (v: number[], q: number) => {
  if (v.length === 0) return undefined;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * q)];
};

export type EtatRef = "retenue" | "exclue" | "immeuble_exclu" | "hors_marche";

export type GroupeTypo = {
  cle: CleTypo;
  libelle: string;
  lots: Record<string, unknown>[];
  surfaceLots: number;
  loyersAnnuels: number;
  /** Le palier qui a fourni assez de ventes (ou le dernier). */
  palier: { rayon: number; mois: number };
  surfaceMin: number;
  surfaceMax: number;
  /** Toutes les ventes du palier, avec leur état. */
  refs: (Reference & { etat: EtatRef; motif?: string })[];
  retenues: number;
  medianeM2?: number;
  q1?: number;
  q3?: number;
  valeurLibre: number;
  /** Rendement des loyers en cours sur la valeur libre des lots loués, %. */
  rendementConstate?: number;
  rendementType?: number;
  valeurOccupee: number;
};

export type LigneForfait = { forfait: Forfait; lots: number; prixUnite?: number; valeur: number };

export type Etude = {
  groupes: GroupeTypo[];
  forfaits: LigneForfait[];
  /** Les lots qu'on ne sait pas chiffrer (annexes, destination vide…). */
  nonChiffres: Record<string, unknown>[];
  totalLibre: number;
  totalOccupe: number;
  refsRetenues: number;
  refsEcartees: number;
};

/**
 * L'étude complète.
 * @param ventes les ventes à moins de 600 m sur les 12 derniers mois publiés
 * @param finDonnees la date de la dernière vente publiée par DVF
 */
export function calculerEtude(
  lots: Record<string, unknown>[],
  ventes: Reference[],
  finDonnees: string,
  reglages: ReglagesEtude,
): Etude {
  const parTypo = new Map<CleTypo, { libelle: string; lots: Record<string, unknown>[] }>();
  const parForfait = new Map<Forfait, number>();
  const nonChiffres: Record<string, unknown>[] = [];
  for (const l of lots) {
    const t = typologieDuLot(l);
    if (!t) { nonChiffres.push(l); continue; }
    if ("forfait" in t) { parForfait.set(t.forfait, (parForfait.get(t.forfait) ?? 0) + 1); continue; }
    const g = parTypo.get(t.cle) ?? { libelle: t.libelle, lots: [] };
    g.lots.push(l);
    parTypo.set(t.cle, g);
  }

  const reprises = new Set(reglages.reprises);
  const groupes: GroupeTypo[] = [];
  for (const [cle, g] of parTypo) {
    const surfaces = g.lots.map(surfaceLot).filter((s) => s > 0);
    const surfaceMin = surfaces.length ? Math.floor(Math.min(...surfaces) * (1 - TOLERANCE_SURFACE)) : 0;
    const surfaceMax = surfaces.length ? Math.ceil(Math.max(...surfaces) * (1 + TOLERANCE_SURFACE)) : Infinity;
    const candidates = (rayon: number, mois: number) => {
      const debut = moinsMois(finDonnees, mois);
      return ventes.filter((r) => r.distance <= rayon && r.date > debut && memeTypo(r, cle)
        && (surfaces.length === 0 || (r.surface >= surfaceMin && r.surface <= surfaceMax)));
    };
    let palier = PALIERS[PALIERS.length - 1];
    let refs = candidates(palier.rayon, palier.mois);
    for (const p of PALIERS) {
      const c = candidates(p.rayon, p.mois);
      if (c.length >= MINIMUM_REFS) { palier = p; refs = c; break; }
    }
    /* Hors marché : moins de la moitié ou plus du double de la médiane brute —
       une vente entre proches, une part, un viager. Écartée d'office, et dite. */
    const brute = mediane(refs.map((r) => r.prixM2)) ?? 0;
    const etats = refs.map((r) => {
      const ex = reglages.ventesExclues[r.id];
      const im = reglages.immeublesExclus[r.cleAdresse];
      const etat: EtatRef = im !== undefined ? "immeuble_exclu"
        : ex !== undefined ? "exclue"
          : brute && (r.prixM2 < brute / 2 || r.prixM2 > brute * 2) && !reprises.has(r.id) ? "hors_marche"
            : "retenue";
      return { ...r, etat, motif: im ?? ex };
    }).sort((a, b) => a.distance - b.distance);
    const prix = etats.filter((r) => r.etat === "retenue").map((r) => r.prixM2);
    const medianeM2 = mediane(prix);
    const surfaceLots = g.lots.reduce((t, l) => t + surfaceLot(l), 0);
    const valeurLibreLot = (l: Record<string, unknown>) => (medianeM2 ? Math.round(surfaceLot(l) * medianeM2) : 0);
    const valeurLibre = g.lots.reduce((t, l) => t + valeurLibreLot(l), 0);
    const loues = g.lots.filter((l) => loyerAnnuel(l) > 0);
    const loyersAnnuels = loues.reduce((t, l) => t + loyerAnnuel(l), 0);
    const valeurLoues = loues.reduce((t, l) => t + valeurLibreLot(l), 0);
    const rendementType = reglages.rendements[cle];
    /* Occupé : un lot loué vaut son loyer annuel capitalisé au rendement type ;
       sans rendement saisi, ou pour un lot libre, sa valeur libre. */
    const valeurOccupee = g.lots.reduce((t, l) => {
      const loyer = loyerAnnuel(l);
      return t + (loyer > 0 && rendementType ? Math.round(loyer / (rendementType / 100)) : valeurLibreLot(l));
    }, 0);
    groupes.push({
      cle, libelle: g.libelle, lots: g.lots, surfaceLots, loyersAnnuels, palier,
      surfaceMin, surfaceMax: Number.isFinite(surfaceMax) ? surfaceMax : 0,
      refs: etats, retenues: prix.length, medianeM2,
      q1: quartile(prix, 0.25), q3: quartile(prix, 0.75),
      valeurLibre,
      rendementConstate: valeurLoues > 0 ? Math.round((loyersAnnuels / valeurLoues) * 1000) / 10 : undefined,
      rendementType, valeurOccupee,
    });
  }
  const ordre = (c: CleTypo) => (c.startsWith("A") ? 0 : c.startsWith("M") ? 1 : 2) * 10 + (Number(c.slice(1)) || 9);
  groupes.sort((a, b) => ordre(a.cle) - ordre(b.cle));

  const forfaits: LigneForfait[] = FORFAITS.filter((f) => parForfait.has(f)).map((f) => {
    const prixUnite = reglages.forfaits[f];
    const n = parForfait.get(f) ?? 0;
    return { forfait: f, lots: n, prixUnite, valeur: prixUnite ? prixUnite * n : 0 };
  });
  const totalForfaits = forfaits.reduce((t, f) => t + f.valeur, 0);
  const toutes = groupes.flatMap((g) => g.refs);
  return {
    groupes, forfaits, nonChiffres,
    totalLibre: groupes.reduce((t, g) => t + g.valeurLibre, 0) + totalForfaits,
    totalOccupe: groupes.reduce((t, g) => t + g.valeurOccupee, 0) + totalForfaits,
    refsRetenues: toutes.filter((r) => r.etat === "retenue").length,
    refsEcartees: toutes.filter((r) => r.etat !== "retenue").length,
  };
}
