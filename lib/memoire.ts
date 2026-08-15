"use client";

// Mémoire d'écran (retour #96).
//
// « Quand on crée une estimation il ne faut pas que ce soit une fenêtre à
// fermer […] on doit pouvoir aller se balader dans tous les autres menus et
// sous-menus tout en pouvant revenir à l'estimation après. »
//
// Dans la fiche, il suffit de garder l'écran monté (voir BienFiche). Mais si
// l'agent sort carrément de la fiche — le dashboard, un contact, une autre
// affaire — React démonte tout. On range donc la saisie dans le
// sessionStorage de l'onglet : elle survit à la navigation et disparaît à la
// fermeture du navigateur.
import { useEffect, useState } from "react";

/**
 * `useState` qui se souvient.
 *
 * La relecture se fait dans un effet, jamais dans l'initialiseur : le serveur
 * ne connaît pas le sessionStorage, et rendre autre chose que lui casserait
 * l'hydratation. Conséquence assumée : le premier rendu montre la valeur par
 * défaut, remplacée juste après par la valeur mémorisée.
 */
export function useMemoire<T>(cle: string, initial: T | (() => T)) {
  const [valeur, setValeur] = useState<T>(initial);
  /** Tant que la relecture n'a pas eu lieu, on n'écrit rien : sinon la valeur
   *  par défaut écraserait la mémoire avant même de l'avoir lue. */
  const [pret, setPret] = useState(false);

  useEffect(() => {
    try {
      const brut = window.sessionStorage.getItem(cle);
      if (brut !== null) setValeur(JSON.parse(brut) as T);
    } catch {
      /* mémoire pleine ou navigation privée : on continue sans */
    }
    setPret(true);
  }, [cle]);

  useEffect(() => {
    if (!pret) return;
    try {
      window.sessionStorage.setItem(cle, JSON.stringify(valeur));
    } catch {
      /* idem */
    }
  }, [cle, pret, valeur]);

  return [valeur, setValeur] as const;
}

/** Efface tout un espace de noms (« recommencer une estimation »). */
export function oublier(prefixe: string) {
  try {
    const s = window.sessionStorage;
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k?.startsWith(prefixe)) s.removeItem(k);
    }
  } catch {
    /* rien à faire */
  }
}
