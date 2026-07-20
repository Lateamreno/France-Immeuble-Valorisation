// Navigation du cockpit — source unique pour la sidebar et le routage.
export type NavItem = {
  href: string;
  label: string;
  // Emoji léger en attendant une lib d'icônes (évite une dépendance réseau).
  icon: string;
  milestone: string;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "▦", milestone: "M6" },
  { href: "/immeubles", label: "Immeubles & lots", icon: "▣", milestone: "M2" },
  { href: "/estimation", label: "Estimation", icon: "∿", milestone: "M3" },
  { href: "/grilles", label: "Grilles de prix", icon: "⌗", milestone: "M3" },
  { href: "/prestataires", label: "Prestataires & devis", icon: "✉", milestone: "M4" },
  { href: "/documents", label: "Documents & mandats", icon: "❖", milestone: "M5" },
];
