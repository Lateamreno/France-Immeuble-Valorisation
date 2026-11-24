/**
 * La matrice d'import de l'état locatif (retour #261).
 *
 * MAV : « à côté du bouton importer je veux un bouton pour télécharger la
 * matrice CSV ou Excel, qui me permettrait de remplir l'Excel plutôt que le
 * back-office, et après j'importe le document rempli. […] j'aimerai que dans
 * l'Excel d'import pour l'état locatif tu mettes toutes les options des baux et
 * des locataires — nom du locataire, date d'entrée, loyer d'entrée, indice
 * d'entrée, valeur d'indice d'entrée, numéro du locataire, e-mail du
 * locataire… Comme ça rien qu'avec l'Excel on a déjà les infos des lots, des
 * baux et des locataires. »
 *
 * Un immeuble de découpe fait trente à quatre-vingts lots. Les saisir un par un
 * à l'écran est un travail de plusieurs heures ; le même tableau se remplit en
 * vingt minutes dans Excel, où l'on copie une colonne d'un coup. La matrice est
 * donc la porte d'entrée normale d'un gros immeuble, et l'écran sert à
 * corriger ensuite.
 *
 * **Une seule liste de colonnes**, définie ici, sert à trois choses : écrire le
 * modèle vierge, l'exporter rempli, et le relire. Deux listes finiraient par
 * diverger — et un import qui décale d'une colonne écrit des loyers dans les
 * surfaces sans rien signaler.
 *
 * Le fichier reste un CSV point-virgule avec BOM : c'est ce qu'Excel ouvre en
 * double-clic sur un poste français, sans assistant d'importation ni accents
 * cassés. Un vrai .xlsx obligerait à embarquer une bibliothèque pour un gain
 * nul — MAV a écrit lui-même « CSV ou Excel ».
 */

import {
  DESTINATIONS, ETATS_LOT, INDICES_BAIL, TYPES_BAIL, TYPES_DPE, TYPES_LOT,
} from "@/lib/referentiels";

/** Une colonne de la matrice. */
type Col = {
  /** L'en-tête écrit dans le fichier — c'est la clé de relecture. */
  cle: string;
  /** Ce qu'on attend dans la case, en une ligne. */
  aide: string;
  /** Les valeurs admises, quand la colonne en a une liste fermée. */
  valeurs?: readonly string[];
};

/* Les colonnes du lot gardent EXACTEMENT les noms de l'ancien import : les
   fichiers que MAV a déjà sur son disque continuent de passer. */
const COLS_LOT: Col[] = [
  { cle: "batiment", aide: "Bâtiment (A, B…), facultatif" },
  { cle: "etage", aide: "Étage : 0 pour le rez-de-chaussée" },
  { cle: "numero", aide: "Numéro de lot de la copropriété" },
  { cle: "Destination", aide: "Grande famille du lot", valeurs: DESTINATIONS },
  { cle: "Type_lot", aide: "Type précis", valeurs: TYPES_LOT },
  { cle: "surface_carrez", aide: "Surface Carrez en m² (vide pour cave et parking)" },
  { cle: "surface_sol", aide: "Surface utile au sol en m²" },
  { cle: "Type_bail", aide: "Régime d'occupation du lot", valeurs: TYPES_BAIL },
  { cle: "loyer", aide: "Loyer mensuel hors charges actuellement encaissé, en €" },
  { cle: "loyer_max", aide: "Loyer mensuel de marché estimé, en €" },
  { cle: "Etat", aide: "État du lot", valeurs: ETATS_LOT },
  { cle: "Type_dpe", aide: "Étiquette DPE", valeurs: TYPES_DPE },
  { cle: "renov_year", aide: "Année de la dernière rénovation (4 chiffres)" },
  { cle: "commentaire", aide: "Commentaire libre sur le lot" },
];

const COLS_BAIL: Col[] = [
  { cle: "bail_loyer_initial", aide: "Loyer mensuel à la signature du bail, en €" },
  { cle: "bail_depot_garantie", aide: "Dépôt de garantie, en €" },
  { cle: "bail_date_entree", aide: "Date d'entrée du locataire, jj/mm/aaaa" },
  { cle: "bail_indice", aide: "Indice de révision", valeurs: INDICES_BAIL },
  { cle: "bail_indice_signature", aide: "Valeur de l'indice à la signature" },
  { cle: "bail_indice_actuel", aide: "Valeur de l'indice aujourd'hui" },
  { cle: "bail_statut", aide: "Où en est le bail", valeurs: ["en_cours", "impayes", "preavis", "expulsion"] },
  { cle: "bail_commentaire", aide: "Commentaire libre sur le bail" },
];

const COLS_LOC: Col[] = [
  { cle: "locataire_societe", aide: "oui si le locataire est une société, sinon vide" },
  { cle: "locataire_civilite", aide: "M. ou Mme", valeurs: ["M.", "Mme"] },
  { cle: "locataire_prenom", aide: "Prénom (vide pour une société)" },
  { cle: "locataire_nom", aide: "NOM, ou raison sociale pour une société" },
  { cle: "locataire_telephone", aide: "Téléphone du locataire" },
  { cle: "locataire_email", aide: "E-mail du locataire" },
  { cle: "locataire_commentaire", aide: "Commentaire libre sur le locataire" },
];

