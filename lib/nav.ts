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

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/estimation", label: "Estimations" },
  { href: "/immeubles", label: "Immeubles" },
  { href: "/mandats", label: "Mandats" },
  { href: "/recherches", label: "Recherches" },
  { href: "/contacts", label: "Contacts" },
  { href: "/propositions", label: "Propositions" },
  { href: "/questions", label: "Questions" },
  { href: "/visites", label: "Visites" },
  { href: "/offres", label: "Offres" },
  { href: "/suivi", label: "Suivi / Rappels" },
  { href: "/objectifs", label: "Objectifs" },
  { href: "/analytics", label: "Datas" },
  { href: "#notion", label: "Notion" },
  { href: "#onoff", label: "", tool: "switch-onoff" },
  { href: "#mailing", label: "Mailing" },
  { href: "#dimmax", label: "Dim_max", tool: "toggle" },
  { href: "#debug", label: "Debug", tool: "toggle" },
];

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
