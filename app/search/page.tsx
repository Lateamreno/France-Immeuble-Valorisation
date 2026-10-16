import Link from "next/link";
import { globalSearch } from "@/lib/bubble/server";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const r = await globalSearch(q).catch(() => ({ immeubles: [], contacts: [], mandats: [] }));
  const total = r.immeubles.length + r.contacts.length + r.mandats.length;
  const Bloc = ({ titre, rows }: { titre: string; rows: typeof r.immeubles }) =>
    rows.length === 0 ? null : (
      <>
        <div className="fsub" style={{ marginTop: 16 }}>{titre}</div>
        {rows.map((c) => (
          <Link key={c.id} href={c.href ?? "#"} className="lrow">
            <span className="lav">{c.avatar}</span>
            <div className="lmid">
              <div className="lt">{c.title}</div>
              {c.sub && <div className="ls">{c.sub}</div>}
            </div>
            {c.right && <div className="lright">{c.right.map((x, i) => <span key={i}>{x}</span>)}</div>}
          </Link>
        ))}
      </>
    );
  return (
    <div className="lst-page">
      <h1 className="lst-title">Recherche : « {q} »</h1>
      <div className="lst-count">{total} résultat{total > 1 ? "s" : ""} (20 max par famille)</div>
      {total === 0 && <div className="fempty">Aucun résultat pour « {q} ».</div>}
      <Bloc titre="Immeubles" rows={r.immeubles} />
      <Bloc titre="Contacts" rows={r.contacts} />
      <Bloc titre="Mandats" rows={r.mandats} />
    </div>
  );
}
