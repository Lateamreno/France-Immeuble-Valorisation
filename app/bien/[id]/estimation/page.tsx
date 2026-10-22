import Link from "next/link";
import { getBien, getOperation, getPrixSecteur } from "@/lib/bubble/server";
import { BienFiche } from "@/components/bien-fiche";
import { envoiPossible } from "@/lib/bo/mail";

export const dynamic = "force-dynamic";
// Fabrication du PDF : le navigateur met quelques secondes à démarrer à froid.
export const maxDuration = 60;

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
  const operation = await getOperation(id).catch(() => null);

  // L'estimation n'est PAS une page à part : c'est un écran de la fiche
  // (retour #125). Cette route n'est plus qu'un point d'entrée direct — elle
  // monte la fiche avec l'estimation déjà ouverte, et à partir de là tout se
  // passe sans changer d'URL.
  return (
    <BienFiche
      b={b}
      operation={operation}
      secteur={secteur}
      envoiActif={await envoiPossible()}
      cleEcran={`estimation:neuve`}
      ouvrir={{ mode: "neuve" }}
    />
  );
}
