// Points d'intérêt autour d'une adresse, depuis OpenStreetMap (Overpass).
//
// Repris de Plein Bail, où la recette tourne en production. Deux points qui
// font toute la différence, et que j'avais ratés en essayant côté serveur :
//
// 1. L'appel part du NAVIGATEUR. Les miroirs Overpass refusent volontiers un
//    serveur sans en-tête d'identification, et le rendu se fait de toute
//    façon dans la page.
// 2. On interroge QUATRE miroirs en même temps et on garde la première
//    réponse valide. Le miroir principal répond 504 une fois sur deux ;
//    la course rend l'ensemble fiable.
//
// Une seule requête ramène toutes les catégories, puis on classe par tags.

export type PoiOsm = {
  nom: string;
  /** Précision affichée sous le nom : « Université », « Carrefour »… */
  sous?: string;
  /** Distance à vol d'oiseau, en mètres. */
  distance: number;
  minutes: number;
  moyen: string;
  /* Coordonnées du point (retour #186). Sans elles, l'itinéraire ne pouvait
     partir qu'avec le NOM du commerce, et Google choisissait librement :
     « Carrefour » l'emmenait à l'hypermarché de la zone commerciale plutôt
     qu'au supermarché d'en face. Un couple de coordonnées ne se discute pas. */
  lat?: number;
  lon?: number;
};

/** Clés des vignettes de la fiche. */
export type ClePoi = "gare" | "bus" | "route" | "school" | "com";

/* Miroirs européens couvrant le monde entier. Plein Bail en interroge un
   cinquième hébergé en Russie ; ici on s'en passe : la requête porte
   l'adresse d'un bien sous mandat, elle n'a rien à faire hors Union.

   Attention aux miroirs régionaux (overpass.osm.ch par exemple) : ils
   répondent 200 en une seconde avec zéro résultat sur la France, gagnent la
   course, et l'écran se retrouve vide. D'où le contrôle ci-dessous. */
const MIROIRS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

/* Une recherche par nature de lieu, avec son rayon et son quota.
   
   Le quota compte : Overpass tronque, et il tronque dans l'ordre où il
   trouve, pas par distance. Une requête unique plafonnée globalement rend
   donc des résultats faux — sur Bordeaux, elle sortait un Aldi à 15 km en
   ignorant le Carrefour à 136 m. Chaque nature a donc son propre plafond.

   Les rayons suivent l'usage : une gare se cherche loin, un arrêt de bus au
   coin de la rue. L'enseignement supérieur se cherche large — il est rare et
   c'est l'argument que cherchent les investisseurs — l'école primaire non. */
const RECHERCHES: { cle: ClePoi; filtre: string; rayon: number; max: number }[] = [
  // Deux cercles pour ce qui compte : un petit, forcément complet, qui
  // garantit qu'on n'oublie pas le lieu d'à côté ; un grand, qui sert la
  // campagne. Sans le petit cercle, à Pantin les 8 km couvraient tout Paris
  // et le quota tombait avant la gare du quartier.
  { cle: "gare", filtre: "[railway=station]", rayon: 2500, max: 40 },
  { cle: "gare", filtre: "[railway=station]", rayon: 10000, max: 40 },
  { cle: "gare", filtre: "[railway=halt]", rayon: 8000, max: 20 },
  { cle: "bus", filtre: "[highway=bus_stop]", rayon: 1000, max: 40 },
  { cle: "route", filtre: "[highway=motorway_junction]", rayon: 12000, max: 25 },
  { cle: "school", filtre: "[amenity=university]", rayon: 2500, max: 25 },
  { cle: "school", filtre: "[amenity=university]", rayon: 8000, max: 25 },
  { cle: "school", filtre: "[amenity=college]", rayon: 5000, max: 25 },
  { cle: "school", filtre: "[amenity=school]", rayon: 1200, max: 30 },
  { cle: "com", filtre: "[shop=supermarket]", rayon: 800, max: 25 },
  { cle: "com", filtre: "[shop=supermarket]", rayon: 3000, max: 40 },
  { cle: "com", filtre: "[shop=convenience]", rayon: 800, max: 20 },
];

type Element = {
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
};

