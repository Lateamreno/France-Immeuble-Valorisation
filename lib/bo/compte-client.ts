/**
 * L'espace client — comptes, mots de passe et sessions.
 *
 * MAV : « s'il y a l'avancement il faut que ce soit un compte avec mot de
 * passe où le gars voit ses recherches et ses immeubles. Sinon il va pas
 * revenir sur un lien où tout le monde peut aller. » Il a raison : un lien
 * qu'on ouvre une fois et qu'on ne retrouve plus n'est pas un espace, c'est une
 * page. Ce qui fait revenir, c'est d'avoir une adresse à soi.
 *
 * ## Pourquoi une authentification écrite ici
 *
 * Le BO n'en a aucune, et le projet n'utilise nulle part de client Supabase :
 * tout passe par REST avec la clé de service. Brancher l'authentification
 * Supabase imposerait de configurer son expéditeur SMTP pour que les mails
 * d'activation partent — un chantier de plus, sur le chemin critique. On écrit
 * donc le strict nécessaire, avec les primitives de Node :
 *
 * - **scrypt** pour les mots de passe. Lent par construction, avec un sel par
 *   compte : deux personnes qui choisissent le même mot de passe n'ont pas la
 *   même empreinte, et une base volée ne se retourne pas en table.
 * - **Comparaison à temps constant** à la vérification. Un `===` sur des
 *   empreintes s'arrête au premier octet différent, ce qui se mesure.
 * - **Sessions opaques en base**, pas de jeton autoporteur. Se déconnecter, ou
 *   couper un accès depuis le BO, doit avoir un effet immédiat — un JWT reste
 *   valable jusqu'à son expiration, quoi qu'on fasse.
 *
 * ## Ce que ce fichier ne fait pas
 *
 * Il n'ouvre aucun droit. Il dit seulement QUI est connecté ; ce que cette
 * personne a le droit de voir se décide dans `espace-client.ts`, à partir de sa
 * fiche contact.
 */

import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";

