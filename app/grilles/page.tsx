import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default function GrillesPage() {
  return (
    <div className="content panel">
      <PageHeader
        title="Grilles de prix"
        subtitle="Une ligne par lot : valeur libre / occupée, prix net vendeur, rapprochement DVF."
        milestone="M3"
      />
      <ComingSoon
        points={[
          "Grille libre/occupé par listing_lot, prix net vendeur.",
          "Rapprochement DVF (dvf_benchmarks / dvf_annuel) : médiane €/m² + écart.",
          "Honoraires charge vendeur IMPOSÉS sur lots préemptables (garde-fou §8.2).",
        ]}
      />
    </div>
  );
}
