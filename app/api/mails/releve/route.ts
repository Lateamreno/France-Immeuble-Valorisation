// Déclenchement de la relève IMAP (tâche #57).
//
// Appelée par un cron (Vercel Cron, ou n'importe quel appel planifié) et par
// le bouton « Relever maintenant » de l'écran Mails.
//
// Protégée par un secret : sans lui, n'importe qui pourrait faire tourner la
// relève en boucle et faire bloquer notre IP par le serveur de messagerie.
import { NextRequest } from "next/server";
import { relever } from "@/lib/mails/releve";

// ImapFlow et mailparser sont des bibliothèques Node : pas d'edge ici.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorise(req: NextRequest) {
  /* Le cron Vercel s'annonce avec CRON_SECRET, posé par la plateforme — c'est
     sa seule façon de prouver que l'appel vient bien d'elle. Le bouton
     « Relever maintenant », lui, passe par RELEVE_SECRET. On accepte les deux
     plutôt que d'obliger MAV à poser deux fois la même valeur. */
  const entete = req.headers.get("authorization") ?? "";
  const donne = entete.replace(/^Bearer\s+/i, "").trim()
    || req.nextUrl.searchParams.get("cle")?.trim()
    || "";
  if (!donne) return false;
  const attendus = [process.env.RELEVE_SECRET, process.env.CRON_SECRET]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s);
  // Pas de secret posé : on n'ouvre pas la route pour autant.
  return attendus.includes(donne);
}

export async function GET(req: NextRequest) {
  if (!autorise(req)) {
    return Response.json({ erreur: "Secret de relève absent ou faux." }, { status: 401 });
  }
  try {
    const bilan = await relever();
    if (!bilan.configuree) {
      return Response.json(
        {
          ...bilan,
          erreur: "Aucune boîte à relever : ni boîte d'agent connectée, ni variables IMAP_* / MAIL_n_*.",
        },
        { status: 503 },
      );
    }
    return Response.json(bilan);
  } catch (e) {
    return Response.json(
      { erreur: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
