// L'automate des salves de relances (lib/bo/relances-file.ts), appelé par le
// cron Vercel chaque minute. Si une salve est en cours et que la page qui l'a
// lancée est fermée ou suspendue, c'est lui qui la finit.
//
// Il vide aussi la file des campagnes du module Mailing (lib/bo/campagnes.ts),
// sur le temps que les relances lui laissent, et envoie les RCS programmés
// des commercialisations arrivés à leur heure (lib/bo/rcs-programmes.ts), et
// le récapitulatif des réponses d'acquéreurs à 8 h et 14 h (lib/bo/reponses.ts).
//
// Protégé par le secret du cron : sans lui, n'importe qui pourrait faire
// tourner l'automate en boucle. Même règle que la relève des mails.
import { NextRequest } from "next/server";
import { tournerLaFile } from "@/lib/bo/relances-file";
import { tournerCampagnes } from "@/lib/bo/campagnes";
import { tournerOrdreRecits } from "@/lib/bo/ordre-recits";
import { tournerRcsProgrammes } from "@/lib/bo/rcs-programmes";
import { envoyerRecapitulatifs } from "@/lib/bo/reponses";

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
    const debut = Date.now();
    // Les RCS programmés d'une commercialisation, arrivés à leur heure (MAV, 09/11) : d'abord, c'est l'heure dite qui compte.
    const rcs = await tournerRcsProgrammes().catch((e) => ({ erreur: String(e) }));
    const etat = await tournerLaFile(30_000);
    const campagne = await tournerCampagnes(50_000 - (Date.now() - debut)).catch((e) => ({ erreur: String(e) }));
    // Un ordre de publication des récits relus donné par MAV (lib/bo/ordre-recits.ts) : sinon rien.
    const recits = await tournerOrdreRecits().catch((e) => ({ erreur: String(e) }));
    // Le récapitulatif des réponses d'acquéreurs, à 8 h et 14 h (MAV, 12/11) : sinon rien.
    const reponses = await envoyerRecapitulatifs().catch((e) => ({ erreur: String(e) }));
    return Response.json({
      relances: etat ? { salve: etat.id, statut: etat.statut, mails: etat.mails, sms: etat.sms } : null,
      campagne,
      recits,
      rcs,
      reponses,
    });
  } catch (e) {
    return Response.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
