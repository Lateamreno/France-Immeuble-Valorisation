import { createHash, timingSafeEqual } from "node:crypto";
import { LeadInvalide, LeadPasPret, recevoirLead } from "@/lib/bo/leads-site";

export const dynamic = "force-dynamic";
/* Une pièce de 25 Mo se rapatrie du site au coffre dans la même requête
   (lot 5) : on laisse une minute plutôt que les dix secondes par défaut. */
export const maxDuration = 60;

/**
 * L'adresse des formulaires du site France Immeuble (contrat §6, lot 3).
 *
 * Elle ne sait qu'enregistrer : aucune lecture du BO, aucun e-mail vers le
 * visiteur. Réponse 200 = enregistré (ou déjà enregistré : le site réessaie
 * tout ce qui n'a pas eu 200, et un réessai ne doit rien dupliquer). 422 =
 * formulaire illisible, inutile de le renvoyer tel quel. 503 = pas encore
 * rangeable (envoi que le BO ne sait pas lire, ou arrivé avant celui dont il
 * dépend) : le site le garde et réessaie (règle du 30/10).
 */

/* Débit limité (contrat §6, exigé par la spec du site) : trente envois par
   minute et par adresse, cent vingt en tout, trois mille par jour. Compté en
   base (`site_lead_debit`), pour que toutes les instances Vercel partagent le
   même compteur ; l'adresse n'y est qu'une empreinte, effacée sous 24 h. Si la
   base ne répond pas, on retombe sur le compteur de l'instance : un frein
   plutôt que rien, et le jeton reste la vraie porte. */
const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function debitDepasse(ip: string): Promise<boolean> {
  if (BO_KEY) {
    const empreinte = createHash("sha256").update(`fi-site:${ip}`).digest("hex").slice(0, 32);
    const r = await fetch(`${BO_URL}/rest/v1/rpc/site_lead_debit`, {
      method: "POST",
      headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_ip: empreinte }),
      cache: "no-store",
    }).catch(() => null);
    if (r?.ok) return (await r.json().catch(() => null)) !== null;
  }
  return tropDeDemandes(ip);
}

const fenetre = new Map<string, number[]>();
function tropDeDemandes(ip: string): boolean {
  const maintenant = Date.now();
  const recents = (fenetre.get(ip) ?? []).filter((t) => maintenant - t < 60_000);
  recents.push(maintenant);
  fenetre.set(ip, recents);
  if (fenetre.size > 5000) fenetre.clear();
  return recents.length > 30;
}

function jetonValide(entete: string | null): boolean {
  const attendu = process.env.BO_LEAD_TOKEN?.trim();
  const recu = entete?.replace(/^Bearer\s+/i, "").trim();
  if (!attendu || !recu) return false;
  const a = Buffer.from(attendu);
  const b = Buffer.from(recu);
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (status: number, corps: Record<string, unknown>) => Response.json(corps, { status });

export async function POST(req: Request) {
  if (!process.env.BO_LEAD_TOKEN) return json(503, { ok: false, message: "BO_LEAD_TOKEN n'est pas posé côté BO." });
  if (!jetonValide(req.headers.get("authorization"))) return json(401, { ok: false, message: "Jeton refusé." });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  if (await debitDepasse(ip)) return json(429, { ok: false, message: "Trop d'envois, réessayez dans une minute." });

  const brut = await req.text();
  if (brut.length > 64_000) return json(413, { ok: false, message: "Formulaire trop long." });
  let corps: unknown;
  try {
    corps = JSON.parse(brut);
  } catch {
    return json(422, { ok: false, message: "Corps illisible : JSON attendu." });
  }
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return json(422, { ok: false, message: "Objet JSON attendu." });

  try {
    const r = await recevoirLead(corps as Record<string, unknown>);
    // Jamais d'identifiant du BO dans la réponse : le site n'en a pas l'usage (contrat §7).
    return json(200, { ok: true, deja: r.deja });
  } catch (e) {
    if (e instanceof LeadInvalide) return json(422, { ok: false, message: e.message });
    /* Pas encore rangeable (règle du 30/10) : le site le garde et réessaie. */
    if (e instanceof LeadPasPret) return json(503, { ok: false, message: e.message });
    console.error("[site/lead]", e);
    // Toute autre erreur est passagère : le site gardera le formulaire en file.
    return json(500, { ok: false, message: "Enregistrement impossible pour l'instant." });
  }
}
