// Les ventes publiées sur le site France Immeuble (contrat §4, lot 2).
//
// Une vente devient une page : /immeubles-vendus/<slug>/. Elle raconte un cas
// pratique, à partir des FAITS du dossier, et rien d'autre. Ce fichier ne
// contient que des fonctions pures : le calcul des faits, le gabarit qui en
// tire un premier texte, et le contrôle d'anonymat. Les accès au réseau sont
// dans lib/bo/ventes-site.ts.

import { BAUX_LIBRES, compteAuLot } from "./referentiels";

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const N = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export type ProfilAcquereur = "Investisseur" | "Marchand de biens" | "Patrimonial" | "Promoteur";
export type ProfilVendeur = "Particulier" | "Indivision" | "Société" | "Institutionnel";
export type ModeCommercialisation = "off_market" | "diffusion" | "mixte";

/** Les faits d'une vente. Les champs vides ne partent pas au site. */
export type FaitsVente = {
  commune: string;
  dept: string;
  arrondissement: string | null;
  /** La rue sans le numéro : affichée sur la page, jamais dans le texte. */
  rue: string | null;
  type: string | null;
  lots: number | null;
  composition: string | null;
  /** La surface exacte, en m² (décision de MAV du 21/10, côté site : elle
   *  remplace la tranche). Caves et parkings exclus. */
  surface: number | null;
  /** L'ancienne tranche de 100 m², gardée pour les ventes sans surface exacte. */
  surface_min: number | null;
  surface_max: number | null;
  epoque: string | null;
  dpe: string | null;
  /** En %, en surface. */
  occupation: number | null;
  /** En %, loyers HC annuels sur le prix de l'acte. */
  rendement: number | null;
  profil_acquereur: ProfilAcquereur | null;
  profil_vendeur: ProfilVendeur | null;
  mode_commercialisation: ModeCommercialisation | null;
  delai_semaines: number | null;
  acquereurs_sollicites: number | null;
  visites: number | null;
  offres: number | null;
  /** Loyer annuel hors charges si tout était loué, en euros. */
  loyer_potentiel: number | null;
  /** Jours entre la mise en commercialisation (A/B/C/D) et l'offre retenue ;
   *  0 quand l'offre a précédé l'envoi ou que l'envoi n'est pas daté (MAV, 21/10). */
  delai_offre_jours: number | null;
  /** La meilleure offre reçue comparée à l'estimation, en % (+3 = 3 % au-dessus).
   *  Décision de MAV du 21/10 : l'offre la plus haute, retenue ou non. */
  ecart_estimation: number | null;
  /** L'estimation retenue pour l'écart (honoraires inclus), pour l'écran. */
  estimation: number | null;
  /** La meilleure offre reçue, honoraires inclus : le prix de l'acte au moins. */
  meilleure_offre: number | null;
  /** Prix de l'acte, honoraires inclus. */
  prix: number;
  /** Date de l'acte, AAAA-MM-JJ. */
  date: string;
  region: "idf" | "sud-ouest" | "autre";
  /** Contexte de marché relevé par le BO pour la commune : sert au texte,
   *  ne part pas en colonne. */
  prix_m2: number | null;
  prix_m2_commune: number | null;
  loyer_m2_commune: number | null;
  rendement_commune: number | null;
};

/** Ce que le calcul des faits reçoit : la fiche et ses dépendances, déjà lues. */
export type SourcesVente = {
  vente: Record<string, unknown>;
  im: Record<string, unknown>;
  lots: Record<string, unknown>[];
  mandats: Record<string, unknown>[];
  offres: Record<string, unknown>[];
  visites: number;
  propositions: number;
  secteur: Record<string, unknown> | null;
  nbProprietaires: number;
  societeDetentrice: boolean;
  proprietaireEstSociete: boolean;
  /** Publié en ligne pendant la commercialisation (Plein Bail, site, ancien site). */
  publieEnLigne: boolean | null;
  /** La cible de l'acquéreur, lue sur sa recherche ou son type de contact. */
  cibleAcquereur: string | null;
  /** Les estimations du bien (Statut, prix_hai, date_envoi, Created Date). */
  estimations: Record<string, unknown>[];
  /** Le premier envoi du dossier aux acquéreurs (A/B/C/D) ou en annonce. */
  debutCommercialisation: number | undefined;
};

const IDF = new Set(["75", "77", "78", "91", "92", "93", "94", "95"]);

function departementDe(cp: string | undefined, repli?: string): string {
  const c = (cp ?? "").replace(/\s/g, "");
  if (/^20/.test(c)) return /^20[01]/.test(c) ? "2A" : "2B";
  if (/^97/.test(c)) return c.slice(0, 3);
  if (/^\d{2}/.test(c)) return c.slice(0, 2);
  return (repli ?? "").padStart(2, "0").slice(0, 3);
}

function arrondissementDe(cp: string, commune: string): string | null {
  const c = cp.replace(/\s/g, "");
  const ord = (n: number) => `${n}${n === 1 ? "er" : "e"} arrondissement`;
  if (/^paris/i.test(commune) && /^750\d\d$/.test(c)) return ord(parseInt(c.slice(3), 10));
  if (/^paris/i.test(commune) && c === "75116") return ord(16);
  if (/^lyon/i.test(commune) && /^6900\d$/.test(c)) return ord(parseInt(c.slice(4), 10));
  if (/^marseille/i.test(commune) && /^130(0\d|1[0-6])$/.test(c)) return ord(parseInt(c.slice(3), 10));
  return null;
}

