/**
 * La porte unique de l'espace client — et la seule clé qu'il porte.
 *
 * MAV : « que ce soit les vendeurs et surtout les acquéreurs il faut que ce
 * soit ultra compartimenté pour que les hackeurs n'aient pas accès à la base. »
 *
 * ## Ce qui a changé, et pourquoi c'est le point important
 *
 * Jusqu'ici les pages de l'espace client tournaient avec la clé de SERVICE,
 * celle qui lit et écrit toutes les tables. Un filtre oublié, une variable mal
 * nommée, et c'est la base entière qui sort : 42 000 contacts, 1 800
 * immeubles, les mandats. Aucune relecture attentive ne rend ce risque nul,
 * parce que le risque n'est pas dans une ligne en particulier — il est dans le
 * fait que le pouvoir de tout lire soit là, à portée d'une faute.
 *
 * On le lui retire. Ce module porte la clé PUBLIQUE (`anon`), qui ne peut lire
 * AUCUNE table — RLS active, aucune policy — et n'a le droit d'appeler que la
 * vingtaine de fonctions `ec_*` créées pour l'espace client. Chacune exige un
 * jeton de session, le résout elle-même en contact, et ne rend que les lignes
 * de ce contact.
 *
 * Conséquences concrètes :
 * - il n'y a pas de nom de table dans ce fichier, donc rien à détourner ;
 * - un attaquant qui vole la clé publique n'obtient rien : sans session, les
 *   fonctions rendent le vide ;
 * - avec une session volée, il n'obtient que le dossier de son propriétaire ;
 * - une faute dans une page ne peut pas élargir le périmètre, puisque le
 *   périmètre est en base, pas dans le code.
 *
 * **Une seule exception, assumée et étroite** : le dépôt d'un fichier dans le
 * seau et sa copie au coffre, qui exigent la clé de service (le stockage ne
 * s'ouvre pas à `anon`). Elle est isolée dans `espace-depot.ts`, où l'immeuble
 * n'est jamais celui que l'appelant annonce mais celui que la base confirme.
 */

import "server-only";
import { cookies } from "next/headers";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
/* La clé publique. Elle n'ouvre rien par elle-même : c'est tout l'intérêt.
   Elle peut donc vivre en clair, contrairement à la clé de service. */
const CLE_PUBLIQUE =
  process.env.SUPABASE_ANON_KEY ?? "sb_publishable_7XpMcnr6F_oWjJ9bYXAnvQ_JK5122Ns";

export const COOKIE_SESSION = "fi_client";

/**
 * Appelle une fonction de l'espace client.
 *
 * Le nom de la fonction est un littéral chez l'appelant, jamais une variable
 * venue d'une requête : c'est ce qui garantit qu'on ne peut pas se faire
 * appeler une fonction qu'on n'a pas prévue.
 */
async function ec<T>(fonction: string, args: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fonction}`, {
    method: "POST",
    headers: {
      apikey: CLE_PUBLIQUE,
      Authorization: `Bearer ${CLE_PUBLIQUE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const texte = await res.text();
  if (!texte) return null;
  try { return JSON.parse(texte) as T; } catch { return null; }
}

/** Le jeton de session du navigateur, s'il en a un de forme plausible. */
export async function jetonSession(): Promise<string | null> {
  const j = (await cookies()).get(COOKIE_SESSION)?.value;
  return j && /^[A-Za-z0-9_-]{20,80}$/.test(j) ? j : null;
}

/* ---------- Identité ---------- */

export type Moi = { email: string; nouveau: boolean };

export async function moi(): Promise<Moi | null> {
  const j = await jetonSession();
  return j ? await ec<Moi>("ec_moi", { p_session: j }) : null;
}

export const connexionSql = (email: string, mdp: string) =>
  ec<string>("ec_connexion", { p_email: email, p_mdp: mdp });

export const deconnexionSql = (jeton: string) =>
  ec<null>("ec_deconnexion", { p_session: jeton });

export const usageDuJeton = (jeton: string) =>
  ec<"activation" | "reinitialisation" | null>("ec_jeton_usage", { p_jeton: jeton });

export const poserMdpSql = (jeton: string, mdp: string) =>
  ec<string>("ec_poser_mdp", { p_jeton: jeton, p_mdp: mdp });

export const demanderReinitSql = (email: string) =>
  ec<null>("ec_demander_reinit", { p_email: email });

/**
 * Échange un lien secret contre une session courte.
 *
 * C'est ce qui permet de garder le lien sans mot de passe SANS ouvrir un
 * second chemin d'accès : le lien se présente au même guichet que tout le
 * monde, et repart avec la même sorte de laissez-passer.
 */
