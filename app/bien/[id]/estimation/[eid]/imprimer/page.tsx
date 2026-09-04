// Dossier d'estimation en 6 pages A4 — la pièce jointe envoyée au
// propriétaire. La page sert à la fois d'aperçu à l'écran, de source du PDF
// généré par le serveur (voir app/api/estimation/[eid]/pdf) et de secours
// imprimable si la génération échoue.
import Link from "next/link";
import { getEstimation, getAgentFiche } from "@/lib/bubble/server";
import { construireDossier } from "@/lib/bo/dossier";
import { DossierEstimation } from "@/components/dossier-estimation";
import { BarreImpression } from "@/components/barre-impression";
import "../../../../../dossier.css";

export const dynamic = "force-dynamic";

export default async function ImprimerEstimation({
  params, searchParams,
}: {
  params: Promise<{ id: string; eid: string }>;
  searchParams: Promise<{ nu?: string }>;
}) {
  const { id, eid } = await params;
  const { nu } = await searchParams;
  const e = await getEstimation(eid);
  if (!e || e.IMMEUBLE !== id) {
    return (
      <div style={{ padding: 40 }}>
        Estimation introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }

  const agent = await getAgentFiche(String(e.ESTIMATOR ?? "")).catch(() => null);
  const d = construireDossier(e, agent);

  return (
    <>
      {/* « nu » : rendu sans barre ni décor, utilisé par la génération PDF. */}
      {!nu && (
        <BarreImpression retour={`/bien/${id}`}>
          Dossier figé au {d.date} — 6 pages
        </BarreImpression>
      )}
      <DossierEstimation d={d} nu={!!nu} />
    </>
  );
}
