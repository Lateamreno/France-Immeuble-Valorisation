/**
 * Un immeuble que le client nous a confié.
 *
 * L'appartenance est vérifiée par la BASE, pas par cette page : `ec_mon_immeuble`
 * ne rend vrai que si l'immeuble a ce contact pour propriétaire. Changer
 * l'identifiant dans l'URL ne mène donc nulle part.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { estMonImmeuble, jetonSession, mesImmeubles, mesPieces, moi } from "@/lib/bo/espace-anon";
import { Connexion } from "@/components/espace-connexion";
import { EspaceProprietaire } from "@/components/espace-proprietaire";

export const metadata: Metadata = {
  title: "Votre immeuble — France Immeuble",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jeton = await jetonSession();
  const compte = jeton ? await moi() : null;
  if (!jeton || !compte) return <Connexion />;

  if (!(await estMonImmeuble(jeton, id))) {
    return (
      <main className="ep-wrap etroit">
        <div className="ep-fermee">
          <h1>Immeuble introuvable</h1>
          <p>Cet immeuble ne figure pas parmi les vôtres.</p>
          <p><Link className="ep-lien" href="/espace">Revenir à votre espace</Link></p>
        </div>
      </main>
    );
  }

  const [biens, pieces] = await Promise.all([mesImmeubles(jeton), mesPieces(jeton, id)]);
  const b = biens.find((x) => x.id === id);

  return (
    <>
      <div className="ep-retour"><Link href="/espace">← Votre espace</Link></div>
      <EspaceProprietaire
        immeubleId={id}
        bien={b ?? null}
        pieces={pieces}
      />
    </>
  );
}
