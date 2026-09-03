/**
 * L'espace client — ce que la personne connectée a le droit de voir.
 *
 * Un seul compte porte les deux casquettes, parce qu'une seule personne les
 * porte : le propriétaire qui nous confie un immeuble est très souvent celui
 * qui en cherche un autre. MAV : « il voit ses recherches et ses immeubles ».
 *
 * ## La règle de construction
 *
 * Toutes les fonctions d'ici partent du `contact_id` du compte connecté, jamais
 * d'un identifiant venu du navigateur. Et chacune bâtit un objet NEUF avec les
 * seuls champs autorisés — liste blanche, pas filtre. Recopier une ligne du BO
 * en retirant ce qui gêne, c'est parier qu'on n'oubliera rien aujourd'hui, ni
 * le jour où une colonne s'ajoutera. Ne franchissent donc jamais cette
 * frontière : les noms de locataires (§8.3), les noms d'acquéreurs, les
 * montants d'offres, les commentaires internes, les notes A/B/C/D, les
 * honoraires détaillés, les remarques d'agent.
 */

import "server-only";
import { fetchAll, getBien } from "@/lib/bubble/server";
import { rest } from "@/lib/bo/compte-client";
import { JALONS, type VueProprietaire } from "@/lib/bo/espace-modele";

const txt = (v: unknown) => (typeof v === "string" ? v : "");
const nb = (v: unknown) => (typeof v === "number" ? v : undefined);

/* ---------- Ses immeubles (côté vendeur) ---------- */

export type BienVendeur = {
  id: string;
  adresse: string;
  ville: string;
  nbLots: number;
  /** Le cran atteint, index dans JALONS. */
  jalon: number;
  jalonLabel: string;
  prixAffiche?: number;
  photo?: string;
  /** Le propriétaire a-t-il déjà dit le prix qu'il veut ? */
  prixDemande?: number;
};

/** Le cran de vente, dit comme un vendeur le comprend (11 statuts → 6 jalons). */
export function jalonDuStatut(statut: string): number {
  const n = parseInt(statut, 10);
  if (!Number.isFinite(n)) return 0;
  if (n >= 10) return 5;
  if (n >= 8) return 4;
  if (n === 7) return 3;
  if (n >= 5) return 2;
  if (n >= 4) return 1;
  return 0;
}

export async function mesImmeubles(contactId: string): Promise<BienVendeur[]> {
  const rows = await fetchAll(
    "immeuble", [{ key: "PROPRIETAIRE", constraint_type: "equals", value: contactId }], 100,
  ).catch(() => [] as Record<string, unknown>[]);

  /* Le prix que le propriétaire a lui-même arrêté, s'il l'a fait depuis un
     espace ouvert sur ce bien : il le retrouve, il n'a pas à s'en souvenir. */
  const prix = await rest<{ immeuble_id: string; prix_nv: number | null }>(
    `fi_espace_proprietaire?immeuble_id=in.(${rows.map((r) => `"${String(r._id)}"`).join(",") || '""'})` +
    `&select=immeuble_id,prix_nv&order=cree_le.desc`,
  ).catch(() => []);
  const parBien = new Map(prix.filter((p) => p.prix_nv != null).map((p) => [p.immeuble_id, p.prix_nv!]));

  return rows
    .filter((r) => txt(r.Statut) !== "0 - RETIRé")
    .map((r) => {
      const jalon = jalonDuStatut(txt(r.Statut));
      return {
        id: String(r._id),
        adresse: [txt(r["adresse_numéro_rue"]), txt(r.adresse_rue)].filter(Boolean).join(" "),
        ville: [txt(r.adresse_zipcode), txt(r.adresse_ville)].filter(Boolean).join(" "),
        nbLots: nb(r.nb_lots_tot) ?? 0,
        jalon,
        jalonLabel: JALONS[jalon]?.label ?? "",
        prixAffiche: nb(r.prix_hai) ?? nb(r.prix_hai_estim),
        photo: txt(r.photo_url) || undefined,
        prixDemande: parBien.get(String(r._id)),
      };
    });
}

/* ---------- Ses recherches (côté acquéreur) ---------- */

export type RechercheClient = {
  id: string;
  lieux: string;
  destinations: string[];
  surface?: string;
  prix?: string;
  renta?: string;
  commentaire?: string;
  enPause: boolean;
};

const fourchette = (min: unknown, max: unknown, unite: string) => {
  const a = nb(min), b = nb(max);
  if (a === undefined && b === undefined) return undefined;
  const f = (v: number) => v.toLocaleString("fr-FR");
  if (a !== undefined && b !== undefined) return `de ${f(a)} à ${f(b)} ${unite}`;
  return a !== undefined ? `à partir de ${f(a)} ${unite}` : `jusqu'à ${f(b!)} ${unite}`;
};

export async function mesRecherches(contactId: string): Promise<RechercheClient[]> {
  const rows = await fetchAll(
    "recherche", [{ key: "ACHETEUR", constraint_type: "equals", value: contactId }], 100,
    { field: "Modified Date", desc: true },
  ).catch(() => [] as Record<string, unknown>[]);

  return rows
    .filter((r) => r.archived !== true)
    .map((r) => {
      const villes = Array.isArray(r.villes) ? (r.villes as string[]) : [];
      const dpts = Array.isArray(r.dpts) ? (r.dpts as string[]) : [];
      return {
        id: String(r._id),
        lieux: villes.length ? villes.join(", ")
          : dpts.length ? dpts.join(", ")
          : "France entière",
        destinations: Array.isArray(r.Destinations) ? (r.Destinations as string[]) : [],
        surface: fourchette(r.surface_min, r.surface_max, "m²"),
        prix: fourchette(r.prix_min, r.prix_max, "€"),
        renta: nb(r.renta) ? `${nb(r.renta)!.toLocaleString("fr-FR")} % minimum` : undefined,
        commentaire: txt(r.commentaire) || undefined,
        enPause: r.standby === true,
      };
    });
}

