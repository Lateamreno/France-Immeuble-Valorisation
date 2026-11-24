import Link from "next/link";
import { redirect } from "next/navigation";
import { getMandat } from "@/lib/bubble/server";

export const dynamic = "force-dynamic";

/**
 * Ancienne adresse du mandat. Depuis le retour #100 le mandat vit DANS la
 * fiche immeuble, rail compris : on redirige, pour que les liens déjà partagés
 * et les retours d'annotation continuent de tomber au bon endroit.
 */
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
  const immeubleId = d.im ? String(d.im._id) : "";
  if (!immeubleId) {
    return (
      <div style={{ padding: 40 }}>
        Ce mandat n&apos;est rattaché à aucun immeuble : ouvrez-le depuis la fiche du bien.{" "}
        <Link href="/mandats">← Liste des mandats</Link>
      </div>
    );
  }
  redirect(`/bien/${immeubleId}/mandat/${id}`);
}
