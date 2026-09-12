/* Relève IMAP des boîtes de l'agence (tâche #57).
 *
 * Elle relit les boîtes, fait passer chaque message par le moteur de
 * reconnaissance (lib/bo/rattachement.ts) et range le résultat dans
 * `fi_mail_entrant` — notre table, pas le miroir `bo_mail` que Bubble réécrit
 * chaque nuit.
 *
 * PLUSIEURS BOÎTES, ET C'EST LE POINT. MAV demandait si les réponses aux
 * e-mails pouvaient revenir dans le BO comme celles aux SMS. La route de masse
 * pose `Reply-To` sur l'agent (§7.1) : la réponse ne revient donc PAS chez
 * SendGrid, elle arrive dans la vraie boîte du commercial. Ne relever qu'une
 * seule boîte — ce que faisait cette relève, sur les variables `IMAP_*` —
 * laissait forcément tomber les réponses de l'autre agent. On relève
 * maintenant toutes les boîtes connues (`fi_boite_agent` + variables
 * `MAIL_n_*`), chacune avec son propre curseur.
 *
 * Deux principes tenus d'un bout à l'autre :
 *   • rejouable — l'identifiant du message est unique en base, relancer la
 *     relève deux fois ne crée pas de doublon ;
 *   • rien n'est jugé — le moteur reconnaît ou ne reconnaît pas ; ce qui se
 *     déclare envoi de masse est écarté, le reste entre et attend l'agent.
 */

import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import {
  adresseSeule, estRetenu, reconnaitre,
  type Enveloppe, type Recherches, type Reference,
} from "@/lib/bo/rattachement";
import { toutesLesBoites } from "@/lib/mails/boites";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Une boîte à relever, telle que la relève en a besoin. */
type ARelever = {
  /** Clé du curseur en base : une adresse peut avoir plusieurs dossiers. */
  cle: string;
  adresse: string;
  host: string; port: number; user: string; pass: string;
  dossier: string;
};

/** Boîte de service héritée, déclarée en variables `IMAP_*`. */
function boiteHeritee(): ARelever | undefined {
  const host = process.env.IMAP_HOST ?? process.env.SMTP_HOST?.replace(/^smtp/, "imap");
  const user = process.env.IMAP_USER ?? process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS ?? process.env.SMTP_PASS;
  if (!host || !user || !pass) return undefined;
  const dossier = process.env.IMAP_BOITE ?? "INBOX";
  return {
    cle: `${adresseSeule(user)}/${dossier}`,
    adresse: adresseSeule(user),
    host, port: Number(process.env.IMAP_PORT ?? 993), user, pass, dossier,
  };
}

/**
 * Toutes les boîtes à relever.
 *
 * Les boîtes des agents priment : ce sont elles qui reçoivent les réponses.
 * La boîte de service héritée reste relevée tant qu'elle est déclarée, mais
 * jamais deux fois si un agent l'a reprise à son nom.
 */
export async function boitesARelever(): Promise<ARelever[]> {
  const agents = (await toutesLesBoites().catch(() => [])).map((b) => ({
    cle: `${adresseSeule(b.adresse)}/INBOX`,
    adresse: adresseSeule(b.adresse),
    host: b.imap.host, port: b.imap.port, user: b.imap.user, pass: b.imap.pass,
    dossier: b.dossiers?.reception ?? "INBOX",
  }));
  const heritee = boiteHeritee();
  if (heritee && !agents.some((a) => a.adresse === heritee.adresse)) agents.push(heritee);
  return agents;
}

/**
 * La relève est-elle branchée ?
 *
 * Ne répond que pour les variables d'environnement — les boîtes en base
 * demandent un aller-retour, et `relever()` le fait déjà. L'écran se fie au
 * bilan, pas à cette réponse, qui n'est plus qu'un raccourci sans accès base.
 */
export function releveConfiguree() {
  return !!boiteHeritee() || !!process.env.MAIL_1_PASS;
}

/* ---------------------------------------------------------- accès base --- */

async function sb<T>(chemin: string, init?: RequestInit): Promise<T[]> {
  if (!SB_KEY) return [];
  const res = await fetch(`${SB_URL}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${(await res.text()).slice(0, 200)}`);
  const txt = await res.text();
  return txt ? (JSON.parse(txt) as T[]) : [];
}

