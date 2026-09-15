// Relais Google Street View — la façade d'un immeuble qui n'a pas encore de
// photo (dashboard).
//
// Sur les deux premières colonnes du dashboard, presque aucun immeuble n'a de
// photo : ils viennent d'arriver. Résultat, l'agent trie une liste de
// pictogrammes identiques. La vue de rue rend chaque ligne reconnaissable
// sans rien demander à personne.
//
// Même doctrine que /api/staticmap : la clé reste côté serveur, et sans clé
// on répond 404 — l'écran retombe alors sur son pictogramme, rien ne casse.
//
// ATTENTION à l'usage : ces images appartiennent à Google et leurs conditions
// interdisent de les réutiliser comme photo du bien. Elles servent de repère
// DANS l'outil, jamais dans un dossier de vente ni dans une annonce.
import { NextRequest } from "next/server";

export const revalidate = 2592000; // 30 jours : une façade ne bouge pas.

const CLE = () =>
  process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

export async function GET(req: NextRequest) {
  const cle = CLE();
  if (!cle) return new Response("clé Google Maps non configurée", { status: 404 });

  const adresse = (req.nextUrl.searchParams.get("a") ?? "").trim();
  // Une adresse sans rue (« , 79110 Chef-Boutonne ») situerait un point au
  // hasard dans la commune : ça ne repère rien, autant ne rien montrer.
  const rue = adresse.split(",")[0].trim();
  if (rue.length < 4) return new Response("adresse trop imprécise", { status: 404 });

  const w = Math.min(640, Math.max(80, Number(req.nextUrl.searchParams.get("w") ?? 164)));
  const h = Math.min(640, Math.max(80, Number(req.nextUrl.searchParams.get("h") ?? 152)));
  const lieu = encodeURIComponent(adresse);

  // L'appel « metadata » est gratuit et dit si une prise de vue existe. Sans
  // lui, Google facturerait l'image ET renverrait une tuile grise « no
  // imagery » — le pictogramme est plus honnête que ça.
  const meta = await fetch(
    `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lieu}&key=${cle}`,
    { next: { revalidate: 2592000 } },
  ).then((r) => r.json() as Promise<{ status?: string }>).catch(() => null);
  if (meta?.status !== "OK") return new Response("pas de vue de rue", { status: 404 });

  const r = await fetch(
    `https://maps.googleapis.com/maps/api/streetview?location=${lieu}` +
      `&size=${w}x${h}&fov=80&pitch=8&return_error_code=true&key=${cle}`,
    { next: { revalidate: 2592000 } },
  );
  if (!r.ok) return new Response("vue de rue indisponible", { status: 404 });

  return new Response(r.body, {
    headers: {
      "Content-Type": r.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
