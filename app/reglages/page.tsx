// Réglages de l'agence — l'écran d'administration du BO (retour #191).
import { lireReglages } from "@/lib/bo/reglages";
import { ReglagesAgence } from "@/components/reglages-agence";
import { ReglagesEnvois, type EtatEnvois } from "@/components/reglages-envois";

export const dynamic = "force-dynamic";

/**
 * L'état des routes d'envoi, calculé ici pour que rien de secret ne descende :
 * le navigateur ne reçoit que « présent / absent » et les adresses affichées.
 */
async function etatEnvois(): Promise<EtatEnvois> {
  const [{ masseConfiguree, expediteurDe }, { etatSms, PLAFOND_SMS, NUMERO_STOP }] = await Promise.all([
    import("@/lib/bo/mail"),
    import("@/lib/bo/sms"),
  ]);
  const domaine = process.env.MASSE_DOMAINE?.trim().replace(/^@/, "");
  return {
    masse: {
      configure: masseConfiguree(),
      expediteur: domaine ? `<agent>@${domaine}` : expediteurDe() || "non défini",
      plafondJour: Math.max(1, Number(process.env.PLAFOND_JOUR ?? 4000)),
    },
    sms: {
      ...etatSms(),
      plafond: PLAFOND_SMS,
      numeroStop: NUMERO_STOP,
      secretWebhook: !!process.env.MAILINGVOX_WEBHOOK_SECRET?.trim(),
    },
    siteUrl: process.env.SITE_URL?.trim() || null,
  };
}

export default async function PageReglages() {
  const [initial, envois] = await Promise.all([lireReglages(), etatEnvois()]);
  return <ReglagesAgence initial={initial} envois={<ReglagesEnvois etat={envois} />} />;
}
