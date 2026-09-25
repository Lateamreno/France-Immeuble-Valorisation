/**
 * Les pictogrammes des composants du bâti (retour #397), partagés par l'écran
 * Technique du BO et par le dossier de vente (MAV, 25/09 : « les mêmes que
 * dans le BO »). Module sans « use client » : le dossier est rendu côté
 * serveur et ne peut pas importer une constante d'un module client.
 */
import type { ReactNode } from "react";

export const IC_COMPOSANT: Record<string, ReactNode> = {
  /* Un radiateur : le corps et ses ailettes, les deux pieds. */
  Chauffage: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7.5 6v12M12 6v12M16.5 6v12M5.5 18v2.5M18.5 18v2.5" /></>,
  /* Un immeuble : trois étages de fenêtres, la porte. */
  Façade: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M8.5 7h2M13.5 7h2M8.5 11h2M13.5 11h2M8.5 15h2M13.5 15h2M10.5 21v-3.5h3V21" /></>,
  /* Une fenêtre à quatre carreaux. */
  Fenêtres: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M12 4v16M4 12h16" /></>,
  /* Un toit qui déborde des murs, avec sa cheminée. */
  Toiture: <><path d="M2.5 13.5 12 5l9.5 8.5" /><path d="M16.3 6.3h2.4v4.2" /><path d="M5.5 10.8V19.5h13v-8.7" /></>,
  /* Une cabine, la flèche qui monte et celle qui descend. */
  Ascenseur: <><rect x="4.5" y="3" width="15" height="18" rx="1.5" /><path d="M12 3v18" /><path d="m6.8 10.5 1.7-2.2 1.7 2.2M13.8 13.5l1.7 2.2 1.7-2.2" /></>,
  /* Une grille d'évacuation. */
  Assainissement: <><circle cx="12" cy="12" r="8.5" /><path d="M12 5.5v13M8.2 7.4v9.2M15.8 7.4v9.2" /></>,
  /* Une ferme de charpente : l'entrait, les arbalétriers, le poinçon. */
  Charpente: <><path d="M2.5 18 12 5l9.5 13z" /><path d="M12 5v13M7.25 11.5 12 18l4.75-6.5" /></>,
  /* Sous le toit, la lucarne. */
  Combles: <><path d="M3 15 12 5l9 10" /><path d="M6 15v5.5h12V15" /><rect x="10" y="10.5" width="4" height="4.5" /></>,
  /* Un éclair. */
  Electricité: <><path d="M13.5 2.5 5 13.5h6L10.5 21.5 19 10.5h-6z" /></>,
  /* Un coude de tuyau, avec ses deux brides. */
  Plomberie: <><path d="M2.5 8.5h8.5a3 3 0 0 1 3 3V21" /><path d="M2.5 12.5h8.5v8.5" /><path d="M2.5 7v7M9.5 21h7" /></>,
  /* Un escalier : les parties communes se montent. */
  "Parties communes": <><path d="M3 20v-4h4.5v-4H12V8h4.5V4H21" /><path d="M3 20h18" /></>,
  /* Un ventilateur, quatre pales. */
  Ventilation: <><circle cx="12" cy="12" r="2.2" /><path d="M12 9.8C12 6 10.5 4 8 4c1.5 2 2 4 4 5.8zM14.2 12C18 12 20 10.5 20 8c-2 1.5-4 2-5.8 4zM12 14.2C12 18 13.5 20 16 20c-1.5-2-2-4-4-5.8zM9.8 12C6 12 4 13.5 4 16c2-1.5 4-2 5.8-4z" /></>,
  /* Deux battants à lames. */
  Volets: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M12 3v18M6.5 7h3M6.5 10.5h3M6.5 14h3M6.5 17.5h3M14.5 7h3M14.5 10.5h3M14.5 14h3M14.5 17.5h3" /></>,
  /* Le cube d'avant, pour ce qui n'a pas de dessin à lui. */
  Autre: <><path d="M12 2.6 21 7v10l-9 4.4L3 17V7z" /><path d="m3 7 9 4.4L21 7M12 11.4V21.4" /></>,
};


export const pictoComposant = (type: string) => IC_COMPOSANT[type] ?? IC_COMPOSANT.Autre;
