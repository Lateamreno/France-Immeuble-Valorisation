"use client";

/**
 * Ce que l'écran affiche, écrit dans l'adresse.
 *
 * MAV : « règle le problème de pouvoir revenir exactement à la page d'avant en
 * cliquant sur précédent, c'est le plus important. »
 *
 * ## Pourquoi le bouton ne suffisait pas
 *
 * Le bouton « Précédent » appelle bien `router.back()` : l'historique n'était
 * pas en cause. Le problème est que le BO gardait sa navigation en mémoire
 * vive — la rubrique ouverte dans la fiche d'un bien, son sous-onglet,
 * l'onglet d'une fiche contact, la recherche et la page d'une liste — et pas
 * dans l'adresse. Revenir ramenait donc à la bonne PAGE, mais remontée à
 * zéro : on repartait de « Suivi » alors qu'on était dans « État locatif ·
 * Baux ».
 *
 * L'adresse est le seul endroit que le navigateur restitue. Ce qu'on y écrit
 * revient ; ce qu'on garde ailleurs est perdu.
 *
 * ## Deux règles, qui expliquent la forme du code
 *
 * **La valeur de départ est figée au montage.** `useDepartUrl` lit l'adresse
 * une seule fois, dans l'initialiseur d'état : la page étant rendue
 * dynamiquement, le serveur voit déjà le bon paramètre et l'écran s'affiche
 * d'emblée sur la bonne rubrique — sans le clignotement qu'aurait produit une
 * relecture dans un effet.
 *
 * **On écrit avec `history.replaceState`, pas avec le routeur.** Deux raisons.
 * D'abord `router.replace` refait tourner la page côté serveur : changer
 * d'onglet rechargerait tout l'immeuble. Ensuite on ne veut PAS d'entrée
 * d'historique par onglet — sinon « Précédent » ferait défiler les onglets un
 * par un au lieu de ramener à la page d'avant. On met donc à jour l'entrée
 * courante : elle mémorise le dernier état vu, et c'est celui-là qu'on
 * retrouve en revenant. (Next surveille `replaceState` : `useSearchParams`
 * reste d'accord avec la barre d'adresse.)
 *
 * L'écriture passe par un effet, pas par les gestionnaires de clic. Une
 * rubrique se choisit depuis une quinzaine d'endroits dans la fiche d'un bien
 * — un rail, des sous-onglets, la fermeture d'une estimation, l'ouverture
 * d'un mandat. Écrire depuis l'effet, c'est n'avoir qu'un seul endroit qui
 * mémorise, et aucune chance d'en oublier un.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/** Écrit (ou efface) un paramètre dans l'adresse, sans recharger ni empiler. */
export function ecrireParam(cle: string, valeur: string | null | undefined, defaut?: string) {
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
    window.history.replaceState(window.history.state, "", u);
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

/** Garde le paramètre `cle` d'accord avec ce que l'écran affiche. */
export function useMemoireUrl(cle: string, valeur: string | null | undefined, defaut?: string) {
  useEffect(() => { ecrireParam(cle, valeur, defaut); }, [cle, valeur, defaut]);
}

/** Le premier paramètre d'une page, normalisé — `searchParams` peut être un
 *  tableau quand la clé apparaît deux fois dans l'adresse. */
export const param = (
  sp: Record<string, string | string[] | undefined> | undefined, cle: string,
): string | undefined => {
  const v = sp?.[cle];
  return Array.isArray(v) ? v[0] : v;
};
