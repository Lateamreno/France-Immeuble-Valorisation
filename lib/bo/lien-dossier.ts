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

/**
 * La réserve (retour #442) : « conserver 5 jours de réserve — on me dit de
 * changer le lien car il expire dans moins de 5 jours ». Sous ce délai, le
 * lien est traité comme à remplacer : on ne l'envoie plus.
 */
export const PREAVIS_LIEN_JOURS = 5;

const jour = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** La date de fin, au format `YYYY-MM-DD`, depuis aujourd'hui, pour une
 *  validité en jours (89 par défaut — retour #442 : « il me le faut en jours »). */
export function expirationParDefaut(depuis: Date = new Date(), joursValidite: number = VALIDITE_LIEN_JOURS): string {
  const d = new Date(depuis);
  d.setDate(d.getDate() + Math.max(1, Math.round(joursValidite)));
  return jour(d);
}

export type EtatLien = {
  url: string;
  /** `YYYY-MM-DD`, ou rien si la date n'a pas été saisie. */
  expireLe?: string;
  /** Jours restants (négatif une fois passé). Absent sans date. */
  joursRestants?: number;
  perime: boolean;
  /** Encore valable, mais sous la réserve de cinq jours : à remplacer. */
  bientot: boolean;
  /** Périmé OU sous la réserve : ce lien ne doit plus partir. */
  aRemplacer: boolean;
};

/**
 * L'état d'un lien à une date donnée. Un lien sans date n'est jamais déclaré
 * périmé : on ne sait pas, on ne crie pas.
 */
export function etatLien(url: string | undefined, expireLe: string | undefined, maintenant: Date = new Date()): EtatLien | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  const e = (expireLe ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) return { url: u, perime: false, bientot: false, aRemplacer: false };
  const fin = new Date(`${e}T23:59:59`);
  const jours = Math.floor((fin.getTime() - maintenant.getTime()) / 86_400_000);
  const perime = jours < 0;
  const bientot = jours >= 0 && jours < PREAVIS_LIEN_JOURS;
  return { url: u, expireLe: e, joursRestants: jours, perime, bientot, aRemplacer: perime || bientot };
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

/**
 * L'adresse à laquelle ouvrir le PDF d'un dossier depuis le BO, que le
 * fichier vive dans notre coffre ou encore chez Bubble (retour #439 : « que
 * je puisse l'ouvrir avant envoi »). Le relais `/api/photo` sait lire les
 * deux ; rien ici ne touche à une clé.
 */
export function urlPdfDossier(d: Record<string, unknown> | null | undefined): string | undefined {
  if (!d) return undefined;
  const u = [d.pdf, d.FILE].map((v) => (typeof v === "string" ? v.trim() : "")).find((x) => x.length > 0) ?? "";
  if (!u) return undefined;
  if (u.startsWith("storage:")) return `/api/photo?s=${encodeURIComponent(u.slice("storage:".length))}`;
  if (u.startsWith("/api/photo?")) return u;
  return `/api/photo?u=${encodeURIComponent(u.replace(/^\/\//, "https://"))}`;
}

/** « Dossier-Sens-V2.pdf ». */
export function nomPdfDossier(ville: string | undefined, version: unknown): string {
  const v = (ville ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const n = typeof version === "number" ? String(version) : typeof version === "string" ? version.trim() : "";
  return `Dossier-${v || "immeuble"}-V${n || "1"}.pdf`;
}
