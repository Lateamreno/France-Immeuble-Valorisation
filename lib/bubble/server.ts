// Couche de lecture Bubble Data API pour le dashboard (server-only).
//
// Logique VALIDÉE contre les captures (voir docs/HANDOFF.md) :
// - Colonnes du dashboard = immeubles NON archivés, groupés par préfixe de
//   `Statut` (1 FORMULAIRE, 2 Estimation, 3 A transformer, 4 OK pour vendre,
//   5 Commercialisé (A/B), 6 Commercialisé (all), 7 Sous offre,
//   8 Compromis programmé, 9 Sous compromis, 10 Acte programmé, 11 VENDU),
//   filtrés par AGENT — vérifié : agent « Romain » ⇒ 5/15/16, 7/0/13, 3/0/0
//   comme sur les captures.
// - Carte « en attente » (bordure rouge) = standby_Statut ≠ 'Traité' ; la frise
//   date → motif → date vient du dernier `suivi` (date_start → date_relance,
//   motif = Motif_standby).
// - k€ HT des cartes VENTES = honos_ht de l'offre liée (18+17+10 = 45 ✓).

import "server-only";
import { unstable_cache } from "next/cache";
import { estFacadeRue } from "@/lib/bo/facade";
import { correspond } from "@/lib/bo/matching";
import { cache } from "react";

const TOKEN = process.env.BUBBLE_API_TOKEN;
const ROOT = (process.env.BUBBLE_APP_URL || "https://vente.france-immeuble.fr")
  .trim()
  .split(/\s+/)[0]
  .replace(/\/+$/, "")
  .replace(/\/api\/1\.1\/obj$/, "")
  .replace(/\/version-test$/, "");

const REVALIDATE = 120; // secondes de cache par requête

export type Agent = {
  id: string; slug: string; name: string; initials: string; color?: string;
  /** Le portable, mis en forme comme dans le BO (« 06.30.76.83.81 ») : c'est
   *  lui que signe l'agent au bas d'un mail (retour #280). */
  tel?: string;
  /** Un agent parti garde ses initiales et sa couleur : les fiches qu'il a
   *  suivies lui appartiennent toujours. Il ne doit simplement plus être
   *  proposé quand on choisit à qui attribuer quelque chose. */
  actif: boolean;
};

/** Agents chargés depuis la table réelle `agentfi` du BO (initiales, couleur). */
export async function getAgents(): Promise<Agent[]> {
  const rows = await fetchAll("agentfi", undefined, 50).catch(() => []);
  const slugify = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  /* TOUS les agents, y compris ceux qui ont quitté la maison. Les filtrer ici
     faisait retomber sur « FI » toutes les fiches suivies par un ancien —
     les questions du BO, par exemple, appartiennent presque toutes à François
     DUGAST, parti depuis. Le tri actif/inactif se fait à l'affichage des
     listes de choix, pas à la lecture du référentiel. */
  return rows
    .map((a) => ({
      id: String(a._id),
      slug: slugify(String(a["prénom"] ?? a.nom ?? a._id)),
      name: `${a["prénom"] ?? ""} ${a.nom ?? ""}`.trim(),
      initials: String(a.initiales ?? "FI"),
      tel: typeof a["portable (TXT)"] === "string" ? (a["portable (TXT)"] as string)
        : typeof a.portable === "string" ? (a.portable as string) : undefined,
      color: typeof a.color_main === "string" ? (a.color_main as string) : undefined,
      actif: a.activ !== false,
    }))
    .sort((x, y) => Number(y.actif) - Number(x.actif) || x.name.localeCompare(y.name));
}

/* Le mémo par horodatage laissait passer les appels CONCURRENTS : deux parties
   de la même page demandaient les agents en même temps, aucune n'avait encore
   rempli le mémo, et la table partait deux fois. `cache()` de React réunit les
   appels d'une même requête sur une seule promesse. */
const agents = cache(async (): Promise<Agent[]> => getAgents());

type Constraint = { key: string; constraint_type: string; value: unknown };

/* ---------- Source de données : Supabase (miroir bo_*) ou Bubble ----------
   Les 25 data types Bubble sont mirrorés dans le projet Supabase DÉDIÉ
   france-immeuble-bo (tables bo_<type>, RLS sans policy → service_role only).
   Si SUPABASE_SERVICE_ROLE_KEY est présente, lectures via Supabase ; sinon
   repli Data API Bubble. Synchro : Edge Function `bubble-sync`. */

const SB_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_SB = !!SB_KEY;

const SORT_COL: Record<string, string> = {
  "Created Date": "bubble_created",
  "Modified Date": "bubble_modified",
};

function sbParams(constraints?: Constraint[]) {
  const p = new URLSearchParams();
  p.set("select", "data");
  for (const c of constraints ?? []) {
    if (c.key === "_id" && c.constraint_type === "equals") p.append("id", `eq.${c.value}`);
    else if (c.key === "_id" && c.constraint_type === "in")
      p.append("id", `in.(${(c.value as string[]).map((v) => `"${v}"`).join(",")})`);
    else if (c.constraint_type === "greater than" && SORT_COL[c.key])
      p.append(SORT_COL[c.key], `gt.${c.value}`);
    else if (c.constraint_type === "in" && Array.isArray(c.value))
      p.append(
        `data->>${/^\w+$/.test(c.key) ? c.key : `"${c.key}"`}`,
        `in.(${(c.value as string[]).map((v) => `"${v}"`).join(",")})`,
      );
    else if (c.constraint_type === "equals")
      // Les clés Bubble exotiques (espaces, « 0 - IMMEUBLE ») doivent être citées côté PostgREST.
      p.append(`data->>${/^\w+$/.test(c.key) ? c.key : `"${c.key}"`}`, `eq.${c.value}`);
    else if (c.constraint_type === "contains")
      p.append("data", `cs.${JSON.stringify({ [c.key]: [c.value] })}`);
    // « la clé est renseignée » : évite de ramener une table entière pour n'en
    // garder que les quelques lignes qui portent un champ.
    else if (c.constraint_type === "is not empty")
      p.append(`data->>${/^\w+$/.test(c.key) ? c.key : `"${c.key}"`}`, "not.is.null");
  }
  return p;
}

/**
 * Une page du miroir, mise en cache.
 *
 * Le back-office lit beaucoup et écrit peu : quatre mégaoctets pour afficher
 * un dashboard, redemandés intégralement à chaque navigation. On garde donc
 * chaque page en cache, étiquetée du nom de sa table — et toute écriture
 * invalide l'étiquette de la table qu'elle touche (voir `rpc` dans
 * lib/bo/actions.ts). Le délai de secours couvre le seul cas que nos
 * étiquettes ignorent : une modification faite côté Bubble.
 */
