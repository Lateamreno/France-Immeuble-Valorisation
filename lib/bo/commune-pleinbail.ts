// La page d'une commune sur Plein Bail, retrouvée sans se tromper.
//
// Les pages s'appellent `/villes/<slug>-<code INSEE>` — pas le code postal :
// « digne-les-bains-04070 » existe, « digne-les-bains-04000 » n'existe pas
// (vérifié le 28/09). Le BO ne connaît que la ville et le code postal ; il
// lit donc le plan du site (`/sitemap/villes.xml`, 35 000 adresses, 500 Ko),
// le garde une journée, et y cherche le slug de la ville dans le bon
// département. Pas trouvé : le lien renvoie à l'index des villes plutôt qu'à
// une page qui n'existe pas.
//
// Retour #575 (28/10) : le plan du site ne liste plus que 3 477 villes —
// Barbezieux-Saint-Hilaire n'y est pas, alors que sa page existe. Le code
// INSEE se prend donc d'abord dans le référentiel des communes du BO
// (`bo_villes_stats`, 13 209 communes), le plan du site ne servant qu'à
// défaut. Et jamais le code postal à la place : « …-16300 » répond bien, mais
// avec la page d'une AUTRE commune (Val-de-Bonnieure).

const SITEMAP = "https://www.pleinbail.fr/sitemap/villes.xml";
const INDEX = "https://www.pleinbail.fr/villes";
const UN_JOUR = 24 * 3600 * 1000;

let cache: { lu: number; urls: string[] } | null = null;

/** « L'Isle-Adam » → « l-isle-adam », comme Plein Bail écrit ses slugs. */
export function slugCommune(ville: string): string {
  return ville
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Le préfixe INSEE d'un code postal : « 04 », « 974 » outre-mer, « 2A/2B » en Corse. */
function prefixeInsee(cp: string): string[] {
  if (cp.startsWith("97") || cp.startsWith("98")) return [cp.slice(0, 3)];
  if (cp.startsWith("20")) return ["2A", "2B"];
  return [cp.slice(0, 2)];
}

async function urlsVilles(): Promise<string[]> {
  if (cache && Date.now() - cache.lu < UN_JOUR) return cache.urls;
  const res = await fetch(SITEMAP, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return cache?.urls ?? [];
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /\/villes\/[^/]+-[0-9ab]{5}$/i.test(u));
  cache = { lu: Date.now(), urls };
  return urls;
}

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Le code INSEE d'après le référentiel des communes du BO, ou rien. */
async function inseeDuBo(ville: string, slug: string, prefixes: string[]): Promise<string | undefined> {
  if (!SB_KEY) return undefined;
  /* Le nom exact d'abord ; les variantes d'écriture (tirets, accents,
     « St » pour « Saint ») se rattrapent en comparant les slugs. */
  const mot = ville.split(/[\s'-]+/).filter((m) => m.length > 2).sort((a, b) => b.length - a.length)[0] ?? ville;
  const res = await fetch(
    `${SB_URL}/rest/v1/bo_villes_stats?select=code_insee,nom,departement&nom=ilike.*${encodeURIComponent(mot)}*&limit=200`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return undefined;
  const lignes = (await res.json()) as { code_insee: string; nom: string; departement: string }[];
  return lignes.find((l) => slugCommune(l.nom) === slug && prefixes.some((p) => l.code_insee.toUpperCase().startsWith(p)))?.code_insee;
}

/**
 * L'adresse de la page de la commune, ou l'index des villes si elle n'est
 * pas trouvée. Ne renvoie jamais un lien inventé.
 */
export async function pageCommunePleinBail(ville: string | undefined, codePostal: string | undefined): Promise<string> {
  const slug = slugCommune(ville ?? "");
  const cp = (codePostal ?? "").trim();
  if (!slug || !/^\d{5}$/.test(cp)) return INDEX;
  const prefixes = prefixeInsee(cp);
  const insee = await inseeDuBo(ville ?? "", slug, prefixes).catch(() => undefined);
  if (insee) return `${INDEX}/${slug}-${insee.toLowerCase()}`;
  const urls = await urlsVilles();
  const candidats = urls.filter((u) => {
    const m = /\/villes\/(.+)-([0-9ab]{5})$/i.exec(u);
    return !!m && m[1] === slug && prefixes.some((p) => m[2].toUpperCase().startsWith(p));
  });
  return candidats[0] ?? INDEX;
}
