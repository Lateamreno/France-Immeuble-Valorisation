// Repères de marché d'une commune : loyer d'annonce et prix de vente réel.
//
// Ils préremplissent la modale « valeurs du secteur » pour donner un ordre de
// grandeur AVANT la saisie vérifiée. Ce ne sont jamais les valeurs retenues :
// `bo_prix_secteur` reste la seule vérité, remplie par l'agent.
//
// Deux sources, toutes deux officielles et gratuites :
// - loyers : « Carte des loyers » du ministère, chargée en base une fois par
//   millésime (scripts/seed-loyers.mjs) — donc aucune requête au moment du clic.
// - prix : DVF, les ventes enregistrées par les notaires. Le fichier d'une
//   commune pèse quelques Mo : on le lit une fois, on garde le résultat.
import "server-only";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Dernier millésime DVF publié (les données paraissent avec ~6 mois de retard). */
const MILLESIME_DVF = 2025;

export type Reperes = {
  loyer?: { valeur: number; bas?: number; haut?: number; commune: boolean; millesime: number };
  prix?: { valeur: number; ventes: number; millesime: number };
  /** Rendement que donneraient ces deux repères, à titre indicatif. */
  renta?: number;
};

async function sb(chemin: string, init?: RequestInit) {
  if (!SB_KEY) return null;
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  }).catch(() => null);
  return res?.ok ? res : null;
}

async function loyerCommune(insee: string) {
  const res = await sb(`bo_loyers_commune?code_insee=eq.${insee}&select=*&limit=1`);
  const [l] = ((await res?.json().catch(() => [])) ?? []) as {
    loyer_m2: number; borne_basse?: number; borne_haute?: number; finesse?: string; millesime: number;
  }[];
  if (!l) return undefined;
  return {
    valeur: Number(l.loyer_m2),
    bas: l.borne_basse ? Number(l.borne_basse) : undefined,
    haut: l.borne_haute ? Number(l.borne_haute) : undefined,
    // « maille » = valeur extrapolée depuis les communes voisines, faute
    // d'assez d'annonces sur place. À dire, ça change la confiance qu'on lui porte.
    commune: l.finesse === "commune",
    millesime: l.millesime,
  };
}

/** Découpe une ligne CSV en respectant les guillemets. */
function cellules(ligne: string) {
  const out: string[] = [];
  let courant = "";
  let guillemets = false;
  for (const c of ligne) {
    if (c === '"') guillemets = !guillemets;
    else if (c === "," && !guillemets) { out.push(courant); courant = ""; }
    else courant += c;
  }
  out.push(courant);
  return out;
}

/**
 * Médiane du prix au m² des ventes de la commune, par nature de local.
 *
 * Une mutation DVF peut porter plusieurs lots : diviser son montant par la
 * surface d'un seul donnerait n'importe quoi. On regroupe donc par mutation,
 * on somme les surfaces de la nature visée, et on écarte les ventes qui
 * mélangent un appartement et une maison — leur prix au m² ne veut rien dire.
 */
