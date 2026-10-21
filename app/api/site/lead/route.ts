import { timingSafeEqual } from "node:crypto";
import { LeadInvalide, recevoirLead } from "@/lib/bo/leads-site";

export const dynamic = "force-dynamic";

/**
 * L'adresse des formulaires du site France Immeuble (contrat §6, lot 3).
 *
 * Elle ne sait qu'enregistrer : aucune lecture du BO, aucun e-mail vers le
 * visiteur. Réponse 200 = enregistré (ou déjà enregistré : le site réessaie
 * tout ce qui n'a pas eu 200, et un réessai ne doit rien dupliquer). 422 =
 * formulaire illisible, inutile de le renvoyer tel quel.
 */

/* Débit limité, par adresse IP : trente envois par minute. Tenu en mémoire de
   l'instance, ce n'est qu'un frein ; le jeton reste la vraie porte. */
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
  if (tropDeDemandes(ip)) return json(429, { ok: false, message: "Trop d'envois, réessayez dans une minute." });

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
    return json(200, { ok: true, deja: r.deja, id: r.id });
  } catch (e) {
    if (e instanceof LeadInvalide) return json(422, { ok: false, message: e.message });
    console.error("[site/lead]", e);
    // Toute autre erreur est passagère : le site gardera le formulaire en file.
    return json(500, { ok: false, message: "Enregistrement impossible pour l'instant." });
  }
}
