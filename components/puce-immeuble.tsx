/**
 * La puce immeuble — objet n° 6 du catalogue (validé le 25/09).
 *
 * Même geste que la vignette contact : un picto, « Ville (CP) - adresse », un
 * clic vers la fiche du bien. Elle était dessinée quatre fois (fiche contact,
 * questions, relances, tableau de bord) ; la voici une fois. Le survol montre
 * ce qu'on lui donne en `titre` (statut, prix, agent) — le jour où l'on veut
 * une carte de survol comme celle du contact, c'est ici qu'elle se pose.
 */
import Link from "next/link";
import type { ReactNode } from "react";

const IC_IMM = <path d="M5 2h11v19h3v2H4v-2h1V2zm2 2v3h2V4H7zm4 0v3h2V4h-2zM7 9v3h2V9H7zm4 0v3h2V9h-2zM7 14v3h2v-3H7zm4 0v3h2v-3h-2z" />;

export function PuceImmeuble({
  id, libelle, sub, titre, petit = false, plat = false, apres, className, nouvelOnglet = false,
}: {
  /** L'identifiant du bien ; sans lui, la puce n'est qu'un libellé. */
  id?: string;
  /** « Ville (CP) - adresse ». */
  libelle: string;
  /** Une seconde ligne ou un complément gris (prix, statut). */
  sub?: ReactNode;
  /** Ce que dit le survol. */
  titre?: string;
  petit?: boolean;
  /** Sans bordure ni fond : dans une phrase. */
  plat?: boolean;
  /** Quelque chose à droite du libellé (un insigne). */
  apres?: ReactNode;
  className?: string;
  /** Ouvre la fiche dans un autre onglet (écran Relances : on garde la liste sous les yeux). */
  nouvelOnglet?: boolean;
}) {
  const cls = `pim${petit ? " petit" : ""}${plat ? " plat" : ""}${className ? ` ${className}` : ""}`;
  const dedans = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden>{IC_IMM}</svg>
      <span className="pim-l">{libelle}</span>
      {sub && <i className="pim-s">{sub}</i>}
      {apres}
    </>
  );
  if (!id) return <span className={`${cls} sans`} title={titre}>{dedans}</span>;
  return (
    <Link className={cls} href={`/bien/${id}`} title={titre ?? "Ouvrir la fiche du bien"}
      target={nouvelOnglet ? "_blank" : undefined} rel={nouvelOnglet ? "noreferrer" : undefined}>
      {dedans}
    </Link>
  );
}
