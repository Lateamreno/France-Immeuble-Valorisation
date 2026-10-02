import { listSuivis } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function SuiviPage() {
  const rows = await listSuivis().catch(() => []);
  return (
    <div className="lst-page">
      <h1 className="lst-title">Suivi et rappels</h1>
      <ListeShell
        rows={rows}
        searchPlaceholder="Recherchez un suivi..."
        tabs={[
          { key: "en_cours", label: "En cours" },
          { key: "termines", label: "Terminés" },
        ]}
      />
    </div>
  );
}