export const COLS_MATRICE: Col[] = [...COLS_LOT, ...COLS_BAIL, ...COLS_LOC];

/** La ligne qui sépare la zone à remplir du mode d'emploi. */
const SEPARATEUR = "#";

const csvCase = (v: string) => v.replace(/[;\r\n]/g, " ").trim();

/**
 * Le modèle vierge à remplir dans Excel.
 *
 * Il porte l'en-tête, quelques lignes vides pour amorcer, puis — sous une ligne
 * de séparation — le mode d'emploi colonne par colonne et les valeurs admises.
 * Ce mode d'emploi est SOUS le tableau et commence par « # » : la relecture
 * s'arrête là, donc rien de ce qui est écrit en dessous ne peut se transformer
 * en lot fantôme. C'est le défaut du fichier utilisé jusqu'ici, où les valeurs
 * admises étaient rangées dans les colonnes mêmes qu'on remplit.
 */
export function matriceCsv(lignesVides = 12): string {
  const l: string[] = [COLS_MATRICE.map((c) => c.cle).join(";")];
  for (let i = 0; i < lignesVides; i++) l.push(COLS_MATRICE.map(() => "").join(";"));

  l.push("");
  l.push(`${SEPARATEUR} MODE D'EMPLOI — rien de ce qui suit n'est importé, ne rien écrire sous cette ligne.`);
  l.push(`${SEPARATEUR} Une ligne = un lot. Les colonnes bail_ et locataire_ sont facultatives :`);
  l.push(`${SEPARATEUR} remplies, elles créent le bail et le locataire du lot en même temps que lui.`);
  l.push(`${SEPARATEUR} Les montants sont en euros, sans symbole ; la virgule décimale est acceptée.`);
  l.push(`${SEPARATEUR}`);
  l.push(`${SEPARATEUR} Colonne;Ce qu'on y met;Valeurs admises`);
  for (const c of COLS_MATRICE) {
    l.push(`${SEPARATEUR} ${c.cle};${csvCase(c.aide)};${c.valeurs ? c.valeurs.map(csvCase).join(" | ") : "texte libre"}`);
  }
  /* Le BOM : sans lui, Excel lit « Rénové » en mojibake. */
  return `﻿${l.join("\r\n")}\r\n`;
}

/** Ce qu'une ligne de matrice décrit, une fois relue. */
export type LigneMatrice = {
  lot: Record<string, string>;
  bail: Record<string, string>;
  locataire: Record<string, string>;
};

/** « 01/09/2011 » ou « 2011-09-01 » → ISO ; rien si la date n'existe pas. */
export function dateMatrice(v: string): string {
  const t = v.trim();
  if (!t) return "";
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  const [a, mo, j] = fr ? [fr[3], fr[2].padStart(2, "0"), fr[1].padStart(2, "0")]
    : iso ? [iso[1], iso[2], iso[3]] : ["", "", ""];
  if (!a) return "";
  const d = new Date(`${a}-${mo}-${j}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(j) ? "" : `${a}-${mo}-${j}`;
}

/**
 * Relit un fichier rempli.
 *
 * Deux garde-fous, parce qu'un import muet qui crée quinze lots vides coûte
 * plus cher à défaire qu'à éviter :
 * - tout ce qui suit la ligne de séparation est ignoré ;
 * - une ligne sans numéro, sans surface et sans loyer n'est pas un lot. C'est
 *   ce qui neutralise les anciennes matrices, où les valeurs admises étaient
 *   listées à l'intérieur des colonnes.
 */
export function lireMatrice(texte: string, maxLignes = 200): LigneMatrice[] {
  const brut = texte.replace(/^﻿/, "").split(/\r?\n/);
  const iFin = brut.findIndex((l) => l.trimStart().startsWith(SEPARATEUR));
  const lignes = (iFin >= 0 ? brut.slice(0, iFin) : brut).filter((l) => l.trim() !== "");
  if (lignes.length < 2) return [];

  /* Excel écrit le séparateur de la machine : point-virgule chez nous, virgule
     sur un poste anglophone. On prend celui qui découpe le plus l'en-tête. */
  const sep = (lignes[0].split(";").length >= lignes[0].split(",").length) ? ";" : ",";
  const entetes = lignes[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));

  const out: LigneMatrice[] = [];
  for (const ligne of lignes.slice(1, maxLignes + 1)) {
    const vals = ligne.split(sep);
    const o = Object.fromEntries(entetes.map((h, i) => [h, (vals[i] ?? "").trim().replace(/^"|"$/g, "")]));
    if (!o.numero && !o.surface_carrez && !o.loyer && !o.surface_sol) continue;
    const par = (prefixe: string, cols: Col[]) =>
      Object.fromEntries(cols.map((c) => [c.cle.slice(prefixe.length), o[c.cle] ?? ""]));
    out.push({
      lot: Object.fromEntries(COLS_LOT.map((c) => [c.cle, o[c.cle] ?? ""])),
      bail: par("bail_", COLS_BAIL),
      locataire: par("locataire_", COLS_LOC),
    });
  }
  return out;
}

/** Vrai si l'agent a rempli au moins une case de ce bloc. */
export const rempli = (o: Record<string, string>) => Object.values(o).some((v) => v.trim() !== "");
