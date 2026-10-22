import { TopBar } from "@/components/topbar";
import { DashboardBlocs } from "@/components/dashboard-blocs";
import { DASHBOARD } from "@/lib/data/dashboard";
import Link from "next/link";
import { getDashboardLive, getAgents } from "@/lib/bubble/server";
import { ventesAPublier } from "@/lib/bo/ventes-site";
import { demandesDossierOuvertes } from "@/lib/bo/leads-site";

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

  /* Les ventes neuves qui attendent d'être publiées sur le site (contrat
     §4) : un rappel ici, en rouge au-delà de sept jours, jamais un e-mail. */
  const agentId = actifs.find((a) => a.slug === slug)?.id;
  const [vap, demandes] = await Promise.all([
    ventesAPublier().catch(() => null),
    /* Les demandes de dossier venues des fiches à vendre du site (lot 3) :
       à l'agent du bien, qui appelle avant d'envoyer. */
    agentId ? demandesDossierOuvertes(agentId).catch(() => 0) : Promise.resolve(0),
  ]);

  return (
    <>
      <TopBar title="Dashboard" enCours={enCours} enAttente={enAttente} vue={onglet}
        agent={agentName} agentSlug={slug} recherche={q}
        agents={agentList.filter((a) => a.actif).map((a) => ({ slug: a.slug, name: a.name.split(' ')[0], couleur: a.color }))} />
      {liveError && (
        <div style={{ margin: "10px 26px -6px", fontSize: 12, color: "var(--late, #a85a3a)", fontWeight: 700 }}>{liveError}</div>
      )}
      {demandes > 0 && (
        <Link href="/questions" className="vs-bandeau">
          {demandes} demande{demandes > 1 ? "s" : ""} du site à traiter
        </Link>
      )}
      {vap && vap.nombre > 0 && (
        <Link href="/ventes-site" className={`vs-bandeau${vap.enRetard ? " ko" : ""}`}>
          {vap.nombre} vente{vap.nombre > 1 ? "s" : ""} à publier sur le site
          {vap.enRetard > 0 && `, dont ${vap.enRetard} depuis plus de sept jours`}
        </Link>
      )}
      <DashboardBlocs blocs={blocs} mock={!!liveError} recherche={q}
        agents={agentList.filter((a) => a.actif).map((a) => ({ id: a.id, name: a.name }))} />
    </>
  );
}
