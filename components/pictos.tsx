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

/**
 * L'avion en papier des boutons d'envoi (retour #126).
 *
 * MAV : « à envoyer, c'est une info » — le statut est une pastille, l'action
 * est un bouton. Le picto est ce qui les sépare d'un coup d'œil.
 */
export function Avion({ className = "picto-av" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path d="M21.5 2.5 2.5 10.2l7.3 2.8 2.8 7.3z" />
      <path d="M21.5 2.5 9.8 13" />
    </svg>
  );
}

/** La corbeille des suppressions (retour #126). */
export function Corbeille({ className = "picto-av" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path d="M4 7h16" /><path d="M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 12.5h9L17.5 7" />
      <path d="M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

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

/**
 * L'étiquette DPE, dessinée comme celle de Plein Bail (retour #173) :
 * un carré à gauche, une pointe à droite, à la couleur officielle de la
 * lettre. Même dessin dans le tableau des lots, dans l'annonce et dans le
 * dossier — c'est ce qui la rend lisible sans lire.
 */
/**
 * Retours #252 et #253 — trois cas que l'étiquette confondait.
 *
 * MAV : « le picto pour Vierge est le même que si on met rien […] je veux que
 * quand y a rien tu mettes même pas le picto. Donc tu mettras toujours le
 * picto en gris avec N.C. ou Vierge dans ces cas-là, et rien quand on n'a pas
 * rempli. » Un DPE vierge est une information — le bien n'en a pas encore —
 * quand une case vide n'en est pas une : les afficher pareil, c'est faire
 * croire que tout est renseigné.
 *
 * Et le G+, qui n'est pas une lettre au sens de l'expression régulière,
 * tombait dans le cas « inconnu » : cliquer dessus posait bien la valeur mais
 * l'étiquette restait grise, d'où « le DPE ne se met pas sur le lot ». Il
 * porte désormais le rouge du G, qu'il aggrave.
 */
export function BadgeDpe({ lettre, titre }: { lettre?: string | null; titre?: string }) {
  const l = String(lettre ?? "").trim().toUpperCase();
  if (!l) return null;
  const connue = /^[A-G]$/.test(l);
  if (connue || l === "G+") {
    const cls = l === "G+" ? "dG dGplus" : `d${l}`;
    return <span className={`dpe-b ${cls}`} title={titre ?? `DPE ${l}`}>{l}</span>;
  }
  /* Vierge et n.c. sont des réponses, pas des trous : gris, mais nommées. */
  const mot = l === "N.C." || l === "NC" ? "N.C." : l === "VIERGE" ? "Vierge" : l;
  return (
    <span className="dpe-b dvide mot" title={titre ?? `DPE ${mot}`}>{mot}</span>
  );
}
