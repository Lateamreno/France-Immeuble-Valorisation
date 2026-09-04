import { listMandats } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function MandatsPage() {
  const rows = await listMandats().catch(() => []);
  return (
    <div className="lst-page">
      <h1 className="lst-title">Mandats</h1>
      <ListeShell
        rows={rows}
        searchPlaceholder="Recherchez un mandat..."
        tabs={[
          { key: "a_signer", label: "A signer" },
          { key: "en_cours", label: "En cours" },
          { key: "termines", label: "Terminés" },
        ]}
      />
    </div>
  );
}
