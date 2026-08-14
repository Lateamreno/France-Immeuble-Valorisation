import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Les vignettes passent par /api/photo?u=<url> (proxy authentifié vers les
    // fichiers Bubble privés) ; autoriser la query string pour next/image.
    localPatterns: [{ pathname: "/api/photo" }],
  },
  // Le Chromium qui imprime le dossier d'estimation ne doit pas être empaqueté
  // par le bundler : il embarque un binaire et ses fichiers de support.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // …et son dossier `bin` (le binaire compressé et les polices) n'est référencé
  // par aucun import : sans cette ligne, Vercel ne l'embarque pas et le
  // navigateur refuse de démarrer une fois déployé.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  experimental: {
    serverActions: {
      // Uploads photos/documents via Server Actions (bucket bo-files).
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
