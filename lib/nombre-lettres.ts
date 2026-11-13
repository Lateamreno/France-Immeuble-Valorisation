// Montants en toutes lettres — orthographe traditionnelle française.
//
// Le mandat écrit chaque montant deux fois : en chiffres puis en lettres. Ce
// n'est pas de la coquetterie — c'est la version en lettres qui l'emporte en
// cas de discordance dans un acte, donc elle doit être juste au centime.
//
// Orthographe retenue : celle des maquettes validées, c'est-à-dire la
// traditionnelle — trait d'union seulement à l'intérieur des composés
// inférieurs à cent, « et » pour 21, 31, 41, 51, 61 et 71 :
//
//   4 620 000       → quatre millions six cent vingt mille
//   36 666,67       → trente-six mille six cent soixante-six euros
//                     et soixante-sept centimes
//
// Les accords qui piègent, tous couverts par les tests :
//   · quatre-vingts prend un s seul (80), pas suivi (81, 82…)
//   · cent prend un s au pluriel seul (200) mais pas suivi (201)
//   · mille est invariable ; million et milliard s'accordent
//   · les zéros intermédiaires ne produisent aucun mot (1 000 007)

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];

const DIZAINES = [
  "", "", "vingt", "trente", "quarante", "cinquante", "soixante",
  "soixante", "quatre-vingt", "quatre-vingt",
];

/** 0 à 99. */
function souscent(n: number): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  // Soixante-dix et quatre-vingt-dix comptent en base vingt : 71 = soixante et
  // onze, 92 = quatre-vingt-douze.
  if (d === 7 || d === 9) {
    const reste = UNITES[10 + u];
    // « soixante et onze », mais « quatre-vingt-onze » : le « et » ne joue
    // qu'après soixante.
    return d === 7 && u === 1 ? "soixante et onze" : `${DIZAINES[d]}-${reste}`;
  }
  if (u === 0) return d === 8 ? "quatre-vingts" : DIZAINES[d];
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/** 0 à 999. */
function souscmille(n: number): string {
  if (n < 100) return souscent(n);
  const c = Math.floor(n / 100);
  const reste = n % 100;
  // « cent » seul, « deux cents » au pluriel, « deux cent un » dès qu'il est
  // suivi.
  const tete = c === 1 ? "cent" : reste === 0 ? `${UNITES[c]} cents` : `${UNITES[c]} cent`;
  return reste === 0 ? tete : `${tete} ${souscent(reste)}`;
}

const ECHELLES: [number, string, boolean][] = [
  // valeur, nom, s'accorde au pluriel
  [1_000_000_000, "milliard", true],
  [1_000_000, "million", true],
  [1_000, "mille", false],
];

/** Un entier positif en toutes lettres. */
export function entierEnLettres(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  const e = Math.floor(n);
  if (e === 0) return "zéro";

  const morceaux: string[] = [];
  let reste = e;
  for (const [valeur, nom, accorde] of ECHELLES) {
    const combien = Math.floor(reste / valeur);
    if (combien === 0) continue;
    reste %= valeur;
    // « mille », jamais « un mille ». « un million » en revanche se dit.
    let tete = combien === 1 && !accorde ? "" : `${souscmille(combien)} `;
    // « quatre-vingt mille » et « deux cent mille » perdent leur s : mille est
    // un numéral invariable, pas un nom. Devant million et milliard, qui sont
    // des noms, le pluriel tient — « quatre-vingts millions ».
    if (!accorde) tete = tete.replace(/(vingt|cent)s /g, "$1 ");
    const pluriel = accorde && combien > 1 ? "s" : "";
    morceaux.push(`${tete}${nom}${pluriel}`);
  }
  if (reste > 0) morceaux.push(souscmille(reste));
  return morceaux.join(" ");
}

/**
 * Un montant en euros, en toutes lettres, centimes compris.
 *
 * `1234.5` → « mille deux cent trente-quatre euros et cinquante centimes ».
 * Sans centimes, la mention est simplement omise.
 */
export function euroEnLettres(montant: number): string {
  if (!Number.isFinite(montant)) return "";
  const negatif = montant < 0;
  // Arrondi AVANT découpe : 0.005 doit donner un centime, pas zéro.
  const total = Math.round(Math.abs(montant) * 100);
  const euros = Math.floor(total / 100);
  const centimes = total % 100;

  // « zéro euro » et « un euro » au singulier ; pluriel à partir de deux.
  const t = `${entierEnLettres(euros)} ${euros < 2 ? "euro" : "euros"}`
    + (centimes > 0
      ? ` et ${entierEnLettres(centimes)} ${centimes === 1 ? "centime" : "centimes"}`
      : "");
  return negatif ? `moins ${t}` : t;
}

/**
 * Un nombre en lettres suivi de son chiffre — « trois (3) ».
 *
 * C'est la forme que le mandat emploie partout dès qu'il dénombre : trois (3)
 * locaux commerciaux, douze (12) appartements, dix-huit (18) locaux loués.
 */
export const nombreAvecChiffre = (n: number) => `${entierEnLettres(n)} (${n})`;

/**
 * Une durée telle que le mandat l'écrit : en lettres, le chiffre entre
 * parenthèses — « douze (12) mois », « quinze (15) jours ».
 */
export function dureeEnLettres(n: number, unite: "mois" | "jours" | "an"): string {
  const mot = unite === "an" ? (n > 1 ? "ans" : "an") : unite;
  return `${nombreAvecChiffre(n)} ${mot}`;
}
