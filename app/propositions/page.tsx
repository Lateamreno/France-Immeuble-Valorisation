import { listPropositions } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function PropositionsPage() {
  const rows = await listPropositions().catch(() => []);
  return (
    <div className="lst-page">
      <h1 className="lst-title">Propositions</h1>
      <div style={{ fontSize: 12, color: "var(--gray-txt)", marginBottom: 8 }}>
        Les 300 propositions les plus récentes (la base en compte ~27 500).
      </div>
      <ListeShell
        rows={rows}
        searchPlaceholder="Recherchez une proposition..."
        tabs={[
          { key: "en_cours", label: "En cours" },
          { key: "terminees", label: "Terminées" },
        ]}
      />
    </div>
  );
}
