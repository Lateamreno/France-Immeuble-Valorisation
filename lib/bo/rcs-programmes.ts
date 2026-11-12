// RCS d'une commercialisation : l'envoi, tout de suite ou PROGRAMMÉ.
//
// MAV (09/11) : « je peux programmer un envoi pour demain matin à 9 h 30 […]
// de même pour les RCS ? » Les e-mails se programmaient déjà (SendGrid les
// retient jusqu'à l'heure dite). Pour les RCS, l'API de MailingVox ne nous
// donne pas de paramètre de date dont on soit sûr — et un paramètre mal nommé
// serait ignoré en silence : la carte partirait TOUT DE SUITE. Le BO garde
// donc la programmation lui-même : la carte, la liste et l'heure sont validées
// d'un seul geste par l'agent, rangées sur la commercialisation
// (`rcs_programme`), et le cron de chaque minute (/api/relances/tourner) les
// envoie à l'heure dite. Programmation, pas automatisme (CLAUDE.md §7.5) : la
// machine attend, elle ne décide de rien. Annulable tant que rien n'est parti.
//
// Module serveur ordinaire, PAS « use server » : ses fonctions ne sont pas
// appelables depuis le navigateur. Les actions de lib/bo/actions.ts les
// enveloppent.
import { revalidatePath, revalidateTag } from "next/cache";
import { horsCreneauLegal } from "./creneau-legal";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Doc = Record<string, unknown>;

export type RcsProgramme = {
  etat: "attente" | "envoi" | "parti" | "echec";
  /** ISO : l'heure d'envoi choisie. */
  quand: string;
  immeubleId: string;
  dossierId?: string;
  lien?: string;
  /** L'accroche et le SMS de repli retouchés à l'écran (MAV, 09/11), sinon absents. */
  titre?: string;
  intro?: string;
  repli?: string;
  numeros: string[];
  programme_le: string;
  par?: string;
  envoye_le?: string;
  envoyes?: number;
  campagne?: string;
  erreur?: string;
};

async function appel(fn: string, args: Doc): Promise<unknown> {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${fn} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const brut = await res.text();
  return brut ? JSON.parse(brut) : null;
}

async function patcher(id: string, patch: Doc) {
  await appel("bo_patch_doc", { p_table: "bo_commercialisation", p_id: id, p_patch: patch });
  revalidateTag("bo_commercialisation", { expire: 0 });
}

async function lireUn(table: string, id: string): Promise<Doc | null> {
  if (!SB_KEY || !id) return null;
  const res = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=data&limit=1`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const rows = (await res.json()) as { data: Doc }[];
  return rows[0]?.data ?? null;
}

/* --------------------------------------------------------------- L'envoi */

async function signataire(immeubleId: string): Promise<{ nom: string; tel?: string } | undefined> {
  const im = await lireUn("bo_immeuble", immeubleId);
  const { getAgents } = await import("@/lib/bubble/server");
  const a = (await getAgents().catch(() => [])).find((x) => x.id === String(im?.AGENT ?? ""));
  return a?.name ? { nom: a.name, tel: a.tel } : undefined;
}

/**
 * La carte RCS de la commercialisation, à tous les numéros donnés, en une
 * campagne MailingVox. Les numéros désinscrits (STOP) sont retirés au moment
 * même de l'envoi — c'est-à-dire, pour un envoi programmé, à l'heure dite.
 */
export async function envoyerRcsDeCommercialisation(input: {
  immeubleId: string; commId: string; dossierId?: string; lien?: string; titre?: string; intro?: string; repli?: string; numeros: string[];
}): Promise<{ envoyes: number; ecartesStop: number; campagne?: string; agent: string }> {
  if (input.numeros.length === 0) throw new Error("Aucun numéro exploitable.");
  const { stopsMailingvox } = await import("./sms");
  const stops = new Set((await stopsMailingvox().catch(() => [])).map((n) => n.replace(/^00/, "+")));
  const retenus = [...new Set(input.numeros)].filter((n) => !stops.has(n));
  const ecartes = input.numeros.length - retenus.length;
  if (retenus.length === 0) throw new Error("Tous les numéros ciblés se sont désinscrits (STOP).");

  const { preparerCarte, envoyerCarteRcs } = await import("./rcs");
  const c = await preparerCarte(input.immeubleId, await signataire(input.immeubleId), {
    dossierId: input.dossierId, lien: input.lien, titre: input.titre, intro: input.intro, repli: input.repli,
  });
  if (!c) throw new Error("Bien introuvable.");
  const r = await envoyerCarteRcs(c, retenus, { campagne: `Commercialisation ${input.commId}` });
  const now = new Date().toISOString();
  /* `sms_campagne` : c'est par lui que les boutons touchés et les réponses
     au SMS de repli retrouvent leur commercialisation (sms-retours.ts). */
  await patcher(input.commId, {
    prop_sms_sent: true,
    sms_canal: "rcs",
    sms_campagne: r.campagne ?? null,
    rcs_campagne: r.campagne ?? null,
    sms_envoyes: retenus.length,
    sms_date: now,
    rcs_titre: c.titre,
    rcs_repli: c.repli,
    "Modified Date": now,
  }).catch(() => undefined);
  revalidatePath(`/bien/${input.immeubleId}`);
  return { envoyes: retenus.length, ecartesStop: ecartes, campagne: r.campagne, agent: r.agent };
}

/* ------------------------------------------------------ La programmation */

/** Ce que l'agent valide d'un seul geste : la liste, la carte, l'heure. */
export async function programmerRcs(input: {
  immeubleId: string; commId: string; dossierId?: string; lien?: string; titre?: string; intro?: string; repli?: string; numeros: string[]; quand: string; par?: string;
}): Promise<RcsProgramme> {
  const d = new Date(input.quand);
  if (!Number.isFinite(d.getTime())) throw new Error("Date d'envoi illisible.");
  if (d.getTime() < Date.now() + 2 * 60_000) throw new Error("L'heure choisie est déjà passée (ou dans moins de deux minutes) : choisissez « Tout de suite ».");
  if (d.getTime() > Date.now() + 30 * 86_400_000) throw new Error("Pas plus de trente jours à l'avance.");
  const hors = horsCreneauLegal(d);
  if (hors) throw new Error(`Cette heure tombe ${hors} : les SMS et RCS de prospection ne partent que du lundi au samedi, de 8 h à 22 h, hors jours fériés.`);
  const numeros = [...new Set(input.numeros)];
  if (numeros.length === 0) throw new Error("Aucun numéro exploitable.");
  if (input.repli?.trim()) {
    const { refusRepli } = await import("./rcs-texte");
    const refus = refusRepli(input.repli);
    if (refus) throw new Error(`Rien n'est programmé : ${refus}.`);
  }

  const comm = await lireUn("bo_commercialisation", input.commId);
  if (!comm) throw new Error("Commercialisation introuvable.");
  if (comm.prop_sms_sent === true) throw new Error("Les RCS de cette commercialisation sont déjà partis.");
  const avant = comm.rcs_programme as RcsProgramme | undefined;
  if (avant?.etat === "envoi") throw new Error("L'envoi programmé est en train de partir.");

  const prog: RcsProgramme = {
    etat: "attente",
    quand: d.toISOString(),
    immeubleId: input.immeubleId,
    dossierId: input.dossierId,
    lien: input.lien,
    titre: input.titre?.trim() || undefined,
    intro: input.intro?.trim() || undefined,
    repli: input.repli?.trim() || undefined,
    numeros,
    programme_le: new Date().toISOString(),
    par: input.par,
  };
  await patcher(input.commId, { rcs_programme: prog, "Modified Date": new Date().toISOString() });
  revalidatePath(`/bien/${input.immeubleId}`);
  return prog;
}

