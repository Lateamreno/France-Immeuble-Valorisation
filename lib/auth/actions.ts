"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { COOKIE_SESSION, DUREE_SESSION_MS, signerSession, type Role } from "@/lib/auth/jeton";
import {
  compteCourant, compteParEmail, compteParId, estDirection, sbComptes, tousLesComptes, type Compte,
} from "@/lib/auth/comptes";

/**
 * Connexion, mot de passe et équipe (MAV, 27/10).
 *
 * Le mot de passe est confié à Supabase Auth, sur la base du BO : le BO ne le
 * voit qu'au moment de le transmettre, ne le stocke jamais et ne l'écrit dans
 * aucun journal. Une fois le mot de passe vérifié, le BO pose son propre cookie
 * signé (lib/auth/jeton.ts).
 *
 * Personne ne choisit le mot de passe d'un autre : la direction INVITE, l'agent
 * reçoit un lien par e-mail et choisit le sien. Le même lien sert au mot de
 * passe oublié.
 */

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const admin = () => createClient(SB_URL, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Retour = { ok: boolean; message: string };

/* ---------- Freins contre l'essai de mots de passe en rafale ---------- */
const essais = new Map<string, number[]>();
function tropDEssais(cle: string, max: number, fenetreMs: number): boolean {
  const t = Date.now();
  const r = (essais.get(cle) ?? []).filter((x) => t - x < fenetreMs);
  r.push(t);
  essais.set(cle, r);
  if (essais.size > 5000) essais.clear();
  return r.length > max;
}

async function poserCookie(c: Compte) {
  const jeton = await signerSession({ c: c.id, a: c.agent_id, r: c.role, e: Date.now() + DUREE_SESSION_MS });
  (await cookies()).set(COOKIE_SESSION, jeton, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !process.env.BO_COOKIE_HTTP,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(DUREE_SESSION_MS / 1000),
  });
}

/** Une adresse de retour interne au BO, jamais un site tiers. */
const suiteSure = (s: unknown) => (typeof s === "string" && s.startsWith("/") && !s.startsWith("//") ? s : "/");

const INCORRECT = "E-mail ou mot de passe incorrect.";

export async function connecter(_: Retour | null, fd: FormData): Promise<Retour> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const mdp = String(fd.get("mdp") ?? "");
  if (!email || !mdp) return { ok: false, message: "Indiquez votre e-mail et votre mot de passe." };
  if (tropDEssais(`c:${email}`, 8, 15 * 60_000)) {
    return { ok: false, message: "Trop d'essais : réessayez dans un quart d'heure, ou demandez un nouveau mot de passe." };
  }
  const compte = await compteParEmail(email).catch(() => null);
  if (!compte || !compte.actif) return { ok: false, message: INCORRECT };

  const { data, error } = await admin().auth.signInWithPassword({ email, password: mdp });
  if (error || !data.user) return { ok: false, message: INCORRECT };
  if (compte.user_id && compte.user_id !== data.user.id) return { ok: false, message: INCORRECT };

  await sbComptes(`bo_compte?id=eq.${compte.id}`, {
    method: "PATCH",
    body: JSON.stringify({ user_id: data.user.id, derniere_connexion: new Date().toISOString() }),
  });
  await poserCookie(compte);
  redirect(suiteSure(fd.get("suite")));
}

export async function deconnecter() {
  (await cookies()).delete(COOKIE_SESSION);
  redirect("/connexion");
}

async function origine() {
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  return `${proto}://${hote}`;
}

/**
 * Envoie le lien qui permet de choisir son mot de passe. Crée l'utilisateur
 * Supabase s'il n'existe pas encore (première connexion).
 */
