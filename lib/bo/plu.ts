/**
 * Constructibilité lue par l'IA (MAV, 20/11/26) : « remplir la constructibilité
 * par IA quand on fait les dossiers immeubles […] avec un détail quelque part
 * pour qu'on puisse vérifier que le taff a été bien fait ».
 *
 * Deux sources, qu'on ne mélange jamais à l'écran :
 *  - le Géoportail de l'urbanisme (service de l'État) donne, sans aucune IA, la
 *    zone du point, son type, le document en vigueur et le PDF du règlement ;
 *  - l'IA lit ce règlement pour en tirer l'emprise au sol et la hauteur. Chaque
 *    chiffre arrive avec l'extrait du règlement qui le porte et sa page : c'est
 *    le « détail » qui permet de vérifier.
 *
 * Ce fichier est pur (aucun appel) : lecture des réponses, choix des pages,
 * lecture de la réponse du modèle, contrôles. `plu-serveur.ts` va chercher.
 */

/* ───────────── Le Géoportail de l'urbanisme ───────────── */

export type ZonePlu = {
  /** Libellé porté au plan de zonage : « UAi7c5 ». */
  zone: string;
  /** Intitulé long de la zone, quand la commune l'a renseigné. */
  intitule?: string;
  /** Lettre(s) du code de l'urbanisme : U, AU, AUc, AUs, A, N. */
  code?: string;
  /** Le même, en clair : « Urbaine ». */
  type?: string;
  /** Le document : « PLUi Boucle Nord de Seine ». */
  document?: string;
  /** Date d'approbation, AAAA-MM-JJ. */
  approuve?: string;
  /** Adresse du PDF du règlement, sans ancre. */
  reglement?: string;
  /** Page du PDF où commence la zone, quand le Géoportail la donne. */
  page?: number;
};

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** U → « Urbaine » : les mots que portent déjà les fiches. */
export function typeZoneEnClair(code: string): string {
  const c = code.trim().toUpperCase();
  if (c.startsWith("AU")) return "À urbaniser";
  if (c === "U") return "Urbaine";
  if (c === "A") return "Agricole";
  if (c === "N") return "Naturelle";
  return "";
}

/** 20250630 → 2025-06-30. */
export function dateGpu(v: unknown): string | undefined {
  const s = String(v ?? "").replace(/\D/g, "");
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : undefined;
}

type Feature = { properties?: Record<string, unknown> };
const features = (brut: unknown): Feature[] => {
  const f = (brut as { features?: unknown })?.features;
  return Array.isArray(f) ? (f as Feature[]) : [];
};

/**
 * La zone du point, d'après `/gpu/zone-urba` (et `/gpu/document` pour le nom du
 * document). `null` quand le point n'est couvert par aucun document numérisé
 * (commune au règlement national d'urbanisme, ou PLU pas encore versé).
 */
