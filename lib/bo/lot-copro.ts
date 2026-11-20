/**
 * Le bien en copropriété vendu seul (local commercial, bureaux, logement…) —
 * étape 1 du cadrage du 20/11/26 (CLAUDE.md §7.11).
 *
 * Un seul renseignement se saisit sur la fiche : le bien est-il **en
 * copropriété** ? C'est lui, et lui seul, qui ouvre les pages « Bail et
 * locataire » et « Copropriété » de la fiche et du dossier (MAV, 20/11 : « la
 * différence de dossier ne se fait pas en fonction de ce que contient le bien,
 * mais seulement s'il est en copropriété ou non »). Ce que le bien contient —
 * commerce, bureaux, logement, cave, parking — se lit dans l'état locatif,
 * comme pour un immeuble (revirement du 20/11 : la « nature » qu'on demandait
 * à la création a disparu).
 *
 * Les **lots de copropriété** ne sont pas les lignes de l'état locatif : un
 * seul bail peut couvrir deux lots aux tantièmes différents (MAV, 20/11). Ils
 * se saisissent donc à part, sur la page Copropriété.
 *
 * Ce fichier ne lit ni n'écrit rien : il décrit les données et calcule les
 * repères qu'un investisseur regarde en premier.
 */

const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const nombre = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** La copropriété ouvre les pages « Bail et locataire » et « Copropriété ». */
export const enCopropriete = (im: Record<string, unknown>) => im.en_copropriete === true;

/** Un commerce parmi les lots : la page « Emplacement commercial » a un sens. */
export const aUnCommerce = (lots: Record<string, unknown>[]) => lots.some((l) => texte(l.Destination) === "Commerce");

/* ------------------------------------------------------------------ */
/* Ce qui se saisit                                                    */
/* ------------------------------------------------------------------ */

/** Qui supporte une dépense, au bail. */
export const QUI_PAIE = ["Le locataire", "Le bailleur", "Partagé"] as const;

/** Les clauses du bail que l'état locatif ne porte pas. */
export type BailLocal = Partial<{
  signe_le: string;
  /** Fin du bail, quand elle n'est pas « effet + 9 ans ». */
  fin: string;
  /** Mois et jour de la révision annuelle, « 04-01 » pour le 1ᵉʳ avril. */
  revision: string;
  tva: boolean;
  garantie: string;
  destination: string;
  taxe_fonciere: string;
  charges_copro: string;
  gros_travaux: string;
  cession: string;
  impayes: string;
  /** Le locataire dispose d'un droit de préférence sur la vente. */
  droit_preference: boolean;
}>;

/** La société qui exploite le local. Ne sort jamais du BO sans le choix de l'agent. */
export type LocataireLocal = Partial<{
  enseigne: string;
  activite: string;
  societe: string;
  siren: string;
  creee_le: string;
  dirigeant: string;
  etablissements: number;
  entree: string;
  /** Chiffre d'affaires et résultat des comptes publiés (registre). */
  ca: number;
  ca_annee: number;
  resultat: number;
  /** Ce que le locataire ou le propriétaire a dit : gardé à part. */
  ca_declare: number;
  ca_declare_annee: number;
  /** D'où viennent les lignes préremplies, et quand. */
  source_le: string;
  note_interne: string;
}>;

/** Un lot de copropriété vendu : son numéro au règlement, ce que c'est, ses tantièmes. */
export type LotCopro = { numero?: string; designation?: string; tantiemes?: number };

export type TravauxVotes = { libelle: string; montant?: number; part?: number; appels?: string; charge?: string };

export type Copro = Partial<{
  lots_total: number;
  lots_principaux: number;
  syndic: string;
  immatriculation: string;
  reglement: string;
  procedure: string;
  chauffage: string;
  fonds_travaux: number;
  fonds_travaux_au: string;
  /** Les lots de copropriété vendus, chacun avec ses tantièmes. */
  lots: LotCopro[];
  tantiemes_base: number;
  charges_trimestre: number;
  charges_recuperables: number;
  fonds_travaux_lot: number;
  usage: string;
  ag_date: string;
  travaux: TravauxVotes[];
  resume: string;
  a_prevoir: string;
}>;

export const QUALITES_EMPLACEMENT = ["N° 1", "N° 1 bis", "N° 2"] as const;

