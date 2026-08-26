// Dossier d'estimation — les 6 pages envoyées au propriétaire.
//
// Tout se reconstruit depuis l'enregistrement d'estimation, jamais depuis la
// fiche : une estimation est figée à sa date, son PDF doit montrer les
// chiffres du jour où elle a été faite, même si l'immeuble a bougé depuis.
// Les calculs reprennent ceux du BO, vérifiés sur le dossier Drancy du
// 04/10/2024 (moyennes pondérées par les surfaces, parkings hors moyenne au
// m², facteur limitant = la méthode qui donne le prix le plus bas).

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Suffixe des colonnes par destination, comme dans le BO. */
export const SFX: Record<string, string> = {
  Logement: "hab", Commerce: "com", Bureau: "bur",
  Parking: "park", Cave: "cave", Logistique: "autre", Annexe: "autre",
};

/** Les destinations vendues au lot (et non au m²) sortent des moyennes. */
const AU_LOT = new Set(["Parking", "Cave"]);

const PLURIEL: Record<string, string> = {
  Logement: "Logements", Commerce: "Commerces", Bureau: "Bureaux",
  Parking: "Parkings", Cave: "Caves", Logistique: "Entrepôts", Annexe: "Annexes",
};

/** Étoiles → état, dans les deux formes utilisées par le dossier. */
export const ETATS = {
  bati: ["À rénover", "Gros travaux", "État d'usage", "Bon état", "Comme neuf"],
  batiPhrase: ["à rénover entièrement", "avec de gros travaux à prévoir", "en état d'usage", "en bon état", "comme neuf"],
  lot: ["À rénover", "Gros travaux", "État d'usage", "Bon état", "Comme neufs"],
  lotPhrase: ["à rénover entièrement", "avec des travaux à prévoir", "en état d'usage", "en bon état", "comme neufs"],
  emp: ["Emplacement difficile", "Emplacement moyen", "Correctement situé", "Bien situé", "Idéalement situé"],
  empPhrase: ["dans un emplacement difficile", "dans un emplacement moyen", "correctement situé", "bien situé", "idéalement situé"],
};

export type LigneDest = {
  dest: string;
  label: string;
  lots: number;
  surface: number;
  surfaceOcc: number;
  revenus: number;      // € HC/an
  loyerM2: number;      // €/m²/mois — €/lot/mois pour parkings et caves
  auLot: boolean;
  /** Loyer pratiqué au-dessus du secteur : imprimé en rouge dans le BO. */
  cher: boolean;
  refLoyer?: number;
  refPrix?: number;
  refRenta?: number;
};

export type Dossier = ReturnType<typeof construireDossier>;

