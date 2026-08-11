import Link from "next/link";
import { getMandat } from "@/lib/bubble/server";
import { MandatFiche } from "@/components/mandat-fiche";

export const dynamic = "force-dynamic";

export default async function MandatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getMandat(id).catch(() => null);
  if (!d) {
    return (
      <div style={{ padding: 40 }}>
        Mandat introuvable. <Link href="/">← Retour au dashboard</Link>
      </div>
    );
  }
  return <MandatFiche d={d} />;
}