/* ---------- Ce qu'on lui a proposé ---------- */

export type PropositionClient = {
  id: string;
  immeubleId: string;
  adresse: string;
  ville: string;
  le?: string;
  prixAffiche?: number;
  surface?: number;
  nbLots: number;
  rendement?: number;
  photo?: string;
  /** Sa réponse, s'il en a donné une. */
  reponse?: "interesse" | "visite" | "pas_interesse";
  reponseLe?: string;
  /** Un dossier de vente est-il disponible au téléchargement ? */
  dossier: boolean;
};

export type ReponseLigne = {
  proposition_id: string; reponse: PropositionClient["reponse"]; le: string;
};

export async function mesPropositions(
  contactId: string, compteId: string,
): Promise<PropositionClient[]> {
  const rows = await fetchAll(
    "proposition", [{ key: "ACHETEUR", constraint_type: "equals", value: contactId }], 200,
    { field: "date_envoi", desc: true },
  ).catch(() => [] as Record<string, unknown>[]);
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((p) => txt(p.IMMEUBLE)).filter(Boolean))];
  const [immeubles, docs, reponses] = await Promise.all([
    fetchAll("immeuble", [{ key: "_id", constraint_type: "in", value: ids }], 200)
      .catch(() => [] as Record<string, unknown>[]),
    fetchAll("app_document", [{ key: "IMMEUBLE", constraint_type: "in", value: ids }], 500)
      .catch(() => [] as Record<string, unknown>[]),
    rest<ReponseLigne>(
      `fi_reponse_proposition?compte_id=eq.${compteId}&select=proposition_id,reponse,le`,
    ).catch(() => []),
  ]);

  const parId = new Map(immeubles.map((i) => [String(i._id), i]));
  const aDossier = new Set(docs.filter((d) => txt(d.DOSSIER)).map((d) => txt(d.IMMEUBLE)));
  const parProp = new Map(reponses.map((r) => [r.proposition_id, r]));

  return rows.flatMap((p) => {
    const im = parId.get(txt(p.IMMEUBLE));
    if (!im) return [];
    const hai = nb(im.prix_hai);
    const loyers = nb(im.fin_loyers_an);
    const r = parProp.get(String(p._id));
    return [{
      id: String(p._id),
      immeubleId: String(im._id),
      adresse: [txt(im["adresse_numéro_rue"]), txt(im.adresse_rue)].filter(Boolean).join(" "),
      ville: [txt(im.adresse_zipcode), txt(im.adresse_ville)].filter(Boolean).join(" "),
      le: txt(p.date_envoi) || txt(p["Created Date"]) || undefined,
      prixAffiche: hai,
      surface: nb(im.fin_surface_carrez),
      nbLots: nb(im.nb_lots_tot) ?? 0,
      rendement: hai && loyers && hai > 0 ? Math.round((loyers / hai) * 1000) / 10 : undefined,
      photo: txt(im.photo_url) || undefined,
      reponse: r?.reponse,
      reponseLe: r?.le,
      dossier: aDossier.has(String(im._id)),
    }];
  });
}

/**
 * Le détail d'un bien proposé — vérifié comme lui ayant été proposé.
 *
 * On repart de la proposition, pas de l'identifiant d'immeuble : un acquéreur
 * ne doit pas pouvoir consulter un dossier en devinant une adresse d'URL.
 */
export async function bienPropose(
  propositionId: string, contactId: string,
): Promise<{ immeubleId: string; vue: VueProprietaire; photos: string[]; cheminDossier?: string } | null> {
  const props = await fetchAll(
    "proposition", [
      { key: "_id", constraint_type: "equals", value: propositionId },
      { key: "ACHETEUR", constraint_type: "equals", value: contactId },
    ], 1,
  ).catch(() => [] as Record<string, unknown>[]);
  const p = props[0];
  if (!p) return null;

  const immeubleId = txt(p.IMMEUBLE);
  const b = await getBien(immeubleId).catch(() => null);
  if (!b) return null;
  const im = b.im;

  const hai = nb(im.prix_hai) ?? nb(im.prix_hai_estim);
  const surface = (b.lots ?? []).reduce((s, l) => s + (nb(l.surface_carrez) ?? 0), 0);

  const doc = (b.documents ?? []).find((d) => txt(d.DOSSIER) && txt(d.path));

  return {
    immeubleId,
    /* On réemploie la vue du vendeur : elle est déjà en liste blanche, et un
       acquéreur n'a pas à en voir davantage. Le prix affiché est le HAI —
       c'est celui qu'il paiera. */
    vue: {
      adresse: [txt(im["adresse_numéro_rue"]), txt(im.adresse_rue)].filter(Boolean).join(" "),
      ville: [txt(im.adresse_zipcode), txt(im.adresse_ville)].filter(Boolean).join(" "),
      nbLots: (b.lots ?? []).length,
      surface: surface > 0 ? Math.round(surface) : undefined,
      estimationNv: undefined,
      estimationHai: hai,
      tauxHonos: 0,
      jalon: jalonDuStatut(txt(im.Statut)),
      visitesEffectuees: 0,
      acquereursContactes: 0,
      offreEnCours: false,
      agentNom: b.agentNom,
      agentTel: b.agentTel,
    },
    photos: (b.photos ?? [])
      .filter((ph) => ph.dossier || ph.annonce)
      .slice(0, 12)
      .map((ph) => ph.url ?? "")
      .filter(Boolean),
    cheminDossier: doc ? txt(doc.path) : undefined,
  };
}
