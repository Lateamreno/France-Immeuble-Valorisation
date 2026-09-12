// Ce que MailingVox nous pousse : réponses aux SMS, STOP, accusés de réception.
//
// MAV : « dans l'API MailingVox on peut récupérer les retours des gens quand
// ils répondent au SMS directement sur notre back-office ? » Oui, et c'est
// précisément ce que son choix d'expéditeur rend possible : un numéro court à
// cinq chiffres ACCEPTE les réponses, un nom alphanumérique non.
//
// Trois adresses à déclarer chez eux — `/reponses`, `/stops`, `/accuses` — que
// l'on pose soi-même par leur API (`/api/urls/edit`, voir `poserWebhooks`).
// Ils appellent en GET, avec les paramètres à plat.
//
// PROTECTION. Ces adresses sont publiques et MailingVox ne signe pas ses
// appels. D'où un secret dans l'URL, comme la route de relève : sans lui, un
// tiers pourrait inventer des réponses de clients, et pire, inventer des STOP
// — c'est-à-dire faire taire notre communication vers quelqu'un qui n'a rien
// demandé.
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

/** Le numéro tel qu'on le range partout ailleurs : E.164, sans espaces. */
function normaliser(v: string | null): string | undefined {
  const s = (v ?? "").replace(/[^\d+]/g, "");
  if (!s) return undefined;
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return `+${s.slice(2)}`;
  if (s.startsWith("0") && s.length === 10) return `+33${s.slice(1)}`;
  return `+${s}`;
}

async function enregistrer(ligne: Record<string, unknown>) {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  /* `merge-duplicates` sur la contrainte (nature, evenement_id) : MailingVox
     rejoue un webhook qui n'a pas répondu assez vite, et un « STOP » compté
     deux fois fausserait les compteurs sans rien changer d'utile. */
  const res = await fetch(
    `${SB_URL}/rest/v1/fi_sms_entrant?on_conflict=nature,evenement_id`,
    {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(ligne),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${(await res.text()).slice(0, 200)}`);
}

async function traiter(req: NextRequest, nature: Chemin) {
  const q = req.nextUrl.searchParams;
  const brut: Record<string, string> = {};
  q.forEach((v, k) => { if (k !== "cle") brut[k] = v; });

  const numero = normaliser(q.get("numero"));
  const commun = {
    nature: NATURES[nature],
    numero,
    email: q.get("email") || null,
    source_id: q.get("source_id") ?? q.get("source") ?? q.get("id_message") ?? null,
    campagne: q.get("nom") || null,
    brut,
  };

  if (nature === "reponses") {
    await enregistrer({
      ...commun,
      evenement_id: q.get("id"),
      texte: q.get("message") ?? "",
    });
  } else if (nature === "stops") {
    await enregistrer({ ...commun, evenement_id: q.get("id") });
    /* Un STOP n'est pas qu'une ligne de journal : il coupe les relances de ce
       contact. On le pose tout de suite — le laisser attendre une reprise
       manuelle, c'est continuer d'écrire à quelqu'un qui a dit non. */
    if (numero) await couperRelances(numero);
  } else {
    await enregistrer({
      ...commun,
      evenement_id: q.get("id_accuse"),
      statut: q.get("statut"),
    });
  }

  /* MailingVox attend un 200. Tout autre code le fait réessayer, en boucle. */
  return Response.json({ ok: true });
}

/**
 * Coupe les relances du contact qui vient de dire STOP.
 *
 * On cherche par téléphone dans le miroir des contacts. Si on ne trouve pas,
 * on ne fait rien de plus : la ligne reste dans `fi_sms_entrant`, visible, et
 * quelqu'un tranchera. Deviner un contact sur un numéro approchant serait pire
 * que de ne rien faire.
 */
async function couperRelances(numero: string) {
  if (!SB_KEY) return;
  const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
  /* Le miroir stocke les numéros dans plusieurs formes. On compare sur les
     neuf derniers chiffres, qui suffisent à identifier un mobile français. */
  const fin = numero.replace(/\D/g, "").slice(-9);
  if (fin.length < 9) return;
  const res = await fetch(
    `${SB_URL}/rest/v1/bo_contact?select=id:data->>_id,tel:data->>portable&data->>portable=like.*${fin}`,
    { headers: h, cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return;
  const trouves = (await res.json()) as { id?: string }[];
  if (trouves.length !== 1 || !trouves[0].id) return;

  await fetch(`${SB_URL}/rest/v1/fi_sms_entrant?numero=eq.${encodeURIComponent(numero)}&contact_id=is.null`, {
    method: "PATCH",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ contact_id: trouves[0].id }),
    cache: "no-store",
  }).catch(() => undefined);
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
