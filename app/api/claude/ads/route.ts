import type { NextRequest } from "next/server";
import { jetonClaudeValide } from "@/lib/bo/claude-demandes";
import { chercherZonesGoogle, etatAds, gaql, lireAds } from "@/lib/bo/google-ads";
import { annuler, appliquer, lireJournal, lirePlafond } from "@/lib/bo/google-ads-ecriture";
import { periodeDe } from "@/lib/bo/acquisition";
import type { Changement } from "@/lib/bo/google-ads-changements";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Google Ads pour Claude (MAV, 10/11 : « depuis Claude qui a accès au BO, tu
 * pourras lire et modifier au besoin les annonces »). Même porte que le BO :
 * les garde-fous et le journal de lib/bo/google-ads-ecriture.ts, la source
 * « claude » en plus. Clé : BO_CLAUDE_TOKEN (jamais vue par Claude, injectée
 * par l'environnement). Claude ne modifie que sur demande de MAV dans la
 * conversation, et ne touche jamais au plafond, posé dans le BO seul.
 *
 *   GET  ?jours=7|30|90          l'état, le plafond, la lecture et le journal
 *   GET  ?zone=Paris             chercher une zone Google à cibler
 *   GET  ?gaql=SELECT…           une lecture libre (searchStream : lecture seule par nature)
 *   POST { changements, motif, essai? }   appliquer (essai = vérifier sans changer)
 *   POST { annuler: <id du journal> }
 */
const json = (status: number, corps: Record<string, unknown>) => Response.json(corps, { status });

function garde(req: NextRequest): Response | null {
  if (!process.env.BO_CLAUDE_TOKEN) return json(503, { ok: false, message: "BO_CLAUDE_TOKEN n'est pas posé côté BO." });
  if (!jetonClaudeValide(req.headers.get("authorization"))) return json(401, { ok: false, message: "Jeton refusé." });
  return null;
}

export async function GET(req: NextRequest) {
  const refus = garde(req);
  if (refus) return refus;
  const u = req.nextUrl;
  const etat = await etatAds();
  if (!etat.pret) return json(409, { ok: false, message: "Google Ads n'est pas connecté (page Acquisition du BO).", etat });
  try {
    const requete = u.searchParams.get("gaql");
    if (requete) {
      if (!/^\s*select\s/i.test(requete)) return json(422, { ok: false, message: "Une requête GAQL commence par SELECT." });
      return json(200, { ok: true, lignes: await gaql(requete) });
    }
    const zone = u.searchParams.get("zone");
    if (zone) return json(200, { ok: true, zones: await chercherZonesGoogle(zone) });
    const [lecture, plafond, journal] = await Promise.all([
      lireAds(periodeDe(Number(u.searchParams.get("jours")) || 30), u.searchParams.get("frais") === "1"),
      lirePlafond(),
      lireJournal(30),
    ]);
    return json(200, { ok: true, compte: etat.compte, plafond_jour: plafond, lecture, journal });
  } catch (e) {
    return json(502, { ok: false, message: e instanceof Error ? e.message : String(e) });
  }
}

export async function POST(req: NextRequest) {
  const refus = garde(req);
  if (refus) return refus;
  const corps = (await req.json().catch(() => null)) as { changements?: Changement[]; motif?: string; essai?: boolean; annuler?: number } | null;
  if (!corps) return json(422, { ok: false, message: "Corps JSON attendu." });
  try {
    if (typeof corps.annuler === "number") {
      const r = await annuler(corps.annuler, { source: "claude", par: "Claude (conversation)" });
      return json(200, { ok: r.ok, resultat: r });
    }
    if (!Array.isArray(corps.changements)) return json(422, { ok: false, message: "`changements` (tableau) attendu." });
    if (!corps.essai && !(typeof corps.motif === "string" && corps.motif.trim().length >= 5)) {
      return json(422, { ok: false, message: "`motif` obligatoire : la demande de MAV qui justifie le changement." });
    }
    const resultats = await appliquer(corps.changements, { source: "claude", par: "Claude (conversation)", motif: corps.motif?.trim().slice(0, 500) ?? null, essai: !!corps.essai });
    return json(200, { ok: resultats.every((r) => r.ok), resultats });
  } catch (e) {
    return json(502, { ok: false, message: e instanceof Error ? e.message : String(e) });
  }
}
