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
 * PREMIÈRE VERSION TROP LARGE. Elle acceptait aussi les objets « formulaire »,
 * « nouvelle demande », « votre estimation » quel qu'en soit l'expéditeur :
 * de la publicité entrait dans le dossier. Or n'importe quel démarcheur écrit
 * « votre estimation » dans un objet ; personne, en revanche, ne signe
 * « France Immeuble » sans être nous.
 *
 * La règle est donc devenue une règle d'EXPÉDITEUR, et rien d'autre — MAV :
 * « en général en expéditeur y a écrit france immeuble quelque chose, genre
 * site france immeuble ». C'est ce signal-là qu'on suit.
 */

/** « France Immeuble », « france-immeuble », « FranceImmeuble »… */
const NOM_FI = /france[\s._-]*immeuble/i;

/** Nos domaines. Un message qui en vient est à nous, par construction. */
const DOMAINES = /@(?:[a-z0-9-]+\.)*(?:france-immeuble\.fr|franceimmeuble\.fr)$/i;

/** Une adresse de personne : prénom.nom@ — donc un collègue, pas le site. */
const NOMINATIVE = /^[a-z]+[._-][a-z-]+@/i;

export type PourTri = { de: string; deNom?: string; objet: string };

/**
 * Ce message vient-il du site ?
 *
 * Deux cas, tous deux fondés sur l'expéditeur :
 *  · son nom affiché dit « France Immeuble » — c'est la signature des
 *    formulaires du site, et personne d'autre ne l'emploie ;
 *  · ou son adresse est sur un de nos domaines SANS être nominative : un
 *    automate (`contact@`, `noreply@`, `site@`), pas un collègue.
 *
 * L'objet n'entre plus en jeu : c'est lui qui laissait passer la publicité.
 */
export function estDuSite(m: PourTri): boolean {
  const de = (m.de ?? "").toLowerCase();
  const nom = m.deNom ?? "";

  /* Un collègue reste un collègue, même quand sa signature porte la marque. */
  if (NOMINATIVE.test(de)) return false;

  if (NOM_FI.test(nom)) return true;
  return DOMAINES.test(de);
}
