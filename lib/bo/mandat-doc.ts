// Le mandat de vente en bloc — moteur de rédaction.
//
// Ce module produit l'OBJET du document ; `components/mandat-doc.tsx` le met
// en page. Les deux se lisent avec les maquettes validées sous les yeux
// (docs/mandats-reference/) : ce sont elles la spécification, pas une
// inspiration, et tout écart de formulation ou de découpage est un bug.
//
// Trois régimes, un seul document : simple, semi-exclusif, exclusif. Ils ne
// diffèrent que par cinq points, tous rassemblés ici — le titre, les lignes du
// registre, la frise, l'article Exclusivité (absent en simple) et le deuxième
// alinéa de la clause pénale.
//
// La découpe viendra plus tard : elle ajoute trois articles et un tableau de
// lots paginé, et suppose une valeur par lot que le module découpe ne sait pas
// encore produire.

import { dureeEnLettres, entierEnLettres, euroEnLettres, nombreAvecChiffre } from "@/lib/nombre-lettres";
import { adresseImmeuble, lotOccupe, synthese, type Mandant } from "@/lib/mandat";

/* ------------------------------------------------------------ Formatage */

const NB = " "; // espace insécable

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Séparateur de milliers insécable, comme l'exige la typographie française. */
const sep = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB);

/** « 4 620 000,00 € » — deux décimales, virgule, espaces insécables. */
export const eur = (n: number) => {
  const t = Math.round(Math.abs(n) * 100);
  const e = Math.floor(t / 100);
  const c = String(t % 100).padStart(2, "0");
  return `${n < 0 ? "−" : ""}${sep(e)},${c}${NB}€`;
};

/** « 4 620 000 € » — sans décimales, pour les vignettes de prix. */
export const eurCourt = (n: number) => `${sep(Math.round(n))}${NB}€`;

/** « 1 180 m² ». */
export const surf = (n: number) => `${sep(Math.round(n))}${NB}m²`;

/** « 5,00 % ». */
export const pct = (n: number) => `${n.toFixed(2).replace(".", ",")}${NB}%`;

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
  "août", "septembre", "octobre", "novembre", "décembre"];

