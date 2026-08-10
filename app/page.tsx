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
  const { agent = "marc-antoine" } = await searchParams;
  const slug = agent in AGENT_IDS ? agent : "marc-antoine";

  let blocs = DASHBOARD;
  let agentName = "Marc-Antoine";
  let enCours = 5;
  let liveError: string | null = null;

  try {
    const live = await getDashboardLive(slug);
    if (live) {
      blocs = live.blocs;
      agentName = live.agentName;
      enCours = live.enCours;
    } else {
      liveError =
        "Mode démonstration : ajoutez SUPABASE_SERVICE_ROLE_KEY (projet france-immeuble-bo) dans les variables Vercel — scopes Production ET Preview — puis redéployez.";
    }
  } catch (e) {
    liveError = `Lecture données indisponible (${e instanceof Error ? e.message : "erreur"}) — mode démonstration.`;
  }

  return (
    <>
      <TopBar title="Dashboard" enCours={enCours} agent={agentName} agentSlug={slug} />
      {liveError && (
        <div style={{ margin: "10px 26px -6px", fontSize: 12, color: "var(--late, #a85a3a)", fontWeight: 700 }}>{liveError}</div>
      )}
      <DashboardBlocs blocs={blocs} mock={!!liveError} />
    </>
  );
}
