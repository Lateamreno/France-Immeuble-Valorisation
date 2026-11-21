import type { MetadataRoute } from "next";

/**
 * Manifeste PWA : « Ajouter à l'écran d'accueil » sur iPhone ouvre le BO en
 * plein écran, sans la barre d'adresse de Safari — ce qui rend l'écran de
 * saisie des lots utilisable d'une main pendant une visite.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "France Immeuble — Back-office",
    short_name: "France Immeuble",
    description:
      "Back-office France Immeuble : prospection, estimation et commercialisation d'immeubles de rapport.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fafafa",
    theme_color: "#121110",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
