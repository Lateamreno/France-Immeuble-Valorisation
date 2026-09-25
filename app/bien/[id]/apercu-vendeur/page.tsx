/**
 * L'aperçu de l'espace vendeur, vu du BO (#382 bis).
 *
 * MAV : « je voulais juste voir un aperçu de ce que le client verra avant de
 * lui envoyer un lien. » Cette page rend le MÊME écran que
 * `/espace/bien/[id]` — le composant `EspaceProprietaire` — sans créer de
 * lien ni de session : les données viennent d'`apercuVendeur`, qui refait
 * côté serveur le calcul des fonctions `ec_*` de l'espace client.
 *
 * C'est une page du BO : elle lit avec la clé de service, comme la fiche.
 * Ce que §10 bis interdit, c'est de donner cette clé à une page CLIENTE —
 * aucune page cliente n'est touchée ici. Le layout racine la sert « hors BO »
 * (sans rail), pour que l'aperçu soit fidèle au pixel.
 */

import type { Metadata } from "next";
import { apercuVendeur } from "@/lib/bo/espace-proprietaire";
import { EspaceProprietaire } from "@/components/espace-proprietaire";
import { BandeauApercu } from "./bandeau";

export const metadata: Metadata = {
  title: "Aperçu de l'espace vendeur — France Immeuble",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bien, pieces } = await apercuVendeur(id);

  return (
    <>
      <BandeauApercu immeubleId={id} />
      {bien ? (
        <>
          {/* Le renvoi « ← Votre espace » de la vraie page, sans le lien :
              il mènerait à l'entrée de l'espace client, qui n'est pas à lui. */}
          <div className="ep-retour"><span>← Votre espace</span></div>
          <EspaceProprietaire immeubleId={id} bien={bien} pieces={pieces} apercu />
        </>
      ) : (
        <main className="ep-wrap etroit">
          <div className="ep-fermee">
            <h1>Rien à montrer</h1>
            <p>
              Ce bien n&apos;apparaîtrait pas dans l&apos;espace du propriétaire : il est
              introuvable, retiré, ou la lecture des données est indisponible.
            </p>
          </div>
        </main>
      )}
    </>
  );
}
