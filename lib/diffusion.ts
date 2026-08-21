// Diffusion Plein Bail — la fiche devient une annonce.
//
// Le principe tient en une phrase : l'annonce est une FONCTION de la fiche.
// On ne pousse pas des changements au fil de l'eau — on calcule ce que
// l'annonce devrait être, on en tire une empreinte, et on republie quand
// l'empreinte diffère de celle qui est en ligne. Un seul endroit où se
// tromper, et une annonce désynchronisée se rattrape au tour suivant.
//
// Ce fichier ne parle à personne : il transforme, il ne transmet pas.
// Les appels réseau sont dans lib/bo/diffusion.ts.

import type { BienData } from "./bubble/server";
import { synthese } from "./mandat";

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** Le miroir Bubble stocke les numéros tantôt en texte, tantôt en nombre. */
const T = (v: unknown) =>
  typeof v === "number" ? String(v) : typeof v === "string" && v.trim() ? v.trim() : undefined;

/* --------------------------------------------------------------- Statuts */

/** Les statuts d'annonce de Plein Bail (énumération `listing_status`). */
export type StatutAnnonce =
  | "draft" | "pending_review" | "online" | "rejected"
  | "sous_offre" | "vendu" | "expired" | "suspended";

/**
 * Ce que l'annonce devrait être, vu du BO.
 *
 * C'est ici que se joue « ça doit s'enlever quand le mandat prend fin » :
 * le statut ne se saisit jamais, il se déduit. Personne ne clique quand un
 * mandat arrive à échéance — d'où le calcul plutôt que le bouton.
 */
export function statutCible(b: BienData, mandat: Record<string, unknown> | null): {
  statut: StatutAnnonce | null;
  motif: string;
} {
  const statutBien = String(b.im.Statut ?? "");
  const rang = parseInt(statutBien, 10);

  if (!mandat) return { statut: null, motif: "Aucun mandat de vente signé." };
  if (mandat.publication_web_yn === false) {
    return { statut: null, motif: "Le mandant a refusé la publication en ligne (article 6.4)." };
  }
  const statutMandat = String(mandat.Statut ?? "");
  if (statutMandat === "Annulé") {
    return { statut: "suspended", motif: "Mandat annulé — retrait immédiat." };
  }
  if (statutMandat === "Expiré") {
    return { statut: "expired", motif: "Mandat expiré." };
  }
  const fin = S(mandat.date_fin);
  if (fin && new Date(fin) < new Date()) {
    return { statut: "expired", motif: `Mandat arrivé à échéance le ${new Date(fin).toLocaleDateString("fr-FR")}.` };
  }
  if (rang === 0) return { statut: "suspended", motif: "Immeuble retiré." };
  if (rang === 11) return { statut: "vendu", motif: "Bien vendu." };
  /* La frontière est l'ACCEPTATION de l'offre, pas sa réception. Une offre
     reçue ne change rien : le bien reste en ligne, marqué « sous offre », ce
     qui attire des acquéreurs de repli si elle tombe. Dès que le vendeur
     accepte, on passe en compromis et l'annonce sort de la diffusion. */
  if (rang >= 8 && rang <= 10) {
    return { statut: "suspended", motif: "Offre acceptée, dossier au compromis — l'annonce est retirée." };
  }
  if (rang === 7) {
    return { statut: "sous_offre", motif: "Offre reçue, non encore acceptée — l'annonce reste en ligne, marquée." };
  }
  if (rang >= 5) return { statut: "online", motif: "Commercialisé." };
  return { statut: null, motif: "Le bien n'est pas encore au stade de la commercialisation." };
}

/* ------------------------------------------------------------- Blocages */

export type Blocage = { cle: string; label: string; ou: string };

/**
 * Ce qui interdit de publier. Volontairement court : Plein Bail ne bloque
 * lui-même que sur un titre et un prix (son trigger `controles_soumission`).
 * Le reste de la liste, c'est notre propre exigence — un mandat qui autorise
 * la diffusion, et de quoi faire une annonce qui ne soit pas indigente.
 */
