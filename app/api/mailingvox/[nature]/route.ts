// Ce que MailingVox nous pousse : réponses aux SMS, STOP, accusés de réception.
//
// MAV : « dans l'API MailingVox on peut récupérer les retours des gens quand
// ils répondent au SMS directement sur notre back-office ? » Oui, et c'est
// précisément ce que son choix d'expéditeur rend possible : un numéro court à
// cinq chiffres ACCEPTE les réponses, un nom alphanumérique non.
//
// Trois adresses à déclarer chez eux — `/reponses`, `/stops`, `/accuses` — que
// l'on pose soi-même par leur API (`/api/urls/edit`, voir `poserWebhooks`).
// Ils appellent en GET, avec les paramètres à plat. Le travail lui-même —
// retrouver la proposition, couper les relances — vit dans
// `lib/bo/sms-retours.ts`, partagé avec la relecture depuis les Réglages.
//
// PROTECTION. Ces adresses sont publiques et MailingVox ne signe pas ses
// appels. D'où un secret dans l'URL, comme la route de relève : sans lui, un
// tiers pourrait inventer des réponses de clients, et pire, inventer des STOP
// — c'est-à-dire faire taire notre communication vers quelqu'un qui n'a rien
// demandé.
import { NextRequest } from "next/server";
import { normaliserNumero, traiterAccuse, traiterReponse, traiterStop } from "@/lib/bo/sms-retours";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NATURES = { reponses: "reponse", stops: "stop", accuses: "accuse" } as const;
type Chemin = keyof typeof NATURES;

function autorise(req: NextRequest) {
  const attendu = process.env.MAILINGVOX_WEBHOOK_SECRET?.trim();
  /* Pas de secret posé : on n'ouvre pas la route pour autant. Une porte sans
     serrure vaut moins qu'une porte fermée. */
  if (!attendu) return false;
  const donne = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
    || req.nextUrl.searchParams.get("cle")?.trim()
    || "";
  return donne === attendu;
}

async function traiter(req: NextRequest, nature: Chemin) {
  const q = req.nextUrl.searchParams;
  const brut: Record<string, string> = {};
  q.forEach((v, k) => { if (k !== "cle") brut[k] = v; });

  const numero = normaliserNumero(q.get("numero"));
  /* Leur documentation : une réponse porte id, numero, date, message, source ;
     un STOP porte id, numero, email, date_envoi, source_id, nom ; un accusé
     porte id_accuse, id_message, numero, statut, nom. */
  const source = q.get("source_id") ?? q.get("source") ?? q.get("id_message") ?? null;
  const campagne = q.get("nom") || null;

  if (nature === "reponses") {
    await traiterReponse({
      evenementId: q.get("id"), numero, texte: q.get("message") ?? "", source, campagne, brut,
    });
  } else if (nature === "stops") {
    /* Un STOP n'est pas qu'une ligne de journal : il coupe les relances de ce
       contact. On le pose tout de suite — le laisser attendre une reprise
       manuelle, c'est continuer d'écrire à quelqu'un qui a dit non. */
    await traiterStop({ evenementId: q.get("id"), numero, email: q.get("email") || null, source, campagne, brut });
  } else {
    await traiterAccuse({
      evenementId: q.get("id_accuse"), numero, email: q.get("email") || null, statut: q.get("statut"), source, campagne, brut,
    });
  }

  /* MailingVox attend un 200. Tout autre code le fait réessayer, en boucle. */
  return Response.json({ ok: true });
}

async function point(req: NextRequest, params: Promise<{ nature: string }>) {
  const { nature } = await params;
  if (!(nature in NATURES)) {
    return Response.json({ erreur: "Nature inconnue." }, { status: 404 });
  }
  if (!autorise(req)) {
    return Response.json({ erreur: "Secret absent ou faux." }, { status: 401 });
  }
  try {
    return await traiter(req, nature as Chemin);
  } catch (e) {
    console.error("[mailingvox]", e);
    return Response.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ nature: string }> }) {
  return point(req, ctx.params);
}

/* Leur documentation annonce du GET, mais un webhook qui change de méthode en
   cours de route est un grand classique : on accepte les deux plutôt que de
   perdre des réponses le jour où ils changent d'avis. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ nature: string }> }) {
  return point(req, ctx.params);
}
