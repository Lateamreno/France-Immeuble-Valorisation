// Proxy des photos Bubble : les fichiers `fileupload` sont privés (401 sans
// token) et le token ne doit jamais atteindre le navigateur. Cette route
// récupère l'image côté serveur (redirections suivies) et la sert avec du
// cache. Utilisée via next/image pour le redimensionnement.
import { NextRequest } from "next/server";

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
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
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

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
