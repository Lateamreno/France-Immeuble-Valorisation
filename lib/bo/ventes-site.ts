"use server";

// Les ventes publiées sur le site France Immeuble — lot 2 du contrat
// (docs/CONTRAT-SITE.md §4). Rien ne part sur le site sans une décision de
// MAV : « Valider et publier », « Publier sans récit » ou « Ne pas publier ».
//
// Le calcul des faits, le gabarit et le contrôle d'anonymat sont dans
// lib/ventes.ts ; ici, la lecture du dossier, la réécriture par Claude et le
// dépôt dans la table `ventes` de la base du site.

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { getBien } from "@/lib/bubble/server";
import {
  CONSIGNES_REDACTION, controleAnonymat, compterMots, dateParis, faitsDe, faitsEnTexte, lireReponse, nombreDeFaits, recitGabarit, seoDe,
  type FaitsVente, type Recit,
} from "@/lib/ventes";

const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REF_BO = "sojtmhdrzmdbtqborxsi";
const PUBLIC = (process.env.SITE_FI_PUBLIC_URL ?? "https://france-immeuble-refonte-site.vercel.app").replace(/\/+$/, "");

type Config = { url: string; cle: string };
function config(): Config | null {
  const url = process.env.SITE_FI_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const cle = process.env.SITE_FI_SUPABASE_SECRET_KEY?.trim();
  if (!url || !cle || url.includes(REF_BO)) return null;
  return { url, cle };
}

async function site(c: Config, chemin: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${c.url}${chemin}`, {
    ...init,
    headers: { apikey: c.cle, Authorization: `Bearer ${c.cle}`, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Site ${res.status} : ${(await res.text()).slice(0, 400)}`);
  return res;
}

async function lireBo<T = { id: string; data: Record<string, unknown> }>(chemin: string): Promise<T[]> {
  if (!BO_KEY) return [];
  const res = await fetch(`${BO_URL}/rest/v1/${chemin}`, {
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  });
  return res.ok ? ((await res.json()) as T[]) : [];
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

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const ids = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String).filter(Boolean) : []);

/* ------------------------------------------------------------------ Lecture */

/** « inconnu » : la base du site n'a pas répondu, on ne sait pas ce qui y est. */
export type EtatSiteVente = "non_publiee" | "sans_recit" | "avec_recit" | "inconnu";

export type LigneVente = {
  id: string;
  immeubleId?: string;
  commune: string;
  dept: string;
  date: string;
  prix: number;
  /** Nombre de faits renseignés, sur treize. */
  faits: number;
  brouillon: boolean;
  etat: EtatSiteVente;
  /** Pour une vente neuve : depuis quand elle attend MAV. */
  attendDepuis?: string;
  slug?: string;
};

/** Ce que la base du site connaît déjà des ventes. */
type VenteDuSite = { id: string; slug: string; recit: string | null; recit_valide_le: string | null; image: string | null };

/** Ce que la base du site connaît déjà des ventes ; `null` si elle ne répond pas. */
async function ventesDuSite(c: Config | null): Promise<Map<string, VenteDuSite> | null> {
  if (!c) return null;
  const res = await site(c, "/rest/v1/ventes?select=id,slug,recit,recit_valide_le,image").catch(() => null);
  if (!res) return null;
  return new Map(((await res.json()) as VenteDuSite[]).map((r) => [r.id, r]));
}

/**
 * Les deux files de l'écran (contrat §4) : les ventes neuves qui attendent la
 * décision de MAV, et les ventes déjà en ligne à enrichir, du dossier le plus
 * complet au plus pauvre.
 */
