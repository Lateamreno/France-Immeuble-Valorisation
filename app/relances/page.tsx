import { getAgents } from "@/lib/bubble/server";
import { EcranRelances } from "@/components/relances";

export const dynamic = "force-dynamic";

/**
 * L'écran Relances.
 *
 * Le nom et le téléphone de l'agent servent à signer le message proposé. On
 * prend le premier agent actif à défaut de connexion : le BO n'a pas encore
 * d'authentification, et un message signé « undefined » serait pire que pas de
 * signature du tout.
 */
export default async function RelancesPage() {
  const agents = await getAgents().catch(() => []);
  const a = agents.find((x) => x.actif);
  return <EcranRelances agent={a ? { id: a.id, nom: a.name, tel: a.tel } : undefined} />;
}
