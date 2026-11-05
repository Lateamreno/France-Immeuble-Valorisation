/**
 * L'avatar d'un agent — objet n° 7 du catalogue (validé le 25/09).
 *
 * Les initiales dans la couleur de l'agent. Le dessin (`.lav`) était déjà le
 * même partout ; ce composant évite de recopier le style en ligne qui porte
 * la couleur, et donne un seul endroit pour changer la taille ou la forme.
 */
export function Avatar({
  initiales, couleur, petit = false, titre, className,
}: {
  initiales: string;
  /** La couleur de l'agent (`color_main`) ; sans elle, l'orange par défaut. */
  couleur?: string;
  petit?: boolean;
  titre?: string;
  className?: string;
}) {
  return (
    <span
      className={`lav${petit ? " petit" : ""}${className ? ` ${className}` : ""}`}
      style={couleur ? { background: couleur } : undefined}
      title={titre}
    >
      {initiales}
    </span>
  );
}
