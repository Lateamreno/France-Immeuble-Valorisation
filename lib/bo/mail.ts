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
  attachments?: PieceJointe[];
}) {
  const c = CONF();
  if (!mailConfigure()) throw new Error("Envoi non configuré (SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM)");

  const t = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    // 465 = TLS implicite, 587 = STARTTLS : les deux routes possibles.
    secure: c.port === 465,
    auth: { user: c.user!, pass: c.pass! },
  });

  const vers = REDIRECT();
  const info = await t.sendMail({
    from: m.from || c.from,
    to: vers || m.to,
    cc: vers ? undefined : m.cc || undefined,
    // En redirection, pas de copie cachée : tout arrive déjà au même endroit.
    bcc: vers ? undefined : m.bcc || undefined,
    replyTo: m.replyTo || undefined,
    subject: vers ? `[ESSAI → ${m.to}] ${m.subject}` : m.subject,
    text: vers
      ? `— Envoi de recette. Destinataire réel : ${m.to}${m.cc ? ` · copie : ${m.cc}` : ""}${m.bcc ? ` · copie cachée : ${m.bcc}` : ""} —\n\n${m.text}`
      : m.text,
    attachments: m.attachments,
  });
  return String(info.messageId ?? "");
}
