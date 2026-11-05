import { listEstimations } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function EstimationsPage() {
  const rows = await listEstimations().catch(() => []);
  return (
    <div className="lst-page">
      <h1 className="lst-title">Estimations</h1>
      <ListeShell
        rows={rows}
        searchPlaceholder="Recherchez une estimation..."
        tabs={[
          { key: "en_cours", label: "En cours" },
          { key: "terminees", label: "Terminées" },
        ]}
      />
    </div>
  );
}
