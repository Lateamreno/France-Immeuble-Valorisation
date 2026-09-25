"use server";

/**
 * Le dépôt d'une pièce — la seule exception au cloisonnement, et elle est
 * étroite.
 *
 * Tout le reste de l'espace client passe par la clé publique, qui ne peut rien
 * lire. Un seul geste y échappe : écrire le fichier dans le seau de stockage,
 * qui ne s'ouvre pas à `anon`. Il faut donc la clé de service ici.
 *
 * Ce qui rend l'exception tenable, c'est l'ordre des opérations :
 *
 *   1. la base vérifie d'abord, par la clé publique, que l'immeuble est bien
 *      celui du client connecté ;
 *   2. seulement ensuite le fichier est écrit, à un chemin que NOUS
 *      composons — le nom du fichier est nettoyé, l'identifiant est tiré au
 *      sort, et l'immeuble vient de l'étape 1, jamais de la requête ;
 *   3. la clé de service ne fait rien d'autre : un PUT et une insertion de
 *      document. Elle ne lit aucune table, ne prend aucun filtre de
 *      l'appelant, et n'est utilisée nulle part ailleurs dans l'espace client.
 *
 * Autrement dit : la décision d'autorisation est prise là où elle doit l'être —
 * dans la base — et la clé puissante n'exécute qu'un geste déjà autorisé.
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { enregistrerPieceSql, estMonImmeuble, jetonSession } from "@/lib/bo/espace-anon";
import { CATEGORIES_PIECE, type Reponse } from "@/lib/bo/espace-modele";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** 25 Mo — la limite du coffre, et celle des Server Actions (26 Mo). */
const TAILLE_MAX = 25 * 1024 * 1024;

const nomSur = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(0, 120);

const ETIQUETTE: Record<string, string> = {
  titre: "Titre de propriété", baux: "Bail", diagnostics: "Diagnostic",
  taxe: "Taxe foncière", charges: "Charges / travaux", autre: "Pièce du propriétaire",
};

export async function deposerPiece(
  immeubleId: string, categorie: string, fd: FormData,
): Promise<Reponse> {
  const j = await jetonSession();
  if (!j) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  if (!CATEGORIES_PIECE.includes(categorie)) return { ok: false, message: "Catégorie inconnue." };

  /* L'autorisation, d'abord, et par la base. */
  if (!(await estMonImmeuble(j, immeubleId))) {
    return { ok: false, message: "Cet immeuble ne figure pas parmi les vôtres." };
  }

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choisissez un fichier." };
  if (file.size > TAILLE_MAX) return { ok: false, message: "Fichier trop lourd : 25 Mo au maximum." };
  if (!SB_KEY) return { ok: false, message: "Dépôt momentanément indisponible." };

  const id = randomUUID();
  const chemin = `documents/${immeubleId}/${id}-${nomSur(file.name)}`;
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

  /* La pièce arrive au coffre de l'immeuble : c'est tout l'intérêt du dépôt
     en ligne — sinon il faudrait la télécharger d'un e-mail et la reverser. */
  const now = new Date().toISOString();
  const format = file.name.split(".").pop()?.toLowerCase() ?? "";
  const tailleKo = Math.round(file.size / 1024);
  const docId = `app_${Date.now()}x${Math.floor(Math.random() * 1e15)}`;
  await fetch(`${SB_URL}/rest/v1/rpc/bo_insert_doc`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_table: "bo_app_document",
      p_id: docId,
      p_doc: {
        _id: docId, IMMEUBLE: immeubleId,
        name: `${ETIQUETTE[categorie] ?? "Pièce"} — ${file.name}`,
        file_name: file.name, path: chemin, format, size_kB: tailleKo,
        "Created Date": now, "Modified Date": now,
      },
    }),
  }).catch(() => null);

  /* La trace de provenance repart par la clé publique : c'est la base qui
     revérifie l'appartenance avant d'écrire la ligne. */
  const ok = await enregistrerPieceSql(j, {
    immeubleId, categorie, nom: file.name, chemin, format, tailleKo, documentId: docId,
  });
  if (!ok) return { ok: false, message: "Le dépôt a échoué. Réessayez dans un instant." };

  revalidatePath(`/espace/bien/${immeubleId}`);
  revalidatePath(`/bien/${immeubleId}`);
  return { ok: true, message: `« ${file.name} » est bien arrivé.` };
}
