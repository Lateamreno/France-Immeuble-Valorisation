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

export const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const euros = (n?: unknown): string | undefined =>
  typeof n === "number" && n > 0 ? `${group(n)} €` : undefined;

export const keur = (n?: unknown): string | undefined =>
  typeof n === "number" && n > 0 ? `${Math.round(n / 1000)} k€` : undefined;