/** « 1930 » → « Années 1930 ». Les années rondes de saisie (1800, 1900) restent prudentes. */
export function epoqueDe(annee: number | undefined): string | null {
  if (!annee || annee < 1500 || annee > 2100) return null;
  if (annee <= 1800) return "Avant 1900";
  if (annee < 1850) return "Première moitié du XIXe siècle";
  if (annee < 1900) return "Fin du XIXe siècle";
  if (annee === 1900) return "Début du XXe siècle";
  if (annee < 1915) return "Début du XXe siècle";
  return `Années ${Math.floor(annee / 10) * 10}`;
}

const LIBELLES: Record<string, [string, string]> = {
  Logement: ["appartement", "appartements"],
  Commerce: ["commerce", "commerces"],
  Bureau: ["bureau", "bureaux"],
  Logistique: ["local d'activité", "locaux d'activité"],
  Hôtel: ["hôtel", "hôtels"],
  Parking: ["parking", "parkings"],
  Cave: ["cave", "caves"],
  Annexe: ["annexe", "annexes"],
};
const ORDRE = ["Logement", "Commerce", "Bureau", "Logistique", "Hôtel", "Parking", "Cave", "Annexe"];

function enumerer(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}`;
}

/** « 7 appartements, 2 commerces et 3 parkings » */
export function compositionDe(lots: Record<string, unknown>[]): string | null {
  const n = new Map<string, number>();
  for (const l of lots) {
    const d = String(l.Destination ?? "");
    if (LIBELLES[d]) n.set(d, (n.get(d) ?? 0) + 1);
  }
  const parts = ORDRE.filter((d) => n.has(d)).map((d) => {
    const k = n.get(d)!;
    return `${k} ${LIBELLES[d][k > 1 ? 1 : 0]}`;
  });
  return parts.length ? enumerer(parts) : null;
}

/** Le type affiché, déduit des destinations des lots. */
export function typeDe(lots: Record<string, unknown>[]): string | null {
  const d = new Set(lots.map((l) => String(l.Destination ?? "")).filter(Boolean));
  if (!d.size) return null;
  const logement = d.has("Logement");
  if (logement && (d.has("Commerce") || d.has("Bureau"))) return "Immeuble mixte";
  if (logement) return "Immeuble de rapport";
  if (d.has("Bureau") && !d.has("Commerce")) return "Immeuble de bureaux";
  if (d.has("Commerce") && !d.has("Bureau") && !d.has("Logistique")) return "Murs commerciaux";
  if (d.has("Logistique")) return "Local d'activité";
  return "Immeuble de rapport";
}

const dateValide = (v: unknown) => {
  const s = S(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) && new Date(t).getFullYear() > 2000 ? t : undefined;
};

/** Mappe un type de contact ou une cible de recherche sur les quatre profils du site. */
export function profilAcquereurDe(v: string | null): ProfilAcquereur | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.includes("marchand")) return "Marchand de biens";
  if (s.includes("promoteur")) return "Promoteur";
  if (s.includes("patrimonial") || s.includes("family") || s.includes("sci")) return "Patrimonial";
  if (s.includes("investisseur") || s.includes("foncière") || s.includes("fonciere")) return "Investisseur";
  return null;
}

/**
 * Bubble range les dates en UTC à minuit heure de Paris : « 2026-01-29T23:00Z »
 * est le 30 janvier. On relit donc la date à Paris, en AAAA-MM-JJ.
 */
export function dateParis(v: unknown): string {
  const brute = S(v);
  const t = brute ? Date.parse(brute) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : (brute ?? "").slice(0, 10);
}

/** Les faits d'une vente, calculés depuis le dossier. */
export function faitsDe(src: SourcesVente): FaitsVente {
  const { vente, im, lots } = src;
  const cp = S(im.adresse_zipcode) ?? "";
  const commune = S(vente.ville) ?? S(im.adresse_ville) ?? "";
  const dept = departementDe(cp, S(vente["département"]));

  /* Surfaces et occupation, en surface, depuis l'état locatif. Caves et
     parkings se comptent au lot, jamais en surface (retours #250 et suivants). */
  const surfLot = (l: Record<string, unknown>) => (compteAuLot(l.Destination as string) ? 0 : N(l.surface_carrez) ?? N(l.surface_sol) ?? 0);
  /* Un lot sans surface rend la somme fausse : on prend alors la surface de la
     fiche si elle est plus grande, et sinon on ne donne pas de surface. Mieux
     vaut un fait absent qu'un prix au m² qui ment. */
  const aMesurer = lots.filter((l) => !compteAuLot(l.Destination as string));
  const manquants = aMesurer.filter((l) => !surfLot(l)).length;
  const sommeLots = lots.reduce((s, l) => s + surfLot(l), 0);
  const surfFiche = N(im.surface_carrez) ?? 0;
  const surface = manquants === 0 ? sommeLots || surfFiche : surfFiche > sommeLots ? surfFiche : 0;
  const occupe = (l: Record<string, unknown>) => (N(l.loyer) ?? 0) > 0 || !BAUX_LIBRES.has(String(l.Type_bail ?? ""));
  const surfOcc = lots.filter(occupe).reduce((s, l) => s + surfLot(l), 0);
  // L'occupation se lit en surface ; en nombre de lots si des surfaces manquent.
  const occupation = !aMesurer.length ? null
    : manquants === 0 && sommeLots > 0 ? Math.min(100, Math.round((surfOcc / sommeLots) * 100))
    : Math.round((aMesurer.filter(occupe).length / aMesurer.length) * 100);
  const loyersLots = lots.filter(occupe).reduce((s, l) => s + (N(l.loyer) ?? 0), 0) * 12;
  const loyers = loyersLots > 0 ? loyersLots : N(im.fin_loyers_an) ?? 0;

  const prix = N(vente.prix_hai) ?? N(im.prix_hai) ?? 0;

  /* L'offre retenue : celle passée « Vendu », sinon la première qui a mené à un
     compromis. Sa date sert au délai et borne le choix de l'estimation. */
  const retenue = src.offres.find((o) => o.Statut === "Vendu") ?? src.offres.find((o) => dateValide(o.date_compromis));
  const dOffre = dateValide(retenue?.date);
  /* MAV (21/10) : une vente sans délai calculable compte zéro jour. C'est le
     cas d'une offre arrivée avant le premier envoi (l'acquéreur était déjà
     là) ou d'un envoi que le BO n'a pas daté. */
  const delaiOffre = dOffre
    ? Math.max(0, src.debutCommercialisation ? Math.round((dOffre - src.debutCommercialisation) / 86_400_000) : 0)
    : undefined;

  /* L'estimation : la DERNIÈRE envoyée au propriétaire avant le mandat (ou
     avant l'offre retenue si elle est arrivée plus tôt). C'est le prix annoncé
     au vendeur au moment où il nous a confié la vente. La date qui compte est
     celle de l'envoi : les estimations d'avant 2022 portent toutes la date de
     leur import dans Bubble (20/09/2022) comme date de création. */
  const dMandat = src.mandats
    .flatMap((m) => [dateValide(m.date_signature), dateValide(m["Created Date"])])
    .filter((t): t is number => !!t).sort()[0];
  const borne = [dMandat, dOffre].filter((t): t is number => !!t).sort()[0];
  const ests = src.estimations
    .map((e) => ({ prix: N(e.prix_hai) ?? 0, le: dateValide(e.date_envoi) ?? dateValide(e["Created Date"]), envoyee: String(e.Statut ?? "").startsWith("3") }))
    .filter((e) => e.prix > 0 && e.le && (!borne || e.le <= borne + 86_400_000))
    .sort((a, b) => a.le! - b.le!);
  const est = ests.filter((e) => e.envoyee).at(-1) ?? ests.at(-1);
  /* L'écart se mesure sur la MEILLEURE offre reçue (MAV, 21/10) : six ventes
     ont eu une offre plus haute que le prix final, refusée. */
  const meilleure = Math.max(prix, ...src.offres.map((o) => N(o.prix_hai) ?? 0));
  const ecart = est && meilleure > 0 ? Math.round(((meilleure - est.prix) / est.prix) * 1000) / 10 : null;
  const loyerMax = N(im.fin_loyers_an_max) ?? 0;
  const rdt = prix > 0 && loyers > 0 ? Math.round((loyers / prix) * 1000) / 10 : null;

  // Le DPE de l'immeuble : une seule lettre partagée par tous les lots renseignés.
  const dpes = [...new Set(lots.map((l) => S(l.Type_dpe)).filter((d): d is string => !!d && /^[A-G]$/.test(d)))];

  // Le délai : de la signature du mandat au premier compromis.
  const debut = src.mandats.map((m) => dateValide(m.date_signature)).filter((t): t is number => !!t).sort()[0];
  const compromis = src.offres.map((o) => dateValide(o.date_compromis)).filter((t): t is number => !!t).sort()[0];
  const semaines = debut && compromis ? Math.round((compromis - debut) / (7 * 86_400_000)) : undefined;

  /* Le nombre d'acquéreurs sollicités : les propositions envoyées du dossier.
     Sous cinq, ce sont des traces de l'ancien outil, pas un envoi au fichier. */
  const sollicites = src.propositions >= 5 ? src.propositions : null;
  const mode: ModeCommercialisation | null =
    src.publieEnLigne === true ? (sollicites && sollicites >= 20 ? "mixte" : "diffusion")
      : src.publieEnLigne === false && sollicites ? "off_market"
      : null;

  const vendeur: ProfilVendeur | null = src.societeDetentrice || src.proprietaireEstSociete
    ? "Société"
    : src.nbProprietaires > 1 ? "Indivision"
    : src.nbProprietaires === 1 ? "Particulier"
    : null;

  const prixVille = N(src.secteur?.hab_prix_ville_moyen);
  const loyerVille = N(src.secteur?.hab_loyer_ville_moyen);
  const rdtVille = N(src.secteur?.hab_renta_ville_moyen);
  const date = dateParis(vente.date);

  return {
    commune,
    dept,
    arrondissement: arrondissementDe(cp, commune),
    rue: S(vente.rue) ?? S(im.adresse_rue) ?? null,
    type: typeDe(lots),
    lots: lots.length || null,
    composition: compositionDe(lots),
    surface: surface >= 20 ? Math.round(surface) : null,
    surface_min: surface >= 20 ? Math.floor(surface / 100) * 100 : null,
    surface_max: surface >= 20 ? Math.floor(surface / 100) * 100 + 100 : null,
    epoque: epoqueDe(N(im.year_constru)),
    dpe: dpes.length === 1 ? dpes[0] : null,
    occupation,
    rendement: rdt !== null && rdt >= 1 && rdt <= 40 ? rdt : null,
    profil_acquereur: profilAcquereurDe(src.cibleAcquereur),
    profil_vendeur: vendeur,
    mode_commercialisation: mode,
    delai_semaines: semaines !== undefined && semaines >= 1 && semaines <= 260 ? semaines : null,
    acquereurs_sollicites: sollicites,
    visites: src.visites > 0 ? src.visites : null,
    offres: src.offres.length > 0 ? src.offres.length : null,
    loyer_potentiel: loyerMax > 0 ? Math.round(loyerMax) : null,
    delai_offre_jours: delaiOffre !== undefined && delaiOffre <= 1825 ? delaiOffre : null,
    ecart_estimation: ecart !== null && ecart >= -100 && ecart <= 100 ? ecart : null,
    estimation: est ? est.prix : null,
    meilleure_offre: meilleure > 0 ? meilleure : null,
    prix,
    date,
    region: vente.idf === true || IDF.has(dept) ? "idf" : vente.bordeaux === true ? "sud-ouest" : "autre",
    prix_m2: prix > 0 && surface >= 20 ? Math.round(prix / surface) : null,
    prix_m2_commune: prixVille && prixVille >= 300 ? Math.round(prixVille) : null,
    loyer_m2_commune: loyerVille && loyerVille >= 3 ? Math.round(loyerVille * 10) / 10 : null,
    rendement_commune: rdtVille && rdtVille >= 1 && rdtVille <= 40 ? Math.round(rdtVille * 10) / 10 : null,
  };
}

/** Les faits qui comptent pour décider s'il y a matière à un récit (contrat §4). */
export function nombreDeFaits(f: FaitsVente): number {
  return [
    f.type, f.lots, f.composition, f.surface ?? f.surface_min, f.epoque, f.occupation, f.rendement,
    f.profil_acquereur, f.mode_commercialisation, f.delai_semaines, f.acquereurs_sollicites, f.visites, f.offres,
  ].filter((v) => v !== null && v !== undefined).length;
}

/* ----------------------------------------------------------------- Formats */

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const pct = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const moisAnnee = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "";
};
const lieuDe = (f: FaitsVente) => (f.arrondissement ? `${f.commune} ${f.arrondissement.replace(" arrondissement", "")}` : f.commune);
const nombreEnLettres = (n: number) =>
  ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze"][n] ?? String(n);

/** La faits de l'écran, au format « champ : valeur », pour le modèle. */
export function faitsEnTexte(f: FaitsVente): string {
  const lignes: [string, string | null][] = [
    ["Commune", `${f.commune} (${f.dept})`],
    ["Arrondissement", f.arrondissement],
    ["Type", f.type],
    ["Lots", f.lots !== null ? String(f.lots) : null],
    ["Composition", f.composition],
    ["Surface", f.surface !== null ? `${f.surface.toLocaleString("fr-FR")} m²` : f.surface_min === 0 ? `moins de ${f.surface_max} m²` : f.surface_min !== null ? `${f.surface_min} à ${f.surface_max} m²` : null],
    ["Époque", f.epoque],
    ["DPE", f.dpe],
    ["Occupation à la vente", f.occupation !== null ? `${f.occupation} %` : null],
    ["Rendement brut sur le prix de vente", f.rendement !== null ? pct(f.rendement) : null],
    ["Prix de l'acte", eur(f.prix)],
    ["Prix au m² de l'acte", f.prix_m2 !== null ? `${eur(f.prix_m2)}/m²` : null],
    ["Prix moyen au m² relevé dans la commune", f.prix_m2_commune !== null ? `${eur(f.prix_m2_commune)}/m²` : null],
    ["Loyer moyen au m² relevé dans la commune", f.loyer_m2_commune !== null ? `${f.loyer_m2_commune.toLocaleString("fr-FR")} €/m²/mois` : null],
    ["Rendement moyen relevé dans la commune", f.rendement_commune !== null ? pct(f.rendement_commune) : null],
    ["Loyer annuel potentiel, tout loué", f.loyer_potentiel !== null ? eur(f.loyer_potentiel) : null],
    ["Date de l'acte", moisAnnee(f.date)],
    ["Profil de l'acquéreur", f.profil_acquereur],
    ["Profil du vendeur", f.profil_vendeur],
    ["Commercialisation", f.mode_commercialisation === "off_market" ? "off-market, auprès du fichier d'acquéreurs, sans annonce"
      : f.mode_commercialisation === "diffusion" ? "par annonces en ligne"
      : f.mode_commercialisation === "mixte" ? "d'abord off-market auprès du fichier, puis en annonces" : null],
    ["Délai entre la signature du mandat et le compromis", f.delai_semaines !== null ? `${f.delai_semaines} semaines` : null],
    /* Zéro jour veut dire « offre avant le premier envoi, ou envoi non daté »,
       pas « offre le jour même » : on ne le donne pas au modèle. */
    ["Délai entre le premier envoi du dossier et l'offre retenue", f.delai_offre_jours ? `${f.delai_offre_jours} jours` : null],
    // Validé par MAV le 21/10 : l'écart peut être cité dans le récit.
    ["Meilleure offre reçue comparée à l'estimation", f.ecart_estimation !== null ? `${f.ecart_estimation > 0 ? "+" : ""}${pct(f.ecart_estimation)}` : null],
    ["Acquéreurs du fichier ayant reçu le dossier", f.acquereurs_sollicites !== null ? String(f.acquereurs_sollicites) : null],
    ["Visites", f.visites !== null ? String(f.visites) : null],
    ["Offres reçues", f.offres !== null ? String(f.offres) : null],
  ];
  return lignes.filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`).join("\n");
}

