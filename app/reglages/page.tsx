// Réglages de l'agence — l'écran d'administration du BO (retour #191).
import { lireReglages } from "@/lib/bo/reglages";
import { ReglagesAgence } from "@/components/reglages-agence";
import { ReglagesEnvois, type EtatEnvois } from "@/components/reglages-envois";
import { Equipe, type LigneEquipe } from "@/components/equipe";
import { compteCourant, exigerDirection, tousLesComptes } from "@/lib/auth/comptes";
import { getAgents } from "@/lib/bubble/server";

export const dynamic = "force-dynamic";

/**
 * L'état des routes d'envoi, calculé ici pour que rien de secret ne descende :
 * le navigateur ne reçoit que « présent / absent » et les adresses affichées.
 */
async function etatEnvois(): Promise<EtatEnvois> {
  const [{ masseConfiguree, expediteurDe, receptionSousDomaine, alerteReception }, { etatSms, PLAFOND_SMS, NUMERO_STOP }] = await Promise.all([
    import("@/lib/bo/mail"),
    import("@/lib/bo/sms"),
  ]);
  const domaine = process.env.MASSE_DOMAINE?.trim().replace(/^@/, "");
  /* Le sous-domaine sait-il recevoir une réponse ? (MAV, 11/10 : « mail erroné ») */
  const reception = masseConfiguree() && domaine ? await receptionSousDomaine() : null;
  return {
    masse: {
      configure: masseConfiguree(),
      expediteur: domaine ? `<agent>@${domaine}` : expediteurDe() || "non défini",
      plafondJour: Math.max(1, Number(process.env.PLAFOND_JOUR ?? 4000)),
      reception: reception
        ? { domaine: reception.domaine, recoit: reception.recoit, alerte: reception.recoit === false ? alerteReception(reception.domaine) : undefined }
        : null,
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

/** L'équipe : chaque agent, son accès au BO et son rôle (MAV, 27/10). */
async function equipe(): Promise<LigneEquipe[]> {
  const [agents, comptes, moi] = await Promise.all([getAgents(), tousLesComptes(), compteCourant()]);
  return agents.map((a) => {
    const c = comptes.find((x) => x.agent_id === a.id);
    return {
      agentId: a.id, nom: a.name, actifBo: a.actif,
      compte: c ? {
        id: c.id, email: c.email, role: c.role, actif: c.actif,
        invite: !!c.user_id, active: !!c.derniere_connexion, derniere: c.derniere_connexion, moi: c.id === moi?.id,
      } : null,
    };
  }).sort((x, y) => Number(!!y.compte) - Number(!!x.compte) || Number(y.actifBo) - Number(x.actifBo) || x.nom.localeCompare(y.nom));
}

export default async function PageReglages() {
  /* Réservé à la direction (MAV, 27/10). */
  await exigerDirection();
  const [initial, envois, lignes] = await Promise.all([lireReglages(), etatEnvois(), equipe()]);
  return <ReglagesAgence initial={initial} envois={<ReglagesEnvois etat={envois} />} equipe={<Equipe lignes={lignes} />} />;
}
