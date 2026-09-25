/**
 * Les pictos d'une recherche, tels que le BO les montre sur un matching
 * (retour #421) : le type de recherche — investissement, marchand,
 * patrimonial, promotion — et les typologies de biens. Allumés quand la
 * recherche les vise, éteints sinon : l'absence de picto ne dirait rien.
 */
import type { ReactNode } from "react";

export const CIBLES: { cle: string; titre: string; d: ReactNode }[] = [
  { cle: "Investisseur", titre: "Investissement locatif", d: <><path d="M3 19h18" /><path d="M5 15.5 9.5 10l3.5 3 5.5-6.5" /><path d="M15 6.5h3.5V10" /></> },
  { cle: "Marchand", titre: "Opération marchande", d: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M8.5 8V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V8M3 13h18" /></> },
  { cle: "Patrimonial", titre: "Immeuble patrimonial", d: <><path d="M12 3 4 7v2h16V7z" /><path d="M6 9v8M10 9v8M14 9v8M18 9v8M4 17h16v3H4z" /></> },
  { cle: "Promoteur", titre: "Opération de promotion", d: <><path d="M3 21h18" /><path d="M6 21V10l6-3 6 3v11" /><path d="M9 21v-5h6v5M12 3v4" /><path d="M9 12h2M13 12h2" /></> },
];

export const DESTINATIONS_BIEN: { cle: string; titre: string; d: ReactNode }[] = [
  { cle: "Logement", titre: "Logement", d: <path d="M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /> },
  { cle: "Commerce", titre: "Commerce", d: <path d="M4 7h16l-1 3.2a2.4 2.4 0 0 1-4.6.3 2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-4.6-.3zM5.5 12.6V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6.4" /> },
  { cle: "Bureau", titre: "Bureau", d: <path d="M4 20V8.6a1 1 0 0 1 .6-.9l6-2.6a1 1 0 0 1 1.4.9V20M12 20V11h7a1 1 0 0 1 1 1v8M7 10.5h1.6M7 13.6h1.6M7 16.7h1.6M15 14h2M15 17h2" /> },
  { cle: "Logistique", titre: "Logistique", d: <><path d="M3 9.5 12 5l9 4.5V19H3z" /><path d="M8 19v-6h8v6" /></> },
  { cle: "Parking", titre: "Parking", d: <path d="M5 11.5 6.4 7.4A2 2 0 0 1 8.3 6h7.4a2 2 0 0 1 1.9 1.4L19 11.5V17h-2.5v-1.6h-9V17H5zM7.4 14a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm9.2 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z" /> },
];
