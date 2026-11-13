"use client";

/**
 * Ce que l'écran affiche, écrit dans l'adresse.
 *
 * MAV : « règle le problème de pouvoir revenir exactement à la page d'avant en
 * cliquant sur précédent, c'est le plus important. » Puis, le 29/09 : « chaque
 * page et menu / sous-menu a son URL et on peut y accéder en faisant retour
 * arrière sur le navigateur » — et le bouton « Précédent » du BO s'en va.
 *
 * ## Pourquoi l'adresse
 *
 * Le BO gardait sa navigation en mémoire vive — la rubrique ouverte dans la
 * fiche d'un bien, son sous-onglet, l'onglet d'une fiche contact, la recherche
 * et la page d'une liste — et pas dans l'adresse. Revenir ramenait donc à la
 * bonne PAGE, mais remontée à zéro : on repartait de « Suivi » alors qu'on
 * était dans « État locatif · Baux ».
 *
 * L'adresse est le seul endroit que le navigateur restitue. Ce qu'on y écrit
 * revient ; ce qu'on garde ailleurs est perdu.
 *
 * ## Trois règles, qui expliquent la forme du code
 *
 * **La valeur de départ est figée au montage.** `useDepartUrl` lit l'adresse
 * une seule fois, dans l'initialiseur d'état : la page étant rendue
 * dynamiquement, le serveur voit déjà le bon paramètre et l'écran s'affiche
 * d'emblée sur la bonne rubrique — sans le clignotement qu'aurait produit une
 * relecture dans un effet.
 *
 * **Un menu s'empile, un filtre se remplace.** Changer de rubrique, d'onglet ou
 * de sous-onglet pose une entrée d'historique (`pushState`) : le retour arrière
 * du navigateur ramène au menu d'avant, comme MAV l'attend, et l'entrée d'avant
 * garde la sienne. Une recherche tapée, une page de liste, un filtre se
 * contentent de mettre à jour l'entrée courante (`replaceState`) : vingt
 * frappes ne font pas vingt entrées. Jamais le routeur : `router.replace`
 * refait tourner la page côté serveur, changer d'onglet rechargerait tout
 * l'immeuble. Un même rendu peut écrire plusieurs clés (la rubrique ET son
 * sous-onglet) : la première empile, les suivantes complètent la même entrée
 * — sinon un clic coûterait deux retours.
 *
 * **L'état suit le retour arrière.** Quand le navigateur restaure une entrée,
 * l'adresse change sans que la page se recharge : chaque état écrit dans
 * l'adresse relit sa clé et se met à jour (`popstate`). Sans ça, l'adresse
 * reviendrait en arrière et l'écran resterait où il était.
 *
 * L'écriture passe par un effet, pas par les gestionnaires de clic. Une
 * rubrique se choisit depuis une quinzaine d'endroits dans la fiche d'un bien
 * — un rail, des sous-onglets, la fermeture d'une estimation, l'ouverture
 * d'un mandat. Écrire depuis l'effet, c'est n'avoir qu'un seul endroit qui
 * mémorise, et aucune chance d'en oublier un.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/* Vrai le temps d'un tour de boucle après un empilement : les écritures qui
   suivent dans le même rendu complètent l'entrée au lieu d'en ouvrir une. */
let vientDEmpiler = false;

/** Écrit (ou efface) un paramètre dans l'adresse, sans recharger. `empiler`
 *  pose une nouvelle entrée d'historique ; sinon l'entrée courante est mise
 *  à jour. */
