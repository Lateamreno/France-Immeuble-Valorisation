import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default function PrestatairesPage() {
  return (
    <div className="content panel">
      <PageHeader
        title="Prestataires & devis"
        subtitle="Annuaire qui grandit à chaque opération, historique des prix cherchable, demandes de devis par email (boîte devis@)."
        milestone="M4"
      />
      <ComingSoon
        points={[
          "Annuaire prestataires (géomètre, diagnostiqueur, notaire, syndic…).",
          "Historique prix cherchable par type + montant.",
          "Modèles d'emails seedés + envoi 1-clic avec PJ (validation humaine avant envoi).",
          "Réception threadée (Gmail API) + comparateur de devis.",
        ]}
      />
    </div>
  );
}
