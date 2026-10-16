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
import nodemailer from "nodemailer";
import iconv from "iconv-lite";
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
  /* Une connexion gardée qui meurt en silence — serveur qui coupe, fonction
     gelée puis reprise sur Vercel — émet « error » sans que personne n'écoute,
     et Node arrête alors TOUT le processus. C'est ce qui a tué l'envoi de MAV
     le 15/10 à 12 h 30 (« Socket timeout », processus sorti en 129) : le
     message partait, la copie dans « Envoyés » non. On écoute, on jette la
     connexion, la demande suivante en ouvre une neuve. */
  client.on("error", (e: unknown) => {
    for (const [k, c] of CLIENTS) if (c === client) CLIENTS.delete(k);
    console.error(`[mails] connexion IMAP perdue pour ${b.adresse} : ${messageClair(e)}`);
  });
  await client.connect();
  return client;
}

/** Une connexion neuve, utilisée puis refermée. Pour la vérification. */
async function avecNeuf<T>(b: Boite, travail: (c: ImapFlow) => Promise<T>): Promise<T> {
  const client = await connecter(b);
  try {
    return await travail(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/* -------------------------------------------------- connexion tenue ---
 *
 * Ouvrir une connexion IMAP coûte cher : résolution, TLS, authentification,
 * découverte des dossiers. Une à trois secondes, avant même d'avoir demandé
 * quoi que ce soit. Le faire à chaque clic — ouvrir un message, changer de
 * dossier, marquer lu — rendait la boîte inutilisable.
 *
 * On garde donc la connexion ouverte entre deux gestes, et on la referme après
 * une minute d'inactivité. Deux précautions :
 *
 *  · IMAP n'est pas concurrent : une connexion ne traite qu'une commande à la
 *    fois. Les appels sont donc mis à la file, pas envoyés en parallèle ;
 *  · une connexion peut mourir sans prévenir (le serveur ferme, la fonction
 *    est gelée puis reprise). On vérifie qu'elle est utilisable, et la moindre
 *    erreur la met au rebut plutôt que de la réutiliser dans un état douteux.
 */

const REPOS_MS = 60_000;
const CLIENTS = new Map<string, ImapFlow>();
const FILES = new Map<string, Promise<unknown>>();
const MINUTEURS = new Map<string, ReturnType<typeof setTimeout>>();

const cleBoite = (b: Boite) => `${b.imap.host}:${b.imap.port}|${b.imap.user}`;

function armerFermeture(k: string) {
  clearTimeout(MINUTEURS.get(k));
  const t = setTimeout(() => {
    const c = CLIENTS.get(k);
    CLIENTS.delete(k);
    MINUTEURS.delete(k);
    c?.logout().catch(() => undefined);
  }, REPOS_MS);
  /* Ne pas retenir le processus en vie juste pour fermer une connexion. */
  (t as unknown as { unref?: () => void }).unref?.();
  MINUTEURS.set(k, t);
}

/** La connexion répond-elle encore ? Trois secondes, pas plus. */
function vivante(c: ImapFlow): Promise<boolean> {
  return Promise.race([
    c.noop().then(() => true, () => false),
    new Promise<boolean>((r) => { const t = setTimeout(() => r(false), 3000); (t as unknown as { unref?: () => void }).unref?.(); }),
  ]);
}

/** Fait le travail sur la connexion de la boîte, en la tenant ouverte. */
async function avec<T>(b: Boite, travail: (c: ImapFlow) => Promise<T>): Promise<T> {
  const k = cleBoite(b);
  const precedent = FILES.get(k) ?? Promise.resolve();
  const suite = precedent.catch(() => undefined).then(async () => {
    clearTimeout(MINUTEURS.get(k));
    let c = CLIENTS.get(k);
    /* Une connexion réutilisée peut être morte sans l'avoir annoncé : le
       serveur a coupé, ou la fonction a été gelée puis reprise. Si le geste
       échoue sur une connexion gardée, on en refait une et on réessaie UNE
       fois — l'agent ne doit pas voir une erreur pour ça. */
    /* Sur Vercel, une fonction reprise après un gel garde la connexion en
       mémoire mais plus le tuyau derrière : `usable` dit vrai, et la première
       commande attend vingt secondes avant d'échouer. Un NOOP borné à trois
       secondes tranche tout de suite. */
    if (c?.usable && !(await vivante(c))) {
      CLIENTS.delete(k);
      await c.logout().catch(() => undefined);
      c = undefined;
    }
    const reutilisee = !!c?.usable;
    if (!c || !c.usable) {
      if (c) await c.logout().catch(() => undefined);
      c = await connecter(b);
      CLIENTS.set(k, c);
    }
    try {
      return await travail(c);
    } catch (e) {
      /* Une commande qui échoue laisse l'état du client incertain : on repart
         d'une connexion propre. */
      CLIENTS.delete(k);
      await c.logout().catch(() => undefined);
      if (!reutilisee) throw e;
      const neuf = await connecter(b);
      CLIENTS.set(k, neuf);
      try {
        return await travail(neuf);
      } catch (e2) {
        CLIENTS.delete(k);
        await neuf.logout().catch(() => undefined);
        throw e2;
      }
    } finally {
      if (CLIENTS.has(k)) armerFermeture(k);
    }
  });
  FILES.set(k, suite.catch(() => undefined));
  return suite;
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

export type Verdict = { ok: true; dossiers: Dossier[]; adresse: string } | { ok: false; erreur: string };

/** Teste la connexion et découvre les dossiers. C'est le bouton « Vérifier ». */
export async function verifier(b: Boite): Promise<Verdict> {
  try {
    /* Connexion neuve, jamais celle qui est tenue ouverte : vérifier un
       nouveau mot de passe sur une connexion authentifiée avec l'ancien
       répondrait « ça marche » quoi qu'on tape. */
    return await avecNeuf(b, async (c) => {
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
        deNom: demojibake(env?.from?.[0]?.name || "") || undefined,
        pour: (env?.to ?? []).map((x) => x.address?.toLowerCase() ?? "").filter(Boolean),
        objet: demojibake(env?.subject || "") || "(sans objet)",
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
  /** Les paramètres du Content-Type — dont le `charset` du texte. */
  parameters?: { charset?: string };
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

/* Retour #480 : « des caractères spéciaux qui ne passent pas comme les é ou
   les € ». Le quoted-printable était décodé octet par octet en caractères —
   un « é » en UTF-8 fait deux octets, il sortait « Ã© » ; et le jeu de
   caractères annoncé par le message (ISO-8859-1, Windows-1252…) n'était pas
   lu du tout. On décode donc l'encodage de transfert en OCTETS, puis les
   octets dans le jeu annoncé. */
function decoder(brut: Buffer, encodage?: string, charset?: string): string {
  const e = (encodage ?? "").toLowerCase();
  const octets = e === "base64" ? Buffer.from(brut.toString("ascii"), "base64")
    : e === "quoted-printable" ? decoderQP(brut)
      : brut;
  return versTexte(octets, charset);
}

/** Quoted-printable → octets. Un « = » en fin de ligne est une coupure, pas
 *  un caractère. */
function decoderQP(brut: Buffer): Buffer {
  const s = brut.toString("latin1").replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(s.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** Octets → texte, dans le jeu de caractères annoncé ; UTF-8 sinon, et
 *  Windows-1252 en dernier recours quand l'UTF-8 ne tient pas. */
function versTexte(octets: Buffer, charset?: string): string {
  const cs = (charset ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (cs && cs !== "utf-8" && cs !== "utf8" && iconv.encodingExists(cs)) {
    try { return iconv.decode(octets, cs); } catch { /* on retombe sur l'UTF-8 */ }
  }
  const t = octets.toString("utf8");
  return t.includes("\ufffd") ? iconv.decode(octets, "windows-1252") : t;
}

/** Un texte déjà abîmé — « dâ€™Argenteuil », « mÂ² » — remis d'aplomb : il a
 *  été lu en Latin-1 alors qu'il était en UTF-8. On ne touche qu'aux textes
 *  qui portent la signature de cette erreur, jamais aux autres. */
export function demojibake(s: string): string {
  if (!/[ÃÂ][\u0080-\u00bf]|â€/.test(s)) return s;
  const r = Buffer.from(s, "latin1").toString("utf8");
  return r.includes("\ufffd") ? s : r;
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
    const texte = decoder(brut, n.encoding, n.parameters?.charset);
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
  pieces: PieceJointe[];
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

    /* On demande d'abord la STRUCTURE, pas le message.
     *
     * Tirer la source complète — ce que faisait la version d'avant — c'était
     * télécharger les pièces jointes avant d'avoir affiché la première ligne.
     * Sur un message avec un PDF de cinq mégaoctets, l'écran attendait le PDF
     * pour montrer du texte. On ne descend donc que les parties qu'on affiche,
     * et les pièces jointes restent où elles sont tant qu'on ne les demande
     * pas. */
    const tete = await c.fetchOne(
      String(uid),
      { uid: true, flags: true, envelope: true, bodyStructure: true, size: true },
      { uid: true },
    );
    if (!tete) return null;

    const textes = partiesTexte(tete.bodyStructure);
    /* Le texte brut d'abord, le HTML ensuite : on veut les deux quand ils
       existent — le premier pour citer dans une réponse, le second pour
       l'affichage. */
    const brute = textes.find((n) => n.type === "text/plain");
    const html = textes.find((n) => n.type === "text/html");
    const demandes = [...new Set([brute?.part || "1", html?.part].filter(Boolean))] as string[];

    const brutOuFaux = await c.fetchOne(
      String(uid),
      { uid: true, bodyParts: demandes, headers: ["in-reply-to", "references", "message-id"] },
      { uid: true },
    ).catch(() => false as const);
    /* `fetchOne` rend `false` quand le message a disparu entre-temps. */
    const corpsBruts = brutOuFaux || null;

    const parties = corpsBruts?.bodyParts;
    const lire1 = (n?: Noeud) => {
      const p = n ? parties?.get(n.part || "1") : undefined;
      /* Un corps démesuré ne sert à rien à l'écran et fige le navigateur. */
      return p ? decoder(p.subarray(0, 400_000), n?.encoding, n?.parameters?.charset) : undefined;
    };
    const texte = lire1(brute);
    const enHtml = lire1(html);

    const enTetes = lireEnTetes(corpsBruts?.headers);
    const flags = tete.flags ?? new Set<string>();
    if (marquerLu && !flags.has("\\Seen")) {
      await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => undefined);
    }

    const env = tete.envelope;
    const corps = (texte ?? (enHtml ? sansBalises(enHtml) : "")).trim();
    return {
      uid,
      messageId: env?.messageId ?? enTetes["message-id"],
      de: env?.from?.[0]?.address?.toLowerCase() ?? "",
      deNom: demojibake(env?.from?.[0]?.name || "") || undefined,
      pour: [...(env?.to ?? []), ...(env?.cc ?? [])]
        .map((x) => x.address?.toLowerCase() ?? "").filter(Boolean),
      objet: demojibake(env?.subject || "") || "(sans objet)",
      date: env?.date ? new Date(env.date).toISOString() : new Date().toISOString(),
      extrait: corps.replace(/\s+/g, " ").slice(0, 160),
      lu: true,
      repondu: flags.has("\\Answered"),
      drapeau: flags.has("\\Flagged"),
      pj: piecesDe(tete.bodyStructure).length,
      corps,
      corpsHtml: enHtml,
      pieces: piecesDe(tete.bodyStructure),
      enTetes,
      inReplyTo: enTetes["in-reply-to"]?.trim() || undefined,
      references: (enTetes.references ?? "").split(/\s+/).filter(Boolean),
    };
  });
}

/** Les en-têtes demandés, rendus en minuscules. */
function lireEnTetes(brut?: Buffer): Record<string, string> {
  if (!brut) return {};
  const out: Record<string, string> = {};
  let cle = "";
  for (const ligne of brut.toString("utf8").split(/\r?\n/)) {
    if (/^\s/.test(ligne) && cle) { out[cle] += ` ${ligne.trim()}`; continue; }
    const i = ligne.indexOf(":");
    if (i < 0) { cle = ""; continue; }
    cle = ligne.slice(0, i).toLowerCase();
    out[cle] = ligne.slice(i + 1).trim();
  }
  return out;
}

/** Les pièces jointes déclarées, lues dans la structure — sans les tirer. */
export type PieceJointe = { nom: string; type: string; taille: number; part: string };

function piecesDe(s: unknown): PieceJointe[] {
  if (!s || typeof s !== "object") return [];
  const n = s as Noeud & {
    disposition?: string;
    dispositionParameters?: { filename?: string };
    parameters?: { name?: string; charset?: string };
    size?: number;
  };
  const enfants = (n.childNodes ?? []).flatMap(piecesDe);
  if (n.disposition !== "attachment") return enfants;
  return [
    {
      nom: n.dispositionParameters?.filename || n.parameters?.name || "pièce jointe",
      type: n.type ?? "application/octet-stream",
      taille: n.size ?? 0,
      part: n.part || "1",
    },
    ...enfants,
  ];
}

/**
 * Une pièce jointe, telle quelle (retour #480 : « je ne peux pas télécharger
 * ni lire les PJ »). On ne descend que la partie demandée, jamais le message
 * entier, et on s'arrête à 25 Mo.
 */
export async function telechargerPiece(
  b: Boite, role: RoleDossier, uid: number, part: string,
): Promise<{ nom: string; type: string; contenu: Buffer } | null> {
  return avec(b, async (c) => {
    const ch = (await chemin(c, role, b.dossiers)) ?? "INBOX";
    await c.mailboxOpen(ch, { readOnly: true });
    const d = await c.download(String(uid), part, { uid: true, maxBytes: 25 * 1024 * 1024 });
    if (!d?.content) return null;
    const morceaux: Buffer[] = [];
    for await (const m of d.content) morceaux.push(Buffer.isBuffer(m) ? m : Buffer.from(m));
    return {
      nom: d.meta?.filename || "pièce jointe",
      type: d.meta?.contentType || "application/octet-stream",
      contenu: Buffer.concat(morceaux),
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
  /** Retour #479 : pas de copie dans « Envoyés » (commercialisation, relances,
   *  salves) — seule la correspondance y a sa place. */
  sansCopie?: boolean;
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
  const options = {
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
  };
  const info = await t.sendMail(options);

  /* La copie dans « Envoyés » se fait au mieux : si elle échoue, le message
     est parti quand même et on ne va pas le renvoyer pour autant.

     Retour #475 : la copie est LE message, tel qu'il est parti — même
     identifiant, pièces jointes comprises, lignes terminées en CRLF. L'ancienne
     copie était refabriquée à la main, texte seul, avec les sauts de ligne
     bruts de la zone de saisie ; Exchange refuse un APPEND mal formé, et la
     fenêtre n'affichait le refus qu'une fraction de seconde. */
  let copie = false;
  let copieErreur: string | undefined;
  if (m.sansCopie) return { messageId: String(info.messageId ?? ""), copieDansEnvoyes: undefined, copieErreur };
  try {
    const brut = await composerMessage({ ...options, messageId: String(info.messageId ?? m.messageId ?? "") });
    await avec(b, async (c) => {
      const ch = await chemin(c, "envoyes", b.dossiers);
      if (!ch) throw new Error("aucun dossier « Envoyés » chez ce fournisseur");
      try {
        await c.append(ch, brut, ["\\Seen"]);
      } catch (e) {
        /* Le nom mémorisé peut être périmé (dossier renommé, boîte migrée) :
           on redemande la liste au serveur et on retente une fois sur le
           dossier qu'il marque lui-même \Sent. */
        const liste = await c.list();
        const vrai = liste.find((d) => roleDe(d) === "envoyes")?.path;
        if (!vrai || vrai === ch) throw e;
        await c.append(vrai, brut, ["\\Seen"]);
      }
      copie = true;
    });
  } catch (e) {
    copieErreur = messageClair(e);
    console.error(`[mails] copie dans « Envoyés » impossible pour ${b.adresse} :`, copieErreur);
  }

  return { messageId: String(info.messageId ?? ""), copieDansEnvoyes: copie, copieErreur };
}

/** Le message complet au format RFC 822, prêt à être déposé tel quel. */
async function composerMessage(options: nodemailer.SendMailOptions): Promise<Buffer> {
  const { default: MailComposer } = await import("nodemailer/lib/mail-composer");
  /* `newline` est lu par le composeur mais absent de ses types. */
  return new MailComposer({ ...options, newline: "\r\n" } as nodemailer.SendMailOptions).compile().build();
}

/** Marque un message comme répondu — le petit chevron des clients mail. */
export async function marquerRepondu(b: Boite, role: RoleDossier, uid: number) {
  await avec(b, async (c) => {
    const ch = (await chemin(c, role, b.dossiers)) ?? "INBOX";
    await c.mailboxOpen(ch);
    await c.messageFlagsAdd(String(uid), ["\\Answered"], { uid: true });
  }).catch(() => undefined);
}
