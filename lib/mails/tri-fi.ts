/* Le dossier « France Immeuble » (retours #130 et suivant).
 *
 * MAV : « j'aimerais un dossier en dessous de boîte de réception où tous les
 * e-mails France Immeuble sont rangés — les e-mails du site, donc les
 * formulaires, les nouvelles recherches et les questions. »
 *
 * Ce n'est pas un dossier IMAP : ces messages arrivent dans la boîte de
 * réception comme les autres, et les déplacer sur le serveur les ferait
 * disparaître du téléphone. C'est donc un TRI, appliqué à l'affichage : la
 * réception montre le courrier humain, ce dossier montre ce que le site
 * envoie. Rien n'est déplacé, rien n'est perdu.
 *
 * DEUX VERSIONS RATÉES, ET POURQUOI.
 *
 * 1. Trop large. Elle acceptait n'importe quel objet contenant « formulaire »,
 *    « nouvelle demande », « votre estimation », quel qu'en soit l'expéditeur :
 *    la publicité entrait dans le dossier.
 *
 * 2. Trop étroite — celle qui ne marchait plus. Elle écartait d'office tout
 *    expéditeur nominatif (`prénom.nom@`), en supposant qu'un automate écrit
 *    depuis `contact@` ou `noreply@`. Les vrais messages du site, eux, partent
 *    de `ma.voci@france-immeuble.fr` : la boîte de MAV lui-même. La toute
 *    première ligne de la règle les jetait donc tous.
 *
 * LA RÈGLE D'AUJOURD'HUI, calée sur les messages réels de la boîte :
 *
 *   De : Site France Immeuble <ma.voci@france-immeuble.fr>
 *        Nouveau formulaire "Vendre"
 *        Nouveau formulaire "Contact"
 *        [SPAM] Nouveau formulaire "Vendre"
 *        Infos complémentaires - Formulaire "Vendre"
 *   De : Nouvelle recherche - France Immeuble <ma.voci@france-immeuble.fr>
 *        Nouvelle recherche déposée sur le site
 *
 * Deux constats en tirent la règle. D'abord l'adresse ne dit rien : c'est la
 * nôtre dans les deux cas, site comme collègue. Ensuite le NOM AFFICHÉ, lui,
 * dit tout — le site signe « Site France Immeuble » ou « Nouvelle recherche -
 * France Immeuble », alors qu'un humain signe « Marc-Antoine V. - France
 * Immeuble » : la marque est là des deux côtés, mais devant elle il y a soit
 * un mot de machine, soit un prénom.
 *
 * On croise donc deux signaux, et on exige toujours que le message vienne de
 * chez nous — c'est ce qui tient la publicité dehors, quel que soit l'objet.
 */

/** « France Immeuble », « france-immeuble », « FranceImmeuble »… */
const NOM_FI = /france[\s._-]*immeuble/i;

/** Nos domaines. Un message qui en vient est à nous, par construction. */
const DOMAINES = /@(?:[a-z0-9-]+\.)*(?:france-immeuble\.fr|franceimmeuble\.fr)$/i;

/** Une adresse de service : `contact@`, `noreply@`, `site@` — pas un collègue. */
const NOMINATIVE = /^[a-z]+[._-][a-z-]+@/i;

/**
 * Un nom affiché de machine : ce qui précède la marque n'est pas un prénom.
 * « Site France Immeuble », « Nouvelle recherche - France Immeuble »,
 * « Notification France Immeuble ». Pas « Marc-Antoine V. - France Immeuble ».
 */
const NOM_ROBOT =
  /^\s*(site|nouveau|nouvelle|notification|alerte|formulaire|contact|question|recherche|no[\s._-]?reply|ne pas r[ée]pondre|mailer|robot)\b/i;

/**
 * Les objets que le site produit. Ils ne suffisent jamais à eux seuls : ils ne
 * comptent que sur un message parti de chez nous (voir `estDuSite`).
 * Ajouter ici tout nouveau gabarit du site plutôt que d'élargir la règle.
 */
const OBJETS_SITE = [
  /\bformulaire\b/i,                              // Nouveau formulaire "Vendre" / "Contact"
  /\bnouvelle recherche\b/i,                      // Nouvelle recherche déposée sur le site
  /\bnouvelle question\b/i,
  /\bd[ée]pos[ée]e? sur le site\b/i,
  /\binfos? compl[ée]mentaires\b/i,               // le second envoi du formulaire Vendre
  /\bnouvelle demande\b/i,
];

/** Ce que les serveurs collent devant l'objet, et qu'il faut retirer avant de lire. */
const PREFIXES = /^(?:\s*(?:\[[^\]]*\]|re|r[ée]p|tr|fwd?|fw)\s*:?\s*)+/i;

export type PourTri = { de: string; deNom?: string; objet: string };

/**
 * Ce message vient-il du site ?
 *
 * Condition d'entrée, toujours vérifiée : il vient de chez nous — adresse sur
 * un de nos domaines, ou nom affiché portant la marque. C'est le filtre qui
 * écarte la publicité, y compris celle qui écrit « votre estimation ».
 *
 * Ensuite, un des deux signaux suffit :
 *  · le nom affiché est celui d'une machine (« Site France Immeuble ») ;
 *  · ou l'objet est un des gabarits du site (« Nouveau formulaire "Vendre" »).
 *
 * Reste le cas d'avant : une adresse de service sur nos domaines
 * (`contact@`, `noreply@`) est un automate, quoi qu'elle écrive.
 */
export function estDuSite(m: PourTri): boolean {
  const de = (m.de ?? "").toLowerCase();
  const nom = m.deNom ?? "";
  const objet = (m.objet ?? "").replace(PREFIXES, "");

  const deChezNous = DOMAINES.test(de) || NOM_FI.test(nom);
  if (!deChezNous) return false;

  /* Une adresse de service chez nous : automate, sans discussion. */
  if (DOMAINES.test(de) && !NOMINATIVE.test(de)) return true;

  if (NOM_ROBOT.test(nom)) return true;
  return OBJETS_SITE.some((r) => r.test(objet));
}
