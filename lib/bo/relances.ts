// Les relances de propositions — les règles, sans réseau.
//
// Deux échelles, et c'est toute l'idée :
//
//   • par IMMEUBLE : « relance tous ceux à qui j'ai envoyé ce dossier et qui
//     n'ont pas répondu ». C'est le geste qu'on fait en rouvrant une affaire.
//
//   • par CLIENT : « on est lundi, qui dois-je relancer, et sur quoi ? ». C'est
//     le geste hebdomadaire, et il ne se raisonne PAS par immeuble. Un
//     acquéreur à qui l'on doit trois relances sur trois immeubles ne doit pas
//     recevoir trois e-mails le même jour : il en reçoit UN, qui liste les
//     trois et demande une réponse pour chacun. Trois e-mails d'affilée, c'est
//     ce qui fait passer un agent pour un robot et une adresse pour du spam.
//
// Ce fichier ne parle à personne : il trie et il compose. Les allers-retours
// sont dans lib/bo/relances-actions.ts.

/** Le délai au-delà duquel une proposition sans réponse mérite une relance. */
export const JOURS_RELANCE = 7;

/**
 * Le plafond de fraîcheur, en jours.
 *
 * Sans lui, l'écran proposerait de relancer TOUT l'historique : le miroir porte
 * 15 077 propositions de plus d'un an chez 1 383 acquéreurs. Écrire à
 * quelqu'un pour un dossier envoyé il y a trois ans n'est pas une relance,
 * c'est une résurrection — et c'est le meilleur moyen de se faire signaler.
 * Quatre-vingt-dix jours est le défaut ; l'écran laisse l'élargir en
 * connaissance de cause, en affichant ce que ça ajoute.
 */
export const FENETRE_DEFAUT = 90;

/**
 * Le nombre de relances qu'un seul clic peut expédier.
 *
 * Les messages partent de la boîte de l'agent, une par une. Quatre cents
 * messages en rafale depuis une boîte Gmail ordinaire, c'est la limite
 * quotidienne atteinte et la boîte bridée pour la journée — celle qui sert
 * aussi à répondre aux clients. On envoie donc par paquets, et l'écran dit
 * combien il reste.
 */
export const PLAFOND_RELANCES = 150;

/** Les statuts qui ferment le sujet : on ne relance pas là-dessus. */
const STATUTS_CLOS = new Set([
  "Refusée (sans offre)",
  "Offre refusée",
  "Offre obtenue",
  "Offre acceptée",
  "Vendu",
]);
import { smsRelance } from "./resume-immeuble";

export type PropositionRelance = {
  id: string;
  immeubleId: string;
  contactId?: string;
  nom: string;
  email?: string;
  statut: string;
  /** Dernier geste connu : relance, envoi, ou retour noté. */
  depuis?: string;
  stop: boolean;
  commentaire?: string;
  /** L'immeuble n'est plus à la vente (archivé, vendu, retiré) : « Archivé le
   *  03/03/26 car Mandat périmé ». MAV, 25/09 : « quand on fait l'e-mail pour
   *  relancer tous les dossiers, ça relance pas les dossiers qui sont plus à
   *  la vente ». */
  horsVente?: string;
};

/**
 * Pourquoi un immeuble n'est plus à la vente — ou rien s'il l'est encore.
 *
 * Dans le BO Bubble un dossier archivé restait « à relancer », en grisé. Ici
 * l'archivage (mandat périmé, propriétaire parti, immeuble vendu ailleurs…),
 * la vente et le retrait ferment la proposition : elle se lit, elle ne se
 * relance plus. La phrase est celle de la fiche contact.
 */
export function motifHorsVente(im?: Record<string, unknown>): string | undefined {
  if (!im) return undefined;
  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  if (im.archived === true) {
    const d = t(im.date_archivage);
    const quand = d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : undefined;
    const motif = t(im.motif_archivage_txt) ?? t(im.Motif_archivage);
    return `Archivé${quand ? ` le ${quand}` : ""}${motif ? ` car ${motif}` : ""}`;
  }
  const st = String(im.Statut ?? "");
  if (/^11 /.test(st)) return "Vendu";
  if (/^0 /.test(st)) return "Retiré de la vente";
  return undefined;
}

