"use server";

// Diffusion Plein Bail — la partie qui parle au réseau.
//
// Trois gestes seulement : publier, retirer, réconcilier. Le calcul de ce
// qu'il faut envoyer est dans lib/diffusion.ts ; ici on transporte.
//
// Tant que PLEINBAIL_URL et PLEINBAIL_TOKEN ne sont pas renseignés, tout
// fonctionne en SIMULATION : la charge utile est calculée, affichée,
// vérifiable — et rien ne part. C'est ce qui permet de tout recetter avant
// la première publication réelle.

import { revalidatePath } from "next/cache";
import { getAgentFiche, getBien } from "@/lib/bubble/server";
import {
  blocages, chargeUtile, empreinte, lireEtat, statutCible,
  type ChargeUtile, type StatutAnnonce,
} from "@/lib/diffusion";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PB_URL = process.env.PLEINBAIL_URL;
const PB_TOKEN = process.env.PLEINBAIL_TOKEN;

/** Le pont est-il branché, ou tourne-t-on à blanc ? */
export async function diffusionConfiguree() {
  return !!(PB_URL && PB_TOKEN);
}

async function rpc(fn: string, args: Record<string, unknown>) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Les photos du BO vivent soit dans notre Storage, soit encore chez Bubble.
 * Plein Bail doit pouvoir les télécharger : on remplace donc le relais interne
 * `/api/photo` par une URL que le monde extérieur sait atteindre — signée une
 * heure pour le Storage, telle quelle pour Bubble qui les sert publiquement.
 */
