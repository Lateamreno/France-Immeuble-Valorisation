import { PageHeader } from "@/components/page-header";
import { ComingSoon } from "@/components/coming-soon";

export default function CommunicationsPage() {
  return (
    <div className="content panel">
      <PageHeader
        title="Communications"
        subtitle="Messagerie opérationnelle threadée (boîte devis@) : prestataires, indivisaires, extranets — validation humaine avant tout envoi."
        milestone="M4"
      />
      <ComingSoon
        points={[
          "Threads rattachés à l'opération, au prestataire ou à l'indivisaire.",
          "Modèles d'emails seedés, envoi 1-clic avec pièces jointes.",
          "Réception threadée via Gmail API (boîte devis@).",
          "Aucun envoi automatique en masse — l'app prépare, l'humain envoie.",
        ]}
      />
    </div>
  );
}
