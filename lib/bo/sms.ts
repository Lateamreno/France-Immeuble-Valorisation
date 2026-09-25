// Envoi de SMS par MailingVox — la partie qui parle au réseau.
//
// Twilio a servi de premier pont ; MAV a MailingVox, et pour de la France
// métropolitaine c'est le bon choix : le STOP opérateur, les horaires légaux
// et le prix au SMS y sont traités nativement. Twilio ne laisse rien derrière
// lui — tout le pont tenait dans ce fichier.
//
// Même doctrine que le reste du BO (§7.1) : L'APPLICATION PRÉPARE, L'AGENT
// ENVOIE. Rien ne part sans un clic humain. Une DATE peut être posée — MAV :
// « ce que je veux faire c'est une programmation » — mais elle est choisie
// dans le même geste que la validation : la machine attend, elle ne décide pas.
//
// Tant que la clé n'est pas renseignée, tout fonctionne en SIMULATION : le
// message est composé, les numéros sont normalisés et comptés, le coût est
// estimé — et rien ne part.

/** La clé API MailingVox, lue de l'environnement. Jamais dans le dépôt. */
const CLE = process.env.MAILINGVOX_KEY;

/* L'expéditeur affiché.
   
   MAV le laisse VIDE, et il a deux bonnes raisons : « si on met un nom les
   clients peuvent pas répondre », et « France Immeuble passe pas en
   caractères » — onze places, ni espace ni accent, ça donnerait FRANCEIMMO.
   Vide, le destinataire voit un numéro court à cinq chiffres AUQUEL IL PEUT
   RÉPONDRE, et la réponse revient dans `/api/responses`. Sur un message de
   prospection où l'on attend un retour, ça vaut mieux qu'un joli sigle muet.
   
   La signature se fait donc dans le TEXTE : « France Immeuble, … » en tête,
   parce que c'est le début du message que la liste de conversations affiche
   en aperçu. Voir `smsParDefaut` dans l'assistant.
   
   La variable reste lisible pour qui voudrait un nom d'expéditeur un jour —
   les règles MailingVox sont vérifiées par `expediteurValide`. */
const DE = process.env.MAILINGVOX_EXPEDITEUR;

const BASE = "https://v3.mailingvox.com/api";

/**
 * Le numéro de désinscription imprimé dans le message.
 *
 * À TRANCHER AVEC MAILINGVOX. Le BO écrivait « STOP au 36111 » ; la
 * documentation MailingVox cite le 36200. Si leur plateforme route les STOP
 * vers un numéro et que le message en annonce un autre, les désinscriptions
 * ne leur reviennent pas — et on continue d'écrire à des gens qui ont dit non.
 * D'où la variable : la réponse se pose sans toucher au code.
 */
export const NUMERO_STOP = process.env.MAILINGVOX_STOP ?? "36200";

/**
 * Le plafond d'un envoi, garde-fou volontaire.
 *
 * Une erreur de ciblage se paie deux fois : en euros, et en réputation auprès
 * d'opérateurs qui n'oublient pas. Au-delà, il faut passer en plusieurs fois —
 * ce qui oblige à regarder le compteur entre deux.
 */
export const PLAFOND_SMS = Number(process.env.MAILINGVOX_PLAFOND ?? 250);

/* Les caractères de l'alphabet GSM-7 qui occupent DEUX places : ils passent
   par une séquence d'échappement. MailingVox le dit explicitement — « les
   caractères |, ^, €, }, {, [, ~, ] et \ comptent doubles ». Les ignorer
   sous-estime le nombre de segments, donc la facture. */
const GSM_DOUBLES = new Set(["|", "^", "€", "}", "{", "[", "~", "]", "\\"]);

const GSM_SIMPLE =
  /^[A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r^{}\\[~\]|€]*$/;

/**
 * La longueur FACTURÉE d'un message : les caractères étendus comptent double.
 *
 * Séparée de `segments` pour être testable seule — c'est le calcul qui se
 * trompe silencieusement, et une erreur ici ne se voit que sur la facture.
 */
export function longueurFacturee(texte: string): number {
  let n = 0;
  for (const c of texte) n += GSM_DOUBLES.has(c) ? 2 : 1;
  return n;
}

/** Segments d'un SMS : 160 caractères en GSM-7, 70 dès qu'un caractère sort
 *  de l'alphabet GSM (un emoji, une espace insécable, certains accents).
 *  Au-delà d'un segment, MailingVox facture tous les 153 caractères. */
