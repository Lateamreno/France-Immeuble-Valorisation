// Envoi d'e-mails depuis l'app (estimation au propriétaire, avec le dossier
// PDF en pièce jointe).
//
// SMTP volontairement, pas d'API propriétaire : la même implémentation marche
// avec la boîte OVH de France Immeuble (ssl0.ovh.net) comme avec SendGrid
// (smtp.sendgrid.net, identifiant « apikey »). Changer de route se fait par
// variables d'environnement, sans retoucher le code.
//
// Délivrabilité — ce qui compte pour ne pas tomber en spam :
//   • on écrit TOUJOURS depuis une adresse du domaine, jamais depuis
//     l'adresse du destinataire ni celle d'un tiers ;
//   • l'estimation part de l'adresse de l'agent qui l'a faite — c'est une
//     adresse du domaine, donc la signature reste alignée, et le propriétaire
//     répond naturellement à son interlocuteur ;
//   • le domaine doit publier SPF (autorisant la route choisie), DKIM et
//     DMARC — voir README-mail.md.
import nodemailer from "nodemailer";

export type PieceJointe = { filename: string; content: Buffer; contentType?: string };

/** Filet de recette : si MAIL_REDIRECT est posée, TOUT part vers cette
 *  adresse au lieu du vrai destinataire. La preview travaille sur les vraies
 *  données — un essai ne doit pas atterrir chez un propriétaire. */
const REDIRECT = () => process.env.MAIL_REDIRECT?.trim();

const CONF = () => ({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 465),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.MAIL_FROM,
});

/** L'app sait-elle envoyer ? Sinon l'écran reste en préparation manuelle. */
export function mailConfigure() {
  const c = CONF();
  return !!(c.host && c.user && c.pass && c.from);
}

/* ============================ Envoi en masse ============================
 *
 * Une salve ne doit PAS sortir de la boîte personnelle d'un agent, et pas
 * seulement pour lui éviter trois cents lignes dans ses « Envoyés ».
 *
 *  · Les boîtes OVH et Exchange plafonnent le nombre de messages sortants par
 *    heure et par jour. Une salve de mille contacts est coupée en route, quand
 *    elle ne fait pas suspendre le compte.
 *  · Une plainte pour courrier non sollicité abîme la réputation de l'adresse
 *    qui a envoyé. Si c'est l'adresse personnelle de l'agent, ce sont ses
 *    échanges quotidiens qui partent ensuite en indésirables.
 *
 * D'où une seconde route, dédiée : un relais d'envoi — SendGrid en pratique
 * (`smtp.sendgrid.net`, identifiant littéral `apikey`, mot de passe = la clé),
 * mais le code ne présume de rien, c'est du SMTP — avec sa propre adresse
 * d'expédition. Règle ferme : la poser sur un SOUS-DOMAINE dédié
 * (envois.france-immeuble.fr), et pas sur le domaine courant. Une campagne qui
 * tourne mal n'entame alors rien de la messagerie de tous les jours.
 *
 * Ce que l'agent garde malgré tout : la réponse lui revient à LUI, par le
 * Reply-To. */

const MASSE = () => ({
  host: process.env.MASSE_SMTP_HOST,
  port: Number(process.env.MASSE_SMTP_PORT ?? 587),
  user: process.env.MASSE_SMTP_USER,
  pass: process.env.MASSE_SMTP_PASS,
  from: process.env.MASSE_FROM,
  /* Le sous-domaine d'envoi. Posé, chaque agent expédie sous SON adresse —
     r.voci@envois.france-immeuble.fr — au lieu d'une adresse de service
     partagée. Une salve garde ainsi un visage, ce qui compte plus qu'on ne
     croit à l'ouverture.

     Deux choses à ne pas se raconter :
       · ça ne cloisonne PAS la réputation entre agents. Les messageries la
         calculent au niveau du DOMAINE signataire, pas de l'adresse. Le
         cloisonnement qu'on obtient est celui du sous-domaine face au domaine
         de tous les jours — celui-là est réel, et il suffit.
       · l'adresse doit exister pour de bon, en renvoi vers la vraie boîte de
         l'agent. Un client de messagerie qui ignore le Reply-To — il y en a —
         répondrait dans le vide. */
  domaine: process.env.MASSE_DOMAINE?.trim().replace(/^@/, ""),
});

