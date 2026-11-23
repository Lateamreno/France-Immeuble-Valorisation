/**
 * Ce qu'une proposition est devenue : une visite, une offre.
 *
 * MAV, 23/11/26 (retours #629 et #630) : « ce client a fait une offre : à côté
 * de "Proposition du 16/11/26" ce serait bien d'indiquer que le client a fait
 * une offre et à combien. Genre "Offre à 450 k€ le xx/xx/xxxx" » ; « de la même
 * façon, afficher ceux qui ont visité : "Visite (prévue / effectuée) le
 * xx/xx/xxxx" ».
 *
 * La visite et l'offre vivent dans leurs propres fiches (`bo_visite`,
 * `bo_offre`), rattachées au contact et à l'immeuble — pas à la proposition.
 * On les rapproche ici par le couple contact + immeuble, et la carte de la
 * proposition n'a plus qu'à écrire la phrase.
 *
 * Fichier pur, sans import : c'est ce qui le rend testable.
 */

type Doc = Record<string, unknown>;

export type Suites = {
  /** « Offre à 450 k€ le 18/11/26 », avec son issue quand elle en a une. */
  offre?: string;
  /** « Visite effectuée le 20/11/26 », « Visite prévue le 02/12/26 ». */
  visite?: string;
};

const liste = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === "string" && v ? [v] : [];
const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** « 18/11/26 » depuis une date ISO, lue telle qu'elle est écrite (pas de fuseau). */
export function jourCourt(iso: unknown): string | undefined {
  const s = texte(iso);
  const m = s && /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : undefined;
}

/** « 450 k€ », « 1,25 M€ » — la façon dont un prix se dit au téléphone. */
export function montantCourt(n: unknown): string | undefined {
  if (typeof n !== "number" || !(n > 0)) return undefined;
  if (n >= 1_000_000) {
    const m = Math.round(n / 10_000) / 100;
    return `${String(m).replace(".", ",")} M€`;
  }
  return `${Math.round(n / 1000)} k€`;
}

/** L'issue d'une offre, quand elle en a une : rien tant qu'elle est en cours. */
function issueOffre(statut: string | undefined): string {
  const s = (statut ?? "").toLowerCase();
  if (s.startsWith("refus")) return " — refusée";
  if (s.startsWith("vendu")) return " — vendu";
  if (s.startsWith("contre")) return " — contre-offre";
  if (s.startsWith("accept") || s.startsWith("vente") || s.startsWith("compromis")) return " — acceptée";
  return "";
}

/** « Offre à 450 k€ le 18/11/26 — acceptée ». Le prix est celui de l'offre, honoraires inclus. */
export function mentionOffre(o: Doc): string {
  const prix = montantCourt(o.prix_hai) ?? montantCourt(o.prix_nv);
  const le = jourCourt(o.date) ?? jourCourt(o["Created Date"]);
  return `Offre${prix ? ` à ${prix}` : ""}${le ? ` le ${le}` : ""}${issueOffre(texte(o.Statut))}`;
}

/** « Visite effectuée le … », « Visite prévue le … » ; rien pour une visite annulée. */
export function mentionVisite(v: Doc): string | undefined {
  const s = (texte(v.Statut) ?? "").toLowerCase();
  if (s.startsWith("annul")) return undefined;
  const le = jourCourt(v.date);
  return `Visite ${s.startsWith("effectu") ? "effectuée" : "prévue"}${le ? ` le ${le}` : ""}`;
}

export const cleSuite = (contactId: string, immeubleId: string) => `${contactId}|${immeubleId}`;

/**
 * Pour chaque couple contact + immeuble : sa dernière offre et sa dernière
 * visite. Une offre peut porter plusieurs acquéreurs et plusieurs immeubles ;
 * une visite, plusieurs visiteurs.
 */
export function suitesDesPropositions(offres: Doc[], visites: Doc[]): Map<string, Suites> {
  const out = new Map<string, Suites>();
  const poser = (cle: string, champ: keyof Suites, valeur: string) => out.set(cle, { ...out.get(cle), [champ]: valeur });
  const parDate = (a: Doc, b: Doc) =>
    String(a.date ?? a["Created Date"] ?? "").localeCompare(String(b.date ?? b["Created Date"] ?? ""));
  // Du plus ancien au plus récent : le dernier écrit gagne.
  for (const o of [...offres].sort(parDate)) {
    for (const c of liste(o.ACHETEURs)) for (const im of liste(o.IMMEUBLEs)) poser(cleSuite(c, im), "offre", mentionOffre(o));
  }
  for (const v of [...visites].sort(parDate)) {
    const m = mentionVisite(v);
    if (!m) continue;
    for (const c of liste(v.VISITEURs)) for (const im of liste(v.IMMEUBLE)) poser(cleSuite(c, im), "visite", m);
  }
  return out;
}
