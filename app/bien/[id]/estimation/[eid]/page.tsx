import Link from "next/link";
import { getBien, getOperation, getPrixSecteur } from "@/lib/bubble/server";
import { ouvrirEstimation } from "@/lib/bo/actions";
import { BienFiche } from "@/components/bien-fiche";
import { mailConfigure } from "@/lib/bo/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rouvrir une estimation déjà faite pour l'envoyer (retour #98).
 *
 * On ne repasse pas par le calcul : l'écran s'ouvre sur l'étape Envoi, avec
 * le dossier PDF d'origine en pièce jointe. Refaire une estimation pour
 * pouvoir la renvoyer, c'était le contraire de ce qu'il faut.
 *
 * Comme le reste, ça se monte DANS la fiche (retour #125) : cette route est un
 * point d'entrée direct, pas une page à part.
 */
export default async function ReprendreEstimation({
  params,
}: {
  params: Promise<{ id: string; eid: string }>;
}) {
  const { id, eid } = await params;
  const [b, ecran, secteur] = await Promise.all([
    getBien(id).catch(() => null),
    ouvrirEstimation(eid).catch(() => null),
    getPrixSecteur(id),
  ]);
  if (!b || !ecran) {
    return (
      <div style={{ padding: 40 }}>
        Estimation introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }
  const operation = await getOperation(id).catch(() => null);

  return (
    <BienFiche
      b={b}
      operation={operation}
      secteur={secteur}
      envoiActif={mailConfigure()}
      ouvrir={{ mode: "reprise", reprise: ecran.reprise, lecture: ecran.lecture }}
    />
  );
}
