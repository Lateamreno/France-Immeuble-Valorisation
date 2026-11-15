/**
 * Étude de découpe — ce qui va chercher les données (MAV, 15/11/26).
 *
 * - DVF géolocalisé (data.gouv.fr, Etalab) : un fichier par commune et par
 *   année. On en garde les ventes d'un seul local, compactées, dans
 *   `fi_dvf_cache` : un fichier de 3 Mo ne se relit qu'une fois par mois.
 * - Communes : celles qui touchent le cercle de 600 m (geo.api.gouv.fr).
 * - Année de construction : la BDNB (base nationale des bâtiments, ouverte),
 *   par la clé d'adresse BAN que DVF permet de reconstituer. Couverture
 *   partielle : « inconnue » sinon.
 *
 * Aucune donnée personnelle ne sort du BO : on n'envoie que des adresses de
 * ventes publiques et la position de l'immeuble.
 */
import "server-only";
import {
  distance, moinsMois, MOIS_MAX, RAYON_MAX, REGLAGES_VIDES,
  type Reference, type ReglagesEtude, type VenteDvf,
} from "./etude-decoupe";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: SB_KEY ?? "", Authorization: `Bearer ${SB_KEY}` });

/** Un fichier DVF publié se relit au plus une fois par mois. */
const VALIDITE_DVF_MS = 30 * 86_400_000;
const VALIDITE_BDNB_MS = 180 * 86_400_000;

async function lireCache<T>(cles: string[]): Promise<Map<string, { donnees: T; maj: number }>> {
  const out = new Map<string, { donnees: T; maj: number }>();
  if (!SB_KEY || cles.length === 0) return out;
  for (let i = 0; i < cles.length; i += 150) {
    const lot = cles.slice(i, i + 150).map((c) => `"${c.replace(/"/g, "")}"`).join(",");
    const r = await fetch(`${SB_URL}/rest/v1/fi_dvf_cache?cle=in.(${encodeURIComponent(lot)})&select=cle,donnees,maj_le`, {
      headers: H(), cache: "no-store",
    }).catch(() => null);
    if (!r?.ok) continue;
    for (const l of (await r.json()) as { cle: string; donnees: T; maj_le: string }[]) {
      out.set(l.cle, { donnees: l.donnees, maj: Date.parse(l.maj_le) });
    }
  }
  return out;
}

