import { listVisites } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function VisitesPage() {
  const rows = await listVisites().catch(() => []);
  return (
    <div className="lst-page">
      <h1 className="lst-title">Visites</h1>
      <ListeShell
        rows={rows}
        searchPlaceholder="Recherchez une visite..."
        tabs={[
          { key: "prevues", label: "Prévues" },
          { key: "terminees", label: "Terminées" },
        ]}
      />
    </div>
  );
}
