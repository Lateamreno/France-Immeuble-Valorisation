/**
 * L'espace client — la porte d'entrée.
 *
 * Connecté, on tombe sur son accueil ; sinon, sur le formulaire. Pas de page
 * d'inscription : les comptes s'ouvrent depuis le back-office, c'est la même
 * doctrine que les envois d'e-mails — l'agence décide qui entre.
 */

import type { Metadata } from "next";
import { clientConnecte } from "@/lib/bo/compte-client";
import { mesImmeubles, mesPropositions, mesRecherches } from "@/lib/bo/espace-client";
import { Connexion } from "@/components/espace-connexion";
import { AccueilClient } from "@/components/espace-accueil";

export const metadata: Metadata = {
  title: "Votre espace — France Immeuble",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const compte = await clientConnecte();
  if (!compte) return <Connexion />;

  const [immeubles, recherches, propositions] = await Promise.all([
    mesImmeubles(compte.contact_id),
    mesRecherches(compte.contact_id),
    mesPropositions(compte.contact_id, compte.id),
  ]);

  return (
    <AccueilClient
      email={compte.email}
      immeubles={immeubles}
      recherches={recherches}
      propositions={propositions}
    />
  );
}