function haversine(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Marche à 5 km/h avec un détour de 30 % ; au-delà d'un quart d'heure, la
 *  voiture urbaine à 25 km/h. Même barème que Plein Bail, pour que les deux
 *  produits racontent la même chose. */
export function trajet(metres: number) {
  const marche = Math.round((metres * 1.3) / 83);
  if (marche <= 15) return { moyen: "à pied", minutes: Math.max(1, marche) };
  return { moyen: "en voiture", minutes: Math.max(1, Math.round((metres * 1.35) / 420)) };
}

/** Niveau d'enseignement lisible, et rang de priorité (0 = le plus haut). */
function niveauEcole(t: Record<string, string>): { sous: string; rang: number } {
  if (t.amenity === "university") return { sous: "Université", rang: 0 };
  if (t.amenity === "college") return { sous: "Enseignement supérieur", rang: 1 };
  const isced = t["isced:level"] ?? "";
  if (/3/.test(isced) || /lyc[ée]e/i.test(t.name ?? "")) return { sous: "Lycée", rang: 2 };
  if (/2/.test(isced) || /coll[èe]ge/i.test(t.name ?? "")) return { sous: "Collège", rang: 3 };
  return { sous: "École", rang: 4 };
}

/** Catégorie d'un élément OSM, d'après ses tags. */
function categorie(t: Record<string, string>): ClePoi | null {
  if (t.railway === "station" || t.railway === "halt" || t.station === "subway") return "gare";
  if (t.highway === "bus_stop") return "bus";
  if (t.highway === "motorway_junction") return "route";
  if (t.amenity === "university" || t.amenity === "college" || t.amenity === "school") return "school";
  if (t.shop === "supermarket" || t.shop === "convenience") return "com";
  return null;
}

/** Nom présentable, à défaut de `name`. */
function nommer(t: Record<string, string>, cle: ClePoi) {
  // Un échangeur s'appelle rarement autrement que par son numéro de sortie :
  // « 16 » tout seul ne dit rien, « Sortie 16 » se comprend.
  if (cle === "route") return t.name ?? (t.ref ? `Sortie ${t.ref}` : "Échangeur");
  return t.name ?? t.brand ?? t.operator ?? t.ref ?? "";
}

/** Précision affichée sous le nom. */
function preciser(t: Record<string, string>, cle: ClePoi) {
  if (cle === "school") return niveauEcole(t).sous;
  if (cle === "com") {
    const enseigne = t.brand && t.brand !== t.name ? t.brand : undefined;
    return t.shop === "convenience" ? enseigne ?? "Supérette" : enseigne;
  }
  if (cle === "gare") {
    if (t.station === "subway") return "Métro";
    return t.railway === "halt" ? "Halte" : t.operator;
  }
  if (cle === "bus") return t.network ?? t.operator;
  if (cle === "route") return t.name && t.ref ? `Sortie ${t.ref}` : undefined;
  return undefined;
}

/**
 * Cherche les points d'intérêt autour d'un point.
 *
 * @returns une liste par catégorie, la plus intéressante en tête. Un objet
 *          vide si tous les miroirs ont échoué — à l'appelant de garder ce
 *          qu'il avait plutôt que d'effacer.
 */
export async function chercherPoi(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<Partial<Record<ClePoi, PoiOsm[]>>> {
  // Un `out` par recherche : chacune ramène ses propres résultats, aucune ne
  // peut être écrasée par une autre.
  const requete =
    "[out:json][timeout:25];" +
    RECHERCHES.map((r) => `nwr(around:${r.rayon},${lat},${lon})${r.filtre};out center ${r.max};`).join("");

  const tenter = async (url: string) => {
    const rep = await fetch(url, {
      method: "POST",
      // Les miroirs répondent 429 à qui ne se présente pas, et 406 à qui
      // n'annonce pas un formulaire. Le navigateur impose son propre
      // User-Agent et ignore le nôtre : l'en-tête ne sert que hors navigateur
      // (tests, script), mais il évite un refus silencieux.
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "France Immeuble BO (contact@france-immeuble.fr)",
      },
      body: "data=" + encodeURIComponent(requete),
      signal,
    });
    if (!rep.ok) throw new Error(String(rep.status));
    const json = (await rep.json()) as { elements?: Element[] };
    // Une réponse vide n'est pas une réponse : un miroir qui ne couvre pas la
    // France répondrait le premier et ferait taire les autres.
    if (!json.elements?.length) throw new Error("vide");
    return json as { elements: Element[] };
  };

  /* Les miroirs sont gratuits et lâchent au hasard : il arrive que les
     quatre refusent en même temps. Une seule reprise, une seconde plus tard,
     suffit à rattraper la quasi-totalité de ces trous. */
  let data: { elements: Element[] };
  try {
    data = await Promise.any(MIROIRS.map(tenter));
  } catch {
    if (signal?.aborted) return {};
    await new Promise((r) => setTimeout(r, 1200));
    try {
      data = await Promise.any(MIROIRS.map(tenter));
    } catch {
      return {};
    }
  }

  const groupes: Partial<Record<ClePoi, (PoiOsm & { rang: number })[]>> = {};
  for (const el of data.elements) {
    const t = el.tags;
    if (!t) continue;
    const cle = categorie(t);
    if (!cle) continue;
    const pLat = el.lat ?? el.center?.lat;
    const pLon = el.lon ?? el.center?.lon;
    if (pLat == null || pLon == null) continue;
    const nom = nommer(t, cle);
    if (!nom) continue;
    const distance = Math.round(haversine(lat, lon, pLat, pLon));
    (groupes[cle] ??= []).push({
      nom,
      sous: preciser(t, cle),
      distance,
      lat: pLat,
      lon: pLon,
      ...trajet(distance),
      // Les écoles se classent par niveau puis par distance ; ailleurs, seule
      // la distance compte.
      rang: cle === "school" ? niveauEcole(t).rang : 0,
    });
  }

  const sortie: Partial<Record<ClePoi, PoiOsm[]>> = {};
  for (const [cle, liste] of Object.entries(groupes) as [ClePoi, (PoiOsm & { rang: number })[]][]) {
    liste.sort((a, b) => a.rang - b.rang || a.distance - b.distance);
    // Deux entrées OSM portent souvent le même nom (le bâtiment et le point) :
    // on ne garde que la plus proche de chaque nom.
    const vus = new Set<string>();
    sortie[cle] = liste
      .filter((p) => (vus.has(p.nom) ? false : (vus.add(p.nom), true)))
      .slice(0, 6)
      .map(({ rang: _rang, ...p }) => p);
  }
  return sortie;
}
