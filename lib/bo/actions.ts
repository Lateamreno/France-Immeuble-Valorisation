"use server";

// Écritures du BO — uniquement vers Supabase (bo_*), jamais vers Bubble.
// Passent par les RPC bo_insert_doc / bo_patch_doc (service_role).
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { after } from "next/server";
import { filtreMots, getAgentFiche, getEstimation, motsRecherche } from "@/lib/bubble/server";
import { lireEstimation, type EstimationLecture } from "@/lib/bo/estimation-lecture";

const SB_URL =
  process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STATUTS: Record<number, string> = {
  0: "0 - RETIRé",
  1: "1 - FORMULAIRE",
  2: "2 - Estimation",
  3: "3 - A transformer",
  4: "4 - OK pour vendre",
  5: "5 - Commercialisé (A/B)",
  6: "6 - Commercialisé (all)",
  7: "7 - Sous offre",
  8: "8 - Compromis programmé",
  9: "9 - Sous compromis",
  10: "10 - Acte programmé",
  11: "11 - VENDU",
};

async function rpc(fn: string, args: Record<string, unknown>) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);

  /* La lecture met chaque page du miroir en cache sous l'étiquette de sa table
     (voir `lirePage` dans lib/bubble/server.ts). Toute écriture doit donc
     décrocher l'étiquette correspondante, sinon l'agent enregistre et ne voit
     rien changer. Ce point de passage est unique : toutes les écritures du BO
     y arrivent, c'est ce qui rend l'invalidation fiable. */
  const table = typeof args.p_table === "string" ? args.p_table : "";
  if (!table) return;
  // Les deux, et volontairement. `revalidateTag` est celui qui purge à coup sûr
  // les entrées posées par `unstable_cache` ; `updateTag`, taillé pour la
  // nouvelle API de cache, ajoute le « je relis ce que je viens d'écrire »
  // quand on est dans une action serveur. Se fier au seul `updateTag` serait
  // parier sur une équivalence que rien ne garantit — et une invalidation qui
  // rate ne se voit pas : l'agent enregistre, l'écran ne bouge pas, et il
  // recommence.
  revalidateTag(table, { expire: 0 });
  try {
    updateTag(table);
  } catch {
    /* Hors action serveur (réconciliation différée) : la purge ci-dessus suffit. */
  }
}

/** Relit une ligne du miroir par son id (les écritures ont besoin de se
 *  relire : joindre le bon PDF, retrouver un chemin de fichier…). */
async function bqOne(table: string, id: string): Promise<Record<string, unknown> | null> {
  if (!SB_KEY || !id) return null;
  const res = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=data&limit=1`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as { data: Record<string, unknown> }[];
  return rows[0]?.data ?? null;
}

/** Relit plusieurs lignes du miroir par leurs ids (ordre non garanti). */
async function bqIn(table: string, ids: string[]): Promise<Record<string, unknown>[]> {
  const liste = ids.filter(Boolean);
  if (!SB_KEY || liste.length === 0) return [];
  const filtre = `(${liste.map((i) => `"${i.replace(/"/g, "")}"`).join(",")})`;
  const res = await fetch(
    `${SB_URL}/rest/v1/${table}?id=in.${encodeURIComponent(filtre)}&select=data&limit=200`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as { data: Record<string, unknown> }[];
  return rows.map((r) => r.data).filter(Boolean);
}

const newId = () =>
  `app_${Date.now()}x${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;

/**
 * Le point de passage de TOUTES les écritures du BO.
 *
 * C'est ce qui rend la diffusion Plein Bail tenable : un lot modifié, une
 * photo déposée, un prix corrigé, une charge saisie, un mandat signé —
 * tout finit ici. On y marque donc la fiche « à resynchroniser », et la
 * republication part APRÈS la réponse (`after`), jamais pendant : enregistrer
 * une ligne de l'état locatif ne doit pas attendre le réseau.
 */
function refresh(immeubleId?: string) {
  revalidatePath("/", "layout");
  if (immeubleId) revalidatePath(`/bien/${immeubleId}`);
  if (!immeubleId) return;
  try {
    after(async () => {
      const { marquerAResynchroniser, synchroniserAnnonce } = await import("./diffusion");
      await marquerAResynchroniser(immeubleId);
      await synchroniserAnnonce(immeubleId).catch(() => undefined);
    });
  } catch {
    /* Hors contexte de requête : la diffusion se rattrapera au tour suivant. */
  }
}

/** Ajoute un suivi (réplique de la modale du BO), option mise en attente. */
export async function addSuivi(input: {
  immeubleId: string;
  agentId: string;
  contactId?: string;
  /** Plusieurs canaux possibles (retour MAV : on peut tout sélectionner). */
  canaux: string[];
  notes: string;
  standby?: { motif: string; dateRelance: string }; // dateRelance: yyyy-mm-dd
}) {
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_suivi",
    p_id: id,
    p_doc: {
      Type: "Manuel",
      AGENT: input.agentId,
      CONTACT: input.contactId ?? null,
      IMMEUBLEs: [input.immeubleId],
      Canals: input.canaux,
      notes: input.notes,
      date_start: now,
      "Created Date": now,
      "Modified Date": now,
      Statut: input.standby ? "En attente" : "Traité",
      ...(input.standby
        ? {
            Motif_standby: input.standby.motif,
            date_relance: new Date(input.standby.dateRelance).toISOString(),
          }
        : {}),
    },
  });
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: input.immeubleId,
    p_patch: input.standby
      ? { standby_Statut: "En attente" }
      : { standby_Statut: "Traité" },
  });
  refresh(input.immeubleId);
}

/* ---------- Actions du menu « … » des cartes (retour MAV #3) ---------- */

/** Archive un immeuble avec le motif du référentiel. */
export async function archiverImmeuble(immeubleId: string, motif: string) {
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: { archived: true, Motif_archivage: motif, date_archivage: new Date().toISOString() },
  });
  refresh(immeubleId);
}

/** Transfère le suivi du dossier à un autre agent. */
export async function transfererImmeuble(
  immeubleId: string,
  agentId: string,
  /** Le propriétaire suit l'immeuble : c'est ce qui fait foi en cas de
   *  contestation d'appartenance du client (retour MAV #29). */
  proprietaireId?: string | null,
) {
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: { AGENT: agentId } });
  if (proprietaireId) {
    await rpc("bo_patch_doc", { p_table: "bo_contact", p_id: proprietaireId, p_patch: { SUIVI: agentId } });
  }
  refresh(immeubleId);
}

/** Renvoie le dossier à l'étape précédente du pipeline. */
export async function reculerStatut(immeubleId: string, statutActuel: number) {
  const cible = Math.max(1, statutActuel - 1);
  await setStatut(immeubleId, cible);
}

/** Renseigne l'apporteur d'affaire, choisi ou créé en base (retours #7 et #31). */
export async function setApporteur(immeubleId: string, nom: string | null, contactId?: string) {
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: nom
      ? { apporteur_yn: true, apporteur_nom: nom, APPORTEUR: contactId ?? null }
      : { apporteur_yn: false, apporteur_nom: null, APPORTEUR: null },
  });
  refresh(immeubleId);
}

/** Réactive un dossier en attente / à relancer. */
export async function reactiver(immeubleId: string) {
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: { standby_Statut: "Traité" },
  });
  refresh(immeubleId);
}

/** Fait avancer (ou reculer) le statut pipeline. */
export async function setStatut(immeubleId: string, statutNum: number) {
  const label = STATUTS[statutNum];
  if (!label) throw new Error(`Statut inconnu: ${statutNum}`);
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: { Statut: label },
  });
  refresh(immeubleId);
}

/* ---------- Lots (État locatif) ---------- */

export type LotPatch = Partial<{
  batiment: string;
  etage: string | number;
  numero: number;
  Destination: string;
  Type_lot: string;
  surface_carrez: number;
  surface_sol: number;
  Type_bail: string;
  loyer: number;
  loyer_max: number;
  Etat: string;
  Type_dpe: string;
  renov_year: number;
  commentaire: string;
  /** Rang d'affichage du tableau des lots (#82). */
  ordre: number;
}>;

const cleanPatch = (p: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== ""));

/** Crée un lot pour un immeuble (numéro fourni par l'appelant). */
export async function addLot(immeubleId: string, lot: LotPatch) {
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_lot",
    p_id: id,
    p_doc: { IMMEUBLE: immeubleId, "Created Date": now, "Modified Date": now, ...cleanPatch(lot) },
  });
  await rpc("bo_recompute_immeuble", { p_id: immeubleId });
  refresh(immeubleId);
  return id;
}

/** Met à jour un lot de lots modifiés (patch par lot). */
export async function updateLots(immeubleId: string, patches: { id: string; patch: LotPatch }[]) {
  for (const { id, patch } of patches) {
    const clean = cleanPatch(patch);
    if (Object.keys(clean).length === 0) continue;
    await rpc("bo_patch_doc", { p_table: "bo_lot", p_id: id, p_patch: clean });
  }
  await rpc("bo_recompute_immeuble", { p_id: immeubleId });
  refresh(immeubleId);
}

/** Duplique un lot existant (copie des champs, nouveau numéro). */
export async function duplicateLot(immeubleId: string, sourceLot: Record<string, unknown>, numero: number) {
  const id = newId();
  const now = new Date().toISOString();
  const copy = { ...sourceLot };
  delete copy._id;
  delete copy["Created Date"];
  delete copy["Modified Date"];
  delete copy.app_created;
  delete copy.app_modified;
  await rpc("bo_insert_doc", {
    p_table: "bo_lot",
    p_id: id,
    p_doc: { ...copy, IMMEUBLE: immeubleId, numero, "Created Date": now, "Modified Date": now },
  });
  await rpc("bo_recompute_immeuble", { p_id: immeubleId });
  refresh(immeubleId);
}

/** Supprime un lot (copié dans bo_trash, récupérable). */
export async function deleteLot(immeubleId: string, lotId: string) {
  await rpc("bo_delete_doc", { p_table: "bo_lot", p_id: lotId });
  await rpc("bo_recompute_immeuble", { p_id: immeubleId });
  refresh(immeubleId);
}

/* ---------- Baux / Locataires / Charges (État locatif) ---------- */