/** Les trois recherches dont le moteur a besoin, branchées sur le miroir. */
export function recherchesSupabase(): Recherches {
  return {
    /* Le jeton est posé sur l'envoi et revient dans `In-Reply-To`. Il vit
       aujourd'hui sur les estimations : c'est le seul envoi du BO qui en
       pose un. Les autres suivront sans que ce moteur change. */
    parJeton: async (jeton) => {
      const rows = await sb<{ data: Record<string, unknown> }>(
        `bo_estimation?select=data&data->>sent_jeton=eq.${encodeURIComponent(jeton)}&limit=1`,
      );
      const e = rows[0]?.data;
      if (!e) return null;
      const immeubleId = typeof e.IMMEUBLE === "string" ? e.IMMEUBLE : undefined;
      let contactId: string | undefined;
      if (immeubleId) {
        const ims = await sb<{ data: Record<string, unknown> }>(
          `bo_immeuble?select=data&data->>_id=eq.${encodeURIComponent(immeubleId)}&limit=1`,
        );
        const p = ims[0]?.data?.PROPRIETAIRE;
        contactId = typeof p === "string" ? p : undefined;
      }
      return { ref: { estimationId: String(e._id), immeubleId }, contactId };
    },

    parAdresse: async (adresse) => {
      /* `ilike` et non `eq` : les adresses sont saisies avec des casses
         variables, et la comparaison d'e-mail est insensible à la casse.
         Mais `%` et `_` sont des jokers : sans échappement, `jean_dupont@x.fr`
         attraperait aussi `jeanXdupont@x.fr`. */
      const motif = adresse.replace(/([%_\\])/g, "\\$1");
      const rows = await sb<{ data: Record<string, unknown> }>(
        `bo_contact?select=data&data->>email=ilike.${encodeURIComponent(motif)}&limit=1`,
      );
      const c = rows[0]?.data;
      if (!c) return null;
      const nom = [c["prénom"], c.nom].filter((x) => typeof x === "string" && x).join(" ").trim();
      return { id: String(c._id), nom: nom || undefined };
    },

    affairesDe: async (contactId) => {
      const [ims, props] = await Promise.all([
        sb<{ data: Record<string, unknown> }>(
          `bo_immeuble?select=data&data->>PROPRIETAIRE=eq.${encodeURIComponent(contactId)}&data->>archived=eq.false&limit=20`,
        ),
        sb<{ data: Record<string, unknown> }>(
          `bo_proposition?select=data&data->>ACHETEUR=eq.${encodeURIComponent(contactId)}&data->>Statut=eq.${encodeURIComponent("Envoyée")}&limit=20`,
        ),
      ]);
      const refs: Reference[] = [];
      for (const r of ims) refs.push({ immeubleId: String(r.data._id) });
      for (const r of props) {
        refs.push({
          propositionId: String(r.data._id),
          immeubleId: typeof r.data.IMMEUBLE === "string" ? r.data.IMMEUBLE : undefined,
        });
      }
      /* Un immeuble cité deux fois (propriétaire ET proposition) ne fait pas
         deux affaires : sans ça un vendeur qui est aussi acquéreur tomberait
         systématiquement en « à choisir ». */
      const vus = new Set<string>();
      return refs.filter((r) => {
        const cle = `${r.immeubleId ?? ""}|${r.propositionId ?? ""}`;
        if (vus.has(cle)) return false;
        vus.add(cle);
        return true;
      });
    },
  };
}

/* --------------------------------------------------------- la relève --- */

export type Bilan = {
  configuree: boolean;
  lus: number;
  entres: number;
  ignores: number;
  doublons: number;
  dernierUid: number;
  erreurs: string[];
  /** Le détail par boîte : sans lui, une boîte muette passe inaperçue. */
  boites?: { adresse: string; lus: number; entres: number; erreurs: number }[];
};

const adresses = (a?: AddressObject | AddressObject[]) => {
  const liste = Array.isArray(a) ? a : a ? [a] : [];
  return liste.flatMap((x) => x.value.map((v) => (v.address ?? "").toLowerCase())).filter(Boolean);
};