/** « 27 août 2026 » — dans le texte rédigé. */
export const dateLongue = (d: Date) =>
  `${d.getDate()}${d.getDate() === 1 ? "er" : ""} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;

/** « 27/08/2026 » — dans les registres et la frise. */
export const dateCourte = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

const ajouteMois = (d: Date, mois: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + mois);
  return r;
};
const ajouteJours = (d: Date, jours: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + jours);
  return r;
};

/**
 * Une durée en jours, écrite comme le mandat l'écrit.
 *
 * Le stock est en jours — c'est ce que porte la base et ce que borne l'article
 * 78 du décret de 1972 (trois mois maximum). Mais un multiple de trente se lit
 * mieux en mois : « deux (2) mois » plutôt que « soixante (60) jours ».
 */
export function dureeJours(jours: number): { texte: string; court: string; mois: number } {
  if (jours > 0 && jours % 30 === 0) {
    const m = jours / 30;
    return { texte: dureeEnLettres(m, "mois"), court: `${m} mois`, mois: m };
  }
  return { texte: dureeEnLettres(jours, "jours"), court: `${jours} jours`, mois: jours / 30 };
}

/* -------------------------------------------------------------- Le régime */

export type Regime = "simple" | "semi_exclusif" | "exclusif";

/** Le libellé du BO (`Type_exclu`) vers le régime du document. */
export function regimeDe(v: unknown): Regime {
  const t = S(v).toLowerCase();
  if (t.startsWith("exclusif")) return "exclusif";
  if (t.startsWith("semi")) return "semi_exclusif";
  return "simple";
}

/**
 * Défauts d'irrévocabilité par régime, en jours.
 *
 * Plus le mandataire s'engage, plus la période d'irrévocabilité se justifie :
 * on ne demande pas trois mois pour un mandat simple. Plafond de quatre-vingt-
 * dix jours dans tous les cas (article 78 du décret du 20 juillet 1972), dès
 * lors qu'il existe une clause d'exclusivité ou une clause pénale — ce qui est
 * le cas de tous nos mandats.
 */
export const IRREVOC_DEFAUT: Record<Regime, number> = {
  simple: 14,
  semi_exclusif: 30,
  exclusif: 90,
};

/** Plafond légal de l'irrévocabilité, en jours. */
export const IRREVOC_MAX = 90;

/* --------------------------------------------------------- Le mandataire */

/** Identité de France Immeuble, telle qu'elle figure au mandat. */
export const MANDATAIRE = {
  nom: "France Immeuble S.A.S.",
  raisonSociale: `France Immeuble S.A.S. — SAS au capital de 100${NB}000,00${NB}€`,
  siren: "835 369 562 — RCS Paris",
  siege: "66 avenue des Champs-Élysées, 75008 Paris",
  carte: "CPI 7501 2018 000 026 00 — CCI Paris Île-de-France",
  garantie: `Garantie financière 120${NB}000${NB}€ (GALIAN) · RCP MMA Entreprises n°${NB}120 137 405`,
  representant: "Marc-Antoine VOCI, Président",
  contactDefaut: "06.30.76.83.81 — ma.voci@france-immeuble.fr",
  pied: "France Immeuble S.A.S. — 66 avenue des Champs-Élysées, 75008 Paris — Carte professionnelle CPI 7501 2018 000 026 00",
  email: "contact@france-immeuble.fr",
};

export const MEDIATEUR =
  "Médiateur désigné conformément à l'article R.616-1 du Code de la consommation : "
  + "Médiation – Vivons mieux ensemble, 465 avenue de la Libération, 54000 Nancy — "
  + "www.mediation-vivons-mieux-ensemble.fr";

/* ---------------------------------------------------------- Les mandants */

export type DocMandant = {
  rang: string;         // « Mandant 01 »
  role: string;         // « Personne physique » / « Personne morale »
  nom: string;
  lignes: { k: string; v: string }[];
  /** Ce qui s'imprime sous le nom dans la case de signature. */
  qualiteSignature: string;
};

/* ------------------------------------------------------------ Le document */

export type LigneRegistre = { k: string; note?: string; v: string };
export type LigneCompo = { nature: string; nb: string; surface: string; occupation: string; loyer?: string };
export type Barre = {
  label: string; classe: string; largeur: number; duree: string; echeance: string;
  /** La barre est trop courte pour porter son libellé : il se pose à côté. */
  dehors: boolean;
};

export type DocMandat = {
  numero: string;
  regime: Regime;
  /** Le mandat n'a pas encore de numéro de registre : il ne peut pas être signé. */
  sansNumero: boolean;

  titre: string;
  refEntete: string;
  eyebrow: string;
  sousTitre: string;
  heroMeta: string;

  introMandants: string;
  mandants: DocMandant[];
  contactNegociateur: string;
  emailNegociateur: string;

  designation: string[];
  compo: LigneCompo[];
  compoTotal: LigneCompo;
  avecLoyer: boolean;

  prixParagraphe: string;
  prixVignettes: { nv: string; honos: string; hai: string; noteHonos: string; noteHai: string };
  prixRegistre: LigneRegistre[];
  prixNote: string;

  registre: LigneRegistre[];
  dureeParagraphes: string[];
  /** Le paragraphe en caractères très apparents (article 78). */
  apparent: string;
  dureeFine: string;
  friseLead: string;
  frise: Barre[];

  exclusivite: { paragraphes: string[]; fine: string } | null;

  penale: string[];
  penaleFine: string;

  registreMention: string;
  signatureIntro: string;
  signataires: { role: string; nom: string; qualite: string }[];

  annexeIntro: string[];
  annexeCoupon: string;

  /** Numéros d'articles résolus : { parties: 1, bien: 2, … }. */
  art: Record<string, number>;
  /** Titres dans l'ordre, avec leur numéro. */
  articles: { cle: string; num: number; titre: string }[];
  /** Nombre de pages du corps — l'annexe n'y compte pas. */
  pagesCorps: number;
};

/* --------------------------------------------------------------- Le moteur */

const A_COMPLETER = "……………………";
const req = (v: string, trous: string[], quoi: string) => {
  if (v) return v;
  trous.push(quoi);
  return A_COMPLETER;
};

export type EntreeMandat = {
  m: Record<string, unknown>;
  im: Record<string, unknown>;
  lots: Record<string, unknown>[];
  /* Le type des mandants vient de `lib/mandat.ts`, il n'est pas redéclaré
     ici : `qualite` y porte la CIVILITÉ et `fonction` la qualité au mandat
     (gérant, indivisaire…). Les confondre écrivait « représentée par Aaron
     VOCI, M. » au lieu de « …, gérant ». */
  mandants: Mandant[];
  negociateur?: { nom?: string; tel?: string; email?: string };
};

/** Ce qui manque pour que le document soit signable. */
export type Trous = string[];

export function redigerMandatBloc(e: EntreeMandat): { doc: DocMandat; trous: Trous } {
  const trous: Trous = [];
  const { m, im, lots } = e;
  const regime = regimeDe(m.Type_exclu);

  /* --- Identification --- */
  const numero = S(m.numero) || A_COMPLETER;
  const sansNumero = !S(m.numero);
  if (sansNumero) trous.push("le numéro d'inscription au registre des mandats");

  const titre = regime === "exclusif" ? "Mandat de vente exclusif"
    : regime === "semi_exclusif" ? "Mandat de vente semi-exclusif"
    : "Mandat de vente simple";
  /* L'en-tête du semi-exclusif porte la mention du régime : les trois
     documents se ressemblent, et c'est elle qui les distingue au feuilletage. */
  const refEntete = regime === "semi_exclusif"
    ? `Mandat semi-exclusif n° ${numero} · France Immeuble`
    : `Mandat n° ${numero} · France Immeuble`;

  /* --- Durées et dates --- */
  const signature = m.date_effet ? new Date(S(m.date_effet)) : new Date();
  const dureeMois = N(m["durée_tot_month"]) ?? 12;
  const fin = ajouteMois(signature, dureeMois);
  const irrevocJours = Math.min(IRREVOC_MAX, N(m["durée_irrevoc_days"]) ?? IRREVOC_DEFAUT[regime]);
  const finIrrevoc = ajouteJours(signature, irrevocJours);
  const irrevoc = dureeJours(irrevocJours);

  /* L'exclusivité de l'exclusif court sur toute la durée du mandat ; celle du
     semi-exclusif est saisie et s'éteint d'elle-même à son terme. */
  const exclusifTotal = regime === "exclusif";
  const exclusiviteJours = exclusifTotal
    ? Math.round(dureeMois * 30)
    : N(m["durée_exclu_jours"]) ?? 90;
  const finExclu = exclusifTotal ? fin : ajouteJours(signature, exclusiviteJours);
  const exclu = exclusifTotal
    ? { texte: dureeEnLettres(dureeMois, "mois"), court: `${dureeMois} mois`, mois: dureeMois }
    : dureeJours(exclusiviteJours);
  /* Révocation de la seule exclusivité : propre à l'exclusif. Par défaut à la
     fin de l'irrévocabilité — avant, le mandant ne peut rien dénoncer du tout. */
  const revocExclu = m.date_revoc_exclu ? new Date(S(m.date_revoc_exclu)) : finIrrevoc;

  /* --- Numérotation dynamique des articles --- */
  const plan: { cle: string; titre: string }[] = [
    { cle: "parties", titre: "Les parties" },
    { cle: "bien", titre: "Le bien et le prix" },
    { cle: "duree", titre: "Durée, irrévocabilité et dénonciation" },
    ...(regime === "simple" ? [] : [{ cle: "exclusivite", titre: "Exclusivité" }]),
    { cle: "penale", titre: "Clause pénale" },
    { cle: "obligations", titre: "Obligations des parties" },
    { cle: "mentions", titre: "Mentions légales" },
    { cle: "signatures", titre: "Signatures" },
  ];
  const articles = plan.map((p, i) => ({ ...p, num: i + 1 }));
  const art: Record<string, number> = {};
  for (const a of articles) art[a.cle] = a.num;

  /* --- Le bien --- */
  const s = synthese(lots);
  const adresse = adresseImmeuble(im);
  const ville = S(im.adresse_ville).toUpperCase();
  const cp = S(im.adresse_zipcode);
  const rue = [S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ");
  const annee = N(im.year_constru);
  const etages = N(im.nb_etage);
  const cadastre = S(m.ref_cadastre);
  const terrain = N(m.surface_terrain) ?? N(im.surface_terrain);

  const designation: string[] = [];
  designation.push(
    `Dans un ensemble immobilier sis à <b>${req(ville && cp ? `${ville} (${cp})` : "", trous, "la ville et le code postal")}, ${req(rue, trous, "la rue de l'immeuble")}</b>`
    + (annee ? `, édifié en ${annee}` : "")
    + (etages ? `, élevé sur rez-de-chaussée de ${entierEnLettres(etages)} étage${etages > 1 ? "s" : ""}` : "")
    + (cadastre ? `, cadastré <b>${cadastre}</b>` : "")
    + (terrain ? ` pour une contenance de ${sep(Math.round(terrain))}${NB}m²` : "")
    + ".",
  );

  const parDest = s.parDestination;
  if (parDest.length > 0) {
    const detail = parDest
      .map((d) => `<b>${nombreAvecChiffre(d.nb)} ${d.destination.toLowerCase()}${d.nb > 1 ? "s" : ""}</b>`)
      .join(", ");
    designation.push(
      `Ledit immeuble comprenant ${detail}, représentant une surface privative totale d'environ <b>${surf(s.surface)}</b> `
      + "au sens de l'article 46 de la loi du 10 juillet 1965.",
    );
  }

  /* Trois variantes, jamais interchangeables : c'est la phrase que lit le
     notaire pour savoir si un droit de préemption locatif peut jouer. */
  const loyerAnnuel = s.loyerMensuel * 12;
  if (s.occupation === "libre") {
    designation.push(
      "L'immeuble est à ce jour <b>entièrement libre de toute occupation</b>, l'ensemble des baux ayant pris fin. "
      + "Il est vendu en bloc, en l'état.",
    );
  } else if (s.occupation === "occupe") {
    designation.push(
      `L'immeuble est à ce jour <b>entièrement loué</b>, soit ${nombreAvecChiffre(s.occupes)} locaux loués, `
      + `générant un loyer annuel global hors charges de <b>${eur(loyerAnnuel)}</b>. `
      + "L'état locatif détaillé lot par lot est annexé au dossier de commercialisation.",
    );
  } else {
    designation.push(
      "L'immeuble est à ce jour occupé pour partie : "
      + `<b>${nombreAvecChiffre(s.occupes)} locaux loués</b> et `
      + `<b>${nombreAvecChiffre(s.libres)} locaux libres</b>, `
      + `générant un loyer annuel global hors charges de <b>${eur(loyerAnnuel)}</b>. `
      + "L'état locatif détaillé lot par lot est annexé au dossier de commercialisation.",
    );
  }

  /* --- Composition, une ligne par destination --- */
  const avecLoyer = s.occupation !== "libre";
  /* Le regroupement DOIT employer la même clé que `synthese` — `Destination`,
     avec sa majuscule. Une clé différente rendait des lignes vides : le
     tableau annonçait « Libres » partout sous un texte disant « entièrement
     loué », et le total portait un loyer que le détail ne montrait pas. */
  const compo: LigneCompo[] = parDest.map((d) => {
    const deLa = lots.filter((l) => String(l.Destination ?? "Autre") === d.destination);
    const loues = deLa.filter(lotOccupe).length;
    const libres = deLa.length - loues;
    const loyer = deLa.reduce((t, l) => t + (N(l.loyer) ?? 0), 0) * 12;
    return {
      nature: d.destination,
      nb: String(d.nb),
      surface: d.surface ? surf(d.surface) : "—",
      occupation: !avecLoyer ? "Libres"
        : loues === 0 ? "Libres"
        : libres === 0 ? `${loues} loué${loues > 1 ? "s" : ""}`
        : `${loues} loué${loues > 1 ? "s" : ""} · ${libres} libre${libres > 1 ? "s" : ""}`,
      loyer: avecLoyer ? (loyer ? eurCourt(loyer) : "—") : undefined,
    };
  });
  const compoTotal: LigneCompo = {
    nature: "Total",
    nb: String(s.lots),
    surface: s.surface ? surf(s.surface) : "—",
    occupation: s.occupation === "libre" ? "Entièrement libre"
      : s.occupation === "occupe" ? `${s.occupes} loués`
      : `${s.occupes} loués · ${s.libres} libres`,
    loyer: avecLoyer ? eurCourt(loyerAnnuel) : undefined,
  };

  /* --- Prix et honoraires --- */
  const nv = N(m.prix_nv) ?? 0;
  const taux = N(m.honos_taux) ?? 5;
  const honos = N(m.honos_ttc) ?? Math.round(nv * taux / 100);
  const hai = N(m.prix_hai) ?? nv + honos;
  // TVA 20 % incluse dans des honoraires TTC : la part de taxe vaut le sixième.
  const tva = Math.round(honos / 6 * 100) / 100;
  if (!nv) trous.push("le prix net vendeur");

  const chargeVendeur = S(m.Charge_hono) === "Vendeur";
  const aCharge = chargeVendeur ? "à la charge du vendeur" : "à la charge de l'acquéreur";

  const prixParagraphe =
    `Le prix de vente HAI, honoraires d'agence inclus, est fixé à la somme de <b>${eur(hai)}</b> (${euroEnLettres(hai)}), `
    + `se décomposant en un prix net vendeur de <b>${eur(nv)}</b> (${euroEnLettres(nv)}) `
    + `et des honoraires de <b>${eur(honos)}</b> (${euroEnLettres(honos)}) toutes taxes comprises, `
    + `soit <b>${pct(taux)} TTC du prix net vendeur</b>, dont ${eur(tva)} (${euroEnLettres(tva)}) `
    + `de taxe sur la valeur ajoutée, <b>${aCharge}</b>.`;

  const prixVignettes = {
    nv: eurCourt(nv),
    honos: eurCourt(honos),
    hai: eurCourt(hai),
    noteHonos: `${pct(taux)} TTC du net vendeur`,
    noteHai: "Honoraires d'agence inclus · payé par l'acquéreur",
  };

  const prixRegistre: LigneRegistre[] = [
    { k: "Prix net vendeur", note: "Somme revenant au Mandant, hors honoraires et hors TVA si applicable", v: eur(nv) },
    {
      k: "Honoraires du Mandataire",
      note: `Soit ${pct(taux)} TTC du prix net vendeur, dont ${eur(tva)} de TVA · ${aCharge}`,
      v: eur(honos),
    },
    {
      k: "Prix de vente HAI",
      note: chargeVendeur
        ? "Honoraires d'agence inclus · somme payée par l'acquéreur, aucun honoraire n'étant ajouté à sa charge"
        : "Honoraires d'agence inclus · somme payée par l'acquéreur",
      v: eur(hai),
    },
  ];

  /* La justification de l'imputation change avec l'occupation : sur un bien
     loué, la charge vendeur protège la rémunération en cas de préemption, le
     prix notifié au locataire ne pouvant être majoré d'honoraires acquéreur. */
  const prixNote =
    "Les honoraires sont payables au comptant à la signature de l'acte authentique, par prélèvement sur le prix entre les mains du notaire. "
    + (s.occupation === "libre"
      ? "Le bien étant libre de toute occupation, aucun droit de préemption locatif n'est susceptible d'être exercé. Les frais d'acte et droits d'enregistrement s'ajoutent au prix de vente HAI et restent à la charge de l'acquéreur. "
      : "Le bien comportant des lots loués, cette imputation à la charge du vendeur est retenue afin de préserver la rémunération du Mandataire en cas d'exercice d'un droit de préemption. Les frais d'acte et droits d'enregistrement restent à la charge de l'acquéreur. ")
    + "Le prix net vendeur peut être modifié par avenant, assorti de la modification corrélative des honoraires selon le barème en vigueur consultable sur www.france-immeuble.fr.";

  /* --- Registre de la durée --- */
  const registre: LigneRegistre[] = [
    { k: "Date de signature", v: dateCourte(signature) },
    { k: "Durée du mandat", note: "Sans reconduction tacite", v: `${dureeMois} mois — jusqu'au ${dateCourte(fin)}` },
    {
      k: "Durée d'irrévocabilité",
      note: "Période pendant laquelle le mandat ne peut être dénoncé",
      v: `${irrevoc.court} — jusqu'au ${dateCourte(finIrrevoc)}`,
    },
  ];
  if (regime !== "simple") {
    registre.push({
      k: "Durée de l'exclusivité",
      note: exclusifTotal
        ? "Consentie pour toute la durée du mandat, sauf révocation"
        : "Extinction automatique à ce terme, le mandat se poursuivant en mandat simple",
      v: `${exclu.court} — jusqu'au ${dateCourte(finExclu)}`,
    });
  }
  if (regime === "exclusif") {
    registre.push({
      k: "Révocation de l'exclusivité",
      note: "Date à partir de laquelle le Mandant peut lever la seule exclusivité",
      v: `possible à compter du ${dateCourte(revocExclu)}`,
    });
  }

  /* --- Article Durée --- */
  const negoEmail = e.negociateur?.email || "ma.voci@france-immeuble.fr";
  const tete =
    `Le présent mandat est signé le <b>${dateLongue(signature)}</b> pour une durée de `
    + `<b>${dureeEnLettres(dureeMois, "mois")}</b>. Il prendra fin de plein droit le `
    + `<b>${dateLongue(fin)}</b>, sans reconduction tacite. `;
  const dureeParagraphes: string[] = [
    regime === "exclusif"
      ? tete + `Il est consenti à titre <b>exclusif pour toute sa durée</b>, avec une période d'irrévocabilité de `
        + `<b>${irrevoc.texte}</b>. L'exclusivité pourra être révoquée seule à compter du `
        + `<b>${dateLongue(revocExclu)}</b>, dans les conditions de l'article ${art.exclusivite}.`
      : regime === "semi_exclusif"
      ? tete + `Il est consenti avec une exclusivité de <b>${exclu.texte}</b>, dont une période d'irrévocabilité de `
        + `<b>${irrevoc.texte}</b>.`
      : tete + `Il est consenti à titre <b>non exclusif</b>, avec une période d'irrévocabilité de <b>${irrevoc.texte}</b>.`,
    `Pendant la période d'irrévocabilité, soit jusqu'au <b>${dateLongue(finIrrevoc)} inclus</b>, le Mandant ne peut pas `
      + "mettre fin au mandat, que celui-ci comporte ou non une clause d'exclusivité.",
  ];

  /* Le paragraphe que l'article 78 du décret du 20 juillet 1972 impose « en
     caractères très apparents ». Son absence est sanctionnée par la nullité
     ABSOLUE du mandat entier : il a sa classe à lui, et rien ne doit la
     surcharger. */
  const apparent =
    "Passé cette période, chacune des parties peut dénoncer le mandat à tout moment. La partie qui entend y mettre fin "
    + "en avise l'autre <b>quinze (15) jours au moins à l'avance</b>, par lettre recommandée avec avis de réception, "
    + "par lettre recommandée électronique ou par courriel adressé au négociateur en charge du mandat, "
    + `<b>${negoEmail}</b>, le délai courant à compter de la réception.`;

  const dureeFine =
    "La durée d'irrévocabilité ne peut excéder trois mois (article 78 du décret n° 72-678 du 20 juillet 1972)."
    + (regime === "exclusif"
      ? " Elle est indépendante de la date de révocabilité de l'exclusivité, librement convenue entre les parties."
      : "");

  /* --- La frise --- */
  const totalJours = Math.max(1, dureeMois * 30);
  /* En dessous d'environ un huitième de la frise, le libellé ne tient plus
     dans la barre et débordait par-dessus le fond. La maquette a prévu la
     classe : il se pose alors juste à droite de la barre. */
  const DEHORS = 13;
  const frise: Barre[] = [
    { label: "Mandat", classe: "b-mandat", largeur: 100, duree: `${dureeMois} mois`, echeance: dateCourte(fin), dehors: false },
  ];
  if (regime !== "simple") {
    const lExclu = Math.min(100, Math.round((exclusifTotal ? totalJours : exclusiviteJours) / totalJours * 10000) / 100);
    frise.push({
      label: "Exclusivité", classe: "b-exclu", largeur: lExclu,
      duree: exclu.court, echeance: dateCourte(finExclu), dehors: lExclu < DEHORS,
    });
  }
  const lIrr = Math.min(100, Math.round(irrevocJours / totalJours * 10000) / 100);
  frise.push({
    label: "Irrévocabilité", classe: "b-irr", largeur: lIrr,
    duree: irrevoc.court, echeance: dateCourte(finIrrevoc), dehors: lIrr < DEHORS,
  });
  const friseLead = regime === "simple"
    ? `Les périodes ci-dessous courent à compter de la signature, le ${dateLongue(signature)}.`
    : regime === "exclusif"
    ? `Les périodes ci-dessous courent à compter de la signature, le ${dateLongue(signature)}.`
    : `Les trois périodes courent à compter de la signature, le ${dateLongue(signature)}.`;

  /* --- Article Exclusivité --- */
  const exclusivite = regime === "simple" ? null : {
    paragraphes: exclusifTotal
      ? [
          "L'exclusivité interdit au Mandant, pendant toute sa durée, de confier la vente du bien à un autre intermédiaire "
            + "et de traiter directement avec un acquéreur, quelle que soit l'origine de celui-ci. Elle est ici consentie "
            + `<b>pour toute la durée du mandat</b>, soit jusqu'au <b>${dateLongue(fin)} inclus</b>.`,
          `Le Mandant peut mettre fin à la seule exclusivité, sans dénoncer le mandat, <b>à compter du ${dateLongue(revocExclu)}</b>, `
            + "date convenue aux présentes. Le mandat se poursuit alors jusqu'à son échéance en qualité de mandat simple : "
            + "le Mandant retrouve la faculté de confier la vente à d'autres intermédiaires et de traiter directement, "
            + "les honoraires du Mandataire restant dus pour tout acquéreur qu'il aura présenté.",
          "Cette révocation s'effectue dans les mêmes formes et avec le même préavis de <b>quinze (15) jours</b> que la dénonciation du mandat.",
        ]
      : [
          "L'exclusivité interdit au Mandant, pendant toute sa durée, de confier la vente du bien à un autre intermédiaire "
            + "et de traiter directement avec un acquéreur, quelle que soit l'origine de celui-ci. Elle est ici consentie pour "
            + `<b>${exclu.texte}</b>, soit jusqu'au <b>${dateLongue(finExclu)} inclus</b>.`,
          "À ce terme, <b>l'exclusivité s'éteint automatiquement</b>, sans formalité ni préavis. Le mandat se poursuit "
            + "jusqu'à son échéance en qualité de mandat simple : le Mandant retrouve la faculté de confier la vente à "
            + "d'autres intermédiaires et de traiter directement, les honoraires du Mandataire restant dus pour tout "
            + "acquéreur qu'il aura présenté.",
        ],
    fine: exclusifTotal
      ? "La date de révocabilité de l'exclusivité et la durée d'irrévocabilité du mandat sont deux stipulations distinctes, "
        + "librement convenues entre les parties. À défaut de révocation, l'exclusivité se poursuit jusqu'au terme du mandat."
      : "L'exclusivité s'éteignant d'elle-même au terme convenu, aucune démarche n'est nécessaire de la part du Mandant. "
        + `Celui-ci conserve par ailleurs, passé la période d'irrévocabilité, la faculté de dénoncer le mandat dans son intégralité dans les conditions de l'article ${art.duree}.`,
  };

  /* --- Clause pénale --- */
  /* Le mandat simple ne peut pas sanctionner une vente conclue ailleurs : le
     mandant a précisément le droit de le faire. Ne restent que le refus sans
     motif légitime et la protection post-mandat. */
  const penale: string[] = [
    "Le Mandant s'engage à régulariser tout avant-contrat avec un acquéreur présenté par le Mandataire qu'il aura accepté, "
      + "aux prix, charges et conditions des présentes ou modifiés par avenant.",
    regime === "simple"
      ? "Si le Mandant <b>refuse sans motif légitime</b> de signer avec un acquéreur présenté par le Mandataire aux "
        + "conditions du présent mandat, il s'engage à verser à ce dernier, en application de l'article 1231-5 du Code civil, "
        + "une <b>indemnité compensatrice forfaitaire égale au montant des honoraires stipulés au présent mandat</b>."
      : `Si, <b>pendant ${exclusifTotal ? "toute la durée de l'exclusivité" : "la période d'exclusivité"}</b>, le Mandant vend le bien sans le concours du Mandataire, `
        + "par l'intermédiaire d'un autre professionnel ou en violation de l'exclusivité, ou s'il refuse sans motif légitime "
        + "de signer avec un acquéreur présenté par le Mandataire, il s'engage à verser à ce dernier, en application de "
        + "l'article 1231-5 du Code civil, une <b>indemnité compensatrice forfaitaire égale au montant des honoraires "
        + "stipulés au présent mandat</b>.",
    "Il en va de même si la vente intervient dans les <b>douze (12) mois</b> suivant la fin du mandat au profit d'un "
      + "acquéreur que le Mandataire aura <b>effectivement présenté</b> au Mandant pendant la durée de celui-ci.",
  ];
  const penaleFine =
    (regime === "simple"
      ? "Le présent mandat étant dépourvu de clause d'exclusivité, <b>aucune indemnité n'est due du seul fait que le "
        + "Mandant a confié la vente à un autre intermédiaire ou traité directement</b>. "
      : "")
    + "Cette stipulation ne s'applique pas aux acquéreurs que le Mandant aurait trouvés par lui-même et auxquels le "
    + "Mandataire n'aura jamais présenté le bien. En cas de contestation, il appartient au Mandataire de justifier de la "
    + "présentation. L'indemnité ne peut excéder le montant des honoraires stipulés au mandat.";

  /* --- Les mandants --- */
  const mandants: DocMandant[] = e.mandants.map((x, i) => {
    const rang = `Mandant ${String(i + 1).padStart(2, "0")}`;
    // La qualité au mandat, en minuscules dans une phrase : « …, gérant ».
    const fonction = (S(x.fonction) || "représentant légal").toLowerCase();
    if (x.personne === "morale") {
      const so = x.societe ?? {};
      const nom = req(S(so.nom), trous, `la raison sociale du mandant ${i + 1}`);
      const rep = [S(x.qualite), S(x.prenom), S(x.nom)].filter(Boolean).join(" ");
      return {
        rang, role: "Personne morale", nom,
        lignes: [
          { k: "Capital", v: so.capital ? `Société au capital de ${eur(so.capital)}` : A_COMPLETER },
          { k: "SIREN / RCS", v: [S(so.siren), S(so.rcs) && `RCS ${S(so.rcs)}`].filter(Boolean).join(" — ") || A_COMPLETER },
          { k: "Siège social", v: req(S(so.siege), trous, `le siège du mandant ${i + 1}`) },
          { k: "Représentée par", v: rep ? `${rep}, ${fonction}` : A_COMPLETER },
        ],
        qualiteSignature: rep ? `Représentée par ${rep}, ${fonction}` : "Représentée par son représentant légal",
      };
    }
    const nom = [S(x.qualite), S(x.prenom), S(x.nom)].filter(Boolean).join(" ");
    return {
      rang, role: "Personne physique",
      nom: req(nom, trous, `le nom du mandant ${i + 1}`),
      lignes: [
        { k: "Date de naissance", v: S(x.dateNaissance) || A_COMPLETER },
        { k: "Lieu de naissance", v: S(x.lieuNaissance) || A_COMPLETER },
        { k: "Adresse", v: req(S(x.adresse), trous, `l'adresse du mandant ${i + 1}`) },
      ],
      qualiteSignature: S(x.fonction) || "Personne physique",
    };
  });
  if (mandants.length === 0) trous.push("au moins un mandant");

  /* La phrase d'introduction dépend du nombre de mandants et de leur qualité :
     un mandant seul ne « s'oblige pas solidairement » avec personne. */
  /* La qualité collective : « copropriétaires », « indivisaires »… Elle vient
     de la qualité au mandat, jamais de la civilité, et retombe sur
     « propriétaire » quand elle n'est pas renseignée — un mandant l'est
     toujours, à défaut d'être autre chose. */
  const brute = S(e.mandants[0]?.fonction).toLowerCase();
  const qualite = brute && brute.length > 3 ? brute : "propriétaire";
  const introMandants = mandants.length > 1
    ? `Les mandants ci-dessous, ${qualite}s du bien désigné à l'article ${art.bien}, agissent conjointement et s'obligent solidairement.`
    : `Le mandant ci-dessous est ${qualite === "propriétaire" ? "le propriétaire" : `${qualite}`} du bien désigné à l'article ${art.bien}.`;

  /* --- Signatures --- */
  const signataires = [
    { role: "Le Mandataire", nom: MANDATAIRE.nom, qualite: MANDATAIRE.representant },
    ...mandants.map((x, i) => ({
      role: `Le Mandant ${String(i + 1).padStart(2, "0")}`,
      nom: x.nom,
      qualite: x.qualiteSignature,
    })),
  ];

  const heroMeta = [
    "Immeuble de rapport",
    adresse,
    "Vente en bloc",
    `Signé le ${dateLongue(signature)}`,
  ].join(" · ");

  const sousTitre = regime === "exclusif"
    ? "Exclusivité consentie pour toute la durée du mandat"
    : regime === "semi_exclusif"
    ? `Mandat exclusif dont l'exclusivité est limitée à ${exclu.court}`
    : "Mandat sans clause d'exclusivité";

  return {
    trous,
    doc: {
      numero, regime, sansNumero, titre, refEntete,
      eyebrow: `Mandat n° ${numero} · Registre des mandats`,
      sousTitre, heroMeta,
      introMandants, mandants,
      contactNegociateur: [e.negociateur?.tel, e.negociateur?.email].filter(Boolean).join(" — ") || MANDATAIRE.contactDefaut,
      emailNegociateur: negoEmail,
      designation, compo, compoTotal, avecLoyer,
      prixParagraphe, prixVignettes, prixRegistre, prixNote,
      registre, dureeParagraphes, apparent, dureeFine, friseLead, frise,
      exclusivite, penale, penaleFine,
      registreMention:
        `Le présent mandat est inscrit au registre des mandats de France Immeuble S.A.S. sous le numéro ${numero}. `
        + "Un exemplaire est remis au Mandant le jour de sa signature.",
      signatureIntro:
        `Le présent mandat est signé électroniquement le ${dateLongue(signature)}, chaque partie en recevant un exemplaire. `
        + "Le Mandant dispose d'un délai de rétractation de quatorze jours dont les modalités figurent en annexe.",
      signataires,
      annexeIntro: [
        "Le présent mandat étant conclu à distance, le Mandant consommateur dispose d'un délai de quatorze (14) jours à "
          + "compter de sa signature pour se rétracter sans avoir à motiver sa décision ni à supporter de frais, "
          + "conformément aux articles L.221-18 et suivants du Code de la consommation.",
        "Pour exercer ce droit, il notifie sa décision au moyen du formulaire ci-dessous ou de toute autre déclaration "
          + `dénuée d'ambiguïté, adressée à ${MANDATAIRE.nom}, ${MANDATAIRE.siege}, ou à ${MANDATAIRE.email}.`,
      ],
      annexeCoupon:
        `Je vous notifie par la présente ma rétractation du mandat de vente n° ${numero} signé le ${dateCourte(signature)} `
        + `et portant sur l'immeuble sis ${adresse}.`,
      art, articles,
      pagesCorps: 5,
    },
  };
}
