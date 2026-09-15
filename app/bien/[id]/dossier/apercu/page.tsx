// Le dossier de vente AVANT enregistrement (retour #219).
//
// MAV : « j'aimerais que, quand on génère un nouveau dossier, il soit demandé
// de le télécharger pour le vérifier avant de l'enregistrer. C'est seulement
// quand on l'enregistre que la dernière version du dossier est réellement
// créée. Sinon, dès qu'on modifie quoi que ce soit, on a une infinité de
// dossiers déjà générés. »
//
// D'où cette page jumelle de `[did]/imprimer` : même document, mêmes données,
// mais le prix et le numéro de version viennent de l'écran plutôt que d'une
// ligne en base. Rien n'est créé tant que l'agent n'a pas validé.
import Link from "next/link";
import { getAgentFiche, getBien } from "@/lib/bubble/server";
import { construireDossierVente } from "@/lib/bo/dossier-vente";
import { DossierVente } from "@/components/dossier-vente";
import { BarreImpression } from "@/components/barre-impression";
import "../../../../dossier-vente.css";

export const dynamic = "force-dynamic";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const N = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
};

export default async function ApercuDossier({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nu?: string; hai?: string; pct?: string; v?: string }>;
}) {
  const { id } = await params;
  const { nu, hai, pct, v } = await searchParams;
  const b = await getBien(id).catch(() => null);
  if (!b) {
    return (
      <div style={{ padding: 40 }}>
        Immeuble introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }

  /* Le dossier que l'agent est en train de composer : il n'existe qu'ici, le
     temps qu'il le relise. Les mêmes clés que la ligne enregistrée, pour que
     les deux pages produisent exactement le même document. */
  const doc: Record<string, unknown> = {
    version: v ?? String((b.dossiers.reduce((m, d) => Math.max(m, Number(d.version ?? 0)), 0)) + 1),
    prix_hai: N(hai),
    "honos_taux_%": N(pct),
    date: new Date().toISOString(),
  };

  const a = await getAgentFiche(S(b.im.AGENT)).catch(() => null);
  const d = construireDossierVente(b, doc, a && {
    nom: `${S(a["prénom"])} ${S(a.nom)}`.trim(),
    email: S(a.email),
    tel: S(a["portable (TXT)"]) || S(a.portable),
    photo: S(a.photo),
  });

  return (
    <>
      {!nu && (
        <BarreImpression retour={`/bien/${id}`}>
          Aperçu — dossier complet V{d.version} — {d.adresse}
        </BarreImpression>
      )}
      <DossierVente d={d} nu={!!nu} />
    </>
  );
}