export function blocages(b: BienData, mandat: Record<string, unknown> | null): Blocage[] {
  const out: Blocage[] = [];
  const im = b.im;

  if (!mandat) {
    out.push({ cle: "mandat", label: "Aucun mandat de vente signé sur ce bien", ou: "Mandats" });
  } else {
    if (!S(mandat.date_signature) && !S(mandat.pdf_signed)) {
      out.push({ cle: "signature", label: "Le mandat n'est pas signé", ou: "Mandats" });
    }
    // Le numéro de registre est stocké tantôt en texte, tantôt en nombre :
    // ne le lire que comme texte le faisait passer pour manquant.
    if (mandat.numero === undefined || mandat.numero === null || mandat.numero === "") {
      out.push({ cle: "numero", label: "Le mandat n'a pas de numéro de registre", ou: "Mandats" });
    }
    if (mandat.publication_web_yn === false) {
      out.push({ cle: "web", label: "Le mandant a refusé la publication en ligne", ou: "Mandats" });
    }
  }

  if (!N(im.prix_hai)) out.push({ cle: "prix", label: "Prix de vente HAI manquant", ou: "Description et prix" });
  if ((S(im.descriptif) ?? "").length < 100) {
    out.push({ cle: "descriptif", label: "Descriptif trop court (100 caractères minimum)", ou: "Description et prix" });
  }
  const photos = b.photos.filter((p) => p.dossier || p.type === "Principale");
  if (photos.length === 0) out.push({ cle: "photos", label: "Aucune photo retenue pour la diffusion", ou: "Photos" });
  if (b.lots.length === 0) out.push({ cle: "lots", label: "Aucun lot dans l'état locatif", ou: "Etat locatif" });

  return out;
}

/* --------------------------------------------------------- Charge utile */

export type PhotoAnnonce = { url: string; position: number; is_cover: boolean; empreinte: string };

export type LotAnnonce = {
  designation: string;
  type_lot: string;
  etage?: number;
  surface_m2?: number;
  surface_carrez?: number;
  statut: "loue" | "libre";
  type_bail?: string;
  loyer_mensuel_hc?: number;
  loyer_marche_estime?: number;
  dpe_lot?: string;
  etat?: string;
  travaux_previsionnels_eur?: number;
  /** Nature seule : jamais de nom. Garde-fou RGPD, voir plus bas. */
  locataire_nature?: "physique" | "morale";
};

export type ChargeUtile = {
  reference: string;
  statut_cible: StatutAnnonce;
  bien: Record<string, unknown>;
  prix: Record<string, unknown>;
  charges: Record<string, unknown>;
  travaux: Record<string, unknown>;
  contact: Record<string, unknown>;
  lots: LotAnnonce[];
  photos: PhotoAnnonce[];
  documents: { nom: string; url: string; type: string }[];
};

/** Destination BO → type de lot Plein Bail. */
const TYPE_LOT: Record<string, string> = {
  Logement: "appartement",
  Commerce: "commerce",
  Bureau: "bureau",
  Logistique: "local_activite",
  Cave: "cave",
  Parking: "stationnement",
  Annexe: "autre",
};

/** État BO → énumération `etat_general` de Plein Bail. */
const ETAT: Record<string, string> = {
  Neuf: "neuf",
  Renove: "renove",
  "Bon etat": "bon_etat",
  "Etat d'usage": "rafraichissement",
  Travaux: "a_renover",
};

const LIBRE = new Set(["Vide", "", "n.c."]);

