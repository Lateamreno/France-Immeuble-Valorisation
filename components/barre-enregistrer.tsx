"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Barre d'enregistrement collée en bas (retours #79, #81, #83, puis #192 et #196).
//
// Règle générale du site, pas un habillage d'écran : toute page qui demande un
// enregistrement porte cette barre, collée en bas, bouton à droite.
//
// Retours #515 et #516 (revirement du #196, où elle était toujours là) : elle
// n'apparaît QUE quand quelque chose a été modifié, et disparaît une fois
// enregistré ou annulé.
//
//   · rien modifié      → pas de barre ;
//   · modification      → la barre monte : bouton vert, et Annuler à côté ;
//   · pendant l'envoi   → « Enregistrement… », puis elle s'en va.
//
// Retour #536 (précision du #515) : une fois montée, la barre RESTE, même si
// la valeur revient d'elle-même à celle de la base ou si un champ voisin
// s'enregistre seul. Elle ne s'en va qu'au clic sur Enregistrer (une fois
// l'enregistrement passé) ou sur Annuler, et ne revient qu'à la modification
// suivante.
//
// `onAnnuler` rétablit les valeurs enregistrées : c'est le filet de l'agent
// qui s'est trompé de champ et ne sait plus ce qu'il y avait avant.
//
// Retour #454 : « quand il y a le bouton Enregistrer, où qu'il soit, je veux
// également le bouton Annuler — avant c'était juste le texte Annuler
// souligné ». Tous les écrans qui montent cette barre lui donnent donc un
// `onAnnuler`, et le bouton se dessine comme dans le BO Bubble : un texte
// souligné, pas un cadre.

/*
 * Retour #584 : la barre disparaissait « si je clique ailleurs ». Ce n'était
 * pas elle qui se fermait : l'onglet entier était REMONTÉ. Les onglets de la
 * fiche portent une clé tirée de la date de modification du bien, pour
 * repartir des données fraîches après un enregistrement ; or un clic ailleurs
 * suffit à écrire sur le bien (les notes s'enregistrent en quittant la zone),
 * et l'onglet repartait de zéro — barre et saisie non enregistrée comprises.
 *
 * Les barres ouvertes se déclarent donc ici, et `useCleStable` garde la clé
 * d'un onglet tant qu'il en reste une : il ne se remonte qu'une fois tout
 * enregistré ou annulé.
 */
let barresOuvertes = 0;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };

/** Déclare une saisie en cours (une barre ouverte, des lignes modifiées) tant que `actif` est vrai. */
export function useSaisieOuverte(actif: boolean) {
  useEffect(() => {
    if (!actif) return;
    barresOuvertes++;
    prevenir();
    return () => { barresOuvertes--; prevenir(); };
  }, [actif]);
}

/** La clé donnée, sauf tant qu'une barre d'enregistrement est ouverte : on garde alors la précédente. */
export function useCleStable(cle: string): string {
  const ouverte = useSyncExternalStore(abonner, () => barresOuvertes > 0, () => false);
  const [stable, setStable] = useState(cle);
  if (!ouverte && stable !== cle) setStable(cle);
  return ouverte ? stable : cle;
}

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
  const [ouverte, setOuverte] = useState(false);
  /* Vrai entre le clic sur Enregistrer et la fin de l'enregistrement. */
  const [aFermer, setAFermer] = useState(false);
  useEffect(() => { if (modifie) setOuverte(true); }, [modifie]);
  useEffect(() => {
    if (aFermer && !pending && !modifie) { setOuverte(false); setAFermer(false); }
  }, [aFermer, pending, modifie]);

  const visible = ouverte || !!pending;
  useSaisieOuverte(visible);

  if (!visible) return null;
  const enregistrer = () => {
    setAFermer(true);
    // Rien à écrire : le clic vaut fermeture.
    if (modifie) onEnregistrer();
  };
  const annuler = () => { onAnnuler?.(); setAFermer(false); setOuverte(false); };
  return (
    <div className={`savebar${plein ? " plein" : ""}${modifie ? "" : " calme"}`} role="status">
      <span className="savebar-t">
        <svg viewBox="0 0 24 24" aria-hidden>
          {modifie
            ? <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2M12 16.2v.2" /></>
            : <path d="m5 13 4 4L19 7" />}
        </svg>
        {children ?? (modifie ? "Modifications non enregistrées" : "Aucune modification en attente")}
      </span>
      <span className="sp" />
      {(onAnnuler || !modifie) && (
        <button type="button" className="savebar-x" disabled={pending} onClick={annuler}>
          Annuler
        </button>
      )}
      <button type="button" className="savebar-go" disabled={pending} onClick={enregistrer}>
        {pending ? "Enregistrement…" : libelle}
      </button>
    </div>
  );
}
