// Page « prix au m² » de SeLoger pour une commune donnée.
//
// L'URL se construit entièrement à partir du code INSEE, sans appel réseau :
//   /prix-de-l-immo/{vente|location}/{région}/{département}/{ville}/{code}.htm
//
// Deux pièges vérifiés sur des pages réelles :
//
// 1. SeLoger a gardé les régions d'avant 2016. Lyon est en « rhone-alpes »,
//    pas en « auvergne-rhone-alpes » ; Bordeaux en « aquitaine », pas en
//    « nouvelle-aquitaine ». D'où la table ci-dessous, indexée par
//    département — c'est la seule façon de retrouver l'ancienne région.
//
// 2. Le code de fin n'est pas le code INSEE : c'est département × 10 000 +
//    numéro de commune, écrit sans zéro de tête.
//      Guyancourt  78297 → 780297      Bordeaux    33063 → 330063
//      Lyon        69123 → 690123      Aix         13001 → 130001
//      Orléans     45234 → 450234      Narbonne    11262 → 110262
//      Tourcoing   59599 → 590599      Paris 11e   75111 → 750111
//    Et pour les départements 01 à 09, le zéro saute aussi devant :
//      Saint-Quentin 02691 → 20691     Sedan       08409 → 80409
//
// Corse et outre-mer restent sur la page du département : leurs codes ne
// suivent pas la même règle et je n'ai pas pu la vérifier.

/** Département → [ancienne région SeLoger, département]. */
const DEPARTEMENTS: Record<string, [string, string]> = {
  "01": ["rhone-alpes", "ain"],
  "02": ["picardie", "aisne"],
  "03": ["auvergne", "allier"],
  "04": ["provence-alpes-cote-d-azur", "alpes-de-haute-provence"],
  "05": ["provence-alpes-cote-d-azur", "hautes-alpes"],
  "06": ["provence-alpes-cote-d-azur", "alpes-maritimes"],
  "07": ["rhone-alpes", "ardeche"],
  "08": ["champagne-ardenne", "ardennes"],
  "09": ["midi-pyrenees", "ariege"],
  "10": ["champagne-ardenne", "aube"],
  "11": ["languedoc-roussillon", "aude"],
  "12": ["midi-pyrenees", "aveyron"],
  "13": ["provence-alpes-cote-d-azur", "bouches-du-rhone"],
  "14": ["basse-normandie", "calvados"],
  "15": ["auvergne", "cantal"],
  "16": ["poitou-charentes", "charente"],
  "17": ["poitou-charentes", "charente-maritime"],
  "18": ["centre", "cher"],
  "19": ["limousin", "correze"],
  "2A": ["corse", "corse-du-sud"],
  "2B": ["corse", "haute-corse"],
  "21": ["bourgogne", "cote-d-or"],
  "22": ["bretagne", "cotes-d-armor"],
  "23": ["limousin", "creuse"],
  "24": ["aquitaine", "dordogne"],
  "25": ["franche-comte", "doubs"],
  "26": ["rhone-alpes", "drome"],
  "27": ["haute-normandie", "eure"],
  "28": ["centre", "eure-et-loir"],
  "29": ["bretagne", "finistere"],
  "30": ["languedoc-roussillon", "gard"],
  "31": ["midi-pyrenees", "haute-garonne"],
  "32": ["midi-pyrenees", "gers"],
  "33": ["aquitaine", "gironde"],
  "34": ["languedoc-roussillon", "herault"],
  "35": ["bretagne", "ille-et-vilaine"],
  "36": ["centre", "indre"],
  "37": ["centre", "indre-et-loire"],
  "38": ["rhone-alpes", "isere"],
  "39": ["franche-comte", "jura"],
  "40": ["aquitaine", "landes"],
  "41": ["centre", "loir-et-cher"],
  "42": ["rhone-alpes", "loire"],
  "43": ["auvergne", "haute-loire"],
  "44": ["pays-de-la-loire", "loire-atlantique"],
  "45": ["centre", "loiret"],
  "46": ["midi-pyrenees", "lot"],
  "47": ["aquitaine", "lot-et-garonne"],
  "48": ["languedoc-roussillon", "lozere"],
  "49": ["pays-de-la-loire", "maine-et-loire"],
  "50": ["basse-normandie", "manche"],
  "51": ["champagne-ardenne", "marne"],
  "52": ["champagne-ardenne", "haute-marne"],
  "53": ["pays-de-la-loire", "mayenne"],
  "54": ["lorraine", "meurthe-et-moselle"],
  "55": ["lorraine", "meuse"],
  "56": ["bretagne", "morbihan"],
  "57": ["lorraine", "moselle"],
  "58": ["bourgogne", "nievre"],
  "59": ["nord-pas-de-calais", "nord"],
  "60": ["picardie", "oise"],
  "61": ["basse-normandie", "orne"],
  "62": ["nord-pas-de-calais", "pas-de-calais"],
  "63": ["auvergne", "puy-de-dome"],
  "64": ["aquitaine", "pyrenees-atlantiques"],
  "65": ["midi-pyrenees", "hautes-pyrenees"],
  "66": ["languedoc-roussillon", "pyrenees-orientales"],
  "67": ["alsace", "bas-rhin"],
  "68": ["alsace", "haut-rhin"],
  "69": ["rhone-alpes", "rhone"],
  "70": ["franche-comte", "haute-saone"],
  "71": ["bourgogne", "saone-et-loire"],
  "72": ["pays-de-la-loire", "sarthe"],
  "73": ["rhone-alpes", "savoie"],
  "74": ["rhone-alpes", "haute-savoie"],
  "75": ["ile-de-france", "paris"],
  "76": ["haute-normandie", "seine-maritime"],
  "77": ["ile-de-france", "seine-et-marne"],
  "78": ["ile-de-france", "yvelines"],
  "79": ["poitou-charentes", "deux-sevres"],
  "80": ["picardie", "somme"],
  "81": ["midi-pyrenees", "tarn"],
  "82": ["midi-pyrenees", "tarn-et-garonne"],
  "83": ["provence-alpes-cote-d-azur", "var"],
  "84": ["provence-alpes-cote-d-azur", "vaucluse"],
  "85": ["pays-de-la-loire", "vendee"],
  "86": ["poitou-charentes", "vienne"],
  "87": ["limousin", "haute-vienne"],
  "88": ["lorraine", "vosges"],
  "89": ["bourgogne", "yonne"],
  "90": ["franche-comte", "territoire-de-belfort"],
  "91": ["ile-de-france", "essonne"],
  "92": ["ile-de-france", "hauts-de-seine"],
  "93": ["ile-de-france", "seine-saint-denis"],
  "94": ["ile-de-france", "val-de-marne"],
  "95": ["ile-de-france", "val-d-oise"],
  "971": ["guadeloupe", "guadeloupe"],
  "972": ["martinique", "martinique"],
  "973": ["guyane", "guyane"],
  "974": ["reunion", "reunion"],
  "976": ["mayotte", "mayotte"],
};