/** Crée un bail (réplique de la modale « Nouveau bail »). */
export async function addBail(
  immeubleId: string,
  input: {
    lotIds: string[];
    locataireIds: string[];
    Type_bail?: string;
    bailleur_pm: boolean;
    loyer_init?: number;
    date_start?: string; // yyyy-mm-dd
    date_end?: string;
    indice_init?: number;
    indice_actuel?: number;
    statut: "en_cours" | "impayes" | "preavis" | "expulsion";
    commentaire?: string;
  },
) {
  const id = newId();
  const now = new Date().toISOString();
  const loyer_revised =
    input.loyer_init && input.indice_init && input.indice_actuel && input.indice_init > 0
      ? Math.round((input.loyer_init * input.indice_actuel) / input.indice_init)
      : undefined;
  await rpc("bo_insert_doc", {
    p_table: "bo_bail",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      LOTs: input.lotIds,
      LOCATAIREs: input.locataireIds,
      Type_bail: input.Type_bail,
      bailleur_pm: input.bailleur_pm,
      loyer_init: input.loyer_init,
      indice_init: input.indice_init,
      indice_actuel: input.indice_actuel,
      loyer_revised,
      date_start: input.date_start ? new Date(input.date_start).toISOString() : undefined,
      date_end: input.date_end ? new Date(input.date_end).toISOString() : undefined,
      activ: true,
      impayes: input.statut === "impayes",
      preavis: input.statut === "preavis",
      expulsion: input.statut === "expulsion",
      commentaire: input.commentaire,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  refresh(immeubleId);
  return id;
}

/** Supprime un bail (récupérable dans bo_trash). */
export async function deleteBail(immeubleId: string, bailId: string) {
  await rpc("bo_delete_doc", { p_table: "bo_bail", p_id: bailId });
  refresh(immeubleId);
}

/** Crée un locataire (réplique de la modale « Nouveau locataire »). */
export async function addLocataire(
  immeubleId: string,
  input: {
    pm: boolean;
    pm_nom?: string;
    pp_civilite?: string;
    pp_prenom?: string;
    pp_nom?: string;
    phone?: string;
    email?: string;
    lotIds: string[];
    commentaire?: string;
  },
) {
  const id = newId();
  const now = new Date().toISOString();
  const formatted = input.pm
    ? input.pm_nom ?? ""
    : [input.pp_prenom, input.pp_nom].filter(Boolean).join(" ");
  await rpc("bo_insert_doc", {
    p_table: "bo_locataire",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      LOTs: input.lotIds,
      pm: input.pm,
      pm_nom: input.pm_nom,
      "pp_civilité": input.pp_civilite,
      "pp_prénom": input.pp_prenom,
      pp_nom: input.pp_nom,
      phone: input.phone,
      email: input.email,
      formatted_name: formatted,
      commentaire: input.commentaire,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  refresh(immeubleId);
  return id;
}

/** Supprime un locataire (récupérable dans bo_trash). */
export async function deleteLocataire(immeubleId: string, locataireId: string) {
  await rpc("bo_delete_doc", { p_table: "bo_locataire", p_id: locataireId });
  refresh(immeubleId);
}

/** Crée une charge annuelle et recalcule les totaux de charges du bien. */
export async function addCharge(
  immeubleId: string,
  input: {
    Type_charge: string;
    type_autre?: string;
    total_an?: number;
    recup_an?: number;
    non_recup_an?: number;
    commentaire?: string;
  },
) {
  const id = newId();
  const now = new Date().toISOString();
  const total =
    input.total_an ?? ((input.recup_an ?? 0) + (input.non_recup_an ?? 0) || undefined);
  await rpc("bo_insert_doc", {
    p_table: "bo_charge",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      Type_charge: input.Type_charge,
      type_autre: input.type_autre,
      total_an: total,
      recup_an: input.recup_an,
      non_recup_an: input.non_recup_an ?? (total !== undefined ? total - (input.recup_an ?? 0) : undefined),
      commentaire: input.commentaire,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  await rpc("bo_recompute_immeuble", { p_id: immeubleId });
  refresh(immeubleId);
  return id;
}

/** Modifie une charge existante puis recalcule les totaux. */
export async function updateCharge(
  immeubleId: string,
  chargeId: string,
  patch: Partial<{ total_an: number; recup_an: number; non_recup_an: number; commentaire: string }>,
) {
  const clean = cleanPatch({ ...patch, "Modified Date": new Date().toISOString() });
  await rpc("bo_patch_doc", { p_table: "bo_charge", p_id: chargeId, p_patch: clean });
  await rpc("bo_recompute_immeuble", { p_id: immeubleId });
  refresh(immeubleId);
}

/** Supprime une charge (récupérable) puis recalcule les totaux. */
export async function deleteCharge(immeubleId: string, chargeId: string) {
  await rpc("bo_delete_doc", { p_table: "bo_charge", p_id: chargeId });
  await rpc("bo_recompute_immeuble", { p_id: immeubleId });
  refresh(immeubleId);
}

/* ---------- Emplacement (adresse / parcelles-PLU / prix du secteur) ---------- */

export type EmplacementPatch = Partial<{
  emp_gare_name: string; emp_gare_time: number; emp_gare_moyen: string;
  emp_bus_name: string; emp_bus_time: number; emp_bus_moyen: string;
  emp_route_name: string; emp_route_time: number; emp_route_moyen: string;
  emp_school_name: string; emp_school_time: number; emp_school_moyen: string;
  emp_com_name: string; emp_com_time: number; emp_com_moyen: string;
  emp_autre_name: string; emp_autre_time: number; emp_autre_moyen: string;
  emp_population: number; emp_revenus: number;
  emp_zone_tendue: boolean; emp_tension_locative: string;
  plu_zone: string; plu_Type_zone: string; plu_hauteur: number; plu_emprise: number;
  ter_surface: number; ter_facade: number;
}>;

/** Met à jour les données d'emplacement / PLU de l'immeuble. */
export async function updateEmplacement(immeubleId: string, patch: EmplacementPatch) {
  const clean = cleanPatch(patch as Record<string, unknown>);
  if (Object.keys(clean).length === 0) return;
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: clean });
  refresh(immeubleId);
}

/* Terrain : dans le BO, la surface et la façade de l'encadré or sont la somme
   des parcelles. On les recalcule à chaque ajout/retrait pour que l'encadré,
   la description du bien et le dossier de vente racontent la même chose. */
async function syncTerrain(immeubleId: string) {
  const im = await bqOne("bo_immeuble", immeubleId);
  const ids = Array.isArray(im?.PARCELLEs) ? (im.PARCELLEs as string[]) : [];
  if (ids.length === 0) return;
  const parcelles = await bqIn("bo_parcelle", ids);
  const somme = (cle: string) =>
    parcelles.reduce((s, p) => s + (typeof p[cle] === "number" ? (p[cle] as number) : 0), 0);
  // Une somme nulle veut dire « les parcelles ne portent pas l'information »,
  // pas « le terrain fait zéro » : on laisse alors la valeur déjà saisie.
  const patch = cleanPatch({
    ter_surface: somme("superficie") || undefined,
    ter_facade: somme("facade") || undefined,
  });
  if (Object.keys(patch).length === 0) return;
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: patch });
}

/** Ajoute une parcelle cadastrale (liée via le tableau PARCELLEs de l'immeuble). */
export async function addParcelle(
  immeubleId: string,
  input: { ref_cadastre: string; superficie?: number; facade?: number; idu?: string },
) {
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_parcelle",
    p_id: id,
    p_doc: cleanPatch({ ...input, "Created Date": now, "Modified Date": now }),
  });
  await rpc("bo_append_ref", { p_table: "bo_immeuble", p_id: immeubleId, p_key: "PARCELLEs", p_value: id });
  await syncTerrain(immeubleId);
  refresh(immeubleId);
}

/** Retire une parcelle (corbeille + retrait du tableau PARCELLEs). */
export async function deleteParcelle(immeubleId: string, parcelleId: string) {
  await rpc("bo_delete_doc", { p_table: "bo_parcelle", p_id: parcelleId });
  await rpc("bo_remove_ref", { p_table: "bo_immeuble", p_id: immeubleId, p_key: "PARCELLEs", p_value: parcelleId });
  await syncTerrain(immeubleId);
  refresh(immeubleId);
}

/** Photo du plan de parcelle entourée (champ `ter_parcelle_img` du BO). */
export async function uploadPhotoParcelle(immeubleId: string, fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Aucun fichier");
  if (file.size > 15 * 1024 * 1024) throw new Error("Fichier trop lourd (15 Mo max)");
  const path = `photos/${immeubleId}/parcelle-${Date.now()}-${safeName(file.name)}`;
  await uploadToBucket(path, file);
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: { ter_parcelle_img: `storage:${path}` },
  });
  refresh(immeubleId);
  return `/api/photo?s=${encodeURIComponent(path)}`;
}

/** Retire la photo de parcelle (le fichier reste dans le bucket). */
export async function supprimerPhotoParcelle(immeubleId: string) {
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: { ter_parcelle_img: null },
  });
  refresh(immeubleId);
}

const DEST_PREFIX: Record<string, string> = {
  Logement: "hab", Commerce: "com", Bureau: "bur", Parking: "parking", Cave: "cave",
};

/** Enregistre les valeurs de secteur d'une destination (modale « Modifier les
 *  valeurs du secteur ») dans le relevé prix_secteur de l'immeuble, et
 *  recalcule les valeurs globales (moyenne pondérée par la surface des lots). */
export async function saveSecteurDest(
  immeubleId: string,
  secteurId: string | null,
  dest: string,
  values: { loyer?: number; prix?: number; renta?: number; commentaire?: string },
  poids: { dest: string; carrez: number }[],
) {
  const prefix = DEST_PREFIX[dest] ?? "autre";
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = cleanPatch({
    [`${prefix}_loyer_retenu`]: values.loyer,
    [`${prefix}_prix_retenu`]: values.prix,
    [`${prefix}_renta_retenu`]: values.renta,
    [`${prefix}_commentaire`]: values.commentaire,
    "0 - date": now,
  });

  let id = secteurId;
  if (!id) {
    id = newId();
    await rpc("bo_insert_doc", {
      p_table: "bo_prix_secteur",
      p_id: id,
      p_doc: { "0 - IMMEUBLE": immeubleId, "Created Date": now, "Modified Date": now, ...patch },
    });
  } else {
    await rpc("bo_patch_doc", { p_table: "bo_prix_secteur", p_id: id, p_patch: patch });
  }

  // Globaux « 0 - … » : moyenne des <dest>_*_retenu pondérée par la surface.
  await rpc("bo_secteur_recompute_globals", { p_id: id, p_poids: poids });
  refresh(immeubleId);
}

/* ---------- État technique (composants / travaux) ---------- */

/** Année de construction + état général du bâti. */
export async function updateTechnique(
  immeubleId: string,
  patch: Partial<{ year_constru: number; Etat: string }>,
) {
  const clean = cleanPatch(patch as Record<string, unknown>);
  if (Object.keys(clean).length === 0) return;
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: clean });
  refresh(immeubleId);
}

/** Crée un composant du bâti (modale « Nouveau composant »). */
export async function addComposant(
  immeubleId: string,
  input: {
    Type_composant: string;
    type_composant_autre?: string;
    Type_materiau?: string;
    type_materiau_autre?: string;
    Etat?: string;
    renov_year?: number;
    renov_txt?: string;
    commentaire?: string;
  },
) {
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_composant",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      Type_composant: input.Type_composant,
      type_composant_autre: input.type_composant_autre,
      "Type_matériau": input.Type_materiau,
      "type_matériau_autre": input.type_materiau_autre,
      Etat: input.Etat,
      renov_year: input.renov_year,
      renov_txt: input.renov_txt,
      commentaire: input.commentaire,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  await rpc("bo_append_ref", { p_table: "bo_immeuble", p_id: immeubleId, p_key: "COMPOSANTs", p_value: id });
  refresh(immeubleId);
  return id;
}

/** Modifie un composant existant. */
export async function updateComposant(
  immeubleId: string,
  composantId: string,
  patch: { Type_materiau?: string; type_materiau_autre?: string; Etat?: string; renov_year?: number; commentaire?: string },
) {
  const clean = cleanPatch({
    "Type_matériau": patch.Type_materiau,
    "type_matériau_autre": patch.type_materiau_autre,
    Etat: patch.Etat,
    renov_year: patch.renov_year,
    commentaire: patch.commentaire,
    "Modified Date": new Date().toISOString(),
  });
  await rpc("bo_patch_doc", { p_table: "bo_composant", p_id: composantId, p_patch: clean });
  refresh(immeubleId);
}

/** Supprime un composant (corbeille + retrait du tableau COMPOSANTs). */
export async function deleteComposant(immeubleId: string, composantId: string) {
  await rpc("bo_delete_doc", { p_table: "bo_composant", p_id: composantId });
  await rpc("bo_remove_ref", { p_table: "bo_immeuble", p_id: immeubleId, p_key: "COMPOSANTs", p_value: composantId });
  refresh(immeubleId);
}

/** Crée des travaux (sur lots OU sur composants du bâti) + total immeuble. */
export async function addTravaux(
  immeubleId: string,
  input: {
    lotIds: string[];
    composantIds: string[];
    description?: string;
    commentaire?: string;
    montant?: number;
    urgence?: "Haute" | "Moyenne" | "Basse";
    devis?: boolean;
  },
) {
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_travaux",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      LOTs: input.lotIds.length ? input.lotIds : undefined,
      COMPOSANTs: input.composantIds.length ? input.composantIds : undefined,
      description: input.description,
      commentaire: input.commentaire,
      montant: input.montant,
      Urgence: input.urgence,
      YN_devis: input.devis ?? false,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  await rpc("bo_recompute_travaux", { p_id: immeubleId });
  refresh(immeubleId);
  return id;
}

/** Supprime des travaux (corbeille) et recalcule le total. */
export async function deleteTravaux(immeubleId: string, travauxId: string) {
  await rpc("bo_delete_doc", { p_table: "bo_travaux", p_id: travauxId });
  await rpc("bo_recompute_travaux", { p_id: immeubleId });
  refresh(immeubleId);
}

/* ---------- Estimations (wizard 6 étapes) ---------- */

export type EstimationPayload = {
  titre: string;
  // Snapshot immeuble (calculé côté wizard depuis la fiche)
  adresse: {
    rue?: string; numero_rue?: string; ville?: string; zipcode?: string; departement?: string;
  };
  imm: {
    nb_lots_tot: number; nb_lots_hab: number; nb_lots_com: number; nb_lots_bur: number;
    carrez_tot: number; carrez_occ: number; occupation: number;
    loyer_hc_tot: number; loyer_hc_max_tot: number; // €/an
    destinations: string[];
    /** Détail par destination : le dossier PDF en a besoin, et il doit être
     *  figé avec l'estimation (l'état locatif, lui, continue de bouger). */
    parDest: {
      dest: string; lots: number; surface: number; surfaceOcc: number;
      loyer: number; loyerMax: number;
    }[];
  };
  emp: { gare_name?: string; gare_time?: number; com_name?: string; com_time?: number };
  charges: { tf_non_recup?: number; autres_non_recup?: number };
  travaux: { bati?: number; lots?: number };
  // Secteur retenu : moyennes pondérées + détail par destination
  ref: {
    loyer?: number; prix?: number; renta?: number;
    parDest: { dest: string; loyer?: number; prix?: number; renta?: number }[];
  };
  // Prix estimé
  prix: { hai: number; honos_pct: number };
  // Analyse
  scores: { emp?: string; lot?: string; bati?: string };
  cibles: string[];
  analyse?: string;
  photo?: string;
};

