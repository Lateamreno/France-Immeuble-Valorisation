// Façade en vue de rue : la reconnaître partout, sans appeler personne.
//
// Doctrine (arbitrage MAV) : on ne charge JAMAIS une image Google à
// l'affichage. La façade est capturée **une seule fois** par immeuble, rangée
// dans notre coffre, et devient la photo principale. Le BO ne sert ensuite que
// notre propre copie : parcourir le dashboard, la liste ou une fiche ne coûte
// aucun appel d'API. Tout ce qui peut passer par le gratuit doit y passer.
//
// Le chemin de rangement est le marqueur : une photo principale qui commence
// par `storage:facade-rue/` est une capture provisoire, pas une photo du bien.
// C'est ce qui permet de la signaler à l'agent (« à remplacer ») et de la
// tenir hors du dossier de vente — Google interdit de réutiliser Street View
// comme photo d'un bien dans un document commercial ou une annonce.

/** Dossier du coffre réservé aux captures de façade. */
export const DOSSIER_FACADE = "facade-rue";

/** Cette URL de photo principale est-elle une capture Street View ? */
export const estFacadeRue = (u: unknown) =>
  typeof u === "string" && u.startsWith(`storage:${DOSSIER_FACADE}/`);
