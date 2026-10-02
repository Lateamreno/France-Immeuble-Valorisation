// Helpers de formatage partagés serveur/client (dates Europe/Paris, prix).
const FR_DATE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

export const dmy = (iso?: unknown): string | undefined => {
  if (typeof iso !== "string") return undefined;
  const d = new Date(iso);
  if (Number.isNaN(+d)) return undefined;
  return FR_DATE.format(d);
};

/* ------------------------------------------------ Les dates d'état civil

   Bubble enregistre une date choisie à Paris comme l'INSTANT UTC de minuit
   parisien : le 16 décembre 1964 devient « 1964-12-15T23:00:00.000Z » l'hiver
   (CET = UTC+1) et « …T22:00:00.000Z » l'été (CEST = UTC+2). Sur les 124
   contacts qui portent une date de naissance, 122 ont cette forme.

   Deux conséquences, et les deux ont mordu :

     • Lire le jour en UTC — ou couper la chaîne à dix caractères — rend le jour
       PRÉCÉDENT. Un mandat imprimait « né le 15/12/1964 » pour quelqu'un né le
       16, et la case de saisie reculait la date d'un jour à chaque
       enregistrement.

     • Une date de naissance ne se lit pas sur deux chiffres d'année. « 16/12/64 »
       est ambigu sur un acte que quelqu'un relira dans quarante ans, et illisible
       pour un centenaire.

   D'où deux fonctions dédiées, à utiliser partout où l'on touche à une date
   d'état civil — jamais `dmy`, jamais `.slice(0, 10)`. */

const FR_DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** Le jour civil parisien d'une date, au format d'affichage : « 16/12/1964 ». */
export const dateCivile = (v?: unknown): string | undefined => {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const d = new Date(v);
  if (Number.isNaN(+d)) return undefined;
  return FR_DATE_LONGUE.format(d);
};

const FR_JOUR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Le jour civil parisien d'une date, au format qu'attend `<input type="date">`
 * : « 1964-12-16 ».
 *
 * Une date déjà nue (« 1964-12-16 ») ressort telle quelle : la fonction est
 * idempotente, on peut la passer sur une valeur qui vient d'être saisie sans
 * risquer de la décaler à chaque frappe.
 */
export const jourIso = (v?: unknown): string | undefined => {
  if (typeof v !== "string" || !v.trim()) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  const d = new Date(v);
  if (Number.isNaN(+d)) return undefined;
  return FR_JOUR.format(d);
};

/**
 * « Dossier V3 — 12/08/26 » : le libellé d'un dossier dans un sélecteur
 * (retour #325).
 *
 * MAV : « sur le dossier sélectionné il faut rajouter le numéro de version en
 * plus de la date. » Deux dossiers générés le même jour se lisaient pareil, et
 * c'est la version qui figure au pied du dossier imprimé — sans elle, on ne
 * sait pas lequel on est en train de joindre à un e-mail.
 */
export const libelleDossier = (d: Record<string, unknown>): string => {
  const titre = typeof d.titre === "string" && d.titre.trim() ? d.titre.trim() : "Dossier";
  const v = d.version === undefined || d.version === null ? "" : ` V${String(d.version)}`;
  const date = dmy(d["Created Date"]);
  return `${titre}${v}${date ? ` — ${date}` : ""}`;
};

export const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const euros = (n?: unknown): string | undefined =>
  typeof n === "number" && n > 0 ? `${group(n)} €` : undefined;

export const keur = (n?: unknown): string | undefined =>
  typeof n === "number" && n > 0 ? `${Math.round(n / 1000)} k€` : undefined;

/* --- Objet n° 9 du catalogue (25/09) : les deux petits utilitaires que
   quatorze fichiers recopiaient en tête. Rien de visible ; c'est du rangement. */

/** Une chaîne, quoi qu'il arrive : vide si la valeur est absente. */
export const S = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

/** Un nombre fini, ou rien : jamais NaN, jamais une chaîne. */
export const N = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