/** Retire une programmation qui n'est pas encore partie. */
export async function annulerRcs(commId: string): Promise<void> {
  const comm = await lireUn("bo_commercialisation", commId);
  const p = comm?.rcs_programme as RcsProgramme | undefined;
  if (!p) return;
  if (p.etat === "envoi") throw new Error("L'envoi est en train de partir : il ne s'annule plus.");
  if (p.etat === "parti") throw new Error("Les RCS sont déjà partis.");
  await patcher(commId, { rcs_programme: null, "Modified Date": new Date().toISOString() });
  revalidatePath(`/bien/${p.immeubleId}`);
}

/**
 * Le passage du cron : envoie les programmations arrivées à l'heure. Chacune
 * est RÉSERVÉE en base avant l'envoi (`bo_reserver_rcs_programme`) : deux
 * passages qui se chevauchent n'envoient jamais deux fois. Une heure tombée
 * hors créneau légal entre-temps (impossible à la saisie, mais un cron en
 * retard d'une nuit le pourrait) n'est PAS envoyée : elle passe en échec,
 * l'agent la reprogramme.
 */
export async function tournerRcsProgrammes(): Promise<{ partis: number; echecs: number }> {
  if (!SB_KEY) return { partis: 0, echecs: 0 };
  const res = await fetch(
    `${SB_URL}/rest/v1/bo_commercialisation?select=id,data&data->rcs_programme->>etat=eq.attente&limit=50`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return { partis: 0, echecs: 0 };
  const lignes = (await res.json()) as { id: string; data: Doc }[];
  const maintenant = Date.now();
  let partis = 0, echecs = 0;
  for (const l of lignes) {
    const p = l.data.rcs_programme as RcsProgramme | undefined;
    if (!p || Date.parse(p.quand) > maintenant) continue;
    const reserve = await appel("bo_reserver_rcs_programme", { p_id: l.id }).catch(() => false);
    if (reserve !== true) continue;
    const retard = maintenant - Date.parse(p.quand);
    const hors = horsCreneauLegal(new Date(maintenant));
    try {
      if (hors) throw new Error(`Non envoyé : l'heure est passée et l'on est maintenant ${hors}. Reprogrammez.`);
      if (retard > 6 * 3_600_000) throw new Error("Non envoyé : plus de six heures de retard sur l'heure prévue. Reprogrammez.");
      const r = await envoyerRcsDeCommercialisation({
        immeubleId: p.immeubleId, commId: l.id, dossierId: p.dossierId, lien: p.lien, titre: p.titre, intro: p.intro, repli: p.repli, numeros: p.numeros,
      });
      await patcher(l.id, {
        rcs_programme: { ...p, etat: "parti", envoye_le: new Date().toISOString(), envoyes: r.envoyes, campagne: r.campagne ?? null },
      });
      partis += 1;
    } catch (e) {
      await patcher(l.id, {
        rcs_programme: { ...p, etat: "echec", erreur: e instanceof Error ? e.message : String(e) },
      }).catch(() => undefined);
      echecs += 1;
    }
  }
  return { partis, echecs };
}