async function urlTelechargeable(proxy: string): Promise<string | null> {
  try {
    const q = new URLSearchParams(proxy.split("?")[1] ?? "");
    const direct = q.get("u");
    if (direct) return direct;
    const chemin = q.get("s");
    if (!chemin || !SB_KEY) return null;
    const res = await fetch(`${SB_URL}/storage/v1/object/sign/bo-files/${chemin}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const { signedURL } = (await res.json()) as { signedURL?: string };
    return signedURL ? `${SB_URL}/storage/v1${signedURL}` : null;
  } catch {
    return null;
  }
}

/** Le mandat de vente en vigueur sur ce bien, s'il y en a un. */
function mandatEnVigueur(mandats: Record<string, unknown>[]): Record<string, unknown> | null {
  const vente = mandats.filter((m) => String(m.Type ?? "Vente") === "Vente");
  // Un mandat signé et non annulé prime ; à défaut, le plus récent.
  const signes = vente.filter(
    (m) => (m.date_signature || m.pdf_signed) && String(m.Statut ?? "") !== "Annulé",
  );
  const pool = signes.length ? signes : vente;
  return (
    [...pool].sort((a, b) =>
      String(b.date_effet ?? b["Created Date"] ?? "").localeCompare(String(a.date_effet ?? a["Created Date"] ?? "")),
    )[0] ?? null
  );
}

export type Apercu = {
  /** Ce qui empêche de publier, s'il y a lieu. */
  blocages: { cle: string; label: string; ou: string }[];
  statut: StatutAnnonce | null;
  motif: string;
  charge: ChargeUtile | null;
  empreinte?: string;
  /** L'empreinte diffère-t-elle de ce qui est en ligne ? */
  ecart: boolean;
  configuree: boolean;
};

/**
 * Ce que la publication ferait, sans la faire. Sert à l'écran Diffusion et,
 * tant que le pont n'est pas branché, de mode de recette.
 */
export async function apercuAnnonce(immeubleId: string): Promise<Apercu> {
  const b = await getBien(immeubleId);
  if (!b) {
    return { blocages: [{ cle: "fiche", label: "Fiche introuvable", ou: "" }], statut: null, motif: "", charge: null, ecart: false, configuree: !!(PB_URL && PB_TOKEN) };
  }
  const mandat = mandatEnVigueur(b.mandats);
  const empeche = blocages(b, mandat);
  const { statut, motif } = statutCible(b, mandat);
  const agent = await getAgentFiche(String(b.im.AGENT ?? "")).catch(() => null);
  const charge = statut ? chargeUtile(b, mandat, agent, statut) : null;
  const emp = charge ? empreinte(charge) : undefined;
  const etat = lireEtat(b.im);
  return {
    blocages: empeche,
    statut,
    motif,
    charge,
    empreinte: emp,
    ecart: !!emp && emp !== etat.empreintePubliee,
    configuree: !!(PB_URL && PB_TOKEN),
  };
}

type Reponse = { listing_id: string; url?: string; status: StatutAnnonce; cree?: boolean };

async function appeler(charge: ChargeUtile, action: "publier" | "retirer"): Promise<Reponse> {
  if (!PB_URL || !PB_TOKEN) throw new Error("Pont Plein Bail non configuré");
  const res = await fetch(PB_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${PB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...charge, action }),
    cache: "no-store",
  });
  const texte = await res.text();
  if (!res.ok) throw new Error(`Plein Bail ${res.status} : ${texte.slice(0, 300)}`);
  return JSON.parse(texte) as Reponse;
}

async function memoriser(immeubleId: string, patch: Record<string, unknown>) {
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: patch });
  revalidatePath("/", "layout");
  revalidatePath(`/bien/${immeubleId}`);
  revalidatePath("/diffusion");
}

/**
 * Publie, ou republie. C'est le même geste : l'index unique sur
 * `import_reference` fait qu'un envoi répété met à jour au lieu de dupliquer.
 */
export async function publierAnnonce(immeubleId: string) {
  try {
    const a = await apercuAnnonce(immeubleId);
    if (a.blocages.length) {
      return { ok: false as const, message: `Publication impossible : ${a.blocages[0].label}.` };
    }
    if (!a.charge || !a.statut) {
      return { ok: false as const, message: a.motif || "Le bien n'est pas diffusable en l'état." };
    }
    if (!PB_URL || !PB_TOKEN) {
      return {
        ok: false as const,
        simulation: true as const,
        message:
          "Mode simulation : la charge utile est calculée et vérifiable, mais PLEINBAIL_URL et PLEINBAIL_TOKEN ne sont pas renseignés — rien n'a été envoyé.",
      };
    }

    // Les photos partent en URLs téléchargeables, pas en liens internes.
    const photos = (
      await Promise.all(
        a.charge.photos.map(async (p) => {
          const url = await urlTelechargeable(p.url);
          return url ? { ...p, url } : null;
        }),
      )
    ).filter(Boolean) as ChargeUtile["photos"];

    const r = await appeler({ ...a.charge, photos }, "publier");
    await memoriser(immeubleId, {
      pb_listing_id: r.listing_id,
      pb_url: r.url ?? null,
      pb_statut: r.status,
      pb_empreinte: a.empreinte,
      pb_publie_le: new Date().toISOString(),
      pb_synchro_le: new Date().toISOString(),
      pb_a_resynchroniser: false,
      pb_erreur: null,
    });
    return { ok: true as const, url: r.url, statut: r.status, cree: r.cree !== false };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await memoriser(immeubleId, { pb_erreur: message, pb_synchro_le: new Date().toISOString() }).catch(() => {});
    return { ok: false as const, message };
  }
}

/** Retire l'annonce. Le mandat qui prend fin passe par ici. */
export async function retirerAnnonce(immeubleId: string, motif: string) {
  try {
    const b = await getBien(immeubleId);
    if (!b) return { ok: false as const, message: "Fiche introuvable" };
    const etat = lireEtat(b.im);
    if (!etat.listingId) return { ok: false as const, message: "Aucune annonce publiée." };
    if (PB_URL && PB_TOKEN) {
      const mandat = mandatEnVigueur(b.mandats);
      const agent = await getAgentFiche(String(b.im.AGENT ?? "")).catch(() => null);
      const charge = chargeUtile(b, mandat, agent, "suspended");
      await appeler({ ...charge, photos: [] }, "retirer");
    }
    await memoriser(immeubleId, {
      pb_statut: "suspended",
      pb_retire_le: new Date().toISOString(),
      pb_motif_retrait: motif,
      pb_a_resynchroniser: false,
      pb_erreur: null,
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Le réconciliateur. Compare ce que l'annonce devrait être à ce qu'elle est,
 * et n'agit que s'il y a un écart. Appelé par le marquage « à resynchroniser »
 * et par le rendez-vous quotidien.
 */
export async function synchroniserAnnonce(immeubleId: string) {
  const b = await getBien(immeubleId).catch(() => null);
  if (!b) return { ok: false as const, message: "Fiche introuvable" };
  const etat = lireEtat(b.im);
  if (!etat.listingId) return { ok: true as const, rien: true as const };

  const a = await apercuAnnonce(immeubleId);

  // Le mandat ne permet plus la diffusion : on retire, quoi qu'il arrive.
  if (!a.statut || a.blocages.some((x) => ["mandat", "signature", "web"].includes(x.cle))) {
    return retirerAnnonce(immeubleId, a.motif || a.blocages[0]?.label || "Conditions de diffusion non réunies");
  }
  // Rien n'a bougé : on ne dérange pas la marketplace.
  if (!a.ecart && etat.statutEnLigne === a.statut) return { ok: true as const, rien: true as const };

  return publierAnnonce(immeubleId);
}

/**
 * Marque une fiche à resynchroniser. Appelé depuis `refresh()`, donc derrière
 * chaque écriture du BO — un lot, une photo, un prix, une charge, le mandat.
 * On ne fait ici qu'écrire un drapeau : la republication part ensuite, sans
 * faire attendre l'agent qui vient d'enregistrer.
 */
export async function marquerAResynchroniser(immeubleId: string) {
  try {
    await rpc("bo_patch_doc", {
      p_table: "bo_immeuble",
      p_id: immeubleId,
      p_patch: { pb_a_resynchroniser: true },
    });
  } catch {
    /* La diffusion ne doit jamais faire échouer un enregistrement. */
  }
}

/** Les retombées d'une annonce, lues chez Plein Bail. */
export type Retombees = {
  reference: string;
  vues?: number;
  contacts: number;
  telephones: number;
  favoris: number;
  offres: number;
};

/**
 * Demande les retombées à Plein Bail. Le décompte des vues n'existe pas encore
 * côté marketplace (aucune table ne les enregistre) : le champ reste vide tant
 * que ce n'est pas ajouté là-bas, et l'écran le dit plutôt que d'afficher zéro.
 */
export async function retombeesAnnonces(references: string[]): Promise<Retombees[]> {
  if (!PB_URL || !PB_TOKEN || references.length === 0) return [];
  try {
    const res = await fetch(PB_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${PB_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retombees", references }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as Retombees[];
  } catch {
    return [];
  }
}
