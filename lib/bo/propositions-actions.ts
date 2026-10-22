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

const SB_URL_RPC = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
async function rpc(fn: string, args: Record<string, unknown>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  const res = await fetch(`${SB_URL_RPC}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${fn} : ${res.status}`);
}

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
  return { resume: resumeDepuisDoc(im, { sms: true }), lien: l && !l.aRemplacer ? l.url : undefined };
}

/** Le texte du SMS de relance, tel qu'il partira, pour le montrer avant. */
export async function apercuRelanceSms(immeubleId: string) {
  const { resume, lien } = await resumeEtLien(immeubleId);
  return { texte: texteRelanceSms(resume, lien, NUMERO_STOP), configure: etatSms().configure };
}

/** Un portable, tel que MailingVox l'accepte : en France, 06 ou 07 seulement. */
const estPortable = (e164: string) => !e164.startsWith("+33") || /^\+33[67]\d{8}$/.test(e164);

/**
 * Le refus de MailingVox qui vaut pour TOUTE la salve, pas pour un numéro :
 * plus de crédit. Continuer ferait cent appels refusés de plus, et l'agent ne
 * saurait pas pourquoi (vu le 29/09 sur Argenteuil : 29 refus d'affilée).
 */
const SANS_CREDIT = /pas assez de cr[ée]dit/i;

