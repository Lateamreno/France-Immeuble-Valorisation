/**
 * L'espace propriétaire — le côté serveur.
 *
 * Un lien secret, ouvert depuis l'estimation, qui donne au vendeur trois
 * choses et rien d'autre : arrêter lui-même son prix, déposer ses pièces, voir
 * où en est la vente. Ce que le BO en retire, c'est du temps — le prix net
 * vendeur cesse d'être une négociation au téléphone reportée à la main, et les
 * pièces cessent d'arriver en pièces jointes à trier.
 *
 * ## Ce qui gouverne ce fichier
 *
 * **Le jeton est la seule identité.** Rien de ce qui vient du navigateur ne
 * désigne un immeuble : la page reçoit un jeton, le serveur en déduit l'immeuble.
 * Un propriétaire ne peut donc pas, en changeant un identifiant dans une
 * requête, déposer une pièce sur l'immeuble du voisin.
 *
 * **Le propriétaire ne voit que ce qu'il a le droit de voir.** `vueProprietaire`
 * est une liste blanche, pas un filtre : on construit un objet neuf avec les
 * champs autorisés, au lieu de retirer les champs interdits d'un objet complet.
 * La différence compte le jour où une colonne s'ajoute côté BO — avec un
 * filtre, elle fuiterait ; avec une liste blanche, elle reste dedans. Aucun nom
 * de locataire, aucun nom d'acquéreur, aucun montant d'offre, aucun commentaire
 * interne ne franchit cette fonction (garde-fou §8.3).
 *
 * **Ce que le propriétaire écrit vit en `fi_*`.** `bo_*` est le miroir Bubble,
 * réécrit chaque nuit : un prix posé là aurait disparu au matin.
 */

import "server-only";
import { randomBytes } from "crypto";
import { getBien, type BienData } from "@/lib/bubble/server";
import {
  depDuCp, liensSecteur, normCommune,
  type Espace, type Piece, type SecteurImmeuble, type VueProprietaire,
} from "@/lib/bo/espace-modele";
import type { BienVendeur, PieceClient } from "@/lib/bo/espace-anon";

/* Le vocabulaire partagé vit dans `espace-modele`, qui n'importe rien : un
   composant client peut le lire sans entraîner la clé de service avec lui. */
export * from "@/lib/bo/espace-modele";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const entetes = () => ({ apikey: SB_KEY as string, Authorization: `Bearer ${SB_KEY}` });

/* ---------- Lecture du jeton ---------- */

/** Pourquoi un lien ne s'ouvre pas. */
export type Refus = "inconnu" | "revoque" | "expire";

/**
 * L'espace derrière un jeton, ou la raison du refus.
 *
 * Pas de mise en cache : un lien révoqué doit cesser de fonctionner tout de
 * suite, pas dans une minute. C'est une requête par ouverture de page, sur une
 * table qui en contient quelques centaines.
 */
