"use server";

/* Prospection en dur — l'offre qu'on va chercher, quand les Recherches sont la
 * demande qui vient à nous.
 *
 * La table `fi_pm_cible` ne contient qu'une chose, et c'est tout l'intérêt :
 * les immeubles détenus par une société ET PAS EN COPROPRIÉTÉ. Un immeuble
 * déjà divisé n'est plus à diviser ; celui qui ne l'est pas, et qui appartient
 * à une SCI de quatre lots ou plus, est exactement ce qu'on cherche.
 *
 * Deux sources publiques, rapprochées à l'import : le fichier des locaux des
 * personnes morales (DGFiP, millésime 2024) pour le propriétaire, et le
 * registre national d'immatriculation des copropriétés (ANAH) pour écarter les
 * copros. Voir scripts/import-proprietaires-pm.py.
 *
 * Ce qui n'y est pas : les immeubles de particuliers (le fichier n'a pas le
 * droit de les nommer) et les adresses de moins de quatre locaux.
 */

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type CritèresProspection = {
  /** Code INSEE d'une commune, ou code département sur deux chiffres. */
  commune?: string;
  departement?: string;
  /** Début du nom de voie, sans le type : « victor hugo ». */
  voie?: string;
  /** Fourchette de locaux détenus par la société à l'adresse. */
  min?: number;
  max?: number;
  /** Formes juridiques retenues : SCI, SARL, SAS… */
  formes?: string[];
  /** Une société précise, par SIREN ou par nom. */
  societe?: string;
  page?: number;
};

export type Cible = {
  insee: string;
  commune?: string;
  adresse: string;
  siren: string;
  nom: string;
  forme?: string;
  locaux: number;
};

export type PageProspection = {
  ok: true;
  lignes: Cible[];
  total: number;
  page: number;
  parPage: number;
} | { ok: false; erreur: string };

const PAR_PAGE = 50;