/**
 * Relance par SMS, une campagne MailingVox par texte.
 *
 * MailingVox prend toute la liste en UN appel — c'est ce que fait MAV depuis
 * leur écran, « 10 secondes pour tous les envois ». Un appel par personne
 * (première version) prenait dix-sept minutes pour cent quatre-vingts SMS et
 * faisait déborder les tours de la file. Les envois qui partagent le même
 * texte (même immeuble, même retouche) partent donc ensemble ; un « Oui »
 * retrouve sa ligne par l'identifiant de campagne ET le numéro qui répond
 * (`propositionDe`, lib/bo/sms-retours.ts).
 *
 * Quand MailingVox refuse une campagne groupée, on rejoue numéro par numéro :
 * leur API ne dit pas LEQUEL est en cause, et un seul numéro invalide ne doit
 * pas priver les vingt-quatre autres.
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
): Promise<{
  envoyes: number; echecs: number; journal: string[];
  /** Posé quand la salve doit s'ARRÊTER là (plus de crédit MailingVox) : ce
   *  qui reste n'a pas été tenté et n'est pas marqué relancé. */
  arret?: string;
}> {
  const etat = etatSms();
  if (!etat.configure) {
    throw new Error("L'envoi de SMS n'est pas branché sur cet environnement (clé MailingVox absente).");
  }
  let envoyes = 0;
  let echecs = 0;
  const journal: string[] = [];
  let arret: string | undefined;

  /* 1. Préparer : numéro, texte, lien — sans rien envoyer. Le résumé et le
     lien d'un immeuble se lisent une fois par immeuble, pas par destinataire. */
  type Pret = { num: string; texte: string; propositionIds: string[]; libelle: string };
  const prets: Pret[] = [];
  const cache = new Map<string, { resume: string; lien?: string }>();
  for (const e of envois) {
    const num = telE164(e.tel);
    if (!num) { echecs++; journal.push(`${e.libelle} : pas de numéro de portable`); continue; }
    if (!estPortable(num)) { echecs++; journal.push(`${e.libelle} : ${num} n'est pas un portable, MailingVox le refuserait`); continue; }
    let rl = cache.get(e.immeubleId);
    if (!rl) { rl = await resumeEtLien(e.immeubleId); cache.set(e.immeubleId, rl); }
    /* Le lien transfer.it est obligatoire (MAV, 28/09) : sans lien valable
       sur le dernier dossier, le SMS ne part pas, on dit où le poser. */
    if (!rl.lien) { echecs++; journal.push(`${e.libelle} : pas de lien transfer.it valable sur le dossier — à poser sur la fiche (Dossiers).`); continue; }
    const texte = e.texte?.trim() || texteRelanceSms(rl.resume || e.libelle, rl.lien, NUMERO_STOP);
    prets.push({ num, texte, propositionIds: e.propositionIds, libelle: e.libelle });
  }

  /* 2. Grouper par texte : une campagne par texte, dans l'ordre d'arrivée. */
  const groupes = new Map<string, Pret[]>();
  for (const p of prets) {
    const g = groupes.get(p.texte);
    if (g) g.push(p); else groupes.set(p.texte, [p]);
  }

  /* Le nom de campagne : l'immeuble quand tout le lot le partage, sinon la
     première proposition. MailingVox le renvoie avec chaque réponse ; avec
     `source` (l'identifiant de campagne) et le numéro, la réponse retrouve sa
     ligne. */
  const immeubles = [...new Set(envois.map((e) => e.immeubleId))];
  const nomCampagne = (g: Pret[]) =>
    `Relance ${immeubles.length === 1 ? immeubles[0] : g[0].propositionIds[0] ?? ""}`.trim().slice(0, 50);

  const marquer = async (lot: Pret[], campagne: string | undefined) => {
    const now = new Date().toISOString();
    const ids = [...new Set(lot.flatMap((p) => p.propositionIds))];
    /* Une seule écriture par proposition, par paquets de dix en parallèle :
       cent lignes en deux secondes, pas en trente. L'identifiant de campagne
       (`sms_campagne`) est ce que le webhook MailingVox renvoie (`source`). */
    for (let i = 0; i < ids.length; i += 10) {
      await Promise.all(ids.slice(i, i + 10).map((id) => rpc("bo_patch_doc", {
        p_table: "bo_proposition", p_id: id,
        p_patch: {
          date_last_relance: now, sms_relance_le: now, date_modif: now, "Modified Date": now,
          ...(campagne ? { sms_campagne: campagne } : {}),
        },
      }).catch(() => undefined)));
    }
  };

  for (const g of groupes.values()) {
    if (arret) break;
    const nom = nomCampagne(g);
    /* Deux fiches sur le même numéro : un seul SMS part, les deux sont marquées. */
    const numeros = [...new Set(g.map((p) => p.num))];
    let refus: string | undefined;
    try {
      const r = await envoyerSms(numeros, g[0].texte, { nom });
      if (r.simulation) throw new Error("MailingVox n'a rien envoyé (clé MailingVox absente)");
      envoyes += g.length;
      await marquer(g, r.campagne);
      await new Promise((res) => setTimeout(res, 300));
      continue;
    } catch (err) {
      refus = err instanceof Error ? err.message : "échec MailingVox";
    }
    if (SANS_CREDIT.test(refus)) {
      arret = "MailingVox : plus de crédit SMS sur le compte. La salve s'arrête là ; rechargez le compte puis relancez, ceux qui n'ont rien reçu ne sont pas marqués relancés.";
      echecs += g.length;
      journal.push(`SMS (${g.length}) : ${arret}`);
      break;
    }
    if (numeros.length === 1) {
      echecs += g.length;
      journal.push(`SMS ${numeros[0]} : ${refus}`);
      continue;
    }
    /* Refus d'une campagne groupée : on rejoue un par un pour isoler le ou les
       numéros en cause — les autres partent. */
    journal.push(`Campagne de ${numeros.length} SMS refusée (${refus.slice(0, 120)}) : reprise numéro par numéro.`);
    for (const p of g) {
      try {
        const r = await envoyerSms([p.num], p.texte, { nom });
        if (r.simulation || r.envoyes === 0) throw new Error("MailingVox n'a rien envoyé");
        envoyes++;
        await marquer([p], r.campagne);
      } catch (err) {
        const m = err instanceof Error ? err.message : "échec MailingVox";
        if (SANS_CREDIT.test(m)) {
          arret = "MailingVox : plus de crédit SMS sur le compte. La salve s'arrête là ; rechargez le compte puis relancez, ceux qui n'ont rien reçu ne sont pas marqués relancés.";
          echecs++;
          journal.push(`SMS ${p.num} : ${arret}`);
          break;
        }
        echecs++;
        journal.push(`SMS ${p.num} : ${m}`);
      }
      await new Promise((res) => setTimeout(res, 300));
    }
  }
  for (const c of chemins) revalidatePath(c);
  revalidatePath("/relances");
  revalidatePath("/propositions");
  return { envoyes, echecs, journal, arret };
}