export async function listeVentes(): Promise<{ aPublier: LigneVente[]; passees: LigneVente[]; configuree: boolean }> {
  const c = config();
  const [ventes, vendus, enLigne] = await Promise.all([
    lireBo("bo_vente?select=id,data"),
    lireBo("bo_immeuble?select=id,data&data->>Statut=eq.11%20-%20VENDU"),
    ventesDuSite(c),
  ]);
  const rattaches = new Set(ventes.map((v) => S(v.data.IMMEUBLE)).filter(Boolean));
  /* Sans réponse du site, on ne sait pas ce qui y est : aucune vente n'est
     alors dite « à publier », sinon le tableau de bord en annoncerait 44. */
  const ligne = (v: { id: string; data: Record<string, unknown> }): LigneVente => {
    const s = enLigne?.get(v.id);
    return {
      id: v.id,
      immeubleId: S(v.data.IMMEUBLE),
      commune: S(v.data.ville) ?? "?",
      dept: String(v.data["département"] ?? "").padStart(2, "0"),
      date: dateParis(v.data.date),
      prix: Number(v.data.prix_hai ?? 0),
      faits: Number(v.data.site_nb_faits ?? 0),
      brouillon: !!S(v.data.site_recit),
      etat: !enLigne ? "inconnu" : !s ? "non_publiee" : s.recit && s.recit_valide_le ? "avec_recit" : "sans_recit",
      attendDepuis: !s ? S(v.data["Created Date"]) : undefined,
      slug: s?.slug,
    };
  };
  const toutes = ventes.map(ligne);
  // Une vente neuve : une ligne bo_vente pas encore sur le site, ou un immeuble vendu sans ligne.
  const aPublier = [
    ...toutes.filter((v) => v.etat === "non_publiee" && !ventes.find((x) => x.id === v.id)?.data.site_ecartee),
    ...vendus
      .filter((i) => !rattaches.has(i.id))
      .map((i) => ({
        id: `immeuble:${i.id}`,
        immeubleId: i.id,
        commune: S(i.data.adresse_ville) ?? "?",
        dept: String(i.data.adresse_zipcode ?? "").slice(0, 2),
        date: String(i.data["Modified Date"] ?? "").slice(0, 10),
        prix: Number(i.data.prix_hai ?? 0),
        faits: 0,
        brouillon: false,
        etat: "non_publiee" as const,
        attendDepuis: S(i.data["Modified Date"]),
      })),
  ];
  const passees = toutes
    .filter((v) => v.etat !== "non_publiee")
    .sort((a, b) => (a.etat === "avec_recit" ? 1 : 0) - (b.etat === "avec_recit" ? 1 : 0) || b.faits - a.faits || b.date.localeCompare(a.date));
  return { aPublier, passees, configuree: !!c };
}

/**
 * Pour le tableau de bord (contrat §4) : les ventes neuves qui attendent la
 * décision de MAV, et combien attendent depuis plus de sept jours.
 */
export async function ventesAPublier(): Promise<{ nombre: number; enRetard: number }> {
  const { aPublier } = await listeVentes();
  const limite = Date.now() - 7 * 86_400_000;
  return {
    nombre: aPublier.length,
    enRetard: aPublier.filter((v) => v.attendDepuis && Date.parse(v.attendDepuis) < limite).length,
  };
}

/** Une vente ouverte dans l'écran de validation. */
export type VenteOuverte = {
  id: string;
  immeubleId?: string;
  faits: FaitsVente;
  nbFaits: number;
  /** Le texte proposé : le brouillon enregistré, sinon le gabarit. */
  texte: Recit;
  brouillon: boolean;
  /** Les noms du dossier, cherchés dans le texte avant publication. */
  interdits: string[];
  etat: EtatSiteVente;
  url?: string;
  /** La réécriture par Claude est-elle possible ici ? */
  reecriture: boolean;
  configuree: boolean;
  journal: { le: string; agent?: string; geste: string }[];
};

/**
 * Crée la ligne `bo_vente` d'un immeuble vendu qui n'en a pas : c'est ce qui
 * se passe la première fois que MAV ouvre une vente neuve.
 */
