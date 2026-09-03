"use server";

// Écritures du BO — uniquement vers Supabase (bo_*), jamais vers Bubble.
// Passent par les RPC bo_insert_doc / bo_patch_doc (service_role).
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { ecrireExclusions, lireExclusions } from "@/lib/bo/exclusions";
import { after } from "next/server";
import {
  filtreMots, getAgentFiche, getBien, getEstimation, getPrixSecteur, motsRecherche,
} from "@/lib/bubble/server";
import { lireEstimation, type EstimationLecture } from "@/lib/bo/estimation-lecture";
import { netVendeurDepuisHai } from "@/lib/bareme";
import { greffeDe } from "@/lib/bo/greffes";

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

/**
 * Change le propriétaire d'un immeuble (retour #288).
 *
 * MAV : « il faudrait un bouton pour changer le propriétaire d'un immeuble.
 * Peut-être qu'on pourrait mettre une modale pour dire pourquoi (immeuble vendu
 * à, donc ça nous fait un historique) […] Je te demande ce bouton car quand
 * j'ai changé le client dans le mandat, donc le mandant, le propriétaire n'a
 * pas changé ici, ce qui aurait pourtant dû être fait. »
 *
 * Deux choses en une, et les deux comptent :
 *
 * — **Le lien change des deux côtés.** L'immeuble pointe vers son nouveau
 *   propriétaire, ET la fiche du nouveau propriétaire liste l'immeuble. Ne
 *   faire que la première moitié laisserait l'onglet « Immeubles » du client
 *   vide alors qu'il en possède un : c'est ce genre d'écart qui fait qu'on
 *   rappelle l'ancien vendeur.
 * — **Le changement laisse une trace.** Un immeuble qui change de mains sans
 *   rien dire efface une vente. Le suivi horodaté garde qui possédait quoi,
 *   quand, et pourquoi ça a bougé — c'est l'historique que MAV demande.
 *
 * L'ancien propriétaire n'est PAS délié de sa fiche : il a réellement possédé
 * ce bien, et c'est cette histoire-là qui vaut au fichier. Seul le lien
 * « propriétaire actuel » se déplace.
 */
export async function changerProprietaire(input: {
  immeubleId: string;
  nouveauId: string;
  /** Le nom, pour l'écrire en toutes lettres dans le suivi. */
  nouveauNom: string;
  ancienId?: string | null;
  ancienNom?: string;
  motif: string;
  agentId?: string;
}) {
  const now = new Date().toISOString();
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: input.immeubleId,
    p_patch: { PROPRIETAIRE: input.nouveauId, "Modified Date": now },
  });
  /* Piège de casse hérité de Bubble, et il coûte cher (retour #307) : sur un
     CONTACT la liste s'appelle `IMMEUBLES` en capitales, alors que sur un
     mandat, un suivi ou une offre elle s'écrit `IMMEUBLEs`. Écrire la seconde
     graphie sur un contact crée un champ parallèle que rien ne lit : la fiche
     annonçait « 0 immeuble » pour un propriétaire qui en avait un, et sa
     vignette au mandat aussi. */
  await rpc("bo_append_ref", {
    p_table: "bo_contact",
    p_id: input.nouveauId,
    p_key: "IMMEUBLES",
    p_value: input.immeubleId,
  });
  const depuis = input.ancienNom?.trim() ? ` (auparavant ${input.ancienNom.trim()})` : "";
  await rpc("bo_insert_doc", {
    p_table: "bo_suivi",
    p_id: newId(),
    p_doc: {
      Type: "Manuel",
      AGENT: input.agentId ?? null,
      CONTACT: input.nouveauId,
      IMMEUBLEs: [input.immeubleId],
      Canals: [],
      notes: `Changement de propriétaire — ${input.motif} : ${input.nouveauNom}${depuis}.`,
      date_start: now,
      "Created Date": now,
      "Modified Date": now,
      Statut: "Traité",
    },
  });
  refresh(input.immeubleId);
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

/**
 * Met un dossier en attente « peu important » (retours #139 et #141).
 *
 * MAV : « une option dans les "…" c'est passer en attente car peu important,
 * et du coup ils sont dans le "en attente" et ils sortent du "en cours" ». Ce
 * n'est pas un archivage — le dossier n'est pas mort, il est repoussé. D'où la
 * date de déblocage, qui est la seule chose qui distingue les deux.
 *
 * L'e-mail au propriétaire est facultatif et n'est jamais envoyé d'ici :
 * l'écran prépare, l'agent envoie (doctrine d'envoi du BO).
 */
export async function mettreEnAttente(input: {
  immeubleId: string;
  agentId: string;
  motif: string;
  /** Date de déblocage, ou rien pour « indéfiniment ». */
  dateRelance?: string;
}) {
  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_suivi",
    p_id: newId(),
    p_doc: cleanPatch({
      Type: "Manuel",
      AGENT: input.agentId,
      IMMEUBLEs: [input.immeubleId],
      notes: input.dateRelance
        ? `Mis en attente : ${input.motif} — à revoir le ${input.dateRelance.split("-").reverse().join("/")}`
        : `Mis en attente : ${input.motif}`,
      date_start: now,
      "Created Date": now,
      "Modified Date": now,
      Statut: "En attente",
      Motif_standby: input.motif,
      date_relance: input.dateRelance ? new Date(input.dateRelance).toISOString() : undefined,
    }),
  });
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: input.immeubleId,
    p_patch: cleanPatch({
      standby_Statut: "En attente",
      Motif_standby: input.motif,
      date_relance: input.dateRelance ? new Date(input.dateRelance).toISOString() : undefined,
      "Modified Date": now,
    }),
  });
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

/* `null` vide le champ, `undefined` le laisse tel quel : c'est la distinction
   qui permet d'effacer une case (retour #255). Voir `cleanPatch`. */
export type LotPatch = Partial<{
  batiment: string | null;
  etage: string | number | null;
  numero: number | null;
  Destination: string | null;
  Type_lot: string | null;
  surface_carrez: number | null;
  surface_sol: number | null;
  Type_bail: string | null;
  /** #171 — le lot auquel celui-ci est loué, sous un loyer global unique.
   *  `null` le détache : c'est ce qu'on envoie dès que le bail change. */
  lot_rattache: string | null;
  loyer: number | null;
  loyer_max: number | null;
  Etat: string | null;
  Type_dpe: string | null;
  renov_year: number | null;
  commentaire: string | null;
  /** Rang d'affichage du tableau des lots (#82). */
  ordre: number;
}>;

/* `undefined` et la chaîne vide veulent dire « je n'ai rien à dire sur ce
   champ » : on ne les envoie pas. `null` veut dire « efface-le » et passe :
   `bo_patch_doc` concatène le patch au document, une valeur nulle y écrase
   donc l'ancienne. Sans cette nuance, aucune case ne pouvait être vidée. */
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
    Type_bail?: string | null;
    /* Retour #260 : « dans les conditions du bail on n'a pas besoin de savoir
       si le bailleur est personne morale ». Le champ reste accepté pour les
       baux déjà en base, il n'est plus demandé nulle part. */
    bailleur_pm?: boolean;
    loyer_init?: number | null;
    /** Dépôt de garantie (retour #260). */
    depot_garantie?: number | null;
    date_start?: string | null; // yyyy-mm-dd
    date_end?: string | null;
    /** IRL, ILAT, ILC ou ICC — l'indice qui régit la révision (retour #260). */
    indice_type?: string | null;
    indice_init?: number | null;
    indice_actuel?: number | null;
    statut: "en_cours" | "impayes" | "preavis" | "expulsion";
    commentaire?: string | null;
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
      depot_garantie: input.depot_garantie,
      indice_type: input.indice_type,
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

/**
 * Le bail d'un lot, créé s'il n'existe pas encore (retours #258, #260).
 *
 * MAV : « chaque bail devrait être créé automatiquement ici, au moins la
 * ligne, et du coup pas besoin de sélectionner le lot ». Un lot loué A un
 * bail : le faire créer à la main, en le rattachant à son lot dans une
 * seconde fenêtre, c'est demander deux fois la même information. L'écran
 * montre donc une ligne par lot, et c'est la première saisie qui la fait
 * exister en base.
 */
export async function bailDuLot(
  immeubleId: string,
  lotId: string,
  patch: BailPatch,
): Promise<string> {
  const p = new URLSearchParams({ select: "data", limit: "1" });
  p.append("data->>IMMEUBLE", `eq.${immeubleId}`);
  p.append("data->LOTs", `cs.["${lotId}"]`);
  const res = SB_KEY
    ? await fetch(`${SB_URL}/rest/v1/bo_bail?${p}`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        cache: "no-store",
      }).catch(() => null)
    : null;
  const rows = res?.ok ? ((await res.json()) as { data: Record<string, unknown> }[]) : [];
  const existant = rows[0]?.data?._id;
  if (existant) {
    await updateBail(immeubleId, String(existant), patch);
    return String(existant);
  }
  return addBail(immeubleId, {
    lotIds: [lotId], locataireIds: [], statut: "en_cours", ...patch,
  });
}

/** Ce qui se modifie sur un bail. `null` vide la case (voir `cleanPatch`). */
export type BailPatch = Partial<{
  Type_bail: string | null;
  loyer_init: number | null;
  depot_garantie: number | null;
  date_start: string | null;
  date_end: string | null;
  indice_type: string | null;
  indice_init: number | null;
  indice_actuel: number | null;
  statut: "en_cours" | "impayes" | "preavis" | "expulsion";
  commentaire: string | null;
}>;

