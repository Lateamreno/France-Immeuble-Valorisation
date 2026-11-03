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
 * L'objet : « Immeuble à vendre à Lille (59) - 425 k€ - 9,2 % - 2 203 €/m² ».
 *
 * Chaque élément manquant disparaît plutôt que de laisser un « n.c. » : un
 * objet d'e-mail est le seul endroit du BO où la place est comptée, et une
 * mention vide y coûte plus qu'elle ne rapporte.
 *
 * Retour #452 : « dans l'objet du mail, la renta que tu affiches, il faut que
 * ce soit tout le temps la renta potentielle, pas l'actuelle ». L'objet vend
 * l'immeuble loué en entier ; le corps, lui, détaille l'actuel et le potentiel.
 */
export function objetCommercialisation(b: BienMail): string {
  const dept = deptDeCp(b.codePostal);
  const ou = [villeNue(b.ville) || "vendre", dept ? `(${dept})` : ""].filter(Boolean).join(" ");
  /* Retour #594 : le potentiel, et lui seul — pas de repli sur l'actuel. */
  const renta = nb(b.rentaPotentielle);
  const bouts = [
    `Immeuble à vendre à ${ou}`,
    prixCourt(nb(b.prixHai)),
    renta !== undefined ? `${fr(renta)} %` : undefined,
    nb(b.prixM2) !== undefined ? `${fr(Math.round(nb(b.prixM2)!), 0)} €/m²` : undefined,
  ].filter(Boolean);
  /* Retour #430 : « à la place des virgules, un espace et un tiret ». */
  return bouts.join(" - ");
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
/**
 * Le rendement brut POTENTIEL tel que MAV le définit (retour #594) : les
 * loyers potentiels annuels (chaque lot à son loyer max, à défaut son loyer)
 * divisés par le prix HAI PLUS les travaux. C'est le seul rendement annoncé
 * aux acquéreurs, dans l'objet comme dans le texte. Arrondi au dixième.
 */
export function rendementPotentiel(loyersPotentielsAn: number, prixHai?: number, travaux?: number): number | undefined {
  const base = (prixHai ?? 0) + Math.max(0, travaux ?? 0);
  if (!(loyersPotentielsAn > 0) || !(prixHai && prixHai > 0) || !(base > 0)) return undefined;
  return Math.round((loyersPotentielsAn / base) * 1000) / 10;
}

/**
 * La phrase du rendement (retour #594) : toujours le POTENTIEL — loyers
 * potentiels ÷ (prix HAI + travaux). L'occupation dit dans quel état on achète,
 * le rendement ce que l'immeuble rapportera. Sans potentiel calculable, pas de
 * phrase : mieux vaut se taire qu'annoncer l'actuel à sa place (c'était le cas
 * de Paris 18, vide, annoncé à 1,2 %).
 */
export function phraseRendement(b: BienMail): string | undefined {
  const occ = nb(b.occupation);
  const rp = nb(b.rentaPotentielle);
  if (rp === undefined) return undefined;
  if (occ !== undefined && occ <= 0) {
    return `L'immeuble est actuellement vide, pour un rendement brut potentiel de ${fr(rp)} %.`;
  }
  if (occ === undefined || occ >= 100) {
    return `L'immeuble est intégralement loué, pour un rendement brut potentiel de ${fr(rp)} %.`;
  }
  return `L'immeuble est loué à ${fr(occ)} %, pour un rendement brut potentiel de ${fr(rp)} %.`;
}

/**
 * Plusieurs immeubles dans une même proposition (retour #450 : « un bouton
 * pour ajouter un autre immeuble à la proposition et du coup ça change l'objet
 * et le texte »). L'objet compte et nomme ; le corps garde l'intro et la
 * conclusion de l'e-mail à un bien, et met une ligne par immeuble.
 */
export function objetCommercialisationPlusieurs(biens: BienMail[]): string {
  if (biens.length === 1) return objetCommercialisation(biens[0]);
  const lieux = [...new Set(biens.map((b) => {
    const dept = deptDeCp(b.codePostal);
    return [villeNue(b.ville), dept ? `(${dept})` : ""].filter(Boolean).join(" ");
  }).filter(Boolean))];
  return `${biens.length} immeubles à vendre${lieux.length ? ` - ${lieux.join(", ")}` : ""}`;
}

export function messageCommercialisationPlusieurs(biens: { mail: BienMail; lien?: string }[]): string {
  if (biens.length === 1) return messageCommercialisation(biens[0].mail, biens[0].lien ?? "");
  const premier = biens[0]?.mail ?? {};
  const lignes = biens.flatMap(({ mail: b, lien }) => {
    const surface = nb(b.surfaceCarrez);
    const prix = nb(b.prixHai);
    const cp = String(b.codePostal ?? "").trim();
    const ou = `${villeNue(b.ville) || "adresse à préciser"}${/^\d{5}$/.test(cp) ? ` (${cp})` : ""}`;
    const tete = [
      `· ${groupeNominal(natureImmeuble(b.destinations)).replace(/^un /, "Un ")} à ${ou}`,
      surface !== undefined ? `${fr(Math.round(surface), 0)} m²` : "",
      prix !== undefined ? `${fr(Math.round(prix), 0)} € HAI` : "",
      nb(b.rentaPotentielle) !== undefined ? `${fr(nb(b.rentaPotentielle)!)} % de rendement brut potentiel` : "",
    ].filter(Boolean).join(", ");
    return [tete, lien ? `  Dossier, photos et plans : ${lien}` : "", ""];
  });
  return [
    "Bonjour,",
    "",
    `Vous trouverez ci-joint les dossiers de ${biens.length} immeubles :`,
    "",
    ...lignes,
    "Si l'un d'eux vous intéresse et que vous avez la moindre question, n'hésitez pas à me contacter je me ferai un plaisir d'y répondre.",
    "",
    PAS_INTERESSE,
    "",
    "Cordialement",
    "",
    premier.agentNom,
    "France Immeuble",
    premier.agentTel,
  ]
    .filter((l) => l !== undefined && l !== null)
    .map((l) => String(l))
    .filter((l, i, a) => !(l === "" && (i === 0 || a[i - 1] === "")))
    .join("\n")
    .trimEnd();
}

/**
 * Le corps de l'e-mail, au format que MAV envoie aujourd'hui à la main.
 *
 * Retour #358 : la phrase « Dans le cas contraire, pouvez-vous me le signaler
 * et si possible m'en indiquer la raison ? Cela me permettra de mettre à jour
 * ma base et d'affiner vos critères de recherche. » était lourde. MAV a
 * tranché le 06/10 pour une phrase courte, en texte, sans bouton : les
 * boutons OUI / NON supposent des liens publics vers l'espace client, et
 * viendront avec lui (§10 bis). Les réponses arrivent par e-mail, le relevé
 * les rattache à la proposition.
 */
const PAS_INTERESSE =
  "Pas intéressé ? Un mot en réponse, avec la raison si possible, m'aidera à affiner vos critères.";

const PHRASE_SANS_LIEN = "Vous pouvez me demander le dossier, les photos et les plans, je vous les transmets aussitôt.";
const phraseLien = (lien: string) => `Vous pouvez télécharger le dossier, les photos et les plans via ce lien : ${lien}`;

/**
 * Le message, avec le nouveau lien transfer.it À LA PLACE de l'ancien — sans
 * rien toucher d'autre (retour #594 : coller le lien régénérait tout le
 * message et effaçait les retouches de l'agent). Sans ancien lien, la phrase
 * « Vous pouvez me demander le dossier… » devient la phrase du lien. Si
 * l'agent a réécrit le passage, on ne devine pas : l'écran signale le lien
 * absent et propose de l'ajouter.
 */
export function avecLienDossier(message: string, ancien: string, nouveau: string): string {
  const a = ancien.trim(), n = nouveau.trim();
  if (!n) return message;
  if (a && message.includes(a)) return message.split(a).join(n);
  if (message.includes(PHRASE_SANS_LIEN)) return message.replace(PHRASE_SANS_LIEN, phraseLien(n));
  return message;
}

/** Ajoute la phrase du lien avant « Si ce dernier vous intéresse… », à défaut avant « Cordialement ». */
export function insererLienDossier(message: string, lien: string): string {
  const n = lien.trim();
  if (!n || message.includes(n)) return message;
  for (const ancre of [/^Si ce dernier vous intéresse/m, /^Cordialement/m]) {
    const i = message.search(ancre);
    if (i >= 0) return `${message.slice(0, i)}${phraseLien(n)}\n\n${message.slice(i)}`;
  }
  return `${message.trimEnd()}\n\n${phraseLien(n)}`;
}

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
    lien ? phraseLien(lien) : PHRASE_SANS_LIEN,
    "",
    "Si ce dernier vous intéresse et que vous avez la moindre question, n'hésitez pas à me contacter je me ferai un plaisir d'y répondre.",
    "",
    PAS_INTERESSE,
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
