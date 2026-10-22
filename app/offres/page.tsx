import { listOffres } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function OffresPage() {
  const rows = await listOffres().catch(() => []);
  return (
    <div className="lst-page">
      <h1 className="lst-title">Offres</h1>
      <ListeShell
        rows={rows}
        searchPlaceholder="Recherchez une offre..."
        tabs={[
          { key: "en_cours", label: "En cours" },
          { key: "acceptees", label: "Acceptées" },
          { key: "termines", label: "Terminés" },
        ]}
      />
    </div>
  );
}
