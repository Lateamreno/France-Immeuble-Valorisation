// Les DPE de l'ADEME — les règles, sans réseau.
//
// Depuis juillet 2021, tout DPE réalisé en France est publié en open data par
// l'ADEME : adresse, étage, surface, étiquette énergie, étiquette GES. C'est la
// même source que celle de Pappers Immobilier — il n'y a pas d'accès privilégié
// là-dedans, juste une base publique et une jointure sur l'adresse.
//
// Ce fichier ne parle à personne : il normalise des adresses et compose des
// libellés. Les allers-retours sont dans lib/bo/dpe-actions.ts.
//
// LE POINT DÉLICAT, à garder en tête partout : l'ADEME rattache un DPE à une
// ADRESSE, jamais à un numéro de lot. Deux 48 m² au même étage sont
// indiscernables. C'est pourquoi rien ne se remplit tout seul ici : l'écran
// recense, l'agent affecte s'il le veut.

/** Le jeu de données ADEME des logements existants (depuis juillet 2021). */
export const JEU_ADEME = "meg-83tjwtg8dyz4vv7h1dqe";
export const BASE_ADEME = `https://data.ademe.fr/data-fair/api/v1/datasets/${JEU_ADEME}`;

/**
 * La fiche publique d'un DPE, sur l'observatoire de l'ADEME.
 *
 * C'est le lien qu'on met derrière un numéro de DPE : il donne la version
 * officielle, avec la consommation détaillée et le nom du diagnostiqueur.
 */
export const lienObservatoire = (numeroDpe: string) =>
  `https://observatoire-dpe-audit.ademe.fr/afficher-dpe/${encodeURIComponent(numeroDpe)}`;

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/* Les abréviations que les agents tapent et que l'ADEME écrit en toutes
   lettres. « 56 Bd du Gal de Gaulle » et « 56 Boulevard du Général de Gaulle »
   doivent tomber sur la même voie, sinon le relevé rend zéro sur une adresse
   qui a pourtant douze DPE. */
const ABREVIATIONS: Record<string, string> = {
  bd: "boulevard", bld: "boulevard", boul: "boulevard",
  av: "avenue", ave: "avenue", avn: "avenue",
  pl: "place", rte: "route", che: "chemin", chem: "chemin",
  imp: "impasse", all: "allee", sq: "square", fbg: "faubourg",
  r: "rue", crs: "cours", qu: "quai", pass: "passage",
  gal: "general", gnl: "general", st: "saint", ste: "sainte",
};

/* Les mots vides d'une adresse : les garder ferait échouer « rue du Général »
   contre « rue Général » pour rien. */
const VIDES = new Set(["du", "de", "des", "la", "le", "les", "l", "d", "au", "aux", "et"]);

/**
 * Réduit un nom de voie à sa forme comparable.
 *
 * « Bd du Gal de Gaulle » et « Boulevard du Général de Gaulle » rendent tous
 * deux « boulevard general gaulle ».
 */
