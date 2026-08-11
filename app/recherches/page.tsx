import { listRecherches } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function RecherchesPage() {
  const rows = await listRecherches().catch(() => []);
  return (
    <div className="lst-page">
      <h1 className="lst-title">Recherches</h1>
      <ListeShell
        rows={rows}
        searchPlaceholder="Recherchez une recherche acquéreur..."
        tabs={[
          { key: "en_cours", label: "En cours" },
          { key: "archivees", label: "Archivées" },
        ]}
      />
    </div>
  );
}
