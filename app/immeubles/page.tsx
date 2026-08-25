import { listImmeubles } from "@/lib/bubble/server";
import { ListeShell } from "@/components/liste";

export const dynamic = "force-dynamic";

export default async function ImmeublesPage() {
  const rows = await listImmeubles().catch(() => []);
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
