"use server";

/**
 * L'espace client vu du back-office : ouvrir un accès, le couper, le lire.
 *
 * Ces actions-là sont réservées aux AGENTS, elles portent donc la clé de
 * service — comme le reste du BO. Elles sont volontairement dans un fichier
 * distinct de tout ce que touche l'espace client : la frontière doit se voir
 * dans l'arborescence, pas seulement dans les têtes.
 *
 * Ce que le BO peut faire et que le client ne peut pas : créer un compte,
 * fabriquer un lien d'activation, désactiver. Ce que même le BO ne peut pas
 * faire : lire un mot de passe — l'empreinte reste dans la base, et aucune
 * fonction ne la rend.
 */

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const entetes = (extra: Record<string, string> = {}) => ({
  apikey: SB_KEY as string,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

async function lire<T>(chemin: string): Promise<T[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, { headers: entetes(), cache: "no-store" })
    .catch(() => null);
  return res?.ok ? ((await res.json()) as T[]) : [];
}

async function ecrire<T>(chemin: string, methode: "POST" | "PATCH" | "DELETE", corps?: unknown): Promise<T[]> {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    method: methode,
    headers: entetes({ Prefer: "return=representation" }),
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!res.ok) throw new Error(`${methode} ${chemin} → ${res.status}`);
  return methode === "DELETE" ? [] : ((await res.json()) as T[]);
}

/** Ce que le BO affiche d'un compte — jamais l'empreinte du mot de passe. */
export type CompteVu = {
  id: string;
  email: string;
  actif: boolean;
  active_le: string | null;
  vu_le: string | null;
  connexions: number;
};

const CHAMPS = "id,email,actif,active_le,vu_le,connexions";

export async function compteDuContact(contactId: string): Promise<CompteVu | null> {
  const r = await lire<CompteVu>(
    `fi_compte_client?contact_id=eq.${encodeURIComponent(contactId)}&select=${CHAMPS}&order=cree_le.desc&limit=1`,
  );
  return r[0] ?? null;
}

const jeton = () => randomBytes(32).toString("base64url");

/**
 * Ouvre (ou rouvre) le compte d'un contact et rend le lien d'activation.
 *
 * Le lien vaut une semaine et ne sert qu'une fois. Il ne porte pas de mot de
 * passe : la personne choisit le sien, et nous ne l'avons jamais eu.
 */
export async function ouvrirCompteClient(
  contactId: string, email: string, agent?: string,
): Promise<{ ok: false; message: string } | { ok: true; lien: string; email: string }> {
  const propre = email.trim().toLowerCase();
  if (!propre.includes("@")) {
    return { ok: false, message: "Cette fiche contact n'a pas d'adresse e-mail." };
  }

  const [existant] = await lire<{ id: string; contact_id: string; actif: boolean }>(
    `fi_compte_client?email=eq.${encodeURIComponent(propre)}&select=id,contact_id,actif&limit=1`,
  );
  if (existant && existant.contact_id !== contactId) {
    /* Une adresse, une personne. Deux fiches derrière la même boîte, c'est un
       doublon à fusionner — pas un second compte à créer. */
    return {
      ok: false,
      message: "Cette adresse est déjà rattachée à une autre fiche contact. Fusionnez les fiches avant d'ouvrir l'espace.",
    };
  }

  let id = existant?.id;
  if (!id) {
    const [cree] = await ecrire<{ id: string }>("fi_compte_client", "POST", [{
      email: propre, contact_id: contactId, cree_par: agent ?? null,
    }]);
    id = cree.id;
  } else if (!existant!.actif) {
    await ecrire(`fi_compte_client?id=eq.${id}`, "PATCH", { actif: true });
  }

  const j = jeton();
  await ecrire("fi_jeton_compte", "POST", [{
    jeton: j, compte_id: id, usage: "activation",
    expire_le: new Date(Date.now() + 7 * 86400_000).toISOString(),
  }]);

  revalidatePath(`/contact/${contactId}`);
  return { ok: true, email: propre, lien: `/espace/activer/${j}` };
}

/** Coupe l'accès : le compte reste, les sessions tombent à la seconde. */
export async function desactiverCompteClient(contactId: string) {
  const c = await compteDuContact(contactId);
  if (!c) return;
  await ecrire(`fi_compte_client?id=eq.${c.id}`, "PATCH", { actif: false });
  await ecrire(`fi_session_client?compte_id=eq.${c.id}`, "DELETE").catch(() => undefined);
  revalidatePath(`/contact/${contactId}`);
}

/** Les réponses d'acquéreurs qui attendent l'agent. */
export async function reponsesEnAttente() {
  return lire<{
    id: string; proposition_id: string; immeuble_id: string;
    reponse: "interesse" | "visite"; mot: string | null; le: string;
  }>("fi_reponse_proposition?traitee=is.false&reponse=in.(interesse,visite)&select=*&order=le.desc&limit=100");
}

export async function marquerReponseTraitee(id: string, immeubleId: string) {
  await ecrire(`fi_reponse_proposition?id=eq.${id}`, "PATCH", { traitee: true });
  revalidatePath(`/bien/${immeubleId}`);
  revalidatePath("/propositions");
}
