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

import { revalidatePath, unstable_cache } from "next/cache";
import { getAgentFiche, getBien } from "@/lib/bubble/server";
import {
  alertes, blocages, chargeUtile, empreinte, lireEtat, statutCible,
  type Alerte, type ChargeUtile, type StatutAnnonce,
} from "@/lib/diffusion";
import { BAREME_HONORAIRES, LIMITES, type VitrineSaisie } from "@/lib/vitrine";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
/* Plein Bail documente `PLEIN_BAIL_URL` / `PLEIN_BAIL_JETON`, le BO avait été
   écrit sur `PLEINBAIL_URL` / `PLEINBAIL_TOKEN`. Les deux sont acceptés : une
   variable mal nommée ne se voit pas — le pont reste simplement muet, et on
   croit à une panne de réseau pendant une heure. */
const PB_URL = process.env.PLEIN_BAIL_URL ?? process.env.PLEINBAIL_URL;
const PB_TOKEN = process.env.PLEIN_BAIL_JETON ?? process.env.PLEINBAIL_TOKEN;
/* Barème d'honoraires publié — obligation de l'arrêté du 10 janvier 2017 sur
   tout support publicitaire, annonce en ligne comprise. La valeur par défaut
   est le PDF déjà publié par France Immeuble ; l'environnement peut la
   remplacer le jour où le barème change d'adresse. */
const PB_BAREME = process.env.FI_BAREME_HONORAIRES_URL ?? BAREME_HONORAIRES;

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

/** Une URL signée sur notre bucket, valable une heure. */
async function signer(chemin: string): Promise<string | null> {
  if (!SB_KEY) return null;
  const res = await fetch(`${SB_URL}/storage/v1/object/sign/bo-files/${chemin}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const { signedURL } = (await res.json()) as { signedURL?: string };
  return signedURL ? `${SB_URL}/storage/v1${signedURL}` : null;
}

/**
 * Recopie une image encore hébergée chez Bubble dans notre Storage.
 *
 * Bubble sert ses `fileupload` en 401 à toute requête anonyme : il faut le
 * jeton d'API, et ce jeton ne sort pas d'ici. Donner son URL à Plein Bail
 * revenait donc à lui donner une porte fermée — c'est ce qui a fait échouer
 * les neuf photos de Drancy.
 *
 * Le chemin de destination dérive de l'empreinte de la source : une photo
 * n'est recopiée qu'une fois, et une republication ne retransfère rien. Si
 * l'opération est interrompue à mi-parcours, ce qui est déjà passé reste
 * acquis et la republication suivante finit le travail.
 */
async function rapatrier(source: string): Promise<string | null> {
  if (!SB_KEY) return null;
  const nom = (source.split("?")[0].split("/").pop() ?? "photo").toLowerCase();
  const ext = /\.(jpe?g|png|webp|gif|avif)$/.exec(nom)?.[1] ?? "jpg";
  const chemin = `diffusion/${empreinte(source)}.${ext}`;

  const dejaLa = await fetch(`${SB_URL}/storage/v1/object/bo-files/${chemin}`, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).then((r) => r.ok).catch(() => false);

  if (!dejaLa) {
    const jeton = process.env.BUBBLE_API_TOKEN;
    const amont = await fetch(source, {
      headers: jeton && new URL(source).hostname === "vente.france-immeuble.fr"
        ? { Authorization: `Bearer ${jeton}` }
        : {},
      redirect: "follow",
      cache: "no-store",
    });
    if (!amont.ok) return null;
    const corps = await amont.arrayBuffer();
    if (corps.byteLength === 0) return null;
    const depot = await fetch(`${SB_URL}/storage/v1/object/bo-files/${chemin}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": amont.headers.get("Content-Type") ?? `image/${ext === "jpg" ? "jpeg" : ext}`,
        "x-upsert": "true",
      },
      body: corps,
      cache: "no-store",
    });
    if (!depot.ok) return null;
  }
  return signer(chemin);
}

/**
 * Les photos du BO vivent soit dans notre Storage, soit encore chez Bubble.
 * Plein Bail doit pouvoir les télécharger : on remplace donc le relais interne
 * `/api/photo` par une URL signée que le monde extérieur sait atteindre — en
 * rapatriant d'abord l'image quand elle est encore chez Bubble.
 */
