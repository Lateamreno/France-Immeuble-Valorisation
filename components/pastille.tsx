/**
 * La pastille de statut — objet n° 5 du catalogue (validé le 25/09).
 *
 * Cinq jeux de couleurs disaient « en cours / refusée / vendu » chacun à sa
 * façon (badge-g/o/r des listes, cfc-st des propositions, acx-b des titres,
 * rc-note, kstatus). Ici un seul objet : un ton — vert, orange, rouge, bleu,
 * gris — et deux dessins, plein ou contour. Et une seule table qui sait de
 * quelle couleur est chaque statut : le vert est le même partout.
 */
import type { ReactNode } from "react";

export type Ton = "vert" | "orange" | "rouge" | "bleu" | "gris";

/**
 * Le ton d'un statut, par son libellé. Les statuts inconnus sont gris : mieux
 * vaut un gris honnête qu'une couleur qui ment.
 */
export function tonDeStatut(statut: string | undefined | null): Ton {
  const s = (statut ?? "").trim().toLowerCase();
  if (!s) return "gris";
  if (/^(en cours|vendu|vendue|signé|signée|encaissé|encaissée|acceptée|offre acceptée|offre obtenue|ok pour vendre|commercialisé|publié|publiée|envoyé|envoyée|actif|active|retenu|retenue|effectuée|effectué|compromis|réalisée|réalisé|terminé|terminée|fait|faite|traité|traitée)/.test(s)) {
    return /^(envoyé|envoyée)/.test(s) ? "bleu" : "vert";
  }
  if (/^(annulé|annulée|expiré|expirée|refusé|refusée|écarté|écartée|retiré|retirée|archivé|archivée|perdu|perdue|résilié|résiliée|clôturé|clôturée)/.test(s)) return "rouge";
  if (/^(attente|à |a |en attente|standby|à signer|a signer|à rédiger|a rédiger|demande|demandé|demandée|reçu|reçue|à estimer|a estimer)/.test(s)) return "orange";
  return "gris";
}

export function Pastille({
  ton, plein = false, children, titre, className,
}: {
  ton: Ton;
  /** Fond coloré (listes) ou contour coloré (cartes, titres). */
  plein?: boolean;
  children: ReactNode;
  titre?: string;
  className?: string;
}) {
  return (
    <span className={`pst ${ton}${plein ? " plein" : ""}${className ? ` ${className}` : ""}`} title={titre}>
      {children}
    </span>
  );
}

/** Une pastille dont la couleur suit le statut qu'elle affiche. */
export function PastilleStatut({ statut, plein, className }: { statut: string; plein?: boolean; className?: string }) {
  return <Pastille ton={tonDeStatut(statut)} plein={plein} className={className}>{statut}</Pastille>;
}
