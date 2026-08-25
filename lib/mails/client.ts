/* Le client de messagerie : lecture et écriture EN DIRECT sur la boîte.
 *
 * Principe central, et il commande tout le reste : **le serveur IMAP est la
 * source de vérité, pas nous.** On ne recopie pas les messages dans une table
 * qu'il faudrait ensuite tenir à jour ; on lit la boîte à chaque affichage, et
 * toute action (lu, non lu, supprimé) est écrite sur le serveur.
 *
 * C'est ce qui donne le comportement demandé : un message lu sur le téléphone
 * apparaît lu dans l'app, et un message supprimé dans l'app disparaît du
 * téléphone. Un miroir local aurait toujours un train de retard.
 */

import { ImapFlow, type ListResponse } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import nodemailer from "nodemailer";
import type { Boite } from "@/lib/mails/boites";

/* ------------------------------------------------------- dossiers --- */

export type RoleDossier = "reception" | "envoyes" | "brouillons" | "indesirables" | "corbeille";

export type Dossier = {
  role: RoleDossier | null;
  /** Chemin réel chez le fournisseur : « Sent », « Éléments envoyés »… */
  chemin: string;
  nom: string;
  nonLus?: number;
  total?: number;
};

/* Les noms varient d'un fournisseur à l'autre — et Exchange les traduit. On
   se fie d'abord aux attributs spéciaux (\Sent, \Trash…), qui sont normalisés,
   et on ne retombe sur les noms que si le serveur n'en pose aucun. */
const PAR_ATTRIBUT: Record<string, RoleDossier> = {
  "\\Inbox": "reception",
  "\\Sent": "envoyes",
  "\\Drafts": "brouillons",
  "\\Junk": "indesirables",
  "\\Trash": "corbeille",
};

const PAR_NOM: [RegExp, RoleDossier][] = [
  [/^inbox$/i, "reception"],
  [/(sent|envoy)/i, "envoyes"],
  [/(draft|brouillon)/i, "brouillons"],
  [/(junk|spam|ind[ée]sirable|courrier ind)/i, "indesirables"],
  [/(trash|deleted|corbeille|supprim)/i, "corbeille"],
];

function roleDe(d: ListResponse): RoleDossier | null {
  if (d.path.toUpperCase() === "INBOX") return "reception";
  for (const f of d.flags ?? []) {
    const r = PAR_ATTRIBUT[f as string];
    if (r) return r;
  }
  if (d.specialUse && PAR_ATTRIBUT[d.specialUse]) return PAR_ATTRIBUT[d.specialUse];
  const feuille = d.path.split(d.delimiter || "/").pop() ?? d.path;
  for (const [re, r] of PAR_NOM) if (re.test(feuille)) return r;
  return null;
}

/* ------------------------------------------------------ connexion --- */

async function connecter(b: Boite) {
  const client = new ImapFlow({
    host: b.imap.host,
    port: b.imap.port,
    secure: b.imap.port === 993,
    auth: { user: b.imap.user, pass: b.imap.pass },
    logger: false,
    /* Une boîte injoignable doit rendre la main vite : l'écran affiche
       l'erreur, il ne reste pas à tourner. */
    socketTimeout: 20000,
    greetingTimeout: 10000,
  });
  await client.connect();
  return client;
}

