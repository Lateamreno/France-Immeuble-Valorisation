"use server";

/* Les gestes sur les réponses des acquéreurs (MAV, 12/11) : la cloche du menu,
 * la fiche du bien et le tableau de bord passent par ici. Chaque agent ne voit
 * dans la cloche que les réponses aux dossiers qu'il a envoyés. */

import { revalidatePath } from "next/cache";
import { compteCourant } from "@/lib/auth/comptes";
import {
  compterReponses, marquerTraitees, reponsesDe, reponsesDuBien, traiterProposition,
} from "@/lib/bo/reponses";

const moi = async () => (await compteCourant())?.agent_id ?? null;

export async function chargerMesReponses(quoi: "a_traiter" | "toutes" = "a_traiter") {
  const agent = await moi();
  const [reponses, total] = await Promise.all([reponsesDe(agent, quoi), compterReponses(agent)]);
  return { reponses, total };
}

export async function compterMesReponses() {
  return compterReponses(await moi());
}

export async function chargerReponsesDuBien(immeubleId: string) {
  return reponsesDuBien(immeubleId);
}

export async function traiterReponses(ids: string[], immeubleId?: string) {
  await marquerTraitees(ids, await moi());
  if (immeubleId) revalidatePath(`/bien/${immeubleId}`);
  revalidatePath("/");
}

/** Noter ce que l'acquéreur a répondu, depuis la notification : la note va sur la proposition, la réponse est traitée. */
export async function noterEtTraiter(input: { propositionId: string; immeubleId?: string; texte: string }) {
  if (!input.texte.trim()) return { ok: false as const, message: "Le retour est vide." };
  const { noterRetour } = await import("@/lib/bo/relances-actions");
  await noterRetour(input.propositionId, input.texte, input.immeubleId);
  await traiterProposition(input.propositionId, await moi());
  revalidatePath("/");
  return { ok: true as const };
}

/** Refuser la proposition depuis la notification (motif obligatoire), et la traiter. */
export async function refuserEtTraiter(input: { propositionId: string; immeubleId: string; motif: string }) {
  if (!input.motif.trim()) return { ok: false as const, message: "Indiquez le motif du refus." };
  const { setPropositionStatut } = await import("@/lib/bo/actions");
  await setPropositionStatut(input.immeubleId, input.propositionId, "refuser", input.motif.trim());
  await traiterProposition(input.propositionId, await moi());
  revalidatePath("/");
  return { ok: true as const };
}
