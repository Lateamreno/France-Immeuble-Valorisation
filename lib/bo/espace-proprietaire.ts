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
import { getBien } from "@/lib/bubble/server";
import type { Espace, Piece, VueProprietaire } from "@/lib/bo/espace-modele";

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