export function construireDossier(
  e: Record<string, unknown>,
  agent: Record<string, unknown> | null,
) {
  const dests: string[] = Array.isArray(e.imm_Destinations)
    ? (e.imm_Destinations as unknown[]).map(String)
    : [];

  const carrez = num(e.imm_carrez_tot_tot) ?? 0;
  const loyers = num(e.imm_loyer_hc_tot) ?? 0;
  const loyersMax = num(e.imm_loyer_hc_max_tot) ?? 0;
  const charges = num(e.charges_tot_non_recup) ?? 0;
  const travauxBati = num(e.travaux_bati) ?? 0;
  const travauxLots = num(e.travaux_lots) ?? 0;
  const travaux = num(e.travaux_tot) ?? travauxBati + travauxLots;
  const hai = num(e.prix_hai) ?? 0;
  const honosPct = num(e["honos_taux_%"]) ?? 5;
  const nv = Math.round(hai / (1 + honosPct / 100));

  /* --- Une ligne par destination : état locatif ET références secteur --- */
  const lignes: LigneDest[] = dests.map((d) => {
    const s = SFX[d] ?? "autre";
    const lots = num(e[`imm_nb_lots_${s}`]) ?? 0;
    const surface = num(e[`imm_carrez_tot_${s}`]) ?? 0;
    const surfaceOcc = num(e[`imm_carrez_occ_${s}`]) ?? 0;
    const revenus = num(e[`imm_loyer_hc_${s}`]) ?? 0;
    const auLot = AU_LOT.has(d);
    const base = auLot ? lots : surface;
    return {
      dest: d,
      label: PLURIEL[d] ?? d,
      lots, surface, surfaceOcc, revenus, auLot,
      loyerM2: base > 0 ? revenus / 12 / base : 0,
      cher: false,
      refLoyer: num(e[`ref_loyer_${s}`]),
      refPrix: num(e[`ref_prix_${s}`]),
      refRenta: num(e[`ref_renta_${s}`]),
    };
  });
  for (const l of lignes) l.cher = !!(l.refLoyer && l.loyerM2 > l.refLoyer);

  /* --- Moyennes du secteur, pondérées par les surfaces (hors lots secs) --- */
  const pond = (cle: "refLoyer" | "refPrix") => {
    let n = 0, d = 0;
    for (const l of lignes) {
      const v = l[cle];
      if (l.auLot || !v || l.surface <= 0) continue;
      n += v * l.surface; d += l.surface;
    }
    return d > 0 ? n / d : undefined;
  };
  const refLoyer = pond("refLoyer") ?? num(e.ref_loyer_all) ?? 0;
  const refPrix = pond("refPrix") ?? num(e.ref_prix_all) ?? 0;
  // Le rendement du secteur se déduit des deux autres, comme dans le BO.
  const refRenta = refLoyer > 0 && refPrix > 0
    ? (refLoyer * 12 * 100) / refPrix
    : num(e.ref_renta_all) ?? 0;

  /* --- Loyers pratiqués vs secteur : le verdict de la page 2 --- */
  const surfaceM2 = lignes.filter((l) => !l.auLot).reduce((s, l) => s + l.surface, 0);
  const revenusM2 = lignes.filter((l) => !l.auLot).reduce((s, l) => s + l.revenus, 0);
  const loyerM2Actuel = surfaceM2 > 0 ? revenusM2 / 12 / surfaceM2 : 0;
  const ecartLoyers = refLoyer > 0 ? Math.round((loyerM2Actuel / refLoyer - 1) * 100) : 0;

  /* --- Facteur limitant : la méthode qui donne le prix le plus bas --- */
  const parM2 = {
    m2: refPrix,
    m2Travaux: refPrix,
    prix: Math.round((carrez * refPrix) / 1000) * 1000,
    renta: 0,
  };
  parM2.renta = parM2.prix > 0 ? (loyers / parM2.prix) * 100 : 0;
  const parRenta = {
    prix: refRenta > 0 ? Math.round(loyers / (refRenta / 100) / 1000) * 1000 : 0,
    renta: refRenta,
    m2: 0,
    m2Travaux: 0,
  };
  parRenta.m2 = carrez > 0 ? parRenta.prix / carrez : 0;
  parRenta.m2Travaux = carrez > 0 ? (parRenta.prix + travaux) / carrez : 0;
  const limitant: "renta" | "m2" =
    parRenta.prix > 0 && parRenta.prix <= parM2.prix ? "renta" : "m2";

  const sc = (v: unknown) => Math.min(5, Math.max(1, parseInt(S(v) || "3", 10) || 3));
  const scores = { emp: sc(e.Score_emp), bati: sc(e.Score_bati), lot: sc(e.Score_lot) };

  const cibles: string[] = Array.isArray(e.Cibles) ? (e.Cibles as unknown[]).map(String) : [];

  return {
    id: S(e._id),
    titre: S(e.titre) || "Estimation",
    date: S(e["Created Date"]).slice(0, 10).split("-").reverse().join("/"),
    photo: photoUrl(S(e.photo)),
    adresse: [
      [S(e["adresse_numéro_rue"]), S(e.adresse_rue)].filter(Boolean).join(" "),
      `${S(e.adresse_zipcode)} ${S(e.adresse_ville)}`.trim(),
    ].filter(Boolean).join(", "),
    ville: S(e.adresse_ville),

    agent: {
      nom: `${S(agent?.["prénom"])} ${S(agent?.nom)}`.trim() || "France Immeuble",
      email: S(agent?.email),
      tel: S(agent?.["portable (TXT)"]) || S(agent?.portable),
      photo: photoUrl(S(agent?.photo)),
      poste: S(agent?.Poste),
    },

    // Page 1
    carrez, loyers, loyersMax,
    occupation: num(e.imm_occupation) ?? 0,

    // Page 2
    scores,
    etat: {
      emp: ETATS.emp[scores.emp - 1],
      bati: ETATS.bati[scores.bati - 1],
      lot: ETATS.lot[scores.lot - 1],
    },
    // Forme utilisable dans une phrase : « L'immeuble est bien situé, en bon
    // état… » — le libellé des vignettes ne s'y prête pas.
    phrase: {
      emp: ETATS.empPhrase[scores.emp - 1],
      bati: ETATS.batiPhrase[scores.bati - 1],
      lot: ETATS.lotPhrase[scores.lot - 1],
    },
    gare: { nom: S(e.emp_gare_name), min: num(e["emp_gare_durée"]) },
    com: { nom: S(e.emp_com_name), min: num(e["emp_com_durée"]) },
    travaux, travauxBati, travauxLots,
    lignes,
    total: {
      lots: lignes.reduce((s, l) => s + l.lots, 0),
      surface: lignes.reduce((s, l) => s + l.surface, 0),
      surfaceOcc: lignes.reduce((s, l) => s + l.surfaceOcc, 0),
      revenus: loyers,
      loyerM2: loyerM2Actuel,
    },
    ecartLoyers,

    // Page 3
    cibles,

    // Page 4
    ref: { loyer: refLoyer, prix: refPrix, renta: refRenta },
    methodes: { m2: parM2, renta: parRenta, limitant },

    // Page 5
    analyse: S(e.analyse),
    prix: {
      hai, nv, honosPct,
      m2: carrez > 0 ? hai / carrez : 0,
      renta: hai > 0 ? (loyers / hai) * 100 : 0,
    },
    /* Le bilan du prix retenu, dans la présentation du BO : ce que le bien
       rapporte aujourd'hui, et ce qu'il rapporterait travaux faits et lots
       reloués (retour #152). Les deux colonnes se valent quand il n'y a ni
       travaux ni potentiel de relocation — l'écran n'en montre alors qu'une. */
    bilan: colonnes(),
    charges,
  };

  function colonnes() {
    const AEM = 1.075; // acte en main : ~7,5 % de frais
    const col = (base: number, loyer: number) => ({
      loyerM2: carrez > 0 ? loyer / 12 / carrez : 0,
      prixM2: carrez > 0 ? base / carrez : 0,
      brut: base > 0 ? (loyer / base) * 100 : 0,
      net: base > 0 ? ((loyer - charges) / base) * 100 : 0,
      aem: base > 0 ? ((loyer - charges) / (base * AEM)) * 100 : 0,
    });
    const actuel = col(hai, loyers);
    const potentiel = col(hai + travaux, loyersMax);
    const identiques = travaux === 0 && Math.abs(loyersMax - loyers) < 1;
    return { actuel, potentiel, identiques };
  }
}

/** Les photos (immeuble comme agent) vivent chez Bubble ou sur S3, derrière
 *  un jeton que le navigateur n'a pas : elles passent par notre relais. */
export function photoUrl(u: string) {
  if (!u) return undefined;
  if (u.startsWith("/api/") || u.startsWith("data:")) return u;
  return `/api/photo?u=${encodeURIComponent(u.startsWith("//") ? `https:${u}` : u)}`;
}