export type EmplacementCommerce = Partial<{
  qualite: string;
  rue: string;
  vitrine: string;
  terrasse: string;
  livraisons: string;
  stationnement: string;
  transports: string;
  voisins: string;
  concurrents: string;
  locomotives: string;
  projets: string;
}>;

const objet = <T,>(v: unknown): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : ({} as T));
export const bailLocalDe = (im: Record<string, unknown>) => objet<BailLocal>(im.bail_local);
export const locataireLocalDe = (im: Record<string, unknown>) => objet<LocataireLocal>(im.locataire_local);
export const coproDe = (im: Record<string, unknown>) => objet<Copro>(im.copro);
export const emplacementCommerceDe = (im: Record<string, unknown>) => objet<EmplacementCommerce>(im.emp_commerce);

/* ------------------------------------------------------------------ */
/* Ce que l'état locatif sait déjà                                     */
/* ------------------------------------------------------------------ */

const HORS_SURFACE = new Set(["Cave", "Parking", "Annexe"]);
const liste = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);

/**
 * Le bail tel que l'état locatif le porte : loyer et type sur le lot, date
 * d'entrée, dépôt et indice sur le bail, nom sur le locataire. Les pages d'un
 * lot le relisent, elles ne le recopient pas. Les loyers de l'état locatif
 * sont mensuels.
 */
export function etatLocatifDuLot(b: {
  lots: Record<string, unknown>[]; baux: Record<string, unknown>[]; locataires: Record<string, unknown>[];
}) {
  const principaux = b.lots.filter((l) => !HORS_SURFACE.has(texte(l.Destination)));
  const loyerMensuel = b.lots.reduce((s, l) => s + (nombre(l.loyer) ?? 0), 0);
  const surface = principaux.reduce((s, l) => s + (nombre(l.surface_carrez) ?? 0), 0);
  const annexes = b.lots.filter((l) => HORS_SURFACE.has(texte(l.Destination)))
    .reduce((s, l) => s + (nombre(l.surface_carrez) ?? nombre(l.surface_sol) ?? 0), 0);
  const loue = principaux.find((l) => (nombre(l.loyer) ?? 0) > 0) ?? principaux[0];
  const idLot = texte(loue?._id);
  const duLot = (x: Record<string, unknown>) => !!idLot && liste(x.LOTs).includes(idLot);
  const bail = b.baux.find(duLot) ?? (b.baux.length === 1 ? b.baux[0] : undefined);
  const locataire = b.locataires.find(duLot) ?? (b.locataires.length === 1 ? b.locataires[0] : undefined);
  return {
    typeBail: texte(loue?.Type_bail),
    loyerAnnuel: loyerMensuel > 0 ? loyerMensuel * 12 : undefined,
    surface: surface > 0 ? surface : undefined,
    annexes: annexes > 0 ? annexes : undefined,
    effet: texte(bail?.date_start).slice(0, 10) || undefined,
    loyerInitial: nombre(bail?.loyer_init),
    depot: nombre(bail?.depot_garantie),
    indice: texte(bail?.indice_type) || undefined,
    nomLocataire: texte(locataire?.pm_nom) || texte(locataire?.formatted_name) || undefined,
    nbLots: b.lots.length,
  };
}

/** Un bail commercial « 3/6/9 » : le seul dont les échéances triennales ont un sens. */
export const estBailCommercial = (typeBail: string) => /3\s*\/\s*6\s*\/\s*9/.test(typeBail);

/* ------------------------------------------------------------------ */
/* Les repères du bail                                                 */
/* ------------------------------------------------------------------ */

const jour = (d: Date) => d.toISOString().slice(0, 10);
const date = (v: unknown) => {
  const s = texte(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const ajouterAnnees = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() + n);
  return x;
};
const veille = (d: Date) => new Date(d.getTime() - 86_400_000);
const ajouterMois = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
};

export type Echeance = { date: string; libelle: string; passee: boolean };

/**
 * Les échéances d'un bail commercial : tous les trois ans à compter de la date
 * d'effet, la veille du jour anniversaire (un bail du 01/04/2019 a ses
 * échéances aux 31/03/2022, 2025 et 2028). `fin` remplace la dernière quand
 * le bail n'est pas de neuf ans.
 */
