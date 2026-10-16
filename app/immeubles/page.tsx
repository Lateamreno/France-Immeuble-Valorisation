import { listImmeubles } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";
import { RattrapageFacades } from "@/components/facades-rattrapage";

export const dynamic = "force-dynamic";

export default async function ImmeublesPage() {
  const rows = await listImmeubles().catch(() => []);
  /* Le stock d'avant la capture de façade : ces fiches n'ont ni photo ni
     repère visuel. Le bouton les rattrape par paquets, une fois pour toutes.
     Les archives sont hors du compte — on ne dépense pas d'appel d'API pour
     une fiche que personne ne rouvrira. */
  const manquantes = rows.filter((r) => !r.photoUrl && r.group !== "archives").length;
  return (
    /* Pleine largeur : la barre de recherche est collée en haut d'un bord à
       l'autre, et le panneau de filtres colle à gauche. C'est la disposition
       du BO (retour #110) — la marge centrée d'avant écrasait les deux. */
    <ListeShell
      filtres
      /* Façade et Street View : sans la photo, une liste d'immeubles ne dit
         rien de ce qu'elle liste (retour #122). */
      vignettes
      titre="Immeubles"
      actions={<RattrapageFacades manquantes={manquantes} />}
      rows={rows}
      searchPlaceholder="Recherchez un immeuble..."
      tabs={[
        { key: "en_cours", label: "En cours" },
        { key: "en_attente", label: "En attente" },
        { key: "archives", label: "Archivés" },
      ]}
    />
  );
}