/** Crée l'estimation figée (bo_estimation + objet de calcul bo_prix + suivi). */
export async function createEstimation(immeubleId: string, agentId: string, p: EstimationPayload) {
  const estId = newId();
  const prixId = newId();
  const now = new Date().toISOString();

  const loyers = p.imm.loyer_hc_tot;
  const loyersMax = p.imm.loyer_hc_max_tot;
  const charges = (p.charges.tf_non_recup ?? 0) + (p.charges.autres_non_recup ?? 0);
  const travaux = (p.travaux.bati ?? 0) + (p.travaux.lots ?? 0);
  const hai = p.prix.hai;
  const nv = Math.round(hai / (1 + p.prix.honos_pct / 100));
  const honos = hai - nv;
  const haiTravaux = hai + travaux;
  const pc = (x: number) => Math.round(x * 1000) / 10; // % à 1 décimale
  const out = {
    out_rba: hai > 0 ? pc(loyers / hai) : 0,
    out_rbm: haiTravaux > 0 ? pc(loyersMax / haiTravaux) : 0,
    out_rna: hai > 0 ? pc((loyers - charges) / hai) : 0,
    out_rnm: haiTravaux > 0 ? pc((loyersMax - charges) / haiTravaux) : 0,
    out_rnaema: hai > 0 ? pc((loyers - charges) / (hai * 1.075)) : 0,
    out_rnaemm: haiTravaux > 0 ? pc((loyersMax - charges) / (haiTravaux * 1.075)) : 0,
    out_prix_m2: p.imm.carrez_tot > 0 ? Math.round(hai / p.imm.carrez_tot) : 0,
    out_prix_m2_max: p.imm.carrez_tot > 0 ? Math.round(haiTravaux / p.imm.carrez_tot) : 0,
    out_prix_nv: nv,
    out_prix_hai_travaux: haiTravaux,
    "out_honos_taux_%": p.prix.honos_pct,
    out_honos_auto: true,
  };

  await rpc("bo_insert_doc", {
    p_table: "bo_prix",
    p_id: prixId,
    p_doc: cleanPatch({
      in_IMMEUBLE: immeubleId,
      in_ESTIMATION: estId,
      in_Data_source: "Estimation",
      in_Motif: "Prix estimé",
      in_prix_hai: hai,
      in_honos_ttc: honos,
      in_honos_auto: true,
      in_loyers: loyers,
      in_loyers_max: loyersMax,
      in_charges: charges,
      in_surface: p.imm.carrez_tot,
      in_travaux: travaux,
      in_ref_loyer: p.ref.loyer,
      in_ref_prix: p.ref.prix,
      in_ref_renta: p.ref.renta,
      ...out,
      "Created Date": now,
      "Modified Date": now,
    }),
  });

  /* Détail par destination, aux noms de colonnes du BO (hab/com/bur/park…) :
     le dossier PDF se reconstruit depuis l'estimation seule. */
  const SFX: Record<string, string> = {
    Logement: "hab", Commerce: "com", Bureau: "bur",
    Parking: "park", Cave: "cave", Logistique: "autre", Annexe: "autre",
  };
  const parDest: Record<string, number> = {};
  for (const l of p.imm.parDest) {
    const s = SFX[l.dest] ?? "autre";
    parDest[`imm_nb_lots_${s}`] = (parDest[`imm_nb_lots_${s}`] ?? 0) + l.lots;
    parDest[`imm_carrez_tot_${s}`] = (parDest[`imm_carrez_tot_${s}`] ?? 0) + l.surface;
    parDest[`imm_carrez_occ_${s}`] = (parDest[`imm_carrez_occ_${s}`] ?? 0) + l.surfaceOcc;
    parDest[`imm_loyer_hc_${s}`] = (parDest[`imm_loyer_hc_${s}`] ?? 0) + l.loyer;
    parDest[`imm_loyer_hc_max_${s}`] = (parDest[`imm_loyer_hc_max_${s}`] ?? 0) + l.loyerMax;
  }
  for (const r of p.ref.parDest) {
    const s = SFX[r.dest] ?? "autre";
    if (r.loyer !== undefined) parDest[`ref_loyer_${s}`] = r.loyer;
    if (r.prix !== undefined) parDest[`ref_prix_${s}`] = r.prix;
    if (r.renta !== undefined) parDest[`ref_renta_${s}`] = r.renta;
  }

  await rpc("bo_insert_doc", {
    p_table: "bo_estimation",
    p_id: estId,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      ...parDest,
      "honos_taux_%": p.prix.honos_pct,
      ESTIMATOR: agentId,
      PRIX: prixId,
      Statut: "2 - A envoyer",
      titre: p.titre,
      prix_hai: hai,
      Cibles: p.cibles,
      analyse: p.analyse,
      Score_emp: p.scores.emp,
      Score_lot: p.scores.lot,
      Score_bati: p.scores.bati,
      photo: p.photo,
      adresse_rue: p.adresse.rue,
      "adresse_numéro_rue": p.adresse.numero_rue,
      adresse_ville: p.adresse.ville,
      adresse_zipcode: p.adresse.zipcode,
      adresse_departement: p.adresse.departement,
      imm_nb_lots_tot: p.imm.nb_lots_tot,
      imm_nb_lots_hab: p.imm.nb_lots_hab,
      imm_nb_lots_com: p.imm.nb_lots_com,
      imm_nb_lots_bur: p.imm.nb_lots_bur,
      imm_carrez_tot_tot: p.imm.carrez_tot,
      imm_carrez_occ_tot: p.imm.carrez_occ,
      imm_occupation: p.imm.occupation,
      imm_loyer_hc_tot: loyers,
      imm_loyer_hc_max_tot: loyersMax,
      imm_Destinations: p.imm.destinations,
      emp_gare_name: p.emp.gare_name,
      "emp_gare_durée": p.emp.gare_time,
      emp_com_name: p.emp.com_name,
      "emp_com_durée": p.emp.com_time,
      charges_tf_non_recup: p.charges.tf_non_recup,
      charges_autres_non_recup: p.charges.autres_non_recup,
      charges_tot_non_recup: charges,
      travaux_bati: p.travaux.bati,
      travaux_lots: p.travaux.lots,
      travaux_tot: travaux,
      ref_loyer_all: p.ref.loyer,
      ref_prix_all: p.ref.prix,
      ref_renta_all: p.ref.renta,
      date_maj_secteur: now,
      "Created Date": now,
      "Modified Date": now,
    }),
  });

  // Le prix estimé devient le prix affiché de la fiche (comme dans le BO).
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: {
      prix_hai_estim: hai,
      prix_hai: hai,
      prix_nv: nv,
      prix_honos_ttc: honos,
      fin_renta_ba: out.out_rba,
      fin_renta_bm: out.out_rbm,
      fin_renta_na: out.out_rna,
      fin_renta_nm: out.out_rnm,
      fin_renta_naema: out.out_rnaema,
      fin_renta_naemm: out.out_rnaemm,
    },
  });

  // Trace dans l'historique des échanges (comme « Estimation (640 000 €) »).
  await rpc("bo_insert_doc", {
    p_table: "bo_suivi",
    p_id: newId(),
    p_doc: {
      Type: "Estimation",
      AGENT: agentId,
      IMMEUBLEs: [immeubleId],
      notes: `Estimation (${hai.toLocaleString("fr-FR")} €)`,
      date_start: now,
      "Created Date": now,
      "Modified Date": now,
      Statut: "Traité",
    },
  });

  refresh(immeubleId);
  return estId;
}

/** Change le statut d'une estimation (3 - Envoyée / 4 - Interne…). */
export async function setEstimationStatut(
  immeubleId: string,
  estimationId: string,
  statut: "2 - A envoyer" | "3 - Envoyée" | "4 - Interne",
) {
  await rpc("bo_patch_doc", {
    p_table: "bo_estimation",
    p_id: estimationId,
    p_patch: statut === "3 - Envoyée" ? { Statut: statut, date_envoi: new Date().toISOString() } : { Statut: statut },
  });
  refresh(immeubleId);
}

/**
 * Ouvre une estimation existante SANS quitter la fiche (retour #125).
 *
 * MAV, pour la deuxième fois : « l'estimation en cours doit faire partie de la
 * page ». Cliquer sur une estimation dans le rail ne doit donc plus être une
 * navigation : l'écran va chercher ce qu'il lui manque ici, et le monte à côté
 * du reste. Ce qui est déjà saisi ailleurs n'est jamais démonté.
 */
