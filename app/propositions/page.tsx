import { listPropositionsPage } from "@/lib/bubble/server";
import { ListeServeur } from "@/components/liste-serveur";

export const dynamic = "force-dynamic";

export default async function PropositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const taille = Math.min(100, Math.max(10, parseInt(sp.per ?? "10", 10) || 10));
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const { rows, total } = await listPropositionsPage(q, page, taille).catch(() => ({ rows: [], total: 0 }));

  return (
    <div className="lst-page">
      <h1 className="lst-title">Propositions</h1>
      <ListeServeur rows={rows} total={total} page={page} taille={taille} q={q}
        searchPlaceholder="Recherchez une proposition..." />
    </div>
  );
}
