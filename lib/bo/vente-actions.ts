"use server";

/* Les gestes du suivi de la vente (lib/bo/vente.ts pour la lecture). */

import { revalidatePath } from "next/cache";
import { compteCourant } from "@/lib/auth/comptes";
import {
  donneesVente, echangesVente, POSTES, PROFIL_DU_POSTE,
  type DonneesVente, type Echange, type LienPieces, type Poste,
} from "@/lib/bo/vente";
import { envoyerPourAgent } from "@/lib/bo/mail";
import { destinataireInterdit, type ModeleVente } from "@/lib/vente-mail";
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

/** Un intervenant de la vente — notaire, clerc ou gestionnaire —, ou personne. */
export async function choisirIntervenant(
  immeubleId: string, poste: Poste, contactId: string | null,
): Promise<{ ok: boolean; message: string }> {
  if (!ID.test(immeubleId) || (contactId && !ID.test(contactId)) || !(poste in POSTES)) {
    return { ok: false, message: "Identifiant invalide." };
  }
  await patch("bo_immeuble", immeubleId, { [POSTES[poste]]: contactId });
  /* Le contact choisi prend le profil de son poste (« Notaire », « Clerc de
     notaire », « Gestionnaire ») : on le retrouve ainsi dans le fichier, et il
     sort des publics « clients » du Mailing (#568). */
  if (contactId) {
    const profil = PROFIL_DU_POSTE[poste];
    const res = await fetch(`${SB_URL}/rest/v1/bo_contact?select=data&id=eq.${encodeURIComponent(contactId)}`, {
      headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store",
    }).catch(() => null);
    const types = res?.ok ? (((await res.json()) as { data: { Types?: unknown } }[])[0]?.data?.Types) : undefined;
    const liste = Array.isArray(types) ? (types as string[]) : [];
    if (!liste.includes(profil)) await patch("bo_contact", contactId, { Types: [...liste, profil] }).catch(() => undefined);
  }
  revalidatePath(`/bien/${immeubleId}`);
  return { ok: true, message: contactId ? "Enregistré." : "Retiré." };
}

/** L'entité de facturation d'un client (#571) : `soc:<id>`, `nom:<société>`, ou rien (nom propre). */
export async function choisirEntite(
  immeubleId: string, contactId: string, cle: string,
): Promise<{ ok: boolean; message: string }> {
  if (!ID.test(immeubleId) || !ID.test(contactId) || !/^(|soc:[\w-]+|nom:.{1,200})$/.test(cle)) {
    return { ok: false, message: "Choix invalide." };
  }
  const res = await fetch(`${SB_URL}/rest/v1/bo_immeuble?select=data&id=eq.${encodeURIComponent(immeubleId)}`, {
    headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store",
  }).catch(() => null);
  const vu = res?.ok ? (((await res.json()) as { data: { vente_entites?: unknown } }[])[0]?.data?.vente_entites) : undefined;
  const entites = vu && typeof vu === "object" ? { ...(vu as Record<string, string>) } : {};
  entites[contactId] = cle;
  await patch("bo_immeuble", immeubleId, { vente_entites: entites });
  revalidatePath(`/bien/${immeubleId}`);
  return { ok: true, message: "Enregistré." };
}

/** Qui suit le dossier pour un côté : le notaire ou le clerc. L'autre est en copie. */
export async function choisirEnCharge(
  immeubleId: string, cote: "vendeur" | "acquereur", quoi: "notaire" | "clerc",
): Promise<{ ok: boolean; message: string }> {
  if (!ID.test(immeubleId)) return { ok: false, message: "Identifiant invalide." };
  await patch("bo_immeuble", immeubleId, { [`vente_charge_${cote}`]: quoi });
  revalidatePath(`/bien/${immeubleId}`);
  return { ok: true, message: "Enregistré." };
}

/** La civilité d'un intervenant, pour lui écrire « Madame », « Monsieur ». */
export async function poserCivilite(contactId: string, civilite: string): Promise<{ ok: boolean; message: string }> {
  if (!ID.test(contactId) || !["Monsieur", "Madame", ""].includes(civilite)) return { ok: false, message: "Civilité invalide." };
  await patch("bo_contact", contactId, { "Civilité": civilite || null });
  return { ok: true, message: "Enregistré." };
}

/** Celui qui écrit : son nom et son portable signent le message. Sans
 *  session (BO ouvert), c'est l'agent du bien — celui dont la boîte enverra. */
