import "server-only";
// Qui a le droit de régler la diffusion (retour #531 : « il ne faut pas que
// les autres puissent faire ça, même avec leurs immeubles ; c'est moi, en tant
// qu'administrateur »).
//
// Le BO n'a pas encore de connexion : l'agent aux commandes est celui que le
// poste a retenu, et MAV quand aucun ne l'est. C'est donc un garde-fou, pas
// une sécurité — il tiendra pour de bon le jour où la connexion existera, et
// seule cette fonction changera.
import { getAgents } from "@/lib/bubble/server";
import { AGENT_DEFAUT_INITIALES } from "./agent-defaut";

export const INITIALES_ADMIN = AGENT_DEFAUT_INITIALES;

export async function estAdmin(agentSlug?: string | null): Promise<boolean> {
  if (!agentSlug) return true;
  const a = (await getAgents().catch(() => [])).find((x) => x.slug === agentSlug);
  return (a?.initials ?? INITIALES_ADMIN) === INITIALES_ADMIN;
}

/** Les slugs des agents administrateurs, pour que l'écran sache quoi montrer. */
export async function slugsAdmin(): Promise<string[]> {
  return (await getAgents().catch(() => [])).filter((a) => a.initials === INITIALES_ADMIN).map((a) => a.slug);
}

export const REFUS_ADMIN = {
  ok: false as const,
  message: "Réservé à l'administrateur : la diffusion se règle depuis le poste de MAV.",
};