/** Le texte du message, sans le HTML quand les deux sont là. */
const corpsTexte = (m: ParsedMail) =>
  (m.text ?? "").trim() || (typeof m.html === "string" ? m.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

/**
 * Relève toutes les boîtes connues.
 *
 * Une boîte qui tombe (mot de passe changé, serveur muet) n'empêche pas les
 * autres d'être relevées : son erreur est rangée dans le bilan et la suivante
 * démarre. C'est le seul comportement acceptable dès qu'il y a deux agents.
 */
export async function relever(max = 100): Promise<Bilan> {
  const boites = await boitesARelever();
  const total: Bilan = {
    configuree: boites.length > 0,
    lus: 0, entres: 0, ignores: 0, doublons: 0, dernierUid: 0, erreurs: [], boites: [],
  };
  if (!boites.length) return total;

  const r = recherchesSupabase();
  for (const c of boites) {
    const b = await releverUne(c, r, max).catch((e): Bilan => ({
      configuree: true, lus: 0, entres: 0, ignores: 0, doublons: 0, dernierUid: 0,
      erreurs: [e instanceof Error ? e.message : String(e)],
    }));
    total.lus += b.lus;
    total.entres += b.entres;
    total.ignores += b.ignores;
    total.doublons += b.doublons;
    total.dernierUid = Math.max(total.dernierUid, b.dernierUid);
    total.erreurs.push(...b.erreurs.map((m) => `${c.adresse} — ${m}`));
    total.boites!.push({ adresse: c.adresse, lus: b.lus, entres: b.entres, erreurs: b.erreurs.length });
  }
  return total;
}

async function releverUne(c: ARelever, r: Recherches, max: number): Promise<Bilan> {
  const bilan: Bilan = {
    configuree: true,
    lus: 0, entres: 0, ignores: 0, doublons: 0, dernierUid: 0, erreurs: [],
  };

  /* On repart du dernier UID vu : relire toute la boîte à chaque passage
     coûterait cher et n'apporterait rien. Le curseur porte l'adresse, pas
     seulement le nom du dossier : deux boîtes ont toutes les deux un INBOX,
     et les confondre ferait sauter les messages de la seconde. */
  const etats = await sb<{ boite: string; dernier_uid: number }>(
    `fi_releve_etat?select=boite,dernier_uid&boite=eq.${encodeURIComponent(c.cle)}&limit=1`,
  );
  const depuis = etats[0]?.dernier_uid ?? 0;
  bilan.dernierUid = depuis;

  const client = new ImapFlow({
    host: c.host, port: c.port, secure: c.port === 993,
    auth: { user: c.user, pass: c.pass },
    logger: false,
  });

  await client.connect();
  const verrou = await client.getMailboxLock(c.dossier);
  try {
    /* `uid:*` renvoie toujours au moins le dernier message même quand il n'y
       a rien de neuf : le filtre sur `uid > depuis` reste indispensable. */
    for await (const msg of client.fetch(
      { uid: `${depuis + 1}:*` },
      { uid: true, source: true, envelope: true },
    )) {
      if (msg.uid <= depuis) continue;
      if (bilan.lus >= max) break;
      bilan.lus += 1;
      bilan.dernierUid = Math.max(bilan.dernierUid, msg.uid);

      try {
        const parse = await simpleParser(msg.source as Buffer);
        const de = adresses(parse.from)[0] ?? "";
        const env: Enveloppe = {
          de,
          pour: [...adresses(parse.to), ...adresses(parse.cc)],
          objet: parse.subject ?? undefined,
          messageId: parse.messageId ?? undefined,
          inReplyTo: parse.inReplyTo ?? undefined,
          references: Array.isArray(parse.references)
            ? parse.references
            : parse.references ? [parse.references] : [],
          entetes: Object.fromEntries(
            [...parse.headers.entries()].map(([k, v]) => [k.toLowerCase(), String(v)]),
          ),
        };

        const rec = await reconnaitre(env, r);
        if (!estRetenu(rec)) { bilan.ignores += 1; continue; }

        const messageId = env.messageId ?? `imap-${c.cle}-${msg.uid}@france-immeuble`;
        /* `on_conflict` est obligatoire : la contrainte d'unicité porte sur
           `message_id`, pas sur la clé primaire. Sans lui, PostgREST lève une
           erreur 23505 au lieu d'ignorer — et la relève plantait au deuxième
           passage sur chaque message déjà vu. */
        const lignes = await sb<{ id: string }>("fi_mail_entrant?on_conflict=message_id", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify([{
            message_id: messageId,
            uid: msg.uid,
            boite: c.cle,
            de,
            de_nom: parse.from?.value?.[0]?.name || null,
            pour: env.pour,
            objet: env.objet ?? null,
            recu_le: (parse.date ?? new Date()).toISOString(),
            corps: corpsTexte(parse).slice(0, 60000),
            corps_html: typeof parse.html === "string" ? parse.html.slice(0, 200000) : null,
            in_reply_to: env.inReplyTo ?? null,
            references_: env.references ?? [],
            pieces: (parse.attachments ?? []).map((a) => ({
              nom: a.filename ?? "pièce jointe",
              type: a.contentType,
              taille: a.size,
            })),
            niveau: rec.niveau,
            raison: rec.raison,
            certain: rec.certain,
            contact_id: rec.contactId ?? null,
            immeuble_id: rec.ref?.immeubleId ?? null,
            estimation_id: rec.ref?.estimationId ?? null,
            proposition_id: rec.ref?.propositionId ?? null,
            dossier_id: rec.ref?.dossierId ?? null,
            mandat_id: rec.ref?.mandatId ?? null,
            candidats: rec.candidats ?? [],
          }]),
        });
        /* Rien en retour = la ligne existait déjà : la relève est rejouable,
           c'est le comportement voulu, pas une erreur. */
        if (lignes.length === 0) bilan.doublons += 1; else bilan.entres += 1;
      } catch (e) {
        bilan.erreurs.push(`UID ${msg.uid} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    verrou.release();
    await client.logout().catch(() => undefined);
  }

  await sb("fi_releve_etat", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      boite: c.cle,
      dernier_uid: bilan.dernierUid,
      derniere_le: new Date().toISOString(),
      dernier_message: bilan.erreurs.length
        ? `${bilan.erreurs.length} erreur(s) : ${bilan.erreurs[0]}`
        : `${bilan.entres} message(s) entré(s)`,
      lus: bilan.lus,
      ignores: bilan.ignores,
    }]),
  }).catch((e) => bilan.erreurs.push(`état de relève : ${String(e)}`));

  return bilan;
}

/** Adresse de la boîte relevée, pour l'afficher dans l'écran. */
/** Les adresses relevées, pour les afficher dans l'écran. */
export const boitesRelevees = async () => (await boitesARelever()).map((b) => b.adresse);
