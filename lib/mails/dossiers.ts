/* Quel dossier de la boîte tient quel rôle — « Envoyés », « Brouillons »…
 *
 * MAV, 19/11/26 : « je veux voir mes e-mails envoyés sur mon portable et mon
 * webmail ; je te confirme que ce n'est pas le cas ». Sa boîte Exchange porte
 * DEUX dossiers d'envoi : le vrai, « Sent Items », et un « Éléments envoyés »
 * laissé par un ancien logiciel de messagerie. Exchange ne pose aucun attribut
 * spécial (\Sent) en IMAP, on se rabattait donc sur le nom, et le premier de
 * la liste gagnait : le mauvais. Les copies du BO partaient dans un dossier
 * que ni le webmail ni le téléphone ne montrent comme « envoyés ».
 *
 * La règle : l'attribut spécial du serveur d'abord ; sinon, entre plusieurs
 * dossiers du même rôle, celui qui contient le plus de messages — le vrai
 * dossier d'envoi d'une boîte a des années de courrier, le doublon presque
 * rien. À égalité, le premier de la liste, comme avant.
 */

export type RoleDossier = "reception" | "envoyes" | "brouillons" | "indesirables" | "corbeille";

export type Candidat = {
  role: RoleDossier;
  chemin: string;
  /** Le serveur a lui-même désigné ce dossier (\Sent, \Drafts…). */
  special: boolean;
  /** Nombre de messages, quand on a dû le demander pour départager. */
  messages?: number;
};

/** Ce numéro change quand la règle change : une boîte dont les dossiers ont
 *  été appris avec une règle plus ancienne les réapprend toute seule. */
export const VERSION_DOSSIERS = "2";
/** La clé qui garde ce numéro à côté des chemins, dans `fi_boite_agent.dossiers`. */
export const CLE_VERSION = "_v";

/** Les rôles pour lesquels il faut compter les messages avant de choisir. */
export function rolesADepartager(candidats: Candidat[]): RoleDossier[] {
  const parRole = new Map<RoleDossier, Candidat[]>();
  for (const c of candidats) parRole.set(c.role, [...(parRole.get(c.role) ?? []), c]);
  return [...parRole.entries()]
    .filter(([, cs]) => cs.length > 1 && !cs.some((c) => c.special))
    .map(([r]) => r);
}

/** Le dossier retenu pour chaque rôle. */
export function choisirDossiers(candidats: Candidat[]): Partial<Record<RoleDossier, string>> {
  const out: Partial<Record<RoleDossier, string>> = {};
  const roles = [...new Set(candidats.map((c) => c.role))];
  for (const role of roles) {
    const cs = candidats.filter((c) => c.role === role);
    const special = cs.find((c) => c.special);
    if (special) { out[role] = special.chemin; continue; }
    let retenu = cs[0];
    for (const c of cs) if ((c.messages ?? -1) > (retenu.messages ?? -1)) retenu = c;
    out[role] = retenu.chemin;
  }
  return out;
}
