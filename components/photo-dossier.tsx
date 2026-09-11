"use client";

/**
 * Une vignette de la planche photos du dossier (retour #322).
 *
 * MAV : « pour les photos en portrait, tu laisses le cadre dans les mêmes
 * proportions en 16/9, t'affiches la photo en pleine hauteur avec des bandes
 * noires de chaque côté » — puis, sur la première version : « pour les photos
 * paysages je préfère qu'elles soient sans bandes noires en haut comme en bas,
 * donc au besoin les zoomer/centrer. Y a que les portraits qui ont des bandes
 * noires. »
 *
 * Deux traitements, donc, et il faut savoir de quel côté on est. Rien ne le
 * dit côté serveur : les photos viennent de Bubble, qui n'a stocké ni largeur
 * ni hauteur pour l'immense majorité d'entre elles, et les mesurer au moment
 * de fabriquer le dossier voudrait dire les télécharger une deuxième fois.
 * On les mesure donc là où elles sont déjà chargées — dans la page. Le rappel
 * de `ref` s'exécute après l'hydratation : une image déjà arrivée est mesurée
 * sur-le-champ (`complete`), une image encore en vol attend son `load`. Le
 * PDF passe par la même page, chargée jusqu'au silence réseau : la mesure a eu
 * lieu avant le tirage.
 */

import { useState } from "react";

export function PhotoDossier({ src }: { src: string }) {
  const [portrait, setPortrait] = useState(false);

  const mesurer = (img: HTMLImageElement | null) => {
    if (!img) return;
    const juger = () => setPortrait(img.naturalHeight > img.naturalWidth);
    if (img.complete && img.naturalWidth > 0) juger();
    else img.addEventListener("load", juger, { once: true });
  };

  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={mesurer} src={src} alt="" className={portrait ? "portrait" : undefined} />;
}