export function lireZoneGpu(zoneUrba: unknown, documents?: unknown): ZonePlu | null {
  const p = features(zoneUrba)[0]?.properties;
  const zone = txt(p?.libelle);
  if (!p || !zone) return null;
  const code = txt(p.typezone);
  const z: ZonePlu = { zone };
  const intitule = txt(p.libelong);
  if (intitule && intitule !== zone) z.intitule = intitule;
  if (code) {
    z.code = code;
    const type = typeZoneEnClair(code);
    if (type) z.type = type;
  }
  const approuve = dateGpu(p.datvalid) ?? dateGpu(p.datappro);
  if (approuve) z.approuve = approuve;

  const doc = features(documents).map((f) => f.properties ?? {})
    .find((d) => !txt(p.gpu_doc_id) || txt(d.id) === txt(p.gpu_doc_id) || txt(d.gpu_doc_id) === txt(p.gpu_doc_id))
    ?? features(documents)[0]?.properties;
  const titre = txt(doc?.grid_title);
  const genre = txt(doc?.du_type);
  if (titre) {
    /* « PLUI BOUCLE NORD DE SEINE » → « PLUi Boucle Nord de Seine ». */
    const propre = titre.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
      .replace(/\b(De|Du|Des|La|Le|Les|Et|Sur|En|D)\b/g, (m) => m.toLowerCase())
      .replace(/^plui?\b/i, (m) => (m.length === 4 ? "PLUi" : "PLU"));
    z.document = /^(PLU|carte|POS|PSMV)/i.test(propre) ? propre : [genre, propre].filter(Boolean).join(" ");
  } else if (genre) {
    z.document = genre;
  }

  /* Le règlement : `nomfic` (« xxx_reglement_20250630.pdf#page=55 ») sous le
     dossier du document. Certaines communes versent une adresse entière dans
     `urlfic`. */
  const nomfic = txt(p.nomfic);
  const urlfic = txt(p.urlfic);
  const brut = /^https?:\/\//i.test(urlfic) ? urlfic : nomfic;
  if (brut) {
    const [fichier, ancre] = brut.split("#");
    const page = Number(/page=(\d+)/i.exec(ancre ?? "")?.[1]);
    if (page >= 1) z.page = page;
    if (/^https?:\/\//i.test(fichier)) {
      z.reglement = fichier;
    } else if (/\.pdf$/i.test(fichier) && txt(p.partition) && txt(p.gpu_doc_id)) {
      z.reglement = `https://data.geopf.fr/annexes/gpu/documents/${encodeURIComponent(txt(p.partition))}/${encodeURIComponent(txt(p.gpu_doc_id))}/${encodeURIComponent(fichier)}`;
    }
  }
  return z;
}

/** Les prescriptions et informations qui couvrent le point : libellés, sans doublon. */
export function lireServitudes(...reponses: unknown[]): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const r of reponses) {
    for (const f of features(r)) {
      const l = txt(f.properties?.libelle).replace(/\s+/g, " ");
      const cle = l.toLowerCase();
      if (!l || vus.has(cle)) continue;
      vus.add(cle);
      out.push(l.length > 140 ? `${l.slice(0, 137)}…` : l);
    }
  }
  return out.slice(0, 12);
}

/* ───────────── Le règlement, page par page ───────────── */

/**
 * Retire les lignes qui reviennent sur presque toutes les pages (tampon de la
 * préfecture, pied de page numéroté) : elles noient le plan du document. Les
 * chiffres sont neutralisés avant de compter, sinon « Page – 80 » et
 * « Page – 81 » passent pour deux lignes différentes.
 */
export function nettoyerPages(pages: string[]): string[] {
  const motif = (l: string) => l.trim().replace(/\d+/g, "#").replace(/\s+/g, " ");
  const compte = new Map<string, number>();
  for (const p of pages) {
    for (const m of new Set(p.split("\n").map(motif))) if (m.length >= 6) compte.set(m, (compte.get(m) ?? 0) + 1);
  }
  const seuil = Math.max(8, Math.ceil(pages.length * 0.25));
  /* Un pied de page change de ponctuation d'un tome à l'autre et passe alors
     sous le seuil : on le reconnaît aussi à sa forme (« … – Page – 80 », « 12 / 340 »). */
  const pied = /(\bpage\s*[-–—:]?\s*\d+(\s*(\/|sur)\s*\d+)?|^\d+(\s*\/\s*\d+)?)\s*$/i;
  return pages.map((p) => p.split("\n").filter((l) => {
    const m = motif(l);
    return m.length > 0 && (compte.get(m) ?? 0) < seuil && !pied.test(l.trim());
  }).join("\n"));
}

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const occurrences = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

/** Le début alphabétique d'un libellé : « UAi7c5 » → « UA », « UCa » → « UC ». */
export function racineZone(zone: string): string {
  return /^[0-9]*[A-Z]+/.exec(zone.trim())?.[0] ?? zone.trim();
}

