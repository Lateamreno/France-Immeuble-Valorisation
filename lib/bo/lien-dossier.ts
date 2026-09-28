// Le lien de partage d'un dossier (transfer.it) et sa date de fin.
//
// MAV (28/09) : « on va garder les liens transfer.it même pour les relances.
// Du coup ce serait bien que lorsqu'on met un lien transfer.it on puisse
// indiquer la date de fin de lien, afin que tu puisses me dire "attention tu
// fais un envoi d'un lien périmé" et me proposer de changer le lien. »
//
// Le lien vit SUR LE DOSSIER (`bo_dossier.lien_partage`, `lien_expire_le`) :
// c'est lui qu'on partage, et c'est à chaque nouvelle version qu'on le
// redemande. La commercialisation et les relances le lisent là.
//
// Module sans directive serveur : la règle « périmé ou pas » se lit côté
// écran comme côté serveur, et se teste seule.

/** transfer.it garde un envoi 89 jours : c'est la validité par défaut. */
export const VALIDITE_LIEN_JOURS = 89;

/** Sous ce délai, on prévient : le lien tiendra-t-il jusqu'à la relance ? */
export const PREAVIS_LIEN_JOURS = 7;

const jour = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** La date de fin par défaut, au format `YYYY-MM-DD`, depuis aujourd'hui. */
export function expirationParDefaut(depuis: Date = new Date()): string {
  const d = new Date(depuis);
  d.setDate(d.getDate() + VALIDITE_LIEN_JOURS);
  return jour(d);
}

export type EtatLien = {
  url: string;
  /** `YYYY-MM-DD`, ou rien si la date n'a pas été saisie. */
  expireLe?: string;
  /** Jours restants (négatif une fois passé). Absent sans date. */
  joursRestants?: number;
  perime: boolean;
  /** Encore valable, mais plus pour longtemps. */
  bientot: boolean;
};

/**
 * L'état d'un lien à une date donnée. Un lien sans date n'est jamais déclaré
 * périmé : on ne sait pas, on ne crie pas.
 */
export function etatLien(url: string | undefined, expireLe: string | undefined, maintenant: Date = new Date()): EtatLien | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  const e = (expireLe ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) return { url: u, perime: false, bientot: false };
  const fin = new Date(`${e}T23:59:59`);
  const jours = Math.floor((fin.getTime() - maintenant.getTime()) / 86_400_000);
  return { url: u, expireLe: e, joursRestants: jours, perime: jours < 0, bientot: jours >= 0 && jours <= PREAVIS_LIEN_JOURS };
}

/** Le lien porté par un document de dossier du miroir. */
export function lienDuDossier(d: Record<string, unknown> | null | undefined, maintenant?: Date): EtatLien | null {
  if (!d) return null;
  return etatLien(
    typeof d.lien_partage === "string" ? d.lien_partage : undefined,
    typeof d.lien_expire_le === "string" ? d.lien_expire_le : undefined,
    maintenant,
  );
}

/** « 12/10/2026 » depuis `2026-10-12`. */
export function dateLien(expireLe: string | undefined): string {
  const e = (expireLe ?? "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Une adresse de partage acceptable : https, et pas un lien interne. */
export function lienValide(url: string): boolean {
  return /^https:\/\/[^\s/]+\.[^\s/]+\/?\S*$/i.test(url.trim());
}
