// Déclenchement de la relève IMAP (tâche #57).
//
// Appelée par un cron (Vercel Cron, ou n'importe quel appel planifié) et par
// le bouton « Relever maintenant » de l'écran Mails.
//
// Protégée par un secret : sans lui, n'importe qui pourrait faire tourner la
// relève en boucle et faire bloquer notre IP par le serveur de messagerie.
import { NextRequest } from "next/server";
import { relever, releveConfiguree } from "@/lib/mails/releve";

// ImapFlow et mailparser sont des bibliothèques Node : pas d'edge ici.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorise(req: NextRequest) {
  const attendu = process.env.RELEVE_SECRET?.trim();
  // Pas de secret posé : on n'ouvre pas la route pour autant.
  if (!attendu) return false;
  const entete = req.headers.get("authorization") ?? "";
  const donne = entete.replace(/^Bearer\s+/i, "").trim()
    || req.nextUrl.searchParams.get("cle")?.trim()
    || "";
  return donne === attendu;
}

export async function GET(req: NextRequest) {
  if (!autorise(req)) {
    return Response.json({ erreur: "Secret de relève absent ou faux." }, { status: 401 });
  }
  if (!releveConfiguree()) {
    return Response.json(
      { configuree: false, erreur: "IMAP non configuré : IMAP_HOST / IMAP_USER / IMAP_PASS manquent." },
      { status: 503 },
    );
  }
  try {
    return Response.json(await relever());
  } catch (e) {
    return Response.json(
      { erreur: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
