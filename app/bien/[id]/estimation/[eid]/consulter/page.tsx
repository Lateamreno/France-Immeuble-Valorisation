// Consulter une estimation passée, en lecture seule (tâche #55).
//
// Servie par les valeurs figées de l'enregistrement, pas par la fiche : c'est
// tout l'intérêt. La fiche montre l'immeuble aujourd'hui, cet écran montre ce
// qu'on a envoyé au propriétaire à l'époque.
//
// Comme le reste de l'estimation, il se monte DANS la fiche (retour #125) :
// cette route n'est qu'un point d'entrée direct.
import Link from "next/link";
import { getBien, getOperation, getPrixSecteur } from "@/lib/bubble/server";
import { ouvrirEstimation } from "@/lib/bo/actions";
import { BienFiche } from "@/components/bien-fiche";
import { envoiPossible } from "@/lib/bo/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ConsulterEstimation({
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
      envoiActif={await envoiPossible()}
      cleEcran={`consulter:${eid}`}
      ouvrir={{
        mode: "lecture", reprise: ecran.reprise, lecture: ecran.lecture, ecarts: ecran.ecarts,
      }}
    />
  );
}
