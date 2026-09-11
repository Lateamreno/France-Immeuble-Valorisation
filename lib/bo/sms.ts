// Envoi de SMS par Twilio — la partie qui parle au réseau.
//
// Même doctrine que le reste du BO (§7.1) : L'APPLICATION PRÉPARE, L'AGENT
// ENVOIE. Rien ne part sans un clic humain. Il n'y a donc pas de file d'attente
// ni d'envoi différé ici : une fonction, appelée depuis un bouton.
//
// Tant que les identifiants Twilio ne sont pas renseignés, tout fonctionne en
// SIMULATION : le message est composé, les numéros sont normalisés et comptés,
// le coût est estimé — et rien ne part. C'est ce qui permet de recetter la
// chaîne entière avant le premier envoi réel.

/** Le compte Twilio, lu de l'environnement. Jamais dans le dépôt. */
const SID = process.env.TWILIO_ACCOUNT_SID;
const JETON = process.env.TWILIO_AUTH_TOKEN;
/* L'expéditeur : soit un numéro Twilio (`+33…`), soit un Messaging Service
   (`MG…`), soit un nom d'expéditeur alphanumérique. Les trois se règlent au
   même endroit — c'est Twilio qui reconnaît la forme. */
const DE = process.env.TWILIO_FROM;

/**
 * Le plafond d'un envoi, garde-fou volontaire.
 *
 * Une erreur de ciblage se paie deux fois : en euros, et en réputation auprès
 * d'opérateurs qui n'oublient pas. Au-delà, il faut passer en plusieurs fois —
 * ce qui oblige à regarder le compteur entre deux.
 */
export const PLAFOND_SMS = Number(process.env.TWILIO_PLAFOND ?? 250);

/** Segments d'un SMS : 160 caractères en GSM-7, 70 dès qu'un caractère sort
 *  de l'alphabet GSM (un emoji, une espace insécable, certains accents). */
export function segments(texte: string): number {
  if (!texte) return 0;
  // Détection volontairement prudente : au moindre doute on compte en UCS-2,
  // c'est-à-dire au pire. Annoncer un coût sous-estimé serait pire que rien.
  const gsm = /^[A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r^{}\\[~\]|€]*$/.test(texte);
  const parSegment = gsm ? 160 : 70;
  const parSegmentLong = gsm ? 153 : 67;
  return texte.length <= parSegment ? 1 : Math.ceil(texte.length / parSegmentLong);
}

export type EtatSms = {
  configure: boolean;
  /** D'où vient l'expéditeur : sert à retrouver une variable mal nommée. */
  expediteur?: string;
  message: string;
};

/** Le pont Twilio est-il branché, ou tourne-t-on à blanc ? */
export function etatSms(): EtatSms {
  if (!SID || !JETON) {
    return {
      configure: false,
      message:
        "Mode simulation : TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN ne sont pas renseignés. " +
        "Le message et les numéros sont préparés et vérifiables, rien ne part.",
    };
  }
  if (!DE) {
    return {
      configure: false,
      message:
        "Compte Twilio reconnu, mais TWILIO_FROM est vide : il faut le numéro émetteur, " +
        "le Messaging Service (MG…) ou le nom d'expéditeur.",
    };
  }
  return { configure: true, expediteur: DE, message: `Prêt à envoyer depuis ${DE}.` };
}

export type ResultatSms = {
  envoyes: number;
  echecs: { numero: string; raison: string }[];
  /** Segments facturés, tous destinataires confondus. */
  segments: number;
  simulation: boolean;
};

/**
 * Envoie le même message à une liste de numéros DÉJÀ NORMALISÉS en E.164.
 *
 * Twilio n'a pas d'envoi en lot sur cette API : c'est un appel par
 * destinataire. On les enchaîne donc par petits paquets plutôt que tous à la
 * fois — une rafale de connexions se fait limiter aussi sûrement qu'un volume
 * excessif, exactement comme sur la route e-mail de masse.
 *
 * Un échec sur un numéro n'arrête pas les autres : il est collecté et rendu.
 * Interrompre la boucle laisserait la moitié d'une salve partie sans qu'on
 * sache laquelle.
 */
export async function envoyerSms(
  numeros: string[],
  texte: string,
): Promise<ResultatSms> {
  const seg = segments(texte);
  const uniques = [...new Set(numeros.filter((n) => /^\+\d{8,15}$/.test(n)))];

  const etat = etatSms();
  if (!etat.configure) {
    return { envoyes: 0, echecs: [], segments: seg * uniques.length, simulation: true };
  }
  if (uniques.length > PLAFOND_SMS) {
    throw new Error(
      `${uniques.length} numéros pour un plafond de ${PLAFOND_SMS} : découpez l'envoi. ` +
      "Une erreur de ciblage se paie en euros et en réputation.",
    );
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`;
  const auth = "Basic " + Buffer.from(`${SID}:${JETON}`).toString("base64");
  const echecs: { numero: string; raison: string }[] = [];
  let envoyes = 0;

  const paquets: string[][] = [];
  for (let i = 0; i < uniques.length; i += 5) paquets.push(uniques.slice(i, i + 5));

  for (const paquet of paquets) {
    await Promise.all(
      paquet.map(async (numero) => {
        const corps = new URLSearchParams({ To: numero, Body: texte });
        // `From` accepte un numéro ou un nom ; un Messaging Service passe par
        // `MessagingServiceSid`, que Twilio attend sous un autre nom de champ.
        if (DE!.startsWith("MG")) corps.set("MessagingServiceSid", DE!);
        else corps.set("From", DE!);
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
            body: corps,
            cache: "no-store",
          });
          if (!res.ok) {
            const t = await res.text();
            let raison = `HTTP ${res.status}`;
            try {
              const j = JSON.parse(t) as { message?: string; code?: number };
              if (j.message) raison = `${j.message}${j.code ? ` (${j.code})` : ""}`;
            } catch { /* corps illisible : le code HTTP suffit */ }
            echecs.push({ numero, raison });
            return;
          }
          envoyes++;
        } catch (e) {
          echecs.push({ numero, raison: e instanceof Error ? e.message : String(e) });
        }
      }),
    );
  }

  return { envoyes, echecs, segments: seg * envoyes, simulation: false };
}
