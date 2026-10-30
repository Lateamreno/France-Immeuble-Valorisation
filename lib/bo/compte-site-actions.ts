"use server";

// Le panneau « Son compte sur le site » de la fiche contact (contrat §9.6) :
// ce que voit le client, relu dans la base du site, et un geste pour le
// redéposer. Rien ici n'écrit vers le client autrement que par le dépôt.

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { deposerCompte, lireCompteSurLeSite, type LignesCompte } from "@/lib/bo/compte-site";
import { compteCourant } from "@/lib/auth/comptes";
import { getAgents } from "@/lib/bubble/server";

const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type VueCompte = {
  compte: string | null;
  rattacheLe?: string;
  depotLe?: string;
  erreur?: string;
  lignes: LignesCompte | null;
  /** Le fil des messages, lu dans le BO : il fait foi, même avant que le site
   *  ait sa table `compte_messages`. */
  messages?: { id: string; de: "client" | "agent"; auteur?: string; texte: string; le: string; conversation: string; titre?: string; pieces: string[] }[];
};

export async function voirCompteSite(contactId: string): Promise<VueCompte> {
  if (!BO_KEY) return { compte: null, lignes: null };
  const res = await fetch(`${BO_URL}/rest/v1/bo_contact?select=data&id=eq.${encodeURIComponent(contactId)}`, {
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  });
  const [c] = res.ok ? ((await res.json()) as { data: Record<string, unknown> }[]) : [];
  const compte = typeof c?.data.site_compte === "string" ? c.data.site_compte : null;
  if (!compte) return { compte: null, lignes: null };
  return {
    compte,
    rattacheLe: typeof c.data.site_compte_le === "string" ? c.data.site_compte_le : undefined,
    depotLe: typeof c.data.site_compte_depot_le === "string" ? c.data.site_compte_depot_le : undefined,
    erreur: typeof c.data.site_compte_erreur === "string" ? c.data.site_compte_erreur : undefined,
    lignes: await lireCompteSurLeSite(compte),
    messages: (await lireMessages(contactId)),
  };
}

export async function redeposerCompteSite(contactId: string) {
  const r = await deposerCompte(contactId);
  revalidatePath(`/contact/${contactId}`);
  return r;
}

/* ----------------------------------------------------------- V2 (30/10) */

async function rpcBo(fn: string, args: Record<string, unknown>) {
  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente.");
  const res = await fetch(`${BO_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${fn} ${res.status} : ${(await res.text()).slice(0, 200)}`);
}

async function lire(chemin: string): Promise<{ id: string; data: Record<string, unknown> }[]> {
  if (!BO_KEY) return [];
  const res = await fetch(`${BO_URL}/rest/v1/${chemin}`, {
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  });
  return res.ok ? res.json() : [];
}

/**
 * L'agent répond au client, depuis le panneau « Son compte sur le site ».
 * Écrire et cliquer « Envoyer », c'est la validation humaine (§7.1) : rien ne
 * part tout seul. La réponse entre au suivi du contact, ferme ses messages en
 * attente dans les Questions, et rejoint son compte au dépôt suivant — tout de
 * suite.
 */