async function venteDeImmeuble(immeubleId: string): Promise<string> {
  const deja = await lireBo(`bo_vente?select=id,data&data->>IMMEUBLE=eq.${encodeURIComponent(immeubleId)}`);
  if (deja[0]) return deja[0].id;
  const b = await getBien(immeubleId);
  if (!b) throw new Error("Immeuble introuvable.");
  const offre = b.offres.find((o) => S(o.date_acte)) ?? b.offres.find((o) => S(o.date_compromis)) ?? b.offres[0];
  const id = `app_${Date.now()}x${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;
  await rpcBo("bo_insert_doc", {
    p_table: "bo_vente",
    p_id: id,
    p_doc: {
      ville: S(b.im.adresse_ville) ?? "",
      rue: S(b.im.adresse_rue) ?? "",
      "département": String(b.im.adresse_zipcode ?? "").slice(0, 2),
      prix_hai: Number(offre?.prix_hai ?? b.im.prix_hai ?? 0),
      date: S(offre?.date_acte) ?? new Date().toISOString(),
      photo: S(b.im.photo_main_compressed) ?? null,
      IMMEUBLE: immeubleId,
    },
  });
  return id;
}

/** Lit le dossier d'une vente et en calcule les faits. */
async function sourcesDe(vente: Record<string, unknown>) {
  const immeubleId = S(vente.IMMEUBLE);
  const b = immeubleId ? await getBien(immeubleId).catch(() => null) : null;
  if (!b) throw new Error("La vente n'est rattachée à aucun immeuble du BO.");

  // L'acquéreur : celui de l'offre qui a mené au compromis.
  const retenue = b.offres.find((o) => S(o.date_compromis)) ?? b.offres[0];
  const acheteur = ids(retenue?.ACHETEURs)[0];
  let cible: string | null = null;
  let nomsAcheteur: string[] = [];
  if (acheteur) {
    const [contact] = await lireBo(`bo_contact?select=id,data&id=eq.${encodeURIComponent(acheteur)}`);
    const recherches = await lireBo(`bo_recherche?select=id,data&data->>ACHETEUR=eq.${encodeURIComponent(acheteur)}`);
    cible = S(recherches.find((r) => S(r.data.Cible))?.data.Cible) ?? (ids(contact?.data.Types)[0] ?? null);
    nomsAcheteur = [S(contact?.data.nom), S(contact?.data.entreprise_nom), S(retenue?.acheteur_nom)].filter((x): x is string => !!x);
  }
  const commercialisations = await lireBo(`bo_commercialisation?select=id,data&data->>IMMEUBLE=eq.${encodeURIComponent(b.im._id as string)}`);
  const enLigne = commercialisations.some((x) => x.data.diffusion_online === true) || !!b.im.pb_publie_le || !!b.im.site_publie_le;
  const horsLigne = commercialisations.some((x) => x.data.diffusion_online === false);

  const proprietaire = b.proprietaire ?? null;
  const faits = faitsDe({
    vente,
    im: b.im,
    lots: b.lots,
    mandats: b.mandats,
    offres: b.offres,
    visites: b.visites.length,
    propositions: b.propositions.total,
    secteur: b.secteur,
    nbProprietaires: b.proprietaires.length,
    societeDetentrice: !!b.societeDetentrice,
    proprietaireEstSociete: !!S(proprietaire?.entreprise_nom) && !S(proprietaire?.["prénom"]),
    publieEnLigne: enLigne ? true : horsLigne ? false : null,
    cibleAcquereur: cible,
  });

  /* Les noms à ne jamais laisser passer : propriétaires, sociétés, acquéreur,
     locataires. On cherche chaque nom de famille et chaque raison sociale. */
  const interdits = [
    ...b.proprietaires.flatMap((p) => [S(p.nom), S(p.entreprise_nom)]),
    ...(b.societeDetentrice ? [b.societeDetentrice.nom] : []),
    ...b.societesProprietaires.map((s) => s.nom),
    ...nomsAcheteur,
    ...b.locataires.map((l) => S(l.nom) ?? S(l.formatted_name)),
  ].filter((x): x is string => !!x && x.length >= 3);
  return { b, faits, interdits: [...new Set(interdits)] };
}

/** Ouvre une vente : faits, texte proposé, contrôle. `id` peut être `immeuble:<id>`. */
export async function ouvrirVente(id: string): Promise<VenteOuverte & { id: string }> {
  const venteId = id.startsWith("immeuble:") ? await venteDeImmeuble(id.slice("immeuble:".length)) : id;
  const [v] = await lireBo(`bo_vente?select=id,data&id=eq.${encodeURIComponent(venteId)}`);
  if (!v) throw new Error("Vente introuvable.");
  const { faits, interdits } = await sourcesDe(v.data);
  // Les faits corrigés à la main l'emportent sur ceux du dossier.
  const corriges = (v.data.site_faits && typeof v.data.site_faits === "object" ? v.data.site_faits : {}) as Partial<FaitsVente>;
  const f: FaitsVente = { ...faits, ...corriges };
  const brouillon = S(v.data.site_recit);
  const texte: Recit = brouillon
    ? {
        titre: S(v.data.site_titre) ?? "",
        chapo: S(v.data.site_chapo) ?? "",
        recit: brouillon,
        seo_title: S(v.data.site_seo_title) ?? "",
        seo_desc: S(v.data.site_seo_desc) ?? "",
      }
    : recitGabarit(f, venteId);
  const c = config();
  const duSite = await ventesDuSite(c);
  const enLigne = duSite?.get(venteId);
  // Le nombre de faits sert au tri de la liste : on le garde à jour.
  if (Number(v.data.site_nb_faits ?? -1) !== nombreDeFaits(f)) {
    await rpcBo("bo_patch_doc", { p_table: "bo_vente", p_id: venteId, p_patch: { site_nb_faits: nombreDeFaits(f) } }).catch(() => undefined);
  }
  return {
    id: venteId,
    immeubleId: S(v.data.IMMEUBLE),
    faits: f,
    nbFaits: nombreDeFaits(f),
    texte,
    brouillon: !!brouillon,
    interdits,
    etat: !duSite ? "inconnu" : !enLigne ? "non_publiee" : enLigne.recit && enLigne.recit_valide_le ? "avec_recit" : "sans_recit",
    url: enLigne ? `${PUBLIC}/immeubles-vendus/${enLigne.slug}/` : undefined,
    reecriture: !!process.env.ANTHROPIC_API_KEY,
    configuree: !!c,
    journal: Array.isArray(v.data.site_journal) ? (v.data.site_journal as { le: string; agent?: string; geste: string }[]) : [],
  };
}

/* -------------------------------------------------------------- Brouillon */

async function journaliser(venteId: string, geste: string, agent?: string) {
  const [v] = await lireBo(`bo_vente?select=id,data&id=eq.${encodeURIComponent(venteId)}`);
  const avant = Array.isArray(v?.data.site_journal) ? (v.data.site_journal as unknown[]) : [];
  await rpcBo("bo_patch_doc", {
    p_table: "bo_vente",
    p_id: venteId,
    p_patch: { site_journal: [...avant, { le: new Date().toISOString(), agent, geste }].slice(-50) },
  }).catch(() => undefined);
}

/** Garde les faits corrigés et le texte en cours, sans rien publier. */
export async function enregistrerBrouillon(venteId: string, faits: FaitsVente, texte: Recit, agent?: string) {
  await rpcBo("bo_patch_doc", {
    p_table: "bo_vente",
    p_id: venteId,
    p_patch: {
      site_faits: faits,
      site_titre: texte.titre,
      site_chapo: texte.chapo,
      site_recit: texte.recit,
      site_seo_title: texte.seo_title,
      site_seo_desc: texte.seo_desc,
      site_nb_faits: nombreDeFaits(faits),
    },
  });
  await journaliser(venteId, "brouillon enregistré", agent);
  revalidatePath("/ventes-site");
  return { ok: true as const };
}

/** Le texte du gabarit, sans IA, recalculé depuis les faits de l'écran. */
export async function proposerGabarit(venteId: string, faits: FaitsVente): Promise<Recit> {
  return recitGabarit(faits, `${venteId}:${Date.now()}`);
}

/**
 * La réécriture par Claude (contrat §4) : le modèle ne reçoit QUE les faits de
 * l'écran, jamais la fiche, l'adresse ou un nom. Le résultat est un brouillon
 * que MAV relit et valide ; rien ne part sur le site d'ici.
 */
export async function proposerReecriture(faits: FaitsVente, texteActuel?: Recit) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false as const, message: "ANTHROPIC_API_KEY n'est pas posée dans Vercel : la réécriture n'est pas disponible." };
  }
  const client = new Anthropic();
  const demande =
    `FAITS (seule source autorisée) :\n${faitsEnTexte(faits)}` +
    (texteActuel?.recit ? `\n\nPREMIER JET À AMÉLIORER (même faits, à réécrire librement) :\n${texteActuel.recit}` : "");
  try {
    const r = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "high" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: CONSIGNES_REDACTION,
      messages: [{ role: "user", content: demande }],
    });
    if (r.stop_reason === "refusal") {
      return { ok: false as const, message: "Le modèle a refusé la demande. Gardez le texte du gabarit ou réessayez." };
    }
    const texte = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const lu = lireReponse(texte);
    if (!lu) return { ok: false as const, message: "Réponse illisible du modèle : réessayez." };
    return {
      ok: true as const,
      texte: { ...lu, ...seoDe(faits, lu.chapo) } satisfies Recit,
      mots: compterMots(lu.recit),
    };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false as const, message: "Trop de demandes à la fois : réessayez dans une minute." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false as const, message: "La clé ANTHROPIC_API_KEY est refusée." };
    if (e instanceof Anthropic.APIError) return { ok: false as const, message: `Claude ${e.status ?? ""} : ${e.message}` };
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------- Publication */

/** La rue sans aucun chiffre : la base du site refuse le moindre numéro. */
function rueSansNumero(rue: string | null): string | null {
  if (!rue) return null;
  const r = rue.replace(/\d+\s*(bis|ter|quater)?\b/gi, "").replace(/\s{2,}/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
  return r && !/\d/.test(r) ? r.charAt(0).toLowerCase() + r.slice(1) : null;
}

/** Copie la photo de la vente dans le coffre `ventes` du site, sous un nom neutre. */
async function deposerPhoto(c: Config, venteId: string, photo: string | undefined): Promise<string | null> {
  if (!photo) return null;
  try {
    let res: Response | null = null;
    if (photo.startsWith("storage:") && BO_KEY) {
      res = await fetch(`${BO_URL}/storage/v1/object/bo-files/${photo.slice("storage:".length)}`, {
        headers: { Authorization: `Bearer ${BO_KEY}` }, cache: "no-store",
      });
    } else {
      const url = new URL(photo.startsWith("//") ? `https:${photo}` : photo);
      const jeton = process.env.BUBBLE_API_TOKEN;
      res = await fetch(url, {
        headers: jeton && url.hostname === "vente.france-immeuble.fr" ? { Authorization: `Bearer ${jeton}` } : {},
        redirect: "follow", cache: "no-store",
      });
    }
    if (!res?.ok) return null;
    const type = res.headers.get("Content-Type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const nom = `${venteId}-1.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`;
    await site(c, `/storage/v1/object/ventes/${nom}`, {
      method: "POST",
      headers: { "Content-Type": type, "x-upsert": "true" },
      body: await res.arrayBuffer(),
    });
    return nom;
  } catch {
    return null;
  }
}

/** Dépose la vente dans `ventes` : création ou mise à jour, jamais de slug envoyé. */
async function deposer(venteId: string, faits: FaitsVente, texte: Recit | null) {
  const c = config();
  if (!c) throw new Error("Le site n'est pas branché : SITE_FI_SUPABASE_URL ou SITE_FI_SUPABASE_SECRET_KEY manque.");
  const [v] = await lireBo(`bo_vente?select=id,data&id=eq.${encodeURIComponent(venteId)}`);
  if (!v) throw new Error("Vente introuvable.");
  const lues = await ventesDuSite(c);
  if (!lues) throw new Error("La base du site ne répond pas : rien n'a été envoyé.");
  const existant = lues.get(venteId);
  const image = existant?.image ?? (await deposerPhoto(c, venteId, S(v.data.photo)));
  const ligne = {
    id: venteId,
    ville: faits.commune,
    dept: faits.dept,
    prix: faits.prix,
    date: faits.date,
    region: faits.region,
    image,
    rue: rueSansNumero(faits.rue),
    type: faits.type,
    arrondissement: faits.arrondissement,
    lots: faits.lots,
    composition: faits.composition,
    surface_min: faits.surface_min,
    surface_max: faits.surface_max,
    epoque: faits.epoque,
    dpe: faits.dpe,
    occupation: faits.occupation,
    rendement: faits.rendement,
    profil_acquereur: faits.profil_acquereur,
    profil_vendeur: faits.profil_vendeur,
    mode_commercialisation: faits.mode_commercialisation,
    delai_semaines: faits.delai_semaines,
    acquereurs_sollicites: faits.acquereurs_sollicites,
    visites: faits.visites,
    offres: faits.offres,
    titre: texte?.titre ?? null,
    chapo: texte?.chapo ?? null,
    recit: texte?.recit ?? null,
    seo_title: texte?.seo_title ?? null,
    seo_desc: texte?.seo_desc ?? null,
    recit_valide_le: texte ? new Date().toISOString() : null,
  };
  if (existant) {
    await site(c, `/rest/v1/ventes?id=eq.${encodeURIComponent(venteId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(ligne),
    });
  } else {
    await site(c, "/rest/v1/ventes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(ligne),
    });
  }
  const r = await site(c, `/rest/v1/ventes?select=slug&id=eq.${encodeURIComponent(venteId)}`);
  const slug = ((await r.json()) as { slug: string }[])[0]?.slug;
  return slug ? `${PUBLIC}/immeubles-vendus/${slug}/` : undefined;
}

