// Navigation — réplique de la sidebar du BO Bubble actuel
// (libellés, ordre et compteurs relevés sur les captures).
export type NavItem = {
  href: string;
  label: string;
  /** Badges retirés : MAV ne s'en servait pas (décision du 11/08). */
  count?: number;
  count2?: number;
  /** Rangée non cliquable (outil) : "toggle" affiche un interrupteur. */
  tool?: "toggle" | "switch-onoff";
};

/** Menu du mode « Vente en bloc » — l'application telle qu'elle existe. */
export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/mails", label: "Mails" },
  { href: "/estimation", label: "Estimations" },
  { href: "/immeubles", label: "Immeubles" },
  { href: "/mandats", label: "Mandats" },
  // La diffusion est un métier à part : ce qui est en ligne, et ce que ça
  // rapporte. Elle se pilote depuis les fiches, elle se surveille d'ici.
  { href: "/diffusion", label: "Diffusion" },
  { href: "/recherches", label: "Recherches" },
  { href: "/contacts", label: "Contacts" },
  { href: "/propositions", label: "Propositions" },
  { href: "/questions", label: "Questions" },
  { href: "/visites", label: "Visites" },
  { href: "/offres", label: "Offres" },
  { href: "/suivi", label: "Suivi / Rappels" },
  { href: "/objectifs", label: "Objectifs" },
  { href: "/analytics", label: "Datas" },
  { href: "#mailing", label: "Mailing" },
];

/* Retirés du menu le 21/08 sur demande de MAV : Notion, l'interrupteur
   ON/OFF, Dim_max et Debug. C'étaient des outils de développement du BO
   Bubble ; ils encombraient une colonne qui a mieux à faire. */

/** Barre de création du bas (ordre du BO). */
export const QUICK_CREATE = [
  "Contact",
  "Immeuble",
  "Mandat",
  "Recherche",
  "Proposition",
  "Visite",
  "Offre",
] as const;

export const AGENTS = [
  "Marc-Antoine",
  "Guillaume",
  "Sophie",
  "François",
  "Romain",
] as const;

/**
 * Menu du mode « Découpe ».
 *
 * En bloc on vend un objet à un investisseur ; en découpe on pilote une
 * opération sur dix-huit mois. Les deux métiers ne partagent que l'annuaire
 * des contacts et la messagerie — d'où deux menus, et non un menu commun avec
 * des entrées grisées.
 */
export const NAV_DECOUPE: NavItem[] = [
  { href: "/decoupe", label: "Dashboard" },
  { href: "/decoupe/operations", label: "Opérations" },
  { href: "/mails", label: "Mails" },
  { href: "/contacts", label: "Contacts" },
];
