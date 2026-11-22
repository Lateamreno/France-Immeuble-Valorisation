/**
 * Scinder un immeuble en lots à vendre (CLAUDE.md §7.11, étape 2 — MAV, 20/11 :
 * « un bouton sur chaque lot de l'état locatif pour me demander si je veux
 * déclencher le lot à part, et un bouton pour tout déclencher »).
 *
 * Le principe : **une fiche = une chose à vendre.** Un lot mis en vente devient
 * une fiche comme les autres (`bo_immeuble`), rattachée à son immeuble par
 * `lot_de`. Elle reçoit sa propre ligne d'état locatif (copie du lot, de son
 * bail, de son locataire) : propositions, visites, offres, dossier et suivi de
 * la vente marchent alors sans rien changer.
 *
 * Ce fichier est pur : quelles unités se vendent, comment on les nomme, ce que
 * porte la fiche créée. `scission-actions.ts` écrit.
 */

type Doc = Record<string, unknown>;

const S = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Les destinations qui ne se vendent pas seules d'ordinaire, mais le peuvent. */
const ANNEXES = new Set(["cave", "parking", "annexe"]);
export const estAnnexe = (lot: Doc) => ANNEXES.has(S(lot.Destination).toLowerCase());

/** Une chose à vendre : un lot, et les caves ou parkings qui se vendent avec lui. */
export type Unite = {
  /** L'identifiant du lot principal : c'est lui qui désigne l'unité. */
  id: string;
  principal: Doc;
  annexes: Doc[];
  /** Tous les lots de l'unité, le principal d'abord. */
  lotIds: string[];
  libelle: string;
  /** Somme des prix retenus (honoraires inclus), si tous les lots en ont un… */
  prixHai?: number;
  /** …sinon ceux qui manquent, pour le dire. */
  sansPrix: string[];
  surface?: number;
  /** Loyer mensuel de l'unité. */
  loyer?: number;
  loue: boolean;
};

const etage = (v: unknown): string => {
  const s = S(v);
  if (!s) return "";
  if (/^(0|rdc|rez)/i.test(s)) return "rez-de-chaussée";
  if (/^-?\d+$/.test(s)) {
    const n = Number(s);
    return n < 0 ? `sous-sol ${-n}` : n === 1 ? "1er étage" : `${n}e étage`;
  }
  return s;
};

const m2 = (n?: number) => (n ? `${String(Math.round(n * 10) / 10).replace(".", ",")} m²` : "");

/** « Lot 3 — T2, 2e étage, 34 m² » : de quoi reconnaître un lot parmi dix à la même adresse. */
export function libelleLot(lot: Doc): string {
  const tete = S(lot.numero) ? `Lot ${S(lot.numero)}` : "Lot";
  const nature = S(lot.Type_lot) || S(lot.Destination);
  const surface = N(lot.surface_carrez) || N(lot.surface_sol);
  const suite = [nature, etage(lot.etage), m2(surface)].filter(Boolean).join(", ");
  return suite ? `${tete} — ${suite}` : tete;
}

const nomAnnexe = (lot: Doc) => {
  const d = S(lot.Destination).toLowerCase();
  return `${d === "parking" ? "parking" : d === "cave" ? "cave" : "annexe"}${S(lot.numero) ? ` ${S(lot.numero)}` : ""}`;
};

/**
 * Les unités de vente d'un état locatif. Une cave ou un parking rattaché à un
 * lot (`vente_avec`) se vend avec lui ; non rattaché, il se vend seul (« seul
 * par défaut », MAV 15/11). Un rattachement vers un lot disparu est ignoré.
 */