export async function repondreAuClient(
  contactId: string, texte: string,
  /** La conversation où l'on répond ; sans elle, on en ouvre une, nommée `titre`. */
  o: { conversation?: string; titre?: string; immeubleId?: string } = {},
) {
  const t = texte.trim().slice(0, 5000);
  if (!t) return { ok: false, message: "Le message est vide." };
  const immeubleId = o.immeubleId;
  const titre = o.titre?.trim().slice(0, 120) || undefined;
  if (!o.conversation && !titre) return { ok: false, message: "Donnez un titre à la nouvelle conversation." };
  const [c] = await lire(`bo_contact?select=id,data&id=eq.${encodeURIComponent(contactId)}`);
  if (!c || typeof c.data.site_compte !== "string") return { ok: false, message: "Ce contact n'a pas de compte sur le site." };
  const moi = await compteCourant();
  const agent = moi ? (await getAgents()).find((a) => a.id === moi.agent_id) : undefined;
  const id = `app_${Date.now()}x${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;
  const now = new Date().toISOString();
  await rpcBo("bo_insert_doc", {
    p_table: "bo_suivi", p_id: id,
    p_doc: {
      Type: "Message", AGENT: moi?.agent_id, CONTACT: contactId,
      IMMEUBLEs: immeubleId ? [immeubleId] : [], Canals: ["Site"],
      notes: t, Statut: "Traité",
      site_message: "agent", site_auteur: agent?.name || "France Immeuble",
      site_conversation: o.conversation ?? randomUUID(), ...(titre ? { site_titre: titre } : {}),
      date_start: now, "Created Date": now, "Modified Date": now,
    },
  });
  await rpcBo("bo_append_ref", { p_table: "bo_contact", p_id: contactId, p_key: "SUIVIs", p_value: id }).catch(() => undefined);
  if (immeubleId) await rpcBo("bo_append_ref", { p_table: "bo_immeuble", p_id: immeubleId, p_key: "SUIVIs", p_value: id }).catch(() => undefined);
  /* Répondre, c'est traiter : les messages du client en attente se ferment. */
  const ouverts = await lire(`bo_question?select=id&data->>CONTACT=eq.${encodeURIComponent(contactId)}&data->>nature=eq.message&data->>ended=eq.false&limit=100`);
  for (const q of ouverts) {
    await rpcBo("bo_patch_doc", { p_table: "bo_question", p_id: q.id, p_patch: { ended: true, "Modified Date": now } }).catch(() => undefined);
  }
  const r = await deposerCompte(contactId);
  revalidatePath(`/contact/${contactId}`);
  return r.ok ? { ok: true, message: "Envoyé sur son compte." } : { ok: false, message: `Enregistré, mais le dépôt a échoué : ${r.message}` };
}

/**
 * L'agent transmet une offre au propriétaire (MAV, 30/10) : elle apparaît sur
 * son compte avec le nom de l'acquéreur, la date, la validité, le HAI, le net
 * vendeur, les honoraires et le document. Un second geste la retire.
 */
export async function transmettreOffre(immeubleId: string, offreId: string, transmettre: boolean) {
  const [o] = await lire(`bo_offre?select=id,data&id=eq.${encodeURIComponent(offreId)}`);
  const ims = Array.isArray(o?.data.IMMEUBLEs) ? (o!.data.IMMEUBLEs as unknown[]) : [];
  if (!o || !ims.includes(immeubleId)) return { ok: false, message: "Offre introuvable sur ce bien." };
  const moi = await compteCourant();
  await rpcBo("bo_patch_doc", {
    p_table: "bo_offre", p_id: offreId,
    p_patch: transmettre
      ? { site_transmise_le: new Date().toISOString(), site_transmise_par: moi?.agent_id ?? null }
      : { site_transmise_le: null, site_transmise_par: null },
  });
  const [im] = await lire(`bo_immeuble?select=id,data&id=eq.${encodeURIComponent(immeubleId)}`);
  const proprietaires = [im?.data.PROPRIETAIRE, ...(Array.isArray(im?.data.PROPRIETAIREs) ? im!.data.PROPRIETAIREs as unknown[] : [])]
    .filter((x): x is string => typeof x === "string" && !!x);
  const filtre = [...new Set(proprietaires)].map((x) => `"${x}"`).join(",");
  const avecCompte = filtre ? await lire(`bo_contact?select=id&id=in.(${encodeURIComponent(filtre)})&data->>site_compte=not.is.null`) : [];
  for (const c of avecCompte) await deposerCompte(c.id).catch(() => undefined);
  revalidatePath(`/bien/${immeubleId}`);
  if (!transmettre) return { ok: true, message: "Offre retirée de son compte." };
  return avecCompte.length
    ? { ok: true, message: "Offre transmise : elle est sur son compte." }
    : { ok: true, message: "Offre marquée transmise. Le propriétaire n'a pas encore de compte sur le site : elle y paraîtra dès qu'il en aura un." };
}

async function lireMessages(contactId: string): Promise<NonNullable<VueCompte["messages"]>> {
  const rows = await lire(`bo_suivi?select=id,data&data->>CONTACT=eq.${encodeURIComponent(contactId)}&data->>site_message=not.is.null&limit=500`);
  return rows
    .map((m) => ({
      id: m.id,
      de: m.data.site_message === "agent" ? "agent" as const : "client" as const,
      auteur: typeof m.data.site_auteur === "string" ? m.data.site_auteur : undefined,
      texte: typeof m.data.notes === "string" ? m.data.notes : "",
      le: String(m.data["Created Date"] ?? ""),
      conversation: typeof m.data.site_conversation === "string" ? m.data.site_conversation : m.id,
      titre: typeof m.data.site_titre === "string" ? m.data.site_titre : undefined,
      pieces: Array.isArray(m.data.site_pieces) ? (m.data.site_pieces as { nom?: string }[]).map((x) => String(x.nom ?? "")).filter(Boolean) : [],
    }))
    .sort((a, b) => a.le.localeCompare(b.le));
}
