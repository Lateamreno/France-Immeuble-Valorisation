import { TopBar } from "@/components/topbar";
import { DashboardBlocs } from "@/components/dashboard-blocs";
import { DASHBOARD } from "@/lib/data/dashboard";
import { getDashboardLive, AGENT_IDS } from "@/lib/bubble/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent = "romain" } = await searchParams;
  const slug = agent in AGENT_IDS ? agent : "romain";

  let blocs = DASHBOARD;
  let agentName = "Romain";
  let enCours = 5;
  let liveError: string | null = null;

  try {
    const live = await getDashboardLive(slug);
    if (live) {
      blocs = live.blocs;
      agentName = live.agentName;
      enCours = live.enCours;
    } else {
      liveError = "BUBBLE_API_TOKEN absent — affichage des données de démonstration.";
    }
  } catch (e) {
    liveError = `Lecture Bubble indisponible (${e instanceof Error ? e.message : "erreur"}) — données de démonstration.`;
  }

  return (
    <>
      <TopBar title="Dashboard" enCours={enCours} agent={agentName} agentSlug={slug} />
      {liveError && (
        <div style={{ margin: "10px 26px -6px", fontSize: 12, color: "var(--gray-lt)" }}>{liveError}</div>
      )}
      <DashboardBlocs blocs={blocs} />
    </>
  );
}