const lirePage = (type: string, qs: string, avecTotal?: boolean) =>
  unstable_cache(
    async () => {
      const t0 = performance.now();
      /* Le total n'est demandé que sur la PREMIÈRE page : `fetchAll` en déduit
         le nombre de pages, les suivantes n'en ont plus besoin. Un
         `count=exact` fait recompter la table entière à chaque appel. Les
         écrans paginés, eux, l'exigent sur toutes les pages — ils affichent le
         nombre de résultats — d'où le drapeau. */
      const compter = avecTotal ?? /(^|&)offset=0(&|$)/.test(qs);
      const res = await fetch(`${SB_URL}/rest/v1/bo_${type}?${qs}`, {
        headers: {
          apikey: SB_KEY!,
          Authorization: `Bearer ${SB_KEY!}`,
          ...(compter ? { Prefer: "count=exact" } : {}),
        },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Supabase ${res.status} sur bo_${type}`);
      const brut = await res.text();
      if (process.env.MESURE_REQUETES) {
        console.log(`[req] ${String(Math.round(performance.now() - t0)).padStart(5)} ms  ${String(Math.round(brut.length / 1024)).padStart(6)} Ko  bo_${type}  ${qs}`.slice(0, 190));
      }
      const rows = JSON.parse(brut) as { data: Record<string, unknown> }[];
      const range = res.headers.get("content-range"); // ex. "0-99/1824"
      return {
        lignes: rows.map((r) => r.data),
        total: range ? parseInt(range.split("/")[1], 10) || rows.length : rows.length,
      };
    },
    ["bo", type, qs, String(avecTotal ?? "")],
    { tags: [`bo_${type}`], revalidate: 60 },
  )();

async function sbq(
  type: string,
  opts: { constraints?: Constraint[]; limit?: number; cursor?: number; sort?: string; desc?: boolean } = {},
): Promise<{ results: Record<string, unknown>[]; remaining: number }> {
  const p = sbParams(opts.constraints);
  // Supabase n'a pas la limite de 100 de la Data API Bubble : on pagine large
  // pour éviter des dizaines d'allers-retours sur les grosses tables.
  p.set("limit", String(opts.limit ?? 1000));
  p.set("offset", String(opts.cursor ?? 0));
  if (opts.sort) p.set("order", `${SORT_COL[opts.sort] ?? "bubble_modified"}.${opts.desc ? "desc" : "asc"}`);
  const { lignes, total } = await lirePage(type, p.toString());
  const cursor = opts.cursor ?? 0;
  return { results: lignes, remaining: Math.max(0, total - cursor - lignes.length) };
}

async function bq(
  type: string,
  opts: { constraints?: Constraint[]; limit?: number; cursor?: number; sort?: string; desc?: boolean } = {},
): Promise<{ results: Record<string, unknown>[]; remaining: number }> {
  if (USE_SB) return sbq(type, opts);
  const p = new URLSearchParams({
    limit: String(opts.limit ?? 100),
    cursor: String(opts.cursor ?? 0),
  });
  if (opts.constraints) p.set("constraints", JSON.stringify(opts.constraints));
  if (opts.sort) {
    p.set("sort_field", opts.sort);
    p.set("descending", String(opts.desc ?? false));
  }
  const res = await fetch(`${ROOT}/api/1.1/obj/${type}?${p}`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`Bubble ${res.status} sur ${type}`);
  const j = await res.json();
  return { results: j.response?.results ?? [], remaining: j.response?.remaining ?? 0 };
}

/**
 * Toutes les lignes d'une table, paginées.
 *
 * La première page dit combien il en reste : les suivantes partent donc
 * ENSEMBLE, au lieu de s'attendre l'une l'autre. Sur les suivis — quatre pages
 * de mille — la boucle séquentielle coûtait à elle seule près de trois
 * secondes sur le dashboard, alors que les quatre requêtes ne se dépendent
 * pas.
 */
async function fetchAll(
  type: string,
  constraints?: Constraint[],
  max = 2000,
  sort?: { field: string; desc?: boolean },
) {
  /* La taille de page suit le plafond demandé : réclamer mille lignes pour en
     garder trois cents, c'est payer sept fois le transfert de la table des
     estimations pour rien.

     Elle est aussi bornée à 250 lignes, et ce n'est pas une prudence gratuite :
     une entrée de cache trop grosse n'est PAS mise en cache — silencieusement.
     Les objectifs sortaient 2,9 Mo d'un coup et repayaient donc le plein tarif
     à chaque affichage. Découpées, les pages repassent sous la limite, et
     comme elles partent ensemble le surcoût est nul. */
  const taille = Math.min(250, Math.max(1, max));
  const un = (cursor: number) =>
    bq(type, { constraints, cursor, limit: taille, sort: sort?.field, desc: sort?.desc });
  const p1 = await un(0);
  const rows = [...p1.results];
  if (p1.remaining <= 0 || rows.length >= max || rows.length === 0) return rows.slice(0, max);

  const pas = p1.results.length;
  const reste = Math.min(p1.remaining, max - rows.length);
  const pages = Math.ceil(reste / pas);
  const suite = await Promise.all(
    Array.from({ length: pages }, (_, i) => un(rows.length + i * pas)),
  );
  for (const p of suite) rows.push(...p.results);
  return rows.slice(0, max);
}

/**
 * Traite une liste d'identifiants par lots — tous les lots ENSEMBLE.
 *
 * PostgREST plafonne la longueur d'un `in.(…)`, d'où le découpage. Mais les
 * lots ne se dépendent pas : les enchaîner ajoutait un aller-retour complet
 * par centaine d'identifiants, sur des écrans qui en manipulent des milliers.
 */
async function parLots<T>(
  ids: unknown[],
  taille: number,
  fn: (lot: string[]) => Promise<T[]>,
): Promise<T[]> {
  const uniq = [...new Set(ids.map((v) => String(v ?? "")))].filter(Boolean);
  if (!uniq.length) return [];
  const lots: string[][] = [];
  for (let i = 0; i < uniq.length; i += taille) lots.push(uniq.slice(i, i + taille));
  return (await Promise.all(lots.map(fn))).flat();
}

/** Les lignes d'une table dont l'identifiant est dans la liste. */
const parIds = (type: string, ids: unknown[], taille = 100) =>
  parLots(ids, taille, (lot) =>
    fetchAll(type, [{ key: "_id", constraint_type: "in", value: lot }], taille).catch(() => []),
  );

/** Les lignes d'une table dont un champ pointe vers l'un des identifiants. */
const parChamp = (type: string, champ: string, ids: unknown[], taille = 100) =>
  parLots(ids, taille, (lot) =>
    fetchAll(type, [{ key: champ, constraint_type: "in", value: lot }], taille).catch(() => []),
  );

async function count(type: string, constraints?: Constraint[]) {
  const p = await bq(type, { constraints, limit: 1 });
  return p.remaining + p.results.length;
}

/**
 * La carte de visite d'un contact (retour #205).
 *
 * MAV : « la petite vignette sur le nom du client, cliquable, qui affiche ses
 * coordonnées, son nombre d'immeubles et de recherches, et quand on clique sur
 * la fiche — sauf sur Appeler ou E-mail — ça renvoie à la fiche contact. Ça
 * c'est quelque chose que tu dois implémenter à plusieurs endroits. »
 *
 * D'où un chargeur volontairement maigre : une seule lecture par lot
 * d'identifiants, et rien de plus que ce que la vignette affiche. Les nombres
 * d'immeubles et de recherches sont portés par la fiche contact elle-même
 * (`IMMEUBLES`, `RECHERCHEs`) — aucun comptage à faire.
 */
export type Vignette = {
  id: string;
  nom: string;
  /** « Particulier », « Marchand de biens »… tel que la fiche le porte. */
  qualite?: string;
  tel?: string;
  email?: string;
  immeubles: number;
  recherches: number;
};

const longueur = (v: unknown) => (Array.isArray(v) ? v.length : 0);

export async function getVignettes(ids: string[]): Promise<Record<string, Vignette>> {
  const uniques = [...new Set(ids.filter(Boolean))];
  if (uniques.length === 0) return {};
  const rows = await parIds("contact", uniques, 50).catch(() => [] as Record<string, unknown>[]);
  const out: Record<string, Vignette> = {};
  for (const c of rows) {
    const nom = [c["Civilité"], c["prénom"], c.nom].filter(Boolean).join(" ").trim();
    const types = Array.isArray(c.Types) ? (c.Types as unknown[]).map(String) : [];
    out[String(c._id)] = {
      id: String(c._id),
      nom: nom || String(c.entreprise_nom ?? "") || String(c.email ?? "Contact"),
      qualite: types[0] ?? (c.vendeur === true ? "Vendeur" : undefined),
      tel: (c.portable_formatted ?? c.portable) ? String(c.portable_formatted ?? c.portable) : undefined,
      email: c.email ? String(c.email) : undefined,
      immeubles: longueur(c.IMMEUBLES),
      recherches: longueur(c.RECHERCHEs),
    };
  }
  return out;
}

/* ---------- helpers de présentation ---------- */

import { dmy, euros, keur } from "@/lib/format";
import { rangNote } from "@/lib/referentiels";
import { assemblerVivier, type Vivier } from "@/lib/mails/serveur";

function contactLabel(c?: Record<string, unknown>) {
  if (!c) return "";
  const p = typeof c["prénom"] === "string" ? (c["prénom"] as string) : "";
  const n = typeof c.nom === "string" ? (c.nom as string) : "";
  return `${p ? p[0].toUpperCase() + ". " : ""}${n.toUpperCase()}`.trim();
}

/* ---------- assemblage du dashboard ---------- */

import type { KBloc, KCard, KCol } from "@/lib/data/dashboard";

/**
 * L'étape du bien dans le pipeline, de 1 (formulaire reçu) à 11 (vendu).
 *
 * Le statut enregistré fait foi, à une exception près : un bien qui porte une
 * estimation est au moins « À transformer » (3), même si personne n'a pensé à
 * faire avancer sa fiche. MAV : « quand un bien a été estimé il doit passer
 * dans la troisième colonne prospect. » Les estimations faites avant que
 * l'avancement soit automatique se rangent donc bien, sans réécrire la base.
 */
const statutOf = (im: Record<string, unknown>) => {
  const n = parseInt(String(im.Statut ?? "").split(" ")[0], 10) || 0;
  const estime = typeof im.prix_hai_estim === "number"
    || !!im.date_last_est
    || (Array.isArray(im.ESTIMATIONs) && (im.ESTIMATIONs as unknown[]).length > 0);
  return estime && n > 0 && n < 3 ? 3 : n;
};

export type DashboardLive = {
  blocs: KBloc[];
  agentSlug: string;
  agentName: string;
  enCours: number;
  enAttente: number;
};

/** Un bien est « en attente » tant que la date de relance n'est pas atteinte :
 *  passé cette date le BO le réactive d'office et il revient dans le flux. */
function attenteEnCours(im: Record<string, unknown>, suivi?: Record<string, unknown>) {
  if (!im.standby_Statut || im.standby_Statut === "Traité") return false;
  const relance = typeof suivi?.date_relance === "string" ? new Date(suivi.date_relance as string) : null;
  return relance ? relance.getTime() > Date.now() : false;
}

export async function getDashboardLive(
  agentSlug: string,
  vue: "cours" | "attente" = "cours",
): Promise<DashboardLive | null> {
  if (!TOKEN && !USE_SB) return null;
  const all = await agents();
  const agent = all.find((a) => a.slug === agentSlug) ?? all[0];
  if (!agent) return null;
  await loadInitials();

  // Immeubles actifs (188 ≈ 2 requêtes) + suivis récents + offres + mandats.
  const [imsAll, suivis, offres, mandats] = await Promise.all([
    fetchAll("immeuble", [{ key: "archived", constraint_type: "equals", value: "false" }]),
    // Tous les suivis : en n'en chargeant que 600, les immeubles au suivi
    // ancien perdaient leur historique sur le dashboard (retour MAV #23).
    fetchAll("suivi", undefined, 20000, { field: "Created Date", desc: true }).catch(() => []),
    fetchAll("offre"),
    fetchAll("mandat"),
  ]);

  const imsAgent = imsAll
    .filter((i) => i.AGENT === agent.id)
    .sort((a, b) => String(b["Modified Date"]).localeCompare(String(a["Modified Date"])));

  // Dernier suivi par immeuble + historique complet (les récents d'abord).
  const suiviByIm = new Map<string, Record<string, unknown>>();
  const suivisParIm = new Map<string, Record<string, unknown>[]>();
  for (const s of [...suivis].sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"])))) {
    for (const id of (s.IMMEUBLEs as string[] | undefined) ?? []) {
      if (!suiviByIm.has(id)) suiviByIm.set(id, s);
      suivisParIm.set(id, [...(suivisParIm.get(id) ?? []), s]);
    }
  }

  // Retour MAV #30 : les biens dont la date de relance n'est pas atteinte
  // vivent dans la vue « En attente » ; les autres restent dans le flux.
  const enAttenteIds = new Set(
    imsAgent.filter((i) => attenteEnCours(i, suiviByIm.get(i._id as string))).map((i) => i._id as string),
  );
  const ims = imsAgent.filter((i) => enAttenteIds.has(i._id as string) === (vue === "attente"));

  // Offre la plus récente par immeuble (pour les k€ HT des VENTES).
  const offreByIm = new Map<string, Record<string, unknown>>();
  for (const o of [...offres].sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"])))) {
    for (const id of (o.IMMEUBLEs as string[] | undefined) ?? []) {
      if (!offreByIm.has(id)) offreByIm.set(id, o);
    }
  }

  // Dernier mandat par immeuble (statut « Mandat à signer / expiré »).
  const mandatByIm = new Map<string, Record<string, unknown>>();
  for (const m of [...mandats].sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"])))) {
    for (const id of (m.IMMEUBLEs as string[] | undefined) ?? []) {
      if (!mandatByIm.has(id)) mandatByIm.set(id, m);
    }
  }

  // Contacts propriétaires des immeubles affichés.
  const ownerIds = [...new Set(ims.map((i) => i.PROPRIETAIRE).filter(Boolean))] as string[];
  const contacts = new Map<string, Record<string, unknown>>();
  (await parIds("contact", ownerIds, 50)).forEach((c) => contacts.set(String(c._id), c));

  // Compteurs propositions / visites / offres par immeuble commercialisé (statuts 5-7).
  const commIds = ims.filter((i) => [5, 6, 7].includes(statutOf(i))).map((i) => i._id as string);
  const countsByIm = new Map<string, { prop: number; vis: number; off: number }>();
  commIds.forEach((id) => countsByIm.set(id, { prop: 0, vis: 0, off: 0 }));
  if (USE_SB && commIds.length > 0) {
    // Groupé : 3 requêtes (liste des rattachements) puis comptage local.
    const idList = commIds.map((v) => `"${v}"`).join(",");
    const grab = async (table: string, col: string) => {
      const res = await fetch(
        `${SB_URL}/rest/v1/${table}?select=data->>${col}&data->>${col}=in.(${idList})&limit=100000`,
        { headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY!}` }, cache: "no-store" },
      );
      if (!res.ok) return [] as string[];
      return ((await res.json()) as Record<string, string>[]).map((r) => Object.values(r)[0]);
    };
    const [props, viss] = await Promise.all([
      grab("bo_proposition", "IMMEUBLE"),
      grab("bo_visite", "IMMEUBLE"),
    ]);
    props.forEach((id) => { const c = countsByIm.get(id); if (c) c.prop++; });
    viss.forEach((id) => { const c = countsByIm.get(id); if (c) c.vis++; });
    // offres : IMMEUBLEs est une liste → réutilise offreByIm complet
    for (const o of offres) {
      for (const id of (o.IMMEUBLEs as string[] | undefined) ?? []) {
        const c = countsByIm.get(id);
        if (c) c.off++;
      }
    }
  } else if (commIds.length > 0) {
    const CONC = 6;
    for (let i = 0; i < commIds.length; i += CONC) {
      await Promise.all(
        commIds.slice(i, i + CONC).map(async (id) => {
          const [prop, vis, off] = await Promise.all([
            count("proposition", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }]).catch(() => 0),
            count("visite", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }]).catch(() => 0),
            count("offre", [{ key: "IMMEUBLEs", constraint_type: "contains", value: id }]).catch(() => 0),
          ]);
          countsByIm.set(id, { prop, vis, off });
        }),
      );
    }
  }

  const mkCard = (im: Record<string, unknown>): KCard => {
    const id = im._id as string;
    const st = statutOf(im);
    const suivi = suiviByIm.get(id);
    const enAttente = im.standby_Statut !== "Traité" && !!im.standby_Statut;
    const ville = `${im.adresse_ville ?? ""} (${im.adresse_dpt ?? ""})`;
    const adresse = [im.adresse_numero_rue, im.adresse_rue].filter(Boolean).join(" ");
    const photo = typeof im.photo_main_compressed === "string" && im.photo_main_compressed.length > 0;
    const mandat = mandatByIm.get(id);
    const offre = offreByIm.get(id);

    const card: KCard = {
      id,
      ville,
      contact: contactLabel(contacts.get(im.PROPRIETAIRE as string)),
      adresse,
      photo,
      /* #154 — « la photo de Bordeaux ne s'affiche pas dans les miniatures du
         dashboard alors qu'elle s'affiche dans les photos du bien ». L'URL
         était fabriquée à la main ici, et ne connaissait que les photos
         Bubble : une photo déposée depuis le nouveau BO est rangée dans notre
         coffre et s'écrit « storage:… », que `?u=` ne sait pas lire. On passe
         par le même aiguillage que partout ailleurs. */
      photoUrl: photo ? photoProxy(im.photo_main_compressed) : undefined,
      // La façade en vue de rue n'est plus chargée depuis Google à
      // l'affichage : elle a été capturée une fois et rangée dans le coffre,
      // donc elle arrive par `photoUrl` comme n'importe quelle photo. Le
      // drapeau sert seulement à la signaler « à remplacer ».
      facadeRue: estFacadeRue(im.photo_main_compressed),
      rv: true,
      rvText: agent.initials,
      history: !!suivi,
      statutNum: statutOf(im),
      contactId: typeof im.PROPRIETAIRE === "string" ? (im.PROPRIETAIRE as string) : undefined,
      contactInfo: (() => {
        const p = contacts.get(im.PROPRIETAIRE as string);
        if (!p) return undefined;
        const liste = (k: string) => (Array.isArray(p[k]) ? (p[k] as unknown[]).length : 0);
        return {
          nom: `${p["prénom"] ?? ""} ${p.nom ?? ""}`.trim(),
          type: Array.isArray(p.Types) ? String(p.Types[0] ?? "") : undefined,
          tel: typeof p.portable_formatted === "string" ? p.portable_formatted
            : typeof p.portable === "string" ? p.portable
            : typeof p.fixe_formatted === "string" ? p.fixe_formatted : undefined,
          email: typeof p.email === "string" ? p.email : undefined,
          nbImmeubles: liste("IMMEUBLES"),
          nbRecherches: liste("RECHERCHEs"),
        };
      })(),
      objet: `${im.adresse_ville ?? ""} - ${[im.adresse_numero_rue, im.adresse_rue].filter(Boolean).join(" ")}`,
      historique: (suivisParIm.get(id) ?? []).slice(0, 6).map((s2) => ({
        date: dmy(s2.date_start ?? s2["Created Date"]) ?? "",
        motif: String(s2.Motif_standby ?? s2.Type ?? ""),
        note: typeof s2.notes === "string" ? (s2.notes as string).slice(0, 160) : "",
      })),
    };

    if (enAttente && suivi) {
      const debut = new Date(String(suivi.date_start ?? suivi["Created Date"] ?? ""));
      const relance = typeof suivi.date_relance === "string" ? new Date(suivi.date_relance as string) : null;
      const total = relance ? relance.getTime() - debut.getTime() : 0;
      card.wait = {
        from: dmy(suivi.date_start ?? suivi["Created Date"]) ?? "",
        to: dmy(suivi.date_relance) ?? "",
        motif: String(suivi.Motif_standby ?? im.standby_Statut ?? ""),
        // Dans le BO la frise passe au rouge quand la date de relance est dépassée.
        late: relance ? relance.getTime() <= Date.now() : true,
        pct: total > 0
          ? Math.min(100, Math.max(0, Math.round(((Date.now() - debut.getTime()) / total) * 100)))
          : undefined,
      };
      card.prix = euros(im.prix_hai);
      card.action = { label: "Réactiver", kind: "green" };
      return card;
    }

    // Chip date + note = dernier événement connu.
    if (suivi && typeof suivi.notes === "string" && suivi.notes) {
      card.date = dmy(suivi.date_start ?? suivi["Created Date"]);
      card.note = (suivi.notes as string).split("\n")[0];
      card.noteComplete = suivi.notes as string;
      card.chevron = (suivi.notes as string).length > 40;
    } else if (st === 1) {
      card.date = dmy(im.date_contact_form ?? im["Created Date"]);
      card.note = "Formulaire";
      card.chevron = true;
    } else if (im.date_last_est) {
      card.date = dmy(im.date_last_est);
      card.estimation = true;
    }

    // Statut mandat (cartes commercialisation).
    if ([4, 5, 6].includes(st) && mandat) {
      const ms = String(mandat.Statut ?? "");
      if (ms === "Expiré") card.statusMandat = "Mandat expiré";
      else if (ms === "Attente signature" || ms === "A signer") card.statusMandat = "Mandat à signer";
      else if (ms === "A rédiger") card.statusMandat = "Mandat à rédiger";
    }

    if (st >= 3 && st <= 11) card.prix = euros(im.prix_hai);

    if ([5, 6, 7].includes(st)) card.counts = countsByIm.get(id) ?? { prop: 0, vis: 0, off: 0 };

    if (st >= 7 && st <= 10) {
      card.fee = keur(offre?.honos_ht);
      card.prix = euros(offre?.prix_hai ?? im.prix_hai);
    }

    if (st === 1) card.action = { label: "Contacté", next: 2 };
    else if (st === 2) card.action = { label: "Estimer", next: 3 };
    else if (st === 3) card.action = { label: "OK pour vendre", next: 4 };
    else if (st === 7 || st === 8) card.action = { label: "Programmer le compromis", next: 9 };

    return card;
  };

  const byStatut = (sts: number[]) => ims.filter((i) => sts.includes(statutOf(i)));
  const cardsOf = (sts: number[]) => byStatut(sts).map(mkCard);

  const mkCol = (key: string, titre: string, icon: KCol["icon"], sts: number[], fee?: number): KCol => {
    const cards = cardsOf(sts);
    return {
      key,
      titre,
      icon,
      count: cards.length,
      fee: fee !== undefined && fee > 0 ? `${Math.round(fee / 1000)} k€ HT` : undefined,
      cards,
    };
  };

  const honosOf = (sts: number[]) =>
    byStatut(sts).reduce((s, im) => {
      const o = offreByIm.get(im._id as string);
      return s + (typeof o?.honos_ht === "number" ? (o.honos_ht as number) : 0);
    }, 0);

  const honosPipeline = honosOf([7, 8, 9, 10]);
  const honosVendus = honosOf([11]);
  const nVentes = byStatut([7, 8, 9, 10, 11]).length;

  const blocs: KBloc[] = [
    {
      key: "prospects",
      titre: "PROSPECTS",
      icon: "in",
      nred: byStatut([1, 2, 3]).filter((i) => i.standby_Statut === "En attente").length,
      nsq: byStatut([1, 2, 3]).length,
      openDefault: true,
      cols: [
        mkCol("formulaires", "Formulaires a traiter", "form", [1]),
        mkCol("a-estimer", "Immeubles a estimer", "building", [2]),
        mkCol("a-transformer", "A transformer", "flame", [3]),
      ],
    },
    {
      key: "commercialisations",
      titre: "COMMERCIALISATIONS",
      icon: "megaphone",
      nred: byStatut([4, 5, 6]).filter((i) => i.standby_Statut === "En attente").length,
      nsq: byStatut([4, 5, 6]).length,
      openDefault: false,
      cols: [
        mkCol("preparation", "Preparation mandat et dossier", "pdf", [4]),
        mkCol("clients-ab", "Commercialises aux clients A et B", "spread", [5]),
        mkCol("tous-clients", "Commercialises a tous les clients", "globe", [6]),
      ],
    },
    {
      key: "ventes",
      titre: "VENTES",
      icon: "flag",
      nred: 0,
      nsq: nVentes,
      ventes: {
        left: `${Math.round(honosVendus / 1000)} k€ HT`,
        right: `${Math.round(honosPipeline / 1000)} k€ HT`,
        pctGreen: honosPipeline + honosVendus > 0 ? Math.max(1.5, (100 * honosVendus) / (honosVendus + honosPipeline)) : 1.5,
      },
      openDefault: false,
      cols: [
        mkCol("offres-acceptees", "Offres acceptees", "tool", [7, 8], honosOf([7, 8])),
        mkCol("compromis", "Compromis signes", "bank", [9, 10], honosOf([9, 10])),
        mkCol("vendus", `Vendus en ${new Date().getFullYear()}`, "flag", [11]),
      ],
    },
  ];

  return {
    blocs,
    agentSlug,
    agentName: agent.name,
    // Retour #58 : le badge « En cours » ne compte que les vignettes rouges —
    // les biens mis en attente dont l'échéance est passée sans nouveau suivi.
    // Le reste du flux n'est pas une alerte, il n'a rien à faire au compteur.
    enCours: imsAgent.filter(
      (i) => String(i.standby_Statut ?? "Traité") !== "Traité" && !enAttenteIds.has(i._id as string),
    ).length,
    enAttente: enAttenteIds.size,
  };
}

/* ===================== Fiche Bien ===================== */

/** Une chaîne non vide, ou rien. Utilitaire des facettes de liste. */
const S2 = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const rangLot = (l: Record<string, unknown>) =>
  typeof l.ordre === "number" ? (l.ordre as number) : Number(l.numero ?? 0);

