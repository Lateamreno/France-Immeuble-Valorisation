// Consulter une estimation passée, en lecture seule (tâche #55).
//
// Servie par les valeurs figées de l'enregistrement, pas par la fiche : c'est
// tout l'intérêt. La fiche montre l'immeuble aujourd'hui, cette page montre ce
// qu'on a envoyé au propriétaire à l'époque.
import Link from "next/link";
import { getAgentFiche, getBien, getEstimation, getOperation } from "@/lib/bubble/server";
import { lireEstimation } from "@/lib/bo/estimation-lecture";
import { BienFiche } from "@/components/bien-fiche";
import { EstimationEnLecture } from "@/components/estimation-lecture";

export const dynamic = "force-dynamic";

export default async function ConsulterEstimation({
  params,
}: {
  params: Promise<{ id: string; eid: string }>;
}) {
  const { id, eid } = await params;
  const [b, e] = await Promise.all([
    getBien(id).catch(() => null),
    getEstimation(eid).catch(() => null),
  ]);
  if (!b || !e) {
    return (
      <div style={{ padding: 40 }}>
        Estimation introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }

  const [agent, operation] = await Promise.all([
    getAgentFiche(String(e.ESTIMATOR ?? "")).catch(() => null),
    getOperation(id).catch(() => null),
  ]);

  // Le PDF envoyé, s'il est au coffre.
  const doc = b.documents.find((d) => String(d.ESTIMATION ?? "") === eid);
  const chemin = typeof doc?.path === "string" ? doc.path : undefined;

  return (
    <BienFiche
      b={b}
      operation={operation}
      contenu={
        <EstimationEnLecture
          e={lireEstimation(e, agent)}
          immeubleId={id}
          pdfUrl={chemin ? `/api/photo?s=${encodeURIComponent(chemin)}` : undefined}
        />
      }
      contenuLabel="Estimation consultée"
    />
  );
}
