"use client";

/**
 * Le point de comparaison d'un formulaire : ce qui est en base.
 *
 * Chaque onglet à barre d'enregistrement a besoin de savoir deux choses —
 * « est-ce que l'agent a touché quelque chose ? » et « qu'y avait-il avant, pour
 * n'écrire que ce qui change ». C'était fait avec un `useRef` lu pendant le
 * rendu, ce que React déconseille : un ref n'est pas censé décider ce qui
 * s'affiche. Un état ordinaire fait la même chose et se relit sans réserve.
 *
 * On stocke la photo sous forme de chaîne JSON : c'est ce qui rend la
 * comparaison exacte quel que soit l'objet saisi.
 */

import { useState } from "react";

export function useBaseSaisie<T>(courant: T) {
  const [base, setBase] = useState(() => JSON.stringify(courant));
  return {
    /** La photo JSON de ce qui est en base. */
    base,
    /** Ce qui était en base, réhydraté. */
    avant: () => JSON.parse(base) as T,
    /** Vrai dès que la saisie s'écarte de la base. */
    modifie: JSON.stringify(courant) !== base,
    /** Après un enregistrement réussi : la saisie devient la nouvelle base. */
    poser: (v: T) => setBase(JSON.stringify(v)),
  };
}