export function segments(texte: string): number {
  if (!texte) return 0;
  // Détection volontairement prudente : au moindre doute on compte en UCS-2,
  // c'est-à-dire au pire. Annoncer un coût sous-estimé serait pire que rien.
  const gsm = GSM_SIMPLE.test(texte);
  const taille = gsm ? longueurFacturee(texte) : texte.length;
  const parSegment = gsm ? 160 : 70;
  const parSegmentLong = gsm ? 153 : 67;
  if (taille <= parSegment) return 1;
  // Neuf segments concaténés au maximum côté MailingVox.
  return Math.min(9, Math.ceil(taille / parSegmentLong));
}

/**
 * Le message porte-t-il sa mention de désinscription ?
 *
 * MailingVox rejette la campagne sans elle (erreurs 24 et 38), et la CNIL
 * l'impose. Mieux vaut le dire dans le BO, avant le clic, que de récupérer un
 * code d'erreur après.
 */
export const mentionStop = (texte: string) => /\bstop\b/i.test(texte);

/**
 * Un nom d'expéditeur acceptable ?
 *
 * Règles MailingVox : 11 caractères maximum, 3 minimum pour être personnalisé,
 * lettres et chiffres uniquement, et pas plus de trois chiffres consécutifs
 * avant la première lettre.
 */
export function expediteurValide(nom: string): { ok: boolean; raison?: string } {
  if (!/^[A-Za-z0-9]+$/.test(nom)) {
    return { ok: false, raison: "lettres et chiffres uniquement — ni espace, ni accent, ni tiret" };
  }
  if (nom.length < 3) return { ok: false, raison: "trois caractères au minimum" };
  if (nom.length > 11) return { ok: false, raison: "onze caractères au maximum" };
  if (/^\d{4}/.test(nom)) return { ok: false, raison: "pas plus de trois chiffres avant la première lettre" };
  return { ok: true };
}

export type EtatSms = {
  configure: boolean;
  /** D'où vient l'expéditeur : sert à retrouver une variable mal nommée. */
  expediteur?: string;
  message: string;
};

/** Le pont MailingVox est-il branché, ou tourne-t-on à blanc ? */
export function etatSms(): EtatSms {
  if (!CLE) {
    return {
      configure: false,
      message:
        "Mode simulation : MAILINGVOX_KEY n'est pas renseignée. " +
        "Le message et les numéros sont préparés et vérifiables, rien ne part.",
    };
  }
  if (DE) {
    const v = expediteurValide(DE);
    if (!v.ok) {
      return {
        configure: false,
        message: `MAILINGVOX_EXPEDITEUR « ${DE} » est refusé : ${v.raison}.`,
      };
    }
    return { configure: true, expediteur: DE, message: `Prêt à envoyer depuis ${DE}.` };
  }
  /* Sans expéditeur, MailingVox met un numéro court à cinq chiffres — et le
     destinataire peut RÉPONDRE. C'est le choix de MAV, pas un oubli de
     configuration : l'écran ne doit donc surtout pas le présenter comme un
     défaut à corriger. */
  return {
    configure: true,
    message:
      "Prêt à envoyer depuis un numéro court à cinq chiffres — vos destinataires " +
      "peuvent répondre, et la réponse revient dans MailingVox. La signature se fait " +
      "en tête de message.",
  };
}