export async function ouvrirEstimation(estimationId: string): Promise<{
  reprise: {
    id: string; titre?: string; pdfUrl?: string; pdfKo?: number;
    hai?: number; nv?: number; creeLe?: string; statut?: string;
  };
  lecture: EstimationLecture;
} | null> {
  const e = await getEstimation(estimationId).catch(() => null);
  if (!e) return null;
  const agent = await getAgentFiche(String(e.ESTIMATOR ?? "")).catch(() => null);

  /* Le dossier PDF déjà fabriqué, s'il est au coffre : c'est la pièce jointe
     du mail, et on ne le refabrique pas pour rien. */
  let pdfUrl: string | undefined;
  let pdfKo: number | undefined;
  if (SB_KEY) {
    const r = await fetch(
      `${SB_URL}/rest/v1/bo_app_document?data->>ESTIMATION=eq.${encodeURIComponent(estimationId)}&select=data&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
    ).catch(() => null);
    if (r?.ok) {
      const rows = (await r.json()) as { data: Record<string, unknown> }[];
      const d = rows[0]?.data;
      const chemin = typeof d?.path === "string" ? d.path : undefined;
      if (chemin) pdfUrl = `/api/photo?s=${encodeURIComponent(chemin)}`;
      if (typeof d?.size_kB === "number") pdfKo = d.size_kB;
    }
  }

  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    reprise: {
      id: estimationId,
      titre: t(e.titre),
      pdfUrl, pdfKo,
      hai: n(e.prix_hai),
      nv: n(e.prix_nv) ?? n(e["[SUPPR] prix_nv"]),
      creeLe: t(e["Created Date"]),
      statut: t(e.Statut),
    },
    lecture: lireEstimation(e, agent),
  };
}

/**
 * Supprime une estimation, et le dossier PDF qui l'accompagnait (retour #126).
 *
 * MAV : « il faut qu'on puisse supprimer des estimations, surtout celles qui
 * n'ont jamais été envoyées. » Une estimation déjà partie chez le propriétaire
 * est une pièce de dossier : on la supprime aussi si on le demande, mais
 * l'écran prévient — c'est lui qui porte l'avertissement, pas cette fonction.
 */
export async function supprimerEstimation(immeubleId: string, estimationId: string) {
  /* Le dossier généré n'a plus d'objet sans son estimation : le laisser au
     coffre, c'est laisser un PDF orphelin que personne ne saura relire. */
  if (SB_KEY) {
    const r = await fetch(
      `${SB_URL}/rest/v1/bo_app_document?data->>ESTIMATION=eq.${encodeURIComponent(estimationId)}&select=id`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
    ).catch(() => null);
    if (r?.ok) {
      const docs = (await r.json()) as { id: string }[];
      for (const d of docs) {
        await rpc("bo_delete_doc", { p_table: "bo_app_document", p_id: d.id }).catch(() => {});
      }
    }
  }
  await rpc("bo_delete_doc", { p_table: "bo_estimation", p_id: estimationId });
  refresh(immeubleId);
}

/* ---------- Création d'immeuble (sourcing) ---------- */

/** Crée un immeuble (barre de création rapide « + Immeuble »). */
export async function createImmeuble(input: {
  agentId: string;
  ville: string;
  zipcode?: string;
  rue?: string;
  numero_rue?: string;
  proprietaireId?: string;
  source?: string;
  /** Adresse géocodée choisie dans les suggestions (retour #59). */
  geo?: { lat: number; lon: number; label: string };
}) {
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_immeuble",
    p_id: id,
    p_doc: cleanPatch({
      Statut: "2 - Estimation",
      archived: false,
      standby_Statut: "Traité",
      AGENT: input.agentId,
      adresse_ville: input.ville,
      adresse_zipcode: input.zipcode,
      adresse_rue: input.rue,
      adresse_numero_rue: input.numero_rue,
      PROPRIETAIRE: input.proprietaireId,
      // Le BO range la provenance dans `source` (minuscule) : c'est elle que
      // lisent les listes et les stats.
      source: input.source,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  if (input.geo) {
    await saveAdresse(id, {
      numero: input.numero_rue, rue: input.rue, cp: input.zipcode, ville: input.ville,
      lat: input.geo.lat, lon: input.geo.lon, label: input.geo.label,
    });
  }
  refresh(id);
  return id;
}

/* ---------- Contacts ---------- */

/** Une adresse Bubble : toujours un objet, jamais une chaîne. La stocker à
 *  plat rendait « [object Object] » à la relecture. */
export type GeoPoint = { address: string; lat?: number; lng?: number };

export type ContactPatch = Partial<{
  "Civilité": string;
  "prénom": string;
  nom: string;
  email: string;
  portable: string;
  fixe: string;
  acheteur: boolean;
  vendeur: boolean;
  Types: string[];
  Source: string;
  remarques: string;
  entreprise_nom: string;
  entreprise_siren: string;
  /* --- Société (retour #119) --- */
  poste: string;
  entreprise_capital: number;
  entreprise_rcs: string;
  entreprise_siege_geo: GeoPoint;
  /** Classement acquéreur A/B/C/D du BO. */
  Note: string;
  /** Profil du propriétaire, saisi librement depuis la fiche bien (#71). */
  profil: string;
  date_naissance: string;
  lieu_naissance_geo: GeoPoint;
  adresse_geo: GeoPoint;
  notif_sms: boolean;
  notif_email: boolean;
  /** Agent France Immeuble qui suit le contact. Bubble le range dans `SUIVI` ;
   *  `agent` est un booléen (« ce contact est un agent immobilier »), pas un
   *  propriétaire — les confondre attribuait toutes les fiches à « FI ». */
  SUIVI: string;
  interagence: boolean;
  archived: boolean;
  motif_archivage: string;
  date_archivage: string;
}>;

/** Archive un contact (le BO n'efface pas, il archive). */
export async function archiverContact(contactId: string, motif: string) {
  await rpc("bo_patch_doc", {
    p_table: "bo_contact",
    p_id: contactId,
    p_patch: { archived: true, motif_archivage: motif, date_archivage: new Date().toISOString() },
  });
  revalidatePath("/contacts");
  revalidatePath(`/contact/${contactId}`);
}

/** Met à jour une fiche contact. */
export async function updateContact(contactId: string, patch: ContactPatch) {
  const clean = cleanPatch(patch as Record<string, unknown>);
  if (Object.keys(clean).length === 0) return;
  await rpc("bo_patch_doc", { p_table: "bo_contact", p_id: contactId, p_patch: clean });
  revalidatePath(`/contact/${contactId}`);
  revalidatePath("/contacts");
}

/** Crée un contact (barre de création rapide / modale). */
export async function createContact(input: ContactPatch & { agentId?: string }) {
  const id = newId();
  const now = new Date().toISOString();
  const { agentId, ...rest } = input;
  await rpc("bo_insert_doc", {
    p_table: "bo_contact",
    p_id: id,
    p_doc: cleanPatch({
      ...rest,
      /* `SUIVI` porte le commercial qui suit la fiche. `agent` est un BOOLÉEN
         « est-ce un agent immobilier » : y écrire un identifiant faisait
         passer chaque nouveau contact pour un confrère. */
      SUIVI: agentId,
      "Created Date": now,
      "Modified Date": now,
    } as Record<string, unknown>),
  });
  revalidatePath("/contacts");
  return id;
}

/* ---------- Fichiers (photos & documents, Supabase Storage privé) ---------- */

async function uploadToBucket(path: string, file: File) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : upload impossible");
  const res = await fetch(`${SB_URL}/storage/v1/object/bo-files/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: Buffer.from(await file.arrayBuffer()),
  });
  if (!res.ok) throw new Error(`Upload storage ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const safeName = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(0, 120);

/* ---------- Photos (retour #95) ----------
 *
 * Le schéma Bubble portait déjà tout ce qu'il fallait, on s'y cale :
 *   Type          Principale | Extérieur | Parties communes | Lot | Cadastre | Carte
 *   LOT           le lot associé, quand Type vaut « Lot »
 *   order         rang d'affichage (glisser-déposer)
 *   show_in_doss  la photo part dans le dossier de vente
 *   image         le JPEG plein format · compressed  la vignette
 */

/** Dépose le fichier tel quel dans le bucket (chemin complet fourni). */
async function deposer(path: string, data: Buffer, mime: string) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : upload impossible");
  const res = await fetch(`${SB_URL}/storage/v1/object/bo-files/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": mime, "x-upsert": "true" },
    body: new Uint8Array(data),
  });
  if (!res.ok) throw new Error(`Upload storage ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Toutes les photos d'un immeuble, lues dans le miroir. */
async function photosDe(immeubleId: string): Promise<Record<string, unknown>[]> {
  if (!SB_KEY) return [];
  const res = await fetch(
    `${SB_URL}/rest/v1/bo_photo?data->>IMMEUBLE=eq.${encodeURIComponent(immeubleId)}&select=data&limit=300`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
  );
  if (!res.ok) return [];
  return ((await res.json()) as { data: Record<string, unknown> }[]).map((r) => r.data).filter(Boolean);
}

const patchPhoto = (id: string, doc: Record<string, unknown>) =>
  rpc("bo_patch_doc", {
    p_table: "bo_photo",
    p_id: id,
    p_patch: { ...doc, "Modified Date": new Date().toISOString() },
  });

/**
 * Ajoute une photo. Le fichier reçu est décodé, redressé (EXIF), redimensionné
 * et **converti en JPEG** — y compris les HEIC d'iPhone : rien d'autre qu'un
 * JPEG n'entre dans le bucket, donc aucun format exotique ne peut casser la
 * fabrication d'un PDF (demande MAV du 15/08).
 */
/**
 * Ce que rend un dépôt de photo.
 *
 * Un `throw` ne sert à rien ici : Next masque les erreurs d'action serveur en
 * production et l'écran n'affichait qu'un digest illisible — « An error
 * occurred in the Server Components render ». L'agent voyait sa photo refusée
 * sans jamais savoir pourquoi. On rend donc le motif, en clair.
 */
export type ResultatUpload =
  | { ok: true; id: string; avertissement?: string }
  | { ok: false; message: string };

export async function uploadPhoto(
  immeubleId: string,
  type: string,
  lotId: string | null,
  fd: FormData,
  /** Rang d'affichage : l'appelant enchaîne les fichiers et compte lui-même. */
  ordre?: number,
  /** Import en rafale : ne pas revalider la fiche à chaque fichier — trente
   *  photos feraient trente rendus complets. L'appelant termine par
   *  `rafraichirFiche`. */
  silencieux?: boolean,
): Promise<ResultatUpload> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Aucun fichier." };
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, message: `« ${file.name} » : trop lourd (25 Mo max).` };
  }

  /* Redimensionnement et conversion. Si sharp est indisponible (bibliothèque
     native absente de la fonction déployée), on ne perd pas la photo pour
     autant : le navigateur l'a déjà réduite et convertie en JPEG avant de
     l'envoyer. Seul le HEIC exige vraiment le décodeur — là, on refuse et on
     le dit, plutôt que de déposer un fichier qu'aucun PDF ne saura relire. */
  let web: { pleine: Buffer; vignette: Buffer; largeur?: number; hauteur?: number } | null = null;
  let avertissement: string | undefined;
  try {
    const { versWeb } = await import("@/lib/bo/images");
    web = await versWeb(file);
  } catch (e) {
    const raison = e instanceof Error ? e.message : String(e);
    if (/\.(heic|heif)$/i.test(file.name) || /^image\/(heic|heif)/i.test(file.type)) {
      return { ok: false, message: `« ${file.name} » : conversion HEIC impossible — ${raison}` };
    }
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      return { ok: false, message: `« ${file.name} » : format non traité — ${raison}` };
    }
    const brut = Buffer.from(await file.arrayBuffer());
    web = { pleine: brut, vignette: brut };
    avertissement = "Photo déposée sans redimensionnement (traitement d'image indisponible).";
    console.error("uploadPhoto : sharp indisponible, dépôt du fichier tel quel —", raison);
  }

  const id = newId();
  const now = new Date().toISOString();
  const base = `photos/${immeubleId}/${id}-${safeName(file.name).replace(/\.[^.]+$/, "")}`;
  try {
    await Promise.all([
      deposer(`${base}.jpg`, web.pleine, "image/jpeg"),
      deposer(`${base}-min.jpg`, web.vignette, "image/jpeg"),
    ]);
  } catch (e) {
    return {
      ok: false,
      message: `« ${file.name} » : dépôt refusé — ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  try {
    await rpc("bo_insert_doc", {
      p_table: "bo_photo",
      p_id: id,
      p_doc: cleanPatch({
        IMMEUBLE: immeubleId,
        LOT: lotId ?? undefined,
        image: `storage:${base}.jpg`,
        compressed: `storage:${base}-min.jpg`,
        Type: type,
        format: "image/jpeg",
        largeur: web.largeur,
        hauteur: web.hauteur,
        size_kB: Math.round(web.pleine.length / 1024),
        order: typeof ordre === "number" ? ordre : 0,
        // Par défaut la photo sert au dossier de vente ; l'annonce publique et
        // l'estimation restent des choix explicites.
        show_in_doss: true,
        show_in_ann: false,
        show_in_est: false,
        date: now,
        "Created Date": now,
        "Modified Date": now,
      }),
    });
    if (type === "Principale") await promouvoir(immeubleId, id, `storage:${base}-min.jpg`);
  } catch (e) {
    return {
      ok: false,
      message: `« ${file.name} » : enregistrement refusé — ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!silencieux) refresh(immeubleId);
  return { ok: true, id, avertissement };
}

/** Revalide la fiche une fois la rafale d'imports terminée. */
export async function rafraichirFiche(immeubleId: string) {
  refresh(immeubleId);
}

/** Écrit la photo principale sur l'immeuble et rétrograde l'ancienne. */
async function promouvoir(immeubleId: string, photoId: string, vignette?: string) {
  const photos = await photosDe(immeubleId);
  await Promise.all(
    photos
      .filter((p) => p.Type === "Principale" && p._id !== photoId)
      .map((p) => patchPhoto(String(p._id), { Type: "Extérieur" })),
  );
  const cible = photos.find((p) => p._id === photoId);
  const url = vignette ?? (cible?.compressed as string | undefined) ?? (cible?.image as string | undefined);
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: cleanPatch({ photo_main_compressed: url, "Modified Date": new Date().toISOString() }),
  });
}

/** Désigne la photo principale (celle qui s'affiche en grand et sur la liste). */
export async function definirPhotoPrincipale(immeubleId: string, photoId: string) {
  await patchPhoto(photoId, { Type: "Principale", LOT: null });
  await promouvoir(immeubleId, photoId);
  refresh(immeubleId);
}

/** Coche / décoche une diffusion (dossier de vente, annonce, estimation). */
export async function basculerDiffusionPhoto(
  immeubleId: string,
  photoId: string,
  champ: "show_in_doss" | "show_in_ann" | "show_in_est",
  valeur: boolean,
) {
  await patchPhoto(photoId, { [champ]: valeur });
  refresh(immeubleId);
}

/** Modale « Associer » : rattache la photo à un lot, à la façade, aux parties
 *  communes, au cadastre ou à la carte. */
export async function associerPhoto(
  immeubleId: string,
  photoId: string,
  type: string,
  lotId: string | null,
) {
  if (type === "Principale") {
    await definirPhotoPrincipale(immeubleId, photoId);
    return;
  }
  // `null` (et non `undefined`) : détacher un lot doit effacer la clé.
  await patchPhoto(photoId, { Type: type, LOT: type === "Lot" && lotId ? lotId : null });
  refresh(immeubleId);
}

/** Glisser-déposer : réécrit le rang de chaque photo dans l'ordre reçu. */
export async function ordonnerPhotos(immeubleId: string, ids: string[]) {
  await Promise.all(ids.map((id, i) => patchPhoto(id, { order: i })));
  refresh(immeubleId);
}

/** Supprime une photo (ligne récupérable ; le fichier reste dans le bucket). */
export async function deletePhoto(immeubleId: string, photoId: string) {
  const photos = await photosDe(immeubleId);
  const cible = photos.find((p) => p._id === photoId);
  await rpc("bo_delete_doc", { p_table: "bo_photo", p_id: photoId });
  // La vignette de la fiche pointait sur elle : ne pas laisser une image morte.
  if (cible?.Type === "Principale") {
    await rpc("bo_patch_doc", {
      p_table: "bo_immeuble",
      p_id: immeubleId,
      p_patch: { photo_main_compressed: null, "Modified Date": new Date().toISOString() },
    });
  }
  refresh(immeubleId);
}

/** Ajoute un document au coffre de la fiche (bo_app_document). */
export async function uploadDocument(immeubleId: string, label: string, fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Aucun fichier");
  if (file.size > 25 * 1024 * 1024) throw new Error("Fichier trop lourd (25 Mo max)");
  const id = newId();
  const now = new Date().toISOString();
  const path = `documents/${immeubleId}/${id}-${safeName(file.name)}`;
  await uploadToBucket(path, file);
  await rpc("bo_insert_doc", {
    p_table: "bo_app_document",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      name: label || file.name,
      file_name: file.name,
      path,
      format: file.type,
      size_kB: Math.round(file.size / 1024),
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  refresh(immeubleId);
  return id;
}

/**
 * Fabrique le PDF du dossier d'estimation, le range dans le coffre et
 * l'attache à l'estimation — c'est la pièce jointe du mail au propriétaire.
 * Le dossier est imprimé depuis sa propre page : une seule mise en forme à
 * maintenir, à l'écran comme dans le PDF.
 */
export async function genererPdfEstimation(immeubleId: string, estimationId: string) {
  /* Next masque le message des exceptions en production : on renvoie donc
     l'échec comme une valeur, avec sa cause lisible. Sans ça l'écran affiche
     « An error occurred… », qui n'aide personne. */
  try {
    return { ok: true as const, ...(await fabriquerPdf(immeubleId, estimationId)) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pdf estimation]", message);
    return { ok: false as const, message };
  }
}

async function fabriquerPdf(immeubleId: string, estimationId: string) {
  const { pdfDepuisUrl } = await import("./pdf");
  const { headers } = await import("next/headers");
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${hote}/bien/${immeubleId}/estimation/${estimationId}/imprimer?nu=1`;

  const pdf = await pdfDepuisUrl(url, h.get("cookie") ?? undefined);
  const now = new Date().toISOString();
  const docId = newId();
  const path = `estimations/${immeubleId}/${estimationId}.pdf`;

  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : upload impossible");
  const up = await fetch(`${SB_URL}/storage/v1/object/bo-files/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/pdf",
      "x-upsert": "true",
    },
    body: new Uint8Array(pdf),
  });
  if (!up.ok) throw new Error(`Upload storage ${up.status}: ${(await up.text()).slice(0, 200)}`);

  await rpc("bo_insert_doc", {
    p_table: "bo_app_document",
    p_id: docId,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      ESTIMATION: estimationId,
      name: "Dossier d'estimation",
      file_name: `Estimation.pdf`,
      path,
      format: "application/pdf",
      size_kB: Math.round(pdf.length / 1024),
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  await rpc("bo_patch_doc", {
    p_table: "bo_estimation",
    p_id: estimationId,
    p_patch: { FILE: docId },
  });
  refresh(immeubleId);
  return { documentId: docId, url: `/api/photo?s=${encodeURIComponent(path)}`, ko: Math.round(pdf.length / 1024) };
}

/**
 * Envoie l'estimation au propriétaire, dossier PDF joint, et journalise
 * l'envoi sur l'estimation comme le fait le BO (`sent`, date, destinataire).
 * L'agent est en « Répondre à » : la réponse lui revient sans qu'on écrive
 * à sa place — c'est ce qui garde le mail hors des spams.
 */
export async function envoyerEstimation(input: {
  immeubleId: string;
  estimationId: string;
  to: string;
  objet: string;
  message: string;
  replyTo?: string;
  /** Adresses en copie et en copie cachée. */
  cc?: string;
  cci?: string;
  /** Le dossier d'estimation a été retiré des pièces jointes. */
  sansDossier?: boolean;
  /** Documents du coffre à joindre en plus du dossier d'estimation. */
  documents?: string[];
  /** Fichiers ajoutés à la volée depuis le poste de l'agent. */
  fichiers?: FormData;
}) {
  const { envoyerPourAgent } = await import("./mail");
  if (!input.to.includes("@")) throw new Error("Adresse du destinataire manquante");

  // Le PDF part depuis le coffre : on envoie exactement le document archivé.
  const e = await bqOne("bo_estimation", input.estimationId);
  const docId = input.sansDossier ? "" : String(e?.FILE ?? "");
  let piece: { filename: string; content: Buffer; contentType: string } | undefined;
  if (docId && SB_KEY) {
    const doc = await bqOne("bo_app_document", docId);
    const path = String(doc?.path ?? "");
    if (path) {
      const r = await fetch(`${SB_URL}/storage/v1/object/bo-files/${path}`, {
        headers: { Authorization: `Bearer ${SB_KEY}` },
        cache: "no-store",
      });
      if (r.ok) {
        piece = {
          filename: String(doc?.file_name ?? "Estimation.pdf"),
          content: Buffer.from(await r.arrayBuffer()),
          contentType: "application/pdf",
        };
      }
    }
  }
  if (!piece && !input.sansDossier) {
    throw new Error("PDF introuvable : générez le dossier avant d'envoyer");
  }

  /* L'estimation est un courrier personnel : elle part de la boîte de l'agent
     qui l'a faite — c'est celle-là que le propriétaire connaît, et l'agent y
     retrouve sa copie dans « Envoyés ».

     Tant qu'aucune boîte n'est branchée, on retombe sur la route SMTP commune.
     Là, le garde-fou reste nécessaire : on n'écrit depuis l'adresse de l'agent
     que si elle est sur le domaine signé — écrire depuis un domaine qu'on ne
     signe pas, c'est le spam assuré. Sinon, MAIL_FROM et l'agent en
     « Répondre à ». */
  const agentId = String(e?.ESTIMATOR ?? "");
  const ag = await bqOne("bo_agentfi", agentId);
  const mailAgent = String(ag?.email ?? "").trim();
  const nomAgent = `${String(ag?.["prénom"] ?? "")} ${String(ag?.nom ?? "")}`.trim();
  const domaine = (process.env.MAIL_FROM ?? "").split("@")[1]?.replace(/>.*$/, "").trim();
  const agentSurLeDomaine = !!domaine && mailAgent.toLowerCase().endsWith(`@${domaine.toLowerCase()}`);

  /* Nom affiché : la personne d'abord, la marque ensuite — c'est la
     personne que le propriétaire a eue au téléphone, et les boîtes mail
     tronquent la fin. La marque est reprise du nom d'affichage de
     MAIL_FROM, pour rester réglable sans toucher au code. */
  const marque = (process.env.MAIL_FROM ?? "").split("<")[0].replace(/["']/g, "").trim();
  const from = agentSurLeDomaine
    ? (nomAgent
      ? `${nomAgent}${marque ? ` — ${marque}` : ""} <${mailAgent}>`
      : mailAgent)
    : undefined;
  const replyTo = input.replyTo
    ?? (!agentSurLeDomaine && mailAgent
      ? (nomAgent ? `${nomAgent} <${mailAgent}>` : mailAgent)
      : undefined);

  /* Pièces jointes supplémentaires : d'abord les documents déjà rangés dans
     le coffre du bien, puis les fichiers ajoutés à la volée. */
  const pieces = piece ? [piece] : [];
  for (const id of input.documents ?? []) {
    const doc = await bqOne("bo_app_document", id);
    const path = String(doc?.path ?? "");
    if (!path || !SB_KEY) continue;
    const r = await fetch(`${SB_URL}/storage/v1/object/bo-files/${path}`, {
      headers: { Authorization: `Bearer ${SB_KEY}` },
      cache: "no-store",
    });
    if (!r.ok) continue;
    pieces.push({
      filename: String(doc?.file_name ?? doc?.name ?? "document"),
      content: Buffer.from(await r.arrayBuffer()),
      contentType: String(doc?.format ?? "application/octet-stream"),
    });
  }
  for (const v of input.fichiers?.getAll("f") ?? []) {
    if (!(v instanceof File) || v.size === 0) continue;
    pieces.push({
      filename: v.name,
      content: Buffer.from(await v.arrayBuffer()),
      contentType: v.type || "application/octet-stream",
    });
  }
  const poids = pieces.reduce((s2, p) => s2 + p.content.length, 0);
  if (poids > 20 * 1024 * 1024) {
    throw new Error("Pièces jointes trop lourdes (20 Mo maximum au total)");
  }

  // Le jeton de rattachement voyage dans l'identifiant du message : toute
  // réponse le renverra dans `In-Reply-To`, y compris si le vendeur répond
  // depuis son téléphone. C'est ce qui permet à la boîte métier de recoller
  // la réponse sur CETTE estimation, sans deviner. Voir lib/bo/rattachement.
  const { nouveauJeton, messageIdDuJeton } = await import("./rattachement");
  const jeton = nouveauJeton();

  const envoi = await envoyerPourAgent(agentId, {
    messageIdPour: (domaine) => messageIdDuJeton(jeton, domaine),
    to: input.to,
    cc: input.cc?.trim() || undefined,
    bcc: input.cci?.trim() || undefined,
    /* L'agent en copie cachée seulement si le message ne part pas de sa
       propre boîte — sinon il l'a déjà dans ses « Envoyés ». */
    bccSiCommun: mailAgent || undefined,
    subject: input.objet,
    text: input.message,
    from,
    replyTo,
    attachments: pieces,
  });
  const messageId = envoi.messageId;

  const now = new Date().toISOString();
  await rpc("bo_patch_doc", {
    p_table: "bo_estimation",
    p_id: input.estimationId,
    p_patch: cleanPatch({
      sent: true, sent_at: now, sent_to: input.to,
      sent_cc: input.cc?.trim() || undefined,
      sent_pj: pieces.map((p) => p.filename).join(", "),
      sent_message_id: messageId, sent_jeton: jeton,
      statut: "3 - Envoyée", "Modified Date": now,
    }),
  });
  refresh(input.immeubleId);
  return { messageId, ko: Math.round(poids / 1024), pieces: pieces.length };
}

/**
 * Retour MAV #75 — la capture des cartes sans copier-coller.
 *
 * L'agent ne fait plus de capture d'écran : le serveur demande à Google les
 * deux vues (la région, puis le quartier), les colle côte à côte comme dans
 * le dossier, et range l'image dans les photos de l'immeuble (type « Carte »).
 * Elle prend alors la place de la carte vivante, exactement comme une capture
 * déposée à la main.
 */
export async function capturerCartes(immeubleId: string, sat = false) {
  const { pngDepuisHtml } = await import("./pdf");
  const { headers } = await import("next/headers");
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  const base = `${proto}://${hote}`;

  const adr = await bqOne("bo_adresse", await idAdresse(immeubleId));
  const geo = adr?.geo as { lat?: number; lng?: number } | undefined;
  const lat = typeof geo?.lat === "number" ? geo.lat : undefined;
  const lon = typeof geo?.lng === "number" ? geo.lng : undefined;
  if (lat === undefined || lon === undefined) {
    throw new Error("Adresse non géocodée : impossible de capturer les cartes");
  }

  // On passe par notre relais : la clé Google ne sort jamais du serveur.
  const vue = (z: number, pin: string) =>
    `${base}/api/staticmap?lat=${lat}&lon=${lon}&z=${z}&w=400&h=300&pin=${pin}${sat ? "&sat=1" : ""}`;
  const test = await fetch(vue(14, "1"), { cache: "no-store" });
  if (!test.ok) {
    throw new Error(`Google Maps a refusé la capture : ${(await test.text()).slice(0, 160)}`);
  }

  const html =
    `<body style="margin:0;display:flex;background:#fff">` +
    `<img src="${vue(5, "0")}" width="400" height="300">` +
    `<img src="${vue(14, "1")}" width="400" height="300">` +
    `</body>`;
  const png = await pngDepuisHtml(html, 800, 300);

  const id = newId();
  const now = new Date().toISOString();
  const path = `photos/${immeubleId}/${id}-cartes.png`;
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : upload impossible");
  const up = await fetch(`${SB_URL}/storage/v1/object/bo-files/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SB_KEY}`, "Content-Type": "image/png", "x-upsert": "true" },
    body: new Uint8Array(png),
  });
  if (!up.ok) throw new Error(`Upload storage ${up.status}: ${(await up.text()).slice(0, 200)}`);

  await rpc("bo_insert_doc", {
    p_table: "bo_photo",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      image: `storage:${path}`,
      Type: "Carte",
      format: "image/png",
      size_kB: Math.round(png.length / 1024),
      date: now,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  refresh(immeubleId);
  return { id, ko: Math.round(png.length / 1024) };
}

/** L'adresse d'un immeuble (une seule ligne par immeuble dans le BO). */
async function idAdresse(immeubleId: string) {
  if (!SB_KEY) return "";
  const r = await fetch(
    `${SB_URL}/rest/v1/bo_adresse?data->>IMMEUBLE=eq.${immeubleId}&select=id&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
  );
  if (!r.ok) return "";
  const rows = (await r.json()) as { id: string }[];
  return rows[0]?.id ?? "";
}

/** Retire un document du coffre (ligne récupérable, fichier conservé). */
export async function deleteDocument(immeubleId: string, documentId: string) {
  await rpc("bo_delete_doc", { p_table: "bo_app_document", p_id: documentId });
  refresh(immeubleId);
}

/* ---------- Commercialisation : visites & offres ---------- */

/** Programme une visite. */
export async function addVisite(
  immeubleId: string,
  agentId: string,
  input: { date: string; visiteur?: string; commentaire_interne?: string; source?: string },
) {
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_visite",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      AGENT: agentId,
      date: new Date(input.date).toISOString(),
      Statut: "Confirmée",
      visiteur_nom: input.visiteur,
      commentaire_interne: input.commentaire_interne,
      source: input.source,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  refresh(immeubleId);
  return id;
}

/** Change le statut d'une visite (Effectuée avec REX, Annulée avec motif…). */
export async function setVisiteStatut(
  immeubleId: string,
  visiteId: string,
  statut: "En attente" | "Confirmée" | "Effectuée" | "Annulée",
  extra?: { rex_fi?: string; motif_annulation?: string },
) {
  await rpc("bo_patch_doc", {
    p_table: "bo_visite",
    p_id: visiteId,
    p_patch: cleanPatch({ Statut: statut, ...extra }),
  });
  refresh(immeubleId);
}

/** Enregistre une offre d'achat. */
export async function addOffre(
  immeubleId: string,
  input: {
    acheteur?: string;
    prix_nv: number;
    honos_ht?: number;
    date_expiration?: string;
    commentaire?: string;
    source?: string;
  },
) {
  const id = newId();
  const now = new Date().toISOString();
  const honosTtc = input.honos_ht !== undefined ? Math.round(input.honos_ht * 1.2) : undefined;
  await rpc("bo_insert_doc", {
    p_table: "bo_offre",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLEs: [immeubleId],
      Statut: "En cours",
      date: now,
      acheteur_nom: input.acheteur,
      prix_nv: input.prix_nv,
      honos_ht: input.honos_ht,
      honos_ttc: honosTtc,
      prix_hai: input.prix_nv + (honosTtc ?? 0),
      date_expiration: input.date_expiration ? new Date(input.date_expiration).toISOString() : undefined,
      commentaire: input.commentaire,
      source: input.source,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  refresh(immeubleId);
  return id;
}

/** Fait avancer une offre (Acceptée / Refusée / Compromis / Vendu…). */
export async function setOffreStatut(
  immeubleId: string,
  offreId: string,
  statut:
    | "En cours" | "Contre offre" | "Acceptée" | "Refusée"
    | "Compromis programmé" | "Compromis signé" | "Vente prévue" | "Vendu",
  extra?: { motif_refus?: string; date_compromis?: string; date_acte?: string },
) {
  await rpc("bo_patch_doc", {
    p_table: "bo_offre",
    p_id: offreId,
    p_patch: cleanPatch({
      Statut: statut,
      motif_refus: extra?.motif_refus,
      date_compromis: extra?.date_compromis ? new Date(extra.date_compromis).toISOString() : undefined,
      date_acte: extra?.date_acte ? new Date(extra.date_acte).toISOString() : undefined,
      ...(statut === "Vendu" ? { date_cloture: new Date().toISOString() } : {}),
    }),
  });
  refresh(immeubleId);
}

/* ---------- Dossiers de commercialisation (versionnés) ---------- */

/** Génère un dossier complet versionné (V1, V2…) — snapshot chiffré. */
export async function createDossier(
  immeubleId: string,
  agentId: string,
  input: {
    version: number;
    prix_hai: number;
    honos_pct: number;
    isPublic: boolean;
    snapshot: {
      surface: number; occupation: number; loyer_hc_an: number; loyer_hc_an_max: number;
      travaux: number; ville?: string; zipcode?: string;
      destination_principale?: string; destinations: string[];
    };
  },
) {
  const id = newId();
  const now = new Date().toISOString();
  const nv = Math.round(input.prix_hai / (1 + input.honos_pct / 100));
  const s = input.snapshot;
  await rpc("bo_insert_doc", {
    p_table: "bo_dossier",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      AGENT_CREATOR: agentId,
      version: input.version,
      last_version: true,
      public: input.isPublic,
      date: now,
      prix_hai: input.prix_hai,
      prix_nv: nv,
      honos_ttc: input.prix_hai - nv,
      "honos_taux_x,xx": input.honos_pct / 100,
      surface: s.surface,
      occupation: s.occupation,
      loyer_hc_an: s.loyer_hc_an,
      loyer_hc_an_max: s.loyer_hc_an_max,
      travaux: s.travaux,
      renta_actuelle: input.prix_hai > 0 ? Math.round((s.loyer_hc_an / input.prix_hai) * 1000) / 10 : 0,
      renta_max: input.prix_hai + s.travaux > 0 ? Math.round((s.loyer_hc_an_max / (input.prix_hai + s.travaux)) * 1000) / 10 : 0,
      ville: s.ville,
      zipcode: s.zipcode,
      Destination_principale: s.destination_principale,
      Destinations: s.destinations,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  // Les versions précédentes ne sont plus « dernière version ».
  await rpc("bo_dossier_demote_others", { p_immeuble: immeubleId, p_keep: id });
  refresh(immeubleId);
  return id;
}

/* ---------- Mandats (registre séquentiel loi Hoguet) ---------- */

export type MandatPatch = Partial<{
  Type: string;
  Type_exclu: string;
  Type_personne: string;
  Statut: string;
  // Mandants (2 max, modèle plat du BO)
  "prénom_m1": string; nom_m1: string; date_naissance_m1: string; "qualité_m1": string;
  "prénom_m2": string; nom_m2: string; date_naissance_m2: string;
  raison_sociale: string; siren: string; rcs: string; capital: number;
  // Objet
  occuped_yn: boolean; ref_cadastre: string; surface_terrain: number; surface_bati: number;
  description: string;
  // Prix
  prix_nv: number; honos_taux: number; honos_ttc: number; prix_hai: number; Charge_hono: string;
  // Conditions
  date_effet: string; "durée_tot_month": number; "durée_exclu_jours": number;
  "durée_irrevoc_days": number; renouvelable_yn: boolean; date_fin: string;
  // Pièces et diffusion
  justif_propriete: string; kbis: string;
  /** Publication en ligne : « oui » par défaut, retirable à la demande du client. */
  publication_web_yn: boolean;
  /** « bloc » ou « decoupe » : commande la charge des honoraires (art. 4.3). */
  vente_mode: string;
}>;

/** Crée un mandat (modale « Nouveau mandat ») rattaché à un immeuble. */
export async function createMandat(
  immeubleId: string,
  agentId: string,
  input: {
    Type: string;
    Type_personne: string;
    prenom_m1?: string;
    nom_m1?: string;
    raison_sociale?: string;
    remarques?: string;
  },
) {
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_mandat",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLEs: [immeubleId],
      AGENT: agentId,
      Type: input.Type,
      Type_exclu: "Semi-exclusif",
      Type_personne: input.Type_personne,
      Statut: "Attente infos",
      "prénom_m1": input.prenom_m1,
      nom_m1: input.nom_m1,
      raison_sociale: input.raison_sociale,
      description: input.remarques,
      Charge_hono: "Vendeur",
      honos_taux: 5,
      "durée_tot_month": 12,
      "durée_exclu_jours": 14,
      "durée_irrevoc_days": 14,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  refresh(immeubleId);
  return id;
}

/** Met à jour la fiche mandat (onglets Mandants / Objet / Prix / Conditions). */
export async function updateMandat(mandatId: string, immeubleId: string, patch: MandatPatch) {
  const clean = cleanPatch(patch as Record<string, unknown>);
  if (Object.keys(clean).length === 0) return;
  /* Prix : l'écran résout lui-même les quatre cases (retour #104) et envoie
     les quatre valeurs. On ne recalcule ici que si l'appelant ne l'a pas fait
     — sinon on écraserait un net vendeur déduit d'un prix HAI saisi. */
  if (typeof clean.prix_nv === "number" && clean.honos_ttc === undefined) {
    const taux = typeof clean.honos_taux === "number" ? clean.honos_taux : 5;
    clean.honos_ttc = Math.round((clean.prix_nv as number) * (taux / 100));
    clean.prix_hai = (clean.prix_nv as number) + (clean.honos_ttc as number);
  }
  // Conditions : date de fin dérivée du début + durée.
  if (typeof clean.date_effet === "string" && typeof clean["durée_tot_month"] === "number") {
    const d = new Date(clean.date_effet as string);
    d.setMonth(d.getMonth() + (clean["durée_tot_month"] as number));
    clean.date_fin = d.toISOString();
  }
  await rpc("bo_patch_doc", { p_table: "bo_mandat", p_id: mandatId, p_patch: clean });
  rafraichirMandat(mandatId, immeubleId);
}

/** Réserve le prochain numéro du registre (séquentiel, immuable, sans trou). */
export async function reserveMandatNumero(mandatId: string, immeubleId: string) {
  await rpc("bo_reserve_mandat_numero", { p_id: mandatId });
  refresh(immeubleId);
  revalidatePath(`/mandat/${mandatId}`);
}

/** Marque les infos mandat reçues (Attente infos → A rédiger). */
export async function mandatInfosRecues(mandatId: string, immeubleId: string) {
  await rpc("bo_patch_doc", {
    p_table: "bo_mandat",
    p_id: mandatId,
    p_patch: { Statut: "A rédiger", date_infos: new Date().toISOString() },
  });
  refresh(immeubleId);
  revalidatePath(`/mandat/${mandatId}`);
}

/** Annule le mandat (le numéro, s'il existe, reste au registre). */
export async function cancelMandat(mandatId: string, immeubleId: string, motif: string) {
  await rpc("bo_patch_doc", {
    p_table: "bo_mandat",
    p_id: mandatId,
    p_patch: { Statut: "Annulé", motif_annulation: motif, date_annulation: new Date().toISOString() },
  });
  refresh(immeubleId);
  revalidatePath(`/mandat/${mandatId}`);
}

/**
 * Enregistre la liste des mandants (retour #101).
 *
 * Deux écritures pour un seul geste : la liste moderne `mandants` (illimitée,
 * avec fonction et société), ET les champs plats du BO — `MANDANTs`,
 * prénom/nom m1 et m2, `Type_personne` — pour que les écrans Bubble encore en
 * service et le champ de recherche continuent de fonctionner.
 */
export async function majMandants(
  mandatId: string,
  immeubleId: string,
  mandants: MandantEnregistre[],
) {
  const plat: Record<string, unknown> = {
    mandants,
    MANDANTs: mandants.map((x) => x.contactId).filter(Boolean),
    Type_personne: mandants.some((x) => x.personne === "morale") ? "Morale" : "Physique",
  };
  const [a, b] = mandants;
  // `qualité_m1` porte la qualité au mandat (Gérant, Président…), pas la civilité.
  plat["qualité_m1"] = a?.fonction ?? null;
  plat["prénom_m1"] = a?.prenom ?? null;
  plat.nom_m1 = a?.nom ?? null;
  plat.date_naissance_m1 = a?.dateNaissance ?? null;
  plat.adresse_m1_geo = a?.adresse ?? null;
  plat.lieu_naissance_geo_m1 = a?.lieuNaissance ?? null;
  plat.cni_m1 = a?.cni ?? null;
  plat["prénom_m2"] = b?.prenom ?? null;
  plat.nom_m2 = b?.nom ?? null;
  plat.date_naissance_m2 = b?.dateNaissance ?? null;
  plat.adresse_m2_geo = b?.adresse ?? null;
  plat.cni_m2 = b?.cni ?? null;
  const morale = mandants.find((x) => x.personne === "morale");
  plat.raison_sociale = morale?.societe?.nom ?? null;
  plat.siren = morale?.societe?.siren ?? null;
  plat.rcs = morale?.societe?.rcs ?? null;
  plat.capital = morale?.societe?.capital ?? null;
  plat.siege_geo = morale?.societe?.siege ?? null;
  plat.kbis = morale?.kbis ?? null;
  plat.searchfield = mandants
    .map((x) => [x.prenom, x.nom, x.societe?.nom].filter(Boolean).join(" "))
    .join(" · ");
  plat["Modified Date"] = new Date().toISOString();

  await rpc("bo_patch_doc", { p_table: "bo_mandat", p_id: mandatId, p_patch: plat });
  rafraichirMandat(mandatId, immeubleId);
}

export type MandantEnregistre = {
  uid: string;
  contactId?: string;
  qualite?: string;
  prenom?: string;
  nom?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  adresse?: string;
  email?: string;
  personne: "physique" | "morale";
  fonction?: string;
  societe?: { nom?: string; siren?: string; rcs?: string; capital?: number; siege?: string };
  cni?: string;
  kbis?: string;
};

function rafraichirMandat(mandatId: string, immeubleId: string) {
  refresh(immeubleId);
  revalidatePath(`/mandat/${mandatId}`);
  if (immeubleId) revalidatePath(`/bien/${immeubleId}/mandat/${mandatId}`);
}

/**
 * Dépose une pièce du dossier de mandat.
 *
 * La CNI et le Kbis ne sont pas des pièces « du mandat » : ce sont des pièces
 * DU CONTACT, qui resserviront au mandat suivant, au compromis, à la vente.
 * On les range donc sur la fiche contact (`cni`, `entreprise_kbis`) et on ne
 * garde sur le mandat qu'un renvoi — c'est ce que demandait le retour #101.
 */
export async function deposerPieceMandat(
  mandatId: string,
  immeubleId: string,
  cle: "cni" | "kbis" | "titre",
  contactId: string | undefined,
  fd: FormData,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  try {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Aucun fichier");
    if (file.size > 15 * 1024 * 1024) throw new Error("Fichier trop lourd (15 Mo max)");
    const path = `mandats/${mandatId}/${cle}-${newId()}-${safeName(file.name)}`;
    await uploadToBucket(path, file);
    const url = `/api/photo?s=${encodeURIComponent(path)}`;

    if (cle === "titre") {
      await rpc("bo_patch_doc", {
        p_table: "bo_mandat",
        p_id: mandatId,
        p_patch: { justif_propriete: url, "Modified Date": new Date().toISOString() },
      });
    } else if (contactId) {
      // La pièce enrichit la fiche contact — elle vivra plus longtemps que ce mandat.
      await rpc("bo_patch_doc", {
        p_table: "bo_contact",
        p_id: contactId,
        p_patch: {
          [cle === "cni" ? "cni" : "entreprise_kbis"]: url,
          "Modified Date": new Date().toISOString(),
        },
      });
    }
    // Le coffre de l'immeuble garde une trace, comme pour tout document déposé.
    await rpc("bo_insert_doc", {
      p_table: "bo_app_document",
      p_id: newId(),
      p_doc: cleanPatch({
        IMMEUBLE: immeubleId,
        MANDAT: mandatId,
        name: cle === "cni" ? "Pièce d'identité" : cle === "kbis" ? "Kbis" : "Titre de propriété",
        file_name: file.name,
        path,
        format: file.type,
        size_kB: Math.round(file.size / 1024),
        "Created Date": new Date().toISOString(),
        "Modified Date": new Date().toISOString(),
      }),
    });
    rafraichirMandat(mandatId, immeubleId);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Fabrique le PDF du mandat depuis sa page imprimable et le range au coffre. */
export async function genererMandat(immeubleId: string, mandatId: string) {
  try {
    const { pdfDepuisUrl } = await import("./pdf");
    const { headers } = await import("next/headers");
    const h = await headers();
    const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
    const url = `${proto}://${hote}/bien/${immeubleId}/mandat/${mandatId}/imprimer?nu=1`;
    const pdf = await pdfDepuisUrl(url, h.get("cookie") ?? undefined);

    const now = new Date().toISOString();
    const m = await bqOne("bo_mandat", mandatId);
    const numero = m?.numero ? String(m.numero) : mandatId.slice(-6);
    const path = `mandats/${mandatId}/mandat-${numero}.pdf`;
    if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : upload impossible");
    const up = await fetch(`${SB_URL}/storage/v1/object/bo-files/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/pdf",
        "x-upsert": "true",
      },
      body: new Uint8Array(pdf),
    });
    if (!up.ok) throw new Error(`Upload storage ${up.status}: ${(await up.text()).slice(0, 200)}`);

    const docId = newId();
    await rpc("bo_insert_doc", {
      p_table: "bo_app_document",
      p_id: docId,
      p_doc: cleanPatch({
        IMMEUBLE: immeubleId,
        MANDAT: mandatId,
        name: `Mandat ${numero}`,
        file_name: `Mandat-${numero}.pdf`,
        path,
        format: "application/pdf",
        size_kB: Math.round(pdf.length / 1024),
        "Created Date": now,
        "Modified Date": now,
      }),
    });
    await rpc("bo_patch_doc", {
      p_table: "bo_mandat",
      p_id: mandatId,
      p_patch: { pdf_mandat: `/api/photo?s=${encodeURIComponent(path)}`, date_generation: now, "Modified Date": now },
    });
    rafraichirMandat(mandatId, immeubleId);
    return { ok: true as const, url: `/api/photo?s=${encodeURIComponent(path)}`, ko: Math.round(pdf.length / 1024) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pdf mandat]", message);
    return { ok: false as const, message };
  }
}

/**
 * Journalise l'envoi à la signature. Le connecteur Docusign n'est pas encore
 * branché : l'app prépare et trace, l'envoi effectif se fait depuis Docusign
 * jusqu'à ce que le connecteur soit ouvert (doctrine « validation humaine
 * avant tout envoi »).
 */
export async function envoyerMandatSignature(
  mandatId: string,
  immeubleId: string,
  destinataires: string[],
) {
  const now = new Date().toISOString();
  const m = await bqOne("bo_mandat", mandatId);
  const envois = Array.isArray(m?.MANDAT_ENVOYEs) ? (m!.MANDAT_ENVOYEs as unknown[]) : [];
  await rpc("bo_patch_doc", {
    p_table: "bo_mandat",
    p_id: mandatId,
    p_patch: {
      Statut: "Attente signature",
      date_last_envoi: now,
      MANDAT_ENVOYEs: [...envois, { at: now, to: destinataires }],
      "Modified Date": now,
    },
  });
  rafraichirMandat(mandatId, immeubleId);
}

/** Retour de signature : le mandat est figé, le registre est clos sur ce numéro. */
export async function marquerMandatSigne(
  mandatId: string,
  immeubleId: string,
  dateSignature: string,
  fd?: FormData,
) {
  try {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      Statut: "En cours",
      date_signature: dateSignature || now,
      locked: true,
      "Modified Date": now,
    };
    const file = fd?.get("file");
    if (file instanceof File && file.size > 0) {
      const path = `mandats/${mandatId}/signe-${safeName(file.name)}`;
      await uploadToBucket(path, file);
      patch.pdf_signed = `/api/photo?s=${encodeURIComponent(path)}`;
    }
    await rpc("bo_patch_doc", { p_table: "bo_mandat", p_id: mandatId, p_patch: patch });
    rafraichirMandat(mandatId, immeubleId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Met à jour des champs simples du bien (descriptif, prix…). */
export async function updateBien(
  immeubleId: string,
  patch: Partial<{
    descriptif: string;
    prix_nv: number;
    prix_honos_ttc: number;
    prix_hai: number;
    prix_nv_min: number;
    prix_financement: boolean;
    prix_permis: boolean;
    Motif_vente: string;
    notes: string;
  }>,
) {
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  // Un « non » explicite doit s'enregistrer : le filtre ci-dessus l'écarterait
  // s'il valait false uniquement par défaut.
  for (const k of ["prix_financement", "prix_permis"] as const) {
    if (typeof patch[k] === "boolean") clean[k] = patch[k];
  }
  if (Object.keys(clean).length === 0) return;
  if (typeof clean.prix_nv === "number" && typeof clean.prix_honos_ttc === "number") {
    clean.prix_hai = clean.prix_nv + clean.prix_honos_ttc;
  }
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: clean });
  refresh(immeubleId);
}

/**
 * Enregistre un nouveau prix : il devient le prix de la fiche et laisse une
 * ligne dans l'historique (#93, #94). Les rendements sont recalculés avec les
 * formules de l'estimation, pour que les deux racontent la même chose.
 */
export async function enregistrerPrix(
  immeubleId: string,
  input: { hai: number; honosTtc: number; motif: string; remarque?: string },
) {
  const im = await bqOne("bo_immeuble", immeubleId);
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  const loyers = n(im?.fin_loyers_an);
  const loyersMax = n(im?.fin_loyers_an_max) || loyers;
  const charges = n(im?.fin_charges_non_recup);
  const travaux = n(im?.fin_travaux);
  const surface = n(im?.fin_surface_carrez);

  const hai = Math.round(input.hai);
  const honos = Math.round(input.honosTtc);
  const nv = hai - honos;
  const haiTravaux = hai + travaux;
  const pc = (x: number) => Math.round(x * 1000) / 10;
  const now = new Date().toISOString();

  await rpc("bo_insert_doc", {
    p_table: "bo_prix",
    p_id: newId(),
    p_doc: cleanPatch({
      in_IMMEUBLE: immeubleId,
      in_Data_source: "Fiche",
      in_Motif: input.motif,
      in_remarque: input.remarque,
      in_prix_hai: hai,
      in_honos_ttc: honos,
      in_loyers: loyers,
      in_loyers_max: loyersMax,
      in_charges: charges,
      in_travaux: travaux,
      in_surface: surface,
      out_prix_nv: nv,
      out_prix_hai_travaux: haiTravaux,
      "out_honos_taux_%": nv > 0 ? Math.round((honos / nv) * 1000) / 10 : 0,
      out_prix_m2: surface > 0 ? Math.round(hai / surface) : 0,
      out_prix_m2_max: surface > 0 ? Math.round(haiTravaux / surface) : 0,
      out_rba: hai > 0 ? pc(loyers / hai) : 0,
      out_rbm: haiTravaux > 0 ? pc(loyersMax / haiTravaux) : 0,
      out_rna: hai > 0 ? pc((loyers - charges) / hai) : 0,
      out_rnm: haiTravaux > 0 ? pc((loyersMax - charges) / haiTravaux) : 0,
      out_rnaema: hai > 0 ? pc((loyers - charges) / (hai * 1.075)) : 0,
      out_rnaemm: haiTravaux > 0 ? pc((loyersMax - charges) / (haiTravaux * 1.075)) : 0,
      "Created Date": now,
      "Modified Date": now,
    }),
  });

  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: { prix_hai: hai, prix_nv: nv, prix_honos_ttc: honos, "Modified Date": now },
  });
  refresh(immeubleId);
}

/* ---------- Typologies personnalisées (retour MAV #22) ---------- */

/** Forme normalisée servant au contrôle de doublon (sans accents ni casse). */
const normalise = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Enregistre une typologie saisie librement. Refuse un doublon, qu'il vienne
 * du référentiel de base ou d'un ajout précédent — on compare sans tenir
 * compte des accents, de la casse ni des espaces multiples.
 */
export async function ajouterTypologie(
  destination: string,
  label: string,
  dejaConnues: string[],
): Promise<{ ok: boolean; message: string }> {
  const propre = label.trim();
  if (propre.length < 2) return { ok: false, message: "Typologie trop courte." };
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");

  const cle = normalise(propre);
  const collision = dejaConnues.find((t) => normalise(t) === cle);
  if (collision) return { ok: false, message: `« ${collision} » existe déjà pour ${destination}.` };

  const res = await fetch(`${SB_URL}/rest/v1/bo_typologie`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ destination, label: propre }),
    cache: "no-store",
  });
  // 23505 = violation d'unicité : la typologie a déjà été ajoutée ailleurs.
  if (res.status === 409) return { ok: false, message: `« ${propre} » est déjà enregistrée.` };
  if (!res.ok) throw new Error(`Écriture Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);

  refresh();
  return { ok: true, message: `« ${propre} » ajoutée aux typologies ${destination}.` };
}

/* ---------- Recherche de contacts (modales de sélection, retours #31/#32) ---------- */

export type ContactTrouve = {
  id: string; nom: string; type?: string; tel?: string; email?: string;
  /* Les champs de fusion, pour que l'aperçu d'un message montre le VRAI
     destinataire et non un exemple inventé (retour #131). */
  prenom?: string; nomFamille?: string; civilite?: string; societe?: string;
};

/**
 * Recherche un contact par nom, e-mail ou téléphone.
 *
 * Mot à mot et dans les deux sens : le BO écrit « voci romain » dans son
 * searchfield, et le nom et le prénom sont deux colonnes — chercher la phrase
 * entière ne trouvait donc rien dès qu'on tapait deux mots (retour #123).
 */
export async function chercherContacts(q: string): Promise<ContactTrouve[]> {
  const mots = motsRecherche(q);
  if (!mots.length || q.trim().length < 2 || !SB_KEY) return [];
  const p = new URLSearchParams({ select: "data", limit: "12" });
  const f = filtreMots(
    ["searchfield", "nom", '"prénom"', "email", "portable", "entreprise_nom"],
    mots,
  );
  if (f) p.append(f[0], f[1]);
  const res = await fetch(`${SB_URL}/rest/v1/bo_contact?${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return [];
  const rows = (await res.json()) as { data: Record<string, unknown> }[];
  return rows.map(({ data: c }) => ({
    id: String(c._id),
    nom: `${c["prénom"] ?? ""} ${c.nom ?? ""}`.trim() || String(c.email ?? "Sans nom"),
    type: Array.isArray(c.Types) ? String(c.Types[0] ?? "") : undefined,
    tel: typeof c.portable_formatted === "string" ? c.portable_formatted
      : typeof c.portable === "string" ? c.portable : undefined,
    email: typeof c.email === "string" ? c.email : undefined,
    prenom: typeof c["prénom"] === "string" ? c["prénom"] : undefined,
    nomFamille: typeof c.nom === "string" ? c.nom : undefined,
    civilite: typeof c["Civilité"] === "string" ? c["Civilité"] : undefined,
    societe: typeof c.entreprise_nom === "string" ? c.entreprise_nom : undefined,
  }));
}

/* ===================== Matching, commercialisation, propositions ===================== */

export type MatchInput = {
  immeubleId: string;
  agentId?: string;
  /** D'où viennent les critères : estimation, prix saisi, ou dossier. */
  source: "from_est" | "from_imm" | "from_doss";
  dossierId?: string;
  estimationId?: string;
  prix?: number;
  surface?: number;
  occupation?: number;
  renta?: number;
  travaux?: number;
  ville?: string;
  departement?: string;
  cibles?: string[];
  destinations?: string[];
  notes: string[];
  exclureDejaVus: boolean;
  exclureAgents: boolean;
  mandatObligatoire: boolean;
  /** Résultat : recherches retenues, contacts, e-mails, téléphones. */
  rechercheIds: string[];
  contactIds: string[];
  emails: string[];
  telephones: string[];
};

/** Enregistre un matching dans l'historique de l'immeuble. */
export async function saveMatch(input: MatchInput) {
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_match",
    p_id: id,
    p_doc: {
      in_IMMEUBLE: input.immeubleId,
      Source_mode: input.source,
      in_DOSSIER: input.dossierId ?? null,
      in_ESTIMATION: input.estimationId ?? null,
      in_prix: input.prix ?? null,
      in_surface: input.surface ?? null,
      in_occup: input.occupation ?? null,
      in_renta: input.renta ?? null,
      in_travaux: input.travaux ?? null,
      in_ville: input.ville ?? null,
      in_dpt: input.departement ?? null,
      in_Cibles: input.cibles ?? [],
      in_Destinations: input.destinations ?? [],
      in_Notes: input.notes,
      in_proposed: input.exclureDejaVus,
      in_agents: input.exclureAgents,
      in_man_only: input.mandatObligatoire,
      RECHs_matched: input.rechercheIds,
      RECHERCHEs_FINAL: input.rechercheIds,
      CONTACTs: input.contactIds,
      mails: input.emails,
      tels: input.telephones,
      mails_count: input.emails.length,
      tels_count: input.telephones.length,
      contacts_count: input.contactIds.length,
      recherches_count: input.rechercheIds.length,
      rechs_matched_nb: input.rechercheIds.length,
      locked: false,
      date_start: now,
      date_end: now,
      "Created By": input.agentId ?? null,
      "Created Date": now,
      "Modified Date": now,
    },
  });
  revalidatePath(`/bien/${input.immeubleId}`);
  return id;
}

/** Fige la sélection d'un matching (acquéreurs ajoutés / retirés à la main). */
export async function setMatchSelection(immeubleId: string, matchId: string, rechercheIds: string[]) {
  await rpc("bo_patch_doc", {
    p_table: "bo_match",
    p_id: matchId,
    p_patch: {
      RECHERCHEs_FINAL: rechercheIds,
      recherches_count: rechercheIds.length,
      "Modified Date": new Date().toISOString(),
    },
  });
  revalidatePath(`/bien/${immeubleId}`);
}

export type CommercialisationInput = {
  immeubleId: string;
  agentId?: string;
  matchId: string;
  dossierId?: string;
  mandatId?: string;
  lienPartage?: string;
  objet: string;
  message: string;
  smsTexte?: string;
  /** Acquéreurs ciblés : une proposition sera créée pour chacun. */
  cibles: { rechercheId: string; contactId?: string; email?: string; telephone?: string }[];
};

/** Crée la commercialisation et une proposition par acquéreur ciblé.
 *  Rien n'est envoyé : le BO prépare, l'agent envoie (doctrine §7.1). */
export async function createCommercialisation(input: CommercialisationInput) {
  if (input.cibles.length === 0) throw new Error("Aucun acquéreur ciblé");
  const now = new Date().toISOString();
  const commId = newId();

  const propositions = input.cibles.map((c) => ({
    id: newId(),
    doc: {
      IMMEUBLE: input.immeubleId,
      COMMERCIALISATION: commId,
      DOSSIER: input.dossierId ?? null,
      ACHETEUR: c.contactId ?? null,
      RECHERCHEs: [c.rechercheId],
      AGENTs: input.agentId ? [input.agentId] : [],
      Statut: "Envoyée",
      Source_proposition: "Commercialisation",
      date_envoi: now,
      date_modif: now,
      mail_adresse: c.email ?? null,
      mail_subject: input.objet,
      mail_text: input.message,
      portable: c.telephone ?? null,
      stop_relances_yn: false,
      "Created By": input.agentId ?? null,
      "Created Date": now,
      "Modified Date": now,
    },
  }));

  await rpc("bo_insert_doc", {
    p_table: "bo_commercialisation",
    p_id: commId,
    p_doc: {
      IMMEUBLE: input.immeubleId,
      MATCH: input.matchId,
      DOSSIER: input.dossierId ?? null,
      MANDAT: input.mandatId ?? null,
      AGENT: input.agentId ?? null,
      wetransfer_link: input.lienPartage ?? null,
      prop_mail_objet: input.objet,
      prop_mail_text: input.message,
      prop_sms_text: input.smsTexte ?? null,
      prop_date: now,
      prop_sent: false,
      prop_sms_sent: false,
      ok_acheteurs: true,
      diffusion_offmarket: true,
      PROPOSITIONs: propositions.map((p) => p.id),
      "Created By": input.agentId ?? null,
      "Created Date": now,
      "Modified Date": now,
    },
  });

  // Insertions en série : le RPC prend un document à la fois.
  for (const p of propositions) {
    await rpc("bo_insert_doc", { p_table: "bo_proposition", p_id: p.id, p_doc: p.doc });
  }

  // Chaque recherche mémorise l'immeuble proposé : il sortira des prochains
  // matchings tant que « déjà vus exclus » est actif.
  for (const c of input.cibles) {
    await rpc("bo_append_ref", {
      p_table: "bo_recherche",
      p_id: c.rechercheId,
      p_key: "IMMEUBLEs_proposed",
      p_value: input.immeubleId,
    }).catch(() => undefined);
  }

  revalidatePath(`/bien/${input.immeubleId}`);
  revalidatePath("/propositions");
  return { commercialisationId: commId, propositions: propositions.length };
}

/** Marque les e-mails ou les SMS d'une commercialisation comme envoyés. */
export async function markCommercialisationSent(
  immeubleId: string,
  commId: string,
  canal: "mail" | "sms",
) {
  await rpc("bo_patch_doc", {
    p_table: "bo_commercialisation",
    p_id: commId,
    p_patch: {
      [canal === "mail" ? "prop_sent" : "prop_sms_sent"]: true,
      "Modified Date": new Date().toISOString(),
    },
  });
  revalidatePath(`/bien/${immeubleId}`);
}

/** Relance, refus motivé ou réactivation d'une proposition. */
export async function setPropositionStatut(
  immeubleId: string,
  propositionId: string,
  action: "relancer" | "refuser" | "reactiver",
  motif?: string,
) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> =
    action === "relancer"
      ? { date_last_relance: now, Statut: "Envoyée" }
      : action === "refuser"
        ? { Statut: "Refusée (sans offre)", motif_refus: motif ?? null, date_fin: now, stop_relances_yn: true }
        : { Statut: "Envoyée", motif_refus: null, date_fin: null, stop_relances_yn: false };
  await rpc("bo_patch_doc", {
    p_table: "bo_proposition",
    p_id: propositionId,
    p_patch: { ...patch, date_modif: now, "Modified Date": now },
  });
  revalidatePath(`/bien/${immeubleId}`);
  revalidatePath("/propositions");
}

/** La note de suivi qu'on écrit sous une proposition, depuis la fiche contact
 *  (retour #119). Le BO la propose en saisie directe sur la carte. */
export async function noterProposition(propositionId: string, contactId: string, texte: string) {
  const now = new Date().toISOString();
  await rpc("bo_patch_doc", {
    p_table: "bo_proposition",
    p_id: propositionId,
    p_patch: { commentaire: texte.trim() || null, date_modif: now, "Modified Date": now },
  });
  revalidatePath(`/contact/${contactId}`);
  revalidatePath("/propositions");
}

/** Charge le vivier acquéreurs à la demande : 1 900 recherches et leurs
 *  contacts n'ont pas à être chargés à l'ouverture de chaque fiche. */
export async function chargerAcheteurs(immeubleId: string) {
  const { getAcheteurs } = await import("@/lib/bubble/server");
  return getAcheteurs(immeubleId);
}

/** Enregistre l'adresse d'un immeuble : champs de la fiche + enregistrement
 *  « adresse » géocodé (cartes, POI, stats de commune) — retour #60. */
export async function saveAdresse(
  immeubleId: string,
  a: { numero?: string; rue?: string; cp?: string; ville?: string; lat?: number; lon?: number; label: string },
) {
  const now = new Date().toISOString();
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: cleanPatch({
      adresse_numero_rue: a.numero,
      adresse_rue: a.rue,
      adresse_zipcode: a.cp,
      adresse_ville: a.ville,
    }),
  });

  // L'enregistrement « adresse » porte le géocodage : les cartes et
  // l'enrichissement (INSEE, POI, zone tendue) le lisent.
  const doc = cleanPatch({
    IMMEUBLE: immeubleId,
    numero_rue: a.numero,
    rue: a.rue,
    zipcode: a.cp,
    ville_name: a.ville,
    ville_name_low_no_accent: a.ville?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    formatted: a.label,
    searchfield: a.label.toLowerCase(),
    geo: a.lat !== undefined && a.lon !== undefined ? { lat: a.lat, lng: a.lon, address: a.label } : undefined,
    complete: true,
    "Modified Date": now,
  });

  // Une adresse existe déjà ? On la met à jour, sinon on la crée et on la
  // référence sur l'immeuble.
  const res = await fetch(
    `${SB_URL}/rest/v1/bo_adresse?data->>IMMEUBLE=eq.${immeubleId}&select=id&limit=1`,
    { headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY!}` }, cache: "no-store" },
  );
  const rows = res.ok ? ((await res.json()) as { id: string }[]) : [];
  if (rows[0]) {
    await rpc("bo_patch_doc", { p_table: "bo_adresse", p_id: rows[0].id, p_patch: doc });
  } else {
    const adrId = newId();
    await rpc("bo_insert_doc", {
      p_table: "bo_adresse",
      p_id: adrId,
      p_doc: { ...doc, "Created Date": now },
    });
    await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: { ADRESSE: adrId } });
  }
  refresh(immeubleId);
}

