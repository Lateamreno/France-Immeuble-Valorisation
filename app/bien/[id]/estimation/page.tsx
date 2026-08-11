import Link from "next/link";
import { getBien, getPrixSecteur } from "@/lib/bubble/server";
import { EstimationWizard } from "@/components/estimation-wizard";

export const dynamic = "force-dynamic";

export default async function EstimationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [b, secteur] = await Promise.all([
    getBien(id).catch(() => null),
    getPrixSecteur(id),
  ]);
  if (!b) {
    return (
      <div style={{ padding: 40 }}>
        Fiche introuvable. <Link href="/">← Retour au dashboard</Link>
      </div>
    );
  }
  return <EstimationWizard b={b} secteur={secteur} />;
}
