/**
 * Le dossier de vente d'un bien proposé.
 *
 * Route à part, et non `/api/photo?s=<chemin>` : cette dernière sert n'importe
 * quel objet du seau privé à qui connaît le chemin. Ici, on repart de la
 * proposition et on vérifie qu'elle appartient au client connecté — c'est la
 * proposition qui prouve qu'on lui a bien envoyé ce bien.
 */

import { clientConnecte } from "@/lib/bo/compte-client";
import { bienPropose } from "@/lib/bo/espace-client";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const compte = await clientConnecte();
  if (!compte || !SB_KEY) return new Response("Introuvable", { status: 404 });

  const detail = await bienPropose(id, compte.contact_id);
  if (!detail?.cheminDossier) return new Response("Introuvable", { status: 404 });

  const res = await fetch(`${SB_URL}/storage/v1/object/bo-files/${detail.cheminDossier}`, {
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
