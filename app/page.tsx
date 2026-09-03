import { TopBar } from "@/components/topbar";
import { DashboardBlocs } from "@/components/dashboard-blocs";
import { DASHBOARD } from "@/lib/data/dashboard";
import { getDashboardLive, getAgents } from "@/lib/bubble/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; vue?: string; q?: string }>;
}) {
  const { agent = "marc-antoine", vue, q = "" } = await searchParams;
  const onglet = vue === "attente" ? "attente" : "cours";
  const agentList = await getAgents().catch(() => []);
  const actifs = agentList.filter((a) => a.actif);
  const slug = actifs.some((a) => a.slug === agent) ? agent : (actifs[0]?.slug ?? "marc-antoine");

  let blocs = DASHBOARD;
  let agentName = "Marc-Antoine";
  let enCours = 5;
  let enAttente = 0;
  let liveError: string | null = null;

  try {
    const live = await getDashboardLive(slug, onglet);
    if (live) {
      blocs = live.blocs;
      agentName = live.agentName;
      enCours = live.enCours;
      enAttente = live.enAttente;
    } else {
      liveError =
        "Mode démonstration : ajoutez SUPABASE_SERVICE_ROLE_KEY (projet france-immeuble-bo) dans les variables Vercel — scopes Production ET Preview — puis redéployez.";
    }
  } catch (e) {
    liveError = `Lecture données indisponible (${e instanceof Error ? e.message : "erreur"}) — mode démonstration.`;
  }

  return (
    <>
      <TopBar title="Dashboard" enCours={enCours} enAttente={enAttente} vue={onglet}
        agent={agentName} agentSlug={slug} recherche={q}
        agents={agentList.filter((a) => a.actif).map((a) => ({ slug: a.slug, name: a.name.split(' ')[0] }))} />
      {liveError && (
        <div style={{ margin: "10px 26px -6px", fontSize: 12, color: "var(--late, #a85a3a)", fontWeight: 700 }}>{liveError}</div>
      )}
      <DashboardBlocs blocs={blocs} mock={!!liveError} recherche={q}
        agents={agentList.filter((a) => a.actif).map((a) => ({ id: a.id, name: a.name }))} />
    </>
  );
}