/** L'ancienneté d'une proposition en jours, ou `undefined` si on ne sait pas. */
export function joursDepuis(iso: string | undefined, maintenant: number): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(+d)) return undefined;
  return Math.floor((maintenant - +d) / 86400000);
}

/**
 * Cette proposition mérite-t-elle une relance ?
 *
 * Quatre conditions, et chacune a coûté cher à quelqu'un quelque part :
 *   • le sujet n'est pas clos — relancer sur un bien vendu est humiliant ;
 *   • les relances ne sont pas coupées pour cette personne (`stop_relances_yn`),
 *     ce qui est SA demande et non un réglage d'agence ;
 *   • il y a une adresse — sans quoi la relance n'est qu'une ligne de journal ;
 *   • le délai est passé.
 *
 * Une proposition dont on ne connaît AUCUNE date est considérée à relancer :
 * une date manquante veut dire qu'on ne l'a jamais suivie, pas qu'elle est
 * fraîche.
 */
export function aRelancer(
  p: PropositionRelance,
  maintenant: number,
  jours = JOURS_RELANCE,
): boolean {
  if (p.stop) return false;
  if (p.horsVente) return false;
  if (STATUTS_CLOS.has(p.statut)) return false;
  if (!p.email) return false;
  const j = joursDepuis(p.depuis, maintenant);
  return j === undefined || j >= jours;
}

/* --------------------------------------------------------- Par client */

export type ImmeubleRelance = {
  propositionId: string;
  immeubleId: string;
  libelle: string;
  prix?: string;
  /** Jours écoulés depuis le dernier geste, quand on le sait. */
  jours?: number;
  /** « Sens (89), 479 m², 9 %, 840 k€ HAI » — la ligne validée par MAV (28/09) ;
   *  à défaut, le libellé fait l'affaire. */
  resume?: string;
  /** « Immeuble de Sens (89) - 9 % - 840 k€ » : l'objet de l'e-mail de relance. */
  court?: string;
  /** Le lien transfer.it du dernier dossier, quand il en a un et qu'il est
   *  encore valable (MAV, 28/09 : « on garde les liens transfer.it même pour
   *  les relances »). Le PDF, lui, est TOUJOURS joint. */
  lien?: string;
  /** Le lien existe mais sa date est passée : on ne l'envoie pas, on le dit. */
  lienPerime?: boolean;
  lienExpireLe?: string;
  /** Le dernier dossier n'a pas de PDF : la relance partira sans pièce jointe. */
  sansPdf?: boolean;
  /** Le dernier dossier lui-même, pour y poser le lien sur place. */
  dossierId?: string;
  dossierVersion?: number;
  /** Son PDF, à ouvrir avant d'envoyer (retour #439), et le nom sous lequel il part. */
  pdf?: string;
  pdfNom?: string;
  /**
   * Les autres propositions du MÊME immeuble pour la MÊME personne.
   *
   * Le miroir en porte beaucoup : un dossier renvoyé après mise à jour, un
   * téléchargement qui a créé sa ligne à côté de l'envoi. Elles ne valent
   * qu'une ligne dans l'e-mail — écrire deux fois la même adresse à quelqu'un
   * est la faute que cet écran existe pour éviter — mais « marquer relancé »
   * doit les toucher toutes, sinon la ligne jumelle rappelle la personne dès
   * la semaine suivante.
   */
  autresIds: string[];
};

/** Le lien transfer.it manque ou est périmé : on n'envoie pas, on le demande (MAV, 28/09). */
export const lienManquant = (i: Pick<ImmeubleRelance, "lien" | "lienPerime">) => !i.lien || i.lienPerime === true;

