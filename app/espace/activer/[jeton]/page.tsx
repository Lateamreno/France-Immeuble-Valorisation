/**
 * Poser son mot de passe — activation d'un espace, ou oubli.
 *
 * Le même écran sert aux deux : dans les deux cas, la personne arrive par un
 * lien à usage unique et n'a qu'une chose à faire. Distinguer les deux
 * parcours ajouterait un mot de vocabulaire sans rien changer au geste.
 */

import type { Metadata } from "next";
import { lireJeton } from "@/lib/bo/compte-client";
import { PoserMotDePasse } from "@/components/espace-activation";

export const metadata: Metadata = {
  title: "Activer votre espace — France Immeuble",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const j = await lireJeton(jeton);

  if (!j) {
    return (
      <main className="ep-wrap etroit">
        <div className="ep-fermee">
          <h1>Ce lien n&apos;est plus valable</h1>
          <p>
            Un lien d&apos;activation vaut une semaine, un lien de mot de passe oublié deux
            heures — et chacun ne sert qu&apos;une fois.
          </p>
          <p>
            Depuis la page de connexion, « Mot de passe oublié » vous en renvoie un.
          </p>
          <p className="ep-sig">France Immeuble · 01.72.87.52.22</p>
        </div>
      </main>
    );
  }

  return <PoserMotDePasse jeton={jeton} usage={j.usage} />;
}