async function urlTelechargeable(proxy: string): Promise<string | null> {
  try {
    const q = new URLSearchParams(proxy.split("?")[1] ?? "");
    const chemin = q.get("s");
    if (chemin) return signer(chemin);
    const direct = q.get("u");
    return direct ? rapatrier(direct) : null;
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
  /** Ce qui n'empêche pas, mais mérite un regard. */
  alertes: Alerte[];
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
    return { blocages: [{ cle: "fiche", label: "Fiche introuvable", ou: "" }], alertes: [], statut: null, motif: "", charge: null, ecart: false, configuree: !!(PB_URL && PB_TOKEN) };
  }
  const mandat = mandatEnVigueur(b.mandats);
  const empeche = blocages(b, mandat);
  const { statut, motif } = statutCible(b, mandat);
  const agent = await getAgentFiche(String(b.im.AGENT ?? "")).catch(() => null);
  const charge = statut ? chargeUtile(b, mandat, agent, statut, PB_BAREME) : null;
  const emp = charge ? empreinte(charge) : undefined;
  const etat = lireEtat(b.im);
  return {
    blocages: empeche,
    alertes: alertes(b),
    statut,
    motif,
    charge,
    empreinte: emp,
    ecart: !!emp && emp !== etat.empreintePubliee,
    configuree: !!(PB_URL && PB_TOKEN),
  };
}

type Reponse = {
  listing_id: string;
  url?: string;
  status: StatutAnnonce;
  cree?: boolean;
  lots?: number;
  photos?: { copiees: number; conservees: number; ignorees: number };
  /* Le canal par lequel Plein Bail signale qu'il n'a PAS compris une valeur.
     Il ne devine jamais : il laisse le champ vide et le dit ici. Ignorer ce
     tableau, c'est perdre une donnée en silence — un type de bail effacé sur
     une annonce d'immeuble de rapport, personne ne le remarque avant qu'un
     acquéreur pose la question. */
  avertissements?: string[];
};

