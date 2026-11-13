/**
 * Les villes à arrondissements s'écrivent avec leur arrondissement (retour
 * #551 : « Paris Xème pour que je sache direct dans quel arrondissement
 * c'est »). Le code postal le donne : 75011 → 11, 75116 → 16, 69003 → 3,
 * 13008 → 8.
 */
const VILLES: { re: RegExp; nom: string; cp: RegExp; max: number }[] = [
  { re: /^paris\b/i, nom: "Paris", cp: /^75(?:0(\d\d)|1(16))$/, max: 20 },
  { re: /^lyon\b/i, nom: "Lyon", cp: /^690(\d\d)$/, max: 9 },
  { re: /^marseille\b/i, nom: "Marseille", cp: /^130(\d\d)$/, max: 16 },
];

const rang = (n: number) => (n === 1 ? "1er" : `${n}ème`);

/** « Paris 11ème », « Lyon 3ème », « Marseille 1er » ; `null` hors de ces villes. */
export function villeArrondissement(ville: unknown, cp: unknown): string | null {
  const v = String(ville ?? "").trim();
  const c = String(cp ?? "").replace(/\s/g, "");
  for (const x of VILLES) {
    if (!x.re.test(v)) continue;
    const m = c.match(x.cp);
    const n = m ? Number(m[1] ?? m[2]) : NaN;
    if (n >= 1 && n <= x.max) return `${x.nom} ${rang(n)}`;
  }
  return null;
}

/** L'adresse complète, pour le survol de la ville. */
export function adresseComplete(numero: unknown, rue: unknown, cp: unknown, ville: unknown): string {
  const voie = [numero, rue].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
  const loc = [cp, ville].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");
  return [voie, loc].filter(Boolean).join(", ");
}