/** Modifie un bail existant. */
export async function updateBail(immeubleId: string, bailId: string, patch: BailPatch) {
  const { statut, date_start, date_end, ...reste } = patch;
  const clean = cleanPatch({
    ...reste,
    date_start: date_start === null ? null : date_start ? new Date(date_start).toISOString() : undefined,
    date_end: date_end === null ? null : date_end ? new Date(date_end).toISOString() : undefined,
    ...(statut
      ? {
          activ: true,
          impayes: statut === "impayes",
          preavis: statut === "preavis",
          expulsion: statut === "expulsion",
        }
      : null),
    "Modified Date": new Date().toISOString(),
  });
  /* Le loyer révisé se déduit du loyer initial et des deux valeurs d'indice :
     le laisser saisir à part, c'est laisser entrer une incohérence. On le
     recalcule dès que l'un des trois bouge. */
  if (patch.loyer_init !== undefined || patch.indice_init !== undefined || patch.indice_actuel !== undefined) {
    const avant = await bqOne("bo_bail", bailId).catch(() => null);
    const n = (v: unknown) => (typeof v === "number" ? v : undefined);
    const l = patch.loyer_init ?? n(avant?.loyer_init);
    const i0 = patch.indice_init ?? n(avant?.indice_init);
    const i1 = patch.indice_actuel ?? n(avant?.indice_actuel);
    clean.loyer_revised = l && i0 && i1 && i0 > 0 ? Math.round((l * i1) / i0) : null;
  }
  await rpc("bo_patch_doc", { p_table: "bo_bail", p_id: bailId, p_patch: clean });
  refresh(immeubleId);
}

/** Supprime un bail (récupérable dans bo_trash). */
export async function deleteBail(immeubleId: string, bailId: string) {
  await rpc("bo_delete_doc", { p_table: "bo_bail", p_id: bailId });
  refresh(immeubleId);
}

/** Le profil que porte un locataire dans la base contacts (`Types`). */
const PROFIL_LOCATAIRE = "Locataire";

/** Ce qu'on sait d'un locataire quand vient le moment d'en faire un contact. */
type IdentiteLocataire = {
  pm?: boolean; pm_nom?: string | null;
  pp_civilite?: string | null; pp_prenom?: string | null; pp_nom?: string | null;
  phone?: string | null; email?: string | null;
};

/**
 * La fiche contact d'un locataire, dès qu'on connaît son e-mail.
 *
 * MAV : « quand on remplit les infos e-mail, téléphone, etc., ça les crée en
 * contact après, mais tant que ces infos sont pas remplies alors c'est pas
 * besoin » ; puis « il faut que quand on rentre au moins l'e-mail, ça crée le
 * contact avec la fonction locataire ».
 *
 * L'e-mail est le seuil, et pas le nom : un nom seul ne permet ni d'écrire, ni
 * de rapprocher deux fiches, ni de rattacher un message reçu. Une adresse, si.
 * C'est aussi elle qui sert de clé de rapprochement — un locataire déjà connu
 * comme apporteur ou comme acquéreur ne doit pas se dédoubler (retour #248),
 * il gagne simplement le profil « Locataire » en plus des siens.
 *
 * Sur un contact qui existe déjà, on ne COMPLÈTE que les cases vides. Un
 * locataire est une source d'information faible : son nom saisi à la volée dans
 * l'état locatif n'a aucune raison d'écraser une fiche renseignée à la main.
 *
 * RGPD (§8.3) : la fiche reste interne au BO. Rien de ce qui est écrit ici ne
 * franchit l'API publique marketplace, où le locataire reste anonyme.
 */
