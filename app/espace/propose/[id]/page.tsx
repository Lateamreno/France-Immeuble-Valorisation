/**
 * Un bien qu'on a proposé à l'acquéreur.
 *
 * L'adresse porte l'identifiant de la PROPOSITION, pas celui de l'immeuble :
 * c'est la proposition qui prouve qu'on lui a bien envoyé ce bien. Chercher
 * par immeuble laisserait consulter n'importe quel dossier en devinant une
 * adresse d'URL.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { clientConnecte } from "@/lib/bo/compte-client";
import { Connexion } from "@/components/espace-connexion";
import { bienPropose, mesPropositions } from "@/lib/bo/espace-client";
import { BienProposeEcran } from "@/components/espace-propose";

export const metadata: Metadata = {
  title: "Un bien pour vous — France Immeuble",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const compte = await clientConnecte();
  if (!compte) return <Connexion />;

  const detail = await bienPropose(id, compte.contact_id);
  if (!detail) {
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

  /* La réponse déjà donnée, s'il y en a une : on la relit dans la liste plutôt
     que d'ouvrir une seconde requête pour une seule ligne. */
  const toutes = await mesPropositions(compte.contact_id, compte.id);
  const ligne = toutes.find((p) => p.id === id);

  return (
    <>
      <div className="ep-retour"><Link href="/espace">← Votre espace</Link></div>
      <BienProposeEcran
        propositionId={id}
        vue={detail.vue}
        photos={detail.photos}
        dossier={!!detail.cheminDossier}
        rendement={ligne?.rendement}
        reponse={ligne?.reponse}
      />
    </>
  );
}