async function calculerDvf(insee: string) {
  const dep = insee.startsWith("97") ? insee.slice(0, 3) : insee.slice(0, 2);
  const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${MILLESIME_DVF}/communes/${dep}/${insee}.csv`;
  const res = await fetch(url, { next: { revalidate: 2592000 } }).catch(() => null);
  if (!res?.ok) return {};

  const lignes = (await res.text()).split(/\r?\n/);
  const entetes = cellules(lignes[0] ?? "");
  const i = (nom: string) => entetes.indexOf(nom);
  const [iMut, iNat, iVf, iType, iSurf] =
    ["id_mutation", "nature_mutation", "valeur_fonciere", "type_local", "surface_reelle_bati"].map(i);
  if (iMut < 0 || iVf < 0) return {};

  type Mut = { vf: number; surfaces: Record<string, number>; natures: Set<string> };
  const mutations = new Map<string, Mut>();
  for (const l of lignes.slice(1)) {
    if (!l) continue;
    const c = cellules(l);
    if (c[iNat] !== "Vente") continue;
    const cle = c[iMut];
    let m = mutations.get(cle);
    if (!m) { m = { vf: 0, surfaces: {}, natures: new Set() }; mutations.set(cle, m); }
    const vf = parseFloat(c[iVf]);
    if (Number.isFinite(vf)) m.vf = vf;
    const type = c[iType];
    if (!type) continue;
    m.natures.add(type);
    const s = parseFloat(c[iSurf]);
    if (Number.isFinite(s)) m.surfaces[type] = (m.surfaces[type] ?? 0) + s;
  }

  const parType: Record<string, number[]> = { Appartement: [], Maison: [] };
  for (const m of mutations.values()) {
    if (m.natures.size !== 1) continue;
    const [type] = [...m.natures];
    if (!(type in parType)) continue;
    const surface = m.surfaces[type] ?? 0;
    if (surface < 9 || m.vf < 10000) continue;
    const p = m.vf / surface;
    // Les extrêmes sont des saisies fantaisistes ou des ventes hors marché.
    if (p > 300 && p < 25000) parType[type].push(p);
  }

  const quantile = (v: number[], q: number) => v[Math.floor((v.length - 1) * q)];
  const sortie: Record<string, { median: number; q1: number; q3: number; ventes: number }> = {};
  for (const [type, v] of Object.entries(parType)) {
    if (v.length < 5) continue;
    v.sort((a, b) => a - b);
    sortie[type] = {
      median: Math.round(quantile(v, 0.5)),
      q1: Math.round(quantile(v, 0.25)),
      q3: Math.round(quantile(v, 0.75)),
      ventes: v.length,
    };
  }
  return sortie;
}

/** Le calcul DVF est gardé en base : on ne relit le fichier qu'une fois. */
async function prixCommune(insee: string, type: "Appartement" | "Maison") {
  const res = await sb(
    `bo_dvf_commune?code_insee=eq.${insee}&millesime=eq.${MILLESIME_DVF}&select=*`,
  );
  const lignes = ((await res?.json().catch(() => [])) ?? []) as
    { type_local: string; prix_median: number; ventes: number }[];

  let ligne = lignes.find((l) => l.type_local === type);
  if (lignes.length === 0) {
    const calcul = await calculerDvf(insee);
    const aEcrire = Object.entries(calcul).map(([type_local, v]) => ({
      code_insee: insee, millesime: MILLESIME_DVF, type_local,
      prix_median: v.median, prix_q1: v.q1, prix_q3: v.q3, ventes: v.ventes,
    }));
    // Une commune sans vente exploitable est enregistrée aussi, sinon on
    // relirait ses quelques Mo à chaque ouverture de la modale.
    if (aEcrire.length === 0) aEcrire.push({ code_insee: insee, millesime: MILLESIME_DVF, type_local: "Aucun", prix_median: 0, prix_q1: 0, prix_q3: 0, ventes: 0 });
    await sb("bo_dvf_commune?on_conflict=code_insee,millesime,type_local", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(aEcrire),
    });
    const v = calcul[type];
    ligne = v ? { type_local: type, prix_median: v.median, ventes: v.ventes } : undefined;
  }
  if (!ligne || !ligne.prix_median) return undefined;
  return { valeur: Number(ligne.prix_median), ventes: ligne.ventes, millesime: MILLESIME_DVF };
}

/** Repères de la commune, pour la destination visée. */
export async function reperesCommune(insee: string, destination = "Logement"): Promise<Reperes> {
  if (!/^(\d{5}|\d[AB]\d{3})$/i.test(insee)) return {};
  // Le loyer d'annonce et DVF ne couvrent que l'habitation ; pour un commerce
  // ou un bureau, aucun repère n'est proposé plutôt qu'un repère faux.
  if (destination !== "Logement") return {};
  const [loyer, prix] = await Promise.all([
    loyerCommune(insee).catch(() => undefined),
    prixCommune(insee, "Appartement").catch(() => undefined),
  ]);
  const renta = loyer && prix ? Math.round((loyer.valeur * 12 * 1000) / prix.valeur) / 10 : undefined;
  return { loyer, prix, renta };
}
