/* Ce qui a bougé depuis l'estimation (retour #143).
 *
 * MAV : « quand on regarde une ancienne estimation, on puisse voir sur les
 * différents onglets l'immeuble — donc l'état locatif avec en rouge les
 * valeurs qui ont changé par rapport à ce qu'on a dans l'état locatif actuel,
 * avec au survol la valeur actuelle pour le lot en question. Pareil pour les
 * prix du secteur et pour le prix et l'analyse. »
 *
 * Le principe : on ne touche PAS aux valeurs figées — c'est ce qui est parti
 * chez le propriétaire, et ça ne se réécrit pas. On calcule à côté, pour
 * chaque case, ce que la fiche dit aujourd'hui, et on ne signale que les
 * différences. Une estimation qui n'a pas bougé ne montre donc rien.
 *
 * Ce qu'on peut comparer, et ce qu'on ne peut pas : l'estimation enregistre
 * des AGRÉGATS PAR DESTINATION (tant de logements, tant de m², tant de loyer),
 * pas le détail lot par lot. Un DPE changé sur un lot précis n'est donc pas
 * comparable — il n'a jamais été dans l'estimation. On compare ce qui y est.
 */

/* Les colonnes du secteur portent leur propre préfixe, différent de celui de
   l'estimation : « hab_loyer_retenu » et non « loyer_hab ». */
