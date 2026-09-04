import { getAgents, listContactsPage } from "@/lib/bubble/server";
import { ListeServeur } from "@/components/liste-serveur";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per?: string; agent?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  /* Vide = tous les contacts. C'est le défaut voulu pour l'administrateur :
     il travaille sur l'ensemble du fichier, pas seulement sur le sien. Un
     commercial se filtrera lui-même par le sélecteur. */
  const agent = sp.agent ?? "";
  const taille = Math.min(100, Math.max(10, parseInt(sp.per ?? "10", 10) || 10));
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const [{ rows, total }, agents] = await Promise.all([
    listContactsPage(q, page, taille, agent).catch(() => ({ rows: [], total: 0 })),
    getAgents().catch(() => []),
  ]);

  return (
    <ListeServeur
      titre="Contacts"
      rows={rows} total={total} page={page} taille={taille} q={q}
      agents={agents.filter((a) => a.actif).map((a) => ({ id: a.id, name: a.name }))}
      agent={agent}
      searchPlaceholder="Recherchez un contact..."
    />
  );
}
