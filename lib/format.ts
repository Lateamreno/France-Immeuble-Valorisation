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
