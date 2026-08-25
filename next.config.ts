import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Les vignettes passent par /api/photo?u=<url> (proxy authentifié vers les
    // fichiers Bubble privés) ; autoriser la query string pour next/image.
    localPatterns: [{ pathname: "/api/photo" }],
  },
  // Le Chromium qui imprime le dossier d'estimation ne doit pas être empaqueté
  // par le bundler : il embarque un binaire et ses fichiers de support.
  // `sharp` embarque du binaire natif et `heic-convert` un décodeur
  // WebAssembly (libheif) : les empaqueter les casserait.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "sharp", "heic-convert"],
  // …et son dossier `bin` (le binaire compressé et les polices) n'est référencé
  // par aucun import : sans cette ligne, Vercel ne l'embarque pas et le
  // navigateur refuse de démarrer une fois déployé.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@sparticuz/chromium/bin/**",
      // Même problème pour `sharp`, et il coûtait cher : le binaire natif
      // `@img/sharp-linux-x64` est chargé par un `require`, donc tracé — mais
      // la bibliothèque qu'il ouvre ensuite, `libvips-cpp.so`, l'est par
      // l'éditeur de liens du système. Aucune analyse statique ne peut la
      // voir, donc Vercel ne l'embarquait pas, et sharp échouait au premier
      // appel : « libvips-cpp.so.8.18.3: cannot open shared object file ».
      // En clair : plus aucune photo ne pouvait être ajoutée en production.
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
  },
  experimental: {
    serverActions: {
      // Uploads photos/documents via Server Actions (bucket bo-files).
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