async function ecrireCache(lignes: { cle: string; donnees: unknown }[]) {
  if (!SB_KEY || lignes.length === 0) return;
  const maj_le = new Date().toISOString();
  await fetch(`${SB_URL}/rest/v1/fi_dvf_cache?on_conflict=cle`, {
    method: "POST",
    headers: { ...H(), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(lignes.map((l) => ({ ...l, maj_le }))),
    cache: "no-store",
  }).catch(() => null);
}

/** Découpe une ligne CSV (champs entre guillemets possibles). */
function cellules(ligne: string): string[] {
  const out: string[] = [];
  let courant = "", guillemets = false;
  for (const c of ligne) {
    if (c === '"') guillemets = !guillemets;
    else if (c === "," && !guillemets) { out.push(courant); courant = ""; }
    else courant += c;
  }
  out.push(courant);
  return out;
}

const SUFFIXES: Record<string, string> = { B: "bis", T: "ter", Q: "quater", C: "quinquies" };
const TYPES: Record<string, VenteDvf["type"]> = {
  Appartement: "A", Maison: "M", "Local industriel. commercial ou assimilé": "L",
};

/** Les ventes d'un seul local d'un fichier DVF communal, compactées. */
function lireFichierDvf(texte: string): VenteDvf[] {
  const lignes = texte.split(/\r?\n/);
  const en = cellules(lignes[0] ?? "");
  const i = (nom: string) => en.indexOf(nom);
  const c = {
    mut: i("id_mutation"), date: i("date_mutation"), nat: i("nature_mutation"), vf: i("valeur_fonciere"),
    num: i("adresse_numero"), suf: i("adresse_suffixe"), voie: i("adresse_nom_voie"), cv: i("adresse_code_voie"),
    insee: i("code_commune"), commune: i("nom_commune"), parcelle: i("id_parcelle"), lot1: i("lot1_numero"),
    carrez: i("lot1_surface_carrez"), type: i("type_local"), surf: i("surface_reelle_bati"),
    pieces: i("nombre_pieces_principales"), lat: i("latitude"), lon: i("longitude"),
  };
  if (c.mut < 0 || c.vf < 0) return [];
  const muts = new Map<string, string[][]>();
  for (const l of lignes.slice(1)) {
    if (!l) continue;
    const x = cellules(l);
    if (x[c.nat] !== "Vente") continue;
    const m = muts.get(x[c.mut]);
    if (m) m.push(x); else muts.set(x[c.mut], [x]);
  }
  const out: VenteDvf[] = [];
  for (const [id, rows] of muts) {
    /* DVF répète un local sur plusieurs lignes (une par parcelle ou par lot) :
       on le reconnaît à son type, sa surface et ses pièces. */
    const locaux = new Map<string, string[]>();
    const annexes = new Set<string>();
    for (const x of rows) {
      if (x[c.type] === "Dépendance") { annexes.add(`${x[c.parcelle]}-${x[c.lot1]}`); continue; }
      if (!TYPES[x[c.type]]) continue;
      locaux.set(`${x[c.type]}|${x[c.surf]}|${x[c.pieces]}`, x);
    }
    if (locaux.size !== 1) continue;
    const x = [...locaux.values()][0];
    const prix = Number(x[c.vf]), surface = Number(x[c.surf]), lat = Number(x[c.lat]), lon = Number(x[c.lon]);
    if (!(prix >= 20000) || !(surface >= 9) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const suffixe = SUFFIXES[x[c.suf]?.toUpperCase()] ?? (x[c.suf] ? x[c.suf].toLowerCase() : "");
    const numero = x[c.num] ?? "";
    const carrez = Number(x[c.carrez]);
    out.push({
      id, date: x[c.date], type: TYPES[x[c.type]], pieces: Number(x[c.pieces]) || 0, surface,
      carrez: carrez > 0 ? carrez : undefined, prix: Math.round(prix), annexes: annexes.size,
      numero: [numero, suffixe].filter(Boolean).join(" "), voie: x[c.voie] ?? "", commune: x[c.commune] ?? "",
      insee: x[c.insee], lat, lon,
      cleAdresse: numero
        ? `${x[c.insee]}_${(x[c.cv] ?? "").toLowerCase()}_${numero.padStart(5, "0")}${suffixe ? `_${suffixe}` : ""}`
        : "",
    });
  }
  return out;
}

/** Les années publiées par DVF (le dossier « latest » d'Etalab). */
async function anneesPubliees(): Promise<number[]> {
  const r = await fetch("https://files.data.gouv.fr/geo-dvf/latest/csv/", { next: { revalidate: 86400 } }).catch(() => null);
  const html = r?.ok ? await r.text() : "";
  const annees = [...html.matchAll(/csv\/(20\d\d)\//g)].map((m) => Number(m[1]));
  return [...new Set(annees)].sort((a, b) => b - a);
}

async function ventesDe(insee: string, annees: number[]): Promise<VenteDvf[]> {
  const cles = annees.map((a) => `dvf:${insee}:${a}`);
  const cache = await lireCache<VenteDvf[]>(cles);
  const out: VenteDvf[] = [];
  const aEcrire: { cle: string; donnees: unknown }[] = [];
  for (const a of annees) {
    const cle = `dvf:${insee}:${a}`;
    const c = cache.get(cle);
    if (c && Date.now() - c.maj < VALIDITE_DVF_MS) { out.push(...c.donnees); continue; }
    const dep = insee.startsWith("97") ? insee.slice(0, 3) : insee.slice(0, 2);
    const r = await fetch(`https://files.data.gouv.fr/geo-dvf/latest/csv/${a}/communes/${dep}/${insee}.csv`, { cache: "no-store" })
      .catch(() => null);
    const ventes = r?.ok ? lireFichierDvf(await r.text()) : [];
    out.push(...ventes);
    if (r?.ok || r?.status === 404) aEcrire.push({ cle, donnees: ventes });
  }
  await ecrireCache(aEcrire);
  return out;
}

/** Les communes que touche le cercle de 600 m (le centre et huit points autour). */
async function communesAutour(lat: number, lon: number): Promise<string[]> {
  const d = (RAYON_MAX + 50) / 111_320;
  const pts: [number, number][] = [[lat, lon]];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    pts.push([lat + d * Math.cos(a), lon + (d * Math.sin(a)) / Math.cos((lat * Math.PI) / 180)]);
  }
  const codes = await Promise.all(pts.map(async ([la, lo]) => {
    const r = await fetch(`https://geo.api.gouv.fr/communes?lat=${la}&lon=${lo}&fields=code`, { next: { revalidate: 2592000 } })
      .catch(() => null);
    const j = r?.ok ? ((await r.json()) as { code?: string }[]) : [];
    const code = j[0]?.code;
    /* Paris, Lyon et Marseille : DVF range les ventes par arrondissement. */
    if (code === "75056" || code === "69123" || code === "13055") {
      const a = await fetch(`https://geo.api.gouv.fr/communes?lat=${la}&lon=${lo}&fields=code&type=arrondissement-municipal`, { next: { revalidate: 2592000 } })
        .catch(() => null);
      const ja = a?.ok ? ((await a.json()) as { code?: string }[]) : [];
      return ja[0]?.code ?? code;
    }
    return code;
  }));
  return [...new Set(codes.filter((c): c is string => !!c))];
}

export type Batiment = { annee?: number; logements?: number };

/** L'année de construction (BDNB) de chaque adresse, gardée six mois. */
export async function batimentsDe(cles: string[]): Promise<Record<string, Batiment>> {
  const uniques = [...new Set(cles.filter(Boolean))];
  const out: Record<string, Batiment> = {};
  const cache = await lireCache<Batiment>(uniques.map((c) => `bdnb:${c}`));
  const manquantes: string[] = [];
  for (const c of uniques) {
    const x = cache.get(`bdnb:${c}`);
    if (x && Date.now() - x.maj < VALIDITE_BDNB_MS) out[c] = x.donnees;
    else manquantes.push(c);
  }
  const aEcrire: { cle: string; donnees: unknown }[] = [];
  /* La BDNB rend au plus 10 lignes par appel, quoi qu'on demande : on lit
     page par page. Une adresse peut avoir plusieurs lignes (plusieurs
     bâtiments). Un paquet qui échoue n'est pas mis en cache : « inconnue » ne
     doit vouloir dire que « la BDNB ne la connaît pas ». */
  const toutesPages = async <T,>(url: string): Promise<T[] | null> => {
    const out: T[] = [];
    for (let offset = 0; offset < 2000; offset += 10) {
      const r = await fetch(`${url}&offset=${offset}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return null;
      const page = (await r.json()) as T[];
      out.push(...page);
      if (page.length < 10) break;
    }
    return out;
  };
  for (let i = 0; i < manquantes.length; i += 40) {
    const lot = manquantes.slice(i, i + 40);
    const rel = await toutesPages<{ cle_interop_adr: string; batiment_groupe_id: string }>(
      `https://api.bdnb.io/v1/bdnb/donnees/rel_batiment_groupe_adresse?cle_interop_adr=in.(${lot.map(encodeURIComponent).join(",")})&select=cle_interop_adr,batiment_groupe_id&order=cle_interop_adr`,
    );
    if (!rel) continue;
    const ids = [...new Set(rel.map((x) => x.batiment_groupe_id))];
    const bats = ids.length
      ? await toutesPages<{ batiment_groupe_id: string; annee_construction: number | null; nb_log: number | null }>(
        `https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet?batiment_groupe_id=in.(${ids.join(",")})&select=batiment_groupe_id,annee_construction,nb_log&order=batiment_groupe_id`,
      )
      : [];
    if (!bats) continue;
    const parBat = new Map(bats.map((b) => [b.batiment_groupe_id, b]));
    for (const c of lot) {
      /* Plusieurs bâtiments à la même adresse : on garde celui qui a une année,
         et le plus de logements (le bâtiment principal). */
      const candidats = rel.filter((x) => x.cle_interop_adr === c).map((x) => parBat.get(x.batiment_groupe_id)).filter(Boolean)
        .sort((a, b) => Number(!!b!.annee_construction) - Number(!!a!.annee_construction) || (b!.nb_log ?? 0) - (a!.nb_log ?? 0));
      const b = candidats[0];
      const v: Batiment = { annee: b?.annee_construction ?? undefined, logements: b?.nb_log ?? undefined };
      out[c] = v;
      aEcrire.push({ cle: `bdnb:${c}`, donnees: v });
    }
  }
  await ecrireCache(aEcrire);
  return out;
}

/** La clé BAN d'une adresse (« 92050_9670_00055 »), pour l'immeuble étudié. */
async function cleBan(adresse: string): Promise<string | undefined> {
  if (!adresse.trim()) return undefined;
  const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresse)}&limit=1&type=housenumber`, {
    next: { revalidate: 2592000 },
  }).catch(() => null);
  const j = r?.ok ? ((await r.json()) as { features?: { properties?: { id?: string; score?: number } }[] }) : null;
  const p = j?.features?.[0]?.properties;
  return p?.id && (p.score ?? 0) > 0.6 ? p.id : undefined;
}

export type DonneesEtude = {
  ok: true;
  centre: { lat: number; lon: number; adresse: string };
  /** Date de la dernière vente publiée par DVF : la fenêtre se compte depuis elle. */
  finDonnees: string;
  communes: string[];
  ventes: Reference[];
  batiments: Record<string, Batiment>;
  /** L'immeuble étudié, dans la BDNB. */
  immeuble: { cleAdresse?: string } & Batiment;
  reglages: ReglagesEtude;
} | { ok: false; raison: string };

/** Tout ce que l'écran demande : ventes à moins de 600 m sur les 12 derniers mois publiés. */
export async function donneesEtude(immeuble: Record<string, unknown>, adresse?: Record<string, unknown>): Promise<DonneesEtude> {
  const geo = (adresse?.geo ?? {}) as { lat?: number; lng?: number; address?: string };
  const lat = Number(geo.lat), lon = Number(geo.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, raison: "L'immeuble n'est pas placé sur la carte : renseignez son adresse (onglet Emplacement)." };
  }
  const annees = await anneesPubliees();
  if (annees.length === 0) return { ok: false, raison: "Les fichiers DVF ne répondent pas pour l'instant. Réessayez plus tard." };
  const communes = await communesAutour(lat, lon);
  /* Les deux dernières années publiées couvrent toujours les 12 derniers mois. */
  const deux = annees.slice(0, 2);
  const toutes = (await Promise.all(communes.map((c) => ventesDe(c, deux)))).flat();
  const finDonnees = toutes.reduce((m, v) => (v.date > m ? v.date : m), "");
  if (!finDonnees) return { ok: false, raison: "Aucune vente DVF publiée autour de l'immeuble." };
  const debut = moinsMois(finDonnees, MOIS_MAX);
  const ventes: Reference[] = [];
  for (const v of toutes) {
    if (v.date <= debut) continue;
    const d = distance(lat, lon, v.lat, v.lon);
    if (d > RAYON_MAX) continue;
    ventes.push({ ...v, distance: d, prixM2: Math.round(v.prix / v.surface) });
  }
  const adresseTexte = geo.address
    ?? [adresse?.numero_rue, adresse?.rue, adresse?.zipcode, adresse?.ville_name].filter(Boolean).join(" ");
  const cleImmeuble = await cleBan(String(adresseTexte ?? ""));
  const batiments = await batimentsDe([...ventes.map((v) => v.cleAdresse), cleImmeuble ?? ""]);
  const brut = immeuble.etude_decoupe as Partial<ReglagesEtude> | undefined;
  return {
    ok: true,
    centre: { lat, lon, adresse: String(adresseTexte ?? "") },
    finDonnees, communes, ventes,
    batiments,
    immeuble: { cleAdresse: cleImmeuble, ...(cleImmeuble ? batiments[cleImmeuble] : {}) },
    reglages: { ...REGLAGES_VIDES, ...(brut && typeof brut === "object" ? brut : {}) },
  };
}
