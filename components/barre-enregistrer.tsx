"use client";

// Barre d'enregistrement collée en bas (retours #79, #81, #83).
//
// Règle générale du site, pas un habillage d'écran : dès qu'une saisie
// attend d'être enregistrée, la barre apparaît en bas, d'une barre latérale
// à l'autre sans écart, avec le bouton vert à droite. Tant que rien n'a
// changé, elle n'est pas là — l'écran reste calme et on voit du premier coup
// d'œil qu'il reste quelque chose à valider.

export function BarreEnregistrer({
  modifie, pending, onEnregistrer, onAnnuler, libelle = "Enregistrer", plein, children,
}: {
  /** Vrai dès qu'une valeur diffère de ce qui est en base. */
  modifie: boolean;
  pending?: boolean;
  onEnregistrer: () => void;
  /** Rétablit les valeurs enregistrées, quand l'écran sait le faire. */
  onAnnuler?: () => void;
  libelle?: string;
  /** Écran sans rail à droite (listes) : la barre va jusqu'au bord. */
  plein?: boolean;
  /** Message à gauche, sinon le rappel par défaut. */
  children?: React.ReactNode;
}) {
  if (!modifie) return null;
  return (
    <div className={`savebar${plein ? " plein" : ""}`} role="status">
      <span className="savebar-t">
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2M12 16.2v.2" />
        </svg>
        {children ?? "Modifications non enregistrées"}
      </span>
      <span className="sp" />
      {onAnnuler && (
        <button type="button" className="savebar-x" disabled={pending} onClick={onAnnuler}>
          Annuler
        </button>
      )}
      <button type="button" className="savebar-go" disabled={pending} onClick={onEnregistrer}>
        {pending ? "Enregistrement…" : libelle}
      </button>
    </div>
  );
}
