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
    const texte = q.get("message") ?? "";
    const evenementId = q.get("id");
    /* MAV (28/09) : « les retours SMS directement dans l'application, comme
       un retour qu'on noterait dans les propositions ». La réponse retrouve
       SA proposition — par le nom de campagne (qui porte la proposition ou la
       commercialisation), et par le numéro (qui porte le contact) — puis s'y
       inscrit. Un numéro inconnu reste dans le journal, sans deviner. */
    const cible = numero ? await propositionDe(numero, commun.campagne, texte) : null;
    await enregistrer({
      ...commun,
      evenement_id: evenementId,
      texte,
      contact_id: cible?.contactId ?? null,
      immeuble_id: cible?.immeubleId ?? null,
      commercialisation_id: cible?.commercialisationId ?? null,
      proposition_id: cible?.propositionId ?? null,
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
const H = () => ({ apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY!}` });

/** Les lignes d'une requête PostgREST sur le miroir, ou rien. */
async function lire<T>(chemin: string): Promise<T[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, { headers: H(), cache: "no-store" }).catch(() => null);
  if (!res?.ok) return [];
  return (await res.json()) as T[];
}

/** Un patch sur un document du miroir, par la même fonction que le BO. */
async function patcher(table: string, id: string, patch: Record<string, unknown>) {
  if (!SB_KEY) return;
  await fetch(`${SB_URL}/rest/v1/rpc/bo_patch_doc`, {
    method: "POST",
    headers: { ...H(), "Content-Type": "application/json" },
    body: JSON.stringify({ p_table: table, p_id: id, p_patch: patch }),
    cache: "no-store",
  }).catch(() => undefined);
}

/**
 * Le contact qui porte ce numéro — un seul, sinon rien.
 *
 * Le miroir stocke les numéros dans plusieurs formes. On compare sur les
 * neuf derniers chiffres, qui suffisent à identifier un mobile français.
 * Deviner un contact sur un numéro approchant serait pire que de ne rien
 * faire : deux résultats, c'est zéro résultat.
 */
async function contactDe(numero: string): Promise<string | null> {
  const fin = numero.replace(/\D/g, "").slice(-9);
  if (fin.length < 9) return null;
  const trouves = await lire<{ id?: string }>(`bo_contact?select=id:data->>_id&data->>portable=like.*${fin}`);
  return trouves.length === 1 && trouves[0].id ? trouves[0].id : null;
}

/**
 * La proposition à laquelle répond ce SMS, et où elle s'inscrit.
 *
 * Trois chemins, du plus sûr au moins sûr :
 *   • « Relance <proposition> » : le nom de campagne porte la proposition ;
 *   • « Commercialisation <id> » : la campagne donne l'immeuble, le numéro
 *     donne le contact, le couple donne la proposition ;
 *   • sinon, la dernière proposition « Envoyée » du contact.
 */
async function propositionDe(numero: string, campagne: string | null, texte: string): Promise<{
  contactId: string | null; immeubleId: string | null; commercialisationId: string | null; propositionId: string | null;
} | null> {
  if (!SB_KEY) return null;
  const contactId = await contactDe(numero);
  let propositionId: string | null = null;
  let immeubleId: string | null = null;
  let commercialisationId: string | null = null;

  const nom = (campagne ?? "").trim();
  const mRel = /^Relance\s+(\S+)$/.exec(nom);
  const mCom = /^Commercialisation\s+(\S+)$/.exec(nom);
  if (mRel) {
    const p = (await lire<{ data: Record<string, unknown> }>(`bo_proposition?select=data&id=eq.${encodeURIComponent(mRel[1])}&limit=1`))[0]?.data;
    if (p) { propositionId = String(p._id ?? mRel[1]); immeubleId = typeof p.IMMEUBLE === "string" ? p.IMMEUBLE : null; commercialisationId = typeof p.COMMERCIALISATION === "string" ? p.COMMERCIALISATION : null; }
  } else if (mCom) {
    commercialisationId = mCom[1];
    const c = (await lire<{ data: Record<string, unknown> }>(`bo_commercialisation?select=data&id=eq.${encodeURIComponent(mCom[1])}&limit=1`))[0]?.data;
    immeubleId = typeof c?.IMMEUBLE === "string" ? (c.IMMEUBLE as string) : null;
    if (immeubleId && contactId) {
      const p = (await lire<{ data: Record<string, unknown> }>(
        `bo_proposition?select=data&data->>IMMEUBLE=eq.${encodeURIComponent(immeubleId)}&data->>ACHETEUR=eq.${encodeURIComponent(contactId)}&order=bubble_created.desc.nullslast&limit=1`,
      ))[0]?.data;
      if (p) propositionId = String(p._id ?? "") || null;
    }
  }
  if (!propositionId && contactId) {
    const p = (await lire<{ data: Record<string, unknown> }>(
      `bo_proposition?select=data&data->>ACHETEUR=eq.${encodeURIComponent(contactId)}&data->>Statut=eq.${encodeURIComponent("Envoyée")}&order=bubble_created.desc.nullslast&limit=1`,
    ))[0]?.data;
    if (p) { propositionId = String(p._id ?? "") || null; immeubleId = immeubleId ?? (typeof p.IMMEUBLE === "string" ? p.IMMEUBLE : null); }
  }

  if (propositionId) {
    const now = new Date().toISOString();
    await patcher("bo_proposition", propositionId, {
      retour_sms: texte.slice(0, 1000),
      retour_sms_le: now,
      retour_sms_lu: false,
      date_modif: now,
      "Modified Date": now,
    });
  }
  return { contactId, immeubleId, commercialisationId, propositionId };
}

/**
 * Coupe les relances du contact qui vient de dire STOP : toutes ses
 * propositions ouvertes passent « relances coupées », et le journal garde
 * son contact. Sans contact certain, la ligne reste visible et quelqu'un
 * tranchera.
 */
async function couperRelances(numero: string) {
  if (!SB_KEY) return;
  const contactId = await contactDe(numero);
  if (!contactId) return;

  await fetch(`${SB_URL}/rest/v1/fi_sms_entrant?numero=eq.${encodeURIComponent(numero)}&contact_id=is.null`, {
    method: "PATCH",
    headers: { ...H(), "Content-Type": "application/json" },
    body: JSON.stringify({ contact_id: contactId }),
    cache: "no-store",
  }).catch(() => undefined);

  const props = await lire<{ id: string }>(
    `bo_proposition?select=id&data->>ACHETEUR=eq.${encodeURIComponent(contactId)}&data->>Statut=eq.${encodeURIComponent("Envoyée")}&data->>stop_relances_yn=not.eq.true&limit=500`,
  );
  const now = new Date().toISOString();
  for (const p of props) {
    await patcher("bo_proposition", p.id, { stop_relances_yn: true, stop_relances_le: now, stop_relances_motif: "STOP par SMS", date_modif: now, "Modified Date": now });
  }
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
