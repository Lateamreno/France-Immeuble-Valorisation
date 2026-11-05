/**
 * Le jeton de session du BO (MAV, 27/10 : « que chacun ait son mot de passe »).
 *
 * Un cookie signé, lisible par le middleware sans aller en base : qui est
 * connecté, avec quel rôle, jusqu'à quand. La signature est un HMAC-SHA256 ;
 * sa clé est `BO_SESSION_SECRET` si elle est posée, sinon elle se dérive de la
 * clé de service Supabase, déjà secrète côté serveur — aucune variable de plus
 * à créer pour démarrer. Changer l'une ou l'autre déconnecte tout le monde.
 *
 * Le jeton dit qui on est ; il ne suffit pas à rester connecté : le serveur
 * relit le compte en base à chaque page (lib/auth/comptes.ts), et un compte
 * désactivé est refusé aussitôt, même avec un jeton encore valide.
 *
 * Écrit pour le Web Crypto : il tourne aussi bien dans le middleware que dans
 * les pages et les actions.
 */

export const COOKIE_SESSION = "fi_session";
/** Trente jours : un poste de travail ne redemande pas le mot de passe chaque matin. */
export const DUREE_SESSION_MS = 30 * 24 * 3600 * 1000;

export type Role = "direction" | "agent";
export type Session = {
  /** Le compte (bo_compte.id). */
  c: string;
  /** L'agent (bo_agentfi id). */
  a: string;
  r: Role;
  /** Expiration, en millisecondes. */
  e: number;
};

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.BO_SESSION_SECRET?.trim();
  if (s) return s;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!k) throw new Error("Aucune clé pour signer les sessions.");
  return `fi-session:${k}`;
}

const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function cle() {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signerSession(s: Session): Promise<string> {
  const corps = b64url(enc.encode(JSON.stringify(s)));
  const sig = await crypto.subtle.sign("HMAC", await cle(), enc.encode(corps));
  return `${corps}.${b64url(sig)}`;
}

/** La session portée par le cookie, ou `null` si elle est absente, falsifiée ou échue. */
export async function lireSession(valeur: string | undefined | null): Promise<Session | null> {
  if (!valeur) return null;
  const [corps, sig] = valeur.split(".");
  if (!corps || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await cle(), deB64url(sig), enc.encode(corps));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(deB64url(corps))) as Session;
    if (!s.c || !s.a || (s.r !== "direction" && s.r !== "agent") || typeof s.e !== "number" || s.e < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

/** Les adresses ouvertes sans connexion. Toutes les autres la demandent. */
export function cheminPublic(chemin: string): boolean {
  return (
    chemin === "/connexion" || chemin.startsWith("/connexion/")
    /* L'espace client fermé le 22/10 : ces adresses disent au client que son
       compte est sur le site. */
    || chemin.startsWith("/espace") || chemin.startsWith("/proprietaire")
    /* Les machines : chacune a sa propre clé (site, Claude, MailingVox, crons). */
    || chemin.startsWith("/api/site/") || chemin.startsWith("/api/claude/")
    || chemin.startsWith("/api/mailingvox/") || chemin === "/api/mails/releve"
    || chemin === "/api/relances/tourner"
    /* Le lien de désinscription des campagnes : le destinataire n'a pas de
       compte, son jeton suffit (lib/bo/campagnes-actions.ts). */
    || chemin === "/desabonnement" || chemin === "/api/desabonnement"
    /* Le relais des photos sert aussi Plein Bail, le site et les dossiers
       envoyés : à refermer par des liens signés (CLAUDE.md §10 bis). */
    || chemin === "/api/photo"
    || chemin === "/manifest.webmanifest" || chemin === "/robots.txt"
  );
}