/* ----------------------------------------------------------------- Gabarit */

export type Recit = {
  titre: string;
  chapo: string;
  recit: string;
  seo_title: string;
  seo_desc: string;
};

/** Variante stable pour une vente donnée : même vente, même tournure. */
function choix<T>(graine: string, cle: string, options: T[]): T {
  let h = 2166136261;
  for (const c of `${graine}:${cle}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return options[h % options.length];
}

const ACQUEREUR: Record<ProfilAcquereur, string[]> = {
  "Investisseur": [
    "Un investisseur regarde d'abord le rendement en place, puis ce que l'immeuble peut encore donner. Il achète des loyers, et une capacité à les faire progresser.",
    "Pour un investisseur, un immeuble de rapport se juge sur la régularité des loyers et sur ce qu'ils coûtent à entretenir. C'est cette lecture qui a fait le prix.",
  ],
  "Marchand de biens": [
    "Un marchand de biens achète en bloc pour revendre par lots. Il regarde la différence entre le prix de l'ensemble et la somme des prix au détail, et le temps qu'il lui faudra pour la réaliser.",
    "Le marchand de biens raisonne en marge et en délai : ce que vaudront les lots une fois vendus séparément, et ce qu'il faudra engager pour y arriver.",
  ],
  "Patrimonial": [
    "Un acquéreur patrimonial achète pour garder. Il privilégie la qualité de l'emplacement et la tenue de l'immeuble à un rendement immédiat plus élevé.",
    "Pour un acquéreur patrimonial, l'horizon se compte en décennies : la solidité du bâti et de la demande locative compte davantage que quelques dixièmes de rendement.",
  ],
  "Promoteur": [
    "Un promoteur regarde le foncier et ce qu'il permet de construire ou de transformer, plus que les loyers en place.",
    "Le promoteur achète un potentiel : des droits à bâtir, une transformation possible, un usage à changer.",
  ],
};

/** « vendu » ou « vendus » : les murs commerciaux sont au pluriel. */
const vendu = (type: string) => (/^murs/i.test(type) ? "vendus" : "vendu");

/** Le titre et la description pour Google : la commune et le type, sans fioriture. */
export function seoDe(f: FaitsVente, chapo: string): { seo_title: string; seo_desc: string } {
  const type = f.type ?? "Immeuble de rapport";
  const suffixe = " | France Immeuble";
  const long = `${type}${f.lots && f.lots > 1 ? ` de ${f.lots} lots` : ""} ${vendu(type)} à ${lieuDe(f)}`;
  const court = `${type} ${vendu(type)} à ${lieuDe(f)}`;
  const t = long.length + suffixe.length <= 70 ? long : court.slice(0, 70 - suffixe.length);
  return { seo_title: `${t}${suffixe}`, seo_desc: chapo.slice(0, 170) };
}

/**
 * Le premier texte, construit sans IA à partir des faits (décision MAV du
 * 21/10). Des blocs en variantes, choisis selon les faits et l'identifiant de
 * la vente ; un bloc dont les faits manquent disparaît. MAV le relit, peut le
 * faire réécrire, et le valide avant toute publication.
 */
export function recitGabarit(f: FaitsVente, graine: string): Recit {
  const lieu = lieuDe(f);
  const type = f.type ?? "Immeuble de rapport";
  const lots = f.lots ? `${f.lots} lot${f.lots > 1 ? "s" : ""}` : null;
  const typeMin = type.charAt(0).toLowerCase() + type.slice(1);
  const offMarket = f.mode_commercialisation === "off_market";

  // Le titre et le chapô : la commune et le fait le plus parlant.
  const titre = (offMarket
    ? `${type}${lots ? ` de ${lots}` : ""} ${vendu(type)} à ${lieu}, sans annonce`
    : f.offres && f.offres >= 3
      ? `${type}${lots ? ` de ${lots}` : ""} à ${lieu} : ${f.offres} offres reçues`
      : `${type}${lots ? ` de ${lots}` : ""} ${vendu(type)} à ${lieu}`).slice(0, 90);
  const bouts = [
    f.epoque ? `${typeMin} ${f.epoque.toLowerCase().startsWith("années") ? `des ${f.epoque.toLowerCase()}` : `(${f.epoque.toLowerCase()})`}` : typeMin,
    f.occupation !== null ? `occupé à ${f.occupation} %` : null,
  ].filter(Boolean);
  const chapo = (`${bouts.join(", ").replace(/^./, (c) => c.toUpperCase())}, ${vendu(type)} ${eur(f.prix)}` +
    (f.delai_semaines ? ` en ${f.delai_semaines} semaines` : "") +
    (f.profil_acquereur ? ` à un ${f.profil_acquereur.toLowerCase()}` : "") +
    (f.offres && f.offres > 1 ? `, sur ${f.offres} offres` : "") + ".").slice(0, 170);

  const sections: { titre: string; corps: string }[] = [];

  // L'ouverture : ce qui distingue cette vente.
  if (offMarket && f.acquereurs_sollicites) {
    sections.push({
      titre: choix(graine, "o1", [`Vendu sans annonce à ${f.commune}`, `${f.acquereurs_sollicites} acquéreurs sollicités, aucune annonce`]),
      corps: `Cet immeuble n'a jamais été publié. Le dossier a été adressé à ${f.acquereurs_sollicites} acquéreurs de notre fichier` +
        (f.visites ? `, ${f.visites} l'ont visité` : "") +
        (f.offres ? ` et ${f.offres === 1 ? "une offre a été retenue" : `${f.offres} offres ont été reçues`}` : "") + "." +
        (f.delai_semaines ? ` Entre la signature du mandat et celle du compromis, il s'est écoulé ${f.delai_semaines} semaines.` : "") +
        " Vendre sans annonce, c'est protéger la discrétion du vendeur et ne présenter le bien qu'à des acquéreurs dont on connaît déjà les critères et la capacité de financement.",
    });
  } else if (f.offres && f.offres >= 2) {
    sections.push({
      titre: f.delai_semaines ? `${nombreEnLettres(f.offres).replace(/^./, (c) => c.toUpperCase())} offres en ${f.delai_semaines} semaines` : `${f.offres} offres pour un seul immeuble`,
      corps: `La commercialisation a fait naître ${f.offres} offres` +
        (f.acquereurs_sollicites ? ` après l'envoi du dossier à ${f.acquereurs_sollicites} acquéreurs` : "") + "." +
        " Plusieurs offres, c'est ce qui permet au vendeur de choisir non seulement un prix, mais aussi la solidité du financement et le calendrier qui lui conviennent.",
    });
  }

  // Le bien.
  const bien = [
    `L'immeuble${f.composition ? ` compte ${f.composition}` : lots ? ` compte ${lots}` : ""}` +
      (f.surface !== null ? `, pour ${f.surface.toLocaleString("fr-FR")} m²` : f.surface_min === 0 ? `, pour moins de ${f.surface_max} m²` : f.surface_min !== null ? `, pour une surface de ${f.surface_min} à ${f.surface_max} m²` : "") + ".",
    f.epoque ? choix(graine, "ep", [`Sa construction remonte ${f.epoque.startsWith("Années") ? `aux ${f.epoque.toLowerCase()}` : `à la période « ${f.epoque.toLowerCase()} »`}.`, `C'est un immeuble ${f.epoque.startsWith("Années") ? `des ${f.epoque.toLowerCase()}` : `bâti ${f.epoque.toLowerCase()}`}.`]) : null,
    f.dpe ? `Son diagnostic de performance énergétique le classe en ${f.dpe}.` : null,
  ].filter(Boolean).join(" ");
  if (bien.length > 30) {
    sections.push({
      titre: choix(graine, "b", [lots ? `${lots.replace(/^./, (c) => c.toUpperCase())} à ${f.commune}` : `Un immeuble de rapport à ${f.commune}`, `Ce qui était à vendre à ${f.commune}`]),
      corps: bien,
    });
  }

  // L'état locatif et le prix.
  const locatif = [
    f.occupation !== null ? (f.occupation >= 95 ? "Le jour de la vente, l'immeuble était entièrement loué." : `Le jour de la vente, ${f.occupation} % de la surface était louée.`) : null,
    f.rendement !== null ? `Rapportés au prix de l'acte, ${eur(f.prix)}, les loyers en place donnaient un rendement brut de ${pct(f.rendement)}.` : `Le prix de l'acte s'est établi à ${eur(f.prix)}.`,
    f.prix_m2 !== null ? `Soit ${eur(f.prix_m2)} le mètre carré${f.prix_m2_commune ? `, quand le prix moyen relevé dans la commune s'établit autour de ${eur(f.prix_m2_commune)}` : ""}.` : null,
    f.rendement !== null && f.rendement_commune !== null ? (f.rendement > f.rendement_commune
      ? `Un rendement supérieur à la moyenne relevée à ${f.commune} (${pct(f.rendement_commune)}) : c'est ce qui rend un immeuble de rapport liquide.`
      : `Un rendement proche de la moyenne relevée à ${f.commune} (${pct(f.rendement_commune)}).`) : null,
  ].filter(Boolean).join(" ");
  sections.push({ titre: choix(graine, "l", ["Des loyers et un prix", f.rendement ? `${pct(f.rendement)} brut à l'acte` : "Le prix de l'acte"]), corps: locatif });

  // L'acquéreur.
  if (f.profil_acquereur) {
    sections.push({
      titre: `Un ${f.profil_acquereur.toLowerCase()} à l'achat`,
      corps: choix(graine, "a", ACQUEREUR[f.profil_acquereur]) +
        (f.profil_vendeur ? ` En face, ${f.profil_vendeur === "Indivision" ? "une indivision, qui devait trouver une issue commune" : f.profil_vendeur === "Société" ? "une société, qui arbitrait un actif" : "un particulier, qui vendait en bloc"}.` : ""),
    });
  }

  // Ce que la vente enseigne.
  sections.push({
    titre: "Ce qu'un propriétaire peut en retenir",
    corps: choix(graine, "e", [
      `Un immeuble de rapport se vend d'autant mieux que son dossier est complet : état locatif à jour, baux, charges, diagnostics. C'est ce qui permet de présenter le bien aux bons acquéreurs dès le premier jour et de tenir le prix jusqu'à l'acte.`,
      `Vendre un immeuble en bloc, c'est vendre des loyers et un potentiel. Le prix se défend avec des chiffres vérifiables, et il se joue souvent avant même la première visite, dans la qualité du dossier envoyé aux acquéreurs.`,
    ]),
  });

  const recit = sections.slice(0, 5).map((s) => `## ${s.titre}\n\n${s.corps}`).join("\n\n");
  return { titre, chapo, recit, ...seoDe(f, chapo) };
}