/** Le corps d'un appel : la charge utile pour publier, l'os pour retirer. */
async function appeler(corps: Record<string, unknown>): Promise<Reponse> {
  if (!PB_URL || !PB_TOKEN) throw new Error("Pont Plein Bail non configuré");
  const res = await fetch(PB_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${PB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
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

    /* Une photo qu'on n'arrive pas à rendre lisible disparaissait en silence.
       Or la synchronisation des photos est COMPLÈTE chez Plein Bail : publier
       une annonce sans photo ne se contente pas de ne rien ajouter, ça retire
       celles qui sont en ligne. On refuse donc plutôt que d'abîmer l'annonce,
       et on le dit — c'est exactement ce qui s'est joué sur Drancy. */
    const perdues = a.charge.photos.length - photos.length;
    if (a.charge.photos.length > 0 && photos.length === 0) {
      return {
        ok: false as const,
        message:
          `Aucune des ${a.charge.photos.length} photos n'a pu être préparée pour l'envoi — publication annulée ` +
          "pour ne pas retirer celles déjà en ligne. Vérifiez que le jeton Bubble est renseigné.",
      };
    }

    const r = await appeler({ ...a.charge, photos, action: "publier" });
    const avertissements = [
      ...(perdues > 0
        ? [`${perdues} photo${perdues > 1 ? "s" : ""} non transmise${perdues > 1 ? "s" : ""} : image source illisible.`]
        : []),
      ...(r.avertissements ?? []),
    ];
    await memoriser(immeubleId, {
      pb_listing_id: r.listing_id,
      pb_url: r.url ?? null,
      pb_statut: r.status,
      pb_empreinte: a.empreinte,
      pb_publie_le: new Date().toISOString(),
      pb_synchro_le: new Date().toISOString(),
      pb_a_resynchroniser: false,
      pb_erreur: null,
      pb_lots: r.lots ?? null,
      pb_photos: r.photos ? `${r.photos.copiees} copiées · ${r.photos.conservees} conservées · ${r.photos.ignorees} ignorées` : null,
      /* Un avertissement n'est pas une erreur : l'annonce est en ligne. Mais
         il faut qu'il se voie, sinon il n'existe pas. */
      pb_avertissements: avertissements.length ? avertissements : null,
    });
    return {
      ok: true as const,
      url: r.url,
      statut: r.status,
      cree: r.cree !== false,
      lots: r.lots,
      photos: r.photos,
      avertissements,
    };
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
    /* Retirer ne prend QUE la référence. Renvoyer la charge complète, comme
       on le faisait, aurait remplacé l'annonce par un envoi amputé de ses
       photos juste avant de la suspendre — et republier n'aurait plus rien
       remonté. La suspension conserve messages, offres et statistiques. */
    if (PB_URL && PB_TOKEN) {
      await appeler({ action: "retirer", reference: `FI:${immeubleId}` });
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
  listing_id?: string;
  /** Fiches ouvertes, dédoublonnées par visiteur et par heure. */
  vues?: number;
  /** Apparitions dans une liste de résultats. */
  impressions?: number;
  clics_photos?: number;
  clics_documents?: number;
  contacts: number;
  telephones: number;
  favoris: number;
  offres: number;
  partages?: number;
  derniere_vue?: string;
};

/**
 * Demande les retombées à Plein Bail.
 *
 * La réponse est un OBJET `{ retombees, inconnues }`, pas un tableau : le lire
 * comme un tableau rendait toujours zéro, sans erreur — le pire des cas. Les
 * références inconnues sont journalisées : ce sont des annonces que le BO croit
 * en ligne et qui n'existent plus chez eux.
 */
export async function retombeesAnnonces(references: string[]): Promise<Retombees[]> {
  if (!PB_URL || !PB_TOKEN || references.length === 0) return [];
  /* Un aller-retour vers Plein Bail à chaque affichage de l'écran Diffusion,
     c'était deux secondes pour des compteurs de vues. Ils bougent à l'échelle
     de la journée, pas de la seconde : cinq minutes de cache suffisent, et
     l'écran redevient instantané. */
  return unstable_cache(
    async () => {
      try {
        const res = await fetch(PB_URL!, {
          method: "POST",
          headers: { Authorization: `Bearer ${PB_TOKEN!}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "retombees", references }),
          cache: "no-store",
        });
        if (!res.ok) return [];
        const j = (await res.json()) as { retombees?: Retombees[]; inconnues?: string[] };
        if (j.inconnues?.length) {
          console.warn("[Plein Bail] références sans annonce :", j.inconnues.join(", "));
        }
        return Array.isArray(j.retombees) ? j.retombees : [];
      } catch {
        return [];
      }
    },
    ["pb-retombees", [...references].sort().join(",")],
    { tags: ["pb_retombees"], revalidate: 300 },
  )();
}

/* ------------------------------------------------------------ Audience */

export type Audience = {
  acheteurs: number | null;
  alertes: number | null;
  /** Renseigné quand le compte est sous le plancher d'anonymat. */
  plancher: string | null;
  prix?: number;
  statut?: string;
};

/**
 * Combien d'acquéreurs inscrits ont une recherche qui correspond à ce bien.
 *
 * C'est le chiffre qui change une conversation de rendez-vous de mandat : « à
 * ce prix, 34 acquéreurs le reçoivent dès demain ; à +10 %, six ». Il vient du
 * moteur de recherche de la marketplace — celui-là même qui fera partir les
 * alertes — donc ce qu'on montre au vendeur est ce qui se passera.
 *
 * Il faut une annonce déposée, fût-elle en brouillon. Le brouillon n'est visible
 * de personne : c'est la façon de sonder AVANT de publier.
 */
export async function audienceAnnonce(immeubleId: string): Promise<
  { ok: true; a: Audience } | { ok: false; message: string; sansAnnonce?: true }
> {
  if (!PB_URL || !PB_TOKEN) return { ok: false, message: "Pont Plein Bail non configuré." };
  const b = await getBien(immeubleId).catch(() => null);
  if (!b) return { ok: false, message: "Fiche introuvable." };
  if (!lireEtat(b.im).listingId) {
    return {
      ok: false,
      sansAnnonce: true,
      message: "Aucune annonce déposée : il faut un brouillon chez Plein Bail pour interroger l'audience.",
    };
  }
  try {
    const res = await fetch(PB_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${PB_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "audience", reference: `FI:${immeubleId}` }),
      cache: "no-store",
    });
    const texte = await res.text();
    if (!res.ok) return { ok: false, message: `Plein Bail ${res.status} : ${texte.slice(0, 200)}` };
    const j = JSON.parse(texte) as {
      acheteurs_correspondants: number | null;
      dont_alertes_actives: number | null;
      plancher: string | null;
      prix_eur?: number;
      statut?: string;
    };
    return {
      ok: true,
      a: {
        acheteurs: j.acheteurs_correspondants,
        alertes: j.dont_alertes_actives,
        plancher: j.plancher,
        prix: j.prix_eur,
        statut: j.statut,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Dépose l'annonce en BROUILLON pour pouvoir sonder l'audience.
 *
 * Un brouillon n'est visible de personne — ni du public, ni des autres agences.
 * C'est ce qui permet de sonder avant d'avoir un mandat signé, donc avant
 * d'avoir le droit de publier. La distinction n'est pas cosmétique : publier
 * sans mandat serait une faute, déposer un brouillon interne ne l'est pas.
 */
export async function deposerBrouillon(immeubleId: string) {
  try {
    if (!PB_URL || !PB_TOKEN) return { ok: false as const, message: "Pont Plein Bail non configuré." };
    const b = await getBien(immeubleId);
    if (!b) return { ok: false as const, message: "Fiche introuvable." };
    if (typeof b.im.prix_hai !== "number" || !b.im.prix_hai) {
      return { ok: false as const, message: "Prix de vente HAI manquant : l'audience se mesure sur un prix." };
    }
    const mandat = mandatEnVigueur(b.mandats);
    const agent = await getAgentFiche(String(b.im.AGENT ?? "")).catch(() => null);
    const charge = chargeUtile(b, mandat, agent, "draft", PB_BAREME);

    const photos = (
      await Promise.all(
        charge.photos.map(async (p) => {
          const url = await urlTelechargeable(p.url);
          return url ? { ...p, url } : null;
        }),
      )
    ).filter(Boolean) as ChargeUtile["photos"];

    const r = await appeler({ ...charge, photos, action: "publier" });
    await memoriser(immeubleId, {
      pb_listing_id: r.listing_id,
      pb_url: r.url ?? null,
      pb_statut: r.status,
      pb_empreinte: empreinte(charge),
      pb_synchro_le: new Date().toISOString(),
      pb_erreur: null,
    });
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------- Vitrine */

/**
 * La page publique de l'agence — `/vendeur/france-immeuble` — qui figure au
 * bas de chacune de nos annonces. Aucun flux du marché ne transporte un logo
 * ni un texte de présentation : c'est au back-office de les pousser.
 *
 * Contrairement à une annonce, seuls les champs ENVOYÉS sont écrits : un champ
 * absent veut dire « je ne le connais pas », jamais « efface-le ». Pour vider,
 * il faut envoyer `""` explicitement.
 */
/**
 * Le logo est-il vraiment téléchargeable depuis l'extérieur ?
 *
 * Plein Bail répond `"logo": "ignoree"` quand il n'arrive pas à le récupérer,
 * et laisse l'existant tranquille — donc en silence, pour qui ne lit pas la
 * réponse. On vérifie AVANT d'envoyer : une URL servie par une préproduction
 * protégée, ou un chemin qui n'existe pas, se voit ici et pas trois jours plus
 * tard sur une page publique sans logo.
 */
export async function verifierLogo(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return { ok: false as const, message: "L'adresse doit être en http ou https." };
    }
    const res = await fetch(url, { method: "GET", cache: "no-store", redirect: "follow" });
    if (!res.ok) return { ok: false as const, message: `Le logo répond ${res.status} — Plein Bail ne pourra pas le télécharger.` };
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      return { ok: false as const, message: `L'adresse répond « ${type || "type inconnu"} », pas une image. Une page de connexion répond souvent 200 en HTML.` };
    }
    const octets = (await res.arrayBuffer()).byteLength;
    if (octets > 2 * 1024 * 1024) {
      return { ok: false as const, message: `Le logo pèse ${Math.round(octets / 1024)} Ko — le plafond est de 2 Mo.` };
    }
    return { ok: true as const, type, octets };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function publierVitrine(v: VitrineSaisie) {
  if (!PB_URL || !PB_TOKEN) {
    return {
      ok: false as const,
      simulation: true as const,
      message: "Mode simulation : PLEIN_BAIL_URL et PLEIN_BAIL_JETON ne sont pas renseignés, rien n'a été envoyé.",
    };
  }
  // On ne pousse pas un logo qu'on sait injoignable : il serait ignoré en silence.
  const logo = await verifierLogo(v.logo_url);
  if (!logo.ok) return { ok: false as const, message: `Logo : ${logo.message}` };

  const agence = {
    slogan: v.slogan.slice(0, LIMITES.slogan),
    presentation: v.presentation.slice(0, LIMITES.presentation),
    site_web: v.site_web,
    zone_intervention: v.zone_intervention.slice(0, LIMITES.zone),
    /* L'empreinte évite de retélécharger le même fichier à chaque appel. Elle
       porte sur l'adresse ET la taille : un logo remplacé au même chemin change
       de taille, donc d'empreinte, donc il repart. */
    logo: { url: v.logo_url, empreinte: empreinte([v.logo_url, logo.octets]) },
  };

  try {
    const res = await fetch(PB_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${PB_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "vitrine", agence }),
      cache: "no-store",
    });
    const texte = await res.text();
    if (!res.ok) return { ok: false as const, message: `Plein Bail ${res.status} : ${texte.slice(0, 300)}` };
    const j = JSON.parse(texte) as { slug: string; url: string; champs: string[]; logo?: string };
    return { ok: true as const, ...j };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}
