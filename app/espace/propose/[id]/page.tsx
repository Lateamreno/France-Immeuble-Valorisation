/**
 * Un bien qu'on a proposé à l'acquéreur.
 *
 * L'adresse porte l'identifiant de la PROPOSITION, pas celui de l'immeuble :
 * c'est la proposition qui prouve qu'on lui a envoyé ce bien, et c'est la base
 * qui le vérifie.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { bienPropose, jetonSession, moi } from "@/lib/bo/espace-anon";
import { Connexion } from "@/components/espace-connexion";
import { BienProposeEcran } from "@/components/espace-propose";

export const metadata: Metadata = {
  title: "Un bien pour vous — France Immeuble",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jeton = await jetonSession();
  const compte = jeton ? await moi() : null;
  if (!jeton || !compte) return <Connexion />;

  const bien = await bienPropose(jeton, id);
  if (!bien) {
    return (
      <main className="ep-wrap etroit">
        <div className="ep-fermee">
          <h1>Bien introuvable</h1>
          <p>Ce bien ne fait pas partie de ceux qui vous ont été proposés.</p>
          <p><Link className="ep-lien" href="/espace">Revenir à votre espace</Link></p>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="ep-retour"><Link href="/espace">← Votre espace</Link></div>
      <BienProposeEcran bien={bien} />
    </>
  );
}