const photoProxy = (u?: unknown) =>
  typeof u === "string" && u
    ? u.startsWith("storage:")
      ? `/api/photo?s=${encodeURIComponent(u.slice("storage:".length))}`
      : `/api/photo?u=${encodeURIComponent(u.replace(/^\/\//, "https://"))}`
    : undefined;

export type BienData = {
  im: Record<string, unknown>;
  ville: string;
  adresse: string;
  photoUrl?: string;
  /** La photo principale est une capture Street View, à remplacer. */
  facadeRue?: boolean;
  prix?: string;
  statut: string;
  standby?: string;
  agentInitials: string;
  /** Nom complet et portable de l'agent qui suit la fiche : la signature du
   *  mail d'estimation les porte plutôt que des initiales (retour #280). */
  agentNom?: string;
  agentTel?: string;
  proprietaire?: Record<string, unknown>;
  autresBiens: { id: string; label: string; statut: string }[];
  suivis: {
    date?: string;
    canal?: string;
    type?: string;
    notes?: string;
    motif?: string;
    relance?: string;
  }[];
  lots: Record<string, unknown>[];
  parcelles: Record<string, unknown>[];
  /** Historique des prix (bo_prix), le plus récent en tête. */
  prixHisto: Record<string, unknown>[];
  /** Typologies de lot ajoutées à la main par les agents (retour #22). */
  typologies: { destination: string; label: string }[];
  /** Adresse géocodée (type Bubble « adresse ») : geo.lat / geo.lng / maps_url. */
  adr: Record<string, unknown> | null;
  secteur: Record<string, unknown> | null;
  baux: Record<string, unknown>[];
  locataires: Record<string, unknown>[];
  charges: Record<string, unknown>[];
  composants: Record<string, unknown>[];
  travaux: Record<string, unknown>[];
  photos: {
    id: string;
    /** Vignette (600 px) pour les grilles. */
    url?: string;
    /** Plein format (2200 px) pour l'agrandissement et le dossier. */
    urlPleine?: string;
    type?: string;
    /** Lot associé, quand `type` vaut « Lot ». */
    lotId?: string;
    ordre: number;
    /** Part dans le dossier de vente. */
    dossier: boolean;
    annonce: boolean;
    estimation: boolean;
  }[];
  documents: Record<string, unknown>[];
  estimations: Record<string, unknown>[];
  mandats: Record<string, unknown>[];
  dossiers: Record<string, unknown>[];
  propositions: { total: number; rows: Record<string, unknown>[] };
  visites: Record<string, unknown>[];
  offres: Record<string, unknown>[];
};

export async function getBien(id: string): Promise<BienData | null> {
  if (!TOKEN && !USE_SB) return null;

  const one = await bq("immeuble", { constraints: [{ key: "_id", constraint_type: "equals", value: id }], limit: 1 });
  const im = one.results[0];
  if (!im) return null;

  const chargeIds = Array.isArray(im.CHARGEs) ? (im.CHARGEs as string[]) : [];
  const parcelleIds = Array.isArray(im.PARCELLEs) ? (im.PARCELLEs as string[]) : [];
  const [suivisR, lots, baux, locataires, chargesById, chargesByIm, parcelles, secteur, adresses, typologies, composants, travaux, photos, documents, estimations, mandats, dossiers, propositions, visites, offres, prixHisto] =
    await Promise.all([
      fetchAll("suivi", [{ key: "IMMEUBLEs", constraint_type: "contains", value: id }], 100).catch(() => []),
      fetchAll("lot", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 250),
      fetchAll("bail", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 100).catch(() => []),
      fetchAll("locataire", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 100).catch(() => []),
      chargeIds.length
        ? fetchAll("charge", [{ key: "_id", constraint_type: "in", value: chargeIds }], 100).catch(() => [])
        : Promise.resolve([] as Record<string, unknown>[]),
      fetchAll("charge", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 100).catch(() => []),
      parcelleIds.length
        ? fetchAll("parcelle", [{ key: "_id", constraint_type: "in", value: parcelleIds }], 50).catch(() => [])
        : Promise.resolve([] as Record<string, unknown>[]),
      getPrixSecteur(id),
      fetchAll("adresse", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 2).catch(() => []),
      getTypologies(),
      fetchAll("composant", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 50).catch(() => []),
      fetchAll("travaux", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 50).catch(() => []),
      fetchAll("photo", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 300).catch(() => []),
      fetchAll("app_document", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 60).catch(() => []),
      fetchAll("estimation", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 50),
      fetchAll("mandat", [{ key: "IMMEUBLEs", constraint_type: "contains", value: id }], 50),
      fetchAll("dossier", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 50).catch(() => []),
      bq("proposition", { constraints: [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], limit: 10 }),
      fetchAll("visite", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 50),
      fetchAll("offre", [{ key: "IMMEUBLEs", constraint_type: "contains", value: id }], 50),
      // Historique des prix : chaque changement laisse une ligne (#93).
      fetchAll("prix", [{ key: "in_IMMEUBLE", constraint_type: "equals", value: id }], 60).catch(() => []),
    ]);

  const proprietaire = im.PROPRIETAIRE
    ? (await bq("contact", { constraints: [{ key: "_id", constraint_type: "equals", value: im.PROPRIETAIRE }], limit: 1 })).results[0]
    : undefined;

  const autres = proprietaire
    ? await fetchAll("immeuble", [
        { key: "PROPRIETAIRE", constraint_type: "equals", value: im.PROPRIETAIRE },
      ], 20).catch(() => [])
    : [];

  await loadInitials();
  const agentEntry = (await agents()).find((a) => a.id === im.AGENT);

  return {
    im,
    ville: `${im.adresse_ville ?? ""} (${im.adresse_zipcode ?? im.adresse_dpt ?? ""})`,
    adresse: [im.adresse_numero_rue, im.adresse_rue].filter(Boolean).join(" "),
    photoUrl: photoProxy(im.photo_main_compressed),
    facadeRue: estFacadeRue(im.photo_main_compressed),
    prix: euros(im.prix_hai),
    statut: String(im.Statut ?? "").replace(/^\d+ - /, ""),
    standby: typeof im.standby_Statut === "string" ? im.standby_Statut : undefined,
    agentInitials: agentEntry?.initials ?? "FI",
    agentNom: agentEntry?.name || undefined,
    agentTel: agentEntry?.tel || undefined,
    proprietaire,
    autresBiens: autres
      .filter((a) => a._id !== id)
      .map((a) => ({
        id: a._id as string,
        label: `${a.adresse_ville ?? ""} — ${[a.adresse_numero_rue, a.adresse_rue].filter(Boolean).join(" ")}`,
        statut: String(a.Statut ?? "").replace(/^\d+ - /, ""),
      })),
    suivis: [...suivisR]
      .sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"])))
      .map((s) => ({
        date: dmy(s.date_start ?? s["Created Date"]),
        canal: Array.isArray(s.Canals) ? String(s.Canals[0] ?? "") : undefined,
        type: typeof s.Type === "string" ? s.Type : undefined,
        notes: typeof s.notes === "string" ? s.notes : undefined,
        motif: typeof s.Motif_standby === "string" ? s.Motif_standby : undefined,
        relance: dmy(s.date_relance),
      })),
    // L'agent peut réordonner les lignes à la souris (#82) : `ordre` prime,
    // le numéro de lot reste le repère par défaut.
    lots: [...lots].sort((a, b) => rangLot(a) - rangLot(b)),
    parcelles,
    prixHisto: [...prixHisto].sort((a, b) =>
      String(b["Created Date"] ?? "").localeCompare(String(a["Created Date"] ?? "")),
    ),
    adr: adresses[0] ?? null,
    typologies,
    secteur,
    baux: [...baux].sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"]))),
    locataires: [...locataires].sort((a, b) => String(a.formatted_name ?? "").localeCompare(String(b.formatted_name ?? ""))),
    charges: [...chargesById, ...chargesByIm.filter((c) => !chargesById.some((d) => d._id === c._id))]
      .sort((a, b) => String(a["Created Date"]).localeCompare(String(b["Created Date"]))),
    composants,
    travaux,
    // La principale d'abord, puis le rang saisi au glisser-déposer (#95).
    photos: [...photos]
      .sort((a, c) =>
        (a.Type === "Principale" ? 0 : 1) - (c.Type === "Principale" ? 0 : 1) ||
        (Number(a.order ?? 0) || 0) - (Number(c.order ?? 0) || 0) ||
        String(a["Created Date"] ?? "").localeCompare(String(c["Created Date"] ?? "")),
      )
      .map((p) => ({
        id: p._id as string,
        url: photoProxy(p.compressed ?? p.image),
        urlPleine: photoProxy(p.image ?? p.compressed),
        type: typeof p.Type === "string" ? (p.Type as string) : undefined,
        lotId: typeof p.LOT === "string" ? (p.LOT as string) : undefined,
        ordre: Number(p.order ?? 0) || 0,
        dossier: p.show_in_doss === true,
        annonce: p.show_in_ann === true,
        estimation: p.show_in_est === true,
      })),
    documents: [...documents].sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"]))),
    estimations: [...estimations].sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"]))),
    mandats: [...mandats].sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"]))),
    dossiers: [...dossiers].sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0)),
    propositions: { total: propositions.remaining + propositions.results.length, rows: propositions.results },
    visites: [...visites].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))),
    offres: [...offres].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? ""))),
  };
}

/** Typologies de lot ajoutées par les agents, hors référentiel de base. */
export async function getTypologies(): Promise<{ destination: string; label: string }[]> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
  if (!key) return [];
  const r = await fetch(`${url}/rest/v1/bo_typologie?select=destination,label&order=label`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return [];
  return (await r.json()) as { destination: string; label: string }[];
}

/** Dernier relevé « Prix du secteur » (type Bubble prix_secteur) pour un immeuble. */
export async function getPrixSecteur(immeubleId: string): Promise<Record<string, unknown> | null> {
  const r = await bq("prix_secteur", {
    constraints: [{ key: "0 - IMMEUBLE", constraint_type: "equals", value: immeubleId }],
    limit: 1,
    sort: "Modified Date",
    desc: true,
  }).catch(() => ({ results: [] as Record<string, unknown>[], remaining: 0 }));
  return r.results[0] ?? null;
}

/** La fiche complète d'un agent (photo, téléphone, poste) : le dossier
 *  d'estimation imprime son contact dédié en couverture. */
export async function getAgentFiche(id: string): Promise<Record<string, unknown> | null> {
  if (!id) return null;
  const r = await bq("agentfi", {
    constraints: [{ key: "_id", constraint_type: "equals", value: id }],
    limit: 1,
  }).catch(() => ({ results: [] as Record<string, unknown>[], remaining: 0 }));
  return r.results[0] ?? null;
}

/** Une estimation par id (pour la page imprimable). */
export async function getEstimation(id: string): Promise<Record<string, unknown> | null> {
  const r = await bq("estimation", {
    constraints: [{ key: "_id", constraint_type: "equals", value: id }],
    limit: 1,
  }).catch(() => ({ results: [] as Record<string, unknown>[], remaining: 0 }));
  return r.results[0] ?? null;
}

/**
 * Un mandat, son immeuble, et l'état locatif de cet immeuble.
 *
 * Les lots ne sont pas un supplément d'âme : depuis les retours #102 et #103,
 * l'onglet Objet est SERVI par eux (occupation, surfaces, descriptif légal).
 * Les charger ici évite que l'écran mandat aille les rechercher lui-même.
 */
export async function getMandat(id: string): Promise<{
  m: Record<string, unknown>;
  im: Record<string, unknown> | null;
  lots: Record<string, unknown>[];
  agent: Agent | null;
  /* Parcelles de l'immeuble (retour #202). Le mandat s'en sert pour savoir
     s'il doit verrouiller sa case cadastre : quand Emplacement les connaît,
     c'est lui qui fait foi ; quand il ne les connaît pas, le mandat les
     saisit et les lui renvoie. */
  parcelles: Record<string, unknown>[];
  /** Cartes de visite des contacts cités, par identifiant (retour #205). */
  vignettes: Record<string, Vignette>;
} | null> {
  const r = await bq("mandat", {
    constraints: [{ key: "_id", constraint_type: "equals", value: id }],
    limit: 1,
  }).catch(() => ({ results: [] as Record<string, unknown>[], remaining: 0 }));
  const m = r.results[0];
  if (!m) return null;
  const imId = Array.isArray(m.IMMEUBLEs) ? (m.IMMEUBLEs as string[])[0] : undefined;
  const [im, lots, tousAgents] = await Promise.all([
    imId
      ? bq("immeuble", { constraints: [{ key: "_id", constraint_type: "equals", value: imId }], limit: 1 })
          .then((x) => x.results[0] ?? null)
          .catch(() => null)
      : Promise.resolve(null),
    imId
      ? fetchAll("lot", [{ key: "IMMEUBLE", constraint_type: "equals", value: imId }], 200).catch(() => [])
      : Promise.resolve([] as Record<string, unknown>[]),
    agents().catch(() => [] as Agent[]),
  ]);
  const lotsTries = [...lots].sort(
    (a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0),
  );
  const agent = tousAgents.find((a) => a.id === String(m.AGENT ?? "")) ?? null;
  const refsParcelles = Array.isArray(im?.PARCELLEs) ? (im.PARCELLEs as string[]) : [];
  const parcelles = refsParcelles.length
    ? await fetchAll("parcelle", [{ key: "_id", constraint_type: "in", value: refsParcelles }], 100)
      .catch(() => [] as Record<string, unknown>[])
    : [];
  /* Les fiches des mandants, pour la vignette du cartouche (retour #205). Les
     mandants sont stockés à plat sur le mandat ; ceux qui portent un contact
     rattaché ont droit à leur carte de visite. */
  const idsMandants = [
    // Modèle actuel : les mandants sont un tableau porté par le mandat.
    ...(Array.isArray(m.mandants)
      ? (m.mandants as Record<string, unknown>[]).map((x) => S2(x.contactId))
      : []),
    // Repli hérité de Bubble : les contacts sont dans `MANDANTs`, par position.
    ...(Array.isArray(m.MANDANTs) ? (m.MANDANTs as unknown[]).map(S2) : []),
    // Le propriétaire de l'immeuble : c'est lui, le contact de la fiche.
    S2(im?.PROPRIETAIRE),
  ].filter((x): x is string => !!x);
  const vignettes = await getVignettes(idsMandants).catch(() => ({}));
  return { m, im, lots: lotsTries, agent, parcelles, vignettes };
}

/* ---------- Vues listes (réplique des modules de la sidebar) ---------- */

export type ListCard = {
  id: string;
  href?: string;
  avatar: string;
  /** Couleur de l'agent — reprise du BO, où chacun a la sienne. */
  avatarCouleur?: string;
  title: string;
  sub?: string;
  note?: string;
  badge?: { label: string; tone: "green" | "red" | "orange" };
  right?: string[];
  /** Nom de l'acquéreur rattaché (offres, visites). */
  acquereur?: string;
  /** Valeurs numériques exploitées par le panneau de filtres du BO. */
  mesures?: { surface?: number; renta?: number; occupation?: number; prix?: number };
  /** Facettes filtrables (listes déroulantes du panneau). */
  facettes?: {
    ideal?: string;
    destination?: string;
    statut?: string;
    /* La localisation se filtre comme dans les recherches : plusieurs villes,
       départements ou régions à la fois, en OU. */
    ville?: string;
    departement?: string;
    region?: string;
  };
  /** Note A/B/C/D du contact — le classement acquéreur du BO, affiché
   *  partout à côté du nom (il pilote « Commercialisés aux clients A et B »). */
  grade?: string;
  /* --- Carte contact du BO (retour #115) --- */
  /** Ce qu'on écrit sous le nom : « Particulier », la société, ou l'agence. */
  qualite?: string;
  /** Pilote l'avatar : un agent immobilier ne se présente pas comme un client. */
  estAgent?: boolean;
  /** Nombres de recherches et d'immeubles rattachés, affichés en pictos. */
  compteurs?: { recherches?: number; immeubles?: number };
  /* --- Vignette d'immeuble (retour #122) --- */
  /** Photo principale : « sinon on comprend rien » dans la liste. */
  photoUrl?: string;
  /** La photo principale est une capture Street View, pas une vraie photo :
   *  la vignette le signale, « à remplacer ». */
  facadeRue?: boolean;
  /** Street View du bien, ouvert dans une autre fenêtre — sans sortir de la liste. */
  streetUrl?: string;
  /** Clé d'onglet (en_cours / termines / archives…). */
  group: string;
  date?: string;
};