export function echeancesBail(effet: unknown, fin: unknown, aujourdHui: Date): Echeance[] {
  const d0 = date(effet);
  if (!d0) return [];
  const dFin = date(fin) ?? veille(ajouterAnnees(d0, 9));
  const out: Echeance[] = [];
  for (let n = 3; ; n += 3) {
    const e = veille(ajouterAnnees(d0, n));
    if (e.getTime() >= dFin.getTime() || n > 30) break;
    out.push({ date: jour(e), libelle: `${n / 3}${n === 3 ? "ʳᵉ" : "ᵉ"} échéance`, passee: e.getTime() < aujourdHui.getTime() });
  }
  out.push({ date: jour(dFin), libelle: "Fin du bail", passee: dFin.getTime() < aujourdHui.getTime() });
  return out;
}

/** « 1 an et 4 mois », « 7 mois », « 3 ans ». */
export function dureeEnClair(du: Date, au: Date): string {
  let mois = (au.getUTCFullYear() - du.getUTCFullYear()) * 12 + (au.getUTCMonth() - du.getUTCMonth());
  if (au.getUTCDate() < du.getUTCDate() - 1) mois -= 1;
  if (mois <= 0) return "moins d'un mois";
  const a = Math.floor(mois / 12);
  const m = mois % 12;
  const ans = a ? `${a} an${a > 1 ? "s" : ""}` : "";
  const ms = m ? `${m} mois` : "";
  return [ans, ms].filter(Boolean).join(" et ");
}

export type EntreesReperes = {
  /** Loyer annuel hors taxes, hors charges. */
  loyerAnnuel?: number;
  /** Prix honoraires inclus. */
  prixHai?: number;
  /** Surface du local (hors réserve), en m². */
  surface?: number;
  /** Date d'effet du bail. */
  effet?: unknown;
  bail: BailLocal;
  locataire: LocataireLocal;
  aujourdHui: Date;
};

export type Reperes = {
  /** Rendement brut : loyer annuel ÷ prix honoraires inclus, en %. */
  rendement?: number;
  /** Taux d'effort : loyer annuel ÷ chiffre d'affaires, en %. */
  tauxEffort?: number;
  /** D'où vient le chiffre d'affaires du taux d'effort. */
  tauxEffortSource?: string;
  loyerM2?: number;
  prixM2?: number;
  echeances: Echeance[];
  /** La prochaine échéance à laquelle le locataire peut partir. */
  prochaineEcheance?: string;
  dureeFerme?: string;
  /** Dernier jour pour donner congé à cette échéance (six mois avant). */
  congeAvant?: string;
  prochaineRevision?: string;
  /** Position d'aujourd'hui sur la durée du bail, de 0 à 1. */
  avancement?: number;
};

const arrondi = (x: number, n = 1) => Math.round(x * 10 ** n) / 10 ** n;

/** Tout ce que la page « Bail et locataire » et le dossier tirent de la saisie. */
export function reperesBail(e: EntreesReperes): Reperes {
  const loyer = e.loyerAnnuel && e.loyerAnnuel > 0 ? e.loyerAnnuel : undefined;
  const out: Reperes = { echeances: echeancesBail(e.effet, e.bail.fin, e.aujourdHui) };

  if (loyer && e.prixHai && e.prixHai > 0) out.rendement = arrondi((loyer / e.prixHai) * 100, 2);
  if (loyer && e.surface && e.surface > 0) out.loyerM2 = Math.round(loyer / e.surface);
  if (e.prixHai && e.prixHai > 0 && e.surface && e.surface > 0) out.prixM2 = Math.round(e.prixHai / e.surface);

  /* Les comptes publiés d'abord : c'est un chiffre vérifiable. Le chiffre
     donné de vive voix ne sert qu'à défaut, et il est nommé comme tel. */
  const ca = e.locataire.ca && e.locataire.ca > 0
    ? { v: e.locataire.ca, s: `comptes publiés${e.locataire.ca_annee ? ` ${e.locataire.ca_annee}` : ""}` }
    : e.locataire.ca_declare && e.locataire.ca_declare > 0
      ? { v: e.locataire.ca_declare, s: `chiffre déclaré${e.locataire.ca_declare_annee ? ` ${e.locataire.ca_declare_annee}` : ""}` }
      : undefined;
  if (loyer && ca) {
    out.tauxEffort = arrondi((loyer / ca.v) * 100, 1);
    out.tauxEffortSource = ca.s;
  }

  const d0 = date(e.effet);
  const prochaine = out.echeances.find((x) => !x.passee);
  if (prochaine) {
    const d = date(prochaine.date)!;
    out.prochaineEcheance = prochaine.date;
    out.dureeFerme = dureeEnClair(e.aujourdHui, d);
    out.congeAvant = jour(veille(ajouterMois(new Date(d.getTime() + 86_400_000), -6)));
  }
  if (d0 && out.echeances.length) {
    const fin = date(out.echeances[out.echeances.length - 1].date)!;
    const total = fin.getTime() - d0.getTime();
    if (total > 0) out.avancement = Math.min(1, Math.max(0, (e.aujourdHui.getTime() - d0.getTime()) / total));
  }

  /* La révision : le jour dit au bail, sinon l'anniversaire de la date d'effet. */
  const mj = /^\d{2}-\d{2}$/.test(texte(e.bail.revision)) ? texte(e.bail.revision) : d0 ? jour(d0).slice(5) : "";
  if (mj) {
    const an = e.aujourdHui.getUTCFullYear();
    const cette = new Date(`${an}-${mj}T00:00:00Z`);
    if (!Number.isNaN(cette.getTime())) {
      out.prochaineRevision = jour(cette.getTime() > e.aujourdHui.getTime() ? cette : new Date(`${an + 1}-${mj}T00:00:00Z`));
    }
  }
  return out;
}

