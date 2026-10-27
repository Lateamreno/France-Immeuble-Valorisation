"use server";

// Diffusion vers le site France Immeuble — la partie qui parle au réseau.
//
// Contrat : docs/CONTRAT-SITE.md. Le BO DÉPOSE dans la base Supabase du site
// (projet « France Immeuble site ») ; le site ne lit jamais le BO. Le calcul de
// ce qui part est dans lib/diffusion.ts (`statutSite`, `ligneSite`) ; ici on
// transporte, comme lib/bo/diffusion.ts le fait pour Plein Bail.
//
// Le BO ne crée ni ne modifie aucune table du site : il écrit dans
// `biens_a_vendre`, dans `offmarket` et dans le coffre `biens`, rien d'autre.

import { revalidatePath } from "next/cache";
import { getAgentFiche, getBien, type BienData } from "@/lib/bubble/server";
import {
  blocages, chargeUtile, departement, empreinte, ligneSite, lireEtat, lireEtatSite,
  mandatEnVigueur, mandatPermetLigne, statutSite,
  type Blocage, type EtatSite, type LigneSite, type StatutSite,
} from "@/lib/diffusion";

const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
/** Le projet du BO. Le site ne doit jamais être confondu avec lui. */
const REF_BO = "sojtmhdrzmdbtqborxsi";
/** L'adresse publique du site, pour les liens « Voir la page ». */
const PUBLIC = (process.env.SITE_FI_PUBLIC_URL ?? "https://france-immeuble-refonte-site.vercel.app").replace(/\/+$/, "");

type Config = { url: string; cle: string };

function config(): Config | null {
  const url = process.env.SITE_FI_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const cle = process.env.SITE_FI_SUPABASE_SECRET_KEY?.trim();
  if (!url || !cle) return null;
  /* Même garde que côté site, dans l'autre sens : une URL du BO posée par
     erreur dans SITE_FI_SUPABASE_URL ferait écrire la vitrine dans le CRM. */
  if (url.includes(REF_BO)) {
    console.error("[site-fi] SITE_FI_SUPABASE_URL pointe sur le projet du BO : refusé.");
    return null;
  }
  return { url, cle };
}

