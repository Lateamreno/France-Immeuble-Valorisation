// Moteur de rattachement des e-mails (module Mails, livraison 1).
//
// Principe : le moteur ne CLASSE pas, il RECONNAÎT. Il ne se demande jamais
// « est-ce une pub ? » ni « est-ce privé ? » — il se demande « est-ce que je
// reconnais ça ? ». Ce qui n'est pas reconnu n'est pas jugé : il n'entre pas.
// Conséquence : aucun faux positif possible sur la correspondance privée.
//
// Le fichier ne parle à aucune base : les recherches sont injectées, ce qui
// permet de le tester sur des cas réels sans boîte mail ni Supabase.

export type Enveloppe = {
  /** Adresse d'expédition, éventuellement sous la forme « Nom <a@b.fr> ». */
  de: string;
  /** Destinataires (To + Cc). */
  pour?: string[];
  objet?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  /** En-têtes bruts, en minuscules, pour la détection d'envoi de masse. */
  entetes?: Record<string, string>;
  /** Date du message, ISO. */
  date?: string;
};

/** Ce à quoi un e-mail peut être rattaché. */
export type Reference = {
  immeubleId?: string;
  estimationId?: string;
  propositionId?: string;
  dossierId?: string;
  mandatId?: string;
  suiviId?: string;
};

export type Niveau =
  /** La réponse cite l'identifiant d'un mail parti du BO. Mécanique. */
  | "fil"
  /** L'expéditeur est un contact connu, et il n'a qu'une affaire en cours. */
  | "contact"
  /** Contact connu, plusieurs affaires : à l'agent de trancher. */
  | "a_choisir"
  /** Vrai humain inconnu au bataillon : pile « À classer ». */
  | "inconnu"
  /** Envoi de masse déclaré comme tel : n'entre pas. */
  | "masse";

export type Reconnaissance = {
  niveau: Niveau;
  /** Phrase affichable dans l'écran, pour que l'agent sache pourquoi. */
  raison: string;
  contactId?: string;
  ref?: Reference;
  /** Affaires possibles quand il faut choisir. */
  candidats?: Reference[];
  /** Vrai quand le rattachement ne demande aucune confirmation. */
  certain: boolean;
};

/* ------------------------------------------------------------- adresses --- */

/** « Marc-Antoine VOCI <ma.voci@fi.fr> » → « ma.voci@fi.fr ». */
export function adresseSeule(brut: string): string {
  const s = (brut ?? "").trim();
  const chevrons = s.match(/<([^>]+)>/);
  return (chevrons ? chevrons[1] : s).trim().toLowerCase();
}

/**
 * Retire l'étiquette d'une adresse sous-adressée pour la comparaison :
 * `ma.voci+devis@fi.fr` et `ma.voci@fi.fr` sont la même boîte.
 */
export function sansEtiquette(adresse: string): string {
  const a = adresseSeule(adresse);
  const [avant, apres] = a.split("@");
  if (!apres) return a;
  return `${avant.split("+")[0]}@${apres}`;
}

/* ------------------------------------------------------------- le jeton --- */

// Le jeton voyage dans l'identifiant du message, PAS dans l'adresse de
// réponse : le sous-adressage (`suivi+ab12cd@`) n'est pas garanti chez OVH,
// alors que `In-Reply-To` / `References` est imposé par la norme et renvoyé
// par tous les clients de messagerie. C'est ce qui fait que le rattachement
// marche même quand MAV répond depuis son iPhone, hors du BO.

const SUFFIXE = ".fi";

/** Identifiant de message à poser sur un envoi du BO. */
export function messageIdDuJeton(jeton: string, domaine: string) {
  return `<${jeton}${SUFFIXE}@${domaine}>`;
}