export type ClientRelance = {
  contactId: string;
  nom: string;
  email: string;
  immeubles: ImmeubleRelance[];
  /** L'attente la plus ancienne du lot : c'est elle qui donne l'urgence. */
  joursMax: number;
};

/**
 * Regroupe les propositions à relancer PAR PERSONNE.
 *
 * Le regroupement se fait sur le CONTACT et non sur la recherche : un même
 * acquéreur a souvent deux recherches (une investisseur, une marchand), et
 * raisonner par recherche lui enverrait deux e-mails — soit exactement ce
 * qu'on cherche à éviter.
 *
 * Les clients sont rendus du plus en retard au moins en retard : c'est l'ordre
 * dans lequel on veut les traiter quand on n'a pas le temps de tout faire.
 */
export function grouperParClient(
  props: PropositionRelance[],
  libelles: Map<string, { libelle: string; prix?: string; resume?: string; court?: string; lien?: string; lienPerime?: boolean; lienExpireLe?: string; sansPdf?: boolean; dossierId?: string; dossierVersion?: number; pdf?: string; pdfNom?: string }>,
  maintenant: number,
  jours = JOURS_RELANCE,
): ClientRelance[] {
  const par = new Map<string, ClientRelance>();
  /* Un index (client, immeuble) → ligne déjà posée : c'est lui qui empêche le
     même immeuble d'apparaître deux fois dans le même e-mail. */
  const vues = new Map<string, ImmeubleRelance>();
  for (const p of props) {
    if (!aRelancer(p, maintenant, jours)) continue;
    if (!p.contactId || !p.email) continue;
    const im = libelles.get(p.immeubleId);
    if (!im) continue;
    const j = joursDepuis(p.depuis, maintenant);
    const e = par.get(p.contactId) ?? {
      contactId: p.contactId, nom: p.nom, email: p.email, immeubles: [], joursMax: 0,
    };
    const cle = `${p.contactId}|${p.immeubleId}`;
    const deja = vues.get(cle);
    if (deja) {
      /* Doublon : on garde la plus ancienne comme ligne visible — c'est elle
         qui donne la vraie durée d'attente — et l'autre suit dans le lot. */
      if ((j ?? 999) > (deja.jours ?? 999)) {
        deja.autresIds.push(deja.propositionId);
        deja.propositionId = p.id;
        deja.jours = j;
      } else {
        deja.autresIds.push(p.id);
      }
      e.joursMax = Math.max(e.joursMax, j ?? 999);
      par.set(p.contactId, e);
      continue;
    }
    const ligne: ImmeubleRelance = {
      propositionId: p.id, immeubleId: p.immeubleId,
      libelle: im.libelle, prix: im.prix, jours: j, autresIds: [],
      resume: im.resume, court: im.court, lien: im.lien, lienPerime: im.lienPerime, lienExpireLe: im.lienExpireLe, sansPdf: im.sansPdf,
      dossierId: im.dossierId, dossierVersion: im.dossierVersion, pdf: im.pdf, pdfNom: im.pdfNom,
    };
    vues.set(cle, ligne);
    e.immeubles.push(ligne);
    e.joursMax = Math.max(e.joursMax, j ?? 999);
    par.set(p.contactId, e);
  }
  return [...par.values()]
    .map((c) => ({
      ...c,
      // Chez un client, l'immeuble le plus ancien passe en tête : c'est celui
      // sur lequel on attend depuis le plus longtemps.
      immeubles: [...c.immeubles].sort((a, b) => (b.jours ?? 999) - (a.jours ?? 999)),
    }))
    .sort((a, b) => b.joursMax - a.joursMax || b.immeubles.length - a.immeubles.length);
}

/* ------------------------------------------------------- Le message */

