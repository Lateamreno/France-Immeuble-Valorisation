import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default function EstimationPage() {
  return (
    <>
      <PageHeader
        title="Estimation bloc vs découpe"
        subtitle="Moteur d'estimation à deux modes : lecture vendeur (sans IS ni TVA sur marge) et interne marchand (bilan complet)."
        milestone="M3"
      />
      <ComingSoon
        points={[
          "Mode « lecture vendeur » : valorisation bloc vs découpe, sans fiscalité marchand.",
          "Mode « interne marchand » : bilan complet (TVA sur marge + IS).",
          "Absorbe les 2 outils HTML existants (bilan prévisionnel + Offre V4).",
          "Croisement loyers de marché (loyers_benchmarks) et potentiel locatif.",
        ]}
      />
    </>
  );
}