export const sessionParLien = (lien: string) =>
  ec<string>("ec_session_par_lien", { p_lien: lien });

/* ---------- Côté vendeur ---------- */

export type BienVendeur = {
  id: string; adresse: string; ville: string; nbLots: number;
  surface: number | null; statut: string;
  /** Le prix affiché à la vente, et sa décomposition. */
  prixAffiche: number | null; prixNv: number | null; honos: number | null;
  /** Ce que le propriétaire a lui-même arrêté, s'il l'a fait. */
  prixDemande: number | null; motDemande: string | null;
  /** Des compteurs, jamais des noms (garde-fou §8.3). */
  visites: number; acquereurs: number; offreEnCours: boolean;
  mandatSigneLe: string | null;
};

export const mesImmeubles = async (j: string) =>
  (await ec<BienVendeur[]>("ec_mes_immeubles", { p_session: j })) ?? [];

export const estMonImmeuble = async (j: string, immeubleId: string) =>
  (await ec<boolean>("ec_mon_immeuble", { p_session: j, p_immeuble: immeubleId })) === true;

export type PieceClient = {
  id: string; categorie: string; nom: string;
  taille_ko: number | null; depose_le: string;
};

export const mesPieces = async (j: string, immeubleId: string) =>
  (await ec<PieceClient[]>("ec_mes_pieces", { p_session: j, p_immeuble: immeubleId })) ?? [];

export const cheminPiece = (j: string, pieceId: string) =>
  ec<string>("ec_chemin_piece", { p_session: j, p_piece: pieceId });

export const retirerPieceSql = (j: string, pieceId: string) =>
  ec<boolean>("ec_retirer_piece", { p_session: j, p_piece: pieceId });

export const poserPrixSql = (j: string, immeubleId: string, prix: number, mot: string) =>
  ec<boolean>("ec_poser_prix", { p_session: j, p_immeuble: immeubleId, p_prix: prix, p_mot: mot });

export const enregistrerPieceSql = (j: string, p: {
  immeubleId: string; categorie: string; nom: string; chemin: string;
  format: string; tailleKo: number; documentId: string;
}) => ec<boolean>("ec_enregistrer_piece", {
  p_session: j, p_immeuble: p.immeubleId, p_categorie: p.categorie, p_nom: p.nom,
  p_chemin: p.chemin, p_format: p.format, p_taille_ko: p.tailleKo, p_document_id: p.documentId,
});

/* ---------- Côté acquéreur ---------- */

export type RechercheClient = {
  id: string; villes: string[]; dpts: string[]; destinations: string[];
  surfaceMin: number | null; surfaceMax: number | null;
  prixMin: number | null; prixMax: number | null; renta: number | null;
  commentaire: string; enPause: boolean;
};

export const mesRecherches = async (j: string) =>
  (await ec<RechercheClient[]>("ec_mes_recherches", { p_session: j })) ?? [];

export const majRechercheSql = (j: string, id: string | null, criteres: Record<string, unknown>) =>
  ec<string>("ec_maj_recherche", { p_session: j, p_id: id, p_criteres: criteres });

export type PropositionClient = {
  id: string; immeubleId: string; adresse: string; ville: string; le: string | null;
  prixAffiche: number | null; surface: number | null; nbLots: number;
  loyers: number | null; dossier: boolean;
  reponse: "interesse" | "visite" | "pas_interesse" | null;
};

export const mesPropositions = async (j: string) =>
  (await ec<PropositionClient[]>("ec_mes_propositions", { p_session: j })) ?? [];

export type BienPropose = PropositionClient & { descriptif: string; photos: string[] };

export const bienPropose = (j: string, propositionId: string) =>
  ec<BienPropose | null>("ec_bien_propose", { p_session: j, p_proposition: propositionId });

export type BienEnLigne = {
  immeubleId: string; ville: string; nbLots: number; surface: number | null;
  prixAffiche: number | null; loyers: number | null; url: string; publieLe: string | null;
};

export const biensEnLigne = async (j: string) =>
  (await ec<BienEnLigne[]>("ec_biens_en_ligne", { p_session: j })) ?? [];

export const repondreSql = (j: string, propositionId: string, reponse: string, mot: string) =>
  ec<boolean>("ec_repondre", {
    p_session: j, p_proposition: propositionId, p_reponse: reponse, p_mot: mot,
  });

export const cheminDossier = (j: string, propositionId: string) =>
  ec<string>("ec_chemin_dossier", { p_session: j, p_proposition: propositionId });
