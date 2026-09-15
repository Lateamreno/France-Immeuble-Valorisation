/**
 * L'objet et le corps de l'e-mail de commercialisation (retours #357, #358).
 *
 * Règles pures, sans accès réseau ni React : c'est le seul moyen de les tester,
 * et le texte qui part à quelques centaines d'acquéreurs mérite des tests.
 *
 * MAV, #358 : « au niveau du texte de l'email je veux que tu restes
 * synthétique ». L'ancien message empilait des puces et recopiait le
 * descriptif entier du bien ; celui-ci tient en quatre paragraphes et dit
 * exactement ce qu'un investisseur regarde — où, combien de mètres, combien
 * d'euros, combien ça rapporte.
 */

const nb = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const fr = (v: number, max = 1) =>
  v.toLocaleString("fr-FR", { maximumFractionDigits: max });

/**
 * Le prix comme MAV le veut dans l'objet (#357) : « Prix HAI en X.X m€ quand
 * c'est en M€ sinon xxx k€ quand c'est en K€ ».
 *
 * Le seuil est le million, et le million s'écrit avec une décimale — 1,7 M€
 * dit ce que « 2 M€ » cacherait. En dessous, les milliers suffisent : personne
 * n'a besoin des centaines d'euros dans une ligne d'objet.
 */
export function prixCourt(v?: number): string | undefined {
  const p = nb(v);
  if (p === undefined || p <= 0) return undefined;
  if (p >= 1_000_000) return `${fr(p / 1_000_000, 1)} M€`;
  return `${fr(Math.round(p / 1000), 0)} k€`;
}

/** Les deux premiers chiffres du code postal — le département (#357). */
export const deptDeCp = (cp?: unknown): string | undefined => {
  const s = String(cp ?? "").trim();
  return /^\d{5}$/.test(s) ? s.slice(0, 2) : undefined;
};

export type BienMail = {
  ville?: string;
  codePostal?: unknown;
  surfaceCarrez?: unknown;
  prixHai?: unknown;
  /** Prix au m² du jour, déjà calculé par la fiche. */
  prixM2?: unknown;
  /** Occupation en pourcentage de lots. */
  occupation?: unknown;
  /** Rendement brut actuel. */
  renta?: unknown;
  /** Rendement brut si tout était loué (loyers de marché des lots vides). */
  rentaPotentielle?: unknown;
  /** Destinations distinctes des lots, pour « logement » ou « mixte ». */
  destinations?: string[];
  agentNom?: string;
  agentTel?: string;
};

/**
 * L'objet : « Immeuble à vendre à Lille (59), 425 k€, 9,2 %, 2 203 €/m² ».
 *
 * Chaque élément manquant disparaît plutôt que de laisser un « n.c. » : un
 * objet d'e-mail est le seul endroit du BO où la place est comptée, et une
 * mention vide y coûte plus qu'elle ne rapporte.
 */
export function objetCommercialisation(b: BienMail): string {
  const dept = deptDeCp(b.codePostal);
  const ou = [villeNue(b.ville) || "vendre", dept ? `(${dept})` : ""].filter(Boolean).join(" ");
  const bouts = [
    `Immeuble à vendre à ${ou}`,
    prixCourt(nb(b.prixHai)),
    nb(b.renta) !== undefined ? `${fr(nb(b.renta)!)} %` : undefined,
    nb(b.prixM2) !== undefined ? `${fr(Math.round(nb(b.prixM2)!), 0)} €/m²` : undefined,
  ].filter(Boolean);
  return bouts.join(", ");
}

/**
 * La nature de l'immeuble en un mot : « logement », « commerce »… ou
 * « mixte » dès qu'il y en a deux (#358 : « si plus d'une destination
 * indiquer mixte »).
 *
 * Les caves et les parkings ne comptent pas : un immeuble de logement avec
 * trois caves n'est pas mixte, il a des caves.
 */
const ACCESSOIRES = ["cave", "parking", "annexe"];
export function natureImmeuble(destinations?: string[]): string {
  const vraies = [...new Set(
    (destinations ?? [])
      .map((d) => String(d ?? "").trim().toLowerCase())
      .filter((d) => d && !ACCESSOIRES.includes(d)),
  )];
  if (vraies.length === 0) return "rapport";
  if (vraies.length > 1) return "mixte";
  return vraies[0];
}

