// Les textes retouchables de la carte RCS (MAV, 09/11) : l'accroche et le SMS
// de repli. Module pur, partagé par le serveur et par l'écran (compteur,
// contrôle avant envoi) — rcs.ts, lui, tire sharp et ne descend pas au
// navigateur.

/** Le nombre de caractères facturés d'un SMS de repli (doc MailingVox : ces signes comptent double). */
export const longueurRepli = (t: string) => [...t].reduce((s, c) => s + ("|^€{}[~]\\".includes(c) ? 2 : 1), 0);

/** L'accroche saisie à l'écran, au format MailingVox : pas de balise, `<br>` aux retours à la ligne. */
export function introVersCarte(t: string): string {
  return t.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/\r\n?/g, "\n").trim().split("\n").map((l) => l.trim()).join("<br>").slice(0, 1200);
}

/**
 * Pourquoi un SMS de repli ne peut pas partir, ou null. 145 caractères au
 * plus (MailingVox, erreur 134), et la mention STOP : la prospection
 * commerciale par SMS doit offrir le désabonnement.
 */
export function refusRepli(t: string, numeroStop = "36200"): string | null {
  if (!t.trim()) return "le SMS de repli est vide";
  const n = longueurRepli(t);
  if (n > 145) return `le SMS de repli fait ${n} caractères, 145 au plus`;
  if (!/STOP\s*\d{5}/i.test(t)) return `le SMS de repli doit garder la mention « STOP ${numeroStop} »`;
  return null;
}
