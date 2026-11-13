import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Les actions que le BO confie à Claude (MAV, 27/10).
 *
 * Un bouton du BO crée une DEMANDE, puis déclenche la tâche Claude (routine)
 * qui lui correspond, par son adresse `/fire`. La tâche lit la demande auprès
 * du BO, fait son travail avec ses connecteurs (Drive, Meta…) et rend une
 * PROPOSITION, rangée dans la demande. Claude n'écrit jamais dans une fiche :
 * l'agent charge la proposition, la relit, et l'enregistre lui-même — la
 * doctrine « l'app prépare, MAV envoie » (CLAUDE.md §7.1) vaut ici aussi.
 *
 * Trois secrets, posés par MAV, jamais vus par Claude :
 *  · CLAUDE_ROUTINE_<ACTION>_URL / _TOKEN (Vercel) : l'adresse `/fire` de la
 *    tâche et son jeton, donnés par claude.ai au moment d'ajouter le
 *    déclencheur API ;
 *  · BO_CLAUDE_TOKEN (Vercel ET secret réseau de l'environnement de la tâche) :
 *    la clé qui ouvre au seul Claude les deux adresses /api/claude/… du BO.
 */

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type ActionClaude = "drive_bo" | "facebook_annonce" | "facebook_recherche" | "video_bien";
export type StatutDemande = "envoyee" | "en_cours" | "prete" | "chargee" | "refusee" | "erreur";

/** Le préfixe des variables d'environnement de chaque action. */
export const ROUTINE_DE: Record<ActionClaude, string> = {
  drive_bo: "DRIVE",
  facebook_annonce: "FACEBOOK",
  facebook_recherche: "FACEBOOK",
  video_bien: "VIDEO",
};

export type Demande = {
  id: string;
  cree_le: string;
  maj_le: string;
  action: ActionClaude;
  immeuble_id: string | null;
  objet_id: string | null;
  agent: string | null;
  statut: StatutDemande;
  parametres: Record<string, unknown>;
  session_url: string | null;
  resultat: Record<string, unknown> | null;
  message: string | null;
};

async function sb(path: string, init?: RequestInit) {
  if (!SB_KEY) throw new Error("Base du BO indisponible (clé Supabase absente).");
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function lireDemande(id: string): Promise<Demande | null> {
  if (!UUID.test(id)) return null;
  const r = await sb(`bo_claude_demande?id=eq.${id}&select=*`);
  return ((await r.json()) as Demande[])[0] ?? null;
}

/** La dernière demande d'une action sur un immeuble, quelle qu'en soit l'issue. */
export async function derniereDemande(immeubleId: string, action: ActionClaude): Promise<Demande | null> {
  const r = await sb(
    `bo_claude_demande?immeuble_id=eq.${encodeURIComponent(immeubleId)}&action=eq.${action}`
      + `&select=*&order=cree_le.desc&limit=1`,
  );
  return ((await r.json()) as Demande[])[0] ?? null;
}

export async function majDemande(id: string, patch: Partial<Omit<Demande, "id" | "cree_le">>) {
  await sb(`bo_claude_demande?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, maj_le: new Date().toISOString() }),
  });
}

/**
 * Le plafond : le BO n'a pas encore d'authentification (CLAUDE.md §10 bis), et
 * chaque passage d'une tâche se paie sur l'abonnement de MAV. Dix demandes par
 * heure et quarante par jour, toutes actions confondues, suffisent largement à
 * deux agents et coupent court à un bouton martelé.
 */
async function plafondAtteint(): Promise<string | null> {
  const compte = async (depuis: Date) => {
    const r = await sb(`bo_claude_demande?cree_le=gte.${depuis.toISOString()}&select=id`, {
      method: "HEAD", headers: { Prefer: "count=exact" },
    });
    return Number(r.headers.get("content-range")?.split("/")[1] ?? 0);
  };
  const maintenant = Date.now();
  if (await compte(new Date(maintenant - 3_600_000)) >= 10) return "Dix demandes à Claude dans l'heure : réessayez un peu plus tard.";
  if (await compte(new Date(maintenant - 86_400_000)) >= 40) return "Quarante demandes à Claude aujourd'hui : c'est le plafond du jour.";
  return null;
}

/**
 * Crée la demande et déclenche la tâche. La tâche ne reçoit que l'identifiant
 * de la demande : tout le reste, elle le relit auprès du BO. Un jeton de
 * déclenchement qui fuirait ne permettrait donc que de lancer une tâche sur
 * une demande inexistante — elle s'arrêterait aussitôt.
 */
export async function creerEtLancer(d: {
  action: ActionClaude; immeubleId?: string; objetId?: string; agent?: string; parametres?: Record<string, unknown>;
}): Promise<Demande> {
  const cle = ROUTINE_DE[d.action];
  const url = process.env[`CLAUDE_ROUTINE_${cle}_URL`]?.trim();
  const jeton = process.env[`CLAUDE_ROUTINE_${cle}_TOKEN`]?.trim();
  if (!url || !jeton) {
    throw new Error(`La tâche Claude « ${cle.toLowerCase()} » n'est pas encore branchée : CLAUDE_ROUTINE_${cle}_URL et _TOKEN manquent dans Vercel.`);
  }
  /* Le jeton ne part que vers l'adresse officielle : une variable mal collée
     ne doit pas l'envoyer ailleurs. */
  if (!/^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/.test(url)) {
    throw new Error(`CLAUDE_ROUTINE_${cle}_URL n'a pas la forme attendue (https://api.anthropic.com/v1/claude_code/routines/trig_…/fire).`);
  }
  const trop = await plafondAtteint();
  if (trop) throw new Error(trop);

  const r = await sb("bo_claude_demande", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      action: d.action,
      immeuble_id: d.immeubleId ?? null,
      objet_id: d.objetId ?? null,
      agent: d.agent ?? null,
      parametres: d.parametres ?? {},
    }),
  });
  const demande = ((await r.json()) as Demande[])[0];

  try {
    const feu = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jeton}`,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: `Demande du BO : ${demande.id}` }),
      cache: "no-store",
    });
    const corps = (await feu.json().catch(() => ({}))) as {
      claude_code_session_url?: string; error?: { message?: string };
    };
    if (!feu.ok) {
      const pourquoi = feu.status === 429 ? "trop de lancements dans l'heure"
        : feu.status === 401 ? "jeton refusé (régénéré sur claude.ai ?)"
        : feu.status === 400 ? "tâche en pause ou requête refusée"
        : `erreur ${feu.status}`;
      await majDemande(demande.id, { statut: "erreur", message: `Claude n'a pas pu être lancé : ${pourquoi}.` });
      return { ...demande, statut: "erreur", message: `Claude n'a pas pu être lancé : ${pourquoi}.` };
    }
    await majDemande(demande.id, { session_url: corps.claude_code_session_url ?? null });
    return { ...demande, session_url: corps.claude_code_session_url ?? null };
  } catch {
    await majDemande(demande.id, { statut: "erreur", message: "Claude n'a pas pu être joint." });
    return { ...demande, statut: "erreur", message: "Claude n'a pas pu être joint." };
  }
}

/**
 * Retient le dossier Drive du bien, pour que la demande suivante n'ait plus à
 * le chercher. Écrit sans rafraîchir l'écran : un rafraîchissement remettrait
 * le tableau à l'état enregistré et effacerait la proposition qu'on vient de
 * charger.
 */
export async function retenirDossierDrive(immeubleId: string, url: string) {
  if (!/^https:\/\/drive\.google\.com\//.test(url)) return;
  await sb("rpc/bo_patch_doc", {
    method: "POST",
    body: JSON.stringify({ p_table: "bo_immeuble", p_id: immeubleId, p_patch: { drive_dossier: url } }),
  });
}

/** La clé des adresses /api/claude/… : comparée en temps constant. */
export function jetonClaudeValide(entete: string | null): boolean {
  const attendu = process.env.BO_CLAUDE_TOKEN?.trim();
  const recu = entete?.replace(/^Bearer\s+/i, "").trim();
  if (!attendu || !recu) return false;
  const a = Buffer.from(attendu);
  const b = Buffer.from(recu);
  return a.length === b.length && timingSafeEqual(a, b);
}