/** Un appel à la base du site, avec sa clé secrète. Lève sur tout refus. */
async function site(c: Config, chemin: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${c.url}${chemin}`, {
    ...init,
    headers: {
      apikey: c.cle,
      Authorization: `Bearer ${c.cle}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Site ${res.status} : ${(await res.text()).slice(0, 300)}`);
  return res;
}

async function rpcBo(fn: string, args: Record<string, unknown>) {
  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const res = await fetch(`${BO_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function memoriser(immeubleId: string, patch: Record<string, unknown>) {
  await rpcBo("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: patch });
  revalidatePath("/", "layout");
  revalidatePath(`/bien/${immeubleId}`);
  revalidatePath("/diffusion");
}

/* ----------------------------------------------------------------- Journal */

export type EntreeJournal = {
  le: string;
  /** Le slug de l'agent aux commandes du poste (le BO n'a pas encore de connexion). */
  agent?: string;
  destination: "pb" | "site";
  geste: string;
};

/**
 * Garde la trace de chaque geste de diffusion : qui a coché, décoché, publié,
 * retiré, et quand. Si un vendeur demande un jour pourquoi son bien est en
 * ligne, la réponse est là. Ce journal ne part jamais au site.
 */
async function journaliser(im: Record<string, unknown>, e: Omit<EntreeJournal, "le">) {
  const avant = Array.isArray(im.diffusion_journal) ? (im.diffusion_journal as EntreeJournal[]) : [];
  const entree: EntreeJournal = { le: new Date().toISOString(), ...e };
  await rpcBo("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: String(im._id),
    p_patch: { diffusion_journal: [...avant, entree].slice(-100) },
  }).catch(() => undefined);
}

/* ------------------------------------------------------------------ Aperçu */

export type ApercuSite = {
  configuree: boolean;
  etat: EtatSite;
  statut: StatutSite | null;
  motif: string;
  blocages: Blocage[];
  ligne: LigneSite | null;
  empreinte?: string;
  /** La fiche a-t-elle changé depuis le dernier dépôt ? */
  ecart: boolean;
  /** L'adresse de la page sur le site, une fois publiée. */
  url?: string;
};

/** Le bien a-t-il déjà été mis en ligne, ici ou sur Plein Bail ? */
function dejaPublie(im: Record<string, unknown>): boolean {
  return !!(im.site_publie_le || im.pb_publie_le || lireEtatSite(im).publie || lireEtat(im).publiee);
}

async function calculer(b: BienData) {
  const mandat = mandatEnVigueur(b.mandats);
  const empeche = blocages(b, mandat);
  const { statut, motif } = statutSite(b, mandat, dejaPublie(b.im));
  const agent = await getAgentFiche(String(b.im.AGENT ?? "")).catch(() => null);
  const charge = statut ? chargeUtile(b, mandat, agent, statut === "en_vente" ? "online" : "sous_offre") : null;
  const ligne = charge && statut ? ligneSite(b, charge, statut) : null;
  return { mandat, empeche, statut, motif, charge, ligne };
}

/** Ce que la publication sur le site ferait, sans la faire. */
export async function apercuSite(immeubleId: string): Promise<ApercuSite> {
  const c = config();
  const b = await getBien(immeubleId).catch(() => null);
  if (!b) {
    return {
      configuree: !!c, etat: lireEtatSite({}), statut: null, motif: "Fiche introuvable",
      blocages: [], ligne: null, ecart: false,
    };
  }
  const etat = lireEtatSite(b.im);
  const { empeche, statut, motif, charge, ligne } = await calculer(b);
  const emp = ligne && charge ? empreinte({ ligne, photos: charge.photos.map((p) => p.empreinte) }) : undefined;
  return {
    configuree: !!c,
    etat,
    statut,
    motif,
    blocages: empeche,
    ligne,
    empreinte: emp,
    ecart: !!emp && emp !== etat.empreinte,
    url: etat.slug ? `${PUBLIC}/immeubles-a-vendre/${etat.slug}/` : undefined,
  };
}

/* ------------------------------------------------------------------ Photos */

/** Les octets d'une photo du BO, qu'elle soit dans notre coffre ou chez Bubble. */
async function octetsPhoto(proxy: string): Promise<{ corps: ArrayBuffer; type: string } | null> {
  try {
    const q = new URLSearchParams(proxy.split("?")[1] ?? "");
    const s = q.get("s");
    const u = q.get("u");
    let res: Response | null = null;
    if (s && BO_KEY) {
      res = await fetch(`${BO_URL}/storage/v1/object/bo-files/${s}`, {
        headers: { Authorization: `Bearer ${BO_KEY}` },
        cache: "no-store",
      });
    } else if (u) {
      const url = new URL(u.startsWith("//") ? `https:${u}` : u);
      const jeton = process.env.BUBBLE_API_TOKEN;
      res = await fetch(url, {
        headers: jeton && url.hostname === "vente.france-immeuble.fr" ? { Authorization: `Bearer ${jeton}` } : {},
        redirect: "follow",
        cache: "no-store",
      });
    }
    if (!res || !res.ok) return null;
    const type = res.headers.get("Content-Type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const corps = await res.arrayBuffer();
    return corps.byteLength ? { corps, type } : null;
  } catch {
    return null;
  }
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

/** Les noms des fichiers déjà déposés pour ce bien dans le coffre `biens`. */
async function photosDeposees(c: Config, id: string): Promise<string[]> {
  try {
    const res = await site(c, "/storage/v1/object/list/biens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", search: `${id}-`, limit: 100 }),
    });
    const lignes = (await res.json()) as { name: string }[];
    return lignes.map((l) => l.name).filter((n) => n.startsWith(`${id}-`));
  } catch {
    return [];
  }
}

async function supprimerPhotos(c: Config, noms: string[]) {
  if (!noms.length) return;
  await site(c, "/storage/v1/object/biens", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: noms }),
  }).catch(() => undefined);
}

