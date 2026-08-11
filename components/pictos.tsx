// Pictos des sous-menus de la fiche bien, relevés sur le BO (retours #50 et
// #51). Le rail et les onglets horizontaux du contenu partagent le même jeu :
// un sous-menu doit se reconnaître au même dessin des deux côtés.
import type { ReactNode } from "react";

export const PICTOS: Record<string, ReactNode> = {
  // État locatif
  lots: <><rect x="8" y="3.5" width="12" height="12" rx="1.8" /><path d="M15.5 20.5h-11a1 1 0 0 1-1-1v-11" /></>,
  baux: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
  locataires: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.6 14.2c2.4.2 4.2 1.6 4.6 4.3" /></>,
  charges: <><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19" /><path d="M6 14.5h4" /></>,
  // Emplacement
  adresse: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  parcelles: <><path d="M4 5h7v5h2.5a2 2 0 1 1 0 4H11v5H4z" /><path d="M4 12h7" /></>,
  secteur: <><path d="M3 19h18" /><path d="M3 16.5 8.5 9l4 3.5L20 5v11.5z" /></>,
  // État technique
  composants: <><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" /><circle cx="12" cy="12" r="4.5" /></>,
  travaux: <><path d="m14.5 5.5 4 4-8.5 8.5H6v-4z" /><path d="M13 7 17 11" /><path d="M3 21h18" /></>,
};

/** Rend le picto d'un sous-menu, ou rien si la clé est inconnue. */
export function Picto({ nom, className = "sic2" }: { nom: string; className?: string }) {
  const d = PICTOS[nom];
  if (!d) return <span className={`${className} dot`} />;
  return (
    <span className={className}>
      <svg viewBox="0 0 24 24">{d}</svg>
    </span>
  );
}
