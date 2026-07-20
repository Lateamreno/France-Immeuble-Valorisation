import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default function AnalyticsPage() {
  return (
    <div className="content panel">
      <PageHeader
        title="Analytics inter-opérations"
        subtitle="Le moat cumulatif : durée moyenne d'une découpe, marge, meilleur prestataire par type, taux de préemption réel."
        milestone="V2"
      />
      <ComingSoon
        points={[
          "Durée moyenne par phase, sur toutes les opérations.",
          "Marge réalisée bloc vs découpe.",
          "Meilleur prestataire par type (prix / délai / note).",
          "Taux de préemption réel observé.",
        ]}
      />
    </div>
  );
}
