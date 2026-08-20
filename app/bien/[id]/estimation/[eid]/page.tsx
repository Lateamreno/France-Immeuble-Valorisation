import Link from "next/link";
import { getBien, getEstimation, getOperation, getPrixSecteur } from "@/lib/bubble/server";
import { BienFiche } from "@/components/bien-fiche";
import { EstimationWizard } from "@/components/estimation-wizard";
import { mailConfigure } from "@/lib/bo/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Rouvrir une estimation déjà faite pour l'envoyer (retour #98).
 *
 * On ne repasse pas par le calcul : l'écran s'ouvre sur l'étape Envoi, avec
 * le dossier PDF d'origine en pièce jointe. Refaire une estimation pour
 * pouvoir la renvoyer, c'était le contraire de ce qu'il faut.
 */
export default async function ReprendreEstimation({
  params,
}: {
  params: Promise<{ id: string; eid: string }>;
}) {
  const { id, eid } = await params;
  const [b, e, secteur] = await Promise.all([
    getBien(id).catch(() => null),
    getEstimation(eid).catch(() => null),
    getPrixSecteur(id),
  ]);
  if (!b || !e) {
    return (
      <div style={{ padding: 40 }}>
        Estimation introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }
  const operation = await getOperation(id).catch(() => null);

  // Le dossier PDF déjà fabriqué, s'il est au coffre.
  const doc = b.documents.find((d) => String(d.ESTIMATION ?? "") === eid);
  const chemin = S(doc?.path);
  const poids = N(doc?.size_kB);

  return (
    <BienFiche
      b={b}
      operation={operation}
      contenu={
        <EstimationWizard
          b={b}
          secteur={secteur}
          envoiActif={mailConfigure()}
          reprise={{
            id: eid,
            titre: S(e.titre),
            pdfUrl: chemin ? `/api/photo?s=${encodeURIComponent(chemin)}` : undefined,
            pdfKo: poids,
            hai: N(e.prix_hai),
            nv: N(e.prix_nv) ?? N(e["[SUPPR] prix_nv"]),
            creeLe: S(e["Created Date"]),
            statut: S(e.Statut),
          }}
        />
      }
      contenuLabel="Estimation à envoyer"
    />
  );
}
