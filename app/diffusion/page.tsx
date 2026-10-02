import { headers } from "next/headers";
import { listDiffusion } from "@/lib/bubble/server";
import { diffusionConfiguree, retombeesAnnonces, testerBranchement } from "@/lib/bo/diffusion";
import { ParcDiffusion, type LigneDiffusion } from "@/components/diffusion";
import { Vitrine } from "@/components/vitrine";
import { vitrineParDefaut } from "@/lib/vitrine";

export const dynamic = "force-dynamic";

/**
 * Le parc diffusé : ce qui est en ligne, et ce que ça rapporte.
 *
 * Les retombées viennent de Plein Bail. Le décompte des vues n'y existe pas
 * encore — aucune table ne les enregistre — donc l'écran affiche les signaux
 * qui existent vraiment plutôt qu'un zéro qui mentirait.
 */
export default async function DiffusionPage() {
  /* Le test de branchement se joue à l'ouverture de l'écran : c'est le seul
     moment où quelqu'un regarde. Il ne touche pas au catalogue — voir
     `testerBranchement` — donc le jouer systématiquement ne coûte rien. */
  const [parc, configuree, branchement] = await Promise.all([
    listDiffusion().catch(() => []),
    diffusionConfiguree(),
    testerBranchement().catch(() => undefined),
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

  /* L'origine réelle du BO, lue sur la requête : le logo doit être servi par
     une adresse que Plein Bail sait atteindre, et elle n'est pas la même en
     local, en préversion et en production. */
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  // En local le serveur est en clair ; derrière Vercel, x-forwarded-proto tranche.
  const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  const origine = `${proto}://${hote}`;

  return (
    <div className="wrap">
      <ParcDiffusion
        lignes={lignes}
        configuree={configuree}
        vuesDisponibles={retombees.some((r) => typeof r.vues === "number")}
        branchement={branchement}
      />
      <Vitrine initial={vitrineParDefaut(origine)} configuree={configuree} />
    </div>
  );
}
