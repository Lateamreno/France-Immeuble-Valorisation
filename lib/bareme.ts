// Barème d'honoraires de France Immeuble.
//
// Dicté par MAV (retour #190) :
//
//   · jusqu'à 5 000 000 € de net vendeur  →  5 % TTC, minimum 12 000 € TTC
//   · de 5 000 000 à 10 000 000 €          →  4 % TTC, minimum 250 000 € TTC
//
// Les deux tranches se rejoignent sans marche : à 5 M€ pile, 5 % font
// 250 000 €, qui est aussi le plancher de la tranche suivante. Le barème est
// donc continu et strictement croissant — c'est ce qui permet de l'inverser.
//
// Depuis l'arrêté du 26 janvier 2022 le barème affiché est un MAXIMUM : le
// taux réellement pratiqué peut être inférieur, jamais supérieur. D'où
// `plafondTaux`, que l'écran de saisie utilise pour borner.
//
// Ces valeurs passeront dans « Réglages de l'agence » (retour #191) : elles
// vivent déjà seules ici pour que le déplacement ne touche qu'un fichier.

export type Tranche = { jusqua: number; taux: number; minimum: number };

export const BAREME: Tranche[] = [
  { jusqua: 5_000_000, taux: 5, minimum: 12_000 },
  { jusqua: 10_000_000, taux: 4, minimum: 250_000 },
  // Au-delà de dix millions, le barème affiché s'arrête ; on prolonge la
  // dernière tranche plutôt que de rendre zéro.
  { jusqua: Infinity, taux: 4, minimum: 250_000 },
];

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

/** La tranche applicable à un net vendeur. */
export const trancheDe = (nv: number) =>
  BAREME.find((t) => nv <= t.jusqua) ?? BAREME[BAREME.length - 1];

/** Honoraires TTC dus au barème pour un net vendeur donné. */
export function honorairesBareme(nv: number): { honos: number; taux: number } {
  if (!Number.isFinite(nv) || nv <= 0) return { honos: 0, taux: 0 };
  const t = trancheDe(nv);
  const honos = Math.round(Math.max(nv * (t.taux / 100), t.minimum));
  return { honos, taux: arrondi2((honos / nv) * 100) };
}

/** Le taux maximal admis pour ce net vendeur — le barème est un plafond. */
export const plafondTaux = (nv: number) =>
  !Number.isFinite(nv) || nv <= 0 ? BAREME[0].taux : honorairesBareme(nv).taux;

/**
 * L'opération inverse : quel net vendeur donne ce prix HAI, honoraires du
 * barème compris ?
 *
 * C'est le calcul dont l'agent a besoin, parce que c'est le prix HAI qu'il
 * annonce et qu'il saisit — le net vendeur, lui, en découle.
 *
 * Le barème étant continu et croissant, chaque tranche se résout
 * algébriquement ; on retient la première solution qui retombe bien dans sa
 * propre tranche. Un plancher se résout à part : les honoraires y sont fixes,
 * donc le net vendeur vaut simplement le HAI moins ce plancher.
 */
export function netVendeurDepuisHai(hai: number): { nv: number; honos: number; taux: number } {
  if (!Number.isFinite(hai) || hai <= 0) return { nv: 0, honos: 0, taux: 0 };

  let bas = 0;
  for (const t of BAREME) {
    // Cas « plancher » : les honoraires ne dépendent plus du net vendeur.
    const nvPlancher = hai - t.minimum;
    if (nvPlancher > bas && nvPlancher <= t.jusqua && nvPlancher * (t.taux / 100) <= t.minimum) {
      const nv = Math.round(nvPlancher);
      return { nv, honos: hai - nv, taux: arrondi2(((hai - nv) / nv) * 100) };
    }
    // Cas courant : hai = nv × (1 + taux/100).
    const nvTaux = hai / (1 + t.taux / 100);
    if (nvTaux > bas && nvTaux <= t.jusqua && nvTaux * (t.taux / 100) >= t.minimum) {
      const nv = Math.round(nvTaux);
      return { nv, honos: hai - nv, taux: arrondi2(((hai - nv) / nv) * 100) };
    }
    bas = t.jusqua;
  }
  // Filet : ne jamais rendre un prix incohérent.
  const nv = Math.round(hai / (1 + BAREME[BAREME.length - 1].taux / 100));
  return { nv, honos: hai - nv, taux: arrondi2(((hai - nv) / nv) * 100) };
}

/** Le barème en clair, pour l'afficher à côté de la saisie. */
export const baremeTexte = () =>
  BAREME.slice(0, 2)
    .map((t, i) =>
      `${i === 0 ? "jusqu'à" : "de 5 M€ à"} ${t.jusqua >= 1e6 ? `${t.jusqua / 1e6} M€` : t.jusqua} : `
      + `${String(t.taux).replace(".", ",")} % TTC, minimum ${t.minimum.toLocaleString("fr-FR")} € TTC`)
    .join(" · ");
