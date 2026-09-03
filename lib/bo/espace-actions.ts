"use server";

/**
 * L'espace propriétaire — ce qui s'écrit.
 *
 * Deux publics dans un seul fichier, et c'est voulu : les actions du BO
 * (ouvrir un lien, le révoquer, reprendre le prix) et celles du propriétaire
 * (poser son prix, déposer une pièce) partagent la même table et les mêmes
 * règles. Les séparer ferait diverger les deux moitiés d'un même verrou.
 *
 * ## La règle du jeton
 *
 * Aucune action publique ne prend d'identifiant d'immeuble. Elles prennent un
 * jeton, et le serveur en déduit l'immeuble. C'est ce qui fait qu'un
 * propriétaire ne peut pas déposer une pièce chez le voisin en changeant un
 * champ caché : il n'y a pas de champ à changer.
 *
 * Chaque action publique repasse par `lireEspace`, donc revérifie la
 * révocation et l'expiration. Un lien coupé pendant que la page est ouverte
 * cesse d'écrire, il ne se contente pas de disparaître de l'écran.
 */

import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { lireEspace } from "@/lib/bo/espace-proprietaire";
import { CATEGORIES_PIECE, type Reponse } from "@/lib/bo/espace-modele";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const entetes = (extra: Record<string, string> = {}) => ({
  apikey: SB_KEY as string,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

async function ecrire(chemin: string, methode: "POST" | "PATCH", corps: unknown) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    method: methode,
    headers: entetes({ Prefer: "return=representation" }),
    body: JSON.stringify(corps),
  });
  if (!res.ok) throw new Error(`${methode} ${chemin} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/**
 * Le jeton : 32 octets de hasard, en base64url — 43 caractères.
 *
 * MAV a choisi le lien sans mot de passe : pour un propriétaire de soixante-dix
 * ans, un code à saisir est une raison d'appeler l'agence plutôt que d'ouvrir
 * la page. Le lien porte donc seul la preuve d'accès, et il doit être
 * indevinable. 256 bits le sont ; un identifiant court ne l'est pas.
 */
const nouveauJeton = () => randomBytes(32).toString("base64url");

/** Durée de vie d'un lien, en jours. Le temps d'une décision de vente. */
const DUREE_JOURS = 120;

/* ---------- Côté BO ---------- */

/**
 * Ouvre (ou rouvre) l'espace d'un immeuble et rend son jeton.
 *
 * Un seul lien vivant par immeuble : rouvrir révoque le précédent. Sinon un
 * lien transféré par le propriétaire à un tiers resterait valable pour
 * toujours, sans que personne ne sache qu'il court.
 */
export async function ouvrirEspace(
  immeubleId: string,
  input: { estimationId?: string; contactId?: string; agent?: string } = {},
): Promise<string> {
  await ecrire(
    `fi_espace_proprietaire?immeuble_id=eq.${encodeURIComponent(immeubleId)}&revoque=is.false`,
    "PATCH",
    { revoque: true },
  ).catch(() => undefined);

  const jeton = nouveauJeton();
  const expire = new Date(Date.now() + DUREE_JOURS * 86400_000).toISOString();
  await ecrire("fi_espace_proprietaire", "POST", [{
    jeton,
    immeuble_id: immeubleId,
    estimation_id: input.estimationId ?? null,
    contact_id: input.contactId ?? null,
    cree_par: input.agent ?? null,
    expire_le: expire,
  }]);
  revalidatePath(`/bien/${immeubleId}`);
  return jeton;
}

/** Coupe le lien. La page cesse de s'ouvrir à la seconde suivante. */
export async function revoquerEspace(immeubleId: string, jeton: string) {
  await ecrire(`fi_espace_proprietaire?jeton=eq.${encodeURIComponent(jeton)}`, "PATCH", { revoque: true });
  revalidatePath(`/bien/${immeubleId}`);
}

/**
 * L'agent a repris le prix du propriétaire dans la fiche.
 *
 * On ne marque que la reprise : c'est `enregistrerPrix` qui écrit le prix, avec
 * son historique et son motif. Deux chemins d'écriture pour un même prix
 * finiraient par en donner deux versions.
 */
export async function marquerPrixRepris(immeubleId: string, jeton: string) {
  await ecrire(`fi_espace_proprietaire?jeton=eq.${encodeURIComponent(jeton)}`, "PATCH", {
    prix_repris: true,
    prix_repris_le: new Date().toISOString(),
  });
  revalidatePath(`/bien/${immeubleId}`);
}

/* ---------- Côté propriétaire ---------- */

/** Note la visite. Savoir qu'un lien a été ouvert sans suite vaut relance. */
export async function noterVisite(jeton: string) {
  const e = await lireEspace(jeton);
  if (typeof e === "string") return;
  const now = new Date().toISOString();
  await ecrire(`fi_espace_proprietaire?jeton=eq.${encodeURIComponent(jeton)}`, "PATCH", {
    ouvert_le: e.ouvert_le ?? now,
    derniere_visite: now,
    visites: e.visites + 1,
  }).catch(() => undefined);
}

const HORS_SERVICE: Reponse = {
  ok: false,
  message: "Ce lien n'est plus valable. Contactez votre conseiller France Immeuble.",
};

/**
 * Le propriétaire arrête son prix.
 *
 * Le montant est libre — MAV l'a tranché ainsi : un vendeur qui ne peut pas
 * écrire son chiffre appelle, et on perd le bénéfice de l'espace. Un prix hors
 * marché se reprend au téléphone, mais au moins on sait qu'il l'a en tête, et
 * on le sait AVANT le rendez-vous.
 *
 * Ce prix ne touche pas la fiche. Il attend que l'agent le reprenne — l'app
 * prépare, l'agent valide, comme pour tout envoi.
 */
export async function poserPrix(jeton: string, nv: number, mot: string): Promise<Reponse> {
  const e = await lireEspace(jeton);
  if (typeof e === "string") return HORS_SERVICE;
  if (!Number.isFinite(nv) || nv <= 0) {
    return { ok: false, message: "Indiquez un montant." };
  }
  /* Une borne de bon sens, pas une borne de marché : elle n'existe que pour
     arrêter une faute de frappe à douze zéros. */
  if (nv > 999_000_000) {
    return { ok: false, message: "Ce montant paraît erroné — vérifiez le nombre de chiffres." };
  }
  await ecrire(`fi_espace_proprietaire?jeton=eq.${encodeURIComponent(jeton)}`, "PATCH", {
    prix_nv: Math.round(nv),
    prix_le: new Date().toISOString(),
    prix_mot: mot.trim().slice(0, 2000) || null,
    /* Un nouveau prix redevient à valider : sinon un prix changé après coup
       resterait marqué « repris » et passerait inaperçu dans le BO. */
    prix_repris: false,
    prix_repris_le: null,
  });
  revalidatePath(`/bien/${e.immeuble_id}`);
  revalidatePath(`/proprietaire/${jeton}`);
  return { ok: true, message: "C'est noté. Votre conseiller revient vers vous." };
}

/** 25 Mo — la limite du coffre du BO, et celle des Server Actions (26 Mo). */
const TAILLE_MAX = 25 * 1024 * 1024;

const safeName = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(0, 120);

/**
 * Le propriétaire dépose une pièce.
 *
 * Elle va DIRECTEMENT dans le coffre de l'immeuble — c'est tout l'intérêt :
 * une pièce jointe à un e-mail, il faut la télécharger, la renommer et la
 * reverser. Deux écritures, donc : la ligne `bo_app_document` qui la fait
 * apparaître au coffre, et la ligne `fi_piece_proprietaire` qui garde la
 * provenance (qui, quand, quelle catégorie) — Bubble ne connaît pas cette
 * notion et l'effacerait.
 */
export async function deposerPiece(
  jeton: string,
  categorie: string,
  fd: FormData,
): Promise<Reponse> {
  const e = await lireEspace(jeton);
  if (typeof e === "string") return HORS_SERVICE;
  if (!CATEGORIES_PIECE.includes(categorie)) return { ok: false, message: "Catégorie inconnue." };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choisissez un fichier." };
  }
  if (file.size > TAILLE_MAX) {
    return { ok: false, message: "Fichier trop lourd : 25 Mo au maximum." };
  }

  const id = randomUUID();
  const chemin = `documents/${e.immeuble_id}/${id}-${safeName(file.name)}`;
  const up = await fetch(`${SB_URL}/storage/v1/object/bo-files/${chemin}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: Buffer.from(await file.arrayBuffer()),
  }).catch(() => null);
  if (!up?.ok) return { ok: false, message: "Le dépôt a échoué. Réessayez dans un instant." };

  const now = new Date().toISOString();
  const format = file.name.split(".").pop()?.toLowerCase() ?? "";
  const tailleKo = Math.round(file.size / 1024);
  const libelle = `${etiquette(categorie)} — ${file.name}`;

  /* Le coffre. `bo_insert_doc` est la porte d'entrée normale de bo_*. */
  const docId = `app_${Date.now()}x${Math.floor(Math.random() * 1e15)}`;
  await fetch(`${SB_URL}/rest/v1/rpc/bo_insert_doc`, {
    method: "POST",
    headers: entetes(),
    body: JSON.stringify({
      p_table: "bo_app_document",
      p_id: docId,
      p_doc: {
        _id: docId,
        IMMEUBLE: e.immeuble_id,
        name: libelle,
        file_name: file.name,
        path: chemin,
        format,
        size_kB: tailleKo,
        "Created Date": now,
        "Modified Date": now,
      },
    }),
  }).catch(() => null);

  await ecrire("fi_piece_proprietaire", "POST", [{
    id,
    jeton,
    immeuble_id: e.immeuble_id,
    categorie,
    nom: file.name,
    chemin,
    format,
    taille_ko: tailleKo,
    document_id: docId,
  }]);

  revalidatePath(`/bien/${e.immeuble_id}`);
  revalidatePath(`/proprietaire/${jeton}`);
  return { ok: true, message: `« ${file.name} » est bien arrivé.` };
}

function etiquette(cle: string) {
  return ({
    titre: "Titre de propriété",
    baux: "Bail",
    diagnostics: "Diagnostic",
    taxe: "Taxe foncière",
    charges: "Charges / travaux",
    autre: "Pièce du propriétaire",
  } as Record<string, string>)[cle] ?? "Pièce du propriétaire";
}

/** Retire une pièce déposée par erreur. Le fichier reste au coffre. */
export async function retirerPiece(jeton: string, pieceId: string): Promise<Reponse> {
  const e = await lireEspace(jeton);
  if (typeof e === "string") return HORS_SERVICE;
  if (!/^[0-9a-f-]{36}$/.test(pieceId)) return { ok: false, message: "Pièce inconnue." };
  await ecrire(
    `fi_piece_proprietaire?jeton=eq.${encodeURIComponent(jeton)}&id=eq.${pieceId}`,
    "PATCH",
    { supprime: true },
  );
  revalidatePath(`/proprietaire/${jeton}`);
  return { ok: true, message: "Pièce retirée de votre liste." };
}
