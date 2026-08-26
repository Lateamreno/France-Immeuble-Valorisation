// Proxy des photos Bubble : les fichiers `fileupload` sont privés (401 sans
// token) et le token ne doit jamais atteindre le navigateur. Cette route
// récupère l'image côté serveur (redirections suivies) et la sert avec du
// cache. Utilisée via next/image pour le redimensionnement.
import { NextRequest } from "next/server";
import sharp from "sharp";

/* #168 — « sur la photo j'ai encore un encadrement gris des deux côtés
   latéraux ». Ce liseré n'est pas dans la mise en page : il est DANS le
   fichier. Mesuré sur la photo de couverture de Bordeaux, il fait 14 px à
   gauche, 15 à droite, 14 en haut et 18 en bas — soit 2,5 à 4 % de l'image.
   Le recadrage CSS ne pouvait pas s'en sortir sans zoomer bêtement : on le
   retire à la source, en rognant la bordure unie que sharp sait reconnaître.
   `?trim=1` le demande explicitement — les photos de la fiche, elles, restent
   servies telles quelles. */
async function rogner(bytes: ArrayBuffer, type: string): Promise<Response> {
  try {
    const out = await sharp(Buffer.from(bytes), { failOn: "none" })
      .rotate()
      // Seuil large : le liseré est clair et uni, le sujet ne l'est jamais.
      .trim({ threshold: 24 })
      .toBuffer();
    return new Response(new Uint8Array(out), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, immutable" },
    });
  } catch {
    /* Un format que sharp ne sait pas ouvrir : mieux vaut la photo avec son
       liseré que pas de photo du tout. */
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, immutable" },
    });
  }
}

const ALLOWED_HOSTS = new Set([
  "vente.france-immeuble.fr",
  "s3.amazonaws.com",
]);
/** Les pièces jointes Bubble sont aussi servies depuis leur CDN. */
const hoteAutorise = (h: string) =>
  ALLOWED_HOSTS.has(h) || h === "cdn.bubble.io" || h.endsWith(".cdn.bubble.io");

/** Pixel transparent : une image source cassée ne doit pas casser la page. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const pixel = () =>
  new Response(new Uint8Array(PIXEL), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" },
  });

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";

export async function GET(req: NextRequest) {
  // Fichiers du bucket privé Supabase (`bo-files`) : ?s=<chemin dans le bucket>
  const s = req.nextUrl.searchParams.get("s");
  if (s) {
    if (s.includes("..")) return new Response("bad path", { status: 400 });
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return new Response("storage indisponible", { status: 503 });
    const upstream = await fetch(`${SB_URL}/storage/v1/object/bo-files/${s}`, {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 86400 },
    });
    if (!upstream.ok) return pixel();
    const type = upstream.headers.get("Content-Type") ?? "application/octet-stream";
    if (req.nextUrl.searchParams.get("trim") === "1" && type.startsWith("image/")) {
      return rogner(await upstream.arrayBuffer(), type);
    }
    // Un PDF doit s'ouvrir dans le lecteur du navigateur quand on clique
    // dessus, pas se télécharger : « inline » plus un nom de fichier lisible.
    const nom = s.split("/").pop() || "document";
    return new Response(upstream.body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `inline; filename="${nom.replace(/"/g, "")}"`,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  const u = req.nextUrl.searchParams.get("u");
  if (!u) return new Response("missing u", { status: 400 });

  let url: URL;
  try {
    url = new URL(u.startsWith("//") ? `https:${u}` : u);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (url.protocol !== "https:" || !hoteAutorise(url.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  const token = process.env.BUBBLE_API_TOKEN;
  const upstream = await fetch(url, {
    headers: token && url.hostname === "vente.france-immeuble.fr" ? { Authorization: `Bearer ${token}` } : {},
    redirect: "follow",
    next: { revalidate: 86400 },
  });
  if (!upstream.ok) return pixel();

  const type = upstream.headers.get("Content-Type") ?? "image/jpeg";
  if (req.nextUrl.searchParams.get("trim") === "1") {
    return rogner(await upstream.arrayBuffer(), type);
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, immutable" },
  });
}
