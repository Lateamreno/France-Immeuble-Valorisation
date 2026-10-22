import { getObjectifs } from "@/lib/bubble/server";
import { Objectifs } from "@/components/objectifs";

export const dynamic = "force-dynamic";

export default async function ObjectifsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const { periode } = await searchParams;
  const d = await getObjectifs(periode).catch(() => null);

  return (
    <div className="lst-page">
      <h1 className="lst-title">Objectifs</h1>
      {d && d.objectifs.length > 0 ? (
        <Objectifs d={d} periode={d.objectifs[0].periode} />
      ) : (
        <div className="fempty">Aucun objectif enregistré.</div>
      )}
    </div>
  );
}
