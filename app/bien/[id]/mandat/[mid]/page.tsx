import Link from "next/link";
import { getBien, getMandat, getOperation } from "@/lib/bubble/server";
import { BienFiche } from "@/components/bien-fiche";
import { MandatFiche } from "@/components/mandat-fiche";

export const dynamic = "force-dynamic";
// Génération du PDF : Chromium met quelques secondes à démarrer à froid.
export const maxDuration = 60;

/**
 * Le mandat est une PAGE DE LA FICHE, pas une modale (retour #100).
 *
 * On perdait le rail de droite en ouvrant un mandat : impossible d'aller
 * vérifier l'état locatif ou une photo sans tout fermer. Même montage que
 * l'estimation en cours — l'écran occupe toute la largeur, le rail reste.
 */
export default async function MandatDansFiche({
  params,
}: {
  params: Promise<{ id: string; mid: string }>;
}) {
  const { id, mid } = await params;
  const [b, d] = await Promise.all([
    getBien(id).catch(() => null),
    getMandat(mid).catch(() => null),
  ]);
  if (!b || !d) {
    return (
      <div style={{ padding: 40 }}>
        Mandat introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }
  const operation = await getOperation(id).catch(() => null);

  return (
    <BienFiche
      b={b}
      operation={operation}
      contenu={<MandatFiche d={d} />}
      contenuLabel={`Mandat ${d.m.numero ? `n° ${d.m.numero}` : "en cours"}`}
      contenuIcone="mandat"
      /* L'identifiant demandé : sans lui, cliquer sur un autre mandat changeait
         l'adresse sans rouvrir l'écran (retour #137). */
      cleEcran={`mandat:${mid}`}
    />
  );
}
