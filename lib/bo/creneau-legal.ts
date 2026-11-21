// Le créneau légal de la prospection par SMS et RCS (CLAUDE.md §7.5) : du
// lundi au samedi, de 8 h à 22 h (heure de Paris), hors jours fériés.
// Module pur, partagé par le serveur (programmation, cron) et par l'écran
// (vérifier AVANT de créer quoi que ce soit).

/** Pâques (grégorien, algorithme anonyme) : jour et mois. */
function paques(annee: number): { m: number; j: number } {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: mois, j: jour };
}

function feries(annee: number): Set<string> {
  const p = paques(annee);
  const base = Date.UTC(annee, p.m - 1, p.j);
  const decale = (n: number) => new Date(base + n * 86_400_000).toISOString().slice(5, 10);
  return new Set([
    "01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25",
    decale(1), decale(39), decale(50), // lundi de Pâques, Ascension, lundi de Pentecôte
  ]);
}

/** L'heure de Paris d'un instant : année, mois-jour, jour de semaine, heure. */
function aParis(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
    }).formatToParts(d).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    annee: Number(parts.year),
    moisJour: `${parts.month}-${parts.day}`,
    semaine: parts.weekday,
    minutes: Number(parts.hour) % 24 * 60 + Number(parts.minute),
  };
}

/**
 * Le créneau légal de la prospection par SMS (CLAUDE.md §7.5) : du lundi au
 * samedi, de 8 h à 22 h, hors jours fériés. Rend la raison du refus, ou null.
 */
export function horsCreneauLegal(d: Date): string | null {
  const p = aParis(d);
  if (p.semaine === "Sun") return "un dimanche";
  if (feries(p.annee).has(p.moisJour)) return "un jour férié";
  if (p.minutes < 8 * 60 || p.minutes >= 22 * 60) return "en dehors de 8 h – 22 h";
  return null;
}

