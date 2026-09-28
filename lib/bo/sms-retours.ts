// Les retours SMS de MailingVox — réponses, STOP, accusés — et où ils
// s'inscrivent. Deux entrées : le webhook (`app/api/mailingvox/[nature]`), qui
// reçoit ce que MailingVox pousse, et « Relire les réponses » (Réglages ›
// Envois), qui va chercher par leur API ce qui aurait été poussé dans le vide
// — une adresse déclarée après coup, une serrure posée après coup. Les deux
// passent ici, et une réponse déjà vue ne l'est pas deux fois.
//
// Code serveur (clé de service, clé MailingVox) : jamais importé par un
// composant client.

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY!}` });

/** Le numéro tel qu'on le range partout ailleurs : E.164, sans espaces. */
export function normaliserNumero(v: string | null | undefined): string | undefined {
  const s = (v ?? "").replace(/[^\d+]/g, "");
  if (!s) return undefined;
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return `+${s.slice(2)}`;
  if (s.startsWith("0") && s.length === 10) return `+33${s.slice(1)}`;
  return `+${s}`;
}

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
 * Une ligne du journal. `merge-duplicates` sur (nature, evenement_id) :
 * MailingVox rejoue un webhook qui n'a pas répondu assez vite, et la relecture
 * repasse sur ce qui a déjà été poussé. Rend vrai si la ligne est NOUVELLE.
 */
async function enregistrer(ligne: Record<string, unknown>): Promise<boolean> {
  if (!SB_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  const deja = ligne.evenement_id
    ? await lire<{ id: string }>(`fi_sms_entrant?select=id&nature=eq.${encodeURIComponent(String(ligne.nature))}&evenement_id=eq.${encodeURIComponent(String(ligne.evenement_id))}&limit=1`)
    : [];
  const res = await fetch(`${SB_URL}/rest/v1/fi_sms_entrant?on_conflict=nature,evenement_id`, {
    method: "POST",
    headers: { ...H(), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(ligne),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${(await res.text()).slice(0, 200)}`);
  return deja.length === 0;
}

/**
 * Les contacts qui portent ce numéro. Le miroir stocke les numéros dans
 * plusieurs formes : on compare sur les neuf derniers chiffres, qui suffisent
 * à identifier un mobile français. Plusieurs fiches peuvent partager un
 * numéro (des doublons, des fiches d'essai) : on rend tout, et c'est la
 * proposition qui départage.
 */
async function contactsDe(numero: string): Promise<string[]> {
  const fin = numero.replace(/\D/g, "").slice(-9);
  if (fin.length < 9) return [];
  const trouves = await lire<{ id?: string }>(`bo_contact?select=id:data->>_id&data->>portable=like.*${fin}&limit=20`);
  return trouves.map((t) => t.id).filter((x): x is string => !!x);
}

type Doc = Record<string, unknown>;
const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** La dernière proposition « Envoyée » d'un de ces contacts, sur cet immeuble s'il est connu. */
async function derniereProposition(contactIds: string[], immeubleId: string | null): Promise<Doc | null> {
  if (contactIds.length === 0) return null;
  const inList = contactIds.map((c) => `"${c}"`).join(",");
  const filtreIm = immeubleId ? `&data->>IMMEUBLE=eq.${encodeURIComponent(immeubleId)}` : `&data->>Statut=eq.${encodeURIComponent("Envoyée")}`;
  const rows = await lire<{ data: Doc }>(
    `bo_proposition?select=data&data->>ACHETEUR=in.(${inList})${filtreIm}&order=bubble_created.desc.nullslast&limit=1`,
  );
  return rows[0]?.data ?? null;
}

export type Cible = { contactId: string | null; immeubleId: string | null; commercialisationId: string | null; propositionId: string | null };

/**
 * La proposition à laquelle répond ce SMS, et où elle s'inscrit.
 *
 * Du plus sûr au moins sûr :
 *   • `source`, l'identifiant de campagne que MailingVox rend à l'envoi et
 *     renvoie avec la réponse ; le BO le garde sur la proposition relancée et
 *     sur la commercialisation ;
 *   • le nom de campagne, quand il est fourni (STOP, accusés) ;
 *   • sinon, la dernière proposition « Envoyée » d'un contact qui porte ce
 *     numéro.
 * Un numéro inconnu reste dans le journal, sans deviner.
 */
