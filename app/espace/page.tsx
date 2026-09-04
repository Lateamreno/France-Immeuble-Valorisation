/**
 * L'espace client — la porte d'entrée.
 *
 * Toutes les lectures passent par la clé publique et les fonctions `ec_*` :
 * cette page ne peut pas lire une table, même par accident.
 */

import type { Metadata } from "next";
import {
  biensEnLigne, jetonSession, mesImmeubles, mesPropositions, mesRecherches, moi,
} from "@/lib/bo/espace-anon";
import { Connexion } from "@/components/espace-connexion";
import { AccueilClient } from "@/components/espace-accueil";

export const metadata: Metadata = {
  title: "Votre espace — France Immeuble",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const jeton = await jetonSession();
  const compte = jeton ? await moi() : null;
  if (!jeton || !compte) return <Connexion />;

  const [immeubles, recherches, propositions, enLigne] = await Promise.all([
    mesImmeubles(jeton),
    mesRecherches(jeton),
    mesPropositions(jeton),
    biensEnLigne(jeton),
  ]);

  return (
    <AccueilClient
      email={compte.email}
      immeubles={immeubles}
      recherches={recherches}
      propositions={propositions}
      enLigne={enLigne}
    />
  );
}
