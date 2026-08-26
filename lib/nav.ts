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
  /* Estimations retiré du menu le 24/08 (retour #109) : MAV ne s'en sert
     jamais, les estimations se travaillent depuis la fiche du bien. L'écran
     et sa route restent en place — c'est le raccourci qui disparaît, pas la
     fonction, si l'usage revenait. */
  { href: "/immeubles", label: "Immeubles" },
  // La diffusion est un métier à part : ce qui est en ligne, et ce que ça
  // rapporte. Elle se pilote depuis les fiches, elle se surveille d'ici.
  { href: "/diffusion", label: "Diffusion" },
  { href: "/recherches", label: "Recherches" },
  /* Contacts remonte au-dessus de Mandats (retour #114) : l'ordre du menu
     suit la fréquence d'usage, pas la logique du métier. */
  { href: "/contacts", label: "Contacts" },
  { href: "/mandats", label: "Mandats" },
  { href: "/propositions", label: "Propositions" },
  { href: "/questions", label: "Questions" },
  { href: "/visites", label: "Visites" },
  { href: "/offres", label: "Offres" },
  /* Prospection en dur : les immeubles détenus par une société et PAS en
     copropriété — la cible de la découpe. Elle vit à côté des Recherches,
     qui sont la demande, quand celle-ci est l'offre à aller chercher. */
  { href: "/prospection", label: "Prospection" },
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
