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
