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

const TOKEN = process.env.BUBBLE_API_TOKEN;
const ROOT = (process.env.BUBBLE_APP_URL || "https://vente.france-immeuble.fr")
  .trim()
  .split(/\s+/)[0]
  .replace(/\/+$/, "")
  .replace(/\/api\/1\.1\/obj$/, "")
  .replace(/\/version-test$/, "");

const REVALIDATE = 120; // secondes de cache par requête

export const AGENT_IDS: Record<string, { id: string; name: string; initials: string }> = {
  // Mapping vérifié : MAV = 106 immeubles actifs ; Romain = compteurs 5/15/16 des captures.
  "marc-antoine": { id: "1565404488771x470475486480623740", name: "Marc-Antoine", initials: "MAV" },
  romain: { id: "1774279722391x446415073281754000", name: "Romain", initials: "RV" },
  // TODO: confirmer les 3 mappings suivants (noms du sélecteur d'agent du BO).
  guillaume: { id: "1677062113544x976734254041606900", name: "Guillaume", initials: "G" },
  francois: { id: "1565404520377x697816437227848800", name: "François", initials: "F" },
  sophie: { id: "1630466502391x893427918358294500", name: "Sophie", initials: "S" },
};

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
    else if (c.constraint_type === "equals")
      // Les clés Bubble exotiques (espaces, « 0 - IMMEUBLE ») doivent être citées côté PostgREST.
      p.append(`data->>${/^\w+$/.test(c.key) ? c.key : `"${c.key}"`}`, `eq.${c.value}`);
    else if (c.constraint_type === "contains")
      p.append("data", `cs.${JSON.stringify({ [c.key]: [c.value] })}`);
  }
  return p;
}

