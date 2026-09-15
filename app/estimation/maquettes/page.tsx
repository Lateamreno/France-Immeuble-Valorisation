// Les quatre propositions graphiques du dossier d'estimation (tâche #54).
//
// Rendues avec une VRAIE estimation, pas un exemple : c'est la seule façon de
// juger. Un dossier maquetté sur des chiffres ronds ne dit pas ce que devient
// la mise en page quand l'analyse fait douze lignes et le prix sept chiffres.
import Link from "next/link";
import { getAgentFiche, getEstimation } from "@/lib/bubble/server";
import { construireDossier } from "@/lib/bo/dossier";
import { ChoixMaquettes } from "@/components/dossier/maquettes";
import "../../maquettes.css";

export const dynamic = "force-dynamic";

/** Estimation servie par défaut : complète (analyse, références, loyers). */
const DEFAUT = "1787577474537x209957499059830800";

export default async function MaquettesPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e: demandee } = await searchParams;
  const e = await getEstimation(demandee || DEFAUT).catch(() => null);

  if (!e) {
    /* Le miroir est réécrit chaque nuit : l'estimation témoin peut disparaître.
       On le dit plutôt que d'afficher un dossier bâti sur des zéros. */
    return (
      <div style={{ padding: 40, maxWidth: 560, lineHeight: 1.6 }}>
        <p>
          L&apos;estimation servant d&apos;exemple n&apos;est plus dans le miroir.
          Ajoutez <code>?e=</code> suivi de l&apos;identifiant d&apos;une estimation
          pour afficher les maquettes avec celle-ci.
        </p>
        <Link href="/estimations">← Choisir une estimation</Link>
      </div>
    );
  }

  const agent = await getAgentFiche(String(e.ESTIMATOR ?? "")).catch(() => null);
  return <ChoixMaquettes d={construireDossier(e, agent)} />;
}
