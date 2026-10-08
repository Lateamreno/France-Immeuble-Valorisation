/**
 * L'espace propriétaire — le vocabulaire commun aux deux côtés.
 *
 * Les types et les listes que partagent le serveur (qui les remplit) et
 * l'écran du vendeur (qui les affiche). Ce fichier n'importe RIEN : pas de
 * `server-only`, pas d'accès base. C'est ce qui lui permet d'être lu depuis un
 * composant client sans y entraîner la clé de service.
 */

/** Une ligne de `fi_espace_proprietaire`. */
export type Espace = {
  jeton: string;
  immeuble_id: string;
  estimation_id: string | null;
  contact_id: string | null;
  cree_le: string;
  cree_par: string | null;
  expire_le: string | null;
  revoque: boolean;
  ouvert_le: string | null;
  derniere_visite: string | null;
  visites: number;
  prix_nv: number | null;
  prix_le: string | null;
  prix_mot: string | null;
  prix_repris: boolean;
  prix_repris_le: string | null;
};

/** Une pièce déposée par le propriétaire. */
export type Piece = {
  id: string;
  categorie: string;
  nom: string;
  format: string | null;
  taille_ko: number | null;
  depose_le: string;
};

/** Les pièces qu'on demande au vendeur, dans l'ordre où on les lui demande. */
export const PIECES_DEMANDEES = [
  { cle: "titre", label: "Titre de propriété", aide: "L'acte notarié d'acquisition de l'immeuble." },
  { cle: "baux", label: "Baux en cours", aide: "Un fichier par bail, ou un seul document regroupant tout." },
  { cle: "diagnostics", label: "Diagnostics", aide: "DPE, amiante, plomb, électricité, gaz — même anciens." },
  { cle: "taxe", label: "Taxe foncière", aide: "Le dernier avis reçu." },
  { cle: "charges", label: "Charges et travaux", aide: "Appels de charges, devis, factures de travaux récents." },
  { cle: "autre", label: "Autre pièce", aide: "Tout ce qui vous paraît utile." },
] as const;

export const CATEGORIES_PIECE = PIECES_DEMANDEES.map((p) => p.cle) as readonly string[];

export const libelleCategorie = (cle: string) =>
  PIECES_DEMANDEES.find((p) => p.cle === cle)?.label ?? "Autre pièce";

/** Les jalons de la vente, dits comme un propriétaire les comprend. */
export const JALONS = [
  { cle: "estimation", label: "Estimation", detail: "Nous avons chiffré votre immeuble." },
  { cle: "mandat", label: "Mandat signé", detail: "Nous sommes mandatés pour vendre." },
  { cle: "commercialisation", label: "En commercialisation", detail: "Votre immeuble est présenté aux acquéreurs." },
  { cle: "offre", label: "Offre reçue", detail: "Un acquéreur s'est positionné." },
  { cle: "compromis", label: "Compromis", detail: "L'avant-contrat est signé." },
  { cle: "acte", label: "Acte authentique", detail: "La vente est faite." },
] as const;

/** Ce que l'espace montre au propriétaire. Rien de plus n'est calculé. */
export type VueProprietaire = {
  adresse: string;
  ville: string;
  nbLots: number;
  surface?: number;
  /** Le prix que France Immeuble a estimé, en net vendeur et en HAI. */
  estimationNv?: number;
  estimationHai?: number;
  tauxHonos: number;
  /** Le cran atteint, index dans JALONS. */
  jalon: number;
  mandatSigneLe?: string;
  /** Combien de visites ont EU LIEU. Ni qui, ni ce qu'ils en ont dit. */
  visitesEffectuees: number;
  /** Combien d'acquéreurs ont reçu le dossier. Aucun nom. */
  acquereursContactes: number;
  /** Une offre est-elle en cours ? Ni de qui, ni de combien. */
  offreEnCours: boolean;
  agentNom?: string;
  agentTel?: string;
};

/** Ce que rend une action publique : une phrase à afficher, rien de technique. */
export type Reponse = { ok: boolean; message: string };

/* ---------- Le secteur, vu par le propriétaire (MAV, 25/09) ---------- */

/**
 * Ce que rend `ec_secteur_immeuble` — et ce que l'aperçu du BO refabrique.
 *
 * `secteur` est `null` tant qu'aucun agent n'a confirmé les repères de la
 * fiche : un chiffre posé automatiquement depuis DVF ou la carte des loyers
 * n'atteint jamais le propriétaire sans être passé sous les yeux de quelqu'un.
 * `immeuble` porte les entrées BRUTES du tableau Actuel / Potentiel ; le calcul
 * se fait à l'écran avec `rendements()` (lib/bo/rendements.ts), la même
 * fonction que l'écran Prix du BO — une seule formule, deux vitrines.
 */
export type SecteurImmeuble = {
  secteur: {
    /** Loyer moyen du secteur, en €/m²/mois (stocké au mois, comme la fiche). */
    loyerM2: number;
    /** Prix de vente du secteur, en €/m². */
    prixM2: number;
    /** Rendement brut du secteur, en %. */
    renta: number | null;
    /** Quand un agent a vérifié ces chiffres (ISO). */
    verifieLe: string | null;
    annee: number | null;
    ville: string;
    insee: string | null;
    liens: { dvf: string; loyers: string; notaires: string };
  } | null;
  immeuble: {
    loyersAn: number;
    loyersMaxAn: number;
    surface: number;
    surfaceOccupee: number;
    charges: number;
    travaux: number;
    prixHai: number | null;
    destination: string;
  };
  /** Sans adresse, sans identifiant, sans nom (§8.3, §8.4). */
  comparables: {
    ville: string;
    nbLots: number | null;
    surface: number;
    prixM2: number;
    renta: number | null;
    /** L'année de la vente ; `null` pour un bien à vendre. */
    annee: number | null;
    statut: "vendu" | "a_vendre";
  }[];
};

/**
 * Les liens publics pour vérifier les repères — les mêmes que la vignette
 * « Prix du secteur » de la fiche, et les mêmes que ceux qu'écrit la fonction
 * SQL (lib/bo/sql/ec_secteur_immeuble.sql). DVF n'accepte aucun paramètre
 * dans son adresse : on ouvre la carte. Les notaires descendent à la commune
 * par son code INSEE — à Paris, Lyon et Marseille, celui de l'arrondissement.
 */
export function liensSecteur(insee: string | null, dep: string | null) {
  const notaires = insee
    ? `https://www.immobilier.notaires.fr/fr/prix-immobilier?typeLocalisation=${
        /^(751|6938|132)\d{2}$/.test(insee) ? "ARRONDISSEMENT" : "COMMUNE"
      }&codeInsee=${insee}&neuf=A`
    : dep
      ? `https://www.immobilier.notaires.fr/fr/prix-immobilier?typeLocalisation=DEPARTEMENT&codeInsee=${dep}&neuf=A`
      : "https://www.immobilier.notaires.fr/fr/prix-immobilier";
  return {
    dvf: "https://app.dvf.etalab.gouv.fr/",
    loyers: "https://www.ecologie.gouv.fr/politiques-publiques/carte-loyers",
    notaires,
  };
}

/** Un nom de commune ramené à sa forme comparable (miroir de `ec_norm_commune`). */
export const normCommune = (nom: string) =>
  nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Le département d'un code postal : trois chiffres outre-mer, deux ailleurs. */
export const depDuCp = (cp: string) => {
  const c = cp.trim();
  if (!c) return null;
  return c.slice(0, c.startsWith("97") || c.startsWith("98") ? 3 : 2) || null;
};