async function envoyerLien(compte: Compte, accueil: boolean): Promise<void> {
  const sb = admin();
  if (!compte.user_id) {
    const { data } = await sb.auth.admin.createUser({ email: compte.email, email_confirm: true });
    if (data.user) {
      await sbComptes(`bo_compte?id=eq.${compte.id}`, {
        method: "PATCH", body: JSON.stringify({ user_id: data.user.id, maj_le: new Date().toISOString() }),
      });
    }
  }
  const { data, error } = await sb.auth.admin.generateLink({ type: "recovery", email: compte.email });
  const t = data?.properties?.hashed_token;
  if (error || !t) throw new Error("Lien impossible à générer.");
  const lien = `${await origine()}/connexion/mot-de-passe?t=${encodeURIComponent(t)}`;
  const { envoyerMail } = await import("@/lib/bo/mail");
  await envoyerMail({
    to: compte.email,
    subject: accueil ? "Votre accès au back-office France Immeuble" : "Choisir un nouveau mot de passe — back-office France Immeuble",
    text: [
      "Bonjour,",
      "",
      accueil
        ? "Un accès au back-office France Immeuble vient d'être ouvert à votre nom. Pour choisir votre mot de passe, ouvrez ce lien :"
        : "Pour choisir votre mot de passe du back-office France Immeuble, ouvrez ce lien :",
      "",
      lien,
      "",
      "Le lien ne sert qu'une fois et expire au bout d'une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne change.",
      "",
      "France Immeuble",
    ].join("\n"),
  });
}

/**
 * « Première connexion ou mot de passe oublié ». La réponse est la même que
 * l'adresse soit connue ou non : la page ne doit pas servir à deviner qui a un
 * compte.
 */
export async function demanderLien(_: Retour | null, fd: FormData): Promise<Retour> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const neutre = { ok: true, message: "Si cette adresse a un accès au BO, un lien vient de lui être envoyé. Pensez aux indésirables." };
  if (!email.includes("@")) return { ok: false, message: "Indiquez votre adresse e-mail." };
  if (tropDEssais(`l:${email}`, 3, 60 * 60_000)) return neutre;
  const compte = await compteParEmail(email).catch(() => null);
  if (!compte || !compte.actif) return neutre;
  try {
    await envoyerLien(compte, !compte.user_id);
  } catch (e) {
    console.error("[connexion] lien", e instanceof Error ? e.message : e);
    return { ok: false, message: "L'e-mail n'a pas pu partir. Réessayez dans un instant, ou prévenez la direction." };
  }
  return neutre;
}

export async function definirMotDePasse(_: Retour | null, fd: FormData): Promise<Retour> {
  const t = String(fd.get("t") ?? "");
  const mdp = String(fd.get("mdp") ?? "");
  if (mdp.length < 10) return { ok: false, message: "Dix caractères au moins." };
  if (mdp !== String(fd.get("mdp2") ?? "")) return { ok: false, message: "Les deux saisies ne sont pas identiques." };
  const sb = admin();
  const { data, error } = await sb.auth.verifyOtp({ token_hash: t, type: "recovery" });
  if (error || !data.user?.email) {
    return { ok: false, message: "Ce lien a déjà servi ou a expiré. Demandez-en un nouveau depuis la page de connexion." };
  }
  const compte = await compteParEmail(data.user.email).catch(() => null);
  if (!compte || !compte.actif) return { ok: false, message: "Cet accès a été désactivé. Voyez avec la direction." };
  const maj = await sb.auth.admin.updateUserById(data.user.id, { password: mdp });
  if (maj.error) return { ok: false, message: "Mot de passe refusé : choisissez-en un plus long ou moins courant." };
  await sbComptes(`bo_compte?id=eq.${compte.id}`, {
    method: "PATCH",
    body: JSON.stringify({ user_id: data.user.id, derniere_connexion: new Date().toISOString(), maj_le: new Date().toISOString() }),
  });
  await poserCookie(compte);
  redirect("/");
}

/* ======================= L'équipe (direction) ======================= */

const REFUS = { ok: false, message: "Réservé à la direction." } as const;

