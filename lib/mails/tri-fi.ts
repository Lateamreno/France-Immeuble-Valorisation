/* Le dossier « France Immeuble » (retour #130).
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
 * Les règles ci-dessous sont volontairement lisibles et à un seul endroit :
 * quand un formulaire changera d'objet ou d'expéditeur, c'est ici qu'on ajoute
 * une ligne.
 */

/** Expéditeurs automatiques du site. */
const EXPEDITEURS = [
  /^(no-?reply|ne-?pas-?repondre|notification|wordpress|www-?data|site|formulaire|contact)@/i,
  /@(france-immeuble\.fr|pleinbail\.fr)$/i,
];

/** Objets caractéristiques de ce que le site envoie. */
const OBJETS = [
  /nouvelle\s+recherche/i,
  /nouvelle\s+question/i,
  /nouvelle\s+demande/i,
  /formulaire/i,
  /demande\s+de\s+(contact|rappel|information)/i,
  /nouveau\s+message\s+(du|depuis le)\s+site/i,
  /votre\s+(estimation|annonce)/i,
];

export type PourTri = { de: string; objet: string };

/**
 * Ce message vient-il du site ?
 *
 * Un envoyeur automatique OU un objet caractéristique suffit : les deux
 * ensemble seraient trop stricts, un formulaire relayé par une autre adresse
 * passerait à travers.
 */
export function estDuSite(m: PourTri): boolean {
  const de = (m.de ?? "").toLowerCase();
  const objet = m.objet ?? "";
  /* Une adresse nominative du domaine reste du courrier humain : c'est un
     collègue qui écrit, pas le site. */
  const nominative = /^[a-z]+\.[a-z-]+@/i.test(de) || /^[a-z]\.[a-z-]+@/i.test(de);
  if (!nominative && EXPEDITEURS.some((re) => re.test(de))) return true;
  return OBJETS.some((re) => re.test(objet));
}