const PREFIXE: Record<string, string> = {
  Logement: "hab", Commerce: "com", Bureau: "bur", Parking: "parking", Cave: "cave",
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Un écart constaté : la valeur d'alors, celle d'aujourd'hui, en clair. */
export type Ecart = { alors: string; aujourdhui: string };

/** Toutes les cases qui ont changé, indexées « destination.champ ». */
export type Ecarts = Record<string, Ecart>;

const eur = (v?: number) => (v === undefined ? "—" : `${Math.round(v).toLocaleString("fr-FR")} €`);
const m2 = (v?: number) => (v === undefined ? "—" : `${Math.round(v).toLocaleString("fr-FR")} m²`);
const ent = (v?: number) => (v === undefined ? "—" : String(Math.round(v)));
const dec = (v?: number) => (v === undefined ? "—" : v.toFixed(1).replace(".", ","));

/** Deux montants diffèrent quand l'écart dépasse l'arrondi d'affichage. */
const bouge = (a?: number, b?: number, tol = 0.5) => {
  if (a === undefined && b === undefined) return false;
  if (a === undefined || b === undefined) return true;
  return Math.abs(a - b) > tol;
};

/**
 * Compare l'estimation figée à l'état locatif d'aujourd'hui.
 *
 * `lots` est la liste des lots de la fiche, telle que la sert `getBien`.
 */
export function comparerLocatif(
  lignes: { dest: string; lots?: number; surface?: number; surfaceOcc?: number; loyer?: number; loyerMax?: number }[],
  lots: Record<string, unknown>[],
): Ecarts {
  const out: Ecarts = {};
  for (const l of lignes) {
    const ls = lots.filter((x) => String(x.Destination ?? "") === l.dest);
    const loues = ls.filter((x) => (num(x.loyer) ?? 0) > 0);
    const maintenant = {
      lots: ls.length,
      surface: ls.reduce((s, x) => s + (num(x.surface_carrez) ?? 0), 0),
      surfaceOcc: loues.reduce((s, x) => s + (num(x.surface_carrez) ?? 0), 0),
      loyer: ls.reduce((s, x) => s + (num(x.loyer) ?? 0), 0) * 12,
      loyerMax: ls.reduce((s, x) => s + (num(x.loyer_max) ?? num(x.loyer) ?? 0), 0) * 12,
    };
    const mettre = (champ: string, alors?: number, apres?: number, fmt: (v?: number) => string = ent) => {
      if (!bouge(alors, apres)) return;
      out[`${l.dest}.${champ}`] = { alors: fmt(alors), aujourdhui: fmt(apres) };
    };
    /* Une destination disparue de la fiche : `ls` est vide, tout est à zéro —
       c'est un écart, et un vrai. */
    mettre("lots", l.lots, maintenant.lots, ent);
    mettre("surface", l.surface, maintenant.surface, m2);
    mettre("surfaceOcc", l.surfaceOcc, maintenant.surfaceOcc, m2);
    mettre("loyer", l.loyer, maintenant.loyer, eur);
    mettre("loyerMax", l.loyerMax, maintenant.loyerMax, eur);
  }
  return out;
}

/** Suffixe des colonnes d'agrégat d'une estimation, par destination. */
const SUFFIXE: Record<string, string> = {
  Logement: "hab", Commerce: "com", Bureau: "bur",
  Parking: "park", Cave: "cave", Logistique: "autre", Annexe: "autre",
};

/**
 * Compare l'état locatif d'AUJOURD'HUI aux agrégats figés dans une estimation
 * précédente (retour #163).
 *
 * C'est l'inverse de `comparerLocatif` : là-bas on ouvre une vieille
 * estimation et on regarde ce que la fiche dit depuis ; ici on prépare une
 * estimation neuve et on veut savoir ce qui a bougé depuis la dernière. Le
 * sens de lecture change, la sortie garde la même forme — `alors` est ce que
 * disait l'estimation précédente, `aujourdhui` ce qu'on s'apprête à envoyer.
 */
export function comparerEstimation(
  lignes: { dest: string; lots?: number; surface?: number; surfaceOcc?: number; loyer?: number; loyerMax?: number }[],
  estimation: Record<string, unknown>,
): Ecarts {
  const out: Ecarts = {};
  for (const l of lignes) {
    const s = SUFFIXE[l.dest] ?? "autre";
    const mettre = (champ: string, avant?: number, apres?: number, fmt: (v?: number) => string = ent) => {
      /* Une colonne que l'estimation ne portait pas n'est pas un écart : les
         premières estimations n'enregistraient pas tout, et signaler « ça a
         changé » sur une case qui n'a jamais existé ne dit rien à personne. */
      if (avant === undefined) return;
      if (!bouge(avant, apres)) return;
      out[`${l.dest}.${champ}`] = { alors: fmt(avant), aujourdhui: fmt(apres) };
    };
    mettre("lots", num(estimation[`imm_nb_lots_${s}`]), l.lots, ent);
    mettre("surface", num(estimation[`imm_carrez_tot_${s}`]), l.surface, m2);
    mettre("surfaceOcc", num(estimation[`imm_carrez_occ_${s}`]), l.surfaceOcc, m2);
    mettre("loyer", num(estimation[`imm_loyer_hc_${s}`]), l.loyer, eur);
    mettre("loyerMax", num(estimation[`imm_loyer_hc_max_${s}`]), l.loyerMax, eur);
  }
  return out;
}

/**
 * Compare les références de secteur figées à celles d'aujourd'hui.
 *
 * `secteur` est l'enregistrement `bo_prix_secteur` de l'immeuble, aux mêmes
 * colonnes que celles reprises dans l'estimation.
 */
export function comparerSecteur(
  lignes: { dest: string; refLoyer?: number; refPrix?: number; refRenta?: number }[],
  secteur: Record<string, unknown> | null,
): Ecarts {
  const out: Ecarts = {};
  if (!secteur) return out;
  for (const l of lignes) {
    const s = PREFIXE[l.dest] ?? "autre";
    const mettre = (champ: string, alors?: number, apres?: number, fmt: (v?: number) => string = dec, tol = 0.05) => {
      if (!bouge(alors, apres, tol)) return;
      out[`${l.dest}.${champ}`] = { alors: fmt(alors), aujourdhui: fmt(apres) };
    };
    mettre("refLoyer", l.refLoyer,
      num(secteur[`${s}_loyer_retenu`]) ?? num(secteur["0 - loyer_mois"]), dec, 0.05);
    mettre("refPrix", l.refPrix,
      num(secteur[`${s}_prix_retenu`]) ?? num(secteur["0 - prix"]), ent, 1);
    mettre("refRenta", l.refRenta,
      num(secteur[`${s}_renta_retenu`]) ?? num(secteur["0 - renta _%"]), dec, 0.05);
  }
  return out;
}

/**
 * Compare le prix retenu à celui affiché aujourd'hui sur la fiche.
 *
 * C'est l'écart qui intéresse le plus : « on avait dit 487 000, la fiche est
 * à 520 000 ».
 */
export function comparerPrix(
  prix: { hai?: number; nv?: number },
  im: Record<string, unknown>,
): Ecarts {
  const out: Ecarts = {};
  const hai = num(im.prix_hai);
  const nv = num(im.prix_nv);
  if (bouge(prix.hai, hai, 1)) out["prix.hai"] = { alors: eur(prix.hai), aujourdhui: eur(hai) };
  if (bouge(prix.nv, nv, 1)) out["prix.nv"] = { alors: eur(prix.nv), aujourdhui: eur(nv) };
  return out;
}
