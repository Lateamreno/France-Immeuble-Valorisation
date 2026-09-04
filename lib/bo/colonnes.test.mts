import { colonneApres } from "./colonnes";
const cas: [string, string[], string | null, string][] = [
  ["4 - OK pour vendre", ["A", "B"],        "5 - Commercialisé (A/B)",  "A et B seuls → deuxième colonne"],
  ["4 - OK pour vendre", ["A", "C"],        "6 - Commercialisé (all)",  "un C dedans → dernière colonne"],
  ["4 - OK pour vendre", ["B", "D"],        "6 - Commercialisé (all)",  "un D dedans → dernière colonne"],
  ["4 - OK pour vendre", ["A", undefined],  "6 - Commercialisé (all)",  "un sans-grade compte comme tous"],
  ["5 - Commercialisé (A/B)", ["A"],        null,                       "déjà en A/B, un A ne rebouge rien"],
  ["5 - Commercialisé (A/B)", ["C"],        "6 - Commercialisé (all)",  "de A/B vers tous : ça monte"],
  ["6 - Commercialisé (all)", ["A", "B"],   null,                       "jamais à reculons depuis tous"],
  ["7 - Sous offre", ["A"],                 null,                       "sous offre : on ne touche à rien"],
  ["9 - Sous compromis", ["C"],             null,                       "au compromis : on ne touche à rien"],
  ["11 - VENDU", ["A"],                     null,                       "vendu : on ne touche à rien"],
];
let ko = 0;
for (const [statut, notes, attendu, quoi] of cas) {
  const r = colonneApres(statut, notes);
  const ok = r === attendu;
  if (!ok) ko++;
  console.log(`${ok ? "✓" : "✗"} ${quoi}\n    ${statut} + [${notes.map(n => n ?? "—").join(", ")}] → ${r ?? "aucun changement"}`);
}
console.log(ko === 0 ? `\n${cas.length}/${cas.length} — la règle de colonne tient.` : `\n${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
