import { getAgents, listQuestionsBO } from "@/lib/bubble/server";
import { EcranQuestions } from "@/components/questions";

export const dynamic = "force-dynamic";

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent = "marc-antoine" } = await searchParams;
  const [rows, agents] = await Promise.all([
    listQuestionsBO().catch(() => []),
    getAgents().catch(() => []),
  ]);
  /* Le commercial qui traite : celui du BO, comme sur le dashboard. C'est lui
     qu'on inscrit sur le contact créé et sur le suivi. */
  const actifs = agents.filter((a) => a.actif);
  const courant = actifs.find((a) => a.slug === agent) ?? actifs[0];

  return <EcranQuestions rows={rows} agentId={courant?.id ?? ""} />;
}
