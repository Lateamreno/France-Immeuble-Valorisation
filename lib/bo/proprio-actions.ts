"use server";

/* Qui possède cet immeuble ? (retour #135)
 *
 * Quand le propriétaire est une PERSONNE MORALE, l'information est publique :
 * la DGFiP publie en open data le « fichier des locaux des personnes morales »,
 * extrait de MAJIC — le cadastre fiscal. Pour chaque local bâti : la commune,
 * la voie, le numéro, la société détentrice et la nature de son droit.
 *
 * Ce fichier ne se consulte pas en ligne : il se télécharge. On l'a donc
 * dégraissé une fois pour toutes — millésime 2024, droits de propriété
 * seulement, replié par voie — et rangé dans `fi_pm_voie` (972 312 lignes,
 * 132 Mo). Voir le script d'import dans la migration du même nom.
 *
 * Ce qu'il ne donne pas, et il faut le savoir en le lisant : les personnes
 * physiques, exclues par construction (protection des données). Une adresse
 * sans résultat n'est pas une adresse sans propriétaire — c'est presque
 * toujours un particulier ou une indivision familiale.
 */

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Millésime du fichier chargé : un propriétaire a pu vendre depuis. */
const MILLESIME = "2024";

/** Un détenteur de droit à l'adresse cherchée. */
export type ProprietairePM = {
  denomination: string;
  /** Absent quand le cadastre ne porte qu'un identifiant interne (préfixé U). */
  siren?: string;
  forme?: string;
  /** Propriétaire, usufruitier, nu-propriétaire. */
  droit: string;
  /** Le numéro exact du fichier : « 40 » ou « 40 B ». */
  numero?: string;
  /** Combien de locaux elle détient à cette adresse : 1 lot, ou l'immeuble. */
  locaux: number;
};

export type ResultatProprietaires =
  | {
    ok: true; adresse: string; millesime: string; liste: ProprietairePM[];
    /** Ce que le décompte laisse penser de l'immeuble, sans le sur-affirmer. */
    lecture?: string;
  }
  | { ok: false; erreur: string };

const DROITS: Record<string, string> = {
  P: "Propriétaire", U: "Usufruitier", N: "Nu-propriétaire",
};
const RANG: Record<string, number> = { P: 0, U: 1, N: 2 };

async function sb(chemin: string): Promise<Record<string, unknown>[]> {
  if (!SB_KEY) return [];
  const r = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return [];
  return (await r.json().catch(() => [])) as Record<string, unknown>[];
}

/**
 * Géocodage : la BAN rend un identifiant « insee_rivoli_numéro ».
 *
 * C'est la même clé que le cadastre : le code RIVOLI de la voie est commun aux
 * deux. On n'a donc aucun libellé de rue à rapprocher — pas d'approximation,
 * pas de « rue du Tondu » contre « DU TONDU PROLONGEE ».
 */
async function situer(adresse: string) {
  const q = encodeURIComponent(adresse.trim());
  const sources = [
    `https://data.geopf.fr/geocodage/search?q=${q}&limit=1&index=address`,
    `https://api-adresse.data.gouv.fr/search/?q=${q}&limit=1`,
  ];
  for (const url of sources) {
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) continue;
    const d = (await r.json().catch(() => null)) as {
      features?: { properties?: { id?: string; citycode?: string; housenumber?: string; label?: string } }[];
    } | null;
    const p = d?.features?.[0]?.properties;
    if (p?.id) return p;
  }
  return null;
}

/**
 * « 40=123456789P3,987654321U1;40B=… » → les détenteurs au numéro demandé.
 *
 * Chaque entrée porte le SIREN, la lettre du droit, et le NOMBRE DE LOCAUX
 * détenus à cette adresse. Ce compte est ce qui distingue « la SCI possède
 * l'immeuble » de « la SCI possède un appartement dans l'immeuble » : le
 * fichier recense tout local bâti, pas seulement les immeubles en bloc.
 *
 * On lit par la fin : le code interne du cadastre commence lui aussi par un U,
 * donc chercher la lettre du droit par la gauche se tromperait.
 */
const ENTREE = /^(.+?)([PUN])(\d+)$/;

function lire(biens: string, numero: string) {
  const cherche = numero.replace(/\D/g, "").replace(/^0+/, "");
  const out: { code: string; droit: string; numero: string; locaux: number }[] = [];
  for (const bloc of biens.split(";")) {
    const eq = bloc.indexOf("=");
    if (eq < 0) continue;
    const pos = bloc.slice(0, eq);
    /* « 40 » et « 40 B » sont deux entrées du fichier, et souvent deux
       immeubles mitoyens du même propriétaire : on rend les deux, étiquetées. */
    if (pos.replace(/\D/g, "").replace(/^0+/, "") !== cherche) continue;
    for (const g of bloc.slice(eq + 1).split(",")) {
      const m = ENTREE.exec(g);
      if (!m) continue;
      out.push({ code: m[1], droit: m[2], numero: pos, locaux: Number(m[3]) || 1 });
    }
  }
  return out;
}

/** Les noms déjà connus localement (identifiants internes + cache). */
async function nomsConnus(codes: string[]) {
  if (!codes.length) return new Map<string, { nom: string; forme?: string }>();
  const liste = codes.map((c) => `"${c}"`).join(",");
  const rows = await sb(`fi_pm_soc?select=code,nom,forme&code=in.(${encodeURIComponent(liste)})`);
  return new Map(rows.map((r) => [String(r.code), { nom: String(r.nom), forme: r.forme ? String(r.forme) : undefined }]));
}

