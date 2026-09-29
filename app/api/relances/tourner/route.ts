// L'automate des salves de relances (lib/bo/relances-file.ts), appelé par le
// cron Vercel chaque minute. Si une salve est en cours et que la page qui l'a
// lancée est fermée ou suspendue, c'est lui qui la finit.
//
// Protégé par le secret du cron : sans lui, n'importe qui pourrait faire
// tourner l'automate en boucle. Même règle que la relève des mails.
import { NextRequest } from "next/server";
import { tournerLaFile } from "@/lib/bo/relances-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const etat = await tournerLaFile(40_000);
    return Response.json(etat ? { salve: etat.id, statut: etat.statut, mails: etat.mails, sms: etat.sms } : { rien: true });
  } catch (e) {
    return Response.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
