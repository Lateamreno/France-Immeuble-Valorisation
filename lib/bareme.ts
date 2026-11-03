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

/* Toutes les fonctions acceptent un barème en argument : c'est celui des
   « Réglages de l'agence » quand l'écran le fournit, celui du code sinon. Sans
   cette porte, régler le barème n'aurait aucun effet. */

/** La tranche applicable à un net vendeur. */
export const trancheDe = (nv: number, bareme: Tranche[] = BAREME) =>
  bareme.find((t) => nv <= t.jusqua) ?? bareme[bareme.length - 1];

/** Honoraires TTC dus au barème pour un net vendeur donné. */
export function honorairesBareme(nv: number, bareme: Tranche[] = BAREME): { honos: number; taux: number } {
  if (!Number.isFinite(nv) || nv <= 0) return { honos: 0, taux: 0 };
  const t = trancheDe(nv, bareme);
  const honos = Math.round(Math.max(nv * (t.taux / 100), t.minimum));
  return { honos, taux: arrondi2((honos / nv) * 100) };
}

/** Le taux maximal admis pour ce net vendeur — le barème est un plafond. */
export const plafondTaux = (nv: number, bareme: Tranche[] = BAREME) =>
  !Number.isFinite(nv) || nv <= 0 ? bareme[0].taux : honorairesBareme(nv, bareme).taux;

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
export function netVendeurDepuisHai(hai: number, bareme: Tranche[] = BAREME): { nv: number; honos: number; taux: number } {
  if (!Number.isFinite(hai) || hai <= 0) return { nv: 0, honos: 0, taux: 0 };

  let bas = 0;
  for (const t of bareme) {
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
  const nv = Math.round(hai / (1 + bareme[bareme.length - 1].taux / 100));
  return { nv, honos: hai - nv, taux: arrondi2(((hai - nv) / nv) * 100) };
}

/**
 * Le partage d'un prix HAI entre net vendeur et honoraires TTC, barème TOUJOURS
 * respecté (MAV, 03/11 : « estimation à 208 000 € et tu as mis les honos à
 * 9 k€ environ alors que le minimum c'est 12 k€ TTC. Il faut que tu respectes
 * le barème des honos tout le temps, que ce soit les minimums ou les
 * pourcentages »).
 *
 * `tauxChoisi` est le taux saisi à l'écran (% TTC du net vendeur) :
 *   • absent, ou au moins égal au taux du barème → le barème plein, minimum
 *     compris (208 000 € HAI → 196 000 € net vendeur + 12 000 € d'honoraires) ;
 *   • plus bas (honoraires consentis en dessous du barème, qui est un
 *     plafond) → ce taux, mais jamais moins que le minimum de la tranche.
 * `auMinimum` dit quand c'est le minimum qui a fixé les honoraires : l'écran
 * l'affiche, pour que le taux réel (6,12 % ici) ne surprenne personne.
 */
export function ventilerHai(
  hai: number,
  tauxChoisi?: number,
  bareme: Tranche[] = BAREME,
): { nv: number; honos: number; taux: number; auMinimum: boolean } {
  if (!Number.isFinite(hai) || hai <= 0) return { nv: 0, honos: 0, taux: 0, auMinimum: false };
  const plein = netVendeurDepuisHai(hai, bareme);
  const tPlein = trancheDe(plein.nv, bareme);
  const minimumPlein = plein.nv * (tPlein.taux / 100) < tPlein.minimum;
  if (tauxChoisi === undefined || !Number.isFinite(tauxChoisi) || tauxChoisi >= tPlein.taux) {
    return { ...plein, auMinimum: minimumPlein };
  }
  const nvTaux = Math.round(hai / (1 + Math.max(0, tauxChoisi) / 100));
  const t = trancheDe(nvTaux, bareme);
  if (hai - nvTaux < t.minimum) {
    const honos = Math.min(t.minimum, hai);
    const nv = hai - honos;
    return { nv, honos, taux: nv > 0 ? arrondi2((honos / nv) * 100) : 0, auMinimum: true };
  }
  return { nv: nvTaux, honos: hai - nvTaux, taux: arrondi2(((hai - nvTaux) / nvTaux) * 100), auMinimum: false };
}

/**
 * Les honoraires d'un net vendeur, barème respecté : le taux choisi (jamais
 * au-dessus du barème) et jamais moins que le minimum de la tranche.
 */
export function honorairesDepuisNv(
  nv: number,
  tauxChoisi?: number,
  bareme: Tranche[] = BAREME,
): { honos: number; taux: number; auMinimum: boolean } {
  if (!Number.isFinite(nv) || nv <= 0) return { honos: 0, taux: 0, auMinimum: false };
  const t = trancheDe(nv, bareme);
  const taux = tauxChoisi === undefined || !Number.isFinite(tauxChoisi) ? t.taux : Math.min(Math.max(0, tauxChoisi), t.taux);
  const brut = nv * (taux / 100);
  const honos = Math.round(Math.max(brut, t.minimum));
  return { honos, taux: arrondi2((honos / nv) * 100), auMinimum: brut < t.minimum };
}

/** Les honoraires sont-ils sous le minimum de la tranche ? (saisie à la main) */
export const sousMinimum = (nv: number, honos: number, bareme: Tranche[] = BAREME) =>
  Number.isFinite(nv) && nv > 0 && Number.isFinite(honos) && honos < trancheDe(nv, bareme).minimum - 0.5;

/** Le barème en clair, pour l'afficher à côté de la saisie. */
export const baremeTexte = (bareme: Tranche[] = BAREME) =>
  bareme.slice(0, 2)
    .map((t, i) =>
      `${i === 0 ? "jusqu'à" : "de 5 M€ à"} ${t.jusqua >= 1e6 ? `${t.jusqua / 1e6} M€` : t.jusqua} : `
      + `${String(t.taux).replace(".", ",")} % TTC, minimum ${t.minimum.toLocaleString("fr-FR")} € TTC`)
    .join(" · ");
