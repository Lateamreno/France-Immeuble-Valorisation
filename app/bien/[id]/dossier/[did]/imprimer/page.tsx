// Le dossier complet de vente, en version imprimable — et source du PDF.
//
// Retour #184 : le PDF que France Immeuble envoie fait huit pages ; celui-ci
// n'en faisait qu'une, avec trois chiffres. Il est refait à l'identique du
// document de référence (Drancy v3), alimenté par la fiche.
//
// Le prix vient du dossier enregistré, figé le jour de la génération ; tout le
// reste vient de la fiche, donc de l'état du bien aujourd'hui. Voir
// `lib/bo/dossier-vente.ts` pour la raison de ce partage.
import Link from "next/link";
import { getAgentFiche, getBien } from "@/lib/bubble/server";
import { construireDossierVente } from "@/lib/bo/dossier-vente";
import { DossierVente } from "@/components/dossier-vente";
import { BarreImpression } from "@/components/barre-impression";
import "../../../../../dossier-vente.css";

export const dynamic = "force-dynamic";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export default async function ImprimerDossier({
  params, searchParams,
}: {
  params: Promise<{ id: string; did: string }>;
  searchParams: Promise<{ nu?: string }>;
}) {
  const { id, did } = await params;
  const { nu } = await searchParams;
  const b = await getBien(id).catch(() => null);
  const doc = b?.dossiers.find((x) => String(x._id) === did);
  if (!b || !doc) {
    return (
      <div style={{ padding: 40 }}>
        Dossier introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }

  /* Le contact dédié imprimé en couverture : celui qui a créé le dossier, à
     défaut celui qui suit l'immeuble. */
  const agentId = S(doc.AGENT_CREATOR) || S(doc.AGENT_SUIVI) || S(b.im.AGENT);
  const a = await getAgentFiche(agentId).catch(() => null);
  const d = construireDossierVente(b, doc, a && {
    nom: `${S(a["prénom"])} ${S(a.nom)}`.trim(),
    email: S(a.email),
    tel: S(a["portable (TXT)"]) || S(a.portable),
    photo: S(a.photo),
  });

  return (
    <>
      {/* « nu » : rendu sans barre ni décor, c'est ce que capture le PDF. */}
      {!nu && (
        <BarreImpression retour={`/bien/${id}`}>
          Dossier complet V{d.version} — {d.adresse}
        </BarreImpression>
      )}
      <DossierVente d={d} nu={!!nu} />
    </>
  );
}