/** Met à jour une ligne de travaux (montant, description…) et recalcule le
 *  total de l'immeuble — l'autre côté (tableau des lots) suit (retour #61). */
export async function updateTravaux(
  immeubleId: string,
  travauxId: string,
  patch: Partial<{
    description: string; commentaire: string; montant: number; Urgence: string;
    YN_devis: boolean; LOTs: string[]; COMPOSANTs: string[];
  }>,
) {
  // Les listes vides sont légitimes ici (on retire le dernier lot) : elles ne
  // passent donc pas par le filtre habituel, qui les garderait telles quelles.
  const clean = cleanPatch(patch as Record<string, unknown>);
  if (Array.isArray(patch.LOTs)) clean.LOTs = patch.LOTs;
  if (Array.isArray(patch.COMPOSANTs)) clean.COMPOSANTs = patch.COMPOSANTs;
  if (typeof patch.YN_devis === "boolean") clean.YN_devis = patch.YN_devis;
  if (Object.keys(clean).length === 0) return;
  clean["Modified Date"] = new Date().toISOString();
  await rpc("bo_patch_doc", { p_table: "bo_travaux", p_id: travauxId, p_patch: clean });
  await rpc("bo_recompute_travaux", { p_id: immeubleId });
  refresh(immeubleId);
}

