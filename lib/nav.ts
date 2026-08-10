// Navigation du back-office — rail calqué sur le BO Bubble actuel
// (cf. docs/cartographie/02-dashboard.md), source unique pour le rail.
export type NavItem = {
  href: string;
  label: string;
  /** Compteur affiché en badge (sera alimenté par Supabase/Bubble). */
  count?: number;
  /** Affiché dans la tab bar mobile (5 max + Dashboard). */
  mobile?: boolean;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", mobile: true },
  { href: "/immeubles", label: "Immeubles", count: 53, mobile: true },
  { href: "/estimation", label: "Estimations", count: 36, mobile: true },
  { href: "/documents", label: "Mandats", count: 5 },
  { href: "/recherches", label: "Recherches" },
  { href: "/contacts", label: "Contacts", mobile: true },
  { href: "/propositions", label: "Propositions", count: 1 },
  { href: "/visites", label: "Visites", count: 9 },
  { href: "/offres", label: "Offres", count: 31, mobile: true },
  { href: "/suivi", label: "Suivi / Rappels" },
  { href: "/objectifs", label: "Objectifs" },
  { href: "/analytics", label: "Data" },
];

/** Entités créables depuis la barre de création rapide (ordre du tunnel). */
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
  "Tous les agents",
  "Marc-Antoine",
  "Guillaume",
  "Sophie",
  "François",
  "Romain",
] as const;