/** Ouvre la boîte, fait le travail, referme quoi qu'il arrive. */
async function avec<T>(b: Boite, travail: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = await connecter(b);
  try {
    return await travail(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/* -------------------------------------------------------- messages --- */

export type Entete = {
  uid: number;
  messageId?: string;
  de: string;
  deNom?: string;
  pour: string[];
  objet: string;
  date?: string;
  extrait: string;
  /** Vient du serveur : c'est lui qui sait si le message est lu. */
  lu: boolean;
  repondu: boolean;
  drapeau: boolean;
  pj: number;
};

const adr = (a?: AddressObject | AddressObject[]) => {
  const l = Array.isArray(a) ? a : a ? [a] : [];
  return l.flatMap((x) => x.value.map((v) => (v.address ?? "").toLowerCase())).filter(Boolean);
};

export type Verdict = { ok: true; dossiers: Dossier[]; adresse: string } | { ok: false; erreur: string };

/** Teste la connexion et découvre les dossiers. C'est le bouton « Vérifier ». */
export async function verifier(b: Boite): Promise<Verdict> {
  try {
    return await avec(b, async (c) => {
      const liste = await c.list();
      const dossiers: Dossier[] = liste
        .filter((d) => !(d.flags as Set<string> | undefined)?.has("\\Noselect"))
        .map((d) => ({
          role: roleDe(d),
          chemin: d.path,
          nom: d.name || d.path,
        }));
      return { ok: true as const, dossiers, adresse: b.adresse };
    });
  } catch (e) {
    return { ok: false as const, erreur: messageClair(e) };
  }
}

/** Traduit les erreurs IMAP les plus courantes en quelque chose d'actionnable.
 *
 *  ImapFlow enveloppe les refus du serveur dans une Error dont le message est
 *  « Command failed » — l'explication utile est à côté, dans `responseText`.
 *  Sans ça, un mot de passe faux s'affiche « Command failed » et l'agent n'a
 *  aucune idée de ce qu'il doit corriger. */
export function messageClair(e: unknown): string {
  const brut = e as { responseText?: string; response?: unknown; authenticationFailed?: boolean };
  if (brut?.authenticationFailed) {
    return "Identifiants refusés. Vérifiez l'adresse et le mot de passe — et que l'accès IMAP est autorisé sur le compte.";
  }
  const detail = typeof brut?.responseText === "string" ? brut.responseText
    : typeof brut?.response === "string" ? brut.response : "";
  const m = `${e instanceof Error ? e.message : String(e)} ${detail}`.trim();
  if (/AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed/i.test(m)) {
    return "Identifiants refusés. Vérifiez l'adresse et le mot de passe — et que l'accès IMAP est autorisé sur le compte.";
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return "Serveur introuvable : vérifiez le nom du serveur IMAP.";
  if (/ECONNREFUSED/i.test(m)) return "Connexion refusée : vérifiez le port (993 en général).";
  if (/timeout|ETIMEDOUT/i.test(m)) return "Le serveur ne répond pas. Port bloqué, ou IMAP désactivé sur le compte.";
  if (/certificate|self.signed/i.test(m)) return "Certificat du serveur refusé.";
  return m;
}

/** Le chemin réel d'un rôle, découvert à la volée si on ne l'a pas déjà. */
async function chemin(c: ImapFlow, role: RoleDossier, connus?: Record<string, string>) {
  if (connus?.[role]) return connus[role];
  if (role === "reception") return "INBOX";
  const liste = await c.list();
  const trouve = liste.find((d) => roleDe(d) === role);
  return trouve?.path;
}

export type Page = {
  messages: Entete[];
  total: number;
  nonLus: number;
  /** Chemin réellement lu — utile quand le rôle n'existe pas chez ce fournisseur. */
  chemin: string;
};

/**
 * Une page de messages, la plus récente d'abord, avec les drapeaux du serveur.
 *
 * On ne descend que les en-têtes et un extrait : télécharger le corps de
 * cinquante messages pour n'en lire qu'un serait long et inutile.
 */
export async function listerMessages(
  b: Boite,
  role: RoleDossier,
  depuis = 0,
  combien = 40,
): Promise<Page> {
  return avec(b, async (c) => {
    const ch = (await chemin(c, role, b.dossiers)) ?? "INBOX";
    const boite = await c.mailboxOpen(ch, { readOnly: true });
    const total = boite.exists;
    if (total === 0) return { messages: [], total: 0, nonLus: 0, chemin: ch };

    /* Les plus récents sont les derniers : on prend la tranche par la fin. */
    const haut = Math.max(1, total - depuis);
    const bas = Math.max(1, haut - combien + 1);

    const messages: Entete[] = [];
    for await (const m of c.fetch(`${bas}:${haut}`, {
      uid: true, flags: true, envelope: true, bodyStructure: true,
      /* 2 Ko du début du texte : de quoi faire un extrait sans tirer les
         pièces jointes. */
      bodyParts: ["1", "1.1", "1.2"], size: true,
    })) {
      const flags = m.flags ?? new Set<string>();
      const env = m.envelope;
      messages.push({
        uid: m.uid,
        messageId: env?.messageId,
        de: env?.from?.[0]?.address?.toLowerCase() ?? "",
        deNom: env?.from?.[0]?.name || undefined,
        pour: (env?.to ?? []).map((x) => x.address?.toLowerCase() ?? "").filter(Boolean),
        objet: env?.subject || "(sans objet)",
        date: env?.date ? new Date(env.date).toISOString() : undefined,
        extrait: extraitDe(m.bodyStructure, m.bodyParts),
        lu: flags.has("\\Seen"),
        repondu: flags.has("\\Answered"),
        drapeau: flags.has("\\Flagged"),
        pj: compterPJ(m.bodyStructure),
      });
    }
    messages.reverse();
    const nonLus = boite.unseen ?? messages.filter((m) => !m.lu).length;
    return { messages, total, nonLus, chemin: ch };
  });
}

/* --------------------------------------------- extrait d'un message ---
 *
 * Un extrait, c'est une phrase du message, pas ses octets bruts. Prendre la
 * première partie telle quelle donnait « PCFET0NUWVBFIGh0bWwg… » dans la
 * liste : du base64 affiché tel quel, illisible et inquiétant.
 *
 * Il faut donc trois choses : choisir la BONNE partie (le texte, pas le HTML
 * ni la pièce jointe), la DÉCODER selon son encodage de transfert, et si on
 * n'a que du HTML, en retirer les balises.
 */

type Noeud = {
  part?: string;
  type?: string;
  encoding?: string;
  disposition?: string;
  childNodes?: Noeud[];
};

/** Parcourt la structure et rend les parties texte, la plus simple d'abord. */
function partiesTexte(s: unknown): Noeud[] {
  if (!s || typeof s !== "object") return [];
  const n = s as Noeud;
  const enfants = (n.childNodes ?? []).flatMap(partiesTexte);
  const moi = n.type === "text/plain" || n.type === "text/html" ? [n] : [];
  /* Le texte brut passe avant le HTML : c'est déjà l'extrait qu'on veut. */
  return [...moi, ...enfants].sort((a, b) => (a.type === "text/plain" ? -1 : 0) - (b.type === "text/plain" ? -1 : 0));
}

function decoder(brut: Buffer, encodage?: string): string {
  const e = (encodage ?? "").toLowerCase();
  if (e === "base64") return Buffer.from(brut.toString("ascii"), "base64").toString("utf8");
  if (e === "quoted-printable") {
    return brut.toString("utf8")
      /* Un « = » en fin de ligne est une coupure, pas un caractère. */
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  return brut.toString("utf8");
}

const sansBalises = (h: string) =>
  h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

function extraitDe(structure: unknown, parties?: Map<string, Buffer>): string {
  if (!parties?.size) return "";
  for (const n of partiesTexte(structure)) {
    /* Un message simple n'a pas de numéro de partie : son corps est « 1 ». */
    const brut = parties.get(n.part || "1");
    if (!brut) continue;
    const texte = decoder(brut, n.encoding);
    const lisible = n.type === "text/html" ? sansBalises(texte) : texte;
    const propre = lisible.replace(/\s+/g, " ").trim();
    if (propre) return propre.slice(0, 160);
  }
  /* Structure inattendue : plutôt rien qu'un extrait illisible. */
  const seule = parties.get("1");
  if (!seule) return "";
  const propre = sansBalises(seule.toString("utf8")).replace(/\s+/g, " ").trim();
  return /^[A-Za-z0-9+/=\s]{80,}$/.test(propre) ? "" : propre.slice(0, 160);
}

/** Nombre de pièces jointes déclarées dans la structure du message. */
function compterPJ(s: unknown): number {
  if (!s || typeof s !== "object") return 0;
  const n = s as { disposition?: string; childNodes?: unknown[] };
  const ici = n.disposition === "attachment" ? 1 : 0;
  const enfants = (n.childNodes ?? []).reduce<number>((t, e) => t + compterPJ(e), 0);
  return ici + enfants;
}

export type MessageComplet = Entete & {
  corps: string;
  corpsHtml?: string;
  pieces: { nom: string; type: string; taille: number }[];
  enTetes: Record<string, string>;
  inReplyTo?: string;
  references: string[];
};

/**
 * Un message entier. **Le lire le marque lu sur le serveur** : c'est le sens
 * de la synchro que MAV attend, dans l'autre direction cette fois.
 */
export async function lireMessage(
  b: Boite,
  role: RoleDossier,
  uid: number,
  marquerLu = true,
): Promise<MessageComplet | null> {
  return avec(b, async (c) => {
    const ch = (await chemin(c, role, b.dossiers)) ?? "INBOX";
    await c.mailboxOpen(ch, { readOnly: !marquerLu });
    const m = await c.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
    if (!m || !m.source) return null;

    const p = await simpleParser(m.source as Buffer);
    const flags = m.flags ?? new Set<string>();
    if (marquerLu && !flags.has("\\Seen")) {
      await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => undefined);
    }
    return {
      uid,
      messageId: p.messageId ?? undefined,
      de: adr(p.from)[0] ?? "",
      deNom: p.from?.value?.[0]?.name || undefined,
      pour: [...adr(p.to), ...adr(p.cc)],
      objet: p.subject || "(sans objet)",
      date: (p.date ?? new Date()).toISOString(),
      extrait: (p.text ?? "").replace(/\s+/g, " ").slice(0, 160),
      lu: true,
      repondu: flags.has("\\Answered"),
      drapeau: flags.has("\\Flagged"),
      pj: p.attachments?.length ?? 0,
      corps: (p.text ?? "").trim(),
      corpsHtml: typeof p.html === "string" ? p.html : undefined,
      pieces: (p.attachments ?? []).map((a) => ({
        nom: a.filename ?? "pièce jointe", type: a.contentType, taille: a.size,
      })),
      enTetes: Object.fromEntries([...p.headers.entries()].map(([k, v]) => [k.toLowerCase(), String(v)])),
      inReplyTo: p.inReplyTo ?? undefined,
      references: Array.isArray(p.references) ? p.references : p.references ? [p.references] : [],
    };
  });
}

/** Marque lu / non lu sur le serveur — donc aussi sur le téléphone. */
export async function marquerLus(b: Boite, role: RoleDossier, uids: number[], lu: boolean) {
  if (uids.length === 0) return;
  await avec(b, async (c) => {
    const ch = (await chemin(c, role, b.dossiers)) ?? "INBOX";
    await c.mailboxOpen(ch);
    const liste = uids.join(",");
    if (lu) await c.messageFlagsAdd(liste, ["\\Seen"], { uid: true });
    else await c.messageFlagsRemove(liste, ["\\Seen"], { uid: true });
  });
}

/**
 * Déplace des messages vers un autre dossier de la boîte.
 *
 * Supprimer, c'est déplacer vers la corbeille : c'est ce que font tous les
 * clients, et ça laisse à l'agent la possibilité de se raviser depuis son
 * téléphone. Si le fournisseur n'a pas de corbeille, on le dit plutôt que
 * d'effacer pour de bon.
 */
export async function deplacer(b: Boite, role: RoleDossier, uids: number[], vers: RoleDossier) {
  if (uids.length === 0) return;
  await avec(b, async (c) => {
    const source = (await chemin(c, role, b.dossiers)) ?? "INBOX";
    const cible = await chemin(c, vers, b.dossiers);
    if (!cible) throw new Error(`Ce compte n'a pas de dossier « ${vers} ».`);
    if (cible === source) return;
    await c.mailboxOpen(source);
    await c.messageMove(uids.join(","), cible, { uid: true });
  });
}

/* --------------------------------------------------------- envoi --- */

/**
 * Envoie depuis la boîte de l'agent, et **dépose une copie dans ses envoyés**.
 *
 * Le dépôt n'est pas un détail : sans lui, le message existe pour le
 * destinataire mais pas dans le téléphone de l'agent, qui ne retrouve pas ce
 * qu'il a écrit.
 */
export async function envoyerDepuis(b: Boite, m: {
  to: string;
  cc?: string;
  cci?: string;
  objet: string;
  texte: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  messageId?: string;
  /** Pièces jointes (le dossier d'estimation, des pièces du coffre…). */
  pieces?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  const redirection = process.env.MAIL_REDIRECT?.trim();
  const t = nodemailer.createTransport({
    host: b.smtp.host,
    port: b.smtp.port,
    secure: b.smtp.port === 465,
    requireTLS: b.smtp.port !== 465,
    auth: { user: b.smtp.user, pass: b.smtp.pass },
  });

  const de = b.nomAffiche ? `${b.nomAffiche} <${b.adresse}>` : b.adresse;
  const info = await t.sendMail({
    from: de,
    to: redirection || m.to,
    cc: redirection ? undefined : m.cc || undefined,
    bcc: redirection ? undefined : m.cci || undefined,
    subject: redirection ? `[ESSAI → ${m.to}] ${m.objet}` : m.objet,
    text: redirection ? `— Envoi de recette. Destinataire réel : ${m.to} —\n\n${m.texte}` : m.texte,
    html: m.html,
    inReplyTo: m.inReplyTo,
    references: m.references?.length ? m.references.join(" ") : undefined,
    messageId: m.messageId,
    attachments: m.pieces?.length ? m.pieces : undefined,
  });

  /* La copie dans « Envoyés » se fait au mieux : si elle échoue, le message
     est parti quand même et on ne va pas le renvoyer pour autant. */
  let copie = false;
  try {
    await avec(b, async (c) => {
      const ch = await chemin(c, "envoyes", b.dossiers);
      if (!ch) return;
      const brut = [
        `From: ${de}`,
        `To: ${m.to}`,
        m.cc ? `Cc: ${m.cc}` : "",
        `Subject: ${m.objet}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: ${String(info.messageId ?? "")}`,
        m.inReplyTo ? `In-Reply-To: ${m.inReplyTo}` : "",
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="utf-8"',
        "",
        m.texte,
      ].filter(Boolean).join("\r\n");
      await c.append(ch, Buffer.from(brut, "utf8"), ["\\Seen"]);
      copie = true;
    });
  } catch {
    /* Rien à faire de plus : le bilan le dira. */
  }

  return { messageId: String(info.messageId ?? ""), copieDansEnvoyes: copie };
}

/** Marque un message comme répondu — le petit chevron des clients mail. */
export async function marquerRepondu(b: Boite, role: RoleDossier, uid: number) {
  await avec(b, async (c) => {
    const ch = (await chemin(c, role, b.dossiers)) ?? "INBOX";
    await c.mailboxOpen(ch);
    await c.messageFlagsAdd(String(uid), ["\\Answered"], { uid: true });
  }).catch(() => undefined);
}