async function contactDuLocataire(x: IdentiteLocataire): Promise<string | null> {
  const email = (x.email ?? "").trim();
  if (!email.includes("@") || !SB_KEY) return null;

  const civilite = x.pm ? undefined : (x.pp_civilite ?? undefined) || undefined;
  const prenom = x.pm ? undefined : (x.pp_prenom ?? undefined) || undefined;
  const nom = x.pm ? (x.pm_nom ?? undefined) || undefined : (x.pp_nom ?? undefined) || undefined;
  const phone = (x.phone ?? undefined) || undefined;
  const now = new Date().toISOString();

  const p = new URLSearchParams({ select: "data", limit: "1" });
  p.append("data->>email", `ilike.${email.toLowerCase()}`);
  const res = await fetch(`${SB_URL}/rest/v1/bo_contact?${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  const dejaLa = res?.ok ? ((await res.json()) as { data: Record<string, unknown> }[])[0]?.data : undefined;

  if (dejaLa) {
    const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const types = Array.isArray(dejaLa.Types) ? dejaLa.Types.map(String) : [];
    const patch: Record<string, unknown> = {};
    if (!types.includes(PROFIL_LOCATAIRE)) patch.Types = [...types, PROFIL_LOCATAIRE];
    const combler = (cle: string, v?: string) => { if (v && !texte(dejaLa[cle])) patch[cle] = v; };
    combler("Civilité", civilite);
    combler("prénom", prenom);
    combler("nom", nom);
    combler("portable", phone);
    if (x.pm) combler("entreprise_nom", nom);
    if (Object.keys(patch).length === 0) return String(dejaLa._id);
    patch["Modified Date"] = now;
    await rpc("bo_patch_doc", { p_table: "bo_contact", p_id: String(dejaLa._id), p_patch: patch });
    revalidatePath("/contacts");
    revalidatePath(`/contact/${String(dejaLa._id)}`);
    return String(dejaLa._id);
  }

  const id = newId();
  await rpc("bo_insert_doc", {
    p_table: "bo_contact",
    p_id: id,
    p_doc: cleanPatch({
      "Civilité": civilite,
      "prénom": prenom,
      nom,
      entreprise_nom: x.pm ? nom : undefined,
      email,
      portable: phone,
      Types: [PROFIL_LOCATAIRE],
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  revalidatePath("/contacts");
  return id;
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
  await contactDuLocataire(input);
  refresh(immeubleId);
  return id;
}

/** Ce qui se modifie sur un locataire. */
export type LocatairePatch = Partial<{
  pm: boolean;
  pm_nom: string | null;
  pp_civilite: string | null;
  pp_prenom: string | null;
  pp_nom: string | null;
  phone: string | null;
  email: string | null;
  lotIds: string[];
  commentaire: string | null;
}>;

/** Modifie un locataire existant (retour #259 : la saisie se fait au tableau). */
export async function updateLocataire(
  immeubleId: string,
  locataireId: string,
  patch: LocatairePatch,
) {
  const avant = await bqOne("bo_locataire", locataireId).catch(() => null);
  const S2 = (v: unknown) => (typeof v === "string" ? v : undefined);
  const pm = patch.pm ?? avant?.pm === true;
  const nom = patch.pm_nom !== undefined ? patch.pm_nom : S2(avant?.pm_nom);
  const prenom = patch.pp_prenom !== undefined ? patch.pp_prenom : S2(avant?.["pp_prénom"]);
  const famille = patch.pp_nom !== undefined ? patch.pp_nom : S2(avant?.pp_nom);
  const clean = cleanPatch({
    pm: patch.pm,
    pm_nom: patch.pm_nom,
    "pp_civilité": patch.pp_civilite,
    "pp_prénom": patch.pp_prenom,
    pp_nom: patch.pp_nom,
    phone: patch.phone,
    email: patch.email,
    LOTs: patch.lotIds,
    commentaire: patch.commentaire,
    /* Le nom affiché se recompose : sans ça, corriger un prénom laissait
       l'ancien nom complet partout où il est repris. */
    formatted_name: pm ? (nom ?? "") : [prenom, famille].filter(Boolean).join(" "),
    "Modified Date": new Date().toISOString(),
  });
  await rpc("bo_patch_doc", { p_table: "bo_locataire", p_id: locataireId, p_patch: clean });
  /* L'e-mail arrive rarement du premier coup : le nom se saisit à la volée
     dans l'état locatif, l'adresse plus tard. La fiche contact se crée donc
     aussi à la modification, pas seulement à la création. */
  await contactDuLocataire({
    pm,
    pm_nom: nom,
    pp_civilite: patch.pp_civilite !== undefined ? patch.pp_civilite : S2(avant?.["pp_civilité"]),
    pp_prenom: prenom,
    pp_nom: famille,
    phone: patch.phone !== undefined ? patch.phone : S2(avant?.phone),
    email: patch.email !== undefined ? patch.email : S2(avant?.email),
  });
  refresh(immeubleId);
}

/**
 * Le locataire d'un lot, créé s'il n'existe pas encore (retours #258, #260).
 *
 * MAV : « quand le locataire est créé depuis l'état locatif directement,
 * sachant que c'est qu'une ligne de texte, alors c'est le nom qui est rempli,
 * et ça sera à l'agent de séparer le nom et le prénom dans la modale ». On ne
 * devine donc pas où couper : le texte saisi va dans le nom de famille, et la
 * fiche du locataire permet de le répartir ensuite.
 */
export async function locataireDuLot(
  immeubleId: string,
  lotId: string,
  nom: string,
): Promise<string | null> {
  const propre = nom.trim();
  const p = new URLSearchParams({ select: "data", limit: "1" });
  p.append("data->>IMMEUBLE", `eq.${immeubleId}`);
  p.append("data->LOTs", `cs.["${lotId}"]`);
  const res = SB_KEY
    ? await fetch(`${SB_URL}/rest/v1/bo_locataire?${p}`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        cache: "no-store",
      }).catch(() => null)
    : null;
  const rows = res?.ok ? ((await res.json()) as { data: Record<string, unknown> }[]) : [];
  const existant = rows[0]?.data?._id;
  if (existant) {
    await updateLocataire(immeubleId, String(existant), { pp_nom: propre || null });
    return String(existant);
  }
  if (!propre) return null;
  return addLocataire(immeubleId, { pm: false, pp_nom: propre, lotIds: [lotId] });
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
/* La nature et le commentaire se modifient depuis la même fenêtre que la
   création (retour #257). `null` vide une case, comme pour les lots (#255) :
   un montant effacé doit disparaître, pas revenir. */
export async function updateCharge(
  immeubleId: string,
  chargeId: string,
  patch: Partial<{
    Type_charge: string;
    type_autre: string | null;
    total_an: number | null;
    recup_an: number | null;
    non_recup_an: number | null;
    commentaire: string | null;
  }>,
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

/* Les `_geo` acceptent `null` — et pas seulement la chaîne vide, que
   `cleanPatch` écarterait. Retaper à la main le nom d'un point d'intérêt rend
   ses coordonnées fausses : il faut pouvoir les effacer, pas seulement les
   laisser tranquilles (retour #186). */
export type EmplacementPatch = Partial<{
  emp_gare_name: string; emp_gare_time: number; emp_gare_moyen: string; emp_gare_geo: string | null;
  emp_bus_name: string; emp_bus_time: number; emp_bus_moyen: string; emp_bus_geo: string | null;
  emp_route_name: string; emp_route_time: number; emp_route_moyen: string; emp_route_geo: string | null;
  emp_school_name: string; emp_school_time: number; emp_school_moyen: string; emp_school_geo: string | null;
  emp_com_name: string; emp_com_time: number; emp_com_moyen: string; emp_com_geo: string | null;
  emp_autre_name: string; emp_autre_time: number; emp_autre_moyen: string; emp_autre_geo: string | null;
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

/**
 * Reporte sur l'immeuble la parcelle et la surface saisies au mandat (#175).
 *
 * MAV : « dans le mandat j'ai donné un numéro de parcelle et une surface,
 * mais je n'ai pas l'impression que cela a rempli ici, ce qui est dommage. »
 * En effet : c'était rangé dans le mandat, et nulle part ailleurs. Une
 * référence cadastrale appartient pourtant à l'immeuble, pas au document.
 *
 * On n'écrase jamais : si la parcelle existe déjà sur la fiche, on la laisse
 * telle quelle — la fiche est la référence, le mandat ne fait que la nourrir
 * quand elle est vide.
 */
export async function reporterCadastre(
  immeubleId: string,
  ref: string,
  surface?: number,
) {
  const propre = ref.trim();
  if (!propre) return;
  const im = await bqOne("bo_immeuble", immeubleId);
  const ids = Array.isArray(im?.PARCELLEs) ? (im!.PARCELLEs as string[]) : [];
  /* Même parcelle écrite de deux façons — « 000 0H 17 » et « H 17 » : on
     compare sans espaces ni zéros de remplissage, comme l'écran Parcelles. */
  const cle = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
  for (const id of ids) {
    const p = await bqOne("bo_parcelle", id);
    if (p && cle(String(p.ref_cadastre ?? "")) === cle(propre)) return;
  }
  await addParcelle(immeubleId, { ref_cadastre: propre, superficie: surface });
}

/**
 * Corrige une parcelle déjà au dossier (retour #295).
 *
 * MAV : « quand je clique sur ajouter les parcelles trouvées, il faut quand
 * même que je puisse ajouter la longueur de façade, si tu ne peux pas trouver
 * l'info toi-même, et que je puisse ajouter aussi d'autres parcelles. »
 *
 * Le cadastre donne la référence et la superficie ; la façade, il ne la donne
 * pas — elle se mesure sur le plan. Une parcelle ajoutée automatiquement
 * n'était plus modifiable qu'en la supprimant pour la resaisir, ce qui faisait
 * perdre la superficie officielle au passage.
 */
export async function updateParcelle(
  immeubleId: string,
  parcelleId: string,
  patch: { ref_cadastre?: string; superficie?: number | null; facade?: number | null },
) {
  await rpc("bo_patch_doc", {
    p_table: "bo_parcelle",
    p_id: parcelleId,
    p_patch: cleanPatch({ ...patch, "Modified Date": new Date().toISOString() }),
  });
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

  /* Le bien rejoint « À transformer » : il est estimé. */
  await avancerApresEnvoi(immeubleId);

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

/**
 * Une estimation partie fait avancer le bien (retour #142).
 *
 * MAV : « l'estimation du bien est envoyée mais le bien est toujours dans la
 * colonne immeubles à estimer, il devrait passer dans à transformer. » Le
 * dashboard lit le `Statut` de l'immeuble : 2 = à estimer, 3 = à transformer.
 * On ne fait avancer que ceux qui sont encore en amont — un bien déjà sous
 * mandat ou vendu ne redescend pas parce qu'on renvoie une estimation.
 */
/**
 * Un bien estimé passe en « À transformer » (3e colonne des prospects).
 *
 * MAV : « quand un bien a été estimé il doit passer dans la troisième colonne
 * prospect de la dashboard, donc automatiquement dans À transformer. »
 *
 * L'avancement se déclenchait seulement à l'ENVOI de l'estimation. Il se
 * déclenche maintenant dès qu'une estimation existe : une estimation faite est
 * une estimation faite, qu'on l'ait envoyée ou gardée pour soi. On n'avance
 * jamais un bien déjà plus loin — un immeuble en commercialisation ne
 * redescend pas chez les prospects.
 */
async function avancerApresEnvoi(immeubleId: string) {
  const im = await bqOne("bo_immeuble", immeubleId).catch(() => null);
  const n = parseInt(String(im?.Statut ?? "").split(" ")[0], 10) || 0;
  if (n > 0 && n < 3) {
    await rpc("bo_patch_doc", {
      p_table: "bo_immeuble",
      p_id: immeubleId,
      p_patch: { Statut: STATUTS[3], "Modified Date": new Date().toISOString() },
    }).catch(() => {});
  }
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
  if (statut === "3 - Envoyée") await avancerApresEnvoi(immeubleId);
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
    /** Trace du dernier envoi, pour que l'écran cesse de proposer « Marquer
     *  envoyée » sur une estimation déjà partie (retours #144 et #145). */
    envoyeeLe?: string; envoyeeA?: string; objet?: string; corps?: string;
  };
  lecture: EstimationLecture;
  /** Ce que la fiche dit aujourd'hui, là où ça diverge (retour #143). */
  ecarts: Record<string, { alors: string; aujourdhui: string }>;
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

  /* Ce qui a bougé depuis. On lit la fiche d'aujourd'hui à côté, sans jamais
     toucher aux valeurs figées : l'estimation reste ce qui est parti. */
  const lecture = lireEstimation(e, agent);
  const immeubleId = String(e.IMMEUBLE ?? "");
  let ecarts: Record<string, { alors: string; aujourdhui: string }> = {};
  if (immeubleId) {
    const { comparerLocatif, comparerPrix, comparerSecteur } = await import("./estimation-ecarts");
    const [bien, secteur] = await Promise.all([
      getBien(immeubleId).catch(() => null),
      getPrixSecteur(immeubleId).catch(() => null),
    ]);
    if (bien) {
      ecarts = {
        ...comparerLocatif(lecture.lignes, bien.lots),
        ...comparerSecteur(lecture.lignes, secteur),
        ...comparerPrix(lecture.prix, bien.im),
      };
    }
  }

  return {
    reprise: {
      id: estimationId,
      titre: t(e.titre),
      pdfUrl, pdfKo,
      hai: n(e.prix_hai),
      nv: n(e.prix_nv) ?? n(e["[SUPPR] prix_nv"]),
      creeLe: t(e["Created Date"]),
      statut: t(e.Statut),
      envoyeeLe: t(e.sent_at) ?? t(e.date_envoi),
      envoyeeA: t(e.sent_to),
      objet: t(e.sent_objet),
      corps: t(e.sent_corps),
    },
    lecture: lecture,
    ecarts,
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
  /* La façade est capturée une fois, ici, et jamais redemandée : c'est le seul
     appel Google de la vie de la fiche. Après la réponse — créer un immeuble
     ne doit pas attendre le réseau — et sans faire échouer la création si
     Google ne répond pas. */
  after(async () => { await capturerFacadeRue(id).catch(() => undefined); });
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
  /** Toutes les sociétés du contact (retours #200 et #228) : les champs
   *  `entreprise_*` n'en tiennent qu'une, celle qui est affichée. */
  societes: { nom?: string; siren?: string; rcs?: string; capital?: number; siege?: string }[];
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

/**
 * Fixe d'un coup les photos retenues pour le dossier de vente (retour #322).
 *
 * Tant que personne n'a coché, la sélection est implicite — « les seize
 * premières » (voir `lib/bo/photos-dossier.ts`). Au premier clic de l'agent il
 * faut la matérialiser en entier, sinon on écrirait une seule case cochée et
 * les quinze autres photos sortiraient du dossier sans que personne l'ait
 * demandé. On écrit donc les seize d'un coup, et on décoche explicitement le
 * reste : ce qui est en base dit désormais exactement ce que le dossier
 * imprimera.
 */
export async function fixerPhotosDossier(immeubleId: string, retenues: string[]) {
  const garde = new Set(retenues);
  const photos = await photosDe(immeubleId);
  await Promise.all(
    photos
      .filter((p) => (p.show_in_doss === true) !== garde.has(String(p._id)))
      .map((p) => patchPhoto(String(p._id), { show_in_doss: garde.has(String(p._id)) })),
  );
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
 * Fabrique le PDF du dossier complet de vente (retour #184).
 *
 * MAV : « il faut par ailleurs que ça génère directement le PDF. » Même
 * mécanique que le dossier d'estimation : on imprime la page « nue » côté
 * serveur, on range le fichier dans le coffre et on l'accroche au dossier —
 * le lien devient donc partageable tel quel.
 */
export async function genererPdfDossier(immeubleId: string, dossierId: string) {
  try {
    return { ok: true as const, ...(await fabriquerPdfDossier(immeubleId, dossierId)) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[pdf dossier]", message);
    return { ok: false as const, message };
  }
}

/**
 * Le PDF d'un dossier PAS ENCORE ENREGISTRÉ (retour #219).
 *
 * MAV : « j'aimerais que, quand on génère un nouveau dossier, il soit demandé
 * de le télécharger pour le vérifier avant de l'enregistrer. C'est seulement
 * quand on l'enregistre que la dernière version est réellement créée — sinon,
 * dès qu'on modifie quoi que ce soit, on a une infinité de dossiers déjà
 * générés. »
 *
 * Rien n'est écrit en base : ni ligne de dossier, ni document. Le fichier va
 * dans le coffre sous un nom d'aperçu, écrasé à chaque essai — c'est un
 * brouillon, il n'a pas à s'accumuler.
 */
export async function apercuPdfDossier(
  immeubleId: string,
  input: { hai: number; pct: number; version: number },
) {
  try {
    const { pdfDepuisUrl } = await import("./pdf");
    const { headers } = await import("next/headers");
    const h = await headers();
    const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
    const q = new URLSearchParams({
      nu: "1", hai: String(input.hai), pct: String(input.pct), v: String(input.version),
    });
    const pdf = await pdfDepuisUrl(
      `${proto}://${hote}/bien/${immeubleId}/dossier/apercu?${q}`,
      h.get("cookie") ?? undefined,
    );
    if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : upload impossible");
    /* Un nom par essai : le coffre sert les fichiers avec un cache d'un jour,
       un chemin fixe aurait resservi l'aperçu précédent. */
    const path = `dossiers/${immeubleId}/apercu-${Date.now()}.pdf`;
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
    return {
      ok: true as const,
      url: `/api/photo?s=${encodeURIComponent(path)}`,
      ko: Math.round(pdf.length / 1024),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[apercu dossier]", message);
    return { ok: false as const, message };
  }
}

