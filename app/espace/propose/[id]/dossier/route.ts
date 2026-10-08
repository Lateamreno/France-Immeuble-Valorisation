/**
 * Le dossier de vente d'un bien proposé.
 *
 * Le chemin du fichier vient de la BASE, qui a vérifié que la proposition
 * appartient au client connecté — jamais de l'URL. `/api/photo?s=` sert
 * n'importe quel objet du seau à qui connaît le chemin : il n'a pas sa place
 * dans un espace ouvert sur l'extérieur.
 */

import { cheminDossier, jetonSession } from "@/lib/bo/espace-anon";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jeton = await jetonSession();
  if (!jeton || !SB_KEY) return new Response("Introuvable", { status: 404 });

  const chemin = await cheminDossier(jeton, id);
  if (!chemin) return new Response("Introuvable", { status: 404 });

  const res = await fetch(`${SB_URL}/storage/v1/object/bo-files/${chemin}`, {
    headers: { Authorization: `Bearer ${SB_KEY}` }, cache: "no-store",
  }).catch(() => null);
  if (!res?.ok || !res.body) return new Response("Introuvable", { status: 404 });

  return new Response(res.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Dossier.pdf"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