/** Les villes à arrondissements : SeLoger les traite comme des communes. */
const ARRONDISSEMENTS: Record<string, { cpDebut: number; insee: number; nom: string; max: number }> = {
  "75": { cpDebut: 75001, insee: 75101, nom: "paris", max: 20 },
  "13": { cpDebut: 13001, insee: 13201, nom: "marseille", max: 16 },
  "69": { cpDebut: 69001, insee: 69381, nom: "lyon", max: 9 },
};

/** Accents enlevés, apostrophes et espaces devenus tirets (« Côtes-d'Armor »
 *  → « cotes-d-armor », comme sur le site). */
export function slugSeloger(nom: string) {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** « 78297 » → « 780297 » ; « 02691 » → « 20691 ».
 *  Métropole seulement : la Corse (2A/2B) et l'outre-mer ne suivent pas cette
 *  règle, et je n'ai pas pu vérifier la leur. */
function codeSeloger(insee: string) {
  if (!/^\d{5}$/.test(insee)) return null;
  const dep = parseInt(insee.slice(0, 2), 10);
  const com = parseInt(insee.slice(2), 10);
  if (dep < 1 || dep > 95) return null;
  return String(dep * 10000 + com);
}

const rang = (n: number) => `${n}${n === 1 ? "er" : "eme"}`;

/**
 * Page SeLoger des prix (ou des loyers) de la commune.
 *
 * @param insee code INSEE à 5 caractères de la commune
 * @param nom   nom officiel de la commune (celui de l'API géo)
 * @param cp    code postal du bien — il désigne l'arrondissement à Paris,
 *              Lyon et Marseille, que l'API géo ramène à la commune entière
 */
export function urlSeloger(
  { insee, nom, slug, cp, type = "vente" }:
  {
    insee?: string | null; nom?: string | null;
    /** Slug déjà porté par la fiche (`ville_url`) : évite un aller-retour. */
    slug?: string | null;
    cp?: string | null; type?: "vente" | "location";
  },
) {
  const racine = `https://www.seloger.com/prix-de-l-immo/${type}`;
  // L'outre-mer se reconnaît sur trois chiffres (97x), la Corse sur 2A / 2B.
  const source = insee?.length === 5 ? insee : cp ?? "";
  const dep = source.startsWith("97") ? source.slice(0, 3) : source.slice(0, 2).toUpperCase();
  const zone = dep ? DEPARTEMENTS[dep] : undefined;
  if (!zone || !dep) return `${racine}/pays/france.htm`;
  const [region, departement] = zone;
  const departementUrl = `${racine}/${region}/${departement}.htm`;

  // Paris 11e plutôt que Paris : le code postal suffit à désigner
  // l'arrondissement, sans rien demander à personne.
  const arr = ARRONDISSEMENTS[dep];
  const numArr = arr && cp ? parseInt(cp, 10) - arr.cpDebut + 1 : 0;
  if (arr && numArr >= 1 && numArr <= arr.max) {
    const code = codeSeloger(String(arr.insee + numArr - 1));
    if (code) return `${racine}/${region}/${departement}/${arr.nom}-${rang(numArr)}/${code}.htm`;
  }

  // Sans code INSEE, on s'arrête au département : mieux vaut une page juste
  // et moins précise qu'un lien de ville inventé.
  const ville = slug || (nom ? slugSeloger(nom) : "");
  const code = insee?.length === 5 ? codeSeloger(insee) : null;
  if (!ville || !code) return departementUrl;
  return `${racine}/${region}/${departement}/${ville}/${code}.htm`;
}

/**
 * Le nom de département en slug (« hauts-de-seine » pour 92).
 *
 * Extrait d'ici parce que la table est déjà là et qu'elle est juste :
 * unemplacement.com range ses pages sous le même libellé (voir
 * `lib/unemplacement.ts`).
 */
export function slugDepartement(code: string): string | undefined {
  return DEPARTEMENTS[code.toUpperCase()]?.[1];
}