function nettoyer(v?: string) {
  return (v ?? "").trim().replace(/[%*(),"\\]/g, "");
}

/** La voie du cadastre est écrite sans son type et sans accents. */
function noyauVoie(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^(RUE|AVENUE|AV|BOULEVARD|BD|IMPASSE|ALLEE|PLACE|COURS|QUAI|CHEMIN|ROUTE|VOIE)\s+/, "");
}

function requete(c: CritèresProspection) {
  const p = new URLSearchParams();
  p.set("select", "insee,num,voie,nature,siren,nom,forme,locaux");
  p.set("order", "locaux.desc,insee.asc,num.asc");
  const commune = nettoyer(c.commune);
  const dep = nettoyer(c.departement);
  if (commune) p.append("insee", `eq.${commune}`);
  /* Le département sans colonne dédiée : les codes INSEE d'un département
     commencent par lui. `like` sur un préfixe reste indexé. */
  else if (dep) p.append("insee", `like.${dep}*`);
  const voie = noyauVoie(nettoyer(c.voie ?? ""));
  if (voie) p.append("voie", `like.*${voie}*`);
  if (c.min && c.min > 0) p.append("locaux", `gte.${c.min}`);
  if (c.max && c.max > 0) p.append("locaux", `lte.${c.max}`);
  if (c.formes?.length) p.append("forme", `in.(${c.formes.map(nettoyer).filter(Boolean).join(",")})`);
  const soc = nettoyer(c.societe);
  if (soc) {
    p.append(/^\d{6,9}$/.test(soc) ? "siren" : "nom", /^\d{6,9}$/.test(soc) ? `like.${soc}*` : `ilike.*${soc}*`);
  }
  return p;
}

async function lire(p: URLSearchParams, depuis: number, jusqu: number) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente.");
  const res = await fetch(`${SB_URL}/rest/v1/fi_pm_cible?${p}`, {
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      Range: `${depuis}-${jusqu}`, Prefer: "count=estimated",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Lecture ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const total = Number(res.headers.get("content-range")?.split("/")[1] ?? 0);
  return { rows: (await res.json()) as Record<string, unknown>[], total };
}

/** Le nom des communes trouvées, en une requête plutôt qu'une par ligne. */
async function communes(codes: string[]) {
  if (!SB_KEY || !codes.length) return new Map<string, string>();
  const liste = [...new Set(codes)].map((c) => `"${c}"`).join(",");
  const res = await fetch(
    `${SB_URL}/rest/v1/fi_pm_commune?select=insee,nom&insee=in.(${encodeURIComponent(liste)})`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return new Map<string, string>();
  const rows = (await res.json()) as { insee: string; nom: string }[];
  return new Map(rows.map((r) => [r.insee, r.nom]));
}

function enCible(r: Record<string, unknown>, noms: Map<string, string>): Cible {
  const insee = String(r.insee ?? "");
  return {
    insee,
    commune: noms.get(insee),
    adresse: [r.num, r.nature, r.voie].filter(Boolean).join(" "),
    siren: String(r.siren ?? ""),
    nom: String(r.nom ?? ""),
    forme: r.forme ? String(r.forme) : undefined,
    locaux: Number(r.locaux ?? 0),
  };
}

export async function chercherCibles(c: CritèresProspection): Promise<PageProspection> {
  try {
    const page = Math.max(0, c.page ?? 0);
    const p = requete(c);
    const { rows, total } = await lire(p, page * PAR_PAGE, page * PAR_PAGE + PAR_PAGE - 1);
    const noms = await communes(rows.map((r) => String(r.insee ?? "")));
    return { ok: true, lignes: rows.map((r) => enCible(r, noms)), total, page, parPage: PAR_PAGE };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : String(e) };
  }
}

/** Les communes qui portent ce nom — pour taper « Bordeaux », pas « 33063 ». */
export async function chercherCommunes(q: string) {
  const t = nettoyer(q);
  if (!SB_KEY || t.length < 2) return [] as { insee: string; nom: string; dep: string }[];
  const res = await fetch(
    `${SB_URL}/rest/v1/fi_pm_commune?select=insee,nom,dep&nom=ilike.*${encodeURIComponent(t)}*&order=nom.asc&limit=12`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return [];
  return (await res.json()) as { insee: string; nom: string; dep: string }[];
}

/**
 * L'export : la même recherche, en entier, prête pour un publipostage.
 *
 * Avec les sièges sociaux, la liste devient une pile de courriers à poster —
 * c'est là qu'on écrit à une SCI. Sans eux, elle sort immédiatement. D'où le
 * choix laissé à l'écran : l'adresse d'une société se demande à l'annuaire une
 * par une, et mille sociétés font mille appels.
 *
 * Ce qu'on obtient est gardé en base : le deuxième export d'un même secteur
 * n'attend plus.
 */
const PLAFOND_EXPORT = 3000;
/** Au-delà, l'export dépasserait le temps alloué à une action serveur. */
const PLAFOND_SIEGES = 400;

export async function exporterCibles(c: CritèresProspection, avecSiege = false): Promise<{
  ok: true; csv: string; lignes: number; sieges: number; manquants: number;
} | { ok: false; erreur: string }> {
  try {
    const p = requete(c);
    const { rows } = await lire(p, 0, PLAFOND_EXPORT - 1);
    const noms = await communes(rows.map((r) => String(r.insee ?? "")));
    const cibles = rows.map((r) => enCible(r, noms));

    const sieges = new Map<string, string>();
    let manquants = 0;
    if (avecSiege) {
      const uniques = [...new Set(cibles.map((x) => x.siren))].filter((s) => /^\d{9}$/.test(s));
      for (const [code, adr] of await siegesConnus(uniques)) sieges.set(code, adr);
      const aChercher = uniques.filter((s) => !sieges.has(s));
      manquants = Math.max(0, aChercher.length - PLAFOND_SIEGES);
      const lot = aChercher.slice(0, PLAFOND_SIEGES);
      const neufs: { code: string; siege: string }[] = [];
      for (let i = 0; i < lot.length; i += 20) {
        const r = await Promise.all(
          lot.slice(i, i + 20).map(async (s) => [s, await siege(s)] as const),
        );
        for (const [s, adr] of r) if (adr) { sieges.set(s, adr); neufs.push({ code: s, siege: adr }); }
      }
      await memoriserSieges(neufs);
    }

    const entete = [
      "Commune", "Adresse de l'immeuble", "Locaux détenus", "Société", "Forme", "SIREN",
      "Siège social",
    ];
    const lignes = cibles.map((x) => [
      x.commune ?? x.insee, x.adresse, String(x.locaux), x.nom, x.forme ?? "", x.siren,
      sieges.get(x.siren) ?? "",
    ]);
    const csv = [entete, ...lignes]
      .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    /* Le BOM : sans lui, Excel lit « SCI FRANÇOIS » en mojibake. */
    return { ok: true, csv: `\uFEFF${csv}`, lignes: cibles.length, sieges: sieges.size, manquants };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : String(e) };
  }
}

/** Les sièges déjà connus, gardés d'un export à l'autre. */
async function siegesConnus(codes: string[]) {
  if (!SB_KEY || !codes.length) return [] as [string, string][];
  const out: [string, string][] = [];
  for (let i = 0; i < codes.length; i += 300) {
    const liste = codes.slice(i, i + 300).map((c) => `"${c}"`).join(",");
    const res = await fetch(
      `${SB_URL}/rest/v1/fi_pm_soc?select=code,siege&siege=not.is.null`
      + `&code=in.(${encodeURIComponent(liste)})`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
    ).catch(() => null);
    if (!res?.ok) continue;
    for (const r of (await res.json()) as { code: string; siege: string }[]) out.push([r.code, r.siege]);
  }
  return out;
}

async function memoriserSieges(lignes: { code: string; siege: string }[]) {
  if (!SB_KEY || !lignes.length) return;
  /* `nom` est obligatoire en base : à défaut de mieux le SIREN fera l'affaire,
     jusqu'à ce qu'une consultation le remplace par la vraie dénomination. */
  const corps = lignes.map((l) => ({ code: l.code, nom: l.code, siege: l.siege }));
  await fetch(`${SB_URL}/rest/v1/fi_pm_soc?on_conflict=code`, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(corps),
    cache: "no-store",
  }).catch(() => null);
}

/** Le siège social d'après l'annuaire des entreprises (public, sans clé). */
async function siege(siren: string) {
  const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}&per_page=1`, {
    cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return null;
  const d = (await r.json().catch(() => null)) as {
    results?: { siren?: string; siege?: { adresse?: string } }[];
  } | null;
  const e = d?.results?.[0];
  return e?.siren === siren ? (e.siege?.adresse ?? null) : null;
}
