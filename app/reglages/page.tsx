// Réglages de l'agence — l'écran d'administration du BO (retour #191).
import { lireReglages } from "@/lib/bo/reglages";
import { ReglagesAgence } from "@/components/reglages-agence";

export const dynamic = "force-dynamic";

export default async function PageReglages() {
  return <ReglagesAgence initial={await lireReglages()} />;
}
