// Proxy des photos Bubble : les fichiers `fileupload` sont privés (401 sans
// token) et le token ne doit jamais atteindre le navigateur. Cette route
// récupère l'image côté serveur (redirections suivies) et la sert avec du
// cache. Utilisée via next/image pour le redimensionnement.
import { NextRequest } from "next/server";

const ALLOWED_HOSTS = new Set([
  "vente.france-immeuble.fr",
  "s3.amazonaws.com",
]);

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) return new Response("missing u", { status: 400 });

  let url: URL;
  try {
    url = new URL(u.startsWith("//") ? `https:${u}` : u);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  const token = process.env.BUBBLE_API_TOKEN;
  const upstream = await fetch(url, {
    headers: token && url.hostname === "vente.france-immeuble.fr" ? { Authorization: `Bearer ${token}` } : {},
    redirect: "follow",
    next: { revalidate: 86400 },
  });
  if (!upstream.ok) return new Response("upstream error", { status: 502 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