/** La route d'envoi en masse est-elle branchée ? */
export function masseConfiguree() {
  const c = MASSE();
  return !!(c.host && c.user && c.pass && (c.from || c.domaine));
}

/**
 * L'expéditeur affiché d'une salve.
 *
 * Avec `MASSE_DOMAINE`, l'adresse est celle de l'agent portée sur le
 * sous-domaine d'envoi : on reprend la partie locale de sa vraie adresse
 * (`r.voci`), pour que la convention maison n'ait pas deux orthographes.
 * Sans elle, on retombe sur l'adresse de service `MASSE_FROM`.
 *
 * Le nom affiché fait l'essentiel du travail : c'est lui que presque tous les
 * clients de messagerie montrent, l'adresse ne venant qu'après.
 */
export function expediteurDe(agent?: { nom?: string; email?: string }) {
  const c = MASSE();
  if (!c.domaine) return c.from ?? "";
  const local = (agent?.email ?? "").split("@")[0].trim().toLowerCase();
  if (!local) return c.from ?? "";
  const nom = (agent?.nom ?? "").trim();
  const adresse = `${local}@${c.domaine}`;
  return nom ? `${nom} — France Immeuble <${adresse}>` : adresse;
}

/**
 * Le transport de la salve, RÉUTILISÉ d'un message à l'autre.
 *
 * Il était fabriqué à chaque message : deux cents destinataires, c'était deux
 * cents connexions SMTP ouvertes et refermées, chacune avec sa poignée de main
 * TLS. Lent — de l'ordre d'une seconde par message avant même d'écrire quoi que
 * ce soit — et mal vu des relais, qui comptent les connexions autant que les
 * messages.
 *
 * `pool` garde la connexion ouverte ; `maxConnections: 1` et `rateDelta/
 * rateLimit` tiennent une cadence régulière plutôt qu'une rafale, ce que les
 * grandes messageries préfèrent nettement. `maxMessages` renouvelle la
 * connexion de temps en temps, parce que beaucoup de relais la coupent
 * d'eux-mêmes au bout d'un certain nombre d'envois.
 */
let poolMasse: nodemailer.Transporter | null = null;
let poolCle = "";

function transportMasse() {
  const c = MASSE();
  const cle = `${c.host}:${c.port}:${c.user}`;
  if (poolMasse && poolCle === cle) return poolMasse;
  poolMasse?.close();
  poolCle = cle;
  poolMasse = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    requireTLS: c.port !== 465,
    auth: { user: c.user!, pass: c.pass! },
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    rateDelta: 1000,
    rateLimit: 4,
  });
  return poolMasse;
}

/** L'adresse d'expédition des salves, pour l'afficher avant d'envoyer. */
export function expediteurMasse(agent?: { nom?: string; email?: string }) {
  return expediteurDe(agent);
}

/**
 * Un message de salve, par le relais dédié.
 *
 * `List-Unsubscribe` n'est pas une politesse : sans lui, les grandes
 * messageries considèrent un envoi groupé comme suspect, et le bouton
 * « désabonnement » de leur interface devient « signaler comme spam » — ce qui
 * coûte infiniment plus cher.
 */