export function unitesDeVente(lots: Doc[]): Unite[] {
  const parId = new Map(lots.map((l) => [S(l._id), l]));
  const rattache = (l: Doc) => {
    const cible = S(l.vente_avec);
    return cible && cible !== S(l._id) && parId.has(cible) && !S(parId.get(cible)!.vente_avec) ? cible : "";
  };
  return lots.filter((l) => !rattache(l)).map((principal) => {
    const id = S(principal._id);
    const annexes = lots.filter((l) => rattache(l) === id);
    const tous = [principal, ...annexes];
    const sansPrix = tous.filter((l) => !(N(l.prix_retenu) && N(l.prix_retenu)! > 0)).map((l) => (l === principal ? libelleLot(l) : nomAnnexe(l)));
    const loyer = tous.reduce((t, l) => t + (N(l.loyer) ?? 0), 0);
    return {
      id,
      principal,
      annexes,
      lotIds: tous.map((l) => S(l._id)),
      libelle: annexes.length ? `${libelleLot(principal)} + ${annexes.map(nomAnnexe).join(", ")}` : libelleLot(principal),
      prixHai: sansPrix.length ? undefined : tous.reduce((t, l) => t + (N(l.prix_retenu) ?? 0), 0),
      sansPrix,
      surface: N(principal.surface_carrez) || N(principal.surface_sol),
      loyer: loyer > 0 ? loyer : undefined,
      loue: tous.some((l) => (N(l.loyer) ?? 0) > 0),
    };
  });
}

/** Une fiche de lot déjà créée, telle que la fiche de l'immeuble la connaît. */
export type FicheLot = { id: string; libelle: string; statut: string; prixHai?: number; lotsOrigine: string[]; archivee?: boolean };

export function ficheLotDe(im: Doc): FicheLot {
  return {
    id: S(im._id),
    libelle: S(im.lot_libelle) || "Lot",
    statut: S(im.Statut),
    prixHai: N(im.prix_hai),
    lotsOrigine: Array.isArray(im.lots_origine) ? (im.lots_origine as unknown[]).map(S).filter(Boolean) : [],
    archivee: im.archived === true,
  };
}

/** La fiche qui vend déjà cette unité, s'il y en a une (par son lot principal). */
export function ficheDeLUnite(u: Unite, fiches: FicheLot[]): FicheLot | undefined {
  return fiches.find((f) => !f.archivee && f.lotsOrigine.includes(u.id));
}

