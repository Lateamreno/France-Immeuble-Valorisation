import "server-only";
// Qui a le droit de régler quoi sur le site et Plein Bail.
//
// Retour #531 : la diffusion était réservée à l'administrateur, reconnu à
// l'agent retenu sur le poste. Depuis la connexion (MAV, 27/10), c'est le
// compte connecté qui fait foi, et MAV a revu la règle : « pour la publication
// sur le site et sur France Immeuble ils y sont autorisés ». Seuls restent à la
// direction les gestes qui engagent tout le parc ou la parole de l'agence sur
// le site (publier un récit de vente, retirer une vente).
//
// Sans compte connecté (le réconciliateur, les crons), c'est le BO lui-même
// qui agit : il passe.
import { getAgents } from "@/lib/bubble/server";
import { authActive, compteCourant } from "@/lib/auth/comptes";
import { AGENT_DEFAUT_INITIALES } from "./agent-defaut";

export const INITIALES_ADMIN = AGENT_DEFAUT_INITIALES;

/** La direction (ou le BO lui-même : réconciliateur, crons). */
export async function estAdmin(agentSlug?: string | null): Promise<boolean> {
  const c = await compteCourant();
  if (c) return c.role === "direction";
  if (authActive()) return true;
  /* Poste non connecté, connexion pas encore imposée : l'ancien garde-fou. */
  if (!agentSlug) return true;
  const a = (await getAgents().catch(() => [])).find((x) => x.slug === agentSlug);
  return (a?.initials ?? INITIALES_ADMIN) === INITIALES_ADMIN;
}

/** Publier ses biens sur le site et Plein Bail : tout agent (MAV, 27/10). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature gardée pour les appels existants
export async function peutDiffuser(agentSlug?: string | null): Promise<boolean> {
  return true;
}

/** Les slugs des agents administrateurs, pour que l'écran sache quoi montrer. */
export async function slugsAdmin(): Promise<string[]> {
  const c = await compteCourant();
  if (c) {
    if (c.role !== "direction") return [];
    const a = (await getAgents().catch(() => [])).find((x) => x.id === c.agent_id);
    return a ? [a.slug] : [];
  }
  return (await getAgents().catch(() => [])).filter((a) => a.initials === INITIALES_ADMIN).map((a) => a.slug);
}

/** Les slugs qui voient les gestes de diffusion à l'écran : tout le monde (MAV, 27/10). */
export async function slugsDiffusion(): Promise<string[]> {
  return (await getAgents().catch(() => [])).map((a) => a.slug);
}

export const REFUS_ADMIN = {
  ok: false as const,
  message: "Réservé à la direction.",
};
