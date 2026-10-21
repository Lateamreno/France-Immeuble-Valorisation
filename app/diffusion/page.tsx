import { headers } from "next/headers";
import { listDiffusion } from "@/lib/bubble/server";
import { diffusionConfiguree, retombeesAnnonces, testerBranchement } from "@/lib/bo/diffusion";
import { calculerOffmarket, testerSite } from "@/lib/bo/site-fi";
import { PanneauSite, ParcDiffusion, type LigneDiffusion } from "@/components/diffusion";

/** L'adresse publique du site, pour les liens « Voir la page ». */
const SITE_PUBLIC = (process.env.SITE_FI_PUBLIC_URL ?? "https://france-immeuble-refonte-site.vercel.app").replace(/\/+$/, "");
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
  const [parc, configuree, branchement, testSite, offmarket] = await Promise.all([
    listDiffusion().catch(() => []),
    diffusionConfiguree(),
    testerBranchement().catch(() => undefined),
    testerSite().catch((e) => ({ ok: false, message: e instanceof Error ? e.message : String(e) })),
    calculerOffmarket().catch(() => []),
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
      photo: p.photo,
      renta: p.renta,
      prixM2: p.prixM2,
      siteStatut: p.siteStatut,
      siteUrl: p.siteStatut && p.siteSlug ? `${SITE_PUBLIC}/immeubles-a-vendre/${p.siteSlug}/` : undefined,
      siteErreur: p.siteErreur,
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
      <PanneauSite
        test={testSite}
        aReprendre={parc.filter((p) => (p.statut === "online" || p.statut === "sous_offre") && !p.siteStatut).length}
        offmarket={offmarket}
      />
      <Vitrine initial={vitrineParDefaut(origine)} configuree={configuree} />
    </div>
  );
}