/**
 * Copie les photos dans le coffre `biens` du site, sous un nom NEUTRE :
 * `<id>-1.jpg`, `<id>-2.jpg`… Les noms d'origine portent parfois l'adresse
 * (« Immeuble 47 rue des bas Fossés… ») ; publier ce nom, c'est publier l'adresse.
 */
async function deposerPhotos(c: Config, id: string, proxys: string[]): Promise<string[]> {
  const gardees: string[] = [];
  for (const [i, p] of proxys.entries()) {
    const o = await octetsPhoto(p);
    if (!o) continue;
    const nom = `${id}-${i + 1}.${EXT[o.type] ?? "jpg"}`;
    await site(c, `/storage/v1/object/biens/${nom}`, {
      method: "POST",
      headers: { "Content-Type": o.type, "x-upsert": "true", "cache-control": "3600" },
      body: o.corps,
    });
    gardees.push(nom);
  }
  // Ce qui n'est plus dans la liste (une photo retirée de la fiche) s'en va.
  const avant = await photosDeposees(c, id);
  await supprimerPhotos(c, avant.filter((n) => !gardees.includes(n)));
  return gardees;
}

/* L'adresse de la page (« immeuble-de-rapport-<commune>-<dept> », puis -2, -3)
   est fabriquée et figée par la base du site, à la première insertion. Le BO
   n'envoie jamais de slug : il lit celui que la base a posé. */

/* ---------------------------------------------------------------- Publier */

/**
 * Publie, ou republie, le bien sur le site. Un geste humain : appelé depuis le
 * bouton « Publier » de la fiche, ou par la synchronisation d'un bien DÉJÀ
 * publié dont la fiche a changé. Jamais pour une première mise en ligne
 * automatique.
 */
