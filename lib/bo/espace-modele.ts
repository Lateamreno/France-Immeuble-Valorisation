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
