// Le résumé d'un immeuble en une ligne, et les quatre modèles qui s'en servent.
//
// MAV (28/09), textes validés mot pour mot :
//
//   SMS envoi de dossier : « France Immeuble : Immeuble de rapport à vendre à
//   Sens (89), 479 m², 9 %, 840 k€ HAI. Télécharger le dossier : <lien>
//   Répondre Oui pour infos et Non pour classement. »
//
//   SMS relance : « France Immeuble : Avez-vous pu regarder l'immeuble de
//   Sens (89), 479 m², 9 %, 840 k€ HAI ? Dossier : <lien> Répondre Oui pour
//   infos et Non pour classement »
//
//   E-mail relance : « Je reviens vers vous concernant l'immeuble de Sens (89),
//   479 m², 9 %, 840 k€ HAI. Dossier, photos et plans : <lien> » puis le reste.
//
// Le prix s'écrit court : « 840 k€ » en dessous du million, « 1,2 M€ » au-delà
// (« pas besoin de détail après les centaines de milliers »). Le mot STOP reste
// dans la dernière ligne : la CNIL l'impose et MailingVox refuse sans lui.
//
// Module sans directive serveur : les écrans et les actions le lisent pareil.

export type ResumeImmeuble = {
  ville?: string;
  /** Code postal : le département en est tiré. */
  codePostal?: string;
  surface?: number;
  /** Rendement brut, en pourcent. */
  renta?: number;
  prixHai?: number;
};

/** « 840 k€ », « 1,2 M€ », « 950 € ». */
export function prixCourt(n: number | undefined): string | undefined {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return undefined;
  if (n >= 1_000_000) {
    const m = Math.round(n / 100_000) / 10;
    return `${String(m).replace(".", ",")} M€`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)} k€`;
  return `${Math.round(n)} €`;
}

/** « 9 % », « 9,6 % ». */
export function rentaCourte(r: number | undefined): string | undefined {
  if (typeof r !== "number" || !Number.isFinite(r) || r <= 0) return undefined;
  return `${String(Math.round(r * 10) / 10).replace(".", ",")} %`;
}

/** « 89 » depuis « 89100 » ; « 974 » outre-mer ; rien sans code postal. */
export function departement(codePostal: string | undefined): string | undefined {
  const cp = String(codePostal ?? "").trim();
  if (!/^\d{5}$/.test(cp)) return undefined;
  return cp.startsWith("97") || cp.startsWith("98") ? cp.slice(0, 3) : cp.slice(0, 2);
}

/** « Sens (89) » — la ville et son département, sans le code postal complet. */
export function lieuCourt(x: Pick<ResumeImmeuble, "ville" | "codePostal">): string {
  const dpt = departement(x.codePostal);
  const ville = (x.ville ?? "").trim().replace(/\s*\(\d{5}\)\s*$/, "");
  return ville ? `${ville}${dpt ? ` (${dpt})` : ""}` : dpt ? `(${dpt})` : "";
}

/**
 * « Sens (89), 479 m², 9 %, 840 k€ HAI » — chaque morceau absent saute.
 *
 * `sms` : « m2 » et non « m² ». L'exposant n'est pas dans l'alphabet des
 * SMS ; un seul « ² » fait basculer tout le message en 70 caractères par
 * segment — un texte de deux segments en coûterait trois.
 */
export function resumeImmeuble(x: ResumeImmeuble, opts: { sms?: boolean } = {}): string {
  const prix = prixCourt(x.prixHai);
  return [
    lieuCourt(x),
    typeof x.surface === "number" && x.surface > 0 ? `${Math.round(x.surface)} ${opts.sms ? "m2" : "m²"}` : "",
    rentaCourte(x.renta),
    prix ? `${prix} HAI` : "",
  ].filter(Boolean).join(", ");
}

/** « Immeuble de Sens (89) - 9 % - 840 k€ » : l'objet de relance de MAV (28/09). */
export function objetImmeuble(x: ResumeImmeuble): string {
  return [`Immeuble de ${lieuCourt(x) || "…"}`, rentaCourte(x.renta), prixCourt(x.prixHai)].filter(Boolean).join(" - ");
}

const champs = (im: Record<string, unknown>): ResumeImmeuble => {
  const n = (v: unknown) => (typeof v === "number" ? v : undefined);
  return {
    ville: typeof im.adresse_ville === "string" ? im.adresse_ville : undefined,
    codePostal: typeof im.adresse_zipcode === "string" ? im.adresse_zipcode : undefined,
    surface: n(im.surface_carrez),
    renta: n(im.fin_renta_ba),
    prixHai: n(im.prix_hai),
  };
};

/** Le même résumé depuis un document `immeuble` du miroir. */
export function resumeDepuisDoc(im: Record<string, unknown> | null | undefined, opts: { sms?: boolean } = {}): string {
  return im ? resumeImmeuble(champs(im), opts) : "";
}

/** L'objet court depuis un document `immeuble` du miroir. */
export function objetDepuisDoc(im: Record<string, unknown> | null | undefined): string {
  return im ? objetImmeuble(champs(im)) : "";
}

const lienOuRien = (lien: string | undefined) => (lien ?? "").trim();

/**
 * La dernière ligne des deux SMS, la même partout (MAV, 28/09).
 *
 * Le mot « STOP » y reste : MailingVox refuse la campagne sans lui (erreurs 24
 * et 38) et la CNIL l'impose. Mais pas de numéro : l'expéditeur est un numéro
 * court auquel on répond, et « ils ont juste à répondre STOP » (MAV, avec
 * MailingVox, 28/09).
 */
export const REPONDRE_SMS = "Répondre : Oui pour étudier Non pour archiver STOP pour ne plus recevoir";

/**
 * Le SMS d'envoi de dossier (commercialisation), mis en page comme MAV l'a
 * écrit : trois blocs séparés d'une ligne vide.
 */
export function smsEnvoiDossier(resume: string, lien: string | undefined): string {
  const l = lienOuRien(lien);
  return [
    `France Immeuble : Immeuble de rapport à vendre à ${resume || "…"}.`,
    l ? `Télécharger le dossier : ${l}` : "",
    REPONDRE_SMS,
  ].filter(Boolean).join("\n\n");
}

/** Le SMS de relance, même mise en page. */
export function smsRelance(resume: string, lien: string | undefined): string {
  const l = lienOuRien(lien);
  return [
    `France Immeuble : Avez-vous pu regarder l'immeuble de ${resume || "…"} ?`,
    l ? `Dossier : ${l}` : "",
    REPONDRE_SMS,
  ].filter(Boolean).join("\n\n");
}
