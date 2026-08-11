import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Les vignettes passent par /api/photo?u=<url> (proxy authentifié vers les
    // fichiers Bubble privés) ; autoriser la query string pour next/image.
    localPatterns: [{ pathname: "/api/photo" }],
  },
  experimental: {
    serverActions: {
      // Uploads photos/documents via Server Actions (bucket bo-files).
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
