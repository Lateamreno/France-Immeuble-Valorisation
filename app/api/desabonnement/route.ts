// Désabonnement « en un clic » (RFC 8058) : la messagerie poste ici quand le
// destinataire clique « Se désabonner » à côté de l'expéditeur. L'en-tête
// List-Unsubscribe ne part que si MASSE_DESABONNEMENT=1 (lib/bo/mail.ts).
import { NextRequest } from "next/server";
import { desabonner } from "@/lib/bo/campagnes-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const r = await desabonner(req.nextUrl.searchParams.get("t") ?? "").catch(() => ({ ok: false }));
  return Response.json({ ok: r.ok }, { status: r.ok ? 200 : 404 });
}