/** Jeton neuf : court, non devinable, sans ambiguïté de casse. */
export function nouveauJeton(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Retrouve les jetons cités par une réponse (In-Reply-To puis References). */
export function jetonsCites(env: Enveloppe): string[] {
  const brut = [env.inReplyTo ?? "", ...(env.references ?? [])].join(" ");
  const trouves = brut.matchAll(/<?([a-z0-9]{6,32})\.fi@[^\s>]+>?/gi);
  return [...new Set([...trouves].map((m) => m[1].toLowerCase()))];
}

/* ------------------------------------------------------- envois de masse --- */

/**
 * Une newsletter se signale elle-même : ce sont des en-têtes normalisés que
 * tout envoyeur de masse sérieux pose. On ne devine rien, on lit.
 */
export function estEnvoiDeMasse(entetes: Record<string, string> = {}): boolean {
  /** Valeur brute, ou `undefined` si l'en-tête est absent. La distinction
   *  compte : un en-tête absent ne prouve rien, un en-tête vide si. */
  const brut = (n: string) => entetes[n] ?? entetes[n.toLowerCase()];
  const h = (n: string) => (brut(n) ?? "").toLowerCase();

  if (h("list-unsubscribe")) return true;
  if (h("list-id")) return true;
  if (/^(bulk|list|junk|auto_reply)$/.test(h("precedence").trim())) return true;
  // « auto-submitted: no » est la valeur des messages écrits par un humain.
  const auto = h("auto-submitted").trim();
  if (auto && auto !== "no") return true;
  if (h("x-auto-response-suppress")) return true;
  // Retour de courrier : l'enveloppe de retour est vide (`Return-Path: <>`).
  // Attention — il faut que l'en-tête soit PRÉSENT : s'il manque simplement,
  // le lire comme une chaîne vide reviendrait à jeter tous les messages dont
  // on n'a pas capté cet en-tête.
  const retour = brut("return-path");
  if (retour !== undefined && retour.replace(/[<>\s]/g, "") === "") return true;
  return false;
}

/* ------------------------------------------------------ la reconnaissance --- */

export type Recherches = {
  /** Retrouve le mail sortant du BO qui portait ce jeton. */
  parJeton: (jeton: string) => Promise<{ ref: Reference; contactId?: string } | null>;
  /** Retrouve un contact par son adresse (déjà normalisée). */
  parAdresse: (adresse: string) => Promise<{ id: string; nom?: string } | null>;
  /** Les affaires en cours d'un contact. */
  affairesDe: (contactId: string) => Promise<Reference[]>;
  /** Pour départager plusieurs affaires : l'objet des e-mails envoyés pour
   *  chacune (dossier, relance) et la ville du bien (12/11). */
  indicesDe?: (refs: Reference[]) => Promise<Indice[]>;
};

export type Indice = {
  ref: Reference; objets: string[]; villes: string[];
  /** Date d'envoi, ISO. */
  le?: string;
  /** Date de la dernière relance de la proposition, ISO (16/11). */
  relanceLe?: string;
};

/** Combien de jours une réponse peut suivre la relance à laquelle elle répond. */
export const JOURS_REPONSE_RELANCE = 21;

/** Un objet ou une ville réduits pour la comparaison : sans « Re : » ni
 *  « TR: », sans accents, sans ponctuation, en minuscules. */
export function reduire(t?: string | null): string {
  let o = (t ?? "").trim();
  for (let i = 0; i < 5; i++) {
    const n = o.replace(/^\s*(re|r[ée]f|tr|fw|fwd|aw|wg|sv|rv)\s*(\[\d+\])?\s*:\s*/i, "");
    if (n === o) break;
    o = n;
  }
  return o.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Retours du 12/11 — « j'ai reçu des e-mails de réponses mais je les vois pas
 * dans les réponses » : l'acquéreur avait plusieurs propositions en cours, la
 * réponse restait « à choisir ». L'objet départage : une réponse reprend
 * l'objet de l'e-mail du dossier (« Re: Immeuble à vendre à Corbeil… »).
 * D'abord l'objet entier, puis la ville du bien, et seulement si un seul
 * candidat répond.
 */
export function choisirParObjet(
  objet: string | undefined,
  indices: Indice[],
  /** Date de la réponse, ISO : sert à reconnaître la relance à laquelle elle répond. */
  recuLe?: string,
): { ref: Reference; par: "objet" | "ville" | "relance" } | null {
  const o = reduire(objet);
  if (o.length < 8) return null;
  /* Un seul candidat, ou plusieurs propositions sur le MÊME immeuble (une
     commercialisation et sa relance, deux commercialisations) : la plus
     récente. */
  const unique = (l: Indice[]) => {
    if (l.length === 0) return null;
    const ims = [...new Set(l.map((x) => x.ref.immeubleId ?? x.ref.propositionId ?? ""))];
    if (ims.length !== 1) return null;
    return [...l].sort((a, b) => (b.le ?? "").localeCompare(a.le ?? ""))[0];
  };
  /* La correspondance la plus longue l'emporte : « Immeuble à vendre à
     Corbeil-Essonnes (91) », envoyé pour un autre bien de la ville, est un
     début de « … (91) - 1,1 M€ - 9 % - 3 107 €/m² » et ne doit pas le valoir. */
  const score = (x: Indice) => Math.max(0, ...x.objets.map((e) => {
    const r = reduire(e);
    if (r.length < 8) return 0;
    if (r === o) return 10_000 + r.length;
    return r.length >= 20 && (o.startsWith(r) || r.startsWith(o)) ? Math.min(r.length, o.length) : 0;
  }));
  const meilleur = Math.max(0, ...indices.map(score));
  const parObjet = meilleur > 0 ? indices.filter((x) => score(x) === meilleur) : [];
  /* Retour du 16/11 : un acquéreur ancien a plusieurs biens dans la même
     ville (Argenteuil, Livry-Gargan) ; la réponse à une RELANCE concerne
     ceux qu'on vient de relancer, dans les trois semaines qui précèdent. */
  const relances = (l: Indice[]) => {
    /* Le récapitulatif d'une salve (« Récapitulatif — Relance … ») est
       l'agent qui s'écrit à lui-même : ce n'est pas une réponse. */
    if (!recuLe || !/relance/.test(o) || /^recapitulatif/.test(o)) return null;
    const fin = Date.parse(recuLe);
    const debut = fin - JOURS_REPONSE_RELANCE * 86_400_000;
    return unique(l.filter((x) => {
      const t = x.relanceLe ? Date.parse(x.relanceLe) : NaN;
      return Number.isFinite(t) && t >= debut && t <= fin + 3_600_000;
    }));
  };
  const u1 = unique(parObjet);
  if (u1) return { ref: u1.ref, par: "objet" };
  if (parObjet.length > 0) {
    const r1 = relances(parObjet);
    return r1 ? { ref: r1.ref, par: "relance" } : null;
  }
  const mot = (v: string) => new RegExp(`(^| )${reduire(v).replace(/ /g, " ")}( |$)`);
  const parVille = indices.filter((x) => x.villes.some((v) => reduire(v).length >= 3 && mot(v).test(o)));
  const u2 = unique(parVille);
  if (u2) return { ref: u2.ref, par: "ville" };
  const r2 = relances(parVille.length ? parVille : indices);
  return r2 ? { ref: r2.ref, par: "relance" } : null;
}

/**
 * Décide de ce qu'on fait d'un message entrant.
 *
 * L'ordre compte : on essaie d'abord ce qui est mécanique (le fil), puis ce
 * qui est certain sur la personne (l'adresse), et on ne renonce qu'ensuite.
 * La détection d'envoi de masse passe APRÈS le fil : un accusé de lecture
 * automatique sur un mail qu'on a envoyé nous intéresse quand même.
 */
export async function reconnaitre(env: Enveloppe, r: Recherches): Promise<Reconnaissance> {
  // 1. Le fil — mécanique, aucune interprétation.
  for (const jeton of jetonsCites(env)) {
    const trouve = await r.parJeton(jeton);
    if (trouve) {
      return {
        niveau: "fil",
        raison: "Réponse à un message envoyé depuis le back-office",
        contactId: trouve.contactId,
        ref: trouve.ref,
        certain: true,
      };
    }
  }

  // 2. L'envoi de masse se déclare : on l'écarte sans l'ouvrir.
  if (estEnvoiDeMasse(env.entetes)) {
    return { niveau: "masse", raison: "Envoi de masse (désinscription déclarée)", certain: true };
  }

  // 3. L'expéditeur est-il quelqu'un qu'on connaît ?
  const contact = await r.parAdresse(sansEtiquette(env.de));
  if (!contact) {
    return {
      niveau: "inconnu",
      raison: "Expéditeur inconnu, message écrit à la main",
      certain: false,
    };
  }

  const affaires = await r.affairesDe(contact.id);
  if (affaires.length === 1) {
    return {
      niveau: "contact",
      raison: `${contact.nom ?? "Contact connu"} — une seule affaire en cours`,
      contactId: contact.id,
      ref: affaires[0],
      certain: true,
    };
  }
  if (affaires.length > 1) {
    const choix = r.indicesDe && env.objet
      ? choisirParObjet(env.objet, await r.indicesDe(affaires).catch(() => []), env.date)
      : null;
    if (choix) {
      return {
        niveau: "contact",
        raison: `${contact.nom ?? "Contact connu"} — ${affaires.length} affaires, reconnue par ${choix.par === "objet" ? "l'objet de l'e-mail" : choix.par === "ville" ? "la ville citée dans l'objet" : "la relance à laquelle elle répond"}`,
        contactId: contact.id,
        ref: choix.ref,
        certain: true,
      };
    }
    return {
      niveau: "a_choisir",
      raison: `${contact.nom ?? "Contact connu"} — ${affaires.length} affaires en cours`,
      contactId: contact.id,
      candidats: affaires,
      certain: false,
    };
  }
  return {
    niveau: "inconnu",
    raison: `${contact.nom ?? "Contact connu"} — aucune affaire en cours`,
    contactId: contact.id,
    certain: false,
  };
}

/** Ce qui doit apparaître dans l'écran Mails. Le reste n'entre pas. */
export const estRetenu = (rec: Reconnaissance) => rec.niveau !== "masse";

/** Ce qui va dans la pile « Affaires » plutôt que « À classer ». */
export const estRattache = (rec: Reconnaissance) => rec.certain && !!rec.ref;
