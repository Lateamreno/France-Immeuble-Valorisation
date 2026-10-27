"use server";

/* Les gestes du suivi de la vente (lib/bo/vente.ts pour la lecture). */

import { revalidatePath } from "next/cache";
import { compteCourant } from "@/lib/auth/comptes";
import { donneesVente, echangesVente, type DonneesVente, type Echange } from "@/lib/bo/vente";
import { lireMessage, messageClair, type MessageComplet } from "@/lib/mails/client";
import { boiteDe } from "@/lib/mails/boites";
import { getAgents } from "@/lib/bubble/server";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ID = /^[0-9a-z_]+x?[0-9a-z_]*$/i;

async function patch(table: string, id: string, p: Record<string, unknown>) {
  if (!SB_KEY) throw new Error("Base indisponible.");
  const res = await fetch(`${SB_URL}/rest/v1/rpc/bo_patch_doc`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_table: table, p_id: id, p_patch: p }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture ${table} ${res.status}`);
}

export async function chargerVente(immeubleId: string): Promise<DonneesVente | null> {
  if (!ID.test(immeubleId)) return null;
  return donneesVente(immeubleId).catch(() => null);
}

/** Les e-mails avec les parties — lents (deux recherches IMAP), donc à part. */
export async function chargerEchanges(immeubleId: string): Promise<
  { ok: true; echanges: Echange[]; boite: string } | { ok: false; erreur: string }
> {
  if (!ID.test(immeubleId)) return { ok: false, erreur: "Bien introuvable." };
  const [d, moi] = await Promise.all([donneesVente(immeubleId), compteCourant()]);
  return echangesVente(d, moi?.agent_id);
}

/** Ouvre un message trouvé, sans le marquer lu dans la boîte de l'agent. */
export async function ouvrirEchange(immeubleId: string, dossier: "reception" | "envoyes", uid: number): Promise<
  { ok: true; message: MessageComplet } | { ok: false; erreur: string }
> {
  try {
    const [d, moi, agents] = await Promise.all([donneesVente(immeubleId), compteCourant(), getAgents().catch(() => [])]);
    const b = (d.agentId ? await boiteDe(d.agentId, agents) : undefined)
      ?? (moi ? await boiteDe(moi.agent_id, agents) : undefined);
    if (!b) return { ok: false, erreur: "Aucune boîte e-mail branchée pour l'agent du bien." };
    const m = await lireMessage(b, dossier, uid, false);
    if (!m) return { ok: false, erreur: "Message introuvable : il a peut-être été déplacé." };
    /* Garde-fou : on n'ouvre que ce qui touche une partie de la vente. */
    const adresses = new Set(d.parties.map((p) => p.email).filter(Boolean));
    if (!adresses.has(m.de) && !m.pour.some((x) => adresses.has(x))) return { ok: false, erreur: "Ce message ne concerne pas la vente." };
    return { ok: true, message: m };
  } catch (e) {
    return { ok: false, erreur: messageClair(e) };
  }
}

/** Le notaire d'une partie : un contact du fichier, ou personne. */
export async function choisirNotaire(
  immeubleId: string, cote: "vendeur" | "acquereur", contactId: string | null,
): Promise<{ ok: boolean; message: string }> {
  if (!ID.test(immeubleId) || (contactId && !ID.test(contactId))) return { ok: false, message: "Identifiant invalide." };
  await patch("bo_immeuble", immeubleId, { [`vente_notaire_${cote}`]: contactId });
  /* Le contact choisi porte désormais le profil « Notaire » : on le retrouve
     ainsi dans le fichier, et il sort des publics « clients » du Mailing. */
  if (contactId) {
    const res = await fetch(`${SB_URL}/rest/v1/bo_contact?select=data&id=eq.${encodeURIComponent(contactId)}`, {
      headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store",
    }).catch(() => null);
    const types = res?.ok ? (((await res.json()) as { data: { Types?: unknown } }[])[0]?.data?.Types) : undefined;
    const liste = Array.isArray(types) ? (types as string[]) : [];
    if (!liste.includes("Notaire")) await patch("bo_contact", contactId, { Types: [...liste, "Notaire"] }).catch(() => undefined);
  }
  revalidatePath(`/bien/${immeubleId}`);
  return { ok: true, message: contactId ? "Notaire enregistré." : "Notaire retiré." };
}

/** Les dates du compromis et de l'acte, sur l'offre retenue. */
export async function enregistrerJalons(
  immeubleId: string, offreId: string, j: { dateCompromis?: string | null; dateActe?: string | null },
): Promise<{ ok: boolean; message: string }> {
  if (!ID.test(immeubleId) || !ID.test(offreId)) return { ok: false, message: "Identifiant invalide." };
  const iso = (v?: string | null) => (v ? new Date(v).toISOString() : null);
  const p: Record<string, unknown> = {};
  if (j.dateCompromis !== undefined) p.date_compromis = iso(j.dateCompromis);
  if (j.dateActe !== undefined) p.date_acte = iso(j.dateActe);
  if (Object.keys(p).length === 0) return { ok: true, message: "Rien à changer." };
  await patch("bo_offre", offreId, p);
  revalidatePath(`/bien/${immeubleId}`);
  return { ok: true, message: "Dates enregistrées." };
}
