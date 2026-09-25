// Relais de tuiles cartographiques.
// Les tuiles transitent par le serveur plutôt que par le navigateur : le poste
// de l'agent n'a besoin d'aucun accès direct aux serveurs de cartes, on envoie
// le User-Agent nominatif exigé par la politique d'usage d'OpenStreetMap, et
// les tuiles sont mises en cache côté CDN (elles ne changent quasiment jamais).
import { NextRequest } from "next/server";

const FONDS: Record<string, (z: number, x: number, y: number) => string> = {
  osm: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  clair: (z, x, y) => `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const z = Number(q.get("z"));
  const x = Number(q.get("x"));
  const y = Number(q.get("y"));
  const fond = FONDS[q.get("f") ?? "osm"] ?? FONDS.osm;
  const max = 2 ** z;
  if (!Number.isInteger(z) || z < 0 || z > 19 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= max || y >= max) {
    return new Response("tuile hors limites", { status: 400 });
  }

  const res = await fetch(fond(z, x, y), {
    headers: { "User-Agent": "France-Immeuble-BO/1.0 (contact: contact@france-immeuble.fr)" },
    next: { revalidate: 2592000 },
  }).catch(() => null);
  if (!res?.ok) return new Response("tuile indisponible", { status: 502 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/png",
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