export async function envoyerEnMasse(m: {
  to: string;
  subject: string;
  text: string;
  /** L'agent : c'est à lui que la réponse doit revenir. */
  replyTo?: string;
  /** Et c'est sous son nom que le message part, si le sous-domaine est posé. */
  agent?: { nom?: string; email?: string };
}) {
  const c = MASSE();
  if (!masseConfiguree()) {
    throw new Error(
      "Route d'envoi en masse non configurée (MASSE_SMTP_HOST / MASSE_SMTP_USER / MASSE_SMTP_PASS, "
      + "puis MASSE_DOMAINE ou MASSE_FROM).",
    );
  }
  const expediteur = expediteurDe(m.agent) || c.from;
  const t = transportMasse();

  const vers = REDIRECT();
  const desabo = m.replyTo ?? expediteur;
  const info = await t.sendMail({
    from: expediteur,
    to: vers || m.to,
    replyTo: m.replyTo || undefined,
    subject: vers ? `[ESSAI → ${m.to}] ${m.subject}` : m.subject,
    text: vers ? `— Envoi de recette. Destinataire réel : ${m.to} —\n\n${m.text}` : m.text,
    headers: desabo
      ? {
        "List-Unsubscribe": `<mailto:${String(desabo).replace(/.*<|>.*/g, "")}?subject=Desabonnement>`,
        /* Dit aux messageries que le désabonnement est traité sans que le
           destinataire ait à écrire quoi que ce soit d'autre. */
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
      : undefined,
  });
  return String(info.messageId ?? "");
}

/** Domaine d'envoi, pour fabriquer les identifiants de message. */
export function domaineEnvoi() {
  const from = CONF().from ?? "";
  return from.split("@")[1]?.replace(/[>\s]/g, "") || "france-immeuble.fr";
}

export async function envoyerMail(m: {
  to: string;
  subject: string;
  text: string;
  /** Expéditeur affiché. Doit rester sur le domaine authentifié, sinon la
   *  signature ne s'aligne plus et le message part en spam. */
  from?: string;
  replyTo?: string;
  cc?: string;
  bcc?: string;
  /** Copie cachée demandée par l'agent, en plus de la sienne. */
  bccSup?: string;
  /** Identifiant de message imposé — il porte le jeton de rattachement, que
   *  toute réponse renverra dans `In-Reply-To`. Voir lib/bo/rattachement.ts. */
  messageId?: string;
  attachments?: PieceJointe[];
}) {
  const c = CONF();
  if (!mailConfigure()) throw new Error("Envoi non configuré (SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM)");

  const t = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    // 465 = TLS implicite, 587 = STARTTLS : les deux routes possibles.
    secure: c.port === 465,
    /* En 587, exiger STARTTLS : sans ça, un serveur qui ne l'annonce pas
       laisserait partir identifiants et message en clair. */
    requireTLS: c.port !== 465,
    auth: { user: c.user!, pass: c.pass! },
  });

  const vers = REDIRECT();
  const info = await t.sendMail({
    from: m.from || c.from,
    to: vers || m.to,
    cc: vers ? undefined : m.cc || undefined,
    // En redirection, pas de copie cachée : tout arrive déjà au même endroit.
    bcc: vers ? undefined : [m.bcc, m.bccSup].filter(Boolean).join(", ") || undefined,
    replyTo: m.replyTo || undefined,
    messageId: m.messageId,
    subject: vers ? `[ESSAI → ${m.to}] ${m.subject}` : m.subject,
    text: vers
      ? `— Envoi de recette. Destinataire réel : ${m.to}${m.cc ? ` · copie : ${m.cc}` : ""}${m.bcc ? ` · copie cachée : ${m.bcc}` : ""} —\n\n${m.text}`
      : m.text,
    attachments: m.attachments,
  });
  return String(info.messageId ?? "");
}

/* ================= Envoi depuis la boîte de l'agent =================
 *
 * Doctrine de MAV : chaque agent a sa propre boîte, branchée dans le BO. Un
 * message envoyé par l'application doit donc partir de SA boîte — l'adresse
 * que le destinataire connaît, et où il retrouvera sa copie dans « Envoyés ».
 *
 * La route SMTP commune ci-dessus reste en secours : elle sert tant qu'aucune
 * boîte n'est branchée. Concrètement, il n'y a rien de plus à poser en
 * variables d'environnement — l'agent renseigne sa boîte dans l'écran, et
 * l'envoi suit. */