/** Joint un fichier à des travaux (un devis, le plus souvent). */
export async function joindreDevis(immeubleId: string, travauxId: string, fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Aucun fichier");
  if (file.size > 25 * 1024 * 1024) throw new Error("Fichier trop lourd (25 Mo max)");
  const path = `documents/${immeubleId}/travaux-${travauxId}-${Date.now()}-${safeName(file.name)}`;
  await uploadToBucket(path, file);
  const doc = await bqOne("bo_travaux", travauxId);
  const fichiers = Array.isArray(doc?.FILEs) ? (doc.FILEs as string[]) : [];
  await rpc("bo_patch_doc", {
    p_table: "bo_travaux",
    p_id: travauxId,
    p_patch: { FILEs: [...fichiers, `storage:${path}`], YN_devis: true, "Modified Date": new Date().toISOString() },
  });
  refresh(immeubleId);
  return `/api/photo?s=${encodeURIComponent(path)}`;
}

/** Saisie des travaux depuis la cellule du tableau des lots (retour #61) :
 *  la ligne dédiée au lot est créée, ajustée ou supprimée pour que le total
 *  du lot colle à la saisie — les lignes multi-lots ne sont pas touchées. */
export async function setLotTravaux(
  immeubleId: string,
  lotId: string,
  lotLabel: string,
  montantCible: number,
  dedieeId: string | null,
  montantAutres: number,
) {
  const montantDediee = Math.max(0, montantCible - montantAutres);
  if (dedieeId) {
    if (montantDediee <= 0) {
      await rpc("bo_delete_doc", { p_table: "bo_travaux", p_id: dedieeId });
    } else {
      await rpc("bo_patch_doc", {
        p_table: "bo_travaux",
        p_id: dedieeId,
        p_patch: { montant: montantDediee, "Modified Date": new Date().toISOString() },
      });
    }
  } else if (montantDediee > 0) {
    const now = new Date().toISOString();
    await rpc("bo_insert_doc", {
      p_table: "bo_travaux",
      p_id: newId(),
      p_doc: {
        IMMEUBLE: immeubleId,
        LOTs: [lotId],
        description: `Travaux ${lotLabel}`,
        montant: montantDediee,
        YN_devis: false,
        "Created Date": now,
        "Modified Date": now,
      },
    });
  }
  await rpc("bo_recompute_travaux", { p_id: immeubleId });
  refresh(immeubleId);
}

