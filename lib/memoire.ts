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
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

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

/**
 * `useMemoire` pour une valeur SERVIE par la fiche (retours #271 et #276).
 *
 * MAV : « j'ai rempli les infos de secteur mais ça n'apparaît pas dans
 * l'estimation » ; « j'ai mis 50 k€ de travaux sur le bâti […] mais les deux
 * travaux n'apparaissent pas ici ». La cause est la même dans les deux cas, et
 * elle est dans la mémoire d'écran : elle avait retenu la valeur calculée à la
 * PREMIÈRE ouverture de l'estimation — c'est-à-dire vide, puisque le secteur
 * et les travaux n'étaient pas encore saisis — et ne relisait plus jamais la
 * fiche. La saisie faite entre-temps restait invisible.
 *
 * On mémorise donc DEUX choses : la valeur, et ce que la fiche servait quand
 * on l'a mémorisée. Au retour :
 *
 *   · valeur identique au témoin → personne n'y a touché, c'est la fiche qui
 *     fait foi, on reprend ce qu'elle sert aujourd'hui ;
 *   · valeur différente → l'agent a saisi quelque chose ici, on le garde.
 *
 * Sans le témoin, on ne saurait pas distinguer « la fiche a bougé » de
 * « l'agent a corrigé » : c'est le même écart.
 */
export function useMemoireServie<T>(cle: string, servi: T) {
  const [etat, setEtat] = useState<{ v: T; base: T }>(() => ({ v: servi, base: servi }));
  const [pret, setPret] = useState(false);
  /* La comparaison passe par la forme sérialisée : les valeurs servies sont
     des objets recréés à chaque rendu, jamais égaux par référence. */
  const empreinte = JSON.stringify(servi ?? null);

  useEffect(() => {
    const frais = JSON.parse(empreinte) as T;
    let repris: { v: T; base: T } | null = null;
    try {
      const brut = window.sessionStorage.getItem(cle);
      if (brut !== null) repris = JSON.parse(brut) as { v: T; base: T };
    } catch {
      /* mémoire pleine ou navigation privée : on continue sans */
    }
    const touche = repris && JSON.stringify(repris.v ?? null) !== JSON.stringify(repris.base ?? null);
    setEtat(touche ? { v: repris!.v, base: frais } : { v: frais, base: frais });
    setPret(true);
  }, [cle, empreinte]);

  useEffect(() => {
    if (!pret) return;
    try {
      window.sessionStorage.setItem(cle, JSON.stringify(etat));
    } catch {
      /* idem */
    }
  }, [cle, pret, etat]);

  const set: Dispatch<SetStateAction<T>> = (action) =>
    setEtat((e) => ({
      ...e,
      v: typeof action === "function" ? (action as (p: T) => T)(e.v) : action,
    }));

  return [etat.v, set] as const;
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