/** Ouvre l'accès d'un agent (ou le renvoie) : crée son compte au besoin, puis lui envoie le lien. */
export async function inviterAgent(agentId: string, role: Role = "agent"): Promise<Retour> {
  if (!(await estDirection())) return REFUS;
  let compte = (await tousLesComptes()).find((c) => c.agent_id === agentId) ?? null;
  if (!compte) {
    const r = await sbComptes(`bo_agentfi?id=eq.${encodeURIComponent(agentId)}&select=data`);
    const a = ((await r.json()) as { data: Record<string, unknown> }[])[0]?.data;
    const email = typeof a?.email === "string" ? a.email.trim().toLowerCase() : "";
    if (!email.includes("@")) return { ok: false, message: "Cet agent n'a pas d'adresse e-mail : renseignez-la d'abord." };
    const ins = await sbComptes("bo_compte", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ agent_id: agentId, email, role }),
    }).catch((e: Error) => e);
    if (ins instanceof Error) return { ok: false, message: "Compte impossible à créer : l'adresse sert peut-être déjà à un autre agent." };
    compte = ((await ins.json()) as Compte[])[0];
  }
  if (!compte.actif) return { ok: false, message: "Ce compte est désactivé : réactivez-le d'abord." };
  try {
    await envoyerLien(compte, !compte.user_id);
  } catch {
    return { ok: false, message: "L'e-mail d'invitation n'a pas pu partir." };
  }
  revalidatePath("/reglages");
  return { ok: true, message: `Lien envoyé à ${compte.email}.` };
}

async function directionsActives(): Promise<number> {
  return (await tousLesComptes()).filter((c) => c.actif && c.role === "direction").length;
}

export async function changerRole(compteId: string, role: Role): Promise<Retour> {
  if (!(await estDirection())) return REFUS;
  const c = await compteParId(compteId);
  if (!c) return { ok: false, message: "Compte introuvable." };
  if (c.role === "direction" && role === "agent" && (await directionsActives()) <= 1) {
    return { ok: false, message: "Il faut garder au moins un compte de direction." };
  }
  await sbComptes(`bo_compte?id=eq.${compteId}`, { method: "PATCH", body: JSON.stringify({ role, maj_le: new Date().toISOString() }) });
  revalidatePath("/reglages");
  return { ok: true, message: "Rôle changé." };
}

/** Désactiver coupe l'accès tout de suite, même sur un poste resté connecté. */
export async function changerActif(compteId: string, actif: boolean): Promise<Retour> {
  if (!(await estDirection())) return REFUS;
  const moi = await compteCourant();
  if (!actif && moi?.id === compteId) return { ok: false, message: "Vous ne pouvez pas désactiver votre propre accès." };
  const c = await compteParId(compteId);
  if (!c) return { ok: false, message: "Compte introuvable." };
  if (!actif && c.role === "direction" && (await directionsActives()) <= 1) {
    return { ok: false, message: "Il faut garder au moins un compte de direction." };
  }
  await sbComptes(`bo_compte?id=eq.${compteId}`, { method: "PATCH", body: JSON.stringify({ actif, maj_le: new Date().toISOString() }) });
  revalidatePath("/reglages");
  return { ok: true, message: actif ? "Accès rétabli." : "Accès coupé." };
}

/** Crée la fiche d'un nouvel agent, puis lui ouvre son accès. */
export async function creerAgent(input: {
  prenom: string; nom: string; email: string; portable?: string; poste?: string; role: Role;
}): Promise<Retour> {
  if (!(await estDirection())) return REFUS;
  const prenom = input.prenom.trim(), nom = input.nom.trim().toUpperCase(), email = input.email.trim().toLowerCase();
  if (!prenom || !nom) return { ok: false, message: "Prénom et nom sont nécessaires." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Adresse e-mail invalide." };
  if (await compteParEmail(email)) return { ok: false, message: "Cette adresse a déjà un accès." };
  const id = `app_${Date.now()}x${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;
  const now = new Date().toISOString();
  await sbComptes("rpc/bo_insert_doc", {
    method: "POST",
    body: JSON.stringify({
      p_table: "bo_agentfi", p_id: id,
      p_doc: {
        _id: id, "prénom": prenom, nom, email, activ: true,
        initiales: `${prenom[0] ?? ""}${nom[0] ?? ""}`.toUpperCase(),
        ...(input.portable?.trim() ? { "portable (TXT)": input.portable.trim() } : {}),
        ...(input.poste?.trim() ? { Poste: input.poste.trim() } : {}),
        start_date: now, "Created Date": now, "Modified Date": now,
      },
    }),
  });
  /* La liste des agents est en cache sous l'étiquette de sa table. */
  revalidateTag("bo_agentfi", { expire: 0 });
  const r = await inviterAgent(id, input.role);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, message: `${prenom} ${nom} est créé ; ${r.message}` } : r;
}
