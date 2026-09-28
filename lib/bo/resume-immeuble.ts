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
// (« pas besoin de détail après les centaines de milliers »). La mention STOP
// reste au bout des SMS : la CNIL l'impose et MailingVox refuse sans elle.
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

/** « Sens (89), 479 m², 9 %, 840 k€ HAI » — chaque morceau absent saute. */
export function resumeImmeuble(x: ResumeImmeuble): string {
  const dpt = departement(x.codePostal);
  const ville = (x.ville ?? "").trim().replace(/\s*\(\d{5}\)\s*$/, "");
  const ou = ville ? `${ville}${dpt ? ` (${dpt})` : ""}` : dpt ? `(${dpt})` : "";
  const prix = prixCourt(x.prixHai);
  return [
    ou,
    typeof x.surface === "number" && x.surface > 0 ? `${Math.round(x.surface)} m²` : "",
    rentaCourte(x.renta),
    prix ? `${prix} HAI` : "",
  ].filter(Boolean).join(", ");
}

/** Le même résumé depuis un document `immeuble` du miroir. */
export function resumeDepuisDoc(im: Record<string, unknown> | null | undefined): string {
  if (!im) return "";
  const n = (v: unknown) => (typeof v === "number" ? v : undefined);
  return resumeImmeuble({
    ville: typeof im.adresse_ville === "string" ? im.adresse_ville : undefined,
    codePostal: typeof im.adresse_zipcode === "string" ? im.adresse_zipcode : undefined,
    surface: n(im.surface_carrez),
    renta: n(im.fin_renta_ba),
    prixHai: n(im.prix_hai),
  });
}

const lienOuRien = (lien: string | undefined) => (lien ?? "").trim();

/** Le SMS d'envoi de dossier (commercialisation). */
export function smsEnvoiDossier(resume: string, lien: string | undefined, stop: string): string {
  const l = lienOuRien(lien);
  return [
    `France Immeuble : Immeuble de rapport à vendre à ${resume || "…"}.`,
    l ? `Télécharger le dossier : ${l}` : "",
    `Répondre Oui pour infos et Non pour classement.`,
    `STOP au ${stop}`,
  ].filter(Boolean).join(" ");
}

/** Le SMS de relance. */
export function smsRelance(resume: string, lien: string | undefined, stop: string): string {
  const l = lienOuRien(lien);
  return [
    `France Immeuble : Avez-vous pu regarder l'immeuble de ${resume || "…"} ?`,
    l ? `Dossier : ${l}` : "",
    `Répondre Oui pour infos et Non pour classement.`,
    `STOP au ${stop}`,
  ].filter(Boolean).join(" ");
}