const scryptBrut = promisify(scryptCb) as (
  secret: string, sel: Buffer, longueur: number, options: { N: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt, avec sa mémoire.
 *
 * Node plafonne scrypt à 32 Mo par défaut, et 2^15 en réclame 33,5 : sans ce
 * `maxmem`, le calcul jette « memory limit exceeded » — et il le jette au
 * moment où quelqu'un pose son mot de passe, pas au démarrage. On dimensionne
 * donc la limite sur le coût demandé, avec de la marge.
 */
const scrypt = (secret: string, sel: Buffer, longueur: number, n: number) =>
  scryptBrut(secret, sel, longueur, { N: n, maxmem: 256 * n * 8 });

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const COOKIE_SESSION = "fi_client";

/** Coût du calcul. 2^15 : quelques dizaines de millisecondes, invisible à la
 *  connexion, très cher à répéter des milliards de fois. */
const N = 32768;

const entetes = (extra: Record<string, string> = {}) => ({
  apikey: SB_KEY as string,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

export async function rest<T>(chemin: string): Promise<T[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    headers: entetes(), cache: "no-store",
  }).catch(() => null);
  return res?.ok ? ((await res.json()) as T[]) : [];
}

export async function ecrireRest(
  chemin: string, methode: "POST" | "PATCH" | "DELETE", corps?: unknown,
) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    method: methode,
    headers: entetes({ Prefer: "return=representation" }),
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!res.ok) throw new Error(`${methode} ${chemin} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return methode === "DELETE" ? [] : res.json();
}

/* ---------- Mots de passe ---------- */

/** « scrypt$N$sel$empreinte », tout en base64url. */
export async function empreinte(motDePasse: string): Promise<string> {
  const sel = randomBytes(16);
  const cle = await scrypt(motDePasse.normalize("NFKC"), sel, 32, N);
  return `scrypt$${N}$${sel.toString("base64url")}$${cle.toString("base64url")}`;
}

/**
 * Le mot de passe correspond-il à l'empreinte ?
 *
 * On recalcule avec le sel et le coût STOCKÉS, pas avec ceux d'aujourd'hui :
 * le jour où le coût monte, les anciens comptes continuent de se connecter.
 */
export async function correspond(motDePasse: string, stocke: string | null): Promise<boolean> {
  if (!stocke) return false;
  const [algo, n, sel, attendu] = stocke.split("$");
  if (algo !== "scrypt" || !n || !sel || !attendu) return false;
  const cle = await scrypt(motDePasse.normalize("NFKC"), Buffer.from(sel, "base64url"), 32, Number(n))
    .catch(() => null);
  if (!cle) return false;
  const ref = Buffer.from(attendu, "base64url");
  return cle.length === ref.length && timingSafeEqual(cle, ref);
}

/**
 * Ce qu'on refuse comme mot de passe.
 *
 * Douze caractères et rien d'autre : pas de majuscule obligatoire, pas de
 * chiffre imposé. Les règles de composition poussent à « Motdepasse1! », que
 * tout le monde devine, alors que la longueur, elle, protège vraiment. C'est
 * aussi la recommandation de l'ANSSI depuis qu'elle a renoncé aux règles de
 * complexité.
 */
export function motDePasseFaible(mdp: string): string | null {
  if (mdp.length < 12) return "Choisissez au moins 12 caractères — une petite phrase fait très bien l'affaire.";
  if (/^(.)\1+$/.test(mdp)) return "Ce mot de passe est trop simple.";
  return null;
}

/* ---------- Jetons ---------- */

/** 32 octets de hasard : indevinable, et court à écrire dans une URL. */
export const nouveauJeton = () => randomBytes(32).toString("base64url");

/* ---------- Comptes et sessions ---------- */

export type CompteClient = {
  id: string;
  email: string;
  contact_id: string;
  secret: string | null;
  actif: boolean;
  cree_le: string;
  active_le: string | null;
  vu_le: string | null;
  connexions: number;
};

export const normaliseEmail = (v: string) => v.trim().toLowerCase();

export async function compteParEmail(email: string): Promise<CompteClient | null> {
  const propre = normaliseEmail(email);
  if (!propre.includes("@")) return null;
  const rows = await rest<CompteClient>(
    `fi_compte_client?email=eq.${encodeURIComponent(propre)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function compteDuContact(contactId: string): Promise<CompteClient | null> {
  const rows = await rest<CompteClient>(
    `fi_compte_client?contact_id=eq.${encodeURIComponent(contactId)}&select=*&order=cree_le.desc&limit=1`,
  );
  return rows[0] ?? null;
}

/** Durée d'une session. Un mois : assez pour ne pas ressaisir à chaque visite. */
const SESSION_JOURS = 30;

/** Ouvre une session et rend son jeton — à poser en cookie par l'appelant. */
export async function ouvrirSession(compteId: string): Promise<string> {
  const jeton = nouveauJeton();
  await ecrireRest("fi_session_client", "POST", [{
    jeton, compte_id: compteId,
    expire_le: new Date(Date.now() + SESSION_JOURS * 86400_000).toISOString(),
  }]);
  return jeton;
}

export async function fermerSession(jeton: string) {
  await ecrireRest(`fi_session_client?jeton=eq.${encodeURIComponent(jeton)}`, "DELETE")
    .catch(() => undefined);
}

/**
 * Le client connecté, ou rien.
 *
 * Relit la session ET le compte à chaque appel : un compte désactivé depuis le
 * BO doit perdre l'accès sans attendre l'expiration du cookie.
 */
export async function clientConnecte(): Promise<CompteClient | null> {
  const jeton = (await cookies()).get(COOKIE_SESSION)?.value;
  if (!jeton || !/^[A-Za-z0-9_-]{20,80}$/.test(jeton)) return null;
  const sessions = await rest<{ compte_id: string; expire_le: string }>(
    `fi_session_client?jeton=eq.${encodeURIComponent(jeton)}&select=compte_id,expire_le&limit=1`,
  );
  const s = sessions[0];
  if (!s || new Date(s.expire_le).getTime() < Date.now()) return null;
  const comptes = await rest<CompteClient>(
    `fi_compte_client?id=eq.${s.compte_id}&select=*&limit=1`,
  );
  const c = comptes[0];
  return c && c.actif ? c : null;
}

/* ---------- Jetons d'activation et de réinitialisation ---------- */

export type UsageJeton = "activation" | "reinitialisation";

/** Un jeton vaut 7 jours pour une activation, 2 heures pour un oubli. */
const HEURES: Record<UsageJeton, number> = { activation: 24 * 7, reinitialisation: 2 };

export async function poserJeton(compteId: string, usage: UsageJeton): Promise<string> {
  const jeton = nouveauJeton();
  await ecrireRest("fi_jeton_compte", "POST", [{
    jeton, compte_id: compteId, usage,
    expire_le: new Date(Date.now() + HEURES[usage] * 3600_000).toISOString(),
  }]);
  return jeton;
}

export type JetonLu = { compte_id: string; usage: UsageJeton };

/** Lit un jeton non expiré et jamais utilisé. */
export async function lireJeton(jeton: string): Promise<JetonLu | null> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(jeton)) return null;
  const rows = await rest<{ compte_id: string; usage: UsageJeton; expire_le: string; utilise_le: string | null }>(
    `fi_jeton_compte?jeton=eq.${encodeURIComponent(jeton)}&select=compte_id,usage,expire_le,utilise_le&limit=1`,
  );
  const j = rows[0];
  if (!j || j.utilise_le || new Date(j.expire_le).getTime() < Date.now()) return null;
  return { compte_id: j.compte_id, usage: j.usage };
}

/** Brûle le jeton. Un lien d'activation ne sert qu'une fois. */
export async function consommerJeton(jeton: string) {
  await ecrireRest(`fi_jeton_compte?jeton=eq.${encodeURIComponent(jeton)}`, "PATCH", {
    utilise_le: new Date().toISOString(),
  }).catch(() => undefined);
}
