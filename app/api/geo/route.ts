// Enrichissement automatique de l'onglet Emplacement (retours MAV #14 et #15).
// Sources publiques officielles, sans aucune clé d'API :
//   • geo.api.gouv.fr .................. commune, code INSEE, population
//   • bo_villes_stats .................. niveau de vie médian, chômage, délinquance
//   • data.iledefrance-mobilites.fr .... métro / RER / tram / train + arrêts de bus (IDF)
//   • ressources.data.sncf.com ......... gares de voyageurs (France entière)
//   • data.education.gouv.fr ........... écoles, collèges, lycées
// Les propositions sont classées par distance : l'agent garde toujours la main
// (il choisit une autre vignette ou saisit la sienne).
import { NextRequest } from "next/server";

export type POI = {
  nom: string;
  /** Précision affichée sous le nom (ligne de métro, type d'établissement…). */
  sous?: string;
  distance: number;
  minutes: number;
  moyen: string;
};

const R = 6371e3;
const dist = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const p = Math.PI / 180;
  const h =
    0.5 - Math.cos((bLat - aLat) * p) / 2 +
    (Math.cos(aLat * p) * Math.cos(bLat * p) * (1 - Math.cos((bLon - aLon) * p))) / 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};
/** À pied ~4,5 km/h sous 1,2 km, en voiture ~25 km/h au-delà. */
const trajet = (m: number) =>
  m <= 1200
    ? { minutes: Math.max(1, Math.round(m / 75)), moyen: "à pied" }
    : { minutes: Math.max(1, Math.round(m / 420)), moyen: "en voiture" };

type Champs = Record<string, unknown>;
type Enregistrement = { fields?: Champs };

/** Interroge un portail OpenDataSoft v1 avec un filtre de distance. */
async function ods(
  base: string,
  dataset: string,
  lat: number,
  lon: number,
  rayon: number,
  lire: (f: Champs) => { nom?: string; sous?: string; geo?: [number, number] },
  rows = 40,
): Promise<POI[]> {
  const url = `${base}/api/records/1.0/search/?dataset=${dataset}&geofilter.distance=${lat},${lon},${rayon}&rows=${rows}`;
  const res = await fetch(url, { next: { revalidate: 86400 } }).catch(() => null);
  if (!res?.ok) return [];
  const j = (await res.json().catch(() => null)) as { records?: Enregistrement[] } | null;
  const out: POI[] = [];
  for (const r of j?.records ?? []) {
    const { nom, sous, geo } = lire(r.fields ?? {});
    if (!nom || !geo) continue;
    const d = dist(lat, lon, geo[0], geo[1]);
    out.push({ nom, sous, distance: d, ...trajet(d) });
  }
  return out;
}

/** Dédoublonne par nom (garde le plus proche), trie et coupe. */
const top = (l: POI[], n = 6) => {
  const vus = new Map<string, POI>();
  for (const p of [...l].sort((a, b) => a.distance - b.distance)) {
    const k = p.nom.toLowerCase();
    const dejaVu = vus.get(k);
    if (!dejaVu) vus.set(k, p);
    else if (p.sous && !dejaVu.sous?.includes(p.sous)) dejaVu.sous = [dejaVu.sous, p.sous].filter(Boolean).join(" · ");
  }
  return [...vus.values()].slice(0, n);
};

const point = (f: Champs, ...cles: string[]): [number, number] | undefined => {
  for (const c of cles) {
    const v = f[c];
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number") return [v[0], v[1] as number];
    if (v && typeof v === "object") {
      const o = v as { lat?: number; lon?: number; coordinates?: number[] };
      if (typeof o.lat === "number" && typeof o.lon === "number") return [o.lat, o.lon];
      // geo_shape : GeoJSON, donc [lon, lat].
      if (Array.isArray(o.coordinates) && o.coordinates.length === 2) return [o.coordinates[1], o.coordinates[0]];
    }
  }
  return undefined;
};

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  const cp = q.get("cp") ?? "";
  const ville = q.get("ville") ?? "";
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "coordonnées manquantes" }, { status: 400 });
  }

  const [communes, idfmGares, idfmArrets, sncf, ecoles] = await Promise.all([
    // Commune : population légale + code INSEE.
    fetch(
      `https://geo.api.gouv.fr/communes?${cp ? `codePostal=${encodeURIComponent(cp)}` : `nom=${encodeURIComponent(ville)}`}&fields=nom,code,population`,
      { next: { revalidate: 604800 } },
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ nom: string; code: string; population: number }[]>) : []))
      .catch(() => [] as { nom: string; code: string; population: number }[]),
    // Métro / RER / tram / Transilien (Île-de-France) — porte l'indice de ligne.
    ods("https://data.iledefrance-mobilites.fr", "emplacement-des-gares-idf", lat, lon, 2500, (f) => ({
      nom: s(f.nom_zdc) ?? s(f.nom_gares),
      sous: s(f.res_com),
      geo: point(f, "geo_point_2d", "geo_shape"),
    })),
    // Arrêts de bus (Île-de-France).
    ods("https://data.iledefrance-mobilites.fr", "arrets", lat, lon, 700, (f) => ({
      nom: s(f.arrtype) === "bus" ? s(f.arrname) : undefined,
      geo: point(f, "arrgeopoint"),
    })),
    // Gares de voyageurs SNCF (France entière, complète l'IDF hors Paris).
    ods("https://ressources.data.sncf.com", "gares-de-voyageurs", lat, lon, 6000, (f) => ({
      nom: s(f.nom),
      sous: "Gare SNCF",
      geo: point(f, "position_geographique"),
    })),
    // Établissements scolaires.
    ods("https://data.education.gouv.fr", "fr-en-annuaire-education", lat, lon, 1500, (f) => ({
      nom: s(f.nom_etablissement),
      sous: s(f.type_etablissement),
      geo: point(f, "position"),
    })),
  ]);

  const commune = communes.find((c) => c.nom.toLowerCase() === ville.toLowerCase()) ?? communes[0];

  // Niveau de vie médian, chômage et délinquance : référentiel communes du BO.
  let revenus: number | undefined;
  let chomage: number | undefined;
  let delinquance: number | undefined;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
  if (commune?.code && key) {
    const r = await fetch(
      `${base}/rest/v1/bo_villes_stats?select=niveau_vie_median_eur,taux_chomage_pct,crimes_pour_mille&code_insee=eq.${commune.code}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 604800 } },
    ).catch(() => null);
    if (r?.ok) {
      const rows = (await r.json()) as {
        niveau_vie_median_eur: number | null;
        taux_chomage_pct: number | null;
        crimes_pour_mille: number | null;
      }[];
      revenus = rows[0]?.niveau_vie_median_eur ?? undefined;
      chomage = rows[0]?.taux_chomage_pct ?? undefined;
      delinquance = rows[0]?.crimes_pour_mille ?? undefined;
    }
  }

  return Response.json({
    commune: commune ? { nom: commune.nom, code: commune.code, population: commune.population } : null,
    revenus,
    chomage,
    delinquance,
    // Clés alignées sur les champs emp_*_name du BO.
    poi: {
      gare: top([...idfmGares, ...sncf]),
      bus: top(idfmArrets),
      school: top(ecoles),
    },
  });
}