/**
 * La nature dans la phrase, avec sa préposition.
 *
 * « un immeuble de mixte » ne se dit pas : mixte est un adjectif, les autres
 * sont des compléments. La règle tient en une ligne mais son absence se
 * lisait dans chaque e-mail.
 */
export const groupeNominal = (nature: string) =>
  nature === "mixte" ? "un immeuble mixte" : `un immeuble de ${nature}`;

/**
 * La ville sans son code postal.
 *
 * `b.ville` porte déjà « Lille (59000) » sur la fiche : lui réaccoler le code
 * postal donnait « Lille (59000) (59000) » dans le corps et
 * « Lille (59000) (59) » dans l'objet.
 */
export const villeNue = (v?: string) =>
  String(v ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();

/**
 * La phrase d'occupation et de rendement.
 *
 * Le cas de l'immeuble VIDE mérite sa propre phrase : « loué à 0 % pour un
 * rendement brut de 9,2 % » se contredit tout seul — sur un immeuble vide,
 * ce rendement est celui des loyers de marché, pas un encaissement.
 */
export function phraseRendement(b: BienMail): string | undefined {
  const occ = nb(b.occupation);
  const r = nb(b.renta);
  const rp = nb(b.rentaPotentielle);
  if (r === undefined && rp === undefined) return undefined;

  if (occ !== undefined && occ <= 0) {
    const cible = rp ?? r!;
    return `L'immeuble est actuellement vide. Loué, le rendement brut ressortirait à ${fr(cible)} %.`;
  }
  if (r === undefined) return undefined;

  const plein = occ === undefined || occ >= 100;
  const base = plein
    ? `L'immeuble est intégralement loué, pour un rendement brut de ${fr(r)} %.`
    : `L'immeuble est loué à ${fr(occ)} % pour un rendement brut de ${fr(r)} %.`;
  /* Le potentiel ne s'annonce que s'il ajoute quelque chose : sur un immeuble
     plein, ou quand il rejoint l'actuel, la phrase serait du remplissage. */
  if (!plein && rp !== undefined && rp - r >= 0.1) {
    return `${base} Intégralement loué, le rendement brut passera à ${fr(rp)} %.`;
  }
  return base;
}

/**
 * Le corps de l'e-mail, au format que MAV envoie aujourd'hui à la main.
 *
 * La phrase « pouvez-vous me le signaler et m'en indiquer la raison » reste du
 * texte : les boutons OUI / NON qu'il envisage supposent des liens publics
 * vers le BO, ce qui ne se décide pas dans un modèle d'e-mail.
 */
export function messageCommercialisation(b: BienMail, lien: string): string {
  const surface = nb(b.surfaceCarrez);
  const prix = nb(b.prixHai);
  const cp = String(b.codePostal ?? "").trim();
  const ou = `${villeNue(b.ville) || "l'adresse indiquée"}${/^\d{5}$/.test(cp) ? ` (${cp})` : ""}`;

  const intro = [
    `Vous trouverez ci-joint le dossier d'${groupeNominal(natureImmeuble(b.destinations))} à ${ou}`,
    surface !== undefined ? ` d'une surface de ${fr(Math.round(surface), 0)} m²` : "",
    prix !== undefined ? ` proposé à ${fr(Math.round(prix), 0)} € honoraires d'agence inclus` : "",
    ".",
  ].join("");

  return [
    "Bonjour,",
    "",
    intro,
    "",
    phraseRendement(b),
    "",
    lien
      ? `Vous pouvez télécharger le dossier, les photos et les plans via ce lien : ${lien}`
      : "Vous pouvez me demander le dossier, les photos et les plans, je vous les transmets aussitôt.",
    "",
    "Si ce dernier vous intéresse et que vous avez la moindre question, n'hésitez pas à me contacter je me ferai un plaisir d'y répondre.",
    "",
    "Dans le cas contraire, pouvez-vous me le signaler et si possible m'en indiquer la raison ? Cela me permettra de mettre à jour ma base et d'affiner vos critères de recherche.",
    "",
    "Cordialement",
    "",
    b.agentNom,
    "France Immeuble",
    b.agentTel,
  ]
    .filter((l) => l !== undefined && l !== null)
    .map((l) => String(l))
    /* Deux lignes vides de suite viennent d'un morceau absent, pas d'une
       intention de mise en page. */
    .filter((l, i, a) => !(l === "" && (i === 0 || a[i - 1] === "")))
    .join("\n")
    .trimEnd();
}