/* ---------- Module Mails (livraison 1) ---------- */

/**
 * « Noter le retour » : la carte dorée du fil.
 *
 * Écrit une ligne de suivi sur l'immeuble, la relie au mail (la clé `MAIL` de
 * `bo_suivi` existe depuis Bubble, on ne fait que la renseigner enfin) et
 * consigne le retour sur l'estimation. Un seul geste, trois écritures.
 */
export async function noterRetourMail(input: {
  mailId: string;
  immeubleId?: string;
  contactId?: string;
  estimationId?: string;
  retour: string;
}) {
  if (!input.immeubleId) throw new Error("Ce message n'est rattaché à aucun immeuble");
  const now = new Date().toISOString();
  const suiviId = newId();

  await rpc("bo_insert_doc", {
    p_table: "bo_suivi",
    p_id: suiviId,
    p_doc: cleanPatch({
      Type: "Retour e-mail",
      CONTACT: input.contactId,
      IMMEUBLEs: [input.immeubleId],
      MAIL: input.mailId,
      Canals: ["Email"],
      notes: input.retour,
      date_start: now,
      Statut: "Traité",
      "Created Date": now,
      "Modified Date": now,
    }),
  });

  // Le mail garde la trace du suivi qu'il a produit : c'est ce qui évite de
  // reproposer la carte au prochain affichage du fil.
  await rpc("bo_patch_doc", {
    p_table: "bo_mail",
    p_id: input.mailId,
    p_patch: { SUIVI: suiviId, retour_note: input.retour, "Modified Date": now },
  });

  if (input.estimationId) {
    await rpc("bo_patch_doc", {
      p_table: "bo_estimation",
      p_id: input.estimationId,
      p_patch: { retour_vendeur: input.retour, retour_at: now, "Modified Date": now },
    });
  }

  refresh(input.immeubleId);
  revalidatePath("/mails");
  return suiviId;
}

