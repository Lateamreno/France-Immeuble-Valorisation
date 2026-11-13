// Les adresses publiques du site France Immeuble, utilisables côté navigateur.
// Rien de secret : ce sont des pages que tout le monde peut ouvrir.

export const SITE_PUBLIC = (process.env.NEXT_PUBLIC_SITE_FI_URL ?? "https://france-immeuble-refonte-site.vercel.app").replace(/\/+$/, "");

/** La page du compte client sur le site (contrat §9.1). */
export const COMPTE_SITE_URL = `${SITE_PUBLIC}/mon-compte/`;
