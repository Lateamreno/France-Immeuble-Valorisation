// Le compte des caractères et des segments d'un SMS — sans clé, sans
// environnement, pour que l'écran puisse compter comme le serveur facture.

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