/** Les codes d'erreur MailingVox, en français lisible par un agent. */
const ERREURS: Record<string, string> = {
  "1": "type de message non spécifié ou incorrect",
  "2": "le message est vide",
  "3": "le message dépasse 160 caractères (70 en unicode) sans l'option SMS long",
  "4": "aucun destinataire valide",
  "6": "numéro de destinataire invalide",
  "7": "le compte MailingVox n'a pas de formule définie",
  "8": "l'expéditeur dépasse 11 caractères",
  "9": "erreur interne MailingVox — les contacter",
  "10": "crédits SMS insuffisants pour cet envoi",
  "11": "les envois sont désactivés sur un compte de démonstration",
  "12": "le compte MailingVox est suspendu",
  "13": "limite d'envoi paramétrée atteinte",
  "14": "limite d'envoi paramétrée atteinte",
  "15": "limite d'envoi paramétrée atteinte",
  "16": "le nombre de segments annoncé ne correspond pas au message",
  "17": "l'expéditeur n'est pas autorisé sur ce compte",
  "21": "jeton invalide",
  "23": "aucune date variable valide dans la liste de destinataires",
  "24": "mention « STOP » absente du message — obligation CNIL",
  "30": "clé API non reconnue (MAILINGVOX_KEY)",
  "31": "un lien du message est invalide",
  "36": "les emojis ne sont pas acceptés",
  "38": "mention « STOP » absente du message",
  "45": "ce produit n'est pas activé sur le compte",
  "50": "fuseau horaire invalide",
  "51": "la date est déjà passée après conversion du fuseau",
  "55": "contenu à faire valider par le service client MailingVox",
  "61": "un LIEN a été détecté dans le message : MailingVox demande une validation par son service client",
  "62": "limite d'envoi atteinte",
  "63": "limite de requêtes API dépassée",
  "65": "maintenance en cours sur ce créneau",
  "66": "campagne bloquée préventivement : trop proche d'une campagne déjà envoyée",
  "71": "envois indisponibles — incident en cours chez MailingVox",
  "99": "maintenance prévue sur ce créneau",
  /* Vu le 25/09 sur le premier essai (HTTP 403, erreurs 100) : le compte
     MailingVox n'accepte les appels que depuis des adresses IP déclarées, et
     Vercel n'a pas d'adresse fixe. La restriction se lève dans MailingVox,
     pas dans le code. */
  "100": "adresse IP non autorisée — dans MailingVox, Mon compte › API, retirer la restriction "
    + "d'adresses IP (le back-office tourne sur Vercel, qui n'a pas d'adresse fixe)",
};

const direErreurs = (brut: unknown): string =>
  String(brut ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => ERREURS[c] ?? `erreur ${c}`)
    .join(" · ") || "refus sans code d'erreur";

export type ResultatSms = {
  envoyes: number;
  echecs: { numero: string; raison: string }[];
  /** Segments facturés, tous destinataires confondus. */
  segments: number;
  simulation: boolean;
  /** Identifiant de campagne MailingVox : sert à relire les accusés. */
  campagne?: string;
  /** Renseigné quand l'envoi est PROGRAMMÉ et non immédiat. */
  programmePour?: string;
};

export type OptionsSms = {
  /** Date d'envoi. Absente ou passée : MailingVox envoie tout de suite. */
  quand?: Date;
  /** Nom de campagne, invisible des destinataires. 50 caractères. */
  nom?: string;
  /** URL de réception des accusés pour CET envoi. */
  urlAccuses?: string;
};

/**
 * Envoie le même message à une liste de numéros DÉJÀ NORMALISÉS en E.164.
 *
 * MailingVox prend toute la liste en UN appel — contrairement à Twilio, qui
 * demandait un appel par destinataire. C'est une campagne, pas deux cents
 * messages : l'identifiant rendu sert ensuite à relire les accusés.
 *
 * Conséquence à connaître : l'API ne dit pas QUEL numéro a été refusé, elle
 * rend un code pour la campagne entière. Le détail par destinataire se lit
 * après coup dans les accusés de réception (`/api/dlr`).
 */
