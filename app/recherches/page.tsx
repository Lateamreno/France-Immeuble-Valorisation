import { getAgents, listRecherchesBO } from "@/lib/bubble/server";
import { EcranRecherches } from "@/components/recherches";

export const dynamic = "force-dynamic";

export default async function RecherchesPage() {
  const [rows, agents] = await Promise.all([
    listRecherchesBO().catch(() => []),
    getAgents().catch(() => []),
  ]);
  return (
    <EcranRecherches
      rows={rows}
      agents={agents.map((a) => ({ id: a.id, name: a.name, initials: a.initials }))}
    />
  );
}