export async function lireEspace(jeton: string): Promise<Espace | Refus> {
  if (!SB_KEY || !/^[A-Za-z0-9_-]{20,80}$/.test(jeton)) return "inconnu";
  const res = await fetch(
    `${SB_URL}/rest/v1/fi_espace_proprietaire?jeton=eq.${encodeURIComponent(jeton)}&select=*&limit=1`,
    { headers: entetes(), cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return "inconnu";
  const e = ((await res.json()) as Espace[])[0];
  if (!e) return "inconnu";
  if (e.revoque) return "revoque";
  if (e.expire_le && new Date(e.expire_le).getTime() < Date.now()) return "expire";
  return e;
}

/** L'espace en cours d'un immeuble, pour l'écran du BO. */
export async function espaceDuBien(immeubleId: string): Promise<Espace | null> {
  if (!SB_KEY) return null;
  const p = new URLSearchParams({
    immeuble_id: `eq.${immeubleId}`, select: "*", order: "cree_le.desc", limit: "1",
  });
  const res = await fetch(`${SB_URL}/rest/v1/fi_espace_proprietaire?${p}`, {
    headers: entetes(), cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as Espace[])[0] ?? null;
}

/** Les pièces déposées, du dépôt le plus récent au plus ancien. */
export async function piecesDeposees(jeton: string): Promise<Piece[]> {
  if (!SB_KEY) return [];
  const p = new URLSearchParams({
    jeton: `eq.${jeton}`, supprime: "is.false",
    select: "id,categorie,nom,format,taille_ko,depose_le", order: "depose_le.desc",
  });
  const res = await fetch(`${SB_URL}/rest/v1/fi_piece_proprietaire?${p}`, {
    headers: entetes(), cache: "no-store",
  }).catch(() => null);
  return res?.ok ? ((await res.json()) as Piece[]) : [];
}

/** Le chemin d'une pièce dans le coffre — vérifié comme appartenant au jeton. */
export async function cheminDeLaPiece(jeton: string, pieceId: string): Promise<string | null> {
  if (!SB_KEY || !/^[0-9a-f-]{36}$/.test(pieceId)) return null;
  const p = new URLSearchParams({
    jeton: `eq.${jeton}`, id: `eq.${pieceId}`, supprime: "is.false", select: "chemin", limit: "1",
  });
  const res = await fetch(`${SB_URL}/rest/v1/fi_piece_proprietaire?${p}`, {
    headers: entetes(), cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { chemin: string }[])[0]?.chemin ?? null;
}

/* ---------- Création ---------- */

/**
 * Crée l'espace d'un immeuble et rend son jeton, sans rien invalider.
 *
 * Séparé de l'action `ouvrirEspace` parce que le rendu d'une page peut avoir
 * besoin de créer un espace — un client connecté qui ouvre son immeuble pour
 * la première fois — et que `revalidatePath` est interdit pendant un rendu.
 * L'action, elle, garde son invalidation : c'est un clic d'agent, pas un rendu.
 */
export async function creerEspace(input: {
  immeubleId: string; estimationId?: string; contactId?: string; agent?: string;
  /** Durée de vie du lien, en jours. */
  jours?: number;
}): Promise<string> {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const ecrire = (chemin: string, methode: "POST" | "PATCH", corps: unknown) =>
    fetch(`${SB_URL}/rest/v1/${chemin}`, {
      method: methode,
      headers: { ...entetes(), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(corps),
    });

  /* Un seul lien vivant par immeuble : rouvrir révoque le précédent, sinon un
     lien transféré à un tiers resterait valable pour toujours. */
  await ecrire(
    `fi_espace_proprietaire?immeuble_id=eq.${encodeURIComponent(input.immeubleId)}&revoque=is.false`,
    "PATCH", { revoque: true },
  ).catch(() => undefined);

  const jeton = randomBytes(32).toString("base64url");
  const res = await ecrire("fi_espace_proprietaire", "POST", [{
    jeton,
    immeuble_id: input.immeubleId,
    estimation_id: input.estimationId ?? null,
    contact_id: input.contactId ?? null,
    cree_par: input.agent ?? null,
    expire_le: new Date(Date.now() + (input.jours ?? 120) * 86400_000).toISOString(),
  }]);
  if (!res.ok) throw new Error(`Création de l'espace : ${res.status}`);
  return jeton;
}

/* ---------- La vue du propriétaire ---------- */

/**
 * Le cran atteint, déduit du statut de l'immeuble.
 *
 * Le BO compte onze crans, dont plusieurs ne veulent rien dire pour un
 * vendeur (« 3 - A transformer »). On les replie sur six jalons lisibles.
 */
function jalonAtteint(statut: string): number {
  const n = parseInt(statut, 10);
  if (!Number.isFinite(n)) return 0;
  if (n >= 10) return 5;      // acte programmé, vendu
  if (n >= 8) return 4;       // compromis programmé, sous compromis
  if (n === 7) return 3;      // sous offre
  if (n >= 5) return 2;       // commercialisé
  if (n >= 4) return 1;       // OK pour vendre
  return 0;                   // formulaire, estimation
}

const nb = (v: unknown) => (typeof v === "number" ? v : undefined);
const txt = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * La vue du propriétaire, construite champ par champ.
 *
 * C'est une liste blanche : on part de rien et on ajoute ce qui est autorisé.
 * Recopier `BienData` en retirant des champs reviendrait à parier qu'on n'en
 * oubliera aucun aujourd'hui, ni le jour où quelqu'un en ajoutera un.
 */
export async function vueProprietaire(immeubleId: string): Promise<VueProprietaire | null> {
  const b = await getBien(immeubleId).catch(() => null);
  if (!b) return null;
  const im = b.im;

  const hai = nb(im.prix_hai) ?? nb(im.prix_hai_estim);
  const nv = nb(im.prix_nv);
  const honos = nb(im.prix_honos_ttc);
  const taux = nv && honos && nv > 0 ? Math.round((honos / nv) * 1000) / 10 : 5;

  const mandat = b.mandats?.find((m) => txt(m.date_signature));

  /* La surface totale n'existe pas sur l'immeuble : elle se somme sur les lots,
     comme partout ailleurs dans l'application. */
  const surface = (b.lots ?? []).reduce((s, l) => s + (nb(l.surface_carrez) ?? 0), 0);

  return {
    adresse: [txt(im["adresse_numéro_rue"]), txt(im.adresse_rue)].filter(Boolean).join(" "),
    ville: [txt(im.adresse_zipcode), txt(im.adresse_ville)].filter(Boolean).join(" "),
    nbLots: (b.lots ?? []).length,
    surface: surface > 0 ? Math.round(surface) : undefined,
    estimationNv: nv,
    estimationHai: hai,
    tauxHonos: taux,
    jalon: jalonAtteint(txt(im.Statut)),
    mandatSigneLe: mandat ? txt(mandat.date_signature) : undefined,
    visitesEffectuees: (b.visites ?? []).filter((v) => txt(v.Statut) === "Effectuée").length,
    acquereursContactes: b.propositions?.total ?? 0,
    offreEnCours: (b.offres ?? []).some((o) =>
      ["En cours", "Contre offre", "Acceptée"].includes(txt(o.Statut))),
    agentNom: b.agentNom,
    agentTel: b.agentTel,
  };
}

/* ---------- L'aperçu, côté BO (#382 bis) ---------- */

/**
 * Ce que le propriétaire verrait sur son espace — construit pour l'agent.
 *
 * MAV : « je voulais juste voir un aperçu de ce que le client verra avant de
 * lui envoyer un lien. » L'espace client, lui, ne se laisse pas visiter : il
 * n'existe que derrière une session, résolue en base par `ec_mes_immeubles`
 * et `ec_mes_pieces` (§10 bis). On ne fabrique donc ni lien ni session — on
 * refait ici, avec la clé de service du BO, EXACTEMENT le calcul de ces deux
 * fonctions, champ par champ, à partir de l'identifiant du bien. Si l'une
 * d'elles change de règle, celle-ci doit changer avec — c'est le prix d'un
 * aperçu qui ne triche pas.
 *
 * Même liste blanche que l'espace réel : des compteurs, jamais un nom de
 * locataire ni d'acquéreur (garde-fou §8.3).
 */
export async function apercuVendeur(immeubleId: string): Promise<{
  bien: BienVendeur | null; pieces: PieceClient[]; secteur: SecteurImmeuble | null;
}> {
  const b = await getBien(immeubleId).catch(() => null);
  if (!b) return { bien: null, pieces: [], secteur: null };
  const im = b.im;
  const statut = txt(im.Statut);

  /* `ec_mes_immeubles` écarte les biens retirés : le propriétaire ne verrait
     rien. L'aperçu le dit plutôt que de montrer une page qui n'existe pas. */
  if (statut === "0 - RETIRé") return { bien: null, pieces: [], secteur: null };

  /* Le prix que le propriétaire a lui-même arrêté : le dernier espace NON
     révoqué, comme dans la fonction SQL — pas simplement le plus récent. */
  const espace = await (async () => {
    if (!SB_KEY) return null;
    const p = new URLSearchParams({
      immeuble_id: `eq.${immeubleId}`, revoque: "is.false",
      select: "prix_nv,prix_mot", order: "cree_le.desc", limit: "1",
    });
    const res = await fetch(`${SB_URL}/rest/v1/fi_espace_proprietaire?${p}`, {
      headers: entetes(), cache: "no-store",
    }).catch(() => null);
    return res?.ok ? ((await res.json()) as Pick<Espace, "prix_nv" | "prix_mot">[])[0] ?? null : null;
  })();

  const pieces = await (async () => {
    if (!SB_KEY) return [];
    const p = new URLSearchParams({
      immeuble_id: `eq.${immeubleId}`, supprime: "is.false",
      select: "id,categorie,nom,taille_ko,depose_le", order: "depose_le.desc",
    });
    const res = await fetch(`${SB_URL}/rest/v1/fi_piece_proprietaire?${p}`, {
      headers: entetes(), cache: "no-store",
    }).catch(() => null);
    return res?.ok ? ((await res.json()) as PieceClient[]) : [];
  })();

  const dates = (b.mandats ?? []).map((m) => txt(m.date_signature)).filter(Boolean).sort();
  const surface = nb(im.fin_surface_carrez);
  const secteur = await secteurVendeur(b).catch(() => null);

  return {
    secteur,
    bien: {
      id: immeubleId,
      adresse: [txt(im["adresse_numéro_rue"]), txt(im.adresse_rue)].filter(Boolean).join(" "),
      ville: [txt(im.adresse_zipcode), txt(im.adresse_ville)].filter(Boolean).join(" "),
      nbLots: nb(im.nb_lots_tot) ?? 0,
      surface: surface ?? null,
      statut,
      prixAffiche: nb(im.prix_hai) ?? null,
      prixNv: nb(im.prix_nv) ?? null,
      honos: nb(im.prix_honos_ttc) ?? null,
      prixDemande: espace?.prix_nv ?? null,
      motDemande: espace?.prix_mot ?? null,
      visites: (b.visites ?? []).filter((v) => txt(v.Statut) === "Effectuée").length,
      acquereurs: b.propositions?.total ?? 0,
      offreEnCours: (b.offres ?? []).some((o) =>
        ["En cours", "Contre offre", "Acceptée"].includes(txt(o.Statut))),
      mandatSigneLe: dates.length ? dates[dates.length - 1] : null,
    },
    pieces,
  };
}

/* ---------- Le secteur, pour l'aperçu (MAV, 25/09) ---------- */

/** Une lecture PostgREST du BO, ou rien. */
async function sbLire<T>(chemin: string): Promise<T[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, { headers: entetes(), cache: "no-store" })
    .catch(() => null);
  return res?.ok ? ((await res.json().catch(() => [])) as T[]) : [];
}

/** Le préfixe des colonnes du relevé de secteur, par destination — le même
 *  que `DEST_PREFIX` de lib/bo/marche.ts, et que la fonction SQL. */
const PREFIXE_DEST: Record<string, string> = {
  Logement: "hab", Commerce: "com", Bureau: "bur", Parking: "parking", Cave: "cave",
};

/** Un nombre Bubble : nombre JSON, ou chaîne « 12,5 » tolérée, sinon rien
 *  (miroir de `ec_num`). */
const ecNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\s*-?\d+([.,]\d+)?\s*$/.test(v)) return Number(v.trim().replace(",", "."));
  return undefined;
};

/**
 * Ce que `ec_secteur_immeuble` rend au propriétaire — refait pour l'agent.
 *
 * Même règle que l'aperçu : on ne fabrique pas de session, on refait ici
 * EXACTEMENT le calcul de la fonction SQL (lib/bo/sql/ec_secteur_immeuble.sql),
 * champ par champ, avec la clé de service. Si l'une change de règle, l'autre
 * doit changer avec. Même liste blanche, mêmes exclusions : rien de ce qui
 * sort d'ici ne porte une adresse, un identifiant ou un nom (§8.3, §8.4).
 */
export async function secteurVendeur(b: BienData): Promise<SecteurImmeuble> {
  const im = b.im;
  const immeubleId = String(im._id ?? "");
  const dest = txt(im.Destination_principale);
  const ville = txt(im.adresse_ville);
  const cp = txt(im.adresse_zipcode);
  const dep = depDuCp(cp) ?? (txt(im.adresse_dpt) || null);
  const annee = new Date().getFullYear();

  /* 2. Les lots : surface totale et surface louée, comme le contexte de
     rendement de l'écran Prix du BO. */
  const lots = b.lots ?? [];
  const surface = lots.reduce((s, l) => s + (ecNum(l.surface_carrez) ?? 0), 0);
  const surfaceOccupee = lots
    .filter((l) => (ecNum(l.loyer) ?? 0) > 0)
    .reduce((s, l) => s + (ecNum(l.surface_carrez) ?? 0), 0);
  const loyersAn = ecNum(im.fin_loyers_an) ?? 0;
  const loyersMaxAn = ecNum(im.fin_loyers_an_max) ?? loyersAn;

  /* 3. Le code INSEE : la carte des loyers, puis le référentiel des communes. */
  const insee = await (async () => {
    if (!dep || !ville) return null;
    const cible = normCommune(ville);
    const loyers = await sbLire<{ code_insee: string; libelle: string | null }>(
      `bo_loyers_commune?departement=eq.${encodeURIComponent(dep)}&select=code_insee,libelle&limit=2000`,
    );
    const l = loyers.find((c) => normCommune(c.libelle ?? "") === cible);
    if (l) return l.code_insee;
    const communes = await sbLire<{ insee: string; nom: string }>(
      `fi_pm_commune?dep=eq.${encodeURIComponent(dep)}&select=insee,nom&limit=2000`,
    );
    return communes.find((c) => normCommune(c.nom) === cible)?.insee ?? null;
  })();

  /* 4. Le secteur : le dernier relevé, et sa confirmation (règle #391 : le
     drapeau global, OU chaque destination présente confirmée une à une). */
  const sect = b.secteur;
  let secteur: SecteurImmeuble["secteur"] = null;
  if (sect) {
    let confirme = sect["0 - check_ok"] === true;
    if (!confirme) {
      const prefixes = [...new Set(
        lots.filter((l) => (ecNum(l.surface_carrez) ?? 0) > 0)
          .map((l) => PREFIXE_DEST[txt(l.Destination)] ?? "autre"),
      )];
      confirme = prefixes.length > 0 && prefixes.every((p) => sect[`${p}_check_ok`] === true);
    }
    if (confirme) {
      let loyer = ecNum(sect["0 - loyer_mois"]);
      let prix = ecNum(sect["0 - prix"]);
      let renta = ecNum(sect["0 - renta _%"]);
      if (loyer === undefined || prix === undefined) {
        const p = PREFIXE_DEST[dest] ?? "hab";
        loyer ??= ecNum(sect[`${p}_loyer_retenu`]);
        prix ??= ecNum(sect[`${p}_prix_retenu`]);
        renta ??= ecNum(sect[`${p}_renta_retenu`]);
      }
      if (renta === undefined && loyer && prix && loyer > 0 && prix > 0) {
        renta = Math.round((loyer * 12 * 100 * 10) / prix) / 10;
      }
      const dates = ["hab", "com", "bur", "parking", "cave", "autre"]
        .map((p) => txt(sect[`${p}_check_le`])).filter(Boolean).sort();
      const verifieLe = dates.length ? dates[dates.length - 1]
        : txt(sect["0 - date"]) || txt(sect["Modified Date"]) || null;
      if (loyer !== undefined && prix !== undefined) {
        secteur = {
          loyerM2: Math.round(loyer * 100) / 100,
          prixM2: Math.round(prix),
          renta: renta === undefined ? null : Math.round(renta * 10) / 10,
          verifieLe,
          annee: verifieLe && /^\d{4}/.test(verifieLe) ? Number(verifieLe.slice(0, 4)) : null,
          ville, insee,
          liens: liensSecteur(insee, dep),
        };
      }
    }
  }

  /* 5. Les comparables : même département, même destination principale,
     vendus par nous cette année ou l'an dernier, ou en commercialisation.
     On ne lit que les clés utiles (comme `sbq`), jamais le document entier. */
  type Ligne = {
    id: string; bubble_modified: string | null;
    c0: unknown; c1: unknown; c2: unknown; c3: unknown; c4: unknown;
    c5: unknown; c6: unknown; c7: unknown; c8: unknown; c9: unknown;
  };
  const cles = ["adresse_ville", "nb_lots_tot", "fin_surface_carrez", "surface_carrez", "Statut", "prix_hai",
    "fin_renta_ba", "Modified Date", "adresse_dpt", "adresse_zipcode"];
  const comparables: SecteurImmeuble["comparables"] = [];
  if (dest && dep) {
    const p = new URLSearchParams();
    p.set("select", `id,bubble_modified,${cles.map((k, i) => `c${i}:data->"${k}"`).join(",")}`);
    p.append("id", `neq.${immeubleId}`);
    p.append("or", "(data->>archived.is.null,data->>archived.eq.false)");
    p.append("data->>Destination_principale", `eq.${dest}`);
    p.append("data->>Statut", 'in.("5 - Commercialisé (A/B)","6 - Commercialisé (all)","11 - VENDU")');
    p.set("limit", "2000");
    /* Le département se lit sur le code postal, à défaut sur `adresse_dpt` —
       comme la fonction SQL. */
    const memeDep = (await sbLire<Ligne>(`bo_immeuble?${p}`)).filter((r) => {
      const d = depDuCp(typeof r.c9 === "string" ? r.c9 : "") ?? (typeof r.c8 === "string" ? r.c8 : null);
      return d === dep;
    });

    /* La date et le prix de vente : l'offre passée « Vendu » (acte, sinon
       compromis, sinon date de l'offre). Une lecture pour toutes. */
    type Offre = { a: unknown; b: unknown; c: unknown; d: unknown; e: unknown };
    const offres = await sbLire<Offre>(
      `bo_offre?${new URLSearchParams({
        select: 'a:data->"IMMEUBLEs",b:data->"date_acte",c:data->"date_compromis",d:data->"date",e:data->"prix_hai"',
        "data->>Statut": "eq.Vendu", limit: "5000",
      })}`,
    );
    const ventes = new Map<string, { quand: string | null; prix?: number }>();
    for (const o of offres) {
      const ids = Array.isArray(o.a) ? (o.a as unknown[]).map(String) : [];
      const quand = txt(o.b) || txt(o.c) || txt(o.d) || null;
      for (const id of ids) {
        const deja = ventes.get(id);
        if (!deja || (quand ?? "") > (deja.quand ?? "")) ventes.set(id, { quand, prix: ecNum(o.e) });
      }
    }

    type Cand = SecteurImmeuble["comparables"][number] & { tri: string };
    const cands: Cand[] = [];
    for (const r of memeDep) {
      const statut = String(r.c4 ?? "").startsWith("11 ") ? "vendu" : "a_vendre";
      const v = ventes.get(r.id);
      const surf = ecNum(r.c2) || ecNum(r.c3) || 0;
      const prix = (statut === "vendu" ? v?.prix : undefined) ?? ecNum(r.c5) ?? 0;
      const tri = v?.quand || txt(r.c7) || r.bubble_modified || "";
      const anneeTxt = statut === "vendu" ? tri.slice(0, 4) : "";
      const an = /^\d{4}$/.test(anneeTxt) ? Number(anneeTxt) : null;
      if (!(prix > 0) || !(surf > 0)) continue;
      if (statut === "vendu" && (an === null || (an !== annee && an !== annee - 1))) continue;
      const renta = ecNum(r.c6);
      cands.push({
        ville: txt(r.c0),
        nbLots: ecNum(r.c1) === undefined ? null : Math.round(ecNum(r.c1)!),
        surface: Math.round(surf),
        prixM2: Math.round(prix / surf),
        renta: renta === undefined ? null : Math.round(renta * 10) / 10,
        annee: an,
        statut,
        tri,
      });
    }
    /* Trois de chaque d'abord ; s'il manque d'un côté, l'autre complète
       jusqu'à six — l'ordre exact de la fonction SQL. */
    const rang = new Map<Cand, number>();
    for (const st of ["vendu", "a_vendre"] as const) {
      cands.filter((c) => c.statut === st).sort((x, y) => y.tri.localeCompare(x.tri))
        .forEach((c, i) => rang.set(c, i + 1));
    }
    cands.sort((x, y) =>
      Number((rang.get(x) ?? 9) > 3) - Number((rang.get(y) ?? 9) > 3)
      || Number(y.statut === "vendu") - Number(x.statut === "vendu")
      || y.tri.localeCompare(x.tri));
    for (const c of cands.slice(0, 6)) {
      const { tri: _tri, ...sans } = c;
      void _tri;
      comparables.push(sans);
    }
  }

  return {
    secteur,
    immeuble: {
      loyersAn: Math.round(loyersAn),
      loyersMaxAn: Math.round(loyersMaxAn),
      surface: Math.round(surface * 100) / 100,
      surfaceOccupee: Math.round(surfaceOccupee * 100) / 100,
      charges: Math.round(ecNum(im.fin_charges_non_recup) ?? 0),
      travaux: Math.round(ecNum(im.fin_travaux) ?? 0),
      prixHai: ecNum(im.prix_hai) === undefined ? null : Math.round(ecNum(im.prix_hai)!),
      destination: dest,
    },
    comparables,
  };
}