/** Le nom d'une société d'après l'annuaire des entreprises (public, sans clé). */
async function nomEnLigne(siren: string) {
  const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}&per_page=1`, {
    cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return null;
  const d = (await r.json().catch(() => null)) as {
    results?: { siren?: string; nom_raison_sociale?: string; nom_complet?: string }[];
  } | null;
  const e = d?.results?.[0];
  if (!e || e.siren !== siren) return null;
  const nom = (e.nom_raison_sociale || e.nom_complet || "").toUpperCase();
  return nom || null;
}

/** Ce qu'on vient de résoudre, on le garde : la fois d'après est immédiate. */
async function memoriser(lignes: { code: string; nom: string }[]) {
  if (!SB_KEY || !lignes.length) return;
  await fetch(`${SB_URL}/rest/v1/fi_pm_soc?on_conflict=code`, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(lignes),
    cache: "no-store",
  }).catch(() => null);
}

/**
 * Ce que le décompte laisse penser — au conditionnel, et c'est volontaire.
 *
 * Les personnes physiques étant absentes du fichier, on ne connaît jamais le
 * total des lots d'un immeuble : une seule société avec un seul local peut
 * aussi bien être le seul lot vendu d'une monopropriété familiale. On dit donc
 * ce qu'on voit, et ce qu'on ne peut pas voir.
 */
function lecture(liste: { locaux: number; droit: string }[]): string {
  const proprios = liste.filter((x) => x.droit === "Propriétaire");
  const total = proprios.reduce((s, x) => s + x.locaux, 0);
  if (!proprios.length) return "Aucun propriétaire personne morale — seulement des droits démembrés.";
  if (proprios.length === 1 && total >= 4) {
    return `Une seule société, ${total} locaux : elle détient peut-être l'immeuble entier — à vérifier, les lots des particuliers ne figurent pas au fichier.`;
  }
  if (proprios.length === 1 && total <= 2) {
    return `Une société, ${total === 1 ? "un seul local" : "deux locaux"} : c'est un lot dans l'immeuble, pas l'immeuble.`;
  }
  if (proprios.length > 1) {
    return `${proprios.length} sociétés se partagent ${total} locaux : l'immeuble est découpé, en copropriété.`;
  }
  return `${total} locaux détenus à cette adresse.`;
}

/**
 * Les personnes morales détenant un droit à cette adresse.
 */
export async function proprietairesPm(adresse: string): Promise<ResultatProprietaires> {
  if (!adresse?.trim()) return { ok: false, erreur: "Adresse vide." };
  const p = await situer(adresse);
  if (!p?.id) return { ok: false, erreur: "Adresse introuvable dans la Base Adresse Nationale." };

  /* « 33063_8975_00040 » : commune, voie, numéro. Sans numéro, la BAN a
     répondu par une rue entière ou un lieu-dit — le fichier ne peut pas
     trancher. */
  const parts = p.id.split("_");
  if (parts.length < 3 || !p.housenumber) {
    return {
      ok: false,
      erreur: "Il manque le numéro dans la rue : précisez l'adresse pour que le fichier puisse trancher.",
    };
  }
  const cle = `${parts[0]}_${parts[1]}`;
  const rows = await sb(`fi_pm_voie?select=biens&cle=eq.${encodeURIComponent(cle)}&limit=1`);
  const biens = rows[0]?.biens ? String(rows[0].biens) : "";
  const trouves = biens ? lire(biens, String(p.housenumber)) : [];

  if (!trouves.length) {
    return { ok: true, adresse: p.label ?? adresse, millesime: MILLESIME, liste: [] };
  }

  /* Les noms : d'abord ce qu'on a en base (identifiants internes du cadastre,
     et tout ce qu'on a déjà résolu), le reste à l'annuaire des entreprises. */
  const codes = [...new Set(trouves.map((t) => t.code))];
  const connus = await nomsConnus(codes);
  const manquants = codes.filter((c) => !connus.has(c) && /^\d{9}$/.test(c));
  const neufs = await Promise.all(
    manquants.slice(0, 20).map(async (c) => ({ code: c, nom: await nomEnLigne(c) })),
  );
  for (const n of neufs) if (n.nom) connus.set(n.code, { nom: n.nom });
  await memoriser(neufs.filter((n): n is { code: string; nom: string } => !!n.nom));

  const vus = new Set<string>();
  const liste: (ProprietairePM & { rang: number })[] = [];
  for (const t of trouves) {
    const k = `${t.code}|${t.droit}|${t.numero}`;
    if (vus.has(k)) continue;
    vus.add(k);
    const fiche = connus.get(t.code);
    liste.push({
      denomination: fiche?.nom ?? `Société ${t.code}`,
      siren: /^\d{9}$/.test(t.code) ? t.code : undefined,
      forme: fiche?.forme,
      droit: DROITS[t.droit] ?? "Droit non précisé",
      numero: t.numero.replace(/^0+/, ""),
      locaux: t.locaux,
      rang: RANG[t.droit] ?? 9,
    });
  }
  /* Les propriétaires d'abord : c'est eux qu'on met au mandat. À droit égal,
     celui qui détient le plus de locaux — c'est le plus probable interlocuteur. */
  liste.sort(
    (a, b) => a.rang - b.rang || b.locaux - a.locaux || a.denomination.localeCompare(b.denomination),
  );
  return {
    ok: true,
    adresse: p.label ?? adresse,
    millesime: MILLESIME,
    lecture: lecture(liste),
    liste: liste.map((x) => ({
      denomination: x.denomination, siren: x.siren, forme: x.forme,
      droit: x.droit, numero: x.numero, locaux: x.locaux,
    })),
  };
}
