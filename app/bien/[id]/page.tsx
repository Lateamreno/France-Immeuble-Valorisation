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
          {err
            ? `Lecture des données indisponible (${err}).`
            : "Immeuble introuvable — ou aucune source de données configurée (SUPABASE_SERVICE_ROLE_KEY / BUBBLE_API_TOKEN) : en mode démonstration, les fiches ne sont pas accessibles."}
          <div style={{ marginTop: 14 }}>
            <Link href="/" className="fbtn">← Retour au dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return <BienFiche b={data} />;
}