async function fabriquerPdfDossier(immeubleId: string, dossierId: string) {
  const { pdfDepuisUrl } = await import("./pdf");
  const { headers } = await import("next/headers");
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${hote}/bien/${immeubleId}/dossier/${dossierId}/imprimer?nu=1`;

  const pdf = await pdfDepuisUrl(url, h.get("cookie") ?? undefined);
  const now = new Date().toISOString();
  const docId = newId();
  const path = `dossiers/${immeubleId}/${dossierId}.pdf`;

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
      DOSSIER: dossierId,
      name: "Dossier complet",
      file_name: "Dossier.pdf",
      path,
      format: "application/pdf",
      size_kB: Math.round(pdf.length / 1024),
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  await rpc("bo_patch_doc", {
    p_table: "bo_dossier",
    p_id: dossierId,
    p_patch: { pdf: `storage:${path}`, FILE: docId },
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
  /* Le champ du BO s'écrit « Statut », avec une majuscule. On n'écrivait que
     `statut` : l'estimation partait vraiment, mais restait « à envoyer » aux
     yeux de l'application, et le bien ne quittait jamais la colonne « à
     estimer » (retour #142).

     On garde aussi le texte du message : sans lui, impossible de montrer plus
     tard ce qui a été envoyé (retour #145). */
  await rpc("bo_patch_doc", {
    p_table: "bo_estimation",
    p_id: input.estimationId,
    p_patch: cleanPatch({
      sent: true, sent_at: now, sent_to: input.to,
      sent_cc: input.cc?.trim() || undefined,
      sent_pj: pieces.map((p) => p.filename).join(", "),
      sent_message_id: messageId, sent_jeton: jeton,
      sent_objet: input.objet,
      sent_corps: input.message,
      Statut: "3 - Envoyée", statut: "3 - Envoyée",
      date_envoi: now,
      "Modified Date": now,
    }),
  });
  await avancerApresEnvoi(input.immeubleId);
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
  "durée_irrevoc_days": number;
  /** Exclusif : date à partir de laquelle le mandant peut lever la seule
   *  exclusivité, sans dénoncer le mandat (retour #195). */
  date_revoc_exclu: string; renouvelable_yn: boolean; date_fin: string;
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

  /* Le prix part de l'estimation (retour #189) : c'est le montant qu'on vient
     d'annoncer au propriétaire, ce serait absurde de le ressaisir. Il reste
     modifiable, et les honoraires en découlent par le barème. */
  const im = await bqOne("bo_immeuble", immeubleId).catch(() => null);
  const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
  const haiEstime = nombre(im?.prix_hai_estim) ?? nombre(im?.prix_hai);
  const prix = haiEstime ? netVendeurDepuisHai(haiEstime) : null;

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
      /* Charge acquéreur par défaut en bloc (retour #191) : elle ne bascule
         sur le vendeur que si l'état locatif ne compte qu'un seul locataire,
         seul cas où un droit de préemption d'ensemble peut jouer. C'est
         `regimeHonoraires` qui l'impose alors, sans que l'agent ait à choisir. */
      Charge_hono: "Acheteur",
      prix_hai: haiEstime,
      prix_nv: prix?.nv,
      honos_ttc: prix?.honos,
      honos_taux: prix?.taux ?? 5,
      "durée_tot_month": 12,
      "durée_exclu_jours": 90,
      "durée_irrevoc_days": 30,
      // La prise d'effet part d'aujourd'hui (retour #193), et reste modifiable.
      date_effet: now,
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
/**
 * Enregistre les mandants — et retient ce qui a été saisi.
 *
 * Trois écritures, pas une (retour MAV) :
 *
 *   1. Le mandat lui-même, liste `mandants` et champs plats Bubble.
 *   2. Les pièces déjà déposées sont RECOLLÉES depuis la version enregistrée :
 *      l'écran ne les renvoie pas toujours (un dépôt suivi d'un changement
 *      d'onglet, une carte rouverte), et sans ce recollement l'enregistrement
 *      écrasait le lien par null — le document paraissait avoir disparu.
 *   3. L'état civil et la société remontent sur la FICHE CONTACT : date de
 *      naissance, lieu, adresse, raison sociale, SIREN, RCS, capital, siège.
 *      Ce sont des informations de la personne, pas de ce mandat-ci ; saisies
 *      une fois, elles resservent au mandat suivant, au compromis, à la vente.
 */
export async function majMandants(
  mandatId: string,
  immeubleId: string,
  mandants: MandantEnregistre[],
) {
  /* Recollement des pièces : on ne perd jamais un lien de document parce que
     l'écran ne l'avait pas en main au moment d'enregistrer. */
  const avant = await bqOne("bo_mandat", mandatId).catch(() => null);
  const ancien = Array.isArray(avant?.mandants)
    ? (avant!.mandants as MandantEnregistre[])
    : [];
  const piecesDe = (x: MandantEnregistre) =>
    ancien.find((v) => v.uid === x.uid || (!!x.contactId && v.contactId === x.contactId));
  mandants = mandants.map((x) => {
    const a = piecesDe(x);
    return { ...x, cni: x.cni || a?.cni, kbis: x.kbis || a?.kbis };
  });

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
  await Promise.all(mandants.map((x) => renvoyerSurLeContact(x)));

  /* Retour #308 — « dans le mandat j'ai changé de propriétaire, je suis passé à
     Aaron VOCI, mais dans l'onglet Propriétaire il y a toujours écrit que c'est
     Jean Pierre le test le propriétaire. C'est pas normal, ça devrait changer
     automatiquement. »
     Il a raison : celui qui signe le mandat de vente EST le propriétaire du
     bien — c'est même ce que le mandat atteste. Laisser les deux se
     contredire, c'est écrire à l'ancien vendeur et fonder un dossier sur un
     nom que le document démentira.
     On ne descend le lien que depuis le PREMIER mandant, et seulement quand la
     fiche désigne quelqu'un d'autre : une indivision a plusieurs mandants pour
     un seul propriétaire de référence, et rien ne justifierait de choisir le
     deuxième. Le changement laisse la même trace horodatée que le bouton de la
     fiche (#288) — un immeuble ne change pas de mains en silence. */
  const premier = mandants[0];
  if (immeubleId && premier?.contactId) {
    const im = await bqOne("bo_immeuble", immeubleId).catch(() => null);
    const actuel = typeof im?.PROPRIETAIRE === "string" ? im.PROPRIETAIRE : "";
    if (im && actuel !== premier.contactId) {
      const ancien = actuel ? await bqOne("bo_contact", actuel).catch(() => null) : null;
      await changerProprietaire({
        immeubleId,
        nouveauId: premier.contactId,
        nouveauNom: [premier.prenom, premier.nom].filter(Boolean).join(" ")
          || premier.societe?.nom || "le mandant",
        ancienId: actuel || null,
        ancienNom: ancien
          ? `${String(ancien["prénom"] ?? "")} ${String(ancien.nom ?? "")}`.trim()
          : undefined,
        motif: "Mandant du mandat de vente",
      });
    }
  }

  rafraichirMandat(mandatId, immeubleId);
}

/**
 * Recopie sur la fiche contact ce qui a été saisi au mandat.
 *
 * Retour #228 — « comme j'ai rentré toutes les informations il faudrait que
 * toutes ces infos s'enregistrent dans le contact, de telle façon que quand je
 * rentre un nouveau mandat avec ce contact j'ai toutes ces infos ».
 *
 * Le renvoi ne comblait jusqu'ici que les cases vides de la fiche : c'était la
 * fiche qui faisait foi. À l'usage, c'est l'inverse. La fiche contact se
 * remplit au téléphone, de mémoire ; le mandant, lui, se saisit pièce
 * d'identité en main, sur un acte que le client signe. Quand les deux ne
 * disent pas la même chose, c'est le mandat qui a raison — et laisser la
 * vieille valeur en fiche, c'est la voir revenir au mandat suivant, ce que MAV
 * décrit exactement.
 *
 * On écrit donc ce qui a été saisi, même par-dessus. Deux limites : jamais du
 * vide par-dessus du plein — ne rien saisir n'est pas effacer — et jamais un
 * champ que le mandat n'a pas à connaître (le nom et la civilité s'y affichent
 * en lecture seule depuis les retours #226/#227, ils viennent de la fiche et y
 * restent).
 */
async function renvoyerSurLeContact(x: MandantEnregistre) {
  if (!x.contactId || !SB_KEY) return;
  const c = await bqOne("bo_contact", x.contactId).catch(() => null);
  if (!c) return;

  const vide = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
  const patch: Record<string, unknown> = {};
  /** Écrit ce que le mandat a appris — sauf à effacer, ou à ne rien changer. */
  const poser = (champ: string, valeur: unknown) => {
    if (vide(valeur) || String(c[champ] ?? "") === String(valeur)) return;
    patch[champ] = valeur;
  };
  const poserGeo = (champ: string, valeur?: string) => {
    const actuel = (c[champ] as { address?: string } | undefined)?.address;
    if (vide(valeur) || actuel === valeur) return;
    patch[champ] = { address: valeur };
  };

  poser("date_naissance", x.dateNaissance);
  poserGeo("lieu_naissance_geo", x.lieuNaissance);
  poserGeo("adresse_geo", x.adresse);
  poser("email", x.email);
  poser("poste", x.fonction);
  if (x.societe?.nom) {
    poser("entreprise_nom", x.societe.nom);
    poser("entreprise_siren", x.societe.siren);
    poser("entreprise_rcs", x.societe.rcs);
    poser("entreprise_capital", x.societe.capital);
    poserGeo("entreprise_siege_geo", x.societe.siege);

    /* Retour #200 — « un propriétaire peut avoir plusieurs sociétés, donc on
       peut associer plusieurs sociétés sur sa fiche contact et à chaque fois
       elles s'enregistrent ». Les champs `entreprise_*` ci-dessus n'en tiennent
       qu'une : ils restent, parce que Bubble et la fiche contact les lisent,
       mais la vérité est désormais dans `societes`, qui les collectionne.
       Une société déjà connue est mise à jour, pas dupliquée — le SIREN
       l'identifie, à défaut son nom réduit à ses lettres et ses chiffres.
       Comme pour l'état civil (retour #228), c'est la saisie du mandat qui
       l'emporte : un capital corrigé au mandat doit se retrouver au suivant. */
    type Soc = NonNullable<MandantEnregistre["societe"]>;
    const cle = (s?: Soc) =>
      (s?.siren ?? "").replace(/\D/g, "")
      || (s?.nom ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const liste: Soc[] = Array.isArray(c.societes) ? [...(c.societes as Soc[])] : [];
    const i = liste.findIndex((s) => cle(s) && cle(s) === cle(x.societe));
    if (i >= 0) {
      liste[i] = {
        nom: x.societe.nom || liste[i].nom,
        siren: x.societe.siren || liste[i].siren,
        rcs: x.societe.rcs || liste[i].rcs,
        capital: x.societe.capital ?? liste[i].capital,
        siege: x.societe.siege || liste[i].siege,
      };
    } else {
      liste.push(x.societe);
    }
    if (JSON.stringify(liste) !== JSON.stringify(c.societes ?? [])) patch.societes = liste;
  }
  if (Object.keys(patch).length === 0) return;

  patch["Modified Date"] = new Date().toISOString();
  await rpc("bo_patch_doc", { p_table: "bo_contact", p_id: x.contactId, p_patch: patch })
    .catch(() => undefined);
  revalidatePath(`/contact/${x.contactId}`);
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
  /** La société qui représente la société mandante — les holdings (#292). */
  representante?: { nom?: string; siren?: string; rcs?: string; capital?: number; siege?: string };
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
  /** Le mandant concerné : sans lui, la pièce ne se rattache à personne. */
  mandantUid?: string,
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
    } else {
      /* La pièce est écrite TOUT DE SUITE sur le mandat, sans attendre que
         l'agent pense à enregistrer l'onglet. Elle ne vivait jusqu'ici que
         dans l'état de l'écran : changer d'onglet avant d'enregistrer la
         faisait disparaître, alors que le fichier, lui, était bien déposé. */
      const m = await bqOne("bo_mandat", mandatId).catch(() => null);
      const liste = Array.isArray(m?.mandants) ? (m!.mandants as MandantEnregistre[]) : [];
      const vise = (x: MandantEnregistre) =>
        (mandantUid && x.uid === mandantUid) || (!!contactId && x.contactId === contactId);
      const i = liste.findIndex(vise);
      if (i >= 0) {
        liste[i] = { ...liste[i], [cle]: url };
        const patch: Record<string, unknown> = { mandants: liste, "Modified Date": new Date().toISOString() };
        // Les champs plats que Bubble lit, tenus en phase avec la liste.
        if (cle === "cni") patch[i === 0 ? "cni_m1" : "cni_m2"] = url;
        else patch.kbis = url;
        await rpc("bo_patch_doc", { p_table: "bo_mandat", p_id: mandatId, p_patch: patch });
      }

      // Et elle enrichit la fiche contact : elle resservira au mandat suivant,
      // au compromis, à la vente.
      if (contactId) {
        await rpc("bo_patch_doc", {
          p_table: "bo_contact",
          p_id: contactId,
          p_patch: {
            [cle === "cni" ? "cni" : "entreprise_kbis"]: url,
            /* Retour #289 — « pour le Kbis, ce serait bien d'écrire la date à
               laquelle on a déposé le document aussi. » Un Kbis vaut trois
               mois : sans sa date, on ne peut pas savoir s'il est encore
               recevable, et on le redemande par précaution à chaque fois. */
            [cle === "cni" ? "cni_depose_le" : "entreprise_kbis_depose_le"]: new Date().toISOString(),
            "Modified Date": new Date().toISOString(),
          },
        });
        revalidatePath(`/contact/${contactId}`);
      }
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

/**
 * Retire une pièce justificative de la fiche d'un contact (retour #289).
 *
 * MAV : « il me faudrait également un bouton pour supprimer ou remplacer les
 * documents en question. » Remplacer existait — c'est le même dépôt. Retirer,
 * non : une carte d'identité périmée ou déposée sur la mauvaise fiche restait
 * là, et le dossier se croyait complet.
 *
 * Le fichier lui-même n'est pas effacé du coffre : il reste au dossier de
 * l'immeuble, où il a été journalisé. On ne défait que le rattachement.
 */
export async function retirerPieceContact(contactId: string, cle: "cni" | "kbis") {
  await rpc("bo_patch_doc", {
    p_table: "bo_contact",
    p_id: contactId,
    p_patch: {
      [cle === "cni" ? "cni" : "entreprise_kbis"]: null,
      [cle === "cni" ? "cni_depose_le" : "entreprise_kbis_depose_le"]: null,
      "Modified Date": new Date().toISOString(),
    },
  });
  revalidatePath(`/contact/${contactId}`);
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
    /* Un chemin NEUF à chaque génération, et pas un écrasement.
       Deux raisons, la première étant un bug rapporté par MAV : le relais sert
       les fichiers du coffre en « immutable, un jour ». À chemin identique,
       le navigateur rendait l'ancien PDF alors que l'aperçu, lui, montrait
       bien le nouveau — on téléchargeait un exclusif corrigé en simple.
       La seconde est de fond : chaque version reste récupérable, ce qu'un
       mandat contesté deux ans plus tard exige. */
    const horodatage = now.replace(/[-:]/g, "").replace(/\..+$/, "");
    const path = `mandats/${mandatId}/mandat-${numero}-${horodatage}.pdf`;
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
    /* Le texte automatique au moment où l'agent a pris la main (retour #232) :
       c'est lui qui dira, plus tard, si la fiche a bougé depuis. */
    descriptif_auto: string;
    prix_nv: number;
    prix_honos_ttc: number;
    prix_hai: number;
    prix_nv_min: number;
    prix_financement: boolean;
    prix_permis: boolean;
    Motif_vente: string;
    notes: string;
    /** Année de construction — bloque le dossier tant qu'elle manque (#204). */
    year_constru: number;
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

/**
 * Le contact qui porte déjà cette adresse e-mail (retour #248).
 *
 * MAV : « on ne devrait pas pouvoir créer un contact qui existe déjà : quand
 * on donne une adresse e-mail qui existe déjà dans la base, il nous demande si
 * on veut utiliser le contact en question ou en créer un nouveau avec une
 * autre adresse. »
 *
 * Un doublon d'e-mail ne coûte pas qu'une ligne en trop : les mails reçus se
 * rattachent à l'adresse, et deux fiches pour une adresse coupent l'historique
 * en deux. La comparaison ignore la casse et les espaces — « Kanun78@ » et
 * « kanun78@ » sont la même boîte.
 */
export async function contactParEmail(email: string): Promise<ContactTrouve | null> {
  const propre = email.trim().toLowerCase();
  if (!propre || !propre.includes("@") || !SB_KEY) return null;
  const p = new URLSearchParams({ select: "data", limit: "1" });
  p.append("data->>email", `ilike.${propre}`);
  const res = await fetch(`${SB_URL}/rest/v1/bo_contact?${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const rows = (await res.json()) as { data: Record<string, unknown> }[];
  const c = rows[0]?.data;
  if (!c) return null;
  return {
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
  };
}

/* ---------- La fiche d'un contact, pour remplir un mandant (retour #133) ---------- */

/** Ce qu'une fiche contact sait déjà dire d'un mandant. */
export type MandantDepuisContact = {
  civilite?: string;
  prenom?: string;
  nom?: string;
  email?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  adresse?: string;
  fonction?: string;
  societe?: {
    nom?: string; siren?: string; rcs?: string; capital?: number; siege?: string;
  };
  /** Toutes celles que la fiche connaît (retour #200), la principale d'abord. */
  societes?: { nom?: string; siren?: string; rcs?: string; capital?: number; siege?: string }[];
  /* Retour #287 — « pour les pièces justificatives d'une société ou d'un
     mandant (notamment la CNI), j'aimerais que cela soit également enregistré
     dans la fiche contact du client, de telle façon qu'on ne nous la redemande
     pas lorsqu'on remplit à nouveau. » Le dépôt les écrivait bien sur la fiche
     contact ; c'est la relecture qui manquait — le mandat suivant repartait
     d'un dossier vide et redemandait une carte d'identité déjà au coffre. */
  cni?: string;
  kbis?: string;
  /** Quand la pièce a été déposée — le Kbis a une péremption (#289). */
  cniLe?: string;
  kbisLe?: string;
};

/** Une adresse Bubble est `{address, lat, lng}` — on n'en garde que le libellé. */
function texteGeo(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (v && typeof v === "object" && "address" in v) {
    const a = (v as { address?: unknown }).address;
    return typeof a === "string" && a.trim() ? a.trim() : undefined;
  }
  return undefined;
}

/**
 * Recopie l'état civil du contact dans le mandant.
 *
 * MAV : « comme c'est un contact la personne physique doit déjà être
 * pré-renseignée avec les infos du contact. » Tout est déjà dans la fiche —
 * civilité, naissance, adresse, société — le ressaisir c'est se garantir un
 * mandat qui diverge de la base au premier oubli.
 */
export async function mandantDepuisContact(id: string): Promise<MandantDepuisContact | null> {
  if (!SB_KEY || !id) return null;
  const p = new URLSearchParams({ select: "data", limit: "1" });
  p.append("data->>_id", `eq.${id}`);
  const res = await fetch(`${SB_URL}/rest/v1/bo_contact?${p}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const rows = (await res.json()) as { data: Record<string, unknown> }[];
  const c = rows[0]?.data;
  if (!c) return null;

  const civ = typeof c["Civilité"] === "string" ? c["Civilité"] : "";
  const capital = typeof c.entreprise_capital === "number" ? c.entreprise_capital
    : typeof c.entreprise_capital === "string" ? parseFloat(c.entreprise_capital.replace(/[^\d.]/g, "")) : undefined;
  const S3 = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  return {
    // La fiche dit « Monsieur » ; le mandat écrit « M. ».
    civilite: civ === "Monsieur" ? "M." : civ === "Madame" ? "Mme" : S3(civ),
    prenom: S3(c["prénom"]),
    nom: S3(c.nom),
    email: S3(c.email),
    dateNaissance: S3(c.date_naissance)?.slice(0, 10),
    lieuNaissance: texteGeo(c.lieu_naissance_geo),
    adresse: texteGeo(c.adresse_geo),
    fonction: S3(c.poste),
    societe: {
      nom: S3(c.entreprise_nom),
      siren: S3(c.entreprise_siren),
      rcs: S3(c.entreprise_rcs),
      capital: Number.isFinite(capital) ? capital : undefined,
      siege: texteGeo(c.entreprise_siege_geo),
    },
    /* Retour #200 — « si le vendeur en a plusieurs, quand on crée un mandat il
       nous propose de sélectionner une des sociétés créées ». Toutes celles que
       la fiche a collectionnées, la principale d'abord pour qu'un contact à une
       seule société se comporte exactement comme avant. */
    societes: societesDuContact(c),
    cni: S3(c.cni),
    kbis: S3(c.entreprise_kbis),
    cniLe: S3(c.cni_depose_le)?.slice(0, 10),
    kbisLe: S3(c.entreprise_kbis_depose_le)?.slice(0, 10),
  };
}

/**
 * Les sociétés d'un contact, sans doublon (retour #200).
 *
 * Deux sources : le tableau `societes`, qui grandit à chaque mandat, et les
 * vieux champs `entreprise_*` des fiches d'avant. On dédoublonne sur le SIREN,
 * à défaut sur le nom réduit à ses lettres et ses chiffres — « SCI DU PARC » et
 * « S.C.I. du Parc » sont la même société.
 */
function societesDuContact(c: Record<string, unknown>) {
  type Soc = NonNullable<MandantEnregistre["societe"]>;
  const S3 = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const cap = typeof c.entreprise_capital === "number" ? c.entreprise_capital
    : typeof c.entreprise_capital === "string" ? parseFloat(c.entreprise_capital.replace(/[^\d.]/g, "")) : undefined;

  const principale: Soc | undefined = S3(c.entreprise_nom)
    ? {
        nom: S3(c.entreprise_nom),
        siren: S3(c.entreprise_siren),
        rcs: S3(c.entreprise_rcs),
        capital: Number.isFinite(cap) ? cap : undefined,
        siege: texteGeo(c.entreprise_siege_geo),
      }
    : undefined;

  const cle = (s: Soc) =>
    (s.siren ?? "").replace(/\D/g, "") || (s.nom ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const out: Soc[] = [];
  const vues = new Set<string>();
  for (const s of [principale, ...(Array.isArray(c.societes) ? (c.societes as Soc[]) : [])]) {
    if (!s?.nom) continue;
    const k = cle(s);
    if (!k || vues.has(k)) continue;
    vues.add(k);
    out.push(s);
  }
  return out;
}

/* ---------- Recherche d'entreprise en open data (retour #135) ---------- */

export type EntrepriseTrouvee = {
  nom: string;
  siren: string;
  siege?: string;
  /** Forme juridique en clair (« SCI », « SAS »…), utile à l'œil. */
  forme?: string;
  ville?: string;
  /** Ville du greffe, déduite du siège (retour #208) — voir lib/bo/greffes.ts. */
  rcs?: string;
};

/**
 * Cherche une société dans l'annuaire des entreprises (API publique de la
 * DINUM, sans clé, alimentée par l'INSEE et l'INPI).
 *
 * Ce qu'elle donne : raison sociale, SIREN, forme juridique, siège. Ce qu'elle
 * ne donne pas : le capital, qui vient du registre du commerce et demande un
 * compte INPI — il reste à saisir. Le greffe du RCS, lui, se déduit du
 * département du siège (retour #208).
 */
export async function chercherEntreprise(q: string): Promise<EntrepriseTrouvee[]> {
  const t = (q ?? "").trim();
  if (t.length < 3) return [];
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(t)}&per_page=8&page=1`;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return [];
  const d = (await res.json().catch(() => null)) as {
    results?: {
      nom_complet?: string; nom_raison_sociale?: string; siren?: string;
      nature_juridique?: string;
      siege?: {
        adresse?: string; libelle_commune?: string; code_postal?: string;
        departement?: string;
      };
    }[];
  } | null;
  return (d?.results ?? [])
    .filter((r) => r.siren)
    .map((r) => ({
      nom: (r.nom_raison_sociale || r.nom_complet || "").toUpperCase(),
      siren: String(r.siren),
      /* `adresse` porte déjà le code postal et la commune : les recoller les
         écrirait deux fois. */
      siege: r.siege?.adresse
        || [r.siege?.code_postal, r.siege?.libelle_commune].filter(Boolean).join(" ")
        || undefined,
      ville: r.siege?.libelle_commune ?? undefined,
      forme: FORMES[String(r.nature_juridique ?? "")] ?? undefined,
      rcs: greffeDe(r.siege?.departement, r.siege?.libelle_commune),
    }))
    .filter((r) => r.nom);
}

/**
 * Le capital social d'une société, au registre national (retour #208).
 *
 * Appelée au moment où l'agent RETIENT une société, pas à chaque frappe : le
 * registre se consulte une fois, pour la bonne. Rend `undefined` tant que les
 * identifiants INPI ne sont pas configurés — le champ reste alors à saisir,
 * comme avant, sans que rien ne casse.
 */
export async function capitalDuSiren(siren: string): Promise<number | undefined> {
  const { capitalSocial } = await import("@/lib/bo/inpi");
  return capitalSocial(siren).catch(() => undefined);
}

/** Les formes juridiques croisées sur des immeubles de rapport. */
const FORMES: Record<string, string> = {
  "5710": "SAS", "5720": "SASU", "5499": "SA", "5599": "SA",
  "5426": "SARL", "5498": "SARL", "5485": "SARL",
  "6540": "SCI", "6521": "SCPI", "6532": "SC de moyens", "6533": "GAEC",
  "6534": "Groupement forestier", "6537": "Société civile",
  "6540 ": "SCI", "1000": "Personne physique",
};

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

/* --------- Créer et modifier une recherche acquéreur (retours #330, #332) -- */

export type SaisieRecherche = {
  /** Absent = création (#332), présent = modification (#330). */
  id?: string;
  contactId?: string;
  cible?: string;
  destinations: string[];
  villes: string[];
  departements: string[];
  prixMin?: number;
  prixMax?: number;
  surfaceMin?: number;
  surfaceMax?: number;
  occupMin?: number;
  occupMax?: number;
  renta?: number;
  commentaire?: string;
  /** Ce que la recherche refuse (retour #332) — voir lib/bo/exclusions.ts. */
  exclusions: {
    destinations: string[];
    villes: string[];
    departements: string[];
    regions: string[];
  };
};

/**
 * Enregistre une recherche, créée ou modifiée (retours #330, #332).
 *
 * MAV : « il faut qu'en cliquant sur une recherche on puisse la modifier avec
 * le popup qui s'ouvre » et « quand on clique sur créer une recherche il faut
 * la modale de recherche qui va créer la recherche pour le client ». Une même
 * modale sert les deux : c'est le même objet, avec ou sans identifiant.
 *
 * Les critères vont dans `bo_recherche`, que Bubble connaît ; les exclusions
 * dans la table de l'application, qu'il n'écrase pas.
 */
export async function enregistrerRecherche(saisie: SaisieRecherche, agentId?: string) {
  const now = new Date().toISOString();
  const id = saisie.id ?? newId();
  const doc = cleanPatch({
    ACHETEUR: saisie.contactId || null,
    Cible: saisie.cible || null,
    Destinations: saisie.destinations,
    villes: saisie.villes,
    dpts: saisie.departements,
    prix_min: saisie.prixMin ?? null,
    prix_max: saisie.prixMax ?? null,
    surface_min: saisie.surfaceMin ?? null,
    surface_max: saisie.surfaceMax ?? null,
    occup_min: saisie.occupMin ?? null,
    occup_max: saisie.occupMax ?? null,
    renta: saisie.renta ?? null,
    commentaire: saisie.commentaire?.trim() || null,
    date_modif: now,
    "Modified Date": now,
  });

  if (saisie.id) {
    await rpc("bo_patch_doc", { p_table: "bo_recherche", p_id: id, p_patch: doc });
  } else {
    await rpc("bo_insert_doc", {
      p_table: "bo_recherche",
      p_id: id,
      p_doc: {
        ...doc,
        SUIVI: agentId ?? null,
        archived: false,
        standby: false,
        "Created By": agentId ?? null,
        "Created Date": now,
      },
    });
    /* La fiche du contact doit connaître sa recherche, sinon l'onglet
       Recherches de la fiche reste vide (même piège de casse qu'au #288 : sur
       un CONTACT, la liste s'appelle RECHERCHEs). */
    if (saisie.contactId) {
      await rpc("bo_append_ref", {
        p_table: "bo_contact",
        p_id: saisie.contactId,
        p_key: "RECHERCHEs",
        p_value: id,
      }).catch(() => undefined);
    }
  }

  await ecrireExclusions(id, {
    destinations: saisie.exclusions.destinations,
    villes: saisie.exclusions.villes,
    departements: saisie.exclusions.departements,
    regions: saisie.exclusions.regions,
  });

  revalidatePath("/recherches");
  if (saisie.contactId) revalidatePath(`/contact/${saisie.contactId}`);
  return id;
}

/** Les exclusions d'une recherche, pour remplir la modale de modification. */
export async function chargerExclusions(rechercheId: string) {
  return lireExclusions(rechercheId);
}

/* ------------- Proposer des biens depuis une recherche (retour #331) ------ */

/** Charge les biens qu'on pourrait proposer à une recherche. */
export async function chargerAProposer(rechercheId: string) {
  const { getAProposer } = await import("@/lib/bubble/server");
  return getAProposer(rechercheId);
}

export type IssueProposition =
  /** L'e-mail est préparé, l'agent l'envoie : la proposition part « Envoyée ». */
  | { mode: "envoyer"; objet: string; message: string; email?: string }
  /** Le bien ne correspond pas : proposition créée puis refusée, avec le motif. */
  | { mode: "ne_correspond_pas"; motifs: Record<string, string> }
  /** On l'avait déjà envoyé hors de l'outil ; `retour` dit si l'acquéreur a répondu. */
  | { mode: "deja_envoye"; retour?: { statut: string; commentaire?: string } };

/**
 * Traite d'un coup les biens cochés dans le panneau « à proposer » (#331).
 *
 * Les trois issues créent TOUTES une proposition — c'est le point : ce qui a
 * été écarté doit laisser une trace, sinon le bien remonte demain dans la
 * pastille et l'agent refait le même arbitrage. Ce qui les distingue, c'est le
 * statut de départ et ce qu'on inscrit dessus.
 *
 * Rien n'est envoyé ici : l'e-mail est préparé et enregistré sur la
 * proposition, l'agent l'envoie depuis le module Mails. Doctrine maison —
 * validation humaine avant tout envoi.
 */
export async function traiterAProposer(
  rechercheId: string,
  immeubleIds: string[],
  issue: IssueProposition,
  agentId?: string,
) {
  if (immeubleIds.length === 0) return { crees: 0 };
  const now = new Date().toISOString();
  const [r] = await bqIn("bo_recherche", [rechercheId]);
  const acheteurId = r ? String(r.ACHETEUR ?? "") || null : null;

  /* Le dernier dossier de chaque bien : c'est la pièce jointe de l'e-mail, et
     la proposition doit dire laquelle est partie — sinon, six mois plus tard,
     on ne sait plus quel prix l'acquéreur a vu. Un seul aller-retour pour tout
     le lot. */
  const dossierParImmeuble = new Map<string, Record<string, unknown>>();
  if (SB_KEY) {
    const filtre = `(${immeubleIds.map((i) => `"${i.replace(/"/g, "")}"`).join(",")})`;
    const res = await fetch(
      `${SB_URL}/rest/v1/bo_dossier?data->>IMMEUBLE=in.${encodeURIComponent(filtre)}&select=data&limit=500`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
    ).catch(() => null);
    if (res?.ok) {
      for (const { data: d } of (await res.json()) as { data: Record<string, unknown> }[]) {
        if (!d) continue;
        const im = String(d.IMMEUBLE ?? "");
        const p = dossierParImmeuble.get(im);
        if (!p || Number(d.version ?? 0) > Number(p.version ?? 0)) dossierParImmeuble.set(im, d);
      }
    }
  }

  let crees = 0;
  for (const immeubleId of immeubleIds) {
    const id = newId();
    const dossier = dossierParImmeuble.get(immeubleId);

    const base: Record<string, unknown> = {
      IMMEUBLE: immeubleId,
      DOSSIER: dossier ? String(dossier._id) : null,
      ACHETEUR: acheteurId,
      RECHERCHEs: [rechercheId],
      AGENTs: agentId ? [agentId] : [],
      Source_proposition: "Recherche",
      date_modif: now,
      stop_relances_yn: false,
      "Created By": agentId ?? null,
      "Created Date": now,
      "Modified Date": now,
    };

    if (issue.mode === "envoyer") {
      Object.assign(base, {
        Statut: "Envoyée",
        date_envoi: now,
        mail_adresse: issue.email ?? null,
        mail_subject: issue.objet,
        mail_text: issue.message,
      });
    } else if (issue.mode === "ne_correspond_pas") {
      const motif = issue.motifs[immeubleId]?.trim();
      Object.assign(base, {
        Statut: "Refusée (sans offre)",
        motif_refus: motif || "Ne correspond pas à la recherche",
        date_fin: now,
        stop_relances_yn: true,
      });
    } else {
      Object.assign(base, {
        Statut: issue.retour?.statut ?? "Envoyée",
        date_envoi: now,
        commentaire: issue.retour?.commentaire?.trim() || null,
        ...(issue.retour?.statut?.startsWith("Refus")
          ? { date_fin: now, stop_relances_yn: true, motif_refus: issue.retour.commentaire ?? null }
          : {}),
      });
    }

    await rpc("bo_insert_doc", { p_table: "bo_proposition", p_id: id, p_doc: cleanPatch(base) });
    crees++;
  }

  /* La recherche mémorise ce qui a été traité : ces biens sortent de la
     pastille, quelle qu'ait été l'issue. C'est la raison d'être des trois
     boutons — « ne correspond pas » aussi doit faire taire la notification. */
  for (const immeubleId of immeubleIds) {
    await rpc("bo_append_ref", {
      p_table: "bo_recherche",
      p_id: rechercheId,
      p_key: "IMMEUBLEs_proposed",
      p_value: immeubleId,
    }).catch(() => undefined);
  }

  revalidatePath("/recherches");
  revalidatePath("/propositions");
  if (acheteurId) revalidatePath(`/contact/${acheteurId}`);
  return { crees };
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
      // Bubble tient une copie à plat de l'adresse complète ; la capture de
      // façade et les liens externes la lisent. Sans elle, une fiche créée
      // depuis le nouveau BO restait sans adresse exploitable.
      adresse: a.label,
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
  /* Ce à quoi les travaux correspondent, demandé à la saisie (retour #254).
     Sans lui, l'onglet Travaux n'affichait que « Travaux lot 6 » : un montant
     sans objet, qu'il fallait rouvrir pour comprendre. */
  objet?: { description?: string; urgence?: "Haute" | "Moyenne" | "Basse" },
) {
  const montantDediee = Math.max(0, montantCible - montantAutres);
  const description = objet?.description?.trim() || `Travaux ${lotLabel}`;
  if (dedieeId) {
    if (montantDediee <= 0) {
      await rpc("bo_delete_doc", { p_table: "bo_travaux", p_id: dedieeId });
    } else {
      await rpc("bo_patch_doc", {
        p_table: "bo_travaux",
        p_id: dedieeId,
        p_patch: cleanPatch({
          montant: montantDediee,
          /* On ne réécrit la description que si l'agent en a donné une : sinon
             une simple correction de montant effacerait ce qu'il avait saisi. */
          description: objet?.description?.trim() || undefined,
          Urgence: objet?.urgence,
          "Modified Date": new Date().toISOString(),
        }),
      });
    }
  } else if (montantDediee > 0) {
    const now = new Date().toISOString();
    await rpc("bo_insert_doc", {
      p_table: "bo_travaux",
      p_id: newId(),
      p_doc: cleanPatch({
        IMMEUBLE: immeubleId,
        LOTs: [lotId],
        description,
        Urgence: objet?.urgence,
        montant: montantDediee,
        YN_devis: false,
        "Created Date": now,
        "Modified Date": now,
      }),
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

/* ======================= Façade en vue de rue =======================
 *
 * Arbitrage MAV : « je veux pas que tu charges x visuels Google à chaque fois
 * que je vais sur le BO ». La façade n'est donc PAS chargée à l'affichage.
 * Elle est capturée **une fois**, rangée dans notre coffre, et promue photo
 * principale. Ensuite le BO ne sert que notre copie : parcourir le dashboard,
 * la liste ou une fiche ne coûte aucun appel d'API.
 *
 * Coût total : un appel de métadonnées (gratuit chez Google) et un appel
 * d'image par immeuble, une seule fois dans sa vie.
 *
 * La capture reste une photo *provisoire* : elle porte la mention « à
 * remplacer » dans l'outil et ne part pas dans le dossier de vente — Google
 * interdit de réutiliser Street View comme photo d'un bien dans un document
 * commercial ou une annonce.
 */

const CLE_MAPS = () =>
  process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

export type ResultatFacade =
  | { ok: true; deja?: boolean }
  | { ok: false; raison: string };

/**
 * Capture la façade d'un immeuble et l'installe comme photo principale.
 *
 * Ne fait rien si l'immeuble a déjà une photo : une vraie photo prime toujours
 * sur une capture, et on ne redemande jamais deux fois la même image à Google.
 */
export async function capturerFacadeRue(immeubleId: string): Promise<ResultatFacade> {
  const cle = CLE_MAPS();
  if (!cle) return { ok: false, raison: "clé Google Maps non configurée" };

  const [im] = await bqIn("bo_immeuble", [immeubleId]);
  if (!im) return { ok: false, raison: "immeuble introuvable" };
  const actuelle = im.photo_main_compressed;
  if (typeof actuelle === "string" && actuelle.length > 0) return { ok: true, deja: true };

  /* Bubble range l'adresse complète dans `adresse` ; une fiche créée depuis
     le nouveau BO ne l'a pas encore, on la recompose depuis ses morceaux. */
  const rue = [im.adresse_numero_rue, im.adresse_rue].filter(Boolean).join(" ").trim();
  const adresse = typeof im.adresse === "string" && im.adresse.trim()
    ? im.adresse.trim()
    : [rue, [im.adresse_zipcode, im.adresse_ville].filter(Boolean).join(" ")]
        .filter(Boolean).join(", ");
  // Une adresse sans rue (« , 79110 Chef-Boutonne ») situerait un point au
  // hasard dans la commune : la capture ne montrerait pas l'immeuble.
  if (adresse.split(",")[0].trim().length < 4) return { ok: false, raison: "adresse trop imprécise" };

  const lieu = encodeURIComponent(adresse);
  /* L'appel « metadata » est gratuit et dit si une prise de vue existe. Sans
     lui, Google facturerait une image et renverrait une tuile grise. */
  const meta = await fetch(
    `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lieu}&key=${cle}`,
    { cache: "no-store" },
  ).then((r) => r.json() as Promise<{ status?: string }>).catch(() => null);
  if (meta?.status !== "OK") return { ok: false, raison: "pas de vue de rue à cette adresse" };

  /* Une seule taille demandée : 640×480 sert aussi bien la vignette de 82 px
     du dashboard que l'en-tête de fiche. Deux tailles = deux appels facturés
     pour un gain invisible. */
  const r = await fetch(
    `https://maps.googleapis.com/maps/api/streetview?location=${lieu}` +
      `&size=640x480&fov=80&pitch=8&return_error_code=true&key=${cle}`,
    { cache: "no-store" },
  );
  if (!r.ok) return { ok: false, raison: `Google a refusé l'image (${r.status})` };
  const jpeg = Buffer.from(await r.arrayBuffer());

  const { DOSSIER_FACADE } = await import("./facade");
  const id = newId();
  const chemin = `${DOSSIER_FACADE}/${immeubleId}/${id}.jpg`;
  try {
    await deposer(chemin, jpeg, "image/jpeg");
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? e.message : String(e) };
  }

  const now = new Date().toISOString();
  await rpc("bo_insert_doc", {
    p_table: "bo_photo",
    p_id: id,
    p_doc: cleanPatch({
      IMMEUBLE: immeubleId,
      image: `storage:${chemin}`,
      compressed: `storage:${chemin}`,
      /* Un type à part : elle ne doit pas être confondue avec une photo du
         bien, et les trois cases de diffusion restent fermées. */
      Type: "Vue de rue",
      format: "image/jpeg",
      largeur: 640,
      hauteur: 480,
      size_kB: Math.round(jpeg.length / 1024),
      order: 999,
      show_in_doss: false,
      show_in_ann: false,
      show_in_est: false,
      date: now,
      "Created Date": now,
      "Modified Date": now,
    }),
  });
  await rpc("bo_patch_doc", {
    p_table: "bo_immeuble",
    p_id: immeubleId,
    p_patch: { photo_main_compressed: `storage:${chemin}`, "Modified Date": now },
  });
  return { ok: true };
}

/**
 * Rattrapage du stock : capture la façade des immeubles qui n'ont pas de photo.
 *
 * Par paquets, pour que l'agent voie l'avancement et puisse s'arrêter. Chaque
 * immeuble n'est traité qu'une fois : dès qu'il a une photo principale, il
 * sort du lot suivant.
 */
export async function capturerFacadesManquantes(paquet = 40): Promise<{
  traites: number; captures: number; echecs: number; restants: number;
}> {
  if (!SB_KEY) return { traites: 0, captures: 0, echecs: 0, restants: 0 };

  const sansPhoto = async (limite: number) => {
    const res = await fetch(
      `${SB_URL}/rest/v1/bo_immeuble` +
        `?or=(data->>photo_main_compressed.is.null,data->>photo_main_compressed.eq.)` +
        /* Les archives ne servent plus à personne : leur capturer une façade
           serait dépenser des appels d'API pour des fiches qu'on ne regarde
           pas. Sur 945 fiches sans photo, 911 sont archivées. */
        `&data->>archived=eq.false&select=id&limit=${limite}`,
      { headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY!}`, Prefer: "count=exact" },
        cache: "no-store" },
    );
    if (!res.ok) return { ids: [] as string[], total: 0 };
    const ids = ((await res.json()) as { id: string }[]).map((r) => r.id);
    const plage = res.headers.get("content-range") ?? "";
    const total = Number(plage.split("/")[1]) || ids.length;
    return { ids, total };
  };

  const { ids, total } = await sansPhoto(Math.max(1, Math.min(200, paquet)));
  let captures = 0;
  let echecs = 0;
  /* En série, volontairement : Google limite le débit par clé, et une rafale
     de quarante appels simultanés se fait rejeter en bloc. */
  for (const id of ids) {
    const r = await capturerFacadeRue(id).catch(() => ({ ok: false as const, raison: "erreur" }));
    if (r.ok && !("deja" in r && r.deja)) captures++;
    else if (!r.ok) echecs++;
  }
  revalidatePath("/", "layout");
  revalidatePath("/immeubles");
  return { traites: ids.length, captures, echecs, restants: Math.max(0, total - captures) };
}

/* ===================== Réglages de l'agence (retour #191) =====================
 *
 * Ce que l'admin règle ici pilote le reste du site : identité imprimée sur les
 * documents, barème d'honoraires, remise en vente directe au locataire.
 *
 * ⚠️ La restriction au seul compte admin n'est PAS encore réelle : le BO n'a
 * aujourd'hui aucune authentification, il n'existe donc pas de « compte agent »
 * à distinguer d'un « compte admin ». L'écran est en place et la porte se
 * fermera le jour où la connexion existera — d'ici là, qui a l'URL a l'accès.
 * Le code à six chiffres demandé par MAV viendra avec cette même livraison.
 */
export async function majReglages(valeurs: Record<string, unknown>) {
  if (!SB_KEY) return { ok: false as const, message: "SUPABASE_SERVICE_ROLE_KEY absente" };
  const res = await fetch(`${SB_URL}/rest/v1/fi_reglages?cle=eq.agence`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ valeurs, maj_le: new Date().toISOString() }),
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) {
    return { ok: false as const, message: `Écriture refusée (${res?.status ?? "réseau"})` };
  }
  /* Les réglages sont lus partout : on décroche l'étiquette et on revalide la
     mise en page, sinon le mandat garderait l'ancien barème en mémoire. */
  const { TAG_REGLAGES } = await import("./reglages");
  revalidateTag(TAG_REGLAGES, { expire: 0 });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