export async function envoyerSms(
  numeros: string[],
  texte: string,
  options: OptionsSms = {},
): Promise<ResultatSms> {
  const seg = segments(texte);
  const uniques = [...new Set(numeros.filter((n) => /^\+\d{8,15}$/.test(n)))];

  const etat = etatSms();
  if (!etat.configure) {
    return { envoyes: 0, echecs: [], segments: seg * uniques.length, simulation: true };
  }
  if (uniques.length === 0) {
    throw new Error("Aucun numéro valide : rien à envoyer.");
  }
  if (uniques.length > PLAFOND_SMS) {
    throw new Error(
      `${uniques.length} numéros pour un plafond de ${PLAFOND_SMS} : découpez l'envoi. ` +
      "Une erreur de ciblage se paie en euros et en réputation.",
    );
  }
  /* Le refus viendrait de MailingVox (erreurs 24 et 38) après coup, une fois
     le clic donné. Autant le dire avant. */
  if (!mentionStop(texte)) {
    throw new Error(
      `Le message doit porter une mention de désinscription — « STOP au ${NUMERO_STOP} ». ` +
      "C'est une obligation CNIL, et MailingVox refuse la campagne sans elle.",
    );
  }

  const corps = new URLSearchParams({
    key: CLE!,
    message: texte,
    destinataires: uniques.join(","),
    erreur_texte: "1",
  });
  if (DE) corps.set("expediteur", DE);
  if (options.nom) corps.set("nom", options.nom.slice(0, 50));
  if (options.urlAccuses) corps.set("url", options.urlAccuses);
  /* Au-delà d'un segment il faut le dire, sinon l'erreur 3 tombe. `smslongnbr`
     fait vérifier notre compte par MailingVox : si nos deux calculs divergent,
     le message est REJETÉ plutôt qu'envoyé à un prix qu'on n'attendait pas. */
  if (seg > 1) {
    corps.set("smslong", "1");
    corps.set("smslongnbr", String(seg));
  }
  if (options.quand && options.quand.getTime() > Date.now()) {
    corps.set("date", String(Math.floor(options.quand.getTime() / 1000)));
    corps.set("timezone", "Europe/Paris");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/envoyer/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corps,
      cache: "no-store",
    });
  } catch (e) {
    throw new Error(`MailingVox injoignable : ${e instanceof Error ? e.message : String(e)}`);
  }

  const brut = await res.text();

  /* Retour #433 (25/09, premier essai) : MailingVox répond HTTP 403 avec un
     corps JSON tout à fait lisible (`{"resultat":0,"erreurs":100}`), et
     l'écran affichait le JSON brut. On lit le corps AVANT de regarder le code
     HTTP : c'est lui qui dit pourquoi. */
  type Reponse = { resultat?: unknown; id?: unknown; erreurs?: unknown; erreur_texte?: unknown };
  const lire = (): Reponse | null => {
    try {
      return JSON.parse(brut) as Reponse;
    } catch {
      return null;
    }
  };
  const j = lire();
  if (!j) {
    throw new Error(res.ok
      ? `Réponse MailingVox illisible : ${brut.slice(0, 200)}`
      : `MailingVox HTTP ${res.status} : ${brut.slice(0, 200)}`);
  }

  if (!j.resultat) {
    const texteErreur = typeof j.erreur_texte === "string" && j.erreur_texte ? j.erreur_texte : undefined;
    throw new Error(`MailingVox a refusé la campagne : ${texteErreur ?? direErreurs(j.erreurs)}.`);
  }

  const programme = options.quand && options.quand.getTime() > Date.now()
    ? options.quand.toISOString()
    : undefined;

  return {
    envoyes: uniques.length,
    echecs: [],
    segments: seg * uniques.length,
    simulation: false,
    campagne: j.id === undefined || j.id === null ? undefined : String(j.id),
    programmePour: programme,
  };
}

/**
 * Les numéros qui ont dit STOP, tels que MailingVox les connaît.
 *
 * Sert à ne pas écrire à quelqu'un qui s'est désinscrit auprès d'une campagne
 * précédente — le BO ne voit que ses propres envois, la plateforme voit tout.
 */
export async function stopsMailingvox(): Promise<string[]> {
  if (!CLE) return [];
  const res = await fetch(`${BASE}/stops?key=${encodeURIComponent(CLE)}`, { cache: "no-store" })
    .catch(() => null);
  if (!res?.ok) return [];
  try {
    const lignes = (await res.json()) as unknown[];
    return lignes
      .map((l) => (Array.isArray(l) ? String(l[1] ?? "") : ""))
      .filter((n) => /^\+?\d{8,15}$/.test(n));
  } catch {
    return [];
  }
}

/**
 * Pousse des désinscrits vers la liste noire MailingVox.
 *
 * MAV : « pour les désinscrits on peut les notifier à MailingVox si on a le
 * droit ». On a le droit, et c'est même l'inverse qui poserait problème :
 * MailingVox est SOUS-TRAITANT au sens du RGPD — il traite pour le compte de
 * France Immeuble, sous contrat. Lui transmettre une opposition n'est pas un
 * partage avec un tiers, c'est la seule façon de la faire respecter par
 * l'outil qui envoie. Ne pas la transmettre, c'est continuer d'écrire à
 * quelqu'un qui a dit non.
 *
 * Deux limites tenues ici : on ne pousse QUE des numéros de téléphone (les
 * désinscriptions e-mail regardent SendGrid, pas MailingVox), et on ne pousse
 * QUE des oppositions — jamais une liste de contacts.
 */
