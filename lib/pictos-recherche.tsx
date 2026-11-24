/**
 * Les pictos d'une recherche, tels que le BO les montre sur un matching
 * (retour #421) : le type de recherche — investissement, marchand,
 * patrimonial, promotion — et les typologies de biens. Allumés quand la
 * recherche les vise, éteints sinon : l'absence de picto ne dirait rien.
 */
import type { ReactNode } from "react";
import { DESTINATIONS_RECHERCHE } from "@/components/pictos-destination";

export const CIBLES: { cle: string; titre: string; d: ReactNode }[] = [
  { cle: "Investisseur", titre: "Investissement locatif", d: <><path d="M3 19h18" /><path d="M5 15.5 9.5 10l3.5 3 5.5-6.5" /><path d="M15 6.5h3.5V10" /></> },
  { cle: "Marchand", titre: "Opération marchande", d: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M8.5 8V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V8M3 13h18" /></> },
  { cle: "Patrimonial", titre: "Immeuble patrimonial", d: <><path d="M12 3 4 7v2h16V7z" /><path d="M6 9v8M10 9v8M14 9v8M18 9v8M4 17h16v3H4z" /></> },
  { cle: "Promoteur", titre: "Opération de promotion", d: <><path d="M3 21h18" /><path d="M6 21V10l6-3 6 3v11" /><path d="M9 21v-5h6v5M12 3v4" /><path d="M9 12h2M13 12h2" /></> },
];

/* Les destinations visées : les mêmes dessins que l'état locatif (#444). */
export const DESTINATIONS_BIEN = DESTINATIONS_RECHERCHE;