/** La boîte d'un agent, ou `null` s'il n'en a pas branché. */
async function boiteAgent(agentId?: string) {
  if (!agentId) return null;
  const [{ getAgents }, { boiteDe }] = await Promise.all([
    import("@/lib/bubble/server"),
    import("@/lib/mails/boites"),
  ]);
  const agents = await getAgents().catch(() => []);
  return await boiteDe(agentId, agents).catch(() => null);
}

/** Y a-t-il une façon d'envoyer : une boîte d'agent, ou la route commune ? */
export async function envoiPossible(agentId?: string): Promise<boolean> {
  if (mailConfigure()) return true;
  if (agentId) return !!(await boiteAgent(agentId));
  const [{ getAgents }, { toutesLesBoites }] = await Promise.all([
    import("@/lib/bubble/server"),
    import("@/lib/mails/boites"),
  ]);
  const agents = await getAgents().catch(() => []);
  return (await toutesLesBoites(agents).catch(() => [])).length > 0;
}

/**
 * Envoie pour le compte d'un agent : sa boîte d'abord, la route commune sinon.
 *
 * `messageIdPour` reçoit le domaine réellement utilisé — c'est lui qui porte le
 * jeton de rattachement, et il doit correspondre à l'expéditeur, sinon
 * certaines messageries réécrivent l'identifiant et la réponse ne se rattache
 * plus à rien.
 */
export async function envoyerPourAgent(
  agentId: string | undefined,
  m: {
    to: string;
    subject: string;
    text: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    attachments?: PieceJointe[];
    messageIdPour?: (domaine: string) => string;
    /** Expéditeur affiché — n'a de sens que sur la route commune. */
    from?: string;
    /** Copie cachée à n'ajouter QUE sur la route commune : quand le message
     *  part de la boîte de l'agent, il l'a déjà dans ses « Envoyés ». */
    bccSiCommun?: string;
  },
): Promise<{
  messageId: string;
  expediteur: string;
  via: "boite" | "smtp";
  /** Faux quand le message est parti mais n'a pas pu être copié dans
   *  « Envoyés » : c'est exactement le cas où l'agent ne le retrouve nulle
   *  part et croit que l'envoi a échoué. */
  copieDansEnvoyes?: boolean;
}> {
  const b = await boiteAgent(agentId);
  if (b) {
    const { envoyerDepuis } = await import("@/lib/mails/client");
    const domaine = b.adresse.split("@")[1] ?? domaineEnvoi();
    const r = await envoyerDepuis(b, {
      to: m.to,
      cc: m.cc,
      cci: m.bcc,
      objet: m.subject,
      texte: m.text,
      messageId: m.messageIdPour?.(domaine),
      pieces: m.attachments,
    });
    return {
      messageId: r.messageId, expediteur: b.adresse, via: "boite",
      copieDansEnvoyes: r.copieDansEnvoyes,
    };
  }

  if (!mailConfigure()) {
    throw new Error(
      "Aucune boîte e-mail branchée pour cet agent, et pas de route d'envoi commune. "
      + "Branchez la boîte dans Mails → Ma boîte e-mail.",
    );
  }
  const messageId = await envoyerMail({
    to: m.to,
    subject: m.subject,
    text: m.text,
    cc: m.cc,
    bcc: [m.bcc, m.bccSiCommun].filter(Boolean).join(", ") || undefined,
    from: m.from,
    replyTo: m.replyTo,
    attachments: m.attachments,
    messageId: m.messageIdPour?.(domaineEnvoi()),
  });
  return { messageId, expediteur: CONF().from ?? "", via: "smtp" };
}
