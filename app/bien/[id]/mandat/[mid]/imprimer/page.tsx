// Le mandat imprimable : aperçu à l'écran, source du PDF généré par le
// serveur, et secours si la génération échoue. Même principe que le dossier
// d'estimation — une seule mise en forme à maintenir.
import Link from "next/link";
import { getMandat } from "@/lib/bubble/server";
import { lireMandants } from "@/lib/mandat";
import { redigerMandat } from "@/lib/mandat-texte";
import { MandatDocument } from "@/components/mandat-document";
import { BarreImpression } from "@/components/barre-impression";
import "../../../../../mandat.css";

export const dynamic = "force-dynamic";

export default async function ImprimerMandat({
  params, searchParams,
}: {
  params: Promise<{ id: string; mid: string }>;
  searchParams: Promise<{ nu?: string }>;
}) {
  const { id, mid } = await params;
  const { nu } = await searchParams;
  const d = await getMandat(mid).catch(() => null);
  if (!d) {
    return (
      <div style={{ padding: 40 }}>
        Mandat introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }

  const texte = redigerMandat({
    m: d.m,
    im: d.im,
    lots: d.lots,
    mandants: lireMandants(d.m),
    agent: d.agent ? { nom: d.agent.name } : undefined,
  });

  return (
    <>
      {/* « nu » : rendu sans barre ni décor, c'est ce que capture le PDF. */}
      {!nu && (
        <BarreImpression retour={`/bien/${id}/mandat/${mid}`}>
          {texte.titre}
          {texte.numero ? ` n° ${texte.numero}` : " — sans numéro"}
          {texte.trous.length > 0 ? ` · ${texte.trous.length} information(s) manquante(s)` : ""}
        </BarreImpression>
      )}
      <MandatDocument
        d={texte}
        nu={!!nu}
        lieu={typeof d.im?.adresse_ville === "string" ? String(d.im.adresse_ville) : undefined}
      />
    </>
  );
}