export async function publierSurSite(immeubleId: string, agent?: string) {
  /* Tout agent connecté publie ses biens (MAV, 27/10, revenant sur #531).
     Sans agent (le réconciliateur), c'est le BO lui-même qui agit : il passe. */
  const { peutDiffuser, REFUS_ADMIN } = await import("./admin");
  if (!(await peutDiffuser(agent))) return REFUS_ADMIN;
  const c = config();
  if (!c) {
    return { ok: false as const, message: "Le site n'est pas branché : SITE_FI_SUPABASE_URL ou SITE_FI_SUPABASE_SECRET_KEY manque." };
  }
  try {
    const b = await getBien(immeubleId);
    if (!b) return { ok: false as const, message: "Fiche introuvable." };
    const { empeche, statut, motif, charge, ligne } = await calculer(b);
    if (empeche.length) return { ok: false as const, message: `Publication impossible : ${empeche[0].label}.` };
    if (!statut || !ligne || !charge) return { ok: false as const, message: motif || "Le bien n'est pas publiable en l'état." };

    const etat = lireEtatSite(b.im);
    const empPhotos = empreinte(charge.photos.map((p) => p.empreinte));
    const anciennes = Array.isArray(b.im.site_images) ? (b.im.site_images as string[]) : [];
    /* Les photos ne repartent que si la liste a changé : une republication pour
       un prix corrigé ne retransfère pas quinze images. */
    const images = etat.publie && b.im.site_photos_empreinte === empPhotos && anciennes.length
      ? anciennes
      : await deposerPhotos(c, ligne.id, charge.photos.map((p) => p.url));

    const existe = await site(c, `/rest/v1/biens_a_vendre?select=id,slug,publie_le&id=eq.${encodeURIComponent(ligne.id)}`)
      .then((r) => r.json() as Promise<{ id: string; slug: string; publie_le: string }[]>);
    const maintenant = new Date().toISOString();
    let slug: string | undefined;
    if (existe[0]) {
      slug = existe[0].slug;
      await site(c, `/rest/v1/biens_a_vendre?id=eq.${encodeURIComponent(ligne.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ ...ligne, images, maj_le: maintenant }),
      });
    } else {
      const r = await site(c, "/rest/v1/biens_a_vendre", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ ...ligne, images, publie_le: maintenant, maj_le: maintenant }),
      });
      slug = ((await r.json()) as { slug?: string }[])[0]?.slug;
    }

    await memoriser(immeubleId, {
      site_statut: statut,
      site_slug: slug,
      site_publie_le: (b.im.site_publie_le as string | undefined) ?? maintenant,
      site_synchro_le: maintenant,
      site_empreinte: empreinte({ ligne, photos: charge.photos.map((p) => p.empreinte) }),
      site_photos_empreinte: empPhotos,
      site_images: images,
      site_erreur: null,
      site_retire_le: null,
    });
    if (!etat.publie || etat.statut !== statut) {
      await journaliser(b.im, { agent, destination: "site", geste: statut === "en_vente" ? "publié, en vente" : "publié, sous offre" });
    }
    return { ok: true as const, statut, url: slug ? `${PUBLIC}/immeubles-a-vendre/${slug}/` : undefined, photos: images.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await memoriser(immeubleId, { site_erreur: message, site_synchro_le: new Date().toISOString() }).catch(() => {});
    return { ok: false as const, message };
  }
}

/** Retire le bien du site : la ligne, et ses photos avec. */
export async function retirerDuSite(immeubleId: string, motif: string, agent?: string) {
  /* Tout agent connecté publie ses biens (MAV, 27/10, revenant sur #531).
     Sans agent (le réconciliateur), c'est le BO lui-même qui agit : il passe. */
  const { peutDiffuser, REFUS_ADMIN } = await import("./admin");
  if (!(await peutDiffuser(agent))) return REFUS_ADMIN;
  const c = config();
  try {
    const b = await getBien(immeubleId);
    if (!b) return { ok: false as const, message: "Fiche introuvable." };
    if (c) {
      await site(c, `/rest/v1/biens_a_vendre?id=eq.${encodeURIComponent(immeubleId)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      await supprimerPhotos(c, await photosDeposees(c, immeubleId));
    }
    const etait = lireEtatSite(b.im).publie;
    await memoriser(immeubleId, {
      site_statut: null,
      site_retire_le: new Date().toISOString(),
      site_motif_retrait: motif,
      site_images: null,
      site_photos_empreinte: null,
      site_empreinte: null,
      site_erreur: null,
    });
    if (etait) await journaliser(b.im, { agent, destination: "site", geste: `retiré : ${motif}` });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Le réconciliateur du site, appelé derrière chaque écriture du BO. Il ne
 * publie JAMAIS un bien qui n'est pas déjà sur le site : la première mise en
 * ligne est un geste humain. Il met à jour, passe en « Sous offre », ou retire.
 */
export async function synchroniserSite(immeubleId: string) {
  if (!config()) return { ok: true as const, rien: true as const };
  const b = await getBien(immeubleId).catch(() => null);
  if (!b) return { ok: false as const, message: "Fiche introuvable" };
  const etat = lireEtatSite(b.im);
  if (!etat.publie) return { ok: true as const, rien: true as const };

  const a = await apercuSite(immeubleId);
  if (!a.statut || a.blocages.some((x) => ["mandat", "signature", "web"].includes(x.cle))) {
    return retirerDuSite(immeubleId, a.motif || a.blocages[0]?.label || "Conditions de diffusion non réunies");
  }
  if (!a.ecart && etat.statut === a.statut) return { ok: true as const, rien: true as const };
  return publierSurSite(immeubleId);
}

/**
 * Coche ou décoche une destination. Décocher une destination où le bien est
 * en ligne l'en retire tout de suite : il ne doit pas y rester jusqu'à ce que
 * quelqu'un y repense.
 */
export async function cocherDestination(immeubleId: string, destination: "pb" | "site", coche: boolean, agent?: string) {
  if (destination === "site") {
    const { peutDiffuser, REFUS_ADMIN } = await import("./admin");
    if (!(await peutDiffuser(agent))) return REFUS_ADMIN;
  }
  try {
    const b = await getBien(immeubleId);
    if (!b) return { ok: false as const, message: "Fiche introuvable." };
    await memoriser(immeubleId, destination === "pb" ? { pb_coche: coche } : { site_coche: coche });
    await journaliser(b.im, { agent, destination, geste: coche ? "case cochée" : "case décochée" });
    if (!coche) {
      if (destination === "site" && lireEtatSite(b.im).publie) {
        return retirerDuSite(immeubleId, "Case « Site France Immeuble » décochée", agent);
      }
      if (destination === "pb" && lireEtat(b.im).publiee && lireEtat(b.im).statutEnLigne !== "suspended") {
        const { retirerAnnonce } = await import("./diffusion");
        return retirerAnnonce(immeubleId, "Case « Plein Bail » décochée");
      }
    }
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Le pont vers le site répond-il ? Lit une ligne, n'écrit rien. */
export async function testerSite(): Promise<{ ok: boolean; message: string }> {
  const c = config();
  if (!c) return { ok: false, message: "SITE_FI_SUPABASE_URL ou SITE_FI_SUPABASE_SECRET_KEY manque dans l'environnement du BO." };
  try {
    await site(c, "/rest/v1/biens_a_vendre?select=id&limit=1");
    return { ok: true, message: "Base du site joignable, clé acceptée." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Publie sur le site les biens déjà en ligne sur Plein Bail et pas encore sur
 * le site. Un geste de l'agent, depuis l'écran Diffusion : c'est la reprise du
 * parc existant au jour où le site ouvre.
 */
export async function publierParcSurSite(agent?: string) {
  /* Retour #531 : le site se règle depuis le poste de l'administrateur. Sans
     agent (le réconciliateur), c'est le BO lui-même qui agit : il passe. */
  const { estAdmin, REFUS_ADMIN } = await import("./admin");
  if (!(await estAdmin(agent))) return REFUS_ADMIN;
  if (!BO_KEY) return { ok: false as const, message: "SUPABASE_SERVICE_ROLE_KEY absente." };
  const res = await fetch(
    `${BO_URL}/rest/v1/bo_immeuble?select=id&data->>pb_statut=in.(online,sous_offre)`,
    { headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` }, cache: "no-store" },
  );
  if (!res.ok) return { ok: false as const, message: `Lecture du parc impossible (${res.status}).` };
  const ids = ((await res.json()) as { id: string }[]).map((r) => r.id);
  const faits: string[] = [];
  const refus: { id: string; message: string }[] = [];
  for (const id of ids) {
    const b = await getBien(id).catch(() => null);
    if (!b || lireEtatSite(b.im).publie || b.im.site_coche === false) continue;
    const r = await publierSurSite(id, agent);
    if (r.ok) faits.push(id);
    else refus.push({ id, message: r.message });
  }
  return { ok: true as const, publies: faits.length, refus };
}

/* -------------------------------------------------------------- Off-market */

export type LigneOffmarket = { commune: string; dept: string; arrondissement: string | null; nombre: number };

/** Paris, Lyon et Marseille se lisent à l'arrondissement ; ailleurs, la commune. */
function lieu(cp: string, ville: string): { commune: string; arrondissement: string | null } {
  const ord = (n: number) => `${n}${n === 1 ? "er" : "e"} arrondissement`;
  const c = cp.replace(/\s/g, "");
  if (/^750\d\d$/.test(c) || /^75116$/.test(c)) return { commune: "Paris", arrondissement: ord(c === "75116" ? 16 : parseInt(c.slice(3), 10)) };
  if (/^6900\d$/.test(c)) return { commune: "Lyon", arrondissement: ord(parseInt(c.slice(4), 10)) };
  if (/^130(0\d|1[0-6])$/.test(c)) return { commune: "Marseille", arrondissement: ord(parseInt(c.slice(3), 10)) };
  return { commune: ville, arrondissement: null };
}

async function lireBo(chemin: string): Promise<{ id: string; data: Record<string, unknown> }[]> {
  if (!BO_KEY) return [];
  const res = await fetch(`${BO_URL}/rest/v1/${chemin}`, {
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  });
  return res.ok ? ((await res.json()) as { id: string; data: Record<string, unknown> }[]) : [];
}

/**
 * Le compte des biens off-market, par commune (contrat §5) : un bien au statut
 * 5, 6 ou 7, avec un mandat signé et en cours qui ne refuse pas la publication
 * en ligne, et qui n'est en ligne ni sur Plein Bail ni sur le site. Ne part que
 * la commune et le nombre : ni type, ni lots, ni prix.
 */
export async function calculerOffmarket(): Promise<LigneOffmarket[]> {
  const statuts = ["5 - Commercialisé (A/B)", "6 - Commercialisé (all)", "7 - Sous offre"]
    .map((s) => `"${s}"`).join(",");
  const [immeubles, mandats] = await Promise.all([
    lireBo(`bo_immeuble?select=id,data&data->>Statut=in.(${encodeURIComponent(statuts)})`),
    lireBo("bo_mandat?select=id,data"),
  ]);
  const parImmeuble = new Map<string, Record<string, unknown>[]>();
  for (const m of mandats) {
    const ims = Array.isArray(m.data.IMMEUBLEs) ? (m.data.IMMEUBLEs as string[]) : [];
    for (const i of ims) parImmeuble.set(i, [...(parImmeuble.get(i) ?? []), m.data]);
  }
  const compte = new Map<string, LigneOffmarket>();
  for (const { id, data: im } of immeubles) {
    if (im.archived === true) continue;
    if (!mandatPermetLigne(mandatEnVigueur(parImmeuble.get(id) ?? []))) continue;
    const pb = String(im.pb_statut ?? "");
    if (pb === "online" || pb === "sous_offre" || lireEtatSite(im).publie) continue;
    const ville = String(im.adresse_ville ?? "").trim();
    const cp = String(im.adresse_zipcode ?? "");
    if (!ville || !cp) continue;
    const l = lieu(cp, ville);
    const dept = departement(cp);
    const cle = `${dept}|${l.commune}|${l.arrondissement ?? ""}`;
    const avant = compte.get(cle);
    compte.set(cle, { commune: l.commune, dept, arrondissement: l.arrondissement, nombre: (avant?.nombre ?? 0) + 1 });
  }
  return [...compte.values()].sort((a, b) => b.nombre - a.nombre || a.commune.localeCompare(b.commune));
}

/** Remplace en entier la table `offmarket` du site. À 9 h et à 19 h. */
export async function deposerOffmarket() {
  const c = config();
  if (!c) return { ok: false as const, message: "Le site n'est pas branché." };
  try {
    const lignes = await calculerOffmarket();
    /* D'un seul geste, par la fonction de la base du site : la page n'affiche
       jamais « 0 immeuble » pendant le dépôt, et une ligne invalide n'efface
       rien. Tant que la fonction n'est pas posée (404), l'ancien chemin. */
    const rpc = await fetch(`${c.url}/rest/v1/rpc/remplacer_offmarket`, {
      method: "POST",
      headers: { apikey: c.cle, Authorization: `Bearer ${c.cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ lignes }),
      cache: "no-store",
    });
    if (rpc.status === 404) {
      const maj_le = new Date().toISOString();
      await site(c, "/rest/v1/offmarket?commune=not.is.null", { method: "DELETE", headers: { Prefer: "return=minimal" } });
      if (lignes.length) {
        await site(c, "/rest/v1/offmarket", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(lignes.map((l) => ({ ...l, maj_le }))),
        });
      }
    } else if (!rpc.ok) {
      throw new Error(`Site ${rpc.status} : ${(await rpc.text()).slice(0, 300)}`);
    }
    return { ok: true as const, biens: lignes.reduce((s, l) => s + l.nombre, 0), communes: lignes.length };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------- Chiffres */

/** Un compte exact dans la base du BO, sans rapatrier une ligne. */
async function compterBo(table: string, filtre: string): Promise<number> {
  if (!BO_KEY) throw new Error("Base du BO indisponible.");
  const res = await fetch(`${BO_URL}/rest/v1/${table}?select=id&${filtre}`, {
    method: "HEAD",
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}`, Prefer: "count=exact", Range: "0-0" },
    cache: "no-store",
  });
  const total = res.headers.get("content-range")?.split("/")[1];
  if (!res.ok && res.status !== 206) throw new Error(`BO ${res.status} sur ${table}`);
  if (!total || total === "*") throw new Error(`Compte illisible sur ${table}`);
  return parseInt(total, 10);
}

/**
 * Les chiffres de la page d'accueil du site (table `chiffres`), à 9 h et
 * 19 h. Ce sont des comptes, pas des estimations : aucun ne sort du BO sans
 * qu'il soit vrai à l'heure du dépôt.
 *   · immeubles_traites : les immeubles allés au moins jusqu'à l'estimation —
 *     un formulaire reçu n'est pas un immeuble traité ;
 *   · investisseurs : les contacts acquéreurs ;
 *   · recherches_* : les recherches actives, par cible.
 */
export async function calculerChiffres(): Promise<Record<string, number>> {
  const actives = "or=(data->>archived.is.null,data->>archived.eq.false)";
  const cible = (c: string) => compterBo("bo_recherche", `${actives}&data->>Cible=eq.${encodeURIComponent(c)}`);
  const [immeubles, investisseurs, patrimonial, investisseur, marchand] = await Promise.all([
    compterBo("bo_immeuble", `data->>Statut=not.like.${encodeURIComponent("0 *")}&data->>Statut=not.like.${encodeURIComponent("1 *")}&data->>Statut=not.is.null`),
    compterBo("bo_contact", "data->>acheteur=eq.true"),
    cible("Patrimonial"),
    cible("Investisseur"),
    cible("Marchand de biens"),
  ]);
  return {
    immeubles_traites: immeubles,
    investisseurs,
    recherches_patrimonial: patrimonial,
    recherches_investisseur: investisseur,
    recherches_marchand: marchand,
  };
}

export async function deposerChiffres() {
  const c = config();
  if (!c) return { ok: false as const, message: "Le site n'est pas branché." };
  try {
    const chiffres = await calculerChiffres();
    const maj_le = new Date().toISOString();
    await site(c, "/rest/v1/chiffres?on_conflict=cle", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(Object.entries(chiffres).map(([cle, valeur]) => ({ cle, valeur, maj_le }))),
    });
    return { ok: true as const, ...chiffres };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------------------------------------------------------- Rapprochement */

/**
 * Chaque nuit : toute ligne de `biens_a_vendre` dont le bien n'est plus
 * publiable est retirée, photos comprises, et chaque bien publié est remis à
 * jour s'il a changé. C'est ce qui rattrape un retrait manqué.
 */
export async function rapprocherSite() {
  const c = config();
  if (!c) return { ok: false as const, message: "Le site n'est pas branché." };
  const res = await site(c, "/rest/v1/biens_a_vendre?select=id");
  const ids = ((await res.json()) as { id: string }[]).map((r) => r.id);
  let retires = 0;
  let maj = 0;
  for (const id of ids) {
    const b = await getBien(id).catch(() => null);
    if (!b) {
      // Un bien que le BO ne connaît plus n'a rien à faire en ligne.
      await site(c, `/rest/v1/biens_a_vendre?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
      await supprimerPhotos(c, await photosDeposees(c, id));
      retires++;
      continue;
    }
    const r = await synchroniserSite(id);
    if ("rien" in r && r.rien) continue;
    if (lireEtatSite((await getBien(id).catch(() => b))?.im ?? b.im).publie) maj++;
    else retires++;
  }
  return { ok: true as const, lignes: ids.length, retires, maj };
}
