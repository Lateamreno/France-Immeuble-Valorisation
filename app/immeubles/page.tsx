import { listImmeubles } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function ImmeublesPage() {
  const rows = await listImmeubles().catch(() => []);
  return (
    <div className="lst-page">
      <h1 className="lst-title">Immeubles</h1>
      <ListeShell
        filtres
        rows={rows}
        searchPlaceholder="Recherchez un immeuble..."
        tabs={[
          { key: "en_cours", label: "En cours" },
          { key: "en_attente", label: "En attente" },
          { key: "archives", label: "Archivés" },
        ]}
      />
    </div>
  );
}