async function sbq(
  type: string,
  opts: { constraints?: Constraint[]; limit?: number; cursor?: number; sort?: string; desc?: boolean } = {},
): Promise<{ results: Record<string, unknown>[]; remaining: number }> {
  const p = sbParams(opts.constraints);
  p.set("limit", String(opts.limit ?? 100));
  p.set("offset", String(opts.cursor ?? 0));
  if (opts.sort) p.set("order", `${SORT_COL[opts.sort] ?? "bubble_modified"}.${opts.desc ? "desc" : "asc"}`);
  const res = await fetch(`${SB_URL}/rest/v1/bo_${type}?${p}`, {
    headers: {
      apikey: SB_KEY!,
      Authorization: `Bearer ${SB_KEY!}`,
      Prefer: "count=exact",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} sur bo_${type}`);
  const rows = (await res.json()) as { data: Record<string, unknown> }[];
  const range = res.headers.get("content-range"); // ex. "0-99/1824"
  const total = range ? parseInt(range.split("/")[1], 10) || 0 : rows.length;
  const cursor = opts.cursor ?? 0;
  return { results: rows.map((r) => r.data), remaining: Math.max(0, total - cursor - rows.length) };
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

async function fetchAll(
  type: string,
  constraints?: Constraint[],
  max = 2000,
  sort?: { field: string; desc?: boolean },
) {
  const rows: Record<string, unknown>[] = [];
  let cursor = 0;
  for (;;) {
    const p = await bq(type, { constraints, cursor, sort: sort?.field, desc: sort?.desc });
    rows.push(...p.results);
    if (p.remaining <= 0 || rows.length >= max || p.results.length === 0) break;
    cursor += p.results.length;
  }
  return rows;
}

async function count(type: string, constraints?: Constraint[]) {
  const p = await bq(type, { constraints, limit: 1 });
  return p.remaining + p.results.length;
}

/* ---------- helpers de présentation ---------- */

import { dmy, euros, keur } from "@/lib/format";

function contactLabel(c?: Record<string, unknown>) {
  if (!c) return "";
  const p = typeof c["prénom"] === "string" ? (c["prénom"] as string) : "";
  const n = typeof c.nom === "string" ? (c.nom as string) : "";
  return `${p ? p[0].toUpperCase() + ". " : ""}${n.toUpperCase()}`.trim();
}

/* ---------- assemblage du dashboard ---------- */

import type { KBloc, KCard, KCol } from "@/lib/data/dashboard";

const statutOf = (im: Record<string, unknown>) =>
  parseInt(String(im.Statut ?? "").split(" ")[0], 10) || 0;

export type DashboardLive = {
  blocs: KBloc[];
  agentSlug: string;
  agentName: string;
  enCours: number;
};

export async function getDashboardLive(agentSlug: string): Promise<DashboardLive | null> {
  if (!TOKEN && !USE_SB) return null;
  const agent = AGENT_IDS[agentSlug] ?? AGENT_IDS["romain"];

  // Immeubles actifs (188 ≈ 2 requêtes) + suivis récents + offres + mandats.
  const [imsAll, suivis, offres, mandats] = await Promise.all([
    fetchAll("immeuble", [{ key: "archived", constraint_type: "equals", value: "false" }]),
    fetchAll("suivi", undefined, 600, { field: "Created Date", desc: true }).catch(() => []),
    fetchAll("offre"),
    fetchAll("mandat"),
  ]);

  const ims = imsAll
    .filter((i) => i.AGENT === agent.id)
    .sort((a, b) => String(b["Modified Date"]).localeCompare(String(a["Modified Date"])));

  // Dernier suivi par immeuble (les suivis récents d'abord).
  const suiviByIm = new Map<string, Record<string, unknown>>();
  for (const s of [...suivis].sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"])))) {
    for (const id of (s.IMMEUBLEs as string[] | undefined) ?? []) {
      if (!suiviByIm.has(id)) suiviByIm.set(id, s);
    }
  }

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
  for (let i = 0; i < ownerIds.length; i += 50) {
    const chunk = ownerIds.slice(i, i + 50);
    const rows = await fetchAll("contact", [{ key: "_id", constraint_type: "in", value: chunk }]);
    rows.forEach((c) => contacts.set(c._id as string, c));
  }

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
      photoUrl: photo
        ? `/api/photo?u=${encodeURIComponent((im.photo_main_compressed as string).replace(/^\/\//, "https://"))}`
        : undefined,
      rv: true,
      rvText: agent.initials,
      history: !!suivi,
    };

    if (enAttente && suivi) {
      card.wait = {
        from: dmy(suivi.date_start ?? suivi["Created Date"]) ?? "",
        to: dmy(suivi.date_relance) ?? "",
        motif: String(suivi.Motif_standby ?? im.standby_Statut ?? ""),
      };
      card.prix = euros(im.prix_hai);
      card.action = { label: "Réactiver", kind: "green" };
      return card;
    }

    // Chip date + note = dernier événement connu.
    if (suivi && typeof suivi.notes === "string" && suivi.notes) {
      card.date = dmy(suivi.date_start ?? suivi["Created Date"]);
      card.note = (suivi.notes as string).split("\n")[0];
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
    enCours: byStatut([1]).length,
  };
}

/* ===================== Fiche Bien ===================== */

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
  prix?: string;
  statut: string;
  standby?: string;
  agentInitials: string;
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
  secteur: Record<string, unknown> | null;
  baux: Record<string, unknown>[];
  locataires: Record<string, unknown>[];
  charges: Record<string, unknown>[];
  composants: Record<string, unknown>[];
  travaux: Record<string, unknown>[];
  photos: { id: string; url?: string; type?: string }[];
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
  const [suivisR, lots, baux, locataires, chargesById, chargesByIm, parcelles, secteur, composants, travaux, photos, documents, estimations, mandats, dossiers, propositions, visites, offres] =
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
      fetchAll("composant", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 50).catch(() => []),
      fetchAll("travaux", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 50).catch(() => []),
      fetchAll("photo", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 40).catch(() => []),
      fetchAll("app_document", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 60).catch(() => []),
      fetchAll("estimation", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 50),
      fetchAll("mandat", [{ key: "IMMEUBLEs", constraint_type: "contains", value: id }], 50),
      fetchAll("dossier", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 50).catch(() => []),
      bq("proposition", { constraints: [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], limit: 10 }),
      fetchAll("visite", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 50),
      fetchAll("offre", [{ key: "IMMEUBLEs", constraint_type: "contains", value: id }], 50),
    ]);

  const proprietaire = im.PROPRIETAIRE
    ? (await bq("contact", { constraints: [{ key: "_id", constraint_type: "equals", value: im.PROPRIETAIRE }], limit: 1 })).results[0]
    : undefined;

  const autres = proprietaire
    ? await fetchAll("immeuble", [
        { key: "PROPRIETAIRE", constraint_type: "equals", value: im.PROPRIETAIRE },
      ], 20).catch(() => [])
    : [];

  const agentEntry = Object.values(AGENT_IDS).find((a) => a.id === im.AGENT);

  return {
    im,
    ville: `${im.adresse_ville ?? ""} (${im.adresse_zipcode ?? im.adresse_dpt ?? ""})`,
    adresse: [im.adresse_numero_rue, im.adresse_rue].filter(Boolean).join(" "),
    photoUrl: photoProxy(im.photo_main_compressed),
    prix: euros(im.prix_hai),
    statut: String(im.Statut ?? "").replace(/^\d+ - /, ""),
    standby: typeof im.standby_Statut === "string" ? im.standby_Statut : undefined,
    agentInitials: agentEntry?.initials ?? "FI",
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
    lots: [...lots].sort((a, b) => Number(a.numero ?? 0) - Number(b.numero ?? 0)),
    parcelles,
    secteur,
    baux: [...baux].sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"]))),
    locataires: [...locataires].sort((a, b) => String(a.formatted_name ?? "").localeCompare(String(b.formatted_name ?? ""))),
    charges: [...chargesById, ...chargesByIm.filter((c) => !chargesById.some((d) => d._id === c._id))]
      .sort((a, b) => String(a["Created Date"]).localeCompare(String(b["Created Date"]))),
    composants,
    travaux,
    photos: photos.map((p) => ({
      id: p._id as string,
      url: photoProxy(p.compressed ?? p.image),
      type: typeof p.Type === "string" ? (p.Type as string) : undefined,
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

/** Une estimation par id (pour la page imprimable). */
export async function getEstimation(id: string): Promise<Record<string, unknown> | null> {
  const r = await bq("estimation", {
    constraints: [{ key: "_id", constraint_type: "equals", value: id }],
    limit: 1,
  }).catch(() => ({ results: [] as Record<string, unknown>[], remaining: 0 }));
  return r.results[0] ?? null;
}

/** Un mandat + son immeuble principal (pour la fiche mandat). */
export async function getMandat(id: string): Promise<{
  m: Record<string, unknown>;
  im: Record<string, unknown> | null;
} | null> {
  const r = await bq("mandat", {
    constraints: [{ key: "_id", constraint_type: "equals", value: id }],
    limit: 1,
  }).catch(() => ({ results: [] as Record<string, unknown>[], remaining: 0 }));
  const m = r.results[0];
  if (!m) return null;
  const imId = Array.isArray(m.IMMEUBLEs) ? (m.IMMEUBLEs as string[])[0] : undefined;
  const im = imId
    ? (await bq("immeuble", { constraints: [{ key: "_id", constraint_type: "equals", value: imId }], limit: 1 })).results[0] ?? null
    : null;
  return { m, im };
}

/* ---------- Vues listes (réplique des modules de la sidebar) ---------- */

export type ListCard = {
  id: string;
  href?: string;
  avatar: string;
  title: string;
  sub?: string;
  note?: string;
  badge?: { label: string; tone: "green" | "red" | "orange" };
  right?: string[];
  /** Clé d'onglet (en_cours / termines / archives…). */
  group: string;
  date?: string;
};

const initialsOf = (agentId: unknown) =>
  Object.values(AGENT_IDS).find((a) => a.id === agentId)?.initials ?? "FI";

async function imLabelMap(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const uniq = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < uniq.length; i += 100) {
    const chunk = uniq.slice(i, i + 100);
    const rows = await fetchAll("immeuble", [{ key: "_id", constraint_type: "in", value: chunk }]).catch(() => []);
    for (const r of rows) map.set(String(r._id), r);
  }
  return map;
}

const imLabel = (im?: Record<string, unknown>) =>
  im
    ? `${im.adresse_ville ?? ""} (${im.adresse_zipcode ?? ""}) - ${[im.adresse_numero_rue, im.adresse_rue].filter(Boolean).join(" ")}`
    : "";

export async function listImmeubles(): Promise<ListCard[]> {
  const ims = await fetchAll("immeuble", [{ key: "archived", constraint_type: "equals", value: "false" }]);
  const archived = await bq("immeuble", {
    constraints: [{ key: "archived", constraint_type: "equals", value: "true" }],
    limit: 100, sort: "Modified Date", desc: true,
  }).catch(() => ({ results: [] as Record<string, unknown>[], remaining: 0 }));
  const contactIds = [...ims, ...archived.results].map((i) => String(i.PROPRIETAIRE ?? "")).filter(Boolean);
  const contacts = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < contactIds.length; i += 100) {
    const rows = await fetchAll("contact", [{ key: "_id", constraint_type: "in", value: [...new Set(contactIds)].slice(i, i + 100) }]).catch(() => []);
    for (const r of rows) contacts.set(String(r._id), r);
  }
  const card = (im: Record<string, unknown>, group: string): ListCard => ({
    id: String(im._id),
    href: `/bien/${im._id}`,
    avatar: initialsOf(im.AGENT),
    title: imLabel(im),
    sub: contactLabel(contacts.get(String(im.PROPRIETAIRE ?? ""))) || undefined,
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
  const rows = await fetchAll("estimation", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  return rows.map((e) => {
    const st = String(e.Statut ?? "").replace(/^\d+ - /, "");
    const hai = typeof e.prix_hai === "number" ? (e.prix_hai as number) : 0;
    const loyers = typeof e.imm_loyer_hc_tot === "number" ? (e.imm_loyer_hc_tot as number) : 0;
    const carrez = typeof e.imm_carrez_tot_tot === "number" ? (e.imm_carrez_tot_tot as number) : 0;
    return {
      id: String(e._id),
      href: e.IMMEUBLE ? `/bien/${e.IMMEUBLE}` : undefined,
      avatar: initialsOf(e.ESTIMATOR),
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
  const rows = await fetchAll("mandat", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  const ims = await imLabelMap(rows.map((m) => (Array.isArray(m.IMMEUBLEs) ? String((m.IMMEUBLEs as string[])[0] ?? "") : "")));
  return rows.map((m) => {
    const st = String(m.Statut ?? "");
    const im = ims.get(Array.isArray(m.IMMEUBLEs) ? String((m.IMMEUBLEs as string[])[0] ?? "") : "");
    return {
      id: String(m._id),
      href: `/mandat/${m._id}`,
      avatar: initialsOf(m.AGENT),
      title: `${m.Type ?? "Vente"} ${m.Type_exclu ?? ""} ${dmy(m.date_effet) ?? ""}${m.date_fin ? `-${dmy(m.date_fin)}` : ""}`.trim(),
      sub: imLabel(im) || undefined,
      note: m.numero ? `#${m.numero}` : "Pas de numéro",
      badge: st
        ? { label: st, tone: ["En cours", "Vendu"].includes(st) ? "green" : ["Annulé", "Expiré"].includes(st) ? "red" : "orange" }
        : undefined,
      right: [euros(m.prix_hai) ?? ""].filter(Boolean),
      group: ["En cours", "A rédiger", "Attente infos", "Attente signature"].includes(st) ? "en_cours" : "termines",
      date: typeof m["Modified Date"] === "string" ? (m["Modified Date"] as string) : undefined,
    } satisfies ListCard;
  });
}

export async function listVisites(): Promise<ListCard[]> {
  const rows = await fetchAll("visite", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  const ims = await imLabelMap(rows.map((v) => String(v.IMMEUBLE ?? "")));
  return rows.map((v) => {
    const st = String(v.Statut ?? "");
    const d = typeof v.date === "string" ? new Date(v.date as string) : undefined;
    const heure = d
      ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(d).replace(":", "h")
      : "";
    return {
      id: String(v._id),
      href: v.IMMEUBLE ? `/bien/${v.IMMEUBLE}` : undefined,
      avatar: initialsOf(v.AGENT),
      title: `Visite du ${dmy(v.date) ?? "?"}${heure ? ` - ${heure}` : ""}`,
      sub: imLabel(ims.get(String(v.IMMEUBLE ?? ""))) || undefined,
      note: typeof v.visiteur_nom === "string" ? (v.visiteur_nom as string) : undefined,
      badge: st
        ? { label: st, tone: st === "Effectuée" ? "green" : st === "Annulée" ? "red" : "orange" }
        : undefined,
      group: ["Effectuée", "Annulée"].includes(st) ? "terminees" : "prevues",
      date: typeof v.date === "string" ? (v.date as string) : undefined,
    } satisfies ListCard;
  }).sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
}

export async function listOffres(): Promise<ListCard[]> {
  const rows = await fetchAll("offre", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  const ims = await imLabelMap(rows.map((o) => (Array.isArray(o.IMMEUBLEs) ? String((o.IMMEUBLEs as string[])[0] ?? "") : "")));
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
  const rows = await fetchAll("suivi", undefined, 300, { field: "Created Date", desc: true }).catch(() => []);
  const ims = await imLabelMap(rows.map((s) => (Array.isArray(s.IMMEUBLEs) ? String((s.IMMEUBLEs as string[])[0] ?? "") : "")));
  return rows.map((s) => {
    const st = String(s.Statut ?? "");
    const imId = Array.isArray(s.IMMEUBLEs) ? String((s.IMMEUBLEs as string[])[0] ?? "") : "";
    return {
      id: String(s._id),
      href: imId ? `/bien/${imId}` : undefined,
      avatar: initialsOf(s.AGENT),
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
  const rows = await fetchAll("contact", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  return rows.map((c) => {
    const nom = [c["Civilité"], c["prénom"], c.nom].filter(Boolean).join(" ");
    const types = Array.isArray(c.Types) ? (c.Types as string[]).join(" · ") : "";
    return {
      id: String(c._id),
      href: `/contact/${c._id}`,
      avatar: initialsOf(c.agent),
      title: nom || String(c.entreprise_nom ?? "Contact"),
      sub: [c.portable_formatted ?? c.portable, c.email].filter(Boolean).join(" · ") || undefined,
      note: [types, c.acheteur === true ? "Acheteur" : "", c.vendeur === true ? "Vendeur" : ""].filter(Boolean).join(" · ") || undefined,
      group: "tous",
      date: typeof c["Modified Date"] === "string" ? (c["Modified Date"] as string) : undefined,
    } satisfies ListCard;
  });
}

export async function listRecherches(): Promise<ListCard[]> {
  const rows = await fetchAll("recherche", undefined, 300, { field: "Modified Date", desc: true }).catch(() => []);
  const acheteurIds = rows.map((r) => String(r.ACHETEUR ?? "")).filter(Boolean);
  const contacts = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < acheteurIds.length; i += 100) {
    const chunk = [...new Set(acheteurIds)].slice(i, i + 100);
    if (!chunk.length) break;
    const cs = await fetchAll("contact", [{ key: "_id", constraint_type: "in", value: chunk }]).catch(() => []);
    for (const c of cs) contacts.set(String(c._id), c);
  }
  return rows.map((r) => {
    const c = contacts.get(String(r.ACHETEUR ?? ""));
    const prix =
      typeof r.prix_min === "number" || typeof r.prix_max === "number"
        ? `${euros(r.prix_min) ?? "0 €"} à ${euros(r.prix_max) ?? "∞"}`
        : "";
    return {
      id: String(r._id),
      avatar: initialsOf(r.agent),
      title: [Array.isArray(r.dpts) ? (r.dpts as string[]).join(", ") : String(r.dpts ?? ""), String(r.Cible ?? "")].filter(Boolean).join(" · ") || "Recherche",
      sub: c ? contactLabel(c) : undefined,
      note: [prix, typeof r.renta === "number" ? `≥ ${(r.renta as number).toLocaleString("fr-FR")} %` : ""].filter(Boolean).join(" · ") || undefined,
      badge: r.standby === true ? { label: "En attente", tone: "orange" } : undefined,
      group: r.archived === true ? "archivees" : "en_cours",
      date: typeof r["Modified Date"] === "string" ? (r["Modified Date"] as string) : undefined,
    } satisfies ListCard;
  });
}

export async function listQuestions(): Promise<ListCard[]> {
  const rows = await fetchAll("question", undefined, 300, { field: "Created Date", desc: true }).catch(() => []);
  const imIds = rows.map((q) => String(q.IMMEUBLE ?? "")).filter(Boolean);
  const ims = await imLabelMap(imIds);
  return rows.map((q) => ({
    id: String(q._id),
    href: q.IMMEUBLE ? `/bien/${q.IMMEUBLE}` : undefined,
    avatar: initialsOf(q["suivi par"]),
    title: `${dmy(q["Created Date"]) ?? ""} · ${q.email ?? q["téléphone"] ?? "Question"}`,
    sub: imLabel(ims.get(String(q.IMMEUBLE ?? ""))) || undefined,
    note: typeof q.message === "string" ? (q.message as string).slice(0, 200) : undefined,
    badge: q.ended === true ? { label: "Clôturée", tone: "green" } : { label: "En cours", tone: "orange" },
    group: q.ended === true ? "cloturees" : "en_cours",
    date: typeof q["Created Date"] === "string" ? (q["Created Date"] as string) : undefined,
  } satisfies ListCard));
}

export async function listPropositions(): Promise<ListCard[]> {
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
export async function getDatas() {
  const since = new Date(Date.now() - 365 * 86400000).toISOString();
  const created: Constraint[] = [{ key: "Created Date", constraint_type: "greater than", value: since }];
  const [contacts, recherches, immeubles, estimations, mandats, visites, offresRows] = await Promise.all([
    count("contact", created).catch(() => 0),
    count("recherche", created).catch(() => 0),
    count("immeuble", created).catch(() => 0),
    fetchAll("estimation", created, 2000).catch(() => []),
    fetchAll("mandat", created, 2000).catch(() => []),
    fetchAll("visite", created, 2000).catch(() => []),
    fetchAll("offre", created, 2000).catch(() => []),
  ]);
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const okOffre = ["Acceptée", "Compromis programmé", "Compromis signé", "Vente prévue", "Vendu"];
  const formulaires = await count("immeuble", [
    ...created,
    { key: "Statut", constraint_type: "equals", value: "1 - FORMULAIRE" },
  ]).catch(() => 0);
  return {
    contacts, recherches, immeubles, formulaires,
    estimations: estimations.length,
    estimationsEnvoyees: estimations.filter((e) => String(e.Statut ?? "").startsWith("3")).length,
    mandats: mandats.length,
    mandatsSignes: mandats.filter((m) => !!m.date_signature || ["En cours", "Vendu", "Expiré"].includes(String(m.Statut ?? ""))).length,
    visites: visites.length,
    visitesEffectuees: visites.filter((v) => String(v.Statut ?? "") === "Effectuée").length,
    offres: offresRows.length,
    offresAcceptees: offresRows.filter((o) => okOffre.includes(String(o.Statut ?? ""))).length,
    offresHonosHt: offresRows.reduce((s, o) => s + num(o.honos_ht), 0),
    ventes: offresRows.filter((o) => String(o.Statut ?? "") === "Vendu").length,
    ventesHonosHt: offresRows.filter((o) => String(o.Statut ?? "") === "Vendu").reduce((s, o) => s + num(o.honos_ht), 0),
  };
}

/* ---------- Fiche Contact ---------- */

export type ContactData = {
  c: Record<string, unknown>;
  immeubles: Record<string, unknown>[];
  recherches: Record<string, unknown>[];
  propositions: Record<string, unknown>[];
  questions: Record<string, unknown>[];
  visites: Record<string, unknown>[];
  offres: Record<string, unknown>[];
  suivis: Record<string, unknown>[];
};

export async function getContact(id: string): Promise<ContactData | null> {
  const one = await bq("contact", { constraints: [{ key: "_id", constraint_type: "equals", value: id }], limit: 1 });
  const c = one.results[0];
  if (!c) return null;
  const [immeubles, recherches, propositions, questions, visites, offres, suivis] = await Promise.all([
    fetchAll("immeuble", [{ key: "PROPRIETAIRE", constraint_type: "equals", value: id }], 50).catch(() => []),
    fetchAll("recherche", [{ key: "ACHETEUR", constraint_type: "equals", value: id }], 50).catch(() => []),
    fetchAll("proposition", [{ key: "ACHETEUR", constraint_type: "equals", value: id }], 50).catch(() => []),
    fetchAll("question", [{ key: "CONTACT", constraint_type: "equals", value: id }], 50).catch(() => []),
    fetchAll("visite", [{ key: "VISITEURs", constraint_type: "contains", value: id }], 50).catch(() => []),
    fetchAll("offre", [{ key: "ACHETEURs", constraint_type: "contains", value: id }], 50).catch(() => []),
    fetchAll("suivi", [{ key: "CONTACT", constraint_type: "equals", value: id }], 100).catch(() => []),
  ]);
  return {
    c, immeubles, recherches, propositions, questions, visites, offres,
    suivis: [...suivis].sort((a, b) => String(b["Created Date"]).localeCompare(String(a["Created Date"]))),
  };
}