/**
 * L'e-mail de relance d'un client, tous ses immeubles dans le même message.
 *
 * Il demande une réponse PAR IMMEUBLE — c'est ce qui distingue une relance
 * utile d'une relance polie : sans la liste, un « alors, ça vous a plu ? » ne
 * dit pas de quoi on parle quand on a envoyé trois dossiers.
 *
 * Le texte reste modifiable à l'écran avant l'envoi : c'est une proposition de
 * rédaction, pas un gabarit imposé.
 */
export function messageRelance(c: ClientRelance, agent?: { nom?: string; tel?: string }): string {
  const un = c.immeubles.length === 1;
  /* La ligne d'un immeuble : le résumé validé par MAV (28/09), puis le seul
     lien admis — celui de transfer.it, s'il est encore valable. Le PDF, lui,
     est joint au message quoi qu'il arrive. */
  const ligne = (i: ImmeubleRelance) =>
    `${i.resume || `${i.libelle}${i.prix ? ` — ${i.prix}` : ""}`}${i.lien && !i.lienPerime ? `. Dossier, photos et plans : ${i.lien}` : "."}`;
  const liste = c.immeubles.map((i) => `  • ${ligne(i)}`).join("\n");
  return [
    `Bonjour,`,
    ``,
    un
      ? `Je reviens vers vous concernant l'immeuble de ${ligne(c.immeubles[0])}`
      : `Je reviens vers vous concernant les ${c.immeubles.length} dossiers que je vous ai adressés :`,
    un ? undefined : ``,
    un ? undefined : liste,
    ``,
    /* MAV, 28/09 (après-midi) : « S'il vous intéresse je suis disponible pour
       échanger, dans le cas contraire pouvez-vous simplement me l'indiquer
       pour que je classe le dossier ? » */
    /* MAV, 28/09 (fin de journée) : « Souhaitez-vous avancer sur ce dernier
       ou puis-je l'archiver ? » */
    un
      ? `Avez-vous eu le temps de l'étudier ? Souhaitez-vous avancer sur ce dernier ou puis-je l'archiver ?`
      : `Avez-vous eu le temps de les étudier ? Souhaitez-vous avancer sur l'un d'eux, ou puis-je les archiver ?`,
    ``,
    /* MAV, 28/09 : « Cordialement », sans virgule, comme l'e-mail d'envoi. */
    `Cordialement`,
    ``,
    agent?.nom ?? "",
    /* Retour #441 : « sur la signature il faut qu'il y ait écrit France
       Immeuble, là il y a juste nom, prénom et tél ». */
    `France Immeuble`,
    agent?.tel ?? "",
  ].filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/**
 * La relance par SMS (#373) : un seul immeuble, son lien transfer.it s'il est
 * valable, la mention STOP que MailingVox exige. Texte validé par MAV le 28/09
 * (`smsRelance`). Le numéro STOP est celui du réglage, passé par l'appelant.
 */
export function texteRelanceSms(resume: string, lien: string | undefined, _stop?: string): string {
  return smsRelance(resume, lien);
}

/** L'objet de l'e-mail : il dit combien de dossiers, sans faire de mystère. */
/**
 * L'objet de MAV (28/09) : « Re : Relance Immeuble de Sens (89) - 9 % - 840 k€ ».
 * Plusieurs dossiers : « Re : Relance Immeubles de Sens (89), Antibes (06) ».
 */
export function objetRelance(c: ClientRelance): string {
  if (c.immeubles.length === 1) {
    const i = c.immeubles[0];
    return `Re : Relance ${i.court || `Immeuble de ${i.libelle}`}`;
  }
  const lieux = c.immeubles.map((i) => (i.court ?? "").replace(/^Immeuble de /, "").split(" - ")[0] || i.libelle);
  return `Re : Relance Immeubles de ${lieux.join(", ")}`;
}

/** Le bilan rendu par l'écran Relances. */
export type BilanRelances = {
  clients: ClientRelance[];
  /** Ce que la fenêtre écarte, pour que le chiffre se voie au lieu de se deviner. */
  horsFenetre: { propositions: number; clients: number };
  jours: number;
  fenetre: number;
};
