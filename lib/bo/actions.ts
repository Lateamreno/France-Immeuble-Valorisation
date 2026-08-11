"use server";

// Écritures du BO — uniquement vers Supabase (bo_*), jamais vers Bubble.
// Passent par les RPC bo_insert_doc / bo_patch_doc (service_role).
import { revalidatePath } from "next/cache";

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
}

const newId = () =>
  `app_${Date.now()}x${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;

function refresh(immeubleId?: string) {
  revalidatePath("/", "layout");
  if (immeubleId) revalidatePath(`/bien/${immeubleId}`);
}

/** Ajoute un suivi (réplique de la modale du BO), option mise en attente. */
export async function addSuivi(input: {
  immeubleId: string;
  agentId: string;
  contactId?: string;
  canal: "Téléphone" | "Message téléphonique" | "SMS" | "E-mail";
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
      Canals: [input.canal],
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
  if (input.standby) {
    await rpc("bo_patch_doc", {
      p_table: "bo_immeuble",
      p_id: input.immeubleId,
      p_patch: { standby_Statut: "En attente" },
    });
  }
  refresh(input.immeubleId);
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
}>;

/** Met à jour les données d'emplacement / PLU de l'immeuble. */
export async function updateEmplacement(immeubleId: string, patch: EmplacementPatch) {
  const clean = cleanPatch(patch as Record<string, unknown>);
  if (Object.keys(clean).length === 0) return;
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: clean });
  refresh(immeubleId);
}

/** Ajoute une parcelle cadastrale (liée via le tableau PARCELLEs de l'immeuble). */
export async function addParcelle(
  immeubleId: string,
  input: { ref_cadastre: string; superficie?: number; facade?: number },
) {
  const id = newId();
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_parcelle",
    p_id: id,
    p_doc: cleanPatch({ ...input, "Created Date": now, "Modified Date": now }),
  });
  await rpc("bo_append_ref", { p_table: "bo_immeuble", p_id: immeubleId, p_key: "PARCELLEs", p_value: id });
  refresh(immeubleId);
}

/** Retire une parcelle (corbeille + retrait du tableau PARCELLEs). */
export async function deleteParcelle(immeubleId: string, parcelleId: string) {
  await rpc("bo_delete_doc", { p_table: "bo_parcelle", p_id: parcelleId });
  await rpc("bo_remove_ref", { p_table: "bo_immeuble", p_id: immeubleId, p_key: "PARCELLEs", p_value: parcelleId });
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
  };
  emp: { gare_name?: string; gare_time?: number; com_name?: string; com_time?: number };
  charges: { tf_non_recup?: number; autres_non_recup?: number };
  travaux: { bati?: number; lots?: number };
  // Secteur retenu
  ref: { loyer?: number; prix?: number; renta?: number };
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

  await rpc("bo_insert_doc", {
    p_table: "bo_estimation",
    p_id: estId,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
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
  // Prix : recalcul HAI si net vendeur + taux fournis.
  if (typeof clean.prix_nv === "number") {
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
  refresh(immeubleId);
  revalidatePath(`/mandat/${mandatId}`);
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

/** Met à jour des champs simples du bien (descriptif, prix…). */
export async function updateBien(
  immeubleId: string,
  patch: Partial<{
    descriptif: string;
    prix_nv: number;
    prix_honos_ttc: number;
    prix_hai: number;
    Motif_vente: string;
  }>,
) {
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  if (Object.keys(clean).length === 0) return;
  if (typeof clean.prix_nv === "number" && typeof clean.prix_honos_ttc === "number") {
    clean.prix_hai = clean.prix_nv + clean.prix_honos_ttc;
  }
  await rpc("bo_patch_doc", { p_table: "bo_immeuble", p_id: immeubleId, p_patch: clean });
  refresh(immeubleId);
}