export function ecrireParam(cle: string, valeur: string | null | undefined, defaut?: string, empiler = false) {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    /* La valeur par défaut ne s'écrit pas : une adresse ne doit porter que ce
       qui la distingue, sinon le moindre clic la couvre de paramètres. */
    if (!valeur || valeur === defaut) {
      if (!u.searchParams.has(cle)) return;
      u.searchParams.delete(cle);
    } else {
      if (u.searchParams.get(cle) === valeur) return;
      u.searchParams.set(cle, valeur);
    }
    /* L'état de Next reste attaché à l'entrée : c'est lui qui, au retour
       arrière, dit à Next de restaurer la page sans la recharger. */
    if (empiler && !vientDEmpiler) {
      window.history.pushState(window.history.state, "", u);
      vientDEmpiler = true;
      setTimeout(() => { vientDEmpiler = false; }, 0);
    } else {
      window.history.replaceState(window.history.state, "", u);
    }
  } catch {
    /* Navigation privée verrouillée, adresse exotique : l'écran continue de
       fonctionner, il ne se souviendra simplement pas de lui-même. */
  }
}

/**
 * La valeur de départ lue dans l'adresse, figée au montage.
 *
 * `valides` évite qu'un paramètre bricolé à la main ouvre une rubrique qui
 * n'existe pas — l'écran retomberait sur du vide.
 */
export function useDepartUrl<T extends string>(
  cle: string, defaut: T, valides?: readonly T[],
): T {
  const params = useSearchParams();
  const [depart] = useState<T>(() => {
    const v = params.get(cle);
    if (!v) return defaut;
    if (valides && !valides.includes(v as T)) return defaut;
    return v as T;
  });
  return depart;
}

/** Comment un état écrit dans l'adresse réagit au retour arrière. */
export type SuiviUrl<T extends string> = {
  /** Reçoit la valeur restaurée par le navigateur (le défaut quand la clé
   *  est absente). */
  sur: (v: T) => void;
  /** Les valeurs acceptées ; une autre est ramenée au défaut. */
  valides?: readonly T[];
  /** Vrai pour un menu, un onglet, un sous-onglet : chaque changement pose
   *  une entrée d'historique. Faux (défaut) pour un filtre ou une recherche. */
  empiler?: boolean;
};

/**
 * Garde le paramètre `cle` d'accord avec ce que l'écran affiche — et, avec
 * `suivi`, l'écran d'accord avec l'adresse quand le navigateur revient en
 * arrière.
 */
export function useMemoireUrl<T extends string>(
  cle: string, valeur: T | null | undefined, defaut?: T, suivi?: SuiviUrl<T>,
) {
  const empiler = !!suivi?.empiler;
  /* La première écriture (au montage) ne fait que normaliser l'adresse : elle
     n'empile jamais, sinon ouvrir une fiche coûterait deux retours. */
  const monte = useRef(false);
  useEffect(() => {
    ecrireParam(cle, valeur, defaut, empiler && monte.current);
    monte.current = true;
  }, [cle, valeur, defaut, empiler]);

  /* Le retour arrière lit l'état courant sans réabonner l'écouteur à chaque
     rendu : ce qu'il lui faut vit dans une référence tenue à jour. */
  const courant = useRef({ valeur, defaut, suivi });
  useEffect(() => { courant.current = { valeur, defaut, suivi }; });
  const suit = !!suivi;
  useEffect(() => {
    if (!suit) return;
    const restaurer = () => {
      const { valeur, defaut, suivi } = courant.current;
      if (!suivi) return;
      let v = (new URL(window.location.href).searchParams.get(cle) ?? defaut ?? "") as T;
      if (suivi.valides && !suivi.valides.includes(v)) v = (defaut ?? "") as T;
      const actuel = (valeur || defaut || "") as T;
      if (v !== actuel) suivi.sur(v);
    };
    window.addEventListener("popstate", restaurer);
    return () => window.removeEventListener("popstate", restaurer);
  }, [cle, suit]);
}

/** Le premier paramètre d'une page, normalisé — `searchParams` peut être un
 *  tableau quand la clé apparaît deux fois dans l'adresse. */
export const param = (
  sp: Record<string, string | string[] | undefined> | undefined, cle: string,
): string | undefined => {
  const v = sp?.[cle];
  return Array.isArray(v) ? v[0] : v;
};
