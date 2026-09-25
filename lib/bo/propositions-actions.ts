"use server";

// Les propositions d'un immeuble, et la relance par SMS (#373).
//
// Même doctrine que les relances par e-mail : l'agent clique, le message
// part ; rien n'est marqué relancé si le message n'est pas parti. Le SMS passe
// par MailingVox (lib/bo/sms.ts), qui reporte de lui-même un envoi hors des
// horaires légaux et lit les désinscrits avant.

import { revalidatePath } from "next/cache";
import { propositionsDuBien } from "@/lib/bubble/server";
import { telE164 } from "@/lib/bo/matching";
import { NUMERO_STOP, envoyerSms, etatSms } from "@/lib/bo/sms";
import { texteRelanceSms } from "@/lib/bo/relances";
import { marquerRelances } from "@/lib/bo/relances-actions";

export async function chargerPropositionsDuBien(immeubleId: string) {
  return propositionsDuBien(immeubleId);
}

/** Le texte du SMS de relance, tel qu'il partira, pour le montrer avant. */
export async function apercuRelanceSms(libelle: string, agent?: string) {
  return { texte: texteRelanceSms(libelle, agent, NUMERO_STOP), configure: etatSms().configure };
}

/**
 * Relance par SMS, une personne après l'autre.
 *
 * MailingVox prend une liste par appel, mais chaque personne a SON texte (le
 * dossier cité est le sien) : un appel par destinataire, espacé.
 */
export async function relancerParSms(
  envois: { contactId?: string; tel?: string; libelle: string; propositionIds: string[] }[],
  agentNom?: string,
  chemins: string[] = [],
) {
  const etat = etatSms();
  if (!etat.configure) {
    throw new Error("L'envoi de SMS n'est pas branché sur cet environnement (clé MailingVox absente).");
  }
  let envoyes = 0;
  let echecs = 0;
  const journal: string[] = [];
  for (const e of envois) {
    const num = telE164(e.tel);
    if (!num) { echecs++; journal.push(`${e.libelle} : pas de numéro de portable`); continue; }
    try {
      const r = await envoyerSms([num], texteRelanceSms(e.libelle, agentNom, NUMERO_STOP), { nom: "Relance" });
      if (r.simulation || r.envoyes === 0) { echecs++; journal.push(`${num} : non envoyé`); continue; }
      envoyes++;
      await marquerRelances(e.propositionIds, chemins);
    } catch (err) {
      echecs++;
      journal.push(`${num} : ${err instanceof Error ? err.message : "échec"}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  for (const c of chemins) revalidatePath(c);
  return { envoyes, echecs, journal };
}
