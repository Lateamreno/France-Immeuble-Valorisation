// Relais Google Static Maps.
//
// La clé reste côté serveur : le navigateur demande /api/staticmap, jamais
// Google directement. Deux avantages — la clé n'est pas lisible dans le code
// de la page, et elle n'a pas besoin d'être ouverte à un domaine référent
// (une clé restreinte « par référent HTTP » ne marche que dans un navigateur,
// pas pour la capture serveur).
//
// Sans clé configurée, on répond 404 : l'écran retombe alors sur la mosaïque
// OpenStreetMap, qui ne demande rien.
import { NextRequest } from "next/server";

export const revalidate = 86400;

const CLE = () =>
  process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

export async function GET(req: NextRequest) {
  const cle = CLE();
  if (!cle) return new Response("clé Google Maps non configurée", { status: 404 });

  const p = req.nextUrl.searchParams;
  const lat = Number(p.get("lat"));
  const lon = Number(p.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response("coordonnées manquantes", { status: 400 });
  }
  const z = Math.min(20, Math.max(1, Number(p.get("z") ?? 14)));
  const w = Math.min(640, Math.max(80, Number(p.get("w") ?? 400)));
  const h = Math.min(640, Math.max(80, Number(p.get("h") ?? 300)));
  const type = p.get("sat") === "1" ? "hybrid" : "roadmap";
  // Marqueur seulement sur la vue rapprochée : au zoom région il masquerait
  // la ville qu'il est censé situer.
  const marqueur = p.get("pin") === "0" ? "" : `&markers=color:red%7C${lat},${lon}`;

  const url =
    `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}` +
    `&zoom=${z}&size=${w}x${h}&scale=2&maptype=${type}${marqueur}&key=${cle}`;

  const r = await fetch(url, { next: { revalidate: 86400 } });
  if (!r.ok) {
    // Google renvoie le motif du refus en clair (clé restreinte, facturation
    // désactivée…) : on le laisse remonter, c'est ce qui permet de corriger.
    return new Response(await r.text(), { status: r.status });
  }
  return new Response(r.body, {
    headers: {
      "Content-Type": r.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
