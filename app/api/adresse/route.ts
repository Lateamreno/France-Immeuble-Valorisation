// Relais de la Base Adresse Nationale pour l'autocomplétion (retours #59/#60).
// Le serveur interroge la BAN et renvoie les propositions : le navigateur ne
// dépend d'aucun domaine externe (pare-feux d'entreprise, extensions…).
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 4) return Response.json({ features: [] });
  // Géoplateforme IGN d'abord (service pérenne de la BAN), ancien point
  // d'accès en secours — et jamais de cache sur une liste vide.
  const sources = [
    `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=6&index=address`,
    `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=6`,
  ];
  for (const url of sources) {
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (r?.ok) {
      const d = (await r.json()) as { features?: unknown[] };
      if (d.features?.length) return Response.json(d);
    }
  }
  return Response.json({ features: [] });
}
