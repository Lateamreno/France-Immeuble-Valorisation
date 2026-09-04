/**
 * Une pièce que le propriétaire a lui-même déposée.
 *
 * Le chemin vient de la base, qui a vérifié que la pièce est sur un de SES
 * immeubles. Il ne voit donc que ce qu'il a apporté — ni les baux du coffre,
 * ni les pièces d'un autre immeuble (garde-fou §8.3).
 */

import { cheminPiece, jetonSession } from "@/lib/bo/espace-anon";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jeton = await jetonSession();
  if (!jeton || !SB_KEY || !/^[0-9a-f-]{36}$/.test(id)) {
    return new Response("Introuvable", { status: 404 });
  }
  const chemin = await cheminPiece(jeton, id);
  if (!chemin) return new Response("Introuvable", { status: 404 });

  const res = await fetch(`${SB_URL}/storage/v1/object/bo-files/${chemin}`, {
    headers: { Authorization: `Bearer ${SB_KEY}` }, cache: "no-store",
  }).catch(() => null);
  if (!res?.ok || !res.body) return new Response("Introuvable", { status: 404 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
