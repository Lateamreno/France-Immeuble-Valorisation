/**
 * Le téléchargement d'une pièce que le propriétaire a lui-même déposée.
 *
 * Le BO a déjà `/api/photo?s=<chemin>`, qui sert n'importe quel objet du seau
 * privé à qui connaît le chemin. On ne s'en sert PAS ici : un espace ouvert sur
 * l'extérieur ne doit pas donner une porte où le chemin est le mot de passe.
 *
 * Ici, la vérification est double et faite en base : la pièce doit exister, et
 * elle doit appartenir à CE jeton. Le propriétaire ne voit donc que ce qu'il a
 * apporté — ni les baux caviardés du coffre, ni les pièces d'un autre immeuble
 * (garde-fou §8.3).
 */

import { cheminDeLaPiece } from "@/lib/bo/espace-proprietaire";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jeton: string; id: string }> },
) {
  const { jeton, id } = await params;
  const chemin = await cheminDeLaPiece(jeton, id);
  if (!chemin || !SB_KEY) return new Response("Introuvable", { status: 404 });

  const res = await fetch(`${SB_URL}/storage/v1/object/bo-files/${chemin}`, {
    headers: { Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok || !res.body) return new Response("Introuvable", { status: 404 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      /* Jamais en cache partagé : l'URL porte un jeton. */
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