/* ---------- Découpe : la couche opération (option A, ce back-office) ---------- */

/**
 * Ouvre une opération de découpe sur un immeuble — le bouton « Passer en
 * découpe » de la fiche.
 *
 * L'immeuble ne bouge pas : ni son statut de vente, ni ses lots, ni ses
 * photos. On pose une couche au-dessus, et la fiche gagne une section. Un
 * immeuble peut donc être en découpe ET suivi en vente en bloc — c'est
 * précisément ce qui permet de comparer les deux valeurs.
 */
export async function ouvrirOperation(immeubleId: string, valeurBloc?: number) {
  const existante = await operationDe(immeubleId);
  if (existante) return String(existante._id);

  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_operation",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      statut: "Prospection",
      phase: 1,
      valeur_bloc: valeurBloc,
      ouverte_le: now,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  refresh(immeubleId);
  revalidatePath("/decoupe");
  return id;
}

/** Relit l'opération d'un immeuble (il y en a au plus une — index unique). */
async function operationDe(immeubleId: string): Promise<Record<string, unknown> | null> {
  if (!SB_KEY) return null;
  const res = await fetch(
    `${SB_URL}/rest/v1/bo_operation?data->>IMMEUBLE=eq.${encodeURIComponent(immeubleId)}&select=data&limit=1`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as { data: Record<string, unknown> }[];
  return rows[0]?.data ?? null;
}

/** Met à jour l'opération : phase franchie, statut, valeurs, notes. */
export async function majOperation(
  immeubleId: string,
  operationId: string,
  patch: {
    phase?: number;
    statut?: string;
    valeur_bloc?: number;
    valeur_decoupe?: number;
    notes?: string;
  },
) {
  const now = new Date().toISOString();
  await rpc("bo_patch_doc", {
    p_table: "bo_operation",
    p_id: operationId,
    p_patch: { ...cleanPatch(patch as Record<string, unknown>), "Modified Date": now },
  });
  refresh(immeubleId);
  revalidatePath("/decoupe");
}

/** Referme l'opération. La ligne reste : c'est l'historique de l'affaire. */
export async function cloturerOperation(immeubleId: string, operationId: string) {
  const now = new Date().toISOString();
  await rpc("bo_patch_doc", {
    p_table: "bo_operation",
    p_id: operationId,
    p_patch: { statut: "Clôturée", fermee_le: now, "Modified Date": now },
  });
  refresh(immeubleId);
  revalidatePath("/decoupe");
}

/* ---------- Questions reçues depuis le site (retour #118) ---------- */

/** Clôture une question, avec la remarque qui explique ce qui a été fait. */
export async function cloturerQuestion(questionId: string, remarques: string, agentId?: string) {
  await rpc("bo_patch_doc", {
    p_table: "bo_question",
    p_id: questionId,
    p_patch: {
      ended: true,
      date_cloture: new Date().toISOString(),
      remarques_cloture: remarques || null,
      ...(agentId ? { CLOTUROR: agentId } : {}),
    },
  });
  revalidatePath("/questions");
}

/** Rouvre une question clôturée par erreur. */
export async function rouvrirQuestion(questionId: string) {
  await rpc("bo_patch_doc", {
    p_table: "bo_question",
    p_id: questionId,
    p_patch: { ended: false, date_cloture: null },
  });
  revalidatePath("/questions");
}

/**
 * Crée le contact d'une question et l'y rattache.
 *
 * La question devient alors un suivi dans la fiche du contact : c'est ce que
 * MAV demande — une demande venue du site ne doit pas rester dans un coin,
 * elle rejoint l'historique de la personne. La question est rattachée mais
 * PAS clôturée : créer la fiche n'est pas répondre.
 */
export async function creerContactDepuisQuestion(input: {
  questionId: string;
  agentId: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  message?: string;
}) {
  const contactId = await createContact({
    nom: input.nom,
    "prénom": input.prenom,
    email: input.email,
    portable: input.telephone,
    Source: "Site - Question",
    agentId: input.agentId,
  } as ContactPatch & { agentId?: string });

  await rpc("bo_patch_doc", {
    p_table: "bo_question",
    p_id: input.questionId,
    p_patch: { CONTACT: contactId },
  });

  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_suivi",
    p_id: newId(),
    p_doc: {
      Type: "Question",
      AGENT: input.agentId,
      CONTACT: contactId,
      IMMEUBLEs: [],
      Canals: ["Formulaire"],
      notes: input.message ?? "",
      date_start: now,
      "Created Date": now,
      "Modified Date": now,
      Statut: "Traité",
    },
  });

  revalidatePath("/questions");
  revalidatePath(`/contact/${contactId}`);
  return contactId;
}