/** Empreinte courte et stable d'une valeur — sert à détecter les écarts. */
export function empreinte(v: unknown): string {
  const texte = JSON.stringify(v);
  // FNV-1a 32 bits, doublé sur deux graines : suffisant pour comparer deux
  // versions d'une même annonce, et lisible dans les journaux.
  const fnv = (graine: number) => {
    let h = graine;
    for (let i = 0; i < texte.length; i++) {
      h ^= texte.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return fnv(0x811c9dc5) + fnv(0x9e3779b9);
}

/**
 * La fiche, telle que Plein Bail doit la recevoir.
 *
 * Deux choses volontairement absentes :
 *   • les loyers annuels, taux d'occupation et rendements — le déclencheur
 *     `listing_lots_recalcul` les recalcule depuis les lots. Les envoyer,
 *     c'est risquer de contredire ce que la marketplace calcule elle-même ;
 *   • le moindre nom de locataire. Voir `locataire_nature`.
 */
export function chargeUtile(
  b: BienData,
  mandat: Record<string, unknown> | null,
  agent: Record<string, unknown> | null,
  statut: StatutAnnonce,
): ChargeUtile {
  const im = b.im;
  const s = synthese(b.lots);

  /* L'adresse exacte est transmise — Plein Bail en a besoin pour situer le
     bien et calculer ses repères — mais elle n'est JAMAIS publiée. Règle de
     maison sans exception, occupé ou pas : un immeuble de rapport en vente
     ne s'affiche pas au numéro près, ni pour les locataires, ni pour les
     confrères. D'où `ville_quartier`, toujours. */
  const affichage = "ville_quartier";

  const photos = b.photos
    .filter((p) => p.dossier || p.type === "Principale")
    .sort((x, y) => (x.type === "Principale" ? -1 : y.type === "Principale" ? 1 : x.ordre - y.ordre))
    .map((p, i) => ({
      url: p.urlPleine ?? p.url ?? "",
      position: i,
      is_cover: i === 0,
      empreinte: empreinte(p.urlPleine ?? p.url ?? p.id),
    }))
    .filter((p) => p.url);

  const lots: LotAnnonce[] = b.lots.map((l) => {
    const bail = String(l.Type_bail ?? "");
    const loue = !LIBRE.has(bail);
    const dest = String(l.Destination ?? "Annexe");
    return {
      designation: `Lot ${T(l.numero) ?? "?"}${S(l.Type_lot) ? ` — ${S(l.Type_lot)}` : ""}`,
      type_lot: TYPE_LOT[dest] ?? "autre",
      etage: N(l.etage),
      surface_m2: N(l.surface_sol) ?? N(l.surface_carrez),
      surface_carrez: N(l.surface_carrez),
      statut: loue ? "loue" : "libre",
      type_bail: loue ? bail : undefined,
      loyer_mensuel_hc: loue ? N(l.loyer) : undefined,
      loyer_marche_estime: N(l.loyer_max),
      dpe_lot: S(l.Type_dpe) === "n.c." ? undefined : S(l.Type_dpe),
      etat: ETAT[String(l.Etat ?? "")],
      travaux_previsionnels_eur: N(l.travaux),
      /* RGPD, garde-fou n°1 du projet : le nom du locataire ne franchit
         jamais la frontière. Plein Bail a bien un champ pour ça — il est
         fait pour les annonceurs tiers, pas pour nous. On n'envoie que la
         nature, et encore, seulement quand le lot est loué. */
      locataire_nature: loue
        ? (String(l.Type_bail) === "3/6/9" || dest === "Commerce" || dest === "Bureau"
            ? "morale"
            : "physique")
        : undefined,
    };
  });

  /* Charges : le BO distingue déjà récupérable et non récupérable, ce que
     presque aucun flux annonceur ne sait faire. */
  const chargeParType = (predicat: (t: string) => boolean, champ: "recup_an" | "non_recup_an" | "total_an") =>
    b.charges.filter((c) => predicat(String(c.Type_charge ?? ""))).reduce((sum, c) => sum + (N(c[champ]) ?? 0), 0);
  const tf = (t: string) => t === "Taxe Foncière";
  const horsTf = (t: string) => t !== "Taxe Foncière";
  const detailCharges = Object.fromEntries(
    b.charges
      .filter((c) => horsTf(String(c.Type_charge ?? "")) && (N(c.total_an) ?? 0) > 0)
      .map((c) => [String(c.Type_charge ?? "Autre"), N(c.total_an) ?? 0]),
  );

  /* Travaux : la liste réelle de l'état technique, pas une estimation en
     bloc. C'est ce qui permet à un acquéreur de chiffrer son projet. */
  const travaux = b.travaux.map((t) => ({
    description: S(t.description) ?? S(t.commentaire) ?? "Travaux",
    montant: N(t.montant),
    urgence: S(t.Urgence),
    devis: t.YN_devis === true,
  }));
  const travauxTotal = travaux.reduce((sum, t) => sum + (t.montant ?? 0), 0);

  return {
    reference: `FI:${String(im._id)}`,
    statut_cible: statut,
    bien: {
      categorie: "immeuble",
      titre: titreAnnonce(b, s),
      description: S(im.descriptif),
      adresse: [S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" "),
      code_postal: S(im.adresse_zipcode),
      ville: S(im.adresse_ville),
      lat: N((b.adr?.geo as Record<string, unknown> | undefined)?.lat),
      lng: N((b.adr?.geo as Record<string, unknown> | undefined)?.lng),
      affichage_adresse: affichage,
      surface_totale: N(im.surface_carrez) ?? s.surface,
      nb_lots: b.lots.length,
      annee_construction: N(im.year_constru),
      etat_general: ETAT[String(im.Etat ?? "")],
      occupation_statut: s.occupation === "libre" ? "libre_100" : s.occupation === "occupe" ? "occupe_100" : "partiel",
      copropriete: false,
    },
    prix: {
      prix_eur: N(im.prix_hai),
      honoraires_charge: String(im.prix_Charge_honos ?? "Acheteur") === "Vendeur" ? "vendeur" : "acquereur",
      honoraires_eur: N(im.prix_honos_ttc),
      mandat_numero: T(mandat?.numero),
    },
    charges: {
      taxe_fonciere_eur: chargeParType(tf, "total_an") || undefined,
      taxe_fonciere_recuperable_eur: chargeParType(tf, "recup_an") || undefined,
      charges_expl_eur: chargeParType(horsTf, "non_recup_an") || undefined,
      charges_recuperables_eur: chargeParType(horsTf, "recup_an") || undefined,
      charges_exploitation_detail: Object.keys(detailCharges).length ? detailCharges : undefined,
    },
    travaux: {
      travaux_a_prevoir: travaux.length
        ? travaux.map((t) => `${t.description}${t.montant ? ` — ${Math.round(t.montant)} €` : ""}`).join(" · ")
        : undefined,
      travaux_estimation_eur: travauxTotal || undefined,
      travaux_prevus_total_eur: travauxTotal || undefined,
      travaux_devis: travaux.some((t) => t.devis),
      detail: travaux,
    },
    /* Le contact affiché est l'AGENT du dossier, pas le standard de l'agence :
       l'acquéreur doit tomber sur la personne qui connaît l'immeuble. */
    contact: {
      nom: [S(agent?.["prénom"]), S(agent?.nom)].filter(Boolean).join(" ") || undefined,
      poste: S(agent?.Poste),
      email: S(agent?.email),
      telephone: S(agent?.portable) ?? S(agent?.fixe),
      initiales: S(agent?.initiales),
    },
    lots,
    photos,
    documents: [],
  };
}

/** Le titre de l'annonce, composé — jamais saisi à la main. */
function titreAnnonce(b: BienData, s: ReturnType<typeof synthese>): string {
  const ville = S(b.im.adresse_ville) ?? "France";
  const cp = S(b.im.adresse_zipcode);
  const bouts = [
    "Immeuble de rapport",
    b.lots.length ? `${b.lots.length} lots` : undefined,
    s.surface ? `${Math.round(s.surface)} m²` : undefined,
    `${ville}${cp ? ` (${cp.slice(0, 2)})` : ""}`,
  ].filter(Boolean);
  return bouts.join(" — ");
}

/* ------------------------------------------------------- État de diffusion */

export type EtatDiffusion = {
  /** L'annonce existe-t-elle côté Plein Bail ? */
  publiee: boolean;
  listingId?: string;
  url?: string;
  statutEnLigne?: StatutAnnonce;
  publieLe?: string;
  /** L'empreinte de ce qui est en ligne. */
  empreintePubliee?: string;
  /** Des changements attendent d'être publiés ? */
  aResynchroniser: boolean;
  derniereSynchro?: string;
  derniereErreur?: string;
};

export function lireEtat(im: Record<string, unknown>): EtatDiffusion {
  const id = S(im.pb_listing_id);
  return {
    publiee: !!id,
    listingId: id,
    url: S(im.pb_url),
    statutEnLigne: S(im.pb_statut) as StatutAnnonce | undefined,
    publieLe: S(im.pb_publie_le),
    empreintePubliee: S(im.pb_empreinte),
    aResynchroniser: im.pb_a_resynchroniser === true,
    derniereSynchro: S(im.pb_synchro_le),
    derniereErreur: S(im.pb_erreur),
  };
}

/** Le libellé lisible d'un statut d'annonce. */
export const LIBELLE_STATUT: Record<StatutAnnonce, string> = {
  draft: "Brouillon",
  pending_review: "En relecture",
  online: "En ligne",
  rejected: "Refusée",
  sous_offre: "Sous offre",
  vendu: "Vendue",
  expired: "Expirée",
  suspended: "Retirée",
};
