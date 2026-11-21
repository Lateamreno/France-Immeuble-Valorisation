// Le rappel du lundi : « il faut envoyer un rapport au propriétaire »
// (lib/bo/rapport-rappel-serveur.ts). Appelé par le cron Vercel toutes les dix
// minutes le lundi matin ; il ne fait quelque chose qu'entre 8 h et 9 h de
// Paris, et une seule fois par agent et par semaine. Le cron tourne en UTC :
// l'heure de Paris se lit dans le code, ce qui règle l'heure d'hiver sans
// toucher à vercel.json.
//
// Protégé par le secret du cron, comme la relève des mails. `?faire=1` force
// un passage de rattrapage hors du lundi 8 h, toujours avec le secret — un
// agent déjà servi cette semaine ne l'est pas une seconde fois.
import { NextRequest } from "next/server";
import { envoyerRappelsRapports } from "@/lib/bo/rapport-rappel-serveur";

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

export async function GET(req: NextRequest) {
  if (!autorise(req)) return Response.json({ erreur: "Secret absent ou faux." }, { status: 401 });
  try {
    const r = await envoyerRappelsRapports(req.nextUrl.searchParams.get("faire") === "1");
    return Response.json(r ?? { rien: true });
  } catch (e) {
    return Response.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
