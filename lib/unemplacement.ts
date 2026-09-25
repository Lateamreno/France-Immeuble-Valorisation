/* unemplacement.com — les loyers et les prix de l'immobilier d'entreprise
 * (retours #157 et #158).
 *
 * MAV : « Dans les prix du secteur de bureaux, commerces, entrepôts j'aimerais
 * que tu prennes comme base unemplacement.com qui a pas mal de data. […] Si
 * t'arrives même directement à extraire la donnée sans que j'aie à aller la
 * chercher c'est encore mieux. »
 *
 * SeLoger ne cote pas les baux commerciaux : ses pages ne valaient rien pour
 * un local, un bureau ou un entrepôt. unemplacement.com publie, commune par
 * commune, un loyer moyen et un prix moyen au m² avec leur fourchette. On fait
 * donc deux choses : le lien (un bouton en face du champ qu'il remplit) et la
 * valeur (lue sur la page, proposée comme repère).
 *
 * L'ADRESSE DES PAGES, vérifiée sur leur sitemap (4 016 pages de ville) :
 *
 *     /{rubrique}/{zone}/{ville}-{cp}
 *
 * `zone` est le département en slug suivi de son numéro — « hauts-de-seine-92 »
 * — sauf trois cas relevés en comparant les 4 016 URL à la règle :
 *   · Paris, rangé sous « ile-de-france » et découpé en arrondissements ;
 *   · la Corse, « corse-du-sud-2a » / « haute-corse-2b », qu'on ne distingue
 *     qu'au code INSEE (le code postal 20xxx ne dit pas lequel des deux) ;
 *   · une commune à cheval sur deux départements, qu'on laisse tomber.
 *
 * Les loyers y sont annuels (« 376 € m² /an ») ; le BO les stocke au mois.
 */

import { slugDepartement } from "./seloger";

/** Les trois rubriques du site, et la destination du BO qui va avec. */
export type Rubrique = "commerce" | "bureaux" | "entrepots";

export const RUBRIQUE_PAR_DEST: Record<string, Rubrique> = {
  Commerce: "commerce",
  Bureau: "bureaux",
  Logistique: "entrepots",
};

/** Chemin de la page location, puis de la page vente. */
const CHEMINS: Record<Rubrique, [string, string]> = {
  commerce: ["local-commercial", "local-commercial-vente"],
  bureaux: ["bureaux", "bureaux-vente"],
  entrepots: ["entrepots", "entrepots-vente"],
};

const RACINE = "https://unemplacement.com";

/** « Saint-Maur-des-Fossés » → « saint-maur-des-fosses ». */
export function slugVille(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type Lieu = { cp?: string; ville?: string; insee?: string };

/** Le couple zone / ville de l'URL, ou `undefined` si on ne sait pas le bâtir. */
function chemin(l: Lieu): string | undefined {
  const cp = (l.cp ?? "").trim();
  const insee = (l.insee ?? "").toUpperCase();
  if (!/^\d{5}$/.test(cp)) return undefined;

  /* Paris : une page par arrondissement, sous la région. 75116 est le 16e. */
  if (cp.startsWith("75")) {
    const n = cp === "75116" ? 16 : parseInt(cp.slice(3), 10);
    if (!n) return "ile-de-france/paris-75000";
    if (n < 1 || n > 20) return "ile-de-france/paris-75000";
    return `ile-de-france/paris-${n === 1 ? "1er" : `${n}eme`}-arrondissement-${cp}`;
  }

  const ville = l.ville ? slugVille(l.ville) : "";
  if (!ville) return undefined;

  /* Corse : seul le code INSEE tranche entre les deux départements. */
  if (cp.startsWith("20")) {
    if (insee.startsWith("2A")) return `corse-du-sud-2a/${ville}-${cp}`;
    if (insee.startsWith("2B")) return `haute-corse-2b/${ville}-${cp}`;
    return undefined;
  }

  const code = cp.startsWith("97") || cp.startsWith("98") ? cp.slice(0, 3) : cp.slice(0, 2);
  const dep = slugDepartement(code);
  if (!dep) return undefined;
  return `${dep}-${code}/${ville}-${cp}`;
}

/**
 * L'adresse de la page, pour la destination et le champ visés.
 *
 * `quoi` dit lequel des deux champs du BO le lien vient remplir : le loyer
 * ouvre la page location, le prix la page vente. C'est ce que demande MAV —
 * « ça m'évite de savoir qui est qui ».
 */
export function urlUnemplacement(
  dest: string,
  lieu: Lieu,
  quoi: "loyer" | "prix",
): string | undefined {
  const rubrique = RUBRIQUE_PAR_DEST[dest];
  if (!rubrique) return undefined;
  const c = chemin(lieu);
  if (!c) return undefined;
  return `${RACINE}/${CHEMINS[rubrique][quoi === "loyer" ? 0 : 1]}/${c}`;
}

/* ------------------------------------------------------------ La lecture */

export type ValeurUE = {
  /** €/m²/mois pour un loyer, €/m² pour un prix — les unités du BO. */
  valeur: number;
  bas?: number;
  haut?: number;
  /** Date de l'estimation, telle qu'ils l'affichent. */
  au?: string;
  url: string;
};

/** Le texte de la page, débarrassé de son balisage. */
function texte(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ");
}

/** « 6 538 » → 6538. Le site sépare les milliers par une espace insécable. */
const nombre = (s: string) => {
  const n = Number(s.replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Lit l'estimation d'une page.
 *
 * Le bloc a toujours la même forme : la valeur moyenne, puis « bas », puis
 * « haut ». Les pages de location affichent « /an » après le m², pas celles de
 * vente : c'est ce qui distingue un loyer d'un prix, et c'est aussi ce qui
 * commande la division par douze.
 */
export function lireUnemplacement(html: string, url: string): ValeurUE | undefined {
  const t = texte(html);
  const bloc = t.match(/Estimations UnEmplacement\.com([\s\S]{0,400})/);
  if (!bloc) return undefined;
  const s = bloc[1];

  const au = s.match(/au (\d{1,2}(?:er)? [a-zéû]+ \d{4})/i)?.[1];
  const loyer = /€\s*m²\s*\/\s*an/.test(s);
  const chiffres = [...s.matchAll(/([\d][\d\s  ]*)\s*€\s*m²/g)]
    .map((m) => nombre(m[1]))
    .filter((n): n is number => n !== undefined);
  if (chiffres.length === 0) return undefined;

  /* Trois chiffres attendus : moyenne, bas, haut. S'il en manque, on garde ce
     qu'on a — une moyenne seule vaut mieux que rien. */
  const [valeur, bas, haut] = chiffres;
  const div = (n?: number) => (n === undefined ? undefined : loyer ? Math.round((n / 12) * 100) / 100 : n);
  return { valeur: div(valeur)!, bas: div(bas), haut: div(haut), au, url };
}
