// L'avenant de prix imprimable : aperçu à l'écran et source du PDF.
//
// Même chaîne que le mandat (`../../../imprimer`) : un seul rendu pour l'écran
// et le PDF, `?nu=1` pour la capture sans barre.
import Link from "next/link";
import { getAgentFiche, getMandat } from "@/lib/bubble/server";
import { lireMandants } from "@/lib/mandat";
import { redigerAvenantPrix } from "@/lib/bo/avenant-doc";
import { AvenantDoc } from "@/components/avenant-doc";
import { BarreImpression } from "@/components/barre-impression";
import "../../../../../../../mandat-doc.css";

export const dynamic = "force-dynamic";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export default async function ImprimerAvenant({
  params, searchParams,
}: {
  params: Promise<{ id: string; mid: string; n: string }>;
  searchParams: Promise<{ nu?: string }>;
}) {
  const { id, mid, n } = await params;
  const { nu } = await searchParams;
  const d = await getMandat(mid).catch(() => null);
  if (!d) {
    return (
      <div style={{ padding: 40 }}>
        Mandat introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }
  const a = d.agent ? await getAgentFiche(d.agent.id).catch(() => null) : null;

  const { doc, trous } = redigerAvenantPrix({
    m: d.m,
    im: d.im ?? {},
    lots: d.lots,
    mandants: lireMandants(d.m),
    negociateur: d.agent
      ? {
          nom: d.agent.name,
          email: S(a?.email) || undefined,
          tel: S(a?.["portable (TXT)"]) || S(a?.portable) || undefined,
        }
      : undefined,
  }, Number(n) || 0);

  return (
    <>
      {!nu && (
        <BarreImpression retour={`/bien/${id}/mandat/${mid}`}>
          {doc.titre} · mandat n° {doc.numeroMandat}
          {trous.length > 0 ? ` · ${trous.length} information(s) manquante(s)` : ""}
        </BarreImpression>
      )}
      <AvenantDoc d={doc} nu={!!nu} />
    </>
  );
}
