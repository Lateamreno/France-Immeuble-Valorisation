import Link from "next/link";
import { BienFiche } from "@/components/bien-fiche";
import { getBien } from "@/lib/bubble/server";

export const dynamic = "force-dynamic";

export default async function BienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data = null;
  let err: string | null = null;
  try {
    data = await getBien(id);
  } catch (e) {
    err = e instanceof Error ? e.message : "erreur";
  }

  if (!data) {
    return (
      <div className="wrap">
        <div className="fempty" style={{ paddingTop: 60 }}>
          {err ? `Lecture Bubble indisponible (${err}).` : "Immeuble introuvable (ou BUBBLE_API_TOKEN absent)."}
          <div style={{ marginTop: 14 }}>
            <Link href="/" className="fbtn">← Retour au dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return <BienFiche b={data} />;
}