export function normaliserVoie(s: string | undefined): string {
  return sansAccent(String(s ?? "").toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((m) => ABREVIATIONS[m] ?? m)
    .filter((m) => m.length > 0 && !VIDES.has(m))
    .join(" ");
}

/**
 * Les écritures possibles d'un numéro de voie, de la plus précise à la plus
 * large.
 *
 * L'ADEME écrit « 34bis » sans espace et en minuscules, là où la fiche porte
 * « 34 Bis ». Et un immeuble dont le DPE a été déposé au 34 tout court ne doit
 * pas disparaître : on retombe sur le numéro nu en dernier recours.
 */
export function variantesNumero(n: string | number | undefined): string[] {
  const s = String(n ?? "").toLowerCase().replace(/\s+/g, "").trim();
  if (!s) return [];
  const m = s.match(/^(\d+)(bis|ter|quater|[a-z])?$/);
  if (!m) return [s];
  return [...new Set([s, m[1] + (m[2] ?? ""), m[1]])];
}

/** Une adresse d'immeuble, telle que la fiche la porte. */
export type AdresseImmeuble = {
  numero?: string;
  rue?: string;
  codePostal?: string;
  ville?: string;
};

/** Peut-on seulement chercher ? Il faut un code postal ET une voie. */
export function adresseInterrogeable(a: AdresseImmeuble): boolean {
  return !!(a.codePostal && /^\d{5}$/.test(a.codePostal.trim()) && normaliserVoie(a.rue));
}

export function libelleAdresse(a: AdresseImmeuble): string {
  return [a.numero, a.rue].filter(Boolean).join(" ")
    + (a.codePostal || a.ville ? `, ${[a.codePostal, a.ville].filter(Boolean).join(" ")}` : "");
}

/* ------------------------------------------------------------- Un DPE */

export type Dpe = {
  id?: string;
  numeroDpe: string;
  etiquetteDpe?: string;
  etiquetteGes?: string;
  surface?: number;
  etage?: number;
  positionLogement?: string;
  complement?: string;
  typeBatiment?: string;
  periodeConstruction?: string;
  dateEtablissement?: string;
  dateFinValidite?: string;
  adresseBan?: string;
  identifiantBan?: string;
  /** Le lot auquel l'agent l'a rattaché — jamais rempli automatiquement. */
  lotId?: string;
};

export type ReleveDpe = {
  immeubleId: string;
  chercheLe?: string;
  adresseDemandee?: string;
  adressesTrouvees: string[];
  dpe: Dpe[];
};

/** Les étiquettes vraiment mauvaises : celles qui pèsent sur une vente. */
export const PASSOIRES = new Set(["F", "G"]);

/**
 * Un DPE est-il encore valable ?
 *
 * Un DPE vaut dix ans. Ceux d'avant juillet 2021 relèvent de l'ancienne méthode
 * et sont tous périmés aujourd'hui — raison pour laquelle on n'interroge que le
 * jeu « depuis juillet 2021 ». Reste les DPE récents arrivés à échéance, qu'il
 * faut signaler plutôt que d'afficher comme s'ils faisaient foi.
 */
export function estPerime(d: Dpe, maintenant = Date.now()): boolean {
  if (!d.dateFinValidite) return false;
  const t = Date.parse(d.dateFinValidite);
  return Number.isFinite(t) && t < maintenant;
}

/** Le classement d'affichage : le plus récent d'abord, à étage égal. */
export function trierDpe(dpe: Dpe[]): Dpe[] {
  return [...dpe].sort((a, b) => {
    const ea = a.etage ?? 99, eb = b.etage ?? 99;
    if (ea !== eb) return ea - eb;
    return String(b.dateEtablissement ?? "").localeCompare(String(a.dateEtablissement ?? ""));
  });
}

/** Le compte par étiquette, pour la ligne de synthèse du recensement. */
export function repartition(dpe: Dpe[]): { lettre: string; n: number }[] {
  const par = new Map<string, number>();
  for (const d of dpe) {
    const l = (d.etiquetteDpe ?? "?").toUpperCase();
    par.set(l, (par.get(l) ?? 0) + 1);
  }
  return [...par.entries()]
    .map(([lettre, n]) => ({ lettre, n }))
    .sort((a, b) => a.lettre.localeCompare(b.lettre));
}

/** Le complément d'adresse dit-il lui-même un étage ? (« Etage 2; Porte Droite ») */
const ditUnEtage = (s: string | undefined) =>
  /\b(etage|étage|rdc|rez)\b/i.test(String(s ?? ""));

/**
 * Ce qu'on peut dire d'un DPE en une ligne, dans la modale.
 *
 * L'ADEME est très inégale sur l'étage et le complément d'adresse : beaucoup de
 * lignes n'ont que la surface. On écrit ce qu'on sait, jamais un « étage 0 » là
 * où le champ est vide.
 *
 * Le piège, vu sur un cas réel du 55 rue Volant : `numero_etage_appartement`
 * vaut 0 alors que le diagnostiqueur a écrit « Etage 2; Porte Droite » dans le
 * complément. Ce zéro-là n'est pas un rez-de-chaussée, c'est un champ non
 * rempli. Quand le complément énonce lui-même un étage, il fait foi et on tait
 * le zéro — afficher « rez-de-chaussée · Etage 2 » serait se contredire dans la
 * même ligne.
 *
 * Le complément garde sa casse d'origine et passe entre guillemets : ce sont
 * les mots du diagnostiqueur, pas une donnée normalisée.
 */
export function situationDpe(d: Dpe): string {
  const bouts: string[] = [];
  const complementParle = ditUnEtage(d.complement) || ditUnEtage(d.positionLogement);
  if (d.etage !== undefined && d.etage !== null && !(d.etage === 0 && complementParle)) {
    bouts.push(d.etage === 0 ? "rez-de-chaussée" : `${d.etage}ᵉ étage`);
  }
  if (d.positionLogement) bouts.push(d.positionLogement.toLowerCase());
  if (d.complement) bouts.push(`« ${d.complement} »`);
  return bouts.join(" · ");
}

/* -------------------------------------------- Le rapprochement d'un lot */

export type LotSimple = { id: string; libelle: string; etage?: number; surface?: number };

/**
 * À quel point ce DPE PEUT correspondre à ce lot.
 *
 * Rend `undefined` quand rien ne permet d'en juger. Ce score ne sert qu'à
 * proposer un ordre dans la liste déroulante d'affectation : il ne décide de
 * rien, et aucune valeur n'est écrite sans un clic.
 *
 * La surface prime sur l'étage : l'ADEME renseigne presque toujours la surface
 * habitable, et rarement l'étage.
 */
export function scoreRapprochement(d: Dpe, lot: LotSimple): number | undefined {
  let score = 0;
  let vu = false;
  if (d.surface !== undefined && lot.surface !== undefined && lot.surface > 0) {
    const ecart = Math.abs(d.surface - lot.surface) / lot.surface;
    if (ecart > 0.15) return 0; // plus de 15 % d'écart : ce n'est pas le même lot
    score += (1 - ecart / 0.15) * 70;
    vu = true;
  }
  if (d.etage !== undefined && lot.etage !== undefined) {
    if (d.etage !== lot.etage) return 0;
    score += 30;
    vu = true;
  }
  return vu ? Math.round(score) : undefined;
}

/**
 * Les lots d'un immeuble, du plus plausible au moins plausible pour ce DPE.
 *
 * Les lots sans aucun élément de comparaison restent dans la liste, en fin :
 * l'agent connaît son immeuble mieux que la base, et lui interdire un choix
 * parce que la surface manque serait le renvoyer au papier.
 */
export function lotsPlausibles(d: Dpe, lots: LotSimple[]): { lot: LotSimple; score?: number }[] {
  return lots
    .map((lot) => ({ lot, score: scoreRapprochement(d, lot) }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