export async function signatureCourante(immeubleId: string): Promise<{ nom: string; tel?: string }> {
  const [moi, agents, d] = await Promise.all([
    compteCourant(), getAgents().catch(() => []),
    ID.test(immeubleId) ? donneesVente(immeubleId).catch(() => null) : null,
  ]);
  const id = moi?.agent_id ?? d?.agentId;
  const a = id ? agents.find((x) => x.id === id) : undefined;
  /* Le BO signe « VOCI Marc-Antoine » : le nom de famille d'abord. */
  const [prenom, ...nom] = (a?.name ?? "").split(" ");
  return { nom: a ? `${nom.join(" ").toUpperCase()} ${prenom}`.trim() : "", tel: a?.tel };
}

/** Un lien de pièces de plus (#570) : l'adresse et ce qu'il contient. */
export async function enregistrerLien(
  immeubleId: string, l: { url: string; pieces: string[] },
): Promise<{ ok: boolean; message: string; lien?: LienPieces }> {
  if (!ID.test(immeubleId)) return { ok: false, message: "Identifiant invalide." };
  const url = l.url.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return { ok: false, message: "Le lien doit commencer par https://." };
  const d = await donneesVente(immeubleId);
  const lien: LienPieces = {
    id: Date.now().toString(36), url, date: new Date().toISOString(),
    pieces: l.pieces.map((x) => x.trim()).filter(Boolean).slice(0, 30),
  };
  await patch("bo_immeuble", immeubleId, { vente_liens: [...d.liens, lien] });
  revalidatePath(`/bien/${immeubleId}`);
  return { ok: true, message: "Lien enregistré.", lien };
}

export async function retirerLien(immeubleId: string, lienId: string): Promise<{ ok: boolean; message: string }> {
  if (!ID.test(immeubleId)) return { ok: false, message: "Identifiant invalide." };
  const d = await donneesVente(immeubleId);
  await patch("bo_immeuble", immeubleId, { vente_liens: d.liens.filter((l) => l.id !== lienId) });
  revalidatePath(`/bien/${immeubleId}`);
  return { ok: true, message: "Lien retiré." };
}

/**
 * Le message aux parties, relu et envoyé par l'agent (doctrine §7.1 : l'écran
 * prépare, l'humain envoie). Route nominative : il part de la boîte de celui
 * qui écrit, avec sa copie dans « Envoyés ». Garde-fou : on n'écrit qu'aux
 * parties de cette vente.
 */
export async function envoyerMailVente(immeubleId: string, m: {
  a: string[]; cc: string[]; objet: string; corps: string;
  /** Le modèle employé : la version notaires ne part jamais à un client (#571). */
  modele?: ModeleVente;
  /** Les adresses ajoutées à la main dans la fenêtre (#572) : un contact du
   *  fichier ou une simple adresse, hors des parties de la vente. */
  ajoutes?: string[];
}): Promise<{ ok: boolean; message: string }> {
  if (!ID.test(immeubleId)) return { ok: false, message: "Bien introuvable." };
  if (!m.objet.trim() || !m.corps.trim()) return { ok: false, message: "Il faut un objet et un texte." };
  const [d, moi] = await Promise.all([donneesVente(immeubleId), compteCourant()]);
  const connues = new Set(d.parties.map((p) => p.email).filter(Boolean));
  const propre = (l: string[]) => [...new Set(l.map((x) => x.trim().toLowerCase()).filter(Boolean))];
  const a = propre(m.a);
  const cc = propre(m.cc).filter((x) => !a.includes(x));
  if (a.length === 0) return { ok: false, message: "Choisissez au moins un destinataire." };
  /* Garde-fou : une adresse qui n'est pas une partie n'est acceptée que si
     l'agent l'a ajoutée lui-même, et qu'elle a la forme d'une adresse. */
  const ajoutes = new Set(propre(m.ajoutes ?? []).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x)));
  const inconnue = [...a, ...cc].find((x) => !connues.has(x) && !ajoutes.has(x));
  if (inconnue) return { ok: false, message: `${inconnue} n'est ni une partie de cette vente, ni une adresse ajoutée.` };
  for (const x of [...a, ...cc]) {
    const p = d.parties.find((q) => q.email === x);
    const raison = p && destinataireInterdit(m.modele ?? "libre", p);
    if (raison) return { ok: false, message: `${p!.nom} : ${raison}.` };
  }
  try {
    const r = await envoyerPourAgent(moi?.agent_id ?? d.agentId, {
      to: a.join(", "), cc: cc.length ? cc.join(", ") : undefined,
      subject: m.objet.trim(), text: m.corps, replyTo: moi?.email,
    });
    revalidatePath(`/bien/${immeubleId}`);
    return {
      ok: true,
      message: r.copieDansEnvoyes === false
        ? `Envoyé depuis ${r.expediteur}, mais la copie n'a pas pu être rangée dans « Envoyés »${r.copieErreur ? ` (${r.copieErreur})` : ""}.`
        : `Envoyé depuis ${r.expediteur}.`,
    };
  } catch (e) {
    return { ok: false, message: messageClair(e) };
  }
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