/** Rang d'un statut : « 6 - Commercialisé (all) » → 6. */
export const rangStatut = (statut: unknown): number => {
  const n = Number(/^\s*(\d+)/.exec(S(statut))?.[1]);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Le statut d'une fiche de lot à sa création : celui de l'immeuble tant qu'il
 * n'est pas en vente, « 4 - OK pour vendre » au-delà. Un lot n'est jamais
 * commercialisé d'office — c'est l'agent qui le lance, lot par lot.
 */
export function statutInitial(statutImmeuble: unknown): string {
  const r = rangStatut(statutImmeuble);
  return r >= 1 && r < 4 ? S(statutImmeuble) : "4 - OK pour vendre";
}

/** Net vendeur et honoraires d'un prix honoraires inclus, au taux du mandat de l'immeuble. */
export function ventiler(hai: number, tauxHonos: number): { nv: number; honos: number } {
  const nv = Math.round(hai / (1 + tauxHonos / 100));
  return { nv, honos: hai - nv };
}

/** Ce que la fiche du lot reprend de l'immeuble : où il est, à qui il est, qui le suit. */
const REPRIS = /^(adresse$|adresse_|emp_|PROPRIETAIRE$|source$|year_constru$|Etat$|AGENT$|photo_main_|photo_maps$)/;

/**
 * Le document de la fiche créée pour une unité. Le terrain et le PLU ne sont
 * pas repris (un bien en copropriété n'en renseigne pas), ni le descriptif ni
 * les prix de l'immeuble : ils parlent du bloc.
 */
export function docFicheLot(immeuble: Doc, u: Unite, tauxHonos: number, maintenant: string): Doc {
  const doc: Doc = {};
  for (const [k, v] of Object.entries(immeuble)) {
    if (REPRIS.test(k) && v !== null && v !== undefined && v !== "") doc[k] = v;
  }
  Object.assign(doc, {
    Statut: statutInitial(immeuble.Statut),
    archived: false,
    standby_Statut: "Traité",
    en_copropriete: true,
    lot_de: S(immeuble._id),
    lots_origine: u.lotIds,
    lot_libelle: u.libelle,
    "Created Date": maintenant,
    "Modified Date": maintenant,
  });
  if (u.prixHai) {
    const { nv, honos } = ventiler(u.prixHai, tauxHonos);
    Object.assign(doc, { prix_hai: u.prixHai, prix_nv: nv, prix_honos_ttc: honos });
  }
  return doc;
}

/** Les champs d'une copie qui ne se recopient pas tels quels. */
const HORS_COPIE = new Set(["_id", "Created Date", "Modified Date", "app_created", "app_modified", "Created By", "Modified By"]);

/**
 * Copie d'un document lié (lot, bail, locataire) pour la fiche du lot : même
 * contenu, rattaché à la nouvelle fiche, et les renvois vers d'autres lots ou
 * locataires traduits dans leurs copies. `origine` garde le lien vers la ligne
 * de l'immeuble.
 */
export function copiePour(
  doc: Doc, ficheId: string, maintenant: string,
  /** Anciens identifiants → nouveaux, pour les lots et les locataires copiés. */
  correspondance: Map<string, string>,
): Doc {
  const traduire = (v: unknown) => (Array.isArray(v)
    ? (v as unknown[]).map(S).map((id) => correspondance.get(id)).filter((id): id is string => !!id)
    : undefined);
  const copie: Doc = {};
  /* `site_*` : ce que le site France Immeuble sait de la ligne d'origine — la
     copie n'y a jamais été déposée. */
  for (const [k, v] of Object.entries(doc)) if (!HORS_COPIE.has(k) && !k.startsWith("site_")) copie[k] = v;
  copie.IMMEUBLE = ficheId;
  copie.origine = S(doc._id);
  copie["Created Date"] = maintenant;
  copie["Modified Date"] = maintenant;
  for (const k of ["LOTs", "LOCATAIREs", "BAUXs", "BAILs"]) {
    if (Array.isArray(doc[k])) copie[k] = traduire(doc[k]);
  }
  for (const k of ["vente_avec", "lot_rattache"]) {
    if (k in copie) copie[k] = correspondance.get(S(doc[k])) ?? null;
  }
  return copie;
}

/** Les baux et locataires d'un immeuble qui concernent ces lots. */
export const concerne = (doc: Doc, lotIds: string[]) =>
  Array.isArray(doc.LOTs) && (doc.LOTs as unknown[]).some((id) => lotIds.includes(S(id)));

/** Le règlement de copropriété est-il au coffre ? (rappel avant de scinder) */
export function reglementAuCoffre(documents: Doc[]): boolean {
  return documents.some((d) => /r[èe]glement\s+de\s+copro|état\s+descriptif\s+de\s+division|\bEDD\b/i
    .test([d.name, d.file_name].map(S).join(" ")));
}

/**
 * Ce qu'il faut savoir avant de scinder une unité. Rien ne bloque — « l'agent
 * scinde quand il veut » (MAV, 20/11) — hormis un lot qui a déjà sa fiche.
 */
export function aSavoirAvant(u: Unite): string[] {
  return u.sansPrix.length ? [`Sans prix retenu : ${u.sansPrix.join(", ")} — la fiche sera créée sans prix.`] : [];
}

/**
 * Tableau de bord : dans une colonne, les lots d'un même immeuble se suivent,
 * juste sous leur immeuble quand il est dans la colonne, sinon à la place du
 * premier d'entre eux (MAV, 20/11 : « plusieurs lots sur la même adresse »).
 * L'ordre des autres cartes ne bouge pas.
 */
export function regrouperLots<T extends { id: string; lotDe?: string; lot?: string }>(cartes: T[]): T[] {
  if (!cartes.some((c) => c.lotDe)) return cartes;
  const presents = new Set(cartes.map((c) => c.id));
  const lotsDe = new Map<string, T[]>();
  for (const c of cartes) if (c.lotDe) lotsDe.set(c.lotDe, [...(lotsDe.get(c.lotDe) ?? []), c]);
  /* Entre eux, dans l'ordre des numéros : « Lot 2 » avant « Lot 10 ». */
  for (const groupe of lotsDe.values()) {
    groupe.sort((a, b) => (a.lot ?? "").localeCompare(b.lot ?? "", "fr", { numeric: true }));
  }
  const out: T[] = [];
  const poses = new Set<string>();
  for (const c of cartes) {
    if (c.lotDe) {
      /* Un lot dont l'immeuble est dans la colonne sera posé sous lui. */
      if (presents.has(c.lotDe) || poses.has(c.lotDe)) continue;
      poses.add(c.lotDe);
      out.push(...(lotsDe.get(c.lotDe) ?? []));
    } else {
      out.push(c, ...(lotsDe.get(c.id) ?? []));
    }
  }
  return out;
}
