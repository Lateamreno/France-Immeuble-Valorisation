"use client";

// Barre d'enregistrement collée en bas (retours #79, #81, #83, puis #192 et #196).
//
// Règle générale du site, pas un habillage d'écran : toute page qui demande un
// enregistrement porte cette barre, collée en bas, bouton à droite.
//
// Elle est TOUJOURS là (retour #196) — elle ne se montrait avant qu'en cas de
// modification, ce qui obligeait l'agent à deviner si son écran était à jour
// ou s'il n'avait rien touché. Trois états, et un seul coup d'œil suffit :
//
//   · rien modifié      → bouton gris, inactif, « Tout est enregistré » ;
//   · modification      → bouton vert, actif, et un bouton Annuler à côté ;
//   · après l'envoi     → retour au gris, jusqu'à la modification suivante.
//
// `onAnnuler` rétablit les valeurs enregistrées : c'est le filet de l'agent
// qui s'est trompé de champ et ne sait plus ce qu'il y avait avant.

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
  return (
    <div className={`savebar${plein ? " plein" : ""}${modifie ? "" : " calme"}`} role="status">
      <span className="savebar-t">
        <svg viewBox="0 0 24 24" aria-hidden>
          {modifie
            ? <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2M12 16.2v.2" /></>
            : <path d="m5 13 4 4L19 7" />}
        </svg>
        {children ?? (modifie ? "Modifications non enregistrées" : "Tout est enregistré")}
      </span>
      <span className="sp" />
      {onAnnuler && (
        <button type="button" className="savebar-x" disabled={pending || !modifie} onClick={onAnnuler}>
          Annuler
        </button>
      )}
      <button type="button" className="savebar-go" disabled={pending || !modifie} onClick={onEnregistrer}>
        {pending ? "Enregistrement…" : libelle}
      </button>
    </div>
  );
}
