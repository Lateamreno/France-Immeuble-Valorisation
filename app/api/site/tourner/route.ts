// Le rendez-vous du site France Immeuble, appelé par le cron Vercel chaque heure.
//
// Il ne fait quelque chose qu'à trois heures de Paris (contrat §5 et §8) :
//   · 9 h et 19 h : le compteur off-market est redéposé sur le site ;
//   · 3 h : le rapprochement de nuit retire ce qui ne doit plus être en ligne.
// Le cron de Vercel tourne en UTC : l'heure de Paris se lit ici, ce qui règle
// le passage à l'heure d'hiver sans toucher à vercel.json.
//
// Protégé par le secret du cron, comme la relève des mails. `?faire=offmarket`
// ou `?faire=rapprochement` force un passage, toujours avec le secret.
import { NextRequest } from "next/server";
import { deposerOffmarket, rapprocherSite } from "@/lib/bo/site-fi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorise(req: NextRequest) {
  const entete = req.headers.get("authorization") ?? "";
  const donne = entete.replace(/^Bearer\s+/i, "").trim() || req.nextUrl.searchParams.get("cle")?.trim() || "";
  if (!donne) return false;
  const attendus = [process.env.CRON_SECRET, process.env.RELEVE_SECRET].map((s) => s?.trim()).filter((s): s is string => !!s);
  return attendus.includes(donne);
}

/** L'heure qu'il est à Paris, de 0 à 23. */
function heureParis(d = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(d),
    10,
  );
}

export async function GET(req: NextRequest) {
  if (!autorise(req)) return Response.json({ erreur: "Secret absent ou faux." }, { status: 401 });
  const force = req.nextUrl.searchParams.get("faire");
  const h = heureParis();
  const out: Record<string, unknown> = { heure: h };
  try {
    if (force === "offmarket" || (!force && (h === 9 || h === 19))) out.offmarket = await deposerOffmarket();
    if (force === "rapprochement" || (!force && h === 3)) out.rapprochement = await rapprocherSite();
    if (!out.offmarket && !out.rapprochement) out.rien = true;
    return Response.json(out);
  } catch (e) {
    return Response.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
