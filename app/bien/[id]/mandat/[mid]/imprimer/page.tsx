// Le mandat imprimable : aperçu à l'écran, source du PDF généré par le
// serveur, et secours si la génération échoue.
//
// Un seul rendu sert l'écran et le PDF. Écrire deux chaînes ferait diverger
// l'aperçu du document signé, ce qui est précisément le genre d'écart qu'on ne
// découvre qu'une fois le mandat parti chez le client.
import Link from "next/link";
import { getAgentFiche, getMandat } from "@/lib/bubble/server";
import { lireMandants } from "@/lib/mandat";
import { redigerMandatBloc } from "@/lib/bo/mandat-doc";
import { MandatDoc } from "@/components/mandat-doc";
import { BarreImpression } from "@/components/barre-impression";
import "../../../../../mandat-doc.css";

export const dynamic = "force-dynamic";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

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

  /* Le téléphone et le courriel du négociateur vivent sur sa fiche, pas sur
     l'agent résumé que porte le mandat. */
  const a = d.agent ? await getAgentFiche(d.agent.id).catch(() => null) : null;

  const { doc, trous } = redigerMandatBloc({
    m: d.m,
    im: d.im ?? {},
    lots: d.lots,
    mandants: lireMandants(d.m),
    /* L'adresse de dénonciation imprimée sur le mandat est celle du
       négociateur qui le suit. Elle est figée à la signature et jamais
       recalculée : si le dossier change de mains en interne, l'adresse portée
       au document reste opposable. */
    negociateur: d.agent
      ? {
          nom: d.agent.name,
          email: S(a?.email) || undefined,
          tel: S(a?.["portable (TXT)"]) || S(a?.portable) || undefined,
        }
      : undefined,
  });

  return (
    <>
      {/* « nu » : rendu sans barre ni décor, c'est ce que capture le PDF. */}
      {!nu && (
        <BarreImpression retour={`/bien/${id}/mandat/${mid}`}>
          {doc.titre}
          {doc.sansNumero ? " — sans numéro de registre" : ` n° ${doc.numero}`}
          {trous.length > 0 ? ` · ${trous.length} information(s) manquante(s)` : ""}
        </BarreImpression>
      )}
      <MandatDoc d={doc} nu={!!nu} />
    </>
  );
}