/**
 * Le plan du règlement : une ligne par page — son numéro, ses deux premières
 * lignes, et ce qu'elle contient d'utile (le libellé de la zone, « emprise »,
 * « hauteur »). C'est avec lui que l'IA choisit les pages à lire : un règlement
 * fait couramment 300 à 600 pages, on ne lui envoie pas tout.
 */
export function planDuReglement(pages: string[], zone: string): string {
  const racine = racineZone(zone);
  const reZone = new RegExp(`(^|[^\\p{L}\\p{N}])${zone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u");
  const reRacine = new RegExp(`(^|[^\\p{L}\\p{N}])${racine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u");
  return pages.map((p, i) => {
    const lignes = p.split("\n").map((l) => l.trim()).filter(Boolean);
    const tete = lignes.slice(0, 2).map((l) => (l.length > 110 ? `${l.slice(0, 107)}…` : l)).join(" · ") || "(page sans texte)";
    const bas = sansAccent(p);
    const marques = [
      reZone.test(p) ? `zone ${zone}` : reRacine.test(p) ? `mention ${racine}` : "",
      occurrences(bas, /emprise au sol/g) ? `emprise×${occurrences(bas, /emprise au sol/g)}` : "",
      occurrences(bas, /hauteur/g) ? `hauteur×${occurrences(bas, /hauteur/g)}` : "",
      /sommaire|table des matieres/.test(bas) ? "sommaire" : "",
    ].filter(Boolean).join(", ");
    return `${i + 1} | ${tete}${marques ? ` | ${marques}` : ""}`;
  }).join("\n");
}

/** « 12-14, 54, 83-87 » → [12, 13, 14, 54, 83, …], bornée au document. */
export function lirePlages(texte: string, total: number): number[] {
  const out = new Set<number>();
  for (const m of texte.matchAll(/(\d+)\s*(?:[-–à]\s*(\d+))?/g)) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (!(a >= 1) || b < a || b - a > 60) continue;
    for (let n = a; n <= b && n <= total; n++) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

/** [12, 13, 14, 54] → « 12-14, 54 ». */
export function ecrirePlages(pages: number[]): string {
  const tri = [...new Set(pages)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < tri.length; i++) {
    let j = i;
    while (j + 1 < tri.length && tri[j + 1] === tri[j] + 1) j++;
    out.push(j > i ? `${tri[i]}-${tri[j]}` : String(tri[i]));
    i = j;
  }
  return out.join(", ");
}

export const MAX_PAGES = 45;

/**
 * Les pages à lire : celles que l'IA a désignées d'après le plan, plus la page
 * que le Géoportail indique pour la zone et ses voisines. Plafonné — au-delà,
 * la lecture devient lente et chère sans rien apporter.
 */
export function pagesALire(designees: number[], pageZone: number | undefined, total: number, max = MAX_PAGES): number[] {
  const out = new Set<number>();
  /* La page indiquée est souvent une page de titre : la règle commence après. */
  if (pageZone) for (const n of [pageZone, pageZone + 1, pageZone + 2]) if (n >= 1 && n <= total) out.add(n);
  for (const n of designees) {
    if (out.size >= max) break;
    if (Number.isInteger(n) && n >= 1 && n <= total) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/* ───────────── La réponse de l'IA ───────────── */

export type Extrait = { page: number; texte: string };

/** Ce que vaut la preuve d'un chiffre. */
export type Controle =
  /** L'extrait cité porte le chiffre retenu : rien à redire. */
  | "chiffre_cite"
  /** Un extrait est cité, mais le chiffre n'y figure pas tel quel (calcul, renvoi) : à relire. */
  | "cite_sans_chiffre"
  /** Aucun extrait : le chiffre n'est pas prouvé. */
  | "sans_extrait";

export type ValeurLue = {
  /** Le chiffre (% pour l'emprise, mètres pour la hauteur) ; absent quand le règlement n'en fixe pas. */
  valeur?: number;
  /** Ce que dit le règlement quand il n'y a pas de chiffre : « non réglementée ». */
  mention?: string;
  /** La règle, en une ou deux phrases. */
  regle: string;
  extraits: Extrait[];
  controle: Controle;
};

export type PointASavoir = { texte: string; extraits: Extrait[] };

export type LecturePlu = {
  /** Date et heure de la lecture, ISO. */
  fait_le: string;
  /** Qui l'a lancée. */
  par?: string;
  /** Ce que dit le Géoportail, sans IA. */
  zone: ZonePlu;
  servitudes: string[];
  /** Ce que l'IA a lu dans le règlement — absent si la lecture n'a pas pu se faire. */
  emprise?: ValeurLue;
  hauteur?: ValeurLue;
  a_savoir: PointASavoir[];
  /** Pages du PDF envoyées à l'IA. */
  pages_lues: number[];
  /** Nombre de pages du règlement. */
  pages_total?: number;
  /** Doute exprimé par l'IA, ou raison pour laquelle la lecture est incomplète. */
  reserve?: string;
  /** Ce que la lecture a consommé (MAV, 24/11 : « vérifier la consommation en € »). */
  conso?: ConsoLecture;
};

/** Jetons lus et écrits par l'IA sur une lecture, tous appels réunis, et leur prix. */
export type ConsoLecture = { appels: number; entree: number; sortie: number; cout_usd: number };

/** Prix du modèle employé, en dollars par million de jetons (grille publique, 11/2026). */
export const PRIX_ENTREE_USD = 4;
export const PRIX_SORTIE_USD = 20;

/** Le prix d'une lecture, au centième de dollar. Estimation : la facture fait foi. */
export function coutLecture(entree: number, sortie: number): number {
  return Math.round(((entree * PRIX_ENTREE_USD + sortie * PRIX_SORTIE_USD) / 1e6) * 100) / 100;
}

/** « environ 0,62 $ (112 000 jetons lus, 9 400 écrits, 2 appels) » */
export function phraseConso(c: ConsoLecture): string {
  const n = (v: number) => Math.round(v).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
  return `environ ${c.cout_usd.toFixed(2).replace(".", ",")} $ (${n(c.entree)} jetons lus, ${n(c.sortie)} écrits, ${c.appels} appel${c.appels > 1 ? "s" : ""})`;
}

/** Un bloc de la réponse : son texte, et les passages du PDF qu'il cite. */
export type BlocReponse = { text: string; citations?: { cited_text?: string; start_page_number?: number }[] | null };

const RUBRIQUES = ["EMPRISE", "HAUTEUR", "A_SAVOIR", "PAGES_MANQUANTES", "RESERVE"] as const;
type Rubrique = (typeof RUBRIQUES)[number];
const RE_TITRE = /^#{1,3}\s*(EMPRISE|HAUTEUR|A_SAVOIR|PAGES_MANQUANTES|RESERVE)\b.*$/gm;

const nombre = (s: string): number | undefined => {
  const m = /-?\d+(?:[.,]\d+)?/.exec(s);
  if (!m) return undefined;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** Le chiffre figure-t-il dans l'un des extraits ? « 70 » dans « c 70% 20% 10% », pas dans « 170 ». */
export function chiffreDansExtraits(valeur: number, extraits: Extrait[]): boolean {
  const ecritures = new Set([String(valeur), String(valeur).replace(".", ",")]);
  if (Number.isInteger(valeur)) { ecritures.add(`${valeur},0`); ecritures.add(`${valeur},00`); ecritures.add(`${valeur}.0`); }
  return extraits.some((e) => [...ecritures].some((x) =>
    new RegExp(`(^|[^\\d,.])${x.replace(".", "\\.")}([^\\d]|$)`).test(e.texte.replace(/ | /g, " "))));
}

function valeurDe(texte: string, extraits: Extrait[]): ValeurLue | undefined {
  const ligne = (cle: string) => new RegExp(`^\\s*${cle}\\s*:\\s*(.*)$`, "mi").exec(texte)?.[1]?.trim() ?? "";
  const brut = ligne("VALEUR");
  const mentionBrute = ligne("MENTION");
  const mention = /^(aucune?|non|n\/a|-|—)?\.?$/i.test(mentionBrute) ? "" : mentionBrute;
  /* La règle : tout ce qui suit « REGLE : », sur plusieurs lignes au besoin. */
  const regle = (/^\s*REGLE\s*:\s*([\s\S]*)$/mi.exec(texte)?.[1] ?? "")
    .replace(/^\s*(VALEUR|MENTION)\s*:.*$/gmi, "").replace(/\s+/g, " ").trim();
  const valeur = /^(aucune?|non|n\/a|-|—)?$/i.test(brut) ? undefined : nombre(brut);
  if (valeur === undefined && !mention && !regle) return undefined;
  const v: ValeurLue = {
    regle,
    extraits,
    controle: extraits.length === 0 ? "sans_extrait"
      : valeur !== undefined && !chiffreDansExtraits(valeur, extraits) ? "cite_sans_chiffre" : "chiffre_cite",
  };
  if (valeur !== undefined) v.valeur = valeur;
  if (mention) v.mention = mention;
  return v;
}

/**
 * Lit la réponse du modèle. Elle arrive en blocs : le texte qu'il écrit, et,
 * accrochés à certains blocs, les passages du PDF qu'il cite (`cited_text`,
 * page dans le PDF envoyé). On range chaque citation sous la rubrique en cours
 * au moment où elle apparaît, et on ramène sa page à celle du règlement entier.
 */
export function lireReponse(blocs: BlocReponse[], pagesEnvoyees: number[]): {
  emprise?: ValeurLue; hauteur?: ValeurLue; aSavoir: PointASavoir[]; manquantes: string; reserve?: string;
} {
  const textes: Record<Rubrique, string> = { EMPRISE: "", HAUTEUR: "", A_SAVOIR: "", PAGES_MANQUANTES: "", RESERVE: "" };
  const preuves: Record<Rubrique, Extrait[]> = { EMPRISE: [], HAUTEUR: [], A_SAVOIR: [], PAGES_MANQUANTES: [], RESERVE: [] };
  /** Pour « à savoir » : à quelle puce se rattache chaque citation. */
  const puceDe: number[] = [];
  let enCours: Rubrique | null = null;

  for (const b of blocs) {
    /* Un bloc peut ouvrir une rubrique en son milieu : on le découpe. */
    const reste = b.text;
    RE_TITRE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let debut = 0;
    const morceaux: { rubrique: Rubrique | null; texte: string }[] = [];
    while ((m = RE_TITRE.exec(reste))) {
      morceaux.push({ rubrique: enCours, texte: reste.slice(debut, m.index) });
      enCours = m[1] as Rubrique;
      debut = m.index + m[0].length;
    }
    morceaux.push({ rubrique: enCours, texte: reste.slice(debut) });
    for (const x of morceaux) if (x.rubrique) textes[x.rubrique] += x.texte;

    if (!enCours || !b.citations?.length) continue;
    for (const c of b.citations) {
      const page = pagesEnvoyees[(c.start_page_number ?? 0) - 1];
      const texte = (c.cited_text ?? "").replace(/\s+/g, " ").trim();
      if (!page || !texte) continue;
      if (preuves[enCours].some((e) => e.page === page && e.texte === texte)) continue;
      preuves[enCours].push({ page, texte: texte.length > 600 ? `${texte.slice(0, 597)}…` : texte });
      if (enCours === "A_SAVOIR") puceDe.push(Math.max(0, occurrences(textes.A_SAVOIR, /^\s*[-•]\s+/gm) - 1));
    }
  }

  const puces = textes.A_SAVOIR.split(/^\s*[-•]\s+/m).slice(1)
    .map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const aSavoir = puces.slice(0, 6).map((texte, i) => ({
    texte,
    extraits: preuves.A_SAVOIR.filter((_, k) => puceDe[k] === i),
  })).filter((p) => !/^(aucun|rien|néant)\b/i.test(p.texte));

  const reserve = textes.RESERVE.replace(/\s+/g, " ").trim();
  return {
    emprise: valeurDe(textes.EMPRISE, preuves.EMPRISE),
    hauteur: valeurDe(textes.HAUTEUR, preuves.HAUTEUR),
    aSavoir,
    manquantes: /aucune?/i.test(textes.PAGES_MANQUANTES) ? "" : textes.PAGES_MANQUANTES.trim(),
    ...(reserve && !/^(aucune?|néant|rien)\.?$/i.test(reserve) ? { reserve } : {}),
  };
}

/* ───────────── Ce que l'écran en fait ───────────── */

/** La lecture gardée sur la fiche (`plu_ia`), relue prudemment. */
export function lectureDe(im: Record<string, unknown>): LecturePlu | null {
  const l = im.plu_ia as Partial<LecturePlu> | undefined;
  if (!l || typeof l !== "object" || !l.zone || typeof l.zone !== "object" || !txt((l.zone as ZonePlu).zone)) return null;
  return {
    fait_le: txt(l.fait_le),
    par: txt(l.par) || undefined,
    zone: l.zone as ZonePlu,
    servitudes: Array.isArray(l.servitudes) ? l.servitudes.filter((s): s is string => typeof s === "string") : [],
    emprise: l.emprise,
    hauteur: l.hauteur,
    a_savoir: Array.isArray(l.a_savoir) ? l.a_savoir : [],
    pages_lues: Array.isArray(l.pages_lues) ? l.pages_lues.filter((n): n is number => typeof n === "number") : [],
    pages_total: typeof l.pages_total === "number" ? l.pages_total : undefined,
    reserve: txt(l.reserve) || undefined,
  };
}

export type CasesPlu = { zone: string; type: string; hauteur: string; emprise: string };

/**
 * Ce que la lecture propose pour les quatre cases, et où elle s'écarte de ce
 * que porte déjà la fiche. Une case que la lecture ne sait pas remplir reste
 * telle qu'elle est.
 */
export function propositions(l: LecturePlu, actuel: CasesPlu): { cases: CasesPlu; ecarts: { case: keyof CasesPlu; fiche: string; lu: string }[] } {
  const fr = (n: number | undefined) => (n === undefined ? "" : String(n).replace(".", ","));
  const lu: CasesPlu = {
    zone: l.zone.zone,
    type: l.zone.type ?? "",
    hauteur: fr(l.hauteur?.valeur),
    emprise: fr(l.emprise?.valeur),
  };
  /* « 19,0 » et « 19 » disent la même chose : on compare les nombres. */
  const norme = (s: string) => {
    const t = s.trim().replace(",", ".").toLowerCase();
    return t !== "" && Number.isFinite(Number(t)) ? String(Number(t)) : t;
  };
  const cases = { ...actuel };
  const ecarts: { case: keyof CasesPlu; fiche: string; lu: string }[] = [];
  for (const k of ["zone", "type", "hauteur", "emprise"] as const) {
    if (!lu[k]) continue;
    /* Le type de zone des fiches est plus fin que le code (« Centre ancien »,
       « Zone d'activités ») : on ne l'écrase pas, on ne remplit qu'une case vide. */
    if (k === "type" && actuel.type.trim()) continue;
    if (norme(actuel[k]) === norme(lu[k])) continue;
    if (actuel[k].trim()) ecarts.push({ case: k, fiche: actuel[k], lu: lu[k] });
    cases[k] = lu[k];
  }
  return { cases, ecarts };
}
