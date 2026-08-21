import { listDiffusion } from "@/lib/bubble/server";
import { diffusionConfiguree, retombeesAnnonces } from "@/lib/bo/diffusion";
import { ParcDiffusion, type LigneDiffusion } from "@/components/diffusion";

export const dynamic = "force-dynamic";

/**
 * Le parc diffusé : ce qui est en ligne, et ce que ça rapporte.
 *
 * Les retombées viennent de Plein Bail. Le décompte des vues n'y existe pas
 * encore — aucune table ne les enregistre — donc l'écran affiche les signaux
 * qui existent vraiment plutôt qu'un zéro qui mentirait.
 */
export default async function DiffusionPage() {
  const [parc, configuree] = await Promise.all([
    listDiffusion().catch(() => []),
    diffusionConfiguree(),
  ]);

  const retombees = await retombeesAnnonces(parc.map((p) => `FI:${p.immeubleId}`)).catch(() => []);
  const parRef = new Map(retombees.map((r) => [r.reference, r]));

  const lignes: LigneDiffusion[] = parc.map((p) => {
    const r = parRef.get(`FI:${p.immeubleId}`);
    return {
      immeubleId: p.immeubleId,
      ville: p.ville,
      adresse: p.adresse,
      prix: p.prix,
      statut: p.statut,
      url: p.url,
      publieLe: p.publieLe,
      ecart: p.aResynchroniser,
      erreur: p.erreur,
      retombees: r
        ? { vues: r.vues, contacts: r.contacts, telephones: r.telephones, favoris: r.favoris, offres: r.offres }
        : undefined,
    };
  });

  return (
    <div className="wrap">
      <ParcDiffusion
        lignes={lignes}
        configuree={configuree}
        vuesDisponibles={retombees.some((r) => typeof r.vues === "number")}
      />
    </div>
  );
}
