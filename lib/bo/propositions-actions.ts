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

/**
 * Le résumé d'un immeuble et son lien transfer.it (dernier dossier), lus dans
 * le miroir : c'est ce que le SMS de relance cite (MAV, 28/09).
 */
async function resumeEtLien(immeubleId: string): Promise<{ resume: string; lien?: string }> {
  const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_KEY || !immeubleId) return { resume: "" };
  const { resumeDepuisDoc } = await import("@/lib/bo/resume-immeuble");
  const { lienDuDossier } = await import("@/lib/bo/lien-dossier");
  const { derniersDossiers } = await import("@/lib/bo/piece-dossier");
  const [res, dossiers] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/bo_immeuble?id=eq.${encodeURIComponent(immeubleId)}&select=data&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store",
    }).catch(() => null),
    derniersDossiers([immeubleId]),
  ]);
  const im = res?.ok ? ((await res.json()) as { data: Record<string, unknown> }[])[0]?.data : undefined;
  const l = lienDuDossier(dossiers.get(immeubleId));
  return { resume: resumeDepuisDoc(im), lien: l && !l.perime ? l.url : undefined };
}

/** Le texte du SMS de relance, tel qu'il partira, pour le montrer avant. */
export async function apercuRelanceSms(immeubleId: string) {
  const { resume, lien } = await resumeEtLien(immeubleId);
  return { texte: texteRelanceSms(resume, lien, NUMERO_STOP), configure: etatSms().configure };
}

/**
 * Relance par SMS, une personne après l'autre.
 *
 * MailingVox prend une liste par appel, mais chaque personne a SON texte (le
 * dossier cité est le sien) : un appel par destinataire, espacé.
 */
export async function relancerParSms(
  envois: {
    contactId?: string; tel?: string; immeubleId: string; libelle: string; propositionIds: string[];
    /** Le texte tel que l'agent l'a relu et, s'il l'a voulu, retouché à
     *  l'écran (MAV, 28/09 : « je veux pouvoir modifier les modèles de SMS
     *  aussi, comme pour les e-mails »). Absent : le modèle. */
    texte?: string;
  }[],
  _agentNom?: string,
  chemins: string[] = [],
) {
  const etat = etatSms();
  if (!etat.configure) {
    throw new Error("L'envoi de SMS n'est pas branché sur cet environnement (clé MailingVox absente).");
  }
  let envoyes = 0;
  let echecs = 0;
  const journal: string[] = [];
  /* Le résumé et le lien d'un immeuble se lisent une fois par immeuble, pas
     par destinataire. */
  const cache = new Map<string, { resume: string; lien?: string }>();
  for (const e of envois) {
    const num = telE164(e.tel);
    if (!num) { echecs++; journal.push(`${e.libelle} : pas de numéro de portable`); continue; }
    try {
      let rl = cache.get(e.immeubleId);
      if (!rl) { rl = await resumeEtLien(e.immeubleId); cache.set(e.immeubleId, rl); }
      const texte = e.texte?.trim() || texteRelanceSms(rl.resume || e.libelle, rl.lien, NUMERO_STOP);
      const r = await envoyerSms([num], texte, { nom: "Relance" });
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