/**
 * « Valider et publier ». Le contrôle d'anonymat est refait ICI, côté serveur :
 * un bouton forcé dans le navigateur ne doit pas suffire à le contourner.
 */
export async function validerEtPublier(venteId: string, faits: FaitsVente, texte: Recit, agent?: string) {
  try {
    const [v] = await lireBo(`bo_vente?select=id,data&id=eq.${encodeURIComponent(venteId)}`);
    if (!v) return { ok: false as const, message: "Vente introuvable." };
    const { interdits } = await sourcesDe(v.data);
    const alertes = controleAnonymat([texte.titre, texte.chapo, texte.recit, faits.composition ?? ""], interdits, faits.rue);
    if (alertes.length) return { ok: false as const, message: `Publication bloquée : ${alertes.map((a) => a.texte).join(" · ")}` };
    if (nombreDeFaits(faits) < 6) return { ok: false as const, message: "Moins de six faits : pas de récit. Publiez sans récit, ou complétez les faits." };
    await enregistrerBrouillon(venteId, faits, texte, agent);
    const url = await deposer(venteId, faits, texte);
    await rpcBo("bo_patch_doc", { p_table: "bo_vente", p_id: venteId, p_patch: { site_valide_le: new Date().toISOString(), site_ecartee: null } });
    await journaliser(venteId, "validée et publiée avec son récit", agent);
    revalidatePath("/ventes-site");
    return { ok: true as const, url };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

/** « Publier sans récit » : la fiche existe, le site ne la fait pas indexer. */
export async function publierSansRecit(venteId: string, faits: FaitsVente, agent?: string) {
  try {
    const url = await deposer(venteId, faits, null);
    await rpcBo("bo_patch_doc", { p_table: "bo_vente", p_id: venteId, p_patch: { site_faits: faits, site_ecartee: null } });
    await journaliser(venteId, "publiée sans récit", agent);
    revalidatePath("/ventes-site");
    return { ok: true as const, url };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

/** « Ne pas publier » : rien ne part, et la vente sort de la file. */
export async function nePasPublier(venteId: string, agent?: string) {
  await rpcBo("bo_patch_doc", { p_table: "bo_vente", p_id: venteId, p_patch: { site_ecartee: new Date().toISOString() } });
  await journaliser(venteId, "ne pas publier", agent);
  revalidatePath("/ventes-site");
  return { ok: true as const };
}

/** Le contrôle d'anonymat, pour l'écran : rejoué à chaque frappe. */
export async function controler(venteId: string, faits: FaitsVente, texte: Recit) {
  const [v] = await lireBo(`bo_vente?select=id,data&id=eq.${encodeURIComponent(venteId)}`);
  if (!v) return [];
  const { interdits } = await sourcesDe(v.data);
  return controleAnonymat([texte.titre, texte.chapo, texte.recit, faits.composition ?? ""], interdits, faits.rue);
}
