import { getAgents, listRecherchesBO } from "@/lib/bubble/server";
import { EcranRecherches } from "@/components/recherches";

export const dynamic = "force-dynamic";

export default async function RecherchesPage() {
  const [rows, agents] = await Promise.all([
    listRecherchesBO().catch(() => []),
    getAgents().catch(() => []),
  ]);
  /* Perf n° 3 (24/09) : la page part avec les cent vingt premières cartes ;
     l'écran va chercher le reste dès qu'il est affiché. */
  return (
    <EcranRecherches
      premieres={rows.slice(0, 120)}
      total={rows.length}
      agents={agents.filter((a) => a.actif).map((a) => ({ id: a.id, name: a.name, initials: a.initials }))}
    />
  );
}