/* ------------------------------------------------------- Contrôle d'anonymat */

export type Alerte = { cle: string; texte: string };

const VOIES = "rue|avenue|boulevard|bd|impasse|allée|allee|place|quai|chemin|cours|passage|square|villa|route|sentier|cité|cite";

/**
 * Bloque avant publication (contrat §4) : un nom de voie, un code postal suivi
 * d'une commune, un nom du dossier, une mention restée « [à vérifier] », ou le
 * nom de la rue de l'immeuble. La base du site refait les deux premiers.
 */
export function controleAnonymat(textes: string[], interdits: string[], rue: string | null): Alerte[] {
  const t = textes.join("\n");
  const out: Alerte[] = [];
  /* La même règle que `texte_sans_adresse` dans la base du site : le mot de
     voie, puis un NOM qui commence par une majuscule. Sans drapeau « i » :
     « les loyers en place donnaient » n'est pas une adresse. */
  const voies = VOIES.split("|").map((w) => `[${w[0]}${w[0].toUpperCase()}]${w.slice(1)}`).join("|");
  const voie = new RegExp(`(^|[^\\p{L}])(${voies})\\s+(de\\s+la\\s+|de\\s+l['’]|du\\s+|des\\s+|de\\s+|d['’])?\\p{Lu}\\p{Ll}`, "u");
  const m = voie.exec(t);
  if (m) out.push({ cle: "voie", texte: `Nom de voie : « ${t.slice(m.index, m.index + 40).trim().split(/[,.;\n]/)[0]} »` });
  const cp = /(^|[^0-9])[0-9]{5}\s+\p{Lu}/u.exec(t);
  if (cp) out.push({ cle: "cp", texte: `Code postal suivi d'une commune : « ${t.slice(cp.index, cp.index + 24).trim()} »` });
  if (/\[à vérifier\]/i.test(t)) out.push({ cle: "verifier", texte: "Une mention « [à vérifier] » reste à trancher." });
  const noyau = rue?.replace(new RegExp(`^\\s*(${VOIES})\\s+(de\\s+la\\s+|de\\s+l['’]|des\\s+|du\\s+|de\\s+|la\\s+|le\\s+)?`, "i"), "").trim();
  if (noyau && noyau.length >= 4 && new RegExp(noyau.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(t)) {
    out.push({ cle: "rue", texte: `Le texte cite la rue de l'immeuble (« ${noyau} ») : elle s'affiche à part, jamais dans le texte.` });
  }
  for (const nom of interdits) {
    const n = nom.trim();
    if (n.length < 3) continue;
    /* Un nom propre s'écrit avec sa majuscule : « un petit immeuble » ne cite
       pas M. PETIT. La casse du reste du mot, elle, est indifférente. */
    const re = new RegExp(`(^|[^\\p{L}])(${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=[^\\p{L}]|$)`, "giu");
    if ([...t.matchAll(re)].some((m) => /^\p{Lu}/u.test(m[2]))) {
      out.push({ cle: `nom:${n}`, texte: `Nom d'une personne ou d'une société du dossier : « ${n} »` });
    }
  }
  return out;
}

/** Les consignes de rédaction, données au modèle pour la réécriture. */
export const CONSIGNES_REDACTION = `Tu rédiges, pour le site de France Immeuble (agence spécialisée dans la vente d'immeubles de rapport en bloc), le récit d'une vente réalisée : un cas pratique. Le but est de montrer, faits à l'appui, la maîtrise de l'agence sur ce marché, et d'apprendre quelque chose d'utile à un propriétaire qui envisage de vendre.

RÈGLES DE FOND
1. N'utilise QUE les faits fournis. N'invente aucun chiffre, aucune date, aucune caractéristique, aucune anecdote. Un fait absent n'est pas mentionné, ni deviné, ni remplacé par une généralité qui le simule.
2. Emplacement : parle de la commune (ou de l'arrondissement à Paris, Lyon, Marseille) et des repères de marché fournis (prix et loyer moyens relevés dans la commune). Seules les généralités notoires et vérifiables sont admises. Ne cite AUCUNE rue, place, adresse, aucun commerce, monument ou équipement voisin. En cas de doute sur une affirmation géographique, écris-la entre crochets [à vérifier].
3. Jamais de nom de personne ni de société.
4. Jamais le motif personnel de la vente. « Indivision » est un profil, pas une histoire.
5. Jamais le prix de mandat ni l'écart de négociation. Le prix de l'acte, oui. L'écart entre la meilleure offre reçue et l'estimation peut être cité, en %, s'il figure dans les faits.
6. Surface telle que fournie (exacte quand elle l'est).

RÈGLES DE FORME
7. 350 à 650 mots. Français naturel et descriptif, phrases courtes, le ton d'un agent expérimenté qui raconte une vente à un confrère. Aucun superlatif creux (« exceptionnel », « unique », « idéal »), aucune formule publicitaire.
8. Rien qui sonne écrit par une IA : pas de tiret long ni de tiret cadratin, jamais de tournure du type « non pas X, mais Y » ou « pour X, jamais Y », pas de deux-points dramatiques, pas d'énumérations en trois temps répétées, pas de phrase de conclusion moralisatrice.
9. 3 à 5 intertitres, chacun sur une ligne seule précédée de « ## ». Le premier contient la commune. Formule-les comme des constats propres à CETTE vente (« Neuf lots, un seul vacant »), pas comme des rubriques (« L'emplacement »). Commence par ce qui distingue cette vente.
10. Couvre, quand les faits le permettent : le bien ; la commune et ses repères de marché ; l'état locatif et le rendement comparé à celui de la commune ; la commercialisation (mode, acquéreurs sollicités, visites, offres, délai) ; l'acquéreur (son profil et ce qu'un tel profil recherche) ; ce que la vente enseigne à un propriétaire qui voudrait vendre un bien comparable.
11. Vocabulaire : « immeuble de rapport » 2 à 3 fois, « vente en bloc » si le contexte s'y prête, le nom de la commune 2 à 4 fois, naturellement.
12. Termine par un paragraphe utile au vendeur, sans appel à l'action ni numéro de téléphone.
13. Texte brut : paragraphes séparés par une ligne vide, intertitres « ## ». Ni gras, ni liens, ni listes, ni HTML.

RENDS exactement, dans cet ordre, séparés par une ligne « --- » :
TITRE : une phrase de 90 caractères maximum, avec la commune et un fait distinctif.
---
CHAPÔ : 1 à 2 phrases, 170 caractères maximum, avec 2 ou 3 chiffres clés.
---
RÉCIT : le texte.`;

/** Lit la réponse du modèle : TITRE --- CHAPÔ --- RÉCIT. */
export function lireReponse(texte: string): { titre: string; chapo: string; recit: string } | null {
  const parts = texte.split(/^\s*---\s*$/m).map((p) => p.trim());
  if (parts.length < 3) return null;
  const nettoie = (p: string, cle: RegExp) => p.replace(cle, "").trim();
  return {
    titre: nettoie(parts[0], /^TITRE\s*:\s*/i).slice(0, 90),
    chapo: nettoie(parts[1], /^CHAP[ÔO]\s*:\s*/i).slice(0, 170),
    recit: nettoie(parts.slice(2).join("\n\n"), /^R[ÉE]CIT\s*:\s*/i),
  };
}

export const compterMots = (t: string) => t.replace(/^##.*$/gm, "").split(/\s+/).filter(Boolean).length;

/**
 * Les tics d'écriture que MAV ne veut pas voir (21/10) : tiret long à la place
 * d'une virgule, « non pas X, mais Y », « pour X, jamais Y ». Ils ne bloquent
 * pas la publication, ils s'affichent pour qu'on les reprenne.
 */
export function ticsDeStyle(textes: string[]): Alerte[] {
  const t = textes.join("\n");
  const out: Alerte[] = [];
  if (/[—–]/.test(t)) out.push({ cle: "tiret", texte: "Tiret long : remplacez-le par une virgule ou un point." });
  const nonPas = /\b(non pas|pas seulement|pas uniquement)\b[^.\n]{0,80},\s*mais\b/i.exec(t);
  if (nonPas) out.push({ cle: "nonpas", texte: `Tournure « pas X, mais Y » : « ${nonPas[0].slice(0, 60)} »` });
  const jamais = /\bpour [^.,\n]{1,60},\s*jamais\b/i.exec(t);
  if (jamais) out.push({ cle: "jamais", texte: `Tournure « pour X, jamais Y » : « ${jamais[0].slice(0, 60)} »` });
  const creux = /\b(exceptionnel(le)?s?|unique|idéal(e|es)?|incontournable|rare opportunité)\b/i.exec(t);
  if (creux) out.push({ cle: "creux", texte: `Superlatif creux : « ${creux[0]} »` });
  return out;
}