const premier = (v: unknown) => (Array.isArray(v) ? String((v as unknown[])[0] ?? "") : typeof v === "string" ? v : "");

/** Charge des contacts par identifiant, par paquets de 100. */
async function contactMap(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const uniques = [...new Set(ids.filter(Boolean))];
  const m = new Map<string, Record<string, unknown>>();
  (await parIds("contact", uniques)).forEach((c) => m.set(String(c._id), c));
  return m;
}

/** Classement acquéreur (champ `Note` du contact). */
export const gradeOf = (c?: Record<string, unknown>) =>
  typeof c?.Note === "string" && /^[A-D]$/.test(c.Note as string) ? (c.Note as string) : undefined;

let initialsMap: Record<string, string> = {};
let couleursMap: Record<string, string> = {};
const initialsOf = (agentId: unknown) => initialsMap[String(agentId ?? "")] ?? "FI";
/* Chaque commercial a sa couleur dans la base (`color_main`) : c'est elle qui
   permet de repérer d'un coup d'œil à qui appartient une fiche, exactement
   comme dans le BO. Elle était lue mais n'allait nulle part. */
const couleurOf = (agentId: unknown) => couleursMap[String(agentId ?? "")];
async function loadInitials() {
  const rows = await agents();
  initialsMap = Object.fromEntries(rows.map((a) => [a.id, a.initials]));
  couleursMap = Object.fromEntries(rows.filter((a) => a.color).map((a) => [a.id, a.color!]));
}

async function imLabelMap(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const uniq = [...new Set(ids)].filter(Boolean);
  for (const r of await parIds("immeuble", uniq)) map.set(String(r._id), r);
  return map;
}

const imLabel = (im?: Record<string, unknown>) =>
  im
    ? `${im.adresse_ville ?? ""} (${im.adresse_zipcode ?? ""}) - ${[im.adresse_numero_rue, im.adresse_rue].filter(Boolean).join(" ")}`
    : "";

export async function listImmeubles(): Promise<ListCard[]> {
  await loadInitials();
  const ims = await fetchAll("immeuble", [{ key: "archived", constraint_type: "equals", value: "false" }]);
  const archived = await bq("immeuble", {
    constraints: [{ key: "archived", constraint_type: "equals", value: "true" }],
    limit: 100, sort: "Modified Date", desc: true,
  }).catch(() => ({ results: [] as Record<string, unknown>[], remaining: 0 }));
  const tous = [...ims, ...archived.results];
  const contactIds = tous.map((i) => String(i.PROPRIETAIRE ?? "")).filter(Boolean);
  /* Les coordonnées vivent sur l'adresse géocodée, pas sur l'immeuble : c'est
     elles qui permettent d'ouvrir la façade en Street View (retour #122). */
  const [contactsR, adressesR] = await Promise.all([
    parIds("contact", contactIds),
    parChamp("adresse", "IMMEUBLE", tous.map((i) => String(i._id))).catch(() => []),
  ]);
  const contacts = new Map<string, Record<string, unknown>>();
  for (const r of contactsR) contacts.set(String(r._id), r);
  const geos = new Map<string, { lat?: number; lng?: number }>();
  for (const a of adressesR) {
    const g = a.geo as { lat?: number; lng?: number } | undefined;
    if (g && typeof g.lat === "number" && typeof g.lng === "number") {
      geos.set(String(a.IMMEUBLE ?? ""), g);
    }
  }
  /** Street View quand on a le point ; à défaut, la recherche sur l'adresse. */
  const street = (im: Record<string, unknown>) => {
    const g = geos.get(String(im._id));
    if (g) return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${g.lat},${g.lng}`;
    const adresse = [im.adresse_numero_rue, im.adresse_rue, im.adresse_zipcode, im.adresse_ville]
      .filter(Boolean).join(" ");
    return adresse
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`
      : undefined;
  };
  const card = (im: Record<string, unknown>, group: string): ListCard => ({
    id: String(im._id),
    href: `/bien/${im._id}`,
    avatar: initialsOf(im.AGENT), avatarCouleur: couleurOf(im.AGENT),
    title: imLabel(im),
    sub: contactLabel(contacts.get(String(im.PROPRIETAIRE ?? ""))) || undefined,
    photoUrl: photoProxy(im.photo_main_compressed),
    facadeRue: estFacadeRue(im.photo_main_compressed),
    streetUrl: street(im),
    badge: (() => {
      const st = String(im.Statut ?? "").replace(/^\d+ - /, "");
      if (!st) return undefined;
      const n = statutOf(im);
      return { label: st, tone: n >= 11 ? "green" : n <= 1 ? "orange" : "orange" } as ListCard["badge"];
    })(),
    right: [
      typeof im.surface_carrez === "number" && im.surface_carrez > 0 ? `${Math.round(im.surface_carrez as number)} m²` : "",
      typeof im.occupation_lots === "number" ? `${Math.round(im.occupation_lots as number)} %` : "",
      typeof im.fin_renta_ba === "number" ? `${(im.fin_renta_ba as number).toLocaleString("fr-FR")} %` : "",
      euros(im.prix_hai) ?? "",
    ].filter(Boolean),
    note: typeof im.standby_Statut === "string" && im.standby_Statut !== "Traité" ? String(im.standby_Statut) : undefined,
    grade: gradeOf(contacts.get(String(im.PROPRIETAIRE ?? ""))),
    mesures: {
      surface: typeof im.surface_carrez === "number" ? (im.surface_carrez as number) : undefined,
      occupation: typeof im.occupation_lots === "number" ? (im.occupation_lots as number) : undefined,
      renta: typeof im.fin_renta_ba === "number" ? (im.fin_renta_ba as number) : undefined,
      prix: typeof im.prix_hai === "number" ? (im.prix_hai as number) : undefined,
    },
    facettes: {
      // « Idéal pour » du BO = liste des cibles acquéreur de l'immeuble.
      ideal: Array.isArray(im.Cibles) ? String((im.Cibles as string[])[0] ?? "") || undefined : undefined,
      destination: typeof im.Destination_principale === "string" ? (im.Destination_principale as string) : undefined,
      statut: String(im.Statut ?? "") || undefined,
      ville: S2(im.adresse_ville),
      departement: S2(im.adresse_zipcode)?.slice(0, 2),
      region: S2(im.adresse_region) ?? S2(im.region),
    },
    group,
    date: typeof im["Modified Date"] === "string" ? (im["Modified Date"] as string) : undefined,
  });
  return [
    ...ims.filter((i) => String(i.standby_Statut ?? "Traité") === "Traité").map((i) => card(i, "en_cours")),
    ...ims.filter((i) => String(i.standby_Statut ?? "Traité") !== "Traité").map((i) => card(i, "en_attente")),
    ...archived.results.map((i) => card(i, "archives")),
  ].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
}

