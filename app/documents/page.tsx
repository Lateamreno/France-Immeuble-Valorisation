import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default function DocumentsPage() {
  return (
    <>
      <PageHeader
        title="Documents & mandats"
        subtitle="Générateur propal / mission / mandat, bibliothèque de clauses, registre des mandats séquentiel (conformité Hoguet)."
        milestone="M5"
      />
      <ComingSoon
        points={[
          "Générateur propal / contrat de mission / mandat (fusion données).",
          "Bibliothèque de clauses réutilisables.",
          "Registre des mandats séquentiel, immuable, sans trou (garde-fou §8.1).",
          "Coffre documentaire (extension listing_documents).",
        ]}
      />
    </>
  );
}