export async function propositionDe(numero: string, campagne: string | null, source: string | null, texte: string): Promise<Cible | null> {
  if (!SB_KEY) return null;
  const contacts = await contactsDe(numero);
  let contactId: string | null = null;
  let propositionId: string | null = null;
  let immeubleId: string | null = null;
  let commercialisationId: string | null = null;

  const retenir = (p: Doc | null) => {
    if (!p) return;
    propositionId = S(p._id);
    contactId = contactId ?? S(p.ACHETEUR);
    immeubleId = immeubleId ?? S(p.IMMEUBLE);
    commercialisationId = commercialisationId ?? S(p.COMMERCIALISATION);
  };

  const src = (source ?? "").trim();
  if (src) {
    const props = (await lire<{ data: Doc }>(`bo_proposition?select=data&data->>sms_campagne=eq.${encodeURIComponent(src)}&limit=20`)).map((r) => r.data);
    retenir(props.find((d) => contacts.length === 0 || contacts.includes(String(d.ACHETEUR ?? ""))) ?? null);
    if (!propositionId) {
      const c = (await lire<{ id: string; data: Doc }>(`bo_commercialisation?select=id,data&data->>sms_campagne=eq.${encodeURIComponent(src)}&limit=1`))[0];
      if (c) {
        commercialisationId = c.id;
        immeubleId = S(c.data.IMMEUBLE);
        retenir(await derniereProposition(contacts, immeubleId));
      }
    }
  }
  const nom = (campagne ?? "").trim();
  const mRel = /^Relance\s+(\S+)$/.exec(nom);
  const mCom = /^Commercialisation\s+(\S+)$/.exec(nom);
  if (!propositionId && mRel) {
    retenir((await lire<{ data: Doc }>(`bo_proposition?select=data&id=eq.${encodeURIComponent(mRel[1])}&limit=1`))[0]?.data ?? null);
  } else if (!propositionId && mCom) {
    commercialisationId = mCom[1];
    const c = (await lire<{ data: Doc }>(`bo_commercialisation?select=data&id=eq.${encodeURIComponent(mCom[1])}&limit=1`))[0]?.data;
    immeubleId = S(c?.IMMEUBLE);
    retenir(await derniereProposition(contacts, immeubleId));
  }
  if (!propositionId) retenir(await derniereProposition(contacts, null));
  if (!contactId && contacts.length === 1) contactId = contacts[0];

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
 * Coupe les relances de qui vient de dire STOP : toutes les propositions
 * ouvertes de chaque fiche qui porte ce numéro passent « relances coupées ».
 * Sans fiche, la ligne reste au journal et quelqu'un tranchera.
 */
export async function couperRelances(numero: string): Promise<string | null> {
  if (!SB_KEY) return null;
  const contacts = await contactsDe(numero);
  if (contacts.length === 0) return null;
  const inList = contacts.map((c) => `"${c}"`).join(",");
  const props = await lire<{ id: string }>(
    `bo_proposition?select=id&data->>ACHETEUR=in.(${inList})&data->>Statut=eq.${encodeURIComponent("Envoyée")}&data->>stop_relances_yn=not.eq.true&limit=500`,
  );
  const now = new Date().toISOString();
  for (const p of props) {
    await patcher("bo_proposition", p.id, { stop_relances_yn: true, stop_relances_le: now, stop_relances_motif: "STOP par SMS", date_modif: now, "Modified Date": now });
  }
  return contacts.length === 1 ? contacts[0] : null;
}

/** Une réponse reçue (webhook ou relecture). Rend vrai si elle est nouvelle. */
export async function traiterReponse(r: {
  evenementId: string | null; numero: string | undefined; texte: string; source: string | null; campagne: string | null;
  recuLe?: string; brut?: Record<string, unknown>;
}): Promise<{ nouvelle: boolean; cible: Cible | null }> {
  const cible = r.numero ? await propositionDe(r.numero, r.campagne, r.source, r.texte) : null;
  const nouvelle = await enregistrer({
    nature: "reponse",
    evenement_id: r.evenementId,
    numero: r.numero,
    texte: r.texte,
    source_id: r.source,
    campagne: r.campagne,
    contact_id: cible?.contactId ?? null,
    immeuble_id: cible?.immeubleId ?? null,
    commercialisation_id: cible?.commercialisationId ?? null,
    proposition_id: cible?.propositionId ?? null,
    ...(r.recuLe ? { recu_le: r.recuLe } : {}),
    brut: r.brut ?? {},
  });
  return { nouvelle, cible };
}

/** Un STOP reçu (webhook ou relecture). */
export async function traiterStop(r: {
  evenementId: string | null; numero: string | undefined; email?: string | null; source: string | null; campagne: string | null;
  recuLe?: string; brut?: Record<string, unknown>;
}): Promise<boolean> {
  const contactId = r.numero ? await couperRelances(r.numero) : null;
  return enregistrer({
    nature: "stop",
    evenement_id: r.evenementId,
    numero: r.numero,
    email: r.email ?? null,
    source_id: r.source,
    campagne: r.campagne,
    contact_id: contactId,
    ...(r.recuLe ? { recu_le: r.recuLe } : {}),
    brut: r.brut ?? {},
  });
}

/** Un accusé de réception (webhook). */
export async function traiterAccuse(r: {
  evenementId: string | null; numero: string | undefined; email?: string | null; statut: string | null; source: string | null; campagne: string | null;
  brut?: Record<string, unknown>;
}): Promise<boolean> {
  return enregistrer({
    nature: "accuse",
    evenement_id: r.evenementId,
    numero: r.numero,
    email: r.email ?? null,
    statut: r.statut,
    source_id: r.source,
    campagne: r.campagne,
    brut: r.brut ?? {},
  });
}

/**
 * Relit chez MailingVox les réponses et les STOP des derniers jours (leur API
 * « Lister les réponses » et « Lister les STOPS ») et range ce qui manque au
 * journal — ce que le webhook n'a pas reçu, parce qu'il n'était pas encore
 * déclaré ou que sa serrure n'était pas posée. Idempotent.
 */
export async function relireRetours(jours = 30): Promise<{ reponses: number; stops: number; nouvelles: number; message: string }> {
  const cle = process.env.MAILINGVOX_KEY;
  if (!cle) return { reponses: 0, stops: 0, nouvelles: 0, message: "MAILINGVOX_KEY absente : rien à relire." };
  const depuis = Math.floor(Date.now() / 1000) - jours * 86400;
  const base = "https://v3.mailingvox.com/api";

  const lireListe = async (chemin: string): Promise<unknown[]> => {
    const res = await fetch(`${base}/${chemin}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return [];
    try {
      const j = (await res.json()) as unknown;
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  };
  const champ = (l: unknown, i: number, nom: string): string | null => {
    if (Array.isArray(l)) return l[i] === undefined || l[i] === null ? null : String(l[i]);
    if (l && typeof l === "object") { const v = (l as Record<string, unknown>)[nom]; return v === undefined || v === null ? null : String(v); }
    return null;
  };
  const dateIso = (v: string | null) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : undefined;
  };

  /* Réponses : [id][numero][message][date_envoi][source_id]. */
  const reponses = await lireListe(`responses?key=${encodeURIComponent(cle)}&date_debut=${depuis}&limit=10000`);
  /* STOP : [id][numero][date_envoi][source_id]. */
  const stops = await lireListe(`stops?key=${encodeURIComponent(cle)}`);

  let nouvelles = 0;
  for (const l of reponses) {
    const id = champ(l, 0, "id");
    const numero = normaliserNumero(champ(l, 1, "numero"));
    const texte = champ(l, 2, "message") ?? "";
    const recuLe = dateIso(champ(l, 3, "date_envoi"));
    const source = champ(l, 4, "source_id");
    if (!id) continue;
    const r = await traiterReponse({ evenementId: id, numero, texte, source, campagne: null, recuLe, brut: { relecture: true } }).catch(() => null);
    if (r?.nouvelle) nouvelles++;
  }
  for (const l of stops) {
    const id = champ(l, 0, "id");
    const numero = normaliserNumero(champ(l, 1, "numero"));
    const recuLe = dateIso(champ(l, 2, "date_envoi"));
    const source = champ(l, 3, "source_id");
    if (!id) continue;
    const n = await traiterStop({ evenementId: id, numero, source, campagne: null, recuLe, brut: { relecture: true } }).catch(() => false);
    if (n) nouvelles++;
  }
  return {
    reponses: reponses.length,
    stops: stops.length,
    nouvelles,
    message: `${reponses.length} réponse${reponses.length > 1 ? "s" : ""} et ${stops.length} STOP relus chez MailingVox, ${nouvelles} nouveau${nouvelles > 1 ? "x" : ""} rangé${nouvelles > 1 ? "s" : ""}.`,
  };
}