export async function listEstimations(): Promise<ListCard[]> {
  await loadInitials();
  const rows = await fetchAll("estimation", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  return rows.map((e) => {
    const st = String(e.Statut ?? "").replace(/^\d+ - /, "");
    const hai = typeof e.prix_hai === "number" ? (e.prix_hai as number) : 0;
    const loyers = typeof e.imm_loyer_hc_tot === "number" ? (e.imm_loyer_hc_tot as number) : 0;
    const carrez = typeof e.imm_carrez_tot_tot === "number" ? (e.imm_carrez_tot_tot as number) : 0;
    return {
      id: String(e._id),
      href: e.IMMEUBLE ? `/bien/${e.IMMEUBLE}` : undefined,
      avatar: initialsOf(e.ESTIMATOR), avatarCouleur: couleurOf(e.ESTIMATOR),
      title: `${dmy(e["Created Date"]) ?? ""} ${e.adresse_ville ?? ""} - ${[e["adresse_numéro_rue"], e.adresse_rue].filter(Boolean).join(" ")}`,
      badge: st
        ? { label: st, tone: st === "Envoyée" ? "green" : st === "PDF manquant" ? "red" : "orange" }
        : undefined,
      right: [
        euros(hai) ?? "",
        hai > 0 && loyers > 0 ? `${((loyers / hai) * 100).toFixed(1).replace(".", ",")} %` : "",
        hai > 0 && carrez > 0 ? `${Math.round(hai / carrez).toLocaleString("fr-FR")} €/m²` : "",
      ].filter(Boolean),
      group: ["Envoyée", "Interne"].includes(st) ? "terminees" : "en_cours",
      date: typeof e["Created Date"] === "string" ? (e["Created Date"] as string) : undefined,
    } satisfies ListCard;
  });
}

export async function listMandats(): Promise<ListCard[]> {
  await loadInitials();
  const rows = await fetchAll("mandat", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  const ims = await imLabelMap(rows.map((m) => (Array.isArray(m.IMMEUBLEs) ? String((m.IMMEUBLEs as string[])[0] ?? "") : "")));
  const props = await contactMap(rows.map((m) => premier(m.MANDANTs)));
  return rows.map((m) => {
    const st = String(m.Statut ?? "");
    const im = ims.get(Array.isArray(m.IMMEUBLEs) ? String((m.IMMEUBLEs as string[])[0] ?? "") : "");
    const proprio = props.get(premier(m.MANDANTs));
    // Repli sur les noms saisis dans le mandat quand le mandant n'est pas lié.
    const mandant = contactLabel(proprio)
      || `${m["prénom_m1"] ? `${String(m["prénom_m1"])[0]}. ` : ""}${String(m.nom_m1 ?? "").toUpperCase()}`.trim();
    return {
      id: String(m._id),
      href: `/mandat/${m._id}`,
      avatar: initialsOf(m.AGENT), avatarCouleur: couleurOf(m.AGENT),
      title: `${m.Type ?? "Vente"} ${m.Type_exclu ?? ""} ${dmy(m.date_effet) ?? ""}${m.date_fin ? `-${dmy(m.date_fin)}` : ""}`.trim(),
      sub: imLabel(im) || undefined,
      note: m.numero ? `#${m.numero}` : "Pas de numéro",
      acquereur: mandant || undefined,
      grade: gradeOf(proprio),
      badge: st
        ? { label: st, tone: ["En cours", "Vendu"].includes(st) ? "green" : ["Annulé", "Expiré"].includes(st) ? "red" : "orange" }
        : undefined,
      right: [euros(m.prix_hai) ?? ""].filter(Boolean),
      // Le BO isole les mandats « A signer » dans leur propre onglet.
      group: ["A rédiger", "Attente infos", "Attente signature", "A signer"].includes(st)
        ? "a_signer"
        : st === "En cours"
          ? "en_cours"
          : "termines",
      date: typeof m["Modified Date"] === "string" ? (m["Modified Date"] as string) : undefined,
    } satisfies ListCard;
  });
}

export async function listVisites(): Promise<ListCard[]> {
  await loadInitials();
  const rows = await fetchAll("visite", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  const ims = await imLabelMap(rows.map((v) => String(v.IMMEUBLE ?? "")));
  const visiteurs = await contactMap(rows.map((v) => premier(v.VISITEURs)));
  return rows.map((v) => {
    const st = String(v.Statut ?? "");
    const d = typeof v.date === "string" ? new Date(v.date as string) : undefined;
    const heure = d
      ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(d).replace(":", "h")
      : "";
    return {
      id: String(v._id),
      href: v.IMMEUBLE ? `/bien/${v.IMMEUBLE}` : undefined,
      avatar: initialsOf(v.AGENT), avatarCouleur: couleurOf(v.AGENT),
      title: `Visite du ${dmy(v.date) ?? "?"}${heure ? ` - ${heure}` : ""}`,
      sub: imLabel(ims.get(String(v.IMMEUBLE ?? ""))) || undefined,
      note: typeof v.visiteur_nom === "string" ? (v.visiteur_nom as string) : undefined,
      acquereur: contactLabel(visiteurs.get(premier(v.VISITEURs))) || undefined,
      grade: gradeOf(visiteurs.get(premier(v.VISITEURs))),
      badge: st
        ? { label: st, tone: st === "Effectuée" ? "green" : st === "Annulée" ? "red" : "orange" }
        : undefined,
      group: ["Effectuée", "Annulée"].includes(st) ? "terminees" : "prevues",
      date: typeof v.date === "string" ? (v.date as string) : undefined,
    } satisfies ListCard;
  }).sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
}

export async function listOffres(): Promise<ListCard[]> {
  await loadInitials();
  const rows = await fetchAll("offre", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  const ims = await imLabelMap(rows.map((o) => (Array.isArray(o.IMMEUBLEs) ? String((o.IMMEUBLEs as string[])[0] ?? "") : "")));
  const acq = await contactMap(rows.map((o) => premier(o.ACHETEURs)));
  const today = Date.now();
  return rows.map((o) => {
    const st = String(o.Statut ?? "");
    const exp = typeof o.date_expiration === "string" ? new Date(o.date_expiration as string).getTime() : undefined;
    const joursRestants = exp !== undefined ? Math.round((exp - today) / 86400000) : undefined;
    return {
      id: String(o._id),
      href: Array.isArray(o.IMMEUBLEs) && (o.IMMEUBLEs as string[])[0] ? `/bien/${(o.IMMEUBLEs as string[])[0]}` : undefined,
      avatar: "FI",
      title: `Offre du ${dmy(o.date) ?? "?"}`,
      sub: imLabel(ims.get(Array.isArray(o.IMMEUBLEs) ? String((o.IMMEUBLEs as string[])[0] ?? "") : "")) || undefined,
      note:
        joursRestants !== undefined && !["Vendu", "Refusée", "Acceptée"].includes(st)
          ? `Expire dans ${joursRestants} jours`
          : undefined,
      acquereur: contactLabel(acq.get(premier(o.ACHETEURs))) || undefined,
      grade: gradeOf(acq.get(premier(o.ACHETEURs))),
      badge: st
        ? { label: st, tone: ["Acceptée", "Vendu", "Compromis signé"].includes(st) ? "green" : st === "Refusée" ? "red" : "orange" }
        : undefined,
      right: [
        `${euros(o.prix_nv) ?? "?"} + ${euros(o.honos_ttc) ?? "?"} = ${euros(o.prix_hai) ?? "?"} HAI`,
      ],
      group: st === "En cours" || st === "Contre offre" ? "en_cours" : st === "Acceptée" ? "acceptees" : "termines",
      date: typeof o.date === "string" ? (o.date as string) : undefined,
    } satisfies ListCard;
  });
}

export async function listSuivis(): Promise<ListCard[]> {
  await loadInitials();
  const rows = await fetchAll("suivi", undefined, 300, { field: "Created Date", desc: true }).catch(() => []);
  const ims = await imLabelMap(rows.map((s) => (Array.isArray(s.IMMEUBLEs) ? String((s.IMMEUBLEs as string[])[0] ?? "") : "")));
  return rows.map((s) => {
    const st = String(s.Statut ?? "");
    const imId = Array.isArray(s.IMMEUBLEs) ? String((s.IMMEUBLEs as string[])[0] ?? "") : "";
    return {
      id: String(s._id),
      href: imId ? `/bien/${imId}` : undefined,
      avatar: initialsOf(s.AGENT), avatarCouleur: couleurOf(s.AGENT),
      title: `${dmy(s.date_start ?? s["Created Date"]) ?? ""}${s.date_relance ? ` → ${dmy(s.date_relance)}` : ""} · ${s.Motif_standby ?? s.Type ?? ""}`,
      sub: imLabel(ims.get(imId)) || undefined,
      note: typeof s.notes === "string" ? (s.notes as string).slice(0, 220) : undefined,
      badge: st ? { label: st, tone: st === "Traité" ? "green" : "orange" } : undefined,
      group: st === "Traité" ? "termines" : "en_cours",
      date: typeof s["Created Date"] === "string" ? (s["Created Date"] as string) : undefined,
    } satisfies ListCard;
  });
}

export async function listContacts(): Promise<ListCard[]> {
  await loadInitials();
  const rows = await fetchAll("contact", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  return rows.map((c) => {
    const nom = [c["Civilité"], c["prénom"], c.nom].filter(Boolean).join(" ");
    const types = Array.isArray(c.Types) ? (c.Types as string[]).join(" · ") : "";
    return {
      id: String(c._id),
      href: `/contact/${c._id}`,
      avatar: initialsOf(c.SUIVI), avatarCouleur: couleurOf(c.SUIVI),
      title: nom || String(c.entreprise_nom ?? "Contact"),
      sub: [c.portable_formatted ?? c.portable, c.email].filter(Boolean).join(" · ") || undefined,
      note: [types, c.acheteur === true ? "Acheteur" : "", c.vendeur === true ? "Vendeur" : ""].filter(Boolean).join(" · ") || undefined,
      grade: gradeOf(c),
      group: "tous",
      date: typeof c["Modified Date"] === "string" ? (c["Modified Date"] as string) : undefined,
    } satisfies ListCard;
  });
}

export async function listRecherches(): Promise<ListCard[]> {
  await loadInitials();
  const rows = await fetchAll("recherche", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  const acheteurIds = rows.map((r) => String(r.ACHETEUR ?? "")).filter(Boolean);
  const contacts = new Map<string, Record<string, unknown>>();
  for (const c of await parIds("contact", acheteurIds)) contacts.set(String(c._id), c);
  return rows.map((r) => {
    const c = contacts.get(String(r.ACHETEUR ?? ""));
    const prix =
      typeof r.prix_min === "number" || typeof r.prix_max === "number"
        ? `${euros(r.prix_min) ?? "0 €"} à ${euros(r.prix_max) ?? "∞"}`
        : "";
    return {
      id: String(r._id),
      avatar: initialsOf(r.SUIVI), avatarCouleur: couleurOf(r.SUIVI),
      title: [Array.isArray(r.dpts) ? (r.dpts as string[]).join(", ") : String(r.dpts ?? ""), String(r.Cible ?? "")].filter(Boolean).join(" · ") || "Recherche",
      sub: c ? contactLabel(c) : undefined,
      grade: gradeOf(c),
      note: [prix, typeof r.renta === "number" ? `≥ ${(r.renta as number).toLocaleString("fr-FR")} %` : ""].filter(Boolean).join(" · ") || undefined,
      mesures: {
        renta: typeof r.renta === "number" ? (r.renta as number) : undefined,
        prix: typeof r.prix_max === "number" ? (r.prix_max as number) : undefined,
        surface: typeof r.surface_min === "number" ? (r.surface_min as number) : undefined,
      },
      facettes: {
        ideal: typeof r.Cible === "string" ? (r.Cible as string) : undefined,
        destination: Array.isArray(r.Destinations) ? String((r.Destinations as string[])[0] ?? "") : undefined,
      },
      badge: r.standby === true ? { label: "En attente", tone: "orange" } : undefined,
      group: r.archived === true ? "archivees" : "en_cours",
      date: typeof r["Modified Date"] === "string" ? (r["Modified Date"] as string) : undefined,
    } satisfies ListCard;
  });
}

export async function listQuestions(): Promise<ListCard[]> {
  await loadInitials();
  const rows = await fetchAll("question", undefined, 300, { field: "Created Date", desc: true }).catch(() => []);
  const imIds = rows.map((q) => String(q.IMMEUBLE ?? "")).filter(Boolean);
  const ims = await imLabelMap(imIds);
  return rows.map((q) => ({
    id: String(q._id),
    href: q.IMMEUBLE ? `/bien/${q.IMMEUBLE}` : undefined,
    avatar: initialsOf(q["suivi par"]), avatarCouleur: couleurOf(q["suivi par"]),
    title: `${dmy(q["Created Date"]) ?? ""} · ${q.email ?? q["téléphone"] ?? "Question"}`,
    sub: imLabel(ims.get(String(q.IMMEUBLE ?? ""))) || undefined,
    note: typeof q.message === "string" ? (q.message as string).slice(0, 200) : undefined,
    badge: q.ended === true ? { label: "Clôturée", tone: "green" } : { label: "En cours", tone: "orange" },
    group: q.ended === true ? "cloturees" : "en_cours",
    date: typeof q["Created Date"] === "string" ? (q["Created Date"] as string) : undefined,
  } satisfies ListCard));
}

export async function listPropositions(): Promise<ListCard[]> {
  await loadInitials();
  const rows = await fetchAll("proposition", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  const ims = await imLabelMap(rows.map((p) => String(p.IMMEUBLE ?? "")));
  return rows.map((p) => {
    const st = String(p.Statut ?? "");
    return {
      id: String(p._id),
      href: p.IMMEUBLE ? `/bien/${p.IMMEUBLE}` : undefined,
      avatar: "FI",
      title: String(p.mail_adresse ?? "Proposition"),
      sub: imLabel(ims.get(String(p.IMMEUBLE ?? ""))) || undefined,
      note: [dmy(p.date_envoi) ? `envoyée le ${dmy(p.date_envoi)}` : "", String(p.Source_proposition ?? "")].filter(Boolean).join(" · ") || undefined,
      badge: st
        ? {
            label: st,
            tone: ["Offre acceptée", "Vendu", "Offre obtenue"].includes(st) ? "green" : st.startsWith("Refus") || st === "Offre refusée" ? "red" : "orange",
          }
        : undefined,
      group: ["Refusée (sans offre)", "Offre refusée", "Vendu"].includes(st) ? "terminees" : "en_cours",
      date: typeof p["Modified Date"] === "string" ? (p["Modified Date"] as string) : undefined,
    } satisfies ListCard;
  });
}

/** Volumes 12 mois pour l'écran Datas (comptés sur Created Date). */
/** Étapes de l'entonnoir du BO, dans l'ordre, avec le statut pipeline atteint. */
const ETAPES: { cle: string; label: string; seuil: number }[] = [
  { cle: "immeubles", label: "Immeubles", seuil: 0 },
  { cle: "estime", label: "Estimé", seuil: 2 },
  { cle: "propose", label: "Proposé", seuil: 5 },
  { cle: "offre_recue", label: "Offre reçue", seuil: 7 },
  { cle: "offre_acceptee", label: "Offre acceptée", seuil: 8 },
  { cle: "compromis", label: "Compromis signé", seuil: 9 },
  { cle: "vente", label: "Vente signée", seuil: 11 },
];

export type DatasData = Awaited<ReturnType<typeof getDatas>>;

/** Reporting « Datas » : volumes sur 12 mois, entonnoir et taux, par agent. */
export async function getDatas() {
  const since = new Date(Date.now() - 365 * 86400000).toISOString();
  const created: Constraint[] = [{ key: "Created Date", constraint_type: "greater than", value: since }];
  const [contacts, recherches, immeublesRows, estimations, mandats, visites, offresRows, propositions] =
    await Promise.all([
      count("contact", created).catch(() => 0),
      count("recherche", created).catch(() => 0),
      fetchAll("immeuble", undefined, 4000).catch(() => []),
      fetchAll("estimation", created, 4000).catch(() => []),
      fetchAll("mandat", created, 2000).catch(() => []),
      fetchAll("visite", created, 4000).catch(() => []),
      fetchAll("offre", created, 2000).catch(() => []),
      fetchAll("proposition", created, 20000).catch(() => []),
    ]);
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const okOffre = ["Acceptée", "Compromis programmé", "Compromis signé", "Vente prévue", "Vendu"];

  await loadInitials();
  const initiales = (id: unknown) => initialsOf(id);
  const recents = immeublesRows.filter((i) => String(i["Created Date"] ?? "") > since);

  // Entonnoir : un immeuble compte dans une étape dès qu'il l'a atteinte.
  const actifs = immeublesRows.filter((i) => i.archived !== true);
  const total = actifs.length || 1;
  const entonnoir = ETAPES.map((e) => {
    const lot = actifs.filter((i) => statutOf(i) >= e.seuil);
    const parAgent: Record<string, number> = {};
    for (const i of lot) {
      const k = initiales(i.AGENT);
      parAgent[k] = (parAgent[k] ?? 0) + 1;
    }
    return { cle: e.cle, label: e.label, n: lot.length, pct: Math.round((lot.length / total) * 1000) / 10, parAgent };
  });

  const portefeuille = {
    enCours: actifs.filter((i) => String(i.standby_Statut ?? "Traité") === "Traité").length,
    enAttente: actifs.filter((i) => String(i.standby_Statut ?? "Traité") !== "Traité").length,
    archives: immeublesRows.filter((i) => i.archived === true).length,
  };

  const pourcent = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const etape = (cle: string) => entonnoir.find((e) => e.cle === cle)?.n ?? 0;
  const immeublesVisites = new Set(
    visites.filter((v) => String(v.Statut ?? "") === "Effectuée").map((v) => String(v.IMMEUBLE ?? "")),
  ).size;

  const propsEnvoyees = propositions.length;
  const propsRefusees = propositions.filter((p) => String(p.Statut ?? "").startsWith("Refus")).length;
  const propsRetour = propositions.filter((p) => String(p.Statut ?? "") !== "Envoyée").length;
  const visitesEffectuees = visites.filter((v) => String(v.Statut ?? "") === "Effectuée").length;
  const offresAcceptees = offresRows.filter((o) => okOffre.includes(String(o.Statut ?? ""))).length;
  const ventes = offresRows.filter((o) => String(o.Statut ?? "") === "Vendu");
  const compromis = offresRows.filter((o) => ["Compromis signé", "Vente prévue", "Vendu"].includes(String(o.Statut ?? "")));

  // Répartition par agent des jalons commerciaux. Les offres ne portent pas
  // d'agent : on les rattache à celui qui suit l'immeuble concerné.
  const agentDeLim = new Map(immeublesRows.map((i) => [String(i._id), i.AGENT] as const));
  const parAgent = (rows: Record<string, unknown>[], cle = "AGENT") => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      const via = cle === "IMMEUBLE"
        ? agentDeLim.get(Array.isArray(r.IMMEUBLEs) ? String((r.IMMEUBLEs as string[])[0] ?? "") : String(r.IMMEUBLE ?? ""))
        : r[cle];
      const k = initiales(via);
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  };

  const mandatsSignes = mandats.filter(
    (m) => !!m.date_signature || ["En cours", "Vendu", "Expiré"].includes(String(m.Statut ?? "")),
  );

  return {
    // Volumes bruts (12 derniers mois)
    contacts, recherches,
    immeubles: recents.length,
    formulaires: recents.filter((i) => statutOf(i) === 1).length,
    formulairesValides: recents.filter((i) => statutOf(i) >= 2).length,
    immeublesArchives: recents.filter((i) => i.archived === true).length,
    estimations: estimations.length,
    estimationsEnvoyees: estimations.filter((e) => String(e.Statut ?? "").startsWith("3")).length,
    mandats: mandats.length,
    mandatsSignes: mandatsSignes.length,
    mandatsParAgent: parAgent(mandatsSignes),
    propositions: propsEnvoyees,
    propositionsRefusees: propsRefusees,
    visites: visites.length,
    visitesEffectuees,
    offres: offresRows.length,
    offresAcceptees,
    offresParAgent: parAgent(offresRows, "IMMEUBLE"),
    offresHonosHt: offresRows.reduce((s, o) => s + num(o.honos_ht), 0),
    compromis: compromis.length,
    compromisHonosHt: compromis.reduce((s, o) => s + num(o.honos_ht), 0),
    ventes: ventes.length,
    ventesHonosHt: ventes.reduce((s, o) => s + num(o.honos_ht), 0),
    // Taux de conversion : calculés sur les mêmes cohortes d'immeubles que
    // l'entonnoir, pour qu'ils restent comparables et bornés à 100 %.
    taux: {
      retour: pourcent(propsRetour, propsEnvoyees),
      visite: pourcent(immeublesVisites, etape("propose")),
      offre: pourcent(etape("offre_recue"), immeublesVisites),
      offreAcceptee: pourcent(etape("offre_acceptee"), etape("offre_recue")),
      compromis: pourcent(etape("compromis"), etape("offre_acceptee")),
      vente: pourcent(etape("vente"), etape("compromis")),
    },
    immeublesVisites,
    entonnoir,
    portefeuille,
  };
}

/* ========================= Fiche Contact (retour #119) =========================
   Le BO présente la fiche en trois temps : un en-tête collé qui dit qui est la
   personne et comment la joindre, une barre d'onglets chiffrée, puis le contenu
   de l'onglet. Tout est préparé ici, prêt à afficher : la vue ne recalcule
   rien et ne relit pas la base. */

/** Une ligne d'immeuble telle que la fiche l'affiche (carte du BO). */
export type ImmeubleLigne = {
  id: string;
  agent: string;
  agentCouleur?: string;
  libelle: string;
  statut?: string;
  /** Rang numérique du statut (0 à 11) — pilote la couleur de la pastille. */
  rang: number;
  /** « Archivé le 03/03/26 car N'est pas propriétaire ». */
  archive?: string;
  /** « Dossier V4 » ou rien. */
  dossier?: string;
  mandat?: string;
  surface?: string;
  occupation?: string;
  /** Loyers annuels HC, la 3ᵉ mesure de la carte du BO. */
  loyers?: string;
  renta?: string;
  prix?: string;
};

/** Mandat vu depuis la fiche contact. */
export type MandatLigne = {
  id: string;
  agent: string;
  agentCouleur?: string;
  titre: string;
  periode?: string;
  statut?: string;
  numero?: string;
  pdf?: string;
  immeuble?: { id: string; libelle: string };
  prix?: string;
  recherche: boolean;
};

/** Proposition vue depuis la fiche contact. */
export type PropositionLigne = {
  id: string;
  quand: string;
  statut?: string;
  motif?: string;
  commentaire?: string;
  immeuble?: { id: string; libelle: string };
  /** Vraie quand la proposition entre dans le compteur « à relancer ». */
  aRelancer: boolean;
};

/** Visite ou offre — même carte, deux jeux de valeurs. */
export type ActeLigne = {
  id: string;
  agent: string;
  agentCouleur?: string;
  titre: string;
  statut?: string;
  ton: "green" | "red" | "orange";
  details: string[];
  commentaire?: string;
  immeuble?: { id: string; libelle: string };
};

/** Ligne de suivi (le journal du contact). */
export type SuiviLigne = {
  id: string;
  agent: string;
  agentCouleur?: string;
  quand: string;
  type?: string;
  statut?: string;
  canal?: string;
  relance?: string;
  notes: string;
  immeuble?: { id: string; libelle: string };
};

export type ContactData = {
  c: Record<string, unknown>;
  /** Commercial qui suit le contact (champ `SUIVI`, pas `agent`). */
  agent?: { nom: string; initiales: string; couleur?: string };
  /** Qui a créé la fiche, en clair, pour la ligne « Création … par … ». */
  createur?: string;
  /** « (il y a 2 276 jours) » — calculé au rendu serveur : appeler l'horloge
   *  pendant le rendu d'un composant client n'est pas idempotent. */
  anciennete?: string;
  immeubles: ImmeubleLigne[];
  recherches: RechercheCard[];
  mandats: MandatLigne[];
  propositions: PropositionLigne[];
  questions: QuestionCard[];
  visites: ActeLigne[];
  offres: ActeLigne[];
  suivis: SuiviLigne[];
  /** Nombre de propositions encore ouvertes et relançables. */
  aRelancer: number;
  /** Un mandat de recherche en cours : le BO le signale sur chaque recherche. */
  mandatRechercheActif: boolean;
  /** La note que les actes justifient, quand elle est meilleure que celle
   *  enregistrée : le classement monte tout seul dès qu'un acquéreur visite,
   *  fait une offre ou achète. Absente quand la fiche est déjà à jour. */
  promotion?: { note: string; motif: string };
};

const jjmmaa = (v: unknown) => dmy(v);

/** « Archivé le 03/03/26 car N'est pas propriétaire ». */
function phraseArchivage(im: Record<string, unknown>) {
  if (im.archived !== true) return undefined;
  const quand = jjmmaa(im.date_archivage);
  /* Le motif libre dit ce qui s'est vraiment passé (« Locataire parti donc ça
     vaut plus ce prix là ») ; la liste déroulante retombe souvent sur
     « Autre ». On montre le texte quand il existe. */
  const motif = S2(im.motif_archivage_txt) ?? S2(im.Motif_archivage);
  return `Archivé${quand ? ` le ${quand}` : ""}${motif ? ` car ${motif}` : ""}`;
}

const nomFichier = (u: unknown) => {
  const s = S2(u);
  if (!s) return undefined;
  try {
    return decodeURIComponent(s.split("/").pop() ?? "") || undefined;
  } catch {
    return s.split("/").pop() || undefined;
  }
};

export async function getContact(id: string): Promise<ContactData | null> {
  const one = await bq("contact", { constraints: [{ key: "_id", constraint_type: "equals", value: id }], limit: 1 });
  const c = one.results[0];
  if (!c) return null;
  await loadInitials();

  const [immeubles, recherchesBO, propositions, questionsBO, visites, offres, suivis, mandats] = await Promise.all([
    fetchAll("immeuble", [{ key: "PROPRIETAIRE", constraint_type: "equals", value: id }], 200).catch(() => []),
    /* Les recherches passent par le moteur de l'écran Recherches : la carte de
       la fiche est exactement celle de l'écran, compteur « à proposer »
       compris. Les deux lectures sont mises en cache, l'appel est donc gratuit
       en pratique. */
    listRecherchesBO().catch(() => [] as RechercheCard[]),
    fetchAll("proposition", [{ key: "ACHETEUR", constraint_type: "equals", value: id }], 500,
      { field: "date_envoi", desc: true }).catch(() => []),
    listQuestionsBO().catch(() => [] as QuestionCard[]),
    fetchAll("visite", [{ key: "VISITEURs", constraint_type: "contains", value: id }], 200).catch(() => []),
    fetchAll("offre", [{ key: "ACHETEURs", constraint_type: "contains", value: id }], 200).catch(() => []),
    fetchAll("suivi", [{ key: "CONTACT", constraint_type: "equals", value: id }], 300).catch(() => []),
    fetchAll("mandat", [{ key: "MANDANTs", constraint_type: "contains", value: id }], 200).catch(() => []),
  ]);

  /* Un seul aller-retour pour tous les immeubles cités par les autres onglets. */
  const ims = await imLabelMap([
    ...propositions.map((p) => String(p.IMMEUBLE ?? "")),
    ...visites.map((v) => String(v.IMMEUBLE ?? "")),
    ...offres.map((o) => premier(o.IMMEUBLEs)),
    ...suivis.map((s) => premier(s.IMMEUBLEs)),
    ...mandats.map((m) => premier(m.IMMEUBLEs)),
  ]);
  const lien = (imId: string) => {
    const im = ims.get(imId);
    return im ? { id: imId, libelle: imLabel(im) } : undefined;
  };

  const tous = await agents();
  const suivi = tous.find((a) => a.id === String(c.SUIVI ?? ""));
  const createur = tous.find((a) => a.id === String(c["AGENT - Créateur"] ?? ""));

  return {
    c,
    agent: suivi ? { nom: suivi.name, initiales: suivi.initials, couleur: suivi.color } : undefined,
    createur: createur?.name ?? "France Immeuble",
    anciennete: (() => {
      const iso = S2(c["Created Date"]);
      if (!iso) return undefined;
      const j = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
      return j > 0 ? ` (il y a ${j.toLocaleString("fr-FR")} jours)` : undefined;
    })(),

    immeubles: [...immeubles]
      .sort((a, b) => String(a.archived === true) .localeCompare(String(b.archived === true))
        || String(b["Modified Date"] ?? "").localeCompare(String(a["Modified Date"] ?? "")))
      .map((im) => ({
        id: String(im._id),
        agent: initialsOf(im.AGENT),
        agentCouleur: couleurOf(im.AGENT),
        libelle: imLabel(im),
        statut: String(im.Statut ?? "").replace(/^\d+ - /, "") || undefined,
        rang: statutOf(im),
        archive: phraseArchivage(im),
        dossier: typeof im.dossier === "number" && im.dossier > 0 ? `Dossier V${im.dossier}` : undefined,
        mandat: combien(im.MANDATs) > 0 ? `${combien(im.MANDATs)} mandat${combien(im.MANDATs) > 1 ? "s" : ""}` : undefined,
        surface: typeof im.surface_carrez === "number" && im.surface_carrez > 0
          ? `${Math.round(im.surface_carrez as number).toLocaleString("fr-FR")} m²` : undefined,
        occupation: typeof im.occupation_lots === "number" ? `${Math.round(im.occupation_lots as number)} %` : undefined,
        loyers: euros(im.fin_loyers_an) ?? undefined,
        renta: typeof im.fin_renta_ba === "number" && im.fin_renta_ba > 0
          ? `${(im.fin_renta_ba as number).toLocaleString("fr-FR")} %` : undefined,
        prix: euros(im.prix_hai) ?? undefined,
      } satisfies ImmeubleLigne)),

    recherches: recherchesBO.filter((r) => r.contact?.id === id),

    mandats: [...mandats]
      .sort((a, b) => String(b.date_effet ?? "").localeCompare(String(a.date_effet ?? "")))
      .map((m) => {
        const st = S2(m.Statut);
        const recherche = String(m.Type ?? "").toLowerCase().includes("recherche");
        return {
          id: String(m._id),
          agent: initialsOf(m.AGENT),
          agentCouleur: couleurOf(m.AGENT),
          titre: `${S2(m.Type) ?? "Vente"}${S2(m.Type_exclu) ? ` ${m.Type_exclu}` : ""}`,
          periode: [jjmmaa(m.date_effet), jjmmaa(m.date_fin)].filter(Boolean).join(" - ") || undefined,
          statut: st,
          numero: m.numero ? `# ${m.numero}` : undefined,
          pdf: nomFichier(m.pdf_signed) ?? nomFichier(m.pdf),
          immeuble: lien(premier(m.IMMEUBLEs)),
          prix: euros(m.prix_hai) ? `${euros(m.prix_hai)} HAI` : undefined,
          recherche,
        } satisfies MandatLigne;
      }),

    /* « 85 propositions à relancer » : celles qui sont parties, sans réponse, et
       dont on n'a pas coupé les relances. Règle recoupée sur le BO.
       Le tri se fait ici : Supabase ordonne sur du texte JSON, ce qui range
       le 06/07 avant le 13/07. */
    propositions: [...propositions]
      .sort((a, b) => String(b.date_envoi ?? b["Created Date"] ?? "").localeCompare(String(a.date_envoi ?? a["Created Date"] ?? "")))
      .map((p) => {
      const st = S2(p.Statut);
      return {
        id: String(p._id),
        quand: `Proposition du ${jjmmaa(p.date_envoi) ?? jjmmaa(p["Created Date"]) ?? "?"}`,
        statut: st,
        motif: S2(p.motif_refus),
        commentaire: S2(p.commentaire),
        immeuble: lien(String(p.IMMEUBLE ?? "")),
        aRelancer: st === "Envoyée" && p.stop_relances_yn !== true,
      } satisfies PropositionLigne;
    }),

    questions: questionsBO.filter((q) => q.contact?.id === id),

    visites: [...visites]
      .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
      .map((v) => {
        const st = S2(v.Statut);
        return {
          id: String(v._id),
          agent: initialsOf(v.AGENT),
          agentCouleur: couleurOf(v.AGENT),
          titre: `Visite du ${jjmmaa(v.date) ?? "?"}`,
          statut: st,
          ton: st === "Effectuée" ? "green" : st === "Annulée" ? "red" : "orange",
          details: [S2(v.source) ?? "", S2(v.motif_annulation) ?? ""].filter(Boolean),
          commentaire: S2(v.commentaire_interne) ?? S2(v.rex_fi),
          immeuble: lien(String(v.IMMEUBLE ?? "")),
        } satisfies ActeLigne;
      }),

    offres: [...offres]
      .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))
      .map((o) => {
        const st = S2(o.Statut);
        return {
          id: String(o._id),
          agent: initialsOf(premier(o.SUIVIs)),
          agentCouleur: couleurOf(premier(o.SUIVIs)),
          titre: `Offre du ${jjmmaa(o.date) ?? "?"}`,
          statut: st,
          ton: st && ["Acceptée", "Vendu", "Compromis signé", "Vente prévue"].includes(st)
            ? "green" : st === "Refusée" ? "red" : "orange",
          details: [
            euros(o.prix_hai) ? `${euros(o.prix_hai)} HAI` : "",
            euros(o.prix_nv) ? `${euros(o.prix_nv)} net vendeur` : "",
            jjmmaa(o.date_compromis) ? `compromis le ${jjmmaa(o.date_compromis)}` : "",
            jjmmaa(o.date_acte) ? `acte le ${jjmmaa(o.date_acte)}` : "",
            S2(o.motif_refus) ?? "",
          ].filter(Boolean),
          commentaire: S2(o.commentaire),
          immeuble: lien(premier(o.IMMEUBLEs)),
        } satisfies ActeLigne;
      }),

    suivis: [...suivis]
      .sort((a, b) => String(b.date_start ?? b["Created Date"] ?? "").localeCompare(String(a.date_start ?? a["Created Date"] ?? "")))
      .map((s) => ({
        id: String(s._id),
        agent: initialsOf(s.AGENT),
        agentCouleur: couleurOf(s.AGENT),
        quand: jjmmaa(s.date_start ?? s["Created Date"]) ?? "?",
        type: S2(s.Type),
        statut: S2(s.Statut),
        canal: Array.isArray(s.Canals) ? (s.Canals as string[]).join(", ") || undefined : S2(s.Canals),
        relance: jjmmaa(s.date_relance),
        notes: S2(s.notes) ?? "",
        immeuble: lien(premier(s.IMMEUBLEs)),
      } satisfies SuiviLigne)),

    aRelancer: propositions.filter((p) => S2(p.Statut) === "Envoyée" && p.stop_relances_yn !== true).length,

    mandatRechercheActif: mandats.some((m) =>
      String(m.Type ?? "").toLowerCase().includes("recherche") && S2(m.Statut) === "En cours"),

    promotion: (() => {
      /* A : il a acheté, ou son offre est allée jusqu'à l'acceptation.
         B : il a visité ou déposé une offre, quelle qu'en soit l'issue.
         C : on l'a contacté — une proposition partie ou un suivi écrit. */
      const abouti = offres.find((o) =>
        ["Acceptée", "Compromis programmé", "Compromis signé", "Vente prévue", "Vendu"].includes(String(o.Statut ?? "")));
      const merite = abouti ? "A" : offres.length > 0 || visites.length > 0 ? "B"
        : propositions.length > 0 || suivis.length > 0 ? "C" : undefined;
      if (!merite || rangNote(merite) >= rangNote(S2(c.Note))) return undefined;
      const st = String(abouti?.Statut ?? "");
      const quand = jjmmaa(abouti?.date_acte ?? abouti?.date_compromis ?? abouti?.date);
      const motif = merite === "A"
        ? `${st === "Vendu" ? "vendu" : `offre ${st.toLowerCase()}`}${quand ? ` le ${quand}` : ""}`
        : merite === "B"
          ? [offres.length ? `${offres.length} offre${offres.length > 1 ? "s" : ""}` : "",
             visites.length ? `${visites.length} visite${visites.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" et ")
          : `${propositions.length} proposition${propositions.length > 1 ? "s" : ""} envoyée${propositions.length > 1 ? "s" : ""}`;
      return { note: merite, motif };
    })(),
  };
}

/* ============================ Recherche texte ============================
   Le champ de recherche du BO est écrit dans un ordre imposé — « voci romain
   0647… » — et le nom et le prénom sont deux colonnes distinctes. Chercher la
   phrase entière ne pouvait donc pas marcher : « romain » sortait la fiche,
   « romain voc » ne sortait plus rien (retour #123).

   On cherche donc MOT À MOT : chaque mot doit se trouver quelque part, peu
   importe où et dans quel ordre. « romain voci », « voci romain » et
   « cohen j » ramènent la même fiche. */

/** Les mots de la recherche, nettoyés des caractères qui cassent PostgREST. */
export function motsRecherche(q: string): string[] {
  return (q ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    // Réservés du langage de filtre : virgule, parenthèses, guillemets, jokers.
    .map((m) => m.replace(/[%*(),"\\]/g, ""))
    .filter(Boolean)
    // Au-delà de cinq mots, la requête n'apporte plus rien et s'allonge pour rien.
    .slice(0, 5);
}

/**
 * Le filtre PostgREST correspondant : un ET de OU — un OU par mot, sur toutes
 * les colonnes interrogées. Rend `null` quand il n'y a rien à chercher.
 */
export function filtreMots(champs: string[], mots: string[]): [string, string] | null {
  if (!mots.length || !champs.length) return null;
  const liste = (m: string) => champs.map((c) => `data->>${c}.ilike.*${m}*`).join(",");
  if (mots.length === 1) return ["or", `(${liste(mots[0])})`];
  return ["and", `(${mots.map((m) => `or(${liste(m)})`).join(",")})`];
}

/** Recherche globale (mot à mot) : immeubles, contacts, mandats. */
export async function globalSearch(q: string): Promise<{
  immeubles: ListCard[]; contacts: ListCard[]; mandats: ListCard[];
}> {
  await loadInitials();
  const mots = motsRecherche(q);
  if (!mots.length || !USE_SB) return { immeubles: [], contacts: [], mandats: [] };
  /* Nom et prénom sont deux colonnes, et searchfield les écrit dans un seul
     ordre : on interroge les trois, mot à mot (retour #123). */
  const CHAMPS: Record<string, string[]> = {
    immeuble: ["searchfield"],
    contact: ["searchfield", "nom", '"prénom"', "entreprise_nom", "email"],
    mandat: ["searchfield"],
  };
  const search = async (type: string) => {
    const p = new URLSearchParams({ select: "data", limit: "20" });
    const f = filtreMots(CHAMPS[type] ?? ["searchfield"], mots);
    if (f) p.append(f[0], f[1]);
    const res = await fetch(`${SB_URL}/rest/v1/bo_${type}?${p}`, {
      headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY!}` },
      cache: "no-store",
    });
    if (!res.ok) return [] as Record<string, unknown>[];
    return ((await res.json()) as { data: Record<string, unknown> }[]).map((r) => r.data);
  };
  const [ims, cts, mds] = await Promise.all([search("immeuble"), search("contact"), search("mandat")]);
  return {
    immeubles: ims.map((im) => ({
      id: String(im._id), href: `/bien/${im._id}`, avatar: initialsOf(im.AGENT), avatarCouleur: couleurOf(im.AGENT),
      title: imLabel(im), sub: String(im.Statut ?? "").replace(/^\d+ - /, "") || undefined,
      right: [euros(im.prix_hai) ?? ""].filter(Boolean), group: "r",
    })),
    contacts: cts.map((c) => ({
      id: String(c._id), href: `/contact/${c._id}`, avatar: initialsOf(c.SUIVI), avatarCouleur: couleurOf(c.SUIVI),
      title: [c["Civilité"], c["prénom"], c.nom].filter(Boolean).join(" ") || String(c.entreprise_nom ?? "Contact"),
      sub: [c.portable_formatted ?? c.portable, c.email].filter(Boolean).join(" · ") || undefined,
      group: "r",
    })),
    mandats: mds.map((m) => ({
      id: String(m._id), href: `/mandat/${m._id}`, avatar: initialsOf(m.AGENT), avatarCouleur: couleurOf(m.AGENT),
      title: `${m.Type ?? "Vente"} ${m.Type_exclu ?? ""} ${m.numero ? `#${m.numero}` : "· Pas de numéro"}`,
      sub: String(m.Statut ?? "") || undefined, group: "r",
    })),
  };
}

/* ===================== Listes paginées côté serveur =====================
   Les tables volumineuses (42 800 contacts, 27 500 propositions) ne peuvent
   pas être chargées entièrement dans le navigateur : on demande à Supabase la
   tranche voulue et le total exact, et la recherche se fait en base. */

export type PageListe = { rows: ListCard[]; total: number };

/** Une tranche de table avec total exact, recherche et tri. */
async function sbPage(
  type: string,
  opts: {
    q?: string;
    /** Colonnes jsonb interrogées par la recherche. */
    champs: string[];
    page: number;
    taille: number;
    tri?: string;
    /** Filtres supplémentaires `clé=valeur` sur le jsonb. */
    egal?: Record<string, string>;
  },
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  if (!SB_KEY) return { rows: [], total: 0 };
  const p = new URLSearchParams({ select: "data" });
  /* Mot à mot, dans n'importe quel ordre : « romain voc » et « voci romain »
     doivent tomber sur la même fiche (retour #123). */
  const f = filtreMots(opts.champs, motsRecherche(opts.q ?? ""));
  if (f) p.append(f[0], f[1]);
  for (const [k, v] of Object.entries(opts.egal ?? {})) {
    p.append(`data->>${/^\w+$/.test(k) ? k : `"${k}"`}`, `eq.${v}`);
  }
  p.set("order", `${opts.tri ?? "bubble_modified"}.desc`);
  p.set("limit", String(opts.taille));
  p.set("offset", String((opts.page - 1) * opts.taille));
  // Même cache et même étiquette que le reste des lectures : une page de
  // contacts revue trois secondes plus tard ne repart pas au serveur.
  const { lignes, total } = await lirePage(type, p.toString(), true).catch(() => ({ lignes: [], total: 0 }));
  return { rows: lignes, total };
}

/** Contacts : la table fait 42 800 lignes, tout passe par la base. */
/**
 * La qualité d'un contact, telle que le BO l'écrit sous son nom.
 *
 * Un particulier reste « Particulier ». Une personne morale prend le nom de sa
 * société. Un agent immobilier est nommé comme tel, son agence entre
 * parenthèses quand on la connaît — c'est ce qui évite d'écrire à un confrère
 * comme on écrirait à un vendeur.
 */
function qualiteContact(c: Record<string, unknown>): string {
  const societe = S2(c.entreprise_nom);
  const agent = c.agent === true
    || (Array.isArray(c.Types) && (c.Types as string[]).includes("Agent immobilier"));
  if (agent) return societe ? `Agent immobilier (${societe})` : "Agent immobilier";
  return societe ?? "Particulier";
}

const combien = (v: unknown) => (Array.isArray(v) ? v.length : 0);

export async function listContactsPage(
  q: string, page: number, taille: number,
  /** Identifiant d'agent, ou vide pour tous les contacts. */
  agentId = "",
): Promise<PageListe> {
  await loadInitials();
  const { rows, total } = await sbPage("contact", {
    q, page, taille,
    champs: ["searchfield", "nom", '"prénom"', "email", "portable", "entreprise_nom"],
    egal: agentId ? { SUIVI: agentId } : undefined,
  });
  return {
    total,
    rows: rows.map((c) => {
      const nom = [c["Civilité"], c["prénom"], c.nom].filter(Boolean).join(" ");
      const estAgent = c.agent === true
        || (Array.isArray(c.Types) && (c.Types as string[]).includes("Agent immobilier"));
      return {
        id: String(c._id),
        href: `/contact/${c._id}`,
        avatar: initialsOf(c.SUIVI), avatarCouleur: couleurOf(c.SUIVI),
        title: nom || String(c.entreprise_nom ?? "Contact"),
        sub: [c.portable_formatted ?? c.portable, c.email].filter(Boolean).join(" · ") || undefined,
        qualite: qualiteContact(c),
        estAgent,
        compteurs: { recherches: combien(c.RECHERCHEs), immeubles: combien(c.IMMEUBLES) },
        grade: gradeOf(c),
        group: "tous",
      } satisfies ListCard;
    }),
  };
}

/** Propositions : ~27 500 lignes, même traitement. */
export async function listPropositionsPage(q: string, page: number, taille: number): Promise<PageListe> {
  await loadInitials();
  const { rows, total } = await sbPage("proposition", {
    q, page, taille,
    champs: ["searchfield", "mail_adresse", "Statut"],
  });
  const ims = await imLabelMap(rows.map((p) => String(p.IMMEUBLE ?? "")));
  const contacts = await contactMap(rows.map((p) => String(p.ACHETEUR ?? p.CONTACT ?? "")));
  return {
    total,
    rows: rows.map((p) => {
      const st = String(p.Statut ?? "");
      const c = contacts.get(String(p.ACHETEUR ?? p.CONTACT ?? ""));
      return {
        id: String(p._id),
        href: p.IMMEUBLE ? `/bien/${p.IMMEUBLE}` : undefined,
        avatar: initialsOf(p.AGENT), avatarCouleur: couleurOf(p.AGENT),
        title: `Proposition du ${dmy(p.date_envoi ?? p["Created Date"]) ?? "?"}`,
        sub: imLabel(ims.get(String(p.IMMEUBLE ?? ""))) || undefined,
        acquereur: contactLabel(c) || undefined,
        grade: gradeOf(c),
        badge: st ? { label: st, tone: st === "Acceptée" ? "green" : st === "Refusée" ? "red" : "orange" } : undefined,
        group: "toutes",
      } satisfies ListCard;
    }),
  };
}

/* ===================== Objectifs ===================== */

/** Libellés du BO et répartition prioritaires / secondaires (relevés sur les
 *  captures : les prioritaires sont les 5 objectifs de la chaîne de vente). */
const OBJECTIFS_META: Record<string, { label: string; unite: "nb" | "pct"; priorite: "prioritaire" | "secondaire" }> = {
  "Formulaires": { label: "Formulaires transformés", unite: "pct", priorite: "prioritaire" },
  "Immeubles": { label: "Immeubles créés", unite: "nb", priorite: "prioritaire" },
  "Estimations": { label: "Immeubles estimés", unite: "nb", priorite: "prioritaire" },
  "Mandats (%)": { label: "Mandats signés (%)", unite: "pct", priorite: "prioritaire" },
  "Offres": { label: "Offres", unite: "nb", priorite: "prioritaire" },
  "Recherches": { label: "Recherches créées", unite: "nb", priorite: "secondaire" },
  "Mandats (nb)": { label: "Mandats signés", unite: "nb", priorite: "secondaire" },
  "Retours A/B": { label: "Retour des propositions A et B", unite: "pct", priorite: "secondaire" },
  "Retours C/D": { label: "Retour des propositions C et D", unite: "pct", priorite: "secondaire" },
};

export type Objectif = {
  id: string;
  type: string;
  label: string;
  unite: "nb" | "pct";
  priorite: "prioritaire" | "secondaire";
  ordre: number;
  /** Agent concerné, absent pour l'objectif France Immeuble. */
  agent?: string;
  periode: string;
  debut: string;
  fin: string;
  cible: number;
  valeur: number;
  avancement: number;
  /** Éléments comptabilisés : réussis, manqués, total. */
  reussis: string[];
  manques: string[];
  tous: string[];
};

export type ObjectifsData = {
  objectifs: Objectif[];
  /** Libellé des éléments listés au dépliage (immeuble, contact…). */
  libelles: Record<string, string>;
  periodes: string[];
};

/** Objectifs d'une période (mois), tous agents confondus. */
export async function getObjectifs(periode?: string): Promise<ObjectifsData> {
  const rows = await fetchAll("objectif", undefined, 4000).catch(() => []);
  const noms = new Map((await agents()).map((a) => [a.id, a.name] as const));

  const mois = (d: unknown) => (typeof d === "string" ? d.slice(0, 7) : "");
  const periodes = [...new Set(rows.map((o) => mois(o.start)).filter(Boolean))].sort().reverse();
  const cible = periode && periodes.includes(periode) ? periode : periodes[0];

  const objectifs = rows
    .filter((o) => mois(o.start) === cible)
    .map((o) => {
      const type = String(o.Type ?? "");
      const meta = OBJECTIFS_META[type] ?? { label: type, unite: "nb" as const, priorite: "secondaire" as const };
      const liste = (k: string) => (Array.isArray(o[k]) ? (o[k] as string[]) : []);
      return {
        id: String(o._id),
        type,
        label: meta.label,
        unite: meta.unite,
        priorite: meta.priorite,
        ordre: typeof o.ordre === "number" ? (o.ordre as number) : 99,
        agent: typeof o.AGENT === "string" ? (noms.get(o.AGENT as string) ?? "Agent") : undefined,
        periode: cible,
        debut: String(o.start ?? ""),
        fin: String(o.end ?? ""),
        cible: typeof o.objectif === "number" ? (o.objectif as number) : 0,
        valeur: typeof o.out_front_value === "number" ? (o.out_front_value as number) : 0,
        avancement: typeof o["completion_%"] === "number" ? (o["completion_%"] as number) : 0,
        reussis: liste("out_done_ids"),
        manques: liste("out_failed_ids"),
        tous: liste("out_all_ids"),
      } satisfies Objectif;
    })
    .sort((a, b) => a.ordre - b.ordre || (a.agent ?? "").localeCompare(b.agent ?? ""));

  // Libellés des éléments comptés : immeubles d'abord, contacts ensuite.
  const ids = [...new Set(objectifs.flatMap((o) => o.tous))].slice(0, 400);
  const libelles: Record<string, string> = {};
  const [imsO, ctsO] = await Promise.all([parIds("immeuble", ids), parIds("contact", ids)]);
  imsO.forEach((im) => { libelles[String(im._id)] = imLabel(im); });
  ctsO.forEach((c) => { libelles[String(c._id)] = contactLabel(c) || String(c.email ?? ""); });

  return { objectifs, libelles, periodes };
}

/* ===================== Acheteurs : matching & commercialisation ===================== */

export type AcheteursData = {
  /** Toutes les recherches actives, servant de vivier au matching. */
  recherches: Record<string, unknown>[];
  contacts: Map<string, Record<string, unknown>>;
  matchs: Record<string, unknown>[];
  commercialisations: Record<string, unknown>[];
  criteres: import("@/lib/bo/matching").CriteresBien;
};

/** Vivier acquéreurs + historique des campagnes d'un immeuble. */
export async function getAcheteurs(immeubleId: string): Promise<AcheteursData | null> {
  const one = await bq("immeuble", { constraints: [{ key: "_id", constraint_type: "equals", value: immeubleId }], limit: 1 });
  const im = one.results[0];
  if (!im) return null;

  const [recherches, matchs, commercialisations, adresses] = await Promise.all([
    fetchAll("recherche", [{ key: "archived", constraint_type: "equals", value: "false" }], 4000).catch(() => []),
    fetchAll("match", [{ key: "in_IMMEUBLE", constraint_type: "equals", value: immeubleId }], 100).catch(() => []),
    fetchAll("commercialisation", [{ key: "IMMEUBLE", constraint_type: "equals", value: immeubleId }], 100).catch(() => []),
    fetchAll("adresse", [{ key: "IMMEUBLE", constraint_type: "equals", value: immeubleId }], 2).catch(() => []),
  ]);

  // Les recherches pointent 1 900 contacts : les charger d'un bloc coûte
  // moins qu'une vingtaine de requêtes « id in (…) » à la chaîne.
  const contacts = new Map<string, Record<string, unknown>>();
  for (const c of await fetchAll("contact", undefined, 6000).catch(() => [])) {
    contacts.set(String(c._id), c);
  }

  // La ville et le code postal vivent sur l'enregistrement « adresse ».
  const adr = adresses[0];
  const cp = String(adr?.zipcode ?? "");
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  // « Mixte » ne désigne pas une destination attendue par les acquéreurs :
  // c'est l'absence de destination unique, donc aucune contrainte.
  const dest = String(im.Destination_principale ?? "");

  return {
    recherches,
    contacts,
    matchs: [...matchs].sort((a, b) => String(b["Created Date"] ?? "").localeCompare(String(a["Created Date"] ?? ""))),
    commercialisations: [...commercialisations].sort((a, b) =>
      String(b["Created Date"] ?? "").localeCompare(String(a["Created Date"] ?? "")),
    ),
    criteres: {
      immeubleId,
      prix: num(im.prix_hai),
      surface: num(im.surface_carrez),
      occupation: num(im.occupation_lots),
      renta: num(im.fin_renta_ba),
      travaux: num(im.travaux_total),
      ville: String(adr?.ville_name ?? ""),
      departement: cp.slice(0, 2),
      destinations: dest && dest !== "Mixte" ? [dest] : [],
      cibles: Array.isArray(im.Cibles) ? (im.Cibles as string[]) : [],
    },
  };
}

/* ============================================================ Module Mails
 *
 * Livraison 1 : l'écran est servi par `bo_mail`, la table que le BO Bubble
 * remplit depuis toujours à chaque envoi (657 lignes, déjà rattachées à
 * l'immeuble, l'estimation et le suivi). La relève IMAP viendra alimenter la
 * même table avec les messages entrants — l'écran n'aura pas à changer.
 */

export type FilMail = {
  id: string;
  /** Entrant ou sortant. Tant qu'IMAP n'est pas branché : tout est sortant. */
  entrant: boolean;
  objet: string;
  extrait: string;
  corps: string;
  /** Nom lisible de l'interlocuteur (pas de l'agent). */
  qui: string;
  adresse: string;
  date?: string;
  contactId?: string;
  immeubleId?: string;
  immeubleLabel?: string;
  estimationId?: string;
  suiviId?: string;
  /** Nombre de pièces jointes. */
  pj: number;
  /** Pile d'affichage : rattaché à une affaire, ou à classer. */
  pile: "affaires" | "a_classer";
};

/** Le corps des mails du BO porte un balisage façon BBCode : on le retire. */
const texteBrut = (v: unknown) =>
  typeof v === "string"
    ? v.replace(/\[url=[^\]]*\]|\[\/?[a-z]+\]/gi, "").replace(/\s+/g, " ").trim()
    : "";

export async function listMails(limite = 200): Promise<FilMail[]> {
  const rows = await fetchAll("mail", undefined, limite, { field: "Created Date", desc: true }).catch(() => []);
  if (rows.length === 0) return [];

  const ims = await imLabelMap(rows.map((m) => String(m.IMMEUBLE ?? "")));
  const contactIds = [...new Set(rows.flatMap((m) => [String(m.TO ?? ""), String(m.FROM ?? "")]).filter(Boolean))];
  const contacts = new Map<string, Record<string, unknown>>();
  for (const c of await parIds("contact", contactIds)) contacts.set(String(c._id), c);

  return rows.map((m) => {
    // Sans direction enregistrée, un mail de `bo_mail` est un envoi du BO :
    // c'est la seule chose que Bubble écrivait. IMAP posera `direction`.
    const entrant = m.direction === "in";
    const imId = typeof m.IMMEUBLE === "string" ? (m.IMMEUBLE as string) : undefined;
    // L'interlocuteur, c'est toujours l'autre : le destinataire d'un envoi,
    // l'expéditeur d'une réception.
    const autreId = String((entrant ? m.FROM : m.TO) ?? "");
    const autre = contacts.get(autreId);
    const corps = texteBrut(m.body);
    const im = imId ? ims.get(imId) : undefined;
    return {
      id: String(m._id),
      entrant,
      objet: typeof m.subject === "string" && m.subject ? (m.subject as string) : "(sans objet)",
      extrait: corps.slice(0, 150),
      corps,
      qui: contactLabel(autre) || String(m.to ?? m.sender_name ?? "—"),
      adresse: String((entrant ? m.from : m.to) ?? ""),
      date: typeof m.date_envoi === "string" ? (m.date_envoi as string)
        : typeof m["Created Date"] === "string" ? (m["Created Date"] as string) : undefined,
      contactId: autreId || undefined,
      immeubleId: imId,
      immeubleLabel: im ? String(im.adresse_ville ?? "") : undefined,
      estimationId: typeof m.ESTIMATION === "string" ? (m.ESTIMATION as string) : undefined,
      suiviId: typeof m.SUIVI === "string" ? (m.SUIVI as string) : undefined,
      pj: Array.isArray(m.FILEs) ? (m.FILEs as unknown[]).length : 0,
      pile: imId || m.ESTIMATION ? "affaires" : "a_classer",
    } satisfies FilMail;
  });
}

/** Le vivier des salves (retour #108) : contacts, immeubles et recherches
 *  assemblés en candidats triables. Les trois lectures sont déjà en cache et
 *  partagées avec les écrans Contacts et Recherches — cet appel ne coûte donc
 *  rien de plus une fois l'app chaude. */
export async function vivierMails(): Promise<Vivier> {
  const [contacts, immeubles, recherches] = await Promise.all([
    fetchAll("contact", undefined, 5000).catch(() => []),
    fetchAll("immeuble", [{ key: "archived", constraint_type: "equals", value: "false" }], 3000).catch(() => []),
    fetchAll("recherche", undefined, 3000).catch(() => []),
  ]);
  return assemblerVivier(contacts, immeubles, recherches);
}

/** Les échanges d'un contact, pour l'onglet « Échanges » de sa fiche. */
export async function mailsDuContact(contactId: string): Promise<FilMail[]> {
  const [recus, envoyes] = await Promise.all([
    fetchAll("mail", [{ key: "FROM", constraint_type: "equals", value: contactId }], 100).catch(() => []),
    fetchAll("mail", [{ key: "TO", constraint_type: "equals", value: contactId }], 100).catch(() => []),
  ]);
  const rows = [...recus, ...envoyes].filter((m, i, t) => t.findIndex((x) => x._id === m._id) === i);
  if (rows.length === 0) return [];
  const ims = await imLabelMap(rows.map((m) => String(m.IMMEUBLE ?? "")));
  return rows
    .map((m) => {
      const corps = texteBrut(m.body);
      const imId = typeof m.IMMEUBLE === "string" ? (m.IMMEUBLE as string) : undefined;
      const im = imId ? ims.get(imId) : undefined;
      return {
        id: String(m._id),
        entrant: m.direction === "in" || m.FROM === contactId,
        objet: typeof m.subject === "string" && m.subject ? (m.subject as string) : "(sans objet)",
        extrait: corps.slice(0, 150),
        corps,
        qui: "",
        adresse: String(m.to ?? ""),
        date: typeof m.date_envoi === "string" ? (m.date_envoi as string)
          : typeof m["Created Date"] === "string" ? (m["Created Date"] as string) : undefined,
        contactId,
        immeubleId: imId,
        immeubleLabel: im ? String(im.adresse_ville ?? "") : undefined,
        estimationId: typeof m.ESTIMATION === "string" ? (m.ESTIMATION as string) : undefined,
        suiviId: typeof m.SUIVI === "string" ? (m.SUIVI as string) : undefined,
        pj: Array.isArray(m.FILEs) ? (m.FILEs as unknown[]).length : 0,
        pile: imId ? "affaires" : "a_classer",
      } satisfies FilMail;
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
}

/* ========================================================= Découpe (option A)
 *
 * La couche opération vit dans CE projet, au-dessus de bo_immeuble : c'est là
 * que sont les 1 827 immeubles, les contacts, les mandats et les agents.
 */

export type OperationDecoupe = {
  id: string;
  immeubleId: string;
  statut: string;
  phase: number;
  valeurBloc?: number;
  valeurDecoupe?: number;
  notes?: string;
  ouverteLe?: string;
  fermeeLe?: string;
  /** Repères de l'immeuble, pour lister sans recharger la fiche. */
  ville?: string;
  adresse?: string;
  photoUrl?: string;
  /** La photo principale est une capture Street View, à remplacer. */
  facadeRue?: boolean;
  /** Lots de l'immeuble : total, et ceux qui ne sont plus occupés. */
  lots?: number;
  lotsLibres?: number;
};

const versOperation = (o: Record<string, unknown>): OperationDecoupe => ({
  id: String(o._id),
  immeubleId: String(o.IMMEUBLE ?? ""),
  statut: typeof o.statut === "string" ? (o.statut as string) : "Prospection",
  phase: Number(o.phase ?? 1) || 1,
  valeurBloc: typeof o.valeur_bloc === "number" ? (o.valeur_bloc as number) : undefined,
  valeurDecoupe: typeof o.valeur_decoupe === "number" ? (o.valeur_decoupe as number) : undefined,
  notes: typeof o.notes === "string" ? (o.notes as string) : undefined,
  ouverteLe: typeof o.ouverte_le === "string" ? (o.ouverte_le as string) : undefined,
  fermeeLe: typeof o.fermee_le === "string" ? (o.fermee_le as string) : undefined,
});

/** L'opération d'un immeuble, s'il en a une. */
export async function getOperation(immeubleId: string): Promise<OperationDecoupe | null> {
  const rows = await fetchAll("operation", [{ key: "IMMEUBLE", constraint_type: "equals", value: immeubleId }], 1)
    .catch(() => []);
  return rows[0] ? versOperation(rows[0]) : null;
}

/** Toutes les opérations, enrichies des repères de leur immeuble. */
export async function listOperations(): Promise<OperationDecoupe[]> {
  const rows = await fetchAll("operation", undefined, 200, { field: "Created Date", desc: true }).catch(() => []);
  if (rows.length === 0) return [];
  const ops = rows.map(versOperation);
  const ims = await imLabelMap(ops.map((o) => o.immeubleId));

  // Les lots servent au « x/y vendus » du tableau de bord : on les compte en
  // une seule requête pour tous les immeubles, pas une par opération.
  const lots = await fetchAll(
    "lot",
    [{ key: "IMMEUBLE", constraint_type: "in", value: ops.map((o) => o.immeubleId).filter(Boolean) }],
    500,
  ).catch(() => []);
  const parIm = new Map<string, { total: number; libres: number }>();
  for (const l of lots) {
    const k = String(l.IMMEUBLE ?? "");
    const e = parIm.get(k) ?? { total: 0, libres: 0 };
    e.total++;
    if (!(typeof l.loyer === "number" && (l.loyer as number) > 0)) e.libres++;
    parIm.set(k, e);
  }

  return ops.map((o) => {
    const im = ims.get(o.immeubleId);
    const c = parIm.get(o.immeubleId);
    const photo = typeof im?.photo_main_compressed === "string" && im.photo_main_compressed.length > 0;
    return {
      ...o,
      ville: im ? `${im.adresse_ville ?? ""} (${im.adresse_dpt ?? ""})` : undefined,
      adresse: im ? [im.adresse_numero_rue, im.adresse_rue].filter(Boolean).join(" ") : undefined,
      photoUrl: photo ? photoProxy(im!.photo_main_compressed) : undefined,
      facadeRue: estFacadeRue(im?.photo_main_compressed),
      lots: c?.total ?? 0,
      lotsLibres: c?.libres ?? 0,
    };
  });
}

/* ---------- Diffusion Plein Bail ---------- */

/** Les immeubles dont une annonce existe côté marketplace. */
export async function listDiffusion(): Promise<{
  immeubleId: string;
  ville: string;
  adresse: string;
  prix?: number;
  statut?: string;
  url?: string;
  publieLe?: string;
  empreintePubliee?: string;
  aResynchroniser: boolean;
  erreur?: string;
}[]> {
  /* Le parc diffusé se compte en dizaines. On ne ramène donc QUE les fiches
     qui portent une annonce : le tri se fait dans la base. Le filtre était
     auparavant appliqué en mémoire, après avoir rapatrié les mille huit cents
     immeubles — sept mégaoctets pour en afficher une poignée. */
  const rows = await fetchAll(
    "immeuble",
    [{ key: "pb_listing_id", constraint_type: "is not empty", value: true }],
    3000,
  ).catch(() => []);
  return rows
    .filter((im) => typeof im.pb_listing_id === "string" && im.pb_listing_id)
    .map((im) => ({
      immeubleId: String(im._id),
      ville: `${im.adresse_ville ?? ""} (${im.adresse_zipcode ?? ""})`,
      adresse: [im.adresse_numero_rue, im.adresse_rue].filter(Boolean).join(" "),
      prix: typeof im.prix_hai === "number" ? (im.prix_hai as number) : undefined,
      statut: typeof im.pb_statut === "string" ? (im.pb_statut as string) : undefined,
      url: typeof im.pb_url === "string" ? (im.pb_url as string) : undefined,
      publieLe: typeof im.pb_publie_le === "string" ? (im.pb_publie_le as string) : undefined,
      empreintePubliee: typeof im.pb_empreinte === "string" ? (im.pb_empreinte as string) : undefined,
      aResynchroniser: im.pb_a_resynchroniser === true,
      erreur: typeof im.pb_erreur === "string" ? (im.pb_erreur as string) : undefined,
    }))
    .sort((a, b) => (b.publieLe ?? "").localeCompare(a.publieLe ?? ""));
}

/* ============================ Écran Recherches ============================
   Reprise du BO (retours #116 et #117). La carte d'une recherche dit tout
   d'un coup d'œil : à qui elle appartient, où elle porte, ce qu'elle cherche,
   et surtout combien d'immeubles on pourrait lui envoyer sans se répéter. */

export type RechercheCard = {
  id: string;
  agent: string;
  agentCouleur?: string;
  /** « France entière », ou les régions, départements et villes visés. */
  lieux: string[];
  /** Destinations recherchées — pictos allumés ou éteints. */
  destinations: string[];
  cible?: string;
  /** Libellés des quatre puces ; absent = critère non renseigné. */
  surface?: string;
  occupation?: string;
  prix?: string;
  renta?: string;
  commentaire?: string;
  contact?: {
    id: string;
    nom: string;
    note?: string;
    qualite: string;
    tel?: string;
    email?: string;
    immeubles: number;
    recherches: number;
  };
  /** Coordonnées brutes quand la fiche contact n'existe pas encore. */
  orphelin?: { email?: string; tel?: string };
  /** Immeubles en mandat qui correspondent et qu'on ne lui a jamais envoyés. */
  aProposer: number;
  group: "en_cours" | "en_attente" | "archivees";
  date?: string;
};

const TITRES_CIBLE: Record<string, string> = {
  Investisseur: "Investissement locatif",
  Marchand: "Opération marchande",
  Promoteur: "Opération de promotion",
  Patrimonial: "Immeuble patrimonial",
};

/** Une fourchette en toutes lettres, ou rien si les deux bornes manquent. */
function fourchette(min: unknown, max: unknown, fmt: (v: number) => string) {
  const a = typeof min === "number" && min > 0 ? min : undefined;
  const b = typeof max === "number" && max > 0 ? max : undefined;
  if (a === undefined && b === undefined) return undefined;
  if (a !== undefined && b !== undefined) return `${fmt(a)} à ${fmt(b)}`;
  return a !== undefined ? `≥ ${fmt(a)}` : `≤ ${fmt(b!)}`;
}

export async function listRecherchesBO(): Promise<RechercheCard[]> {
  await loadInitials();
  const [rechs, ims] = await Promise.all([
    fetchAll("recherche", undefined, 3000, { field: "Modified Date", desc: true }).catch(() => []),
    /* Les biens qu'on peut réellement proposer : commercialisés, pas encore
       vendus ni retirés. Proposer un immeuble sous compromis ferait perdre du
       temps à tout le monde. */
    fetchAll("immeuble", [{ key: "archived", constraint_type: "equals", value: "false" }], 3000)
      .catch(() => []),
  ]);

  const dispo = ims.filter((im) => {
    const rang = statutOf(im);
    return rang >= 5 && rang <= 7;
  });

  const contacts = new Map<string, Record<string, unknown>>();
  for (const c of await parIds("contact", rechs.map((r) => r.ACHETEUR))) {
    contacts.set(String(c._id), c);
  }

  /* Le dédoublonnage demandé : un immeuble déjà envoyé à un acquéreur sur SA
     recherche marchand ne doit plus apparaître comme « à proposer » sur sa
     recherche investisseur. On raisonne donc par personne, pas par recherche. */
  const dejaVuParContact = new Map<string, Set<string>>();
  for (const r of rechs) {
    const cid = String(r.ACHETEUR ?? "") || `orphelin:${r._id}`;
    const set = dejaVuParContact.get(cid) ?? new Set<string>();
    for (const id of (Array.isArray(r.IMMEUBLEs_proposed) ? r.IMMEUBLEs_proposed : []) as string[]) set.add(String(id));
    for (const id of (Array.isArray(r.IMMEUBLES_hidden) ? r.IMMEUBLES_hidden : []) as string[]) set.add(String(id));
    dejaVuParContact.set(cid, set);
  }

  const criteres = dispo.map((im) => ({
    immeubleId: String(im._id),
    prix: typeof im.prix_hai === "number" ? (im.prix_hai as number) : undefined,
    surface: typeof im.surface_carrez === "number" ? (im.surface_carrez as number) : undefined,
    occupation: typeof im.occupation_lots === "number" ? (im.occupation_lots as number) : undefined,
    renta: typeof im.fin_renta_ba === "number" ? (im.fin_renta_ba as number) : undefined,
    ville: S2(im.adresse_ville),
    departement: S2(im.adresse_zipcode)?.slice(0, 2),
    destinations: typeof im.Destination_principale === "string" ? [im.Destination_principale as string] : [],
    cibles: Array.isArray(im.Cibles) ? (im.Cibles as string[]) : [],
  }));

  return rechs.map((r) => {
    const c = contacts.get(String(r.ACHETEUR ?? ""));
    const cid = String(r.ACHETEUR ?? "") || `orphelin:${r._id}`;
    const vus = dejaVuParContact.get(cid) ?? new Set<string>();

    const aProposer = r.archived === true || r.standby === true
      ? 0
      : criteres.filter((b) => !vus.has(b.immeubleId) && correspond(r, b)).length;

    const lieux = [
      ...(Array.isArray(r.villes) ? (r.villes as string[]) : []).filter((v) => !/^\d{13}x\d+$/.test(v)),
      ...(Array.isArray(r.dpts) ? (r.dpts as string[]) : []).filter((d) => /^\d{2,3}[AB]?$/.test(d)),
    ];

    return {
      id: String(r._id),
      agent: initialsOf(r.SUIVI),
      agentCouleur: couleurOf(r.SUIVI),
      lieux: lieux.length ? lieux : ["France entière"],
      destinations: Array.isArray(r.Destinations) ? (r.Destinations as string[]) : [],
      cible: TITRES_CIBLE[String(r.Cible ?? "")] ?? S2(r.Cible),
      surface: fourchette(r.surface_min, r.surface_max, (v) => `${Math.round(v)} m²`),
      occupation: fourchette(r.occup_min, r.occup_max, (v) => `${Math.round(v)} %`),
      prix: fourchette(r.prix_min, r.prix_max, (v) => euros(v) ?? `${v}`),
      renta: typeof r.renta === "number" && r.renta > 0
        ? `≥ ${(r.renta as number).toLocaleString("fr-FR")} %` : undefined,
      commentaire: S2(r.commentaire),
      contact: c
        ? {
            id: String(c._id),
            nom: contactLabel(c) || String(c.entreprise_nom ?? "Contact"),
            note: gradeOf(c),
            qualite: qualiteContact(c),
            tel: S2(c.portable_formatted) ?? S2(c.portable),
            email: S2(c.email),
            immeubles: combien(c.IMMEUBLES),
            recherches: combien(c.RECHERCHEs),
          }
        : undefined,
      orphelin: c ? undefined : { email: S2(r.email), tel: S2(r.phone) },
      aProposer,
      group: r.archived === true ? "archivees" : r.standby === true ? "en_attente" : "en_cours",
      date: typeof r["Modified Date"] === "string" ? (r["Modified Date"] as string) : undefined,
    } satisfies RechercheCard;
  });
}

/* ============================ Écran Questions ============================
   Les demandes reçues depuis le site (retour #118). Chacune finit de trois
   façons : on crée le contact, on la clôture, ou les deux. */

export type QuestionCard = {
  id: string;
  agent: string;
  agentCouleur?: string;
  /** « Question du 16/07/26 - 15h11 ». */
  quand: string;
  source: string;
  message: string;
  telephone?: string;
  email?: string;
  projet?: string;
  contact?: { id: string; nom: string; note?: string };
  immeuble?: { id: string; libelle: string };
  clos: boolean;
  remarques?: string;
  date?: string;
};

export async function listQuestionsBO(): Promise<QuestionCard[]> {
  await loadInitials();
  const rows = await fetchAll("question", undefined, 1000, { field: "Created Date", desc: true })
    .catch(() => []);
  const [ims, contacts] = await Promise.all([
    imLabelMap(rows.map((q) => String(q.IMMEUBLE ?? ""))),
    parIds("contact", rows.map((q) => q.CONTACT)),
  ]);
  const parId = new Map(contacts.map((c) => [String(c._id), c]));

  return rows.map((q) => {
    /* `suivi par` est une LISTE d'identifiants côté Bubble : la passer telle
       quelle aux initiales renvoyait « FI » sur toutes les questions. */
    const suivi = Array.isArray(q["suivi par"])
      ? (q["suivi par"] as string[])[0]
      : q["suivi par"];
    const d = typeof q["Created Date"] === "string" ? new Date(q["Created Date"] as string) : null;
    const c = parId.get(String(q.CONTACT ?? ""));
    const im = ims.get(String(q.IMMEUBLE ?? ""));
    return {
      id: String(q._id),
      agent: initialsOf(suivi),
      agentCouleur: couleurOf(suivi),
      quand: d
        ? `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })} - ${d
            .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
            .replace(":", "h")}`
        : "",
      source: S2(q.source) ?? "Site",
      message: (S2(q.message) ?? "").trim(),
      telephone: S2(q["téléphone"]),
      email: S2(q.email),
      projet: S2(q.Projet),
      contact: c ? { id: String(c._id), nom: contactLabel(c) || String(c.email ?? "Contact"), note: gradeOf(c) } : undefined,
      immeuble: im ? { id: String(im._id), libelle: imLabel(im) } : undefined,
      clos: q.ended === true,
      remarques: S2(q.remarques_cloture),
      date: typeof q["Created Date"] === "string" ? (q["Created Date"] as string) : undefined,
    } satisfies QuestionCard;
  });
}
