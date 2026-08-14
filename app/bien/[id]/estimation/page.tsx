import Link from "next/link";
import { getBien, getPrixSecteur } from "@/lib/bubble/server";
import { BienFiche } from "@/components/bien-fiche";
import { EstimationWizard } from "@/components/estimation-wizard";
import { mailConfigure } from "@/lib/bo/mail";

export const dynamic = "force-dynamic";

export default async function EstimationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [b, secteur] = await Promise.all([getBien(id).catch(() => null), getPrixSecteur(id)]);
  if (!b) {
    return (
      <div style={{ padding: 40 }}>
        Fiche introuvable. <Link href="/">← Retour au dashboard</Link>
      </div>
    );
  }
  // L'estimation est une page de la fiche, pas une modale : le rail de droite
  // reste là pour consulter l'état locatif, le secteur ou les photos pendant
  // qu'on estime (retour #66).
  return (
    <BienFiche
      b={b}
      contenu={<EstimationWizard b={b} secteur={secteur} envoiActif={mailConfigure()} />}
    />
  );
}
