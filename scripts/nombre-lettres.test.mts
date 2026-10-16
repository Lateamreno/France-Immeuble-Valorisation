// Montants en toutes lettres : les cas piégeux, dont ceux des maquettes.
// Lancer : node --experimental-strip-types scripts/nombre-lettres.test.mts

import { entierEnLettres, euroEnLettres, dureeEnLettres } from "../lib/nombre-lettres.ts";
const cas: [number, string][] = [
  [0, "zéro"], [1, "un"], [7, "sept"], [16, "seize"], [17, "dix-sept"],
  [20, "vingt"], [21, "vingt et un"], [22, "vingt-deux"],
  [70, "soixante-dix"], [71, "soixante et onze"], [72, "soixante-douze"], [79, "soixante-dix-neuf"],
  [80, "quatre-vingts"], [81, "quatre-vingt-un"], [82, "quatre-vingt-deux"],
  [90, "quatre-vingt-dix"], [91, "quatre-vingt-onze"], [99, "quatre-vingt-dix-neuf"],
  [100, "cent"], [101, "cent un"], [180, "cent quatre-vingts"],
  [200, "deux cents"], [201, "deux cent un"], [280, "deux cent quatre-vingts"],
  [1000, "mille"], [1001, "mille un"], [2000, "deux mille"], [80000, "quatre-vingt mille"],
  [100000, "cent mille"], [200000, "deux cent mille"],
  [1000000, "un million"], [2000000, "deux millions"], [1000007, "un million sept"],
  [1000000000, "un milliard"], [80000000, "quatre-vingts millions"], [200000000, "deux cents millions"], [71000, "soixante et onze mille"],
  // Les montants exacts des maquettes.
  [4620000, "quatre millions six cent vingt mille"],
  [4400000, "quatre millions quatre cent mille"],
  [220000, "deux cent vingt mille"],
  [3570000, "trois millions cinq cent soixante-dix mille"],
  [170000, "cent soixante-dix mille"],
];
let ko = 0;
for (const [n, attendu] of cas) {
  const r = entierEnLettres(n);
  if (r !== attendu) { console.log(`✗ ${n} → « ${r} »   attendu « ${attendu} »`); ko++; }
}
const euros: [number, string][] = [
  [36666.67, "trente-six mille six cent soixante-six euros et soixante-sept centimes"],
  [28333.33, "vingt-huit mille trois cent trente-trois euros et trente-trois centimes"],
  [4620000, "quatre millions six cent vingt mille euros"],
  [1, "un euro"], [0.01, "zéro euro et un centime"], [0, "zéro euro"],
  [2773895.23, "deux millions sept cent soixante-treize mille huit cent quatre-vingt-quinze euros et vingt-trois centimes"],
];
for (const [n, attendu] of euros) {
  const r = euroEnLettres(n);
  if (r !== attendu) { console.log(`✗ ${n} € → « ${r} »\n            attendu « ${attendu} »`); ko++; }
}
console.log(dureeEnLettres(12, "mois"), "·", dureeEnLettres(15, "jours"), "·", dureeEnLettres(3, "mois"));
console.log(ko === 0 ? `✓ ${cas.length + euros.length} cas passent` : `${ko} ÉCHECS`);