/** Lecture du taux d'effort, pour la couleur de la tuile : au-delà de 12 %, un commerce peine à payer. */
export const tonTauxEffort = (t?: number) => (t === undefined ? "" : t <= 10 ? "bon" : t <= 12 ? "moyen" : "tendu");

/** Les tantièmes vendus : la somme de ceux des lots, quand au moins un est saisi. */
export function tantiemesVendus(c: Copro): number | undefined {
  const t = (c.lots ?? []).map((l) => l.tantiemes).filter((x): x is number => typeof x === "number" && x > 0);
  return t.length ? t.reduce((a, b) => a + b, 0) : undefined;
}

/** Les charges annuelles du lot, d'après l'appel trimestriel. */
export const chargesAnnuelles = (c: Copro) => (c.charges_trimestre && c.charges_trimestre > 0 ? Math.round(c.charges_trimestre * 4) : undefined);

/** Ce que le registre public sait d'une société, rangé pour la fiche. */
export type SocieteRegistre = {
  siren: string;
  societe?: string;
  creee_le?: string;
  dirigeant?: string;
  etablissements?: number;
  activite?: string;
  ca?: number;
  ca_annee?: number;
  resultat?: number;
};

/**
 * Range la réponse de recherche-entreprises.api.gouv.fr. Les comptes ne sont
 * publiés que par une partie des sociétés : sans eux, pas de chiffre — jamais
 * un zéro à la place de « on ne sait pas ».
 */
export function lireRegistre(brut: unknown): SocieteRegistre | null {
  const r = objet<Record<string, unknown>>(brut);
  const siren = texte(r.siren);
  if (!/^\d{9}$/.test(siren)) return null;
  const out: SocieteRegistre = { siren };
  if (texte(r.nom_complet) || texte(r.nom_raison_sociale)) out.societe = texte(r.nom_raison_sociale) || texte(r.nom_complet);
  if (date(r.date_creation)) out.creee_le = texte(r.date_creation).slice(0, 10);
  const etabs = nombre(r.nombre_etablissements_ouverts);
  if (etabs !== undefined) out.etablissements = etabs;
  const dirigeants = Array.isArray(r.dirigeants) ? (r.dirigeants as Record<string, unknown>[]) : [];
  const d = dirigeants.find((x) => texte(x.type_dirigeant) === "personne physique") ?? dirigeants[0];
  if (d) {
    const nom = [texte(d.prenoms).split(" ")[0], texte(d.nom)].filter(Boolean).join(" ") || texte(d.denomination);
    if (nom) out.dirigeant = [nom, texte(d.qualite).toLowerCase()].filter(Boolean).join(", ");
  }
  const finances = objet<Record<string, Record<string, unknown>>>(r.finances);
  const annee = Object.keys(finances).filter((k) => /^\d{4}$/.test(k)).sort().pop();
  if (annee) {
    const ca = nombre(finances[annee]?.ca);
    const res = nombre(finances[annee]?.resultat_net);
    if (ca !== undefined && ca > 0) { out.ca = ca; out.ca_annee = Number(annee); }
    if (res !== undefined) out.resultat = res;
  }
  return out;
}
