import { Desabonnement } from "@/components/desabonnement";
import { envoiDuJeton } from "@/lib/bo/campagnes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Désinscription · France Immeuble", robots: { index: false } };

/** Le lien du pied des campagnes (module Mailing). Ouvrir la page ne change
 *  rien : les messageries suivent les liens pour les vérifier, c'est le clic
 *  sur le bouton qui désinscrit. */
export default async function PageDesabonnement({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const envoi = await envoiDuJeton(t).catch(() => null);
  return <Desabonnement jeton={t} email={envoi?.email} />;
}