export async function noircirMailingvox(numeros: string[]): Promise<{ ajoutes: number; message: string }> {
  const propres = [...new Set(numeros.filter((n) => /^\+\d{8,15}$/.test(n)))];
  if (!CLE) return { ajoutes: 0, message: "Mode simulation : MAILINGVOX_KEY absente, rien n'a été transmis." };
  if (propres.length === 0) return { ajoutes: 0, message: "Aucun numéro valide à transmettre." };

  const corps = new URLSearchParams({ key: CLE });
  propres.forEach((n, i) => corps.set(`numeros[${i}]`, n));

  const res = await fetch(`${BASE}/contacts/blacklist`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corps,
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return { ajoutes: 0, message: "MailingVox injoignable : la liste noire n'a pas été mise à jour." };

  try {
    const j = (await res.json()) as { resultat?: unknown; erreurs?: unknown };
    const n = Number(j.resultat);
    if (!Number.isFinite(n) || n === 0) {
      return { ajoutes: 0, message: `MailingVox a refusé : ${direErreurs(j.erreurs)}.` };
    }
    return { ajoutes: n, message: `${n} opposition${n > 1 ? "s" : ""} transmise${n > 1 ? "s" : ""} à MailingVox.` };
  } catch {
    return { ajoutes: 0, message: "Réponse MailingVox illisible." };
  }
}

/**
 * Déclare nos trois adresses de réception chez MailingVox.
 *
 * MAV : « on peut récupérer les retours des gens quand ils répondent au SMS
 * directement sur notre back-office ? » — c'est ici que ça se branche, et
 * l'API le fait sans passer par leur interface (`/api/urls/edit`).
 *
 * À appeler une fois, depuis l'écran Réglages. Le secret de l'URL est le seul
 * rempart : MailingVox ne signe pas ses appels, et une adresse de STOP ouverte
 * à tous permettrait à n'importe qui de faire taire notre communication vers
 * un client qui n'a rien demandé.
 */
export async function poserWebhooks(base: string): Promise<{ ok: boolean; message: string }> {
  const secret = process.env.MAILINGVOX_WEBHOOK_SECRET?.trim();
  if (!CLE) return { ok: false, message: "MAILINGVOX_KEY absente : rien à déclarer." };
  if (!secret) {
    return {
      ok: false,
      message:
        "MAILINGVOX_WEBHOOK_SECRET absente. Sans elle les adresses de réception seraient "
        + "ouvertes à tous — et un tiers pourrait inventer des STOP au nom de vos clients.",
    };
  }
  const racine = base.replace(/\/+$/, "");
  const url = (n: string) => `${racine}/api/mailingvox/${n}?cle=${encodeURIComponent(secret)}`;

  const corps = new URLSearchParams({
    key: CLE,
    reponses: url("reponses"),
    stops: url("stops"),
    accuses: url("accuses"),
  });
  const res = await fetch(`${BASE}/urls/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corps,
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return { ok: false, message: "MailingVox injoignable." };

  try {
    const j = (await res.json()) as { resultat?: unknown; erreurs?: unknown };
    if (!j.resultat) return { ok: false, message: `MailingVox a refusé : ${direErreurs(j.erreurs)}.` };
    return {
      ok: true,
      message:
        "Réponses, STOP et accusés de réception seront poussés vers le back-office. "
        + "Les réponses arrivent sur la fiche du bien concerné.",
    };
  } catch {
    return { ok: false, message: "Réponse MailingVox illisible." };
  }
}

export type SmsEntrant = {
  id: string;
  nature: "reponse" | "stop" | "accuse";
  numero?: string;
  texte?: string;
  statut?: string;
  campagne?: string;
  contactId?: string;
  recuLe: string;
  lu: boolean;
};

/**
 * Les réponses et les STOP reçus, les plus récents d'abord.
 *
 * Les ACCUSÉS sont écartés par défaut : il y en a un par destinataire et par
 * changement d'état, ils noieraient les deux ou trois réponses qui comptent.
 * Ils restent en base pour qui veut compter les non-délivrés.
 */
export async function smsEntrants(options: { limite?: number; avecAccuses?: boolean } = {}) {
  const SB = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
  const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!K) return [] as SmsEntrant[];
  const natures = options.avecAccuses ? "" : "&nature=in.(reponse,stop)";
  const res = await fetch(
    `${SB}/rest/v1/fi_sms_entrant?select=*${natures}&order=recu_le.desc&limit=${options.limite ?? 100}`,
    { headers: { apikey: K, Authorization: `Bearer ${K}` }, cache: "no-store" },
  ).catch(() => null);
  if (!res?.ok) return [] as SmsEntrant[];
  const lignes = (await res.json()) as Record<string, unknown>[];
  return lignes.map((l) => ({
    id: String(l.id),
    nature: l.nature as SmsEntrant["nature"],
    numero: (l.numero as string) ?? undefined,
    texte: (l.texte as string) ?? undefined,
    statut: (l.statut as string) ?? undefined,
    campagne: (l.campagne as string) ?? undefined,
    contactId: (l.contact_id as string) ?? undefined,
    recuLe: String(l.recu_le),
    lu: l.lu === true,
  }));
}
