"use server";

/* Actions de la messagerie : réglage d'une boîte, et gestes du client mail.
 *
 * Tout passe par le serveur : le mot de passe d'une boîte ne descend jamais
 * dans le navigateur, et aucune de ces fonctions ne rend un secret.
 */

import { revalidatePath } from "next/cache";
import { boiteDe, type Boite } from "@/lib/mails/boites";
import { chiffrementDisponible, chiffrer } from "@/lib/mails/coffre";
import {
  deplacer, envoyerDepuis, lireMessage, listerMessages, marquerLus, marquerRepondu,
  messageClair, verifier, type RoleDossier,
} from "@/lib/mails/client";
import { getAgents } from "@/lib/bubble/server";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function ecrire(chemin: string, init: RequestInit) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente.");
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const t = await res.text();
  return t ? (JSON.parse(t) as Record<string, unknown>[]) : [];
}

/* Résoudre la boîte, c'est lire la table des agents, lire la table des boîtes
   et déchiffrer un mot de passe. Trois fois rien, mais à CHAQUE geste — ouvrir
   un message, marquer lu, changer de dossier — ça s'ajoutait à l'attente. Les
   réglages ne changent pas toutes les secondes : on garde le résultat une
   minute, et on l'oublie dès qu'une boîte est modifiée. */
const BOITES = new Map<string, { b: Boite; le: number }>();
const BOITE_MS = 60_000;

/** La boîte de l'agent, résolue avec les agents connus. */
async function boite(agentId: string): Promise<Boite> {
  const garde = BOITES.get(agentId);
  if (garde && Date.now() - garde.le < BOITE_MS) return garde.b;
  const agents = await getAgents().catch(() => []);
  const b = await boiteDe(agentId, agents);
  if (!b) throw new Error("Aucune boîte e-mail configurée pour cet agent.");
  BOITES.set(agentId, { b, le: Date.now() });
  return b;
}

/* ------------------------------------------------------- réglage --- */

export type Reglage = {
  agentId: string;
  adresse: string;
  nomAffiche?: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  /** Vide = on garde le mot de passe déjà enregistré. */
  motDePasse?: string;
  /** Identifiant de connexion s'il diffère de l'adresse. */
  identifiant?: string;
};

/**
 * Vérifie une boîte SANS rien enregistrer.
 *
 * L'ordre compte : on ne veut pas stocker des identifiants qu'on n'a pas
 * essayés, sinon l'agent croit sa boîte branchée et découvre le contraire au
 * premier message.
 */
export async function verifierBoite(r: Reglage) {
  if (!r.motDePasse) {
    /* Sans mot de passe neuf, on teste celui déjà en base. */
    try {
      return await verifier(await boite(r.agentId));
    } catch (e) {
      return { ok: false as const, erreur: e instanceof Error ? e.message : String(e) };
    }
  }
  const essai: Boite = {
    agentId: r.agentId,
    adresse: r.adresse,
    nomAffiche: r.nomAffiche,
    imap: { host: r.imapHost, port: r.imapPort, user: r.identifiant || r.adresse, pass: r.motDePasse },
    smtp: { host: r.smtpHost, port: r.smtpPort, user: r.identifiant || r.adresse, pass: r.motDePasse },
    origine: "base",
  };
  try {
    return await verifier(essai);
  } catch (e) {
    return { ok: false as const, erreur: messageClair(e) };
  }
}

/**
 * Enregistre une boîte — après l'avoir vérifiée. Le mot de passe est chiffré ;
 * il n'est jamais relu par l'écran, seulement par le serveur au moment de se
 * connecter.
 */
export async function enregistrerBoite(r: Reglage) {
  if (r.motDePasse && !chiffrementDisponible()) {
    throw new Error(
      "MAIL_CRYPTO_KEY absente : impossible de chiffrer le mot de passe, donc impossible de l'enregistrer.",
    );
  }
  const v = await verifierBoite(r);
  if (!v.ok) throw new Error(v.erreur);

  /* On mémorise les chemins réels des dossiers découverts : ça évite un LIST
     à chaque affichage, et « Éléments envoyés » n'est pas devinable. */
  const dossiers: Record<string, string> = {};
  for (const d of v.dossiers) if (d.role && !dossiers[d.role]) dossiers[d.role] = d.chemin;

  const ligne: Record<string, unknown> = {
    agent_id: r.agentId,
    adresse: r.adresse,
    nom_affiche: r.nomAffiche ?? null,
    imap_host: r.imapHost, imap_port: r.imapPort, imap_user: r.identifiant || r.adresse,
    smtp_host: r.smtpHost, smtp_port: r.smtpPort, smtp_user: r.identifiant || r.adresse,
    dossiers,
    actif: true,
    derniere_ok: new Date().toISOString(),
    derniere_erreur: null,
    maj_le: new Date().toISOString(),
  };
  if (r.motDePasse) ligne.secret_imap = chiffrer(r.motDePasse);
  /* Les réglages changent : ce qu'on gardait en mémoire est périmé. */
  BOITES.delete(r.agentId);

  await ecrire("fi_boite_agent?on_conflict=agent_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([ligne]),
  });
  revalidatePath("/mails");
  revalidatePath("/mails/reglages");
  return { ok: true as const, dossiers };
}

export async function supprimerBoite(agentId: string) {
  BOITES.delete(agentId);
  await ecrire(`fi_boite_agent?agent_id=eq.${encodeURIComponent(agentId)}`, { method: "DELETE" });
  revalidatePath("/mails");
  revalidatePath("/mails/reglages");
}

/* --------------------------------------------------- gestes mail --- */

export async function chargerDossier(agentId: string, role: RoleDossier, depuis = 0) {
  try {
    return { ok: true as const, page: await listerMessages(await boite(agentId), role, depuis) };
  } catch (e) {
    return { ok: false as const, erreur: messageClair(e) };
  }
}

export async function ouvrirMessage(agentId: string, role: RoleDossier, uid: number) {
  try {
    return { ok: true as const, message: await lireMessage(await boite(agentId), role, uid) };
  } catch (e) {
    return { ok: false as const, erreur: messageClair(e) };
  }
}

export async function basculerLu(agentId: string, role: RoleDossier, uids: number[], lu: boolean) {
  await marquerLus(await boite(agentId), role, uids, lu);
  revalidatePath("/mails");
}

export async function deplacerMessages(
  agentId: string, role: RoleDossier, uids: number[], vers: RoleDossier,
) {
  await deplacer(await boite(agentId), role, uids, vers);
  revalidatePath("/mails");
}

export async function repondre(agentId: string, m: {
  to: string;
  cc?: string;
  objet: string;
  texte: string;
  /** Le message auquel on répond : son identifiant fait le fil. */
  inReplyTo?: string;
  references?: string[];
  /** Pour poser le chevron « répondu » sur l'original. */
  role?: RoleDossier;
  uid?: number;
}) {
  const b = await boite(agentId);
  const envoi = await envoyerDepuis(b, {
    to: m.to, cc: m.cc, objet: m.objet, texte: m.texte,
    inReplyTo: m.inReplyTo, references: m.references,
  });
  if (m.role && m.uid) await marquerRepondu(b, m.role, m.uid);
  revalidatePath("/mails");
  return envoi;
}
