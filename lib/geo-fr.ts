/**
 * Le découpage administratif français, tel que les recherches acquéreur le
 * désignent (retour #332).
 *
 * Un acquéreur dit « toute l'Île-de-France sauf Paris » ou « le Nord, pas le
 * Pas-de-Calais » : il faut donc savoir de quelle région relève un immeuble,
 * et la base n'en dit rien — `bo_immeuble` porte la ville, le code postal et
 * le département, jamais la région. Le rattachement est une donnée publique et
 * stable : il tient ici, en dur, plutôt que dans une table à synchroniser.
 *
 * Les collectivités d'outre-mer sont listées comme leur propre région, ce qui
 * est le cas depuis 2015 pour les cinq DROM.
 */

export type Departement = { code: string; nom: string; region: string };

export const DEPARTEMENTS: Departement[] = [
  { code: "01", nom: "Ain", region: "Auvergne-Rhône-Alpes" },
  { code: "02", nom: "Aisne", region: "Hauts-de-France" },
  { code: "03", nom: "Allier", region: "Auvergne-Rhône-Alpes" },
  { code: "04", nom: "Alpes-de-Haute-Provence", region: "Provence-Alpes-Côte d'Azur" },
  { code: "05", nom: "Hautes-Alpes", region: "Provence-Alpes-Côte d'Azur" },
  { code: "06", nom: "Alpes-Maritimes", region: "Provence-Alpes-Côte d'Azur" },
  { code: "07", nom: "Ardèche", region: "Auvergne-Rhône-Alpes" },
  { code: "08", nom: "Ardennes", region: "Grand Est" },
  { code: "09", nom: "Ariège", region: "Occitanie" },
  { code: "10", nom: "Aube", region: "Grand Est" },
  { code: "11", nom: "Aude", region: "Occitanie" },
  { code: "12", nom: "Aveyron", region: "Occitanie" },
  { code: "13", nom: "Bouches-du-Rhône", region: "Provence-Alpes-Côte d'Azur" },
  { code: "14", nom: "Calvados", region: "Normandie" },
  { code: "15", nom: "Cantal", region: "Auvergne-Rhône-Alpes" },
  { code: "16", nom: "Charente", region: "Nouvelle-Aquitaine" },
  { code: "17", nom: "Charente-Maritime", region: "Nouvelle-Aquitaine" },
  { code: "18", nom: "Cher", region: "Centre-Val de Loire" },
  { code: "19", nom: "Corrèze", region: "Nouvelle-Aquitaine" },
  { code: "21", nom: "Côte-d'Or", region: "Bourgogne-Franche-Comté" },
  { code: "22", nom: "Côtes-d'Armor", region: "Bretagne" },
  { code: "23", nom: "Creuse", region: "Nouvelle-Aquitaine" },
  { code: "24", nom: "Dordogne", region: "Nouvelle-Aquitaine" },
  { code: "25", nom: "Doubs", region: "Bourgogne-Franche-Comté" },
  { code: "26", nom: "Drôme", region: "Auvergne-Rhône-Alpes" },
  { code: "27", nom: "Eure", region: "Normandie" },
  { code: "28", nom: "Eure-et-Loir", region: "Centre-Val de Loire" },
  { code: "29", nom: "Finistère", region: "Bretagne" },
  { code: "2A", nom: "Corse-du-Sud", region: "Corse" },
  { code: "2B", nom: "Haute-Corse", region: "Corse" },
  { code: "30", nom: "Gard", region: "Occitanie" },
  { code: "31", nom: "Haute-Garonne", region: "Occitanie" },
  { code: "32", nom: "Gers", region: "Occitanie" },
  { code: "33", nom: "Gironde", region: "Nouvelle-Aquitaine" },
  { code: "34", nom: "Hérault", region: "Occitanie" },
  { code: "35", nom: "Ille-et-Vilaine", region: "Bretagne" },
  { code: "36", nom: "Indre", region: "Centre-Val de Loire" },
  { code: "37", nom: "Indre-et-Loire", region: "Centre-Val de Loire" },
  { code: "38", nom: "Isère", region: "Auvergne-Rhône-Alpes" },
  { code: "39", nom: "Jura", region: "Bourgogne-Franche-Comté" },
  { code: "40", nom: "Landes", region: "Nouvelle-Aquitaine" },
  { code: "41", nom: "Loir-et-Cher", region: "Centre-Val de Loire" },
  { code: "42", nom: "Loire", region: "Auvergne-Rhône-Alpes" },
  { code: "43", nom: "Haute-Loire", region: "Auvergne-Rhône-Alpes" },
  { code: "44", nom: "Loire-Atlantique", region: "Pays de la Loire" },
  { code: "45", nom: "Loiret", region: "Centre-Val de Loire" },
  { code: "46", nom: "Lot", region: "Occitanie" },
  { code: "47", nom: "Lot-et-Garonne", region: "Nouvelle-Aquitaine" },
  { code: "48", nom: "Lozère", region: "Occitanie" },
  { code: "49", nom: "Maine-et-Loire", region: "Pays de la Loire" },
  { code: "50", nom: "Manche", region: "Normandie" },
  { code: "51", nom: "Marne", region: "Grand Est" },
  { code: "52", nom: "Haute-Marne", region: "Grand Est" },
  { code: "53", nom: "Mayenne", region: "Pays de la Loire" },
  { code: "54", nom: "Meurthe-et-Moselle", region: "Grand Est" },
  { code: "55", nom: "Meuse", region: "Grand Est" },
  { code: "56", nom: "Morbihan", region: "Bretagne" },
  { code: "57", nom: "Moselle", region: "Grand Est" },
  { code: "58", nom: "Nièvre", region: "Bourgogne-Franche-Comté" },
  { code: "59", nom: "Nord", region: "Hauts-de-France" },
  { code: "60", nom: "Oise", region: "Hauts-de-France" },
  { code: "61", nom: "Orne", region: "Normandie" },
  { code: "62", nom: "Pas-de-Calais", region: "Hauts-de-France" },
  { code: "63", nom: "Puy-de-Dôme", region: "Auvergne-Rhône-Alpes" },
  { code: "64", nom: "Pyrénées-Atlantiques", region: "Nouvelle-Aquitaine" },
  { code: "65", nom: "Hautes-Pyrénées", region: "Occitanie" },
  { code: "66", nom: "Pyrénées-Orientales", region: "Occitanie" },
  { code: "67", nom: "Bas-Rhin", region: "Grand Est" },
  { code: "68", nom: "Haut-Rhin", region: "Grand Est" },
  { code: "69", nom: "Rhône", region: "Auvergne-Rhône-Alpes" },
  { code: "70", nom: "Haute-Saône", region: "Bourgogne-Franche-Comté" },
  { code: "71", nom: "Saône-et-Loire", region: "Bourgogne-Franche-Comté" },
  { code: "72", nom: "Sarthe", region: "Pays de la Loire" },
  { code: "73", nom: "Savoie", region: "Auvergne-Rhône-Alpes" },
  { code: "74", nom: "Haute-Savoie", region: "Auvergne-Rhône-Alpes" },
  { code: "75", nom: "Paris", region: "Île-de-France" },
  { code: "76", nom: "Seine-Maritime", region: "Normandie" },
  { code: "77", nom: "Seine-et-Marne", region: "Île-de-France" },
  { code: "78", nom: "Yvelines", region: "Île-de-France" },
  { code: "79", nom: "Deux-Sèvres", region: "Nouvelle-Aquitaine" },
  { code: "80", nom: "Somme", region: "Hauts-de-France" },
  { code: "81", nom: "Tarn", region: "Occitanie" },
  { code: "82", nom: "Tarn-et-Garonne", region: "Occitanie" },
  { code: "83", nom: "Var", region: "Provence-Alpes-Côte d'Azur" },
  { code: "84", nom: "Vaucluse", region: "Provence-Alpes-Côte d'Azur" },
  { code: "85", nom: "Vendée", region: "Pays de la Loire" },
  { code: "86", nom: "Vienne", region: "Nouvelle-Aquitaine" },
  { code: "87", nom: "Haute-Vienne", region: "Nouvelle-Aquitaine" },
  { code: "88", nom: "Vosges", region: "Grand Est" },
  { code: "89", nom: "Yonne", region: "Bourgogne-Franche-Comté" },
  { code: "90", nom: "Territoire de Belfort", region: "Bourgogne-Franche-Comté" },
  { code: "91", nom: "Essonne", region: "Île-de-France" },
  { code: "92", nom: "Hauts-de-Seine", region: "Île-de-France" },
  { code: "93", nom: "Seine-Saint-Denis", region: "Île-de-France" },
  { code: "94", nom: "Val-de-Marne", region: "Île-de-France" },
  { code: "95", nom: "Val-d'Oise", region: "Île-de-France" },
  { code: "971", nom: "Guadeloupe", region: "Guadeloupe" },
  { code: "972", nom: "Martinique", region: "Martinique" },
  { code: "973", nom: "Guyane", region: "Guyane" },
  { code: "974", nom: "La Réunion", region: "La Réunion" },
  { code: "976", nom: "Mayotte", region: "Mayotte" },
];

/** Les régions, dans l'ordre alphabétique — celui d'une liste déroulante. */
export const REGIONS: string[] = [...new Set(DEPARTEMENTS.map((d) => d.region))].sort(
  (a, b) => a.localeCompare(b, "fr"),
);

const PAR_CODE = new Map(DEPARTEMENTS.map((d) => [d.code, d]));

/**
 * Le code département d'une adresse, depuis le champ dédié ou, à défaut, le
 * code postal. Les Corses (2A/2B) et l'outre-mer (trois chiffres) ne se
 * déduisent pas d'une simple coupe à deux caractères : 97400 est La Réunion,
 * pas le département 97.
 */
export function codeDepartement(dpt?: string, codePostal?: string): string | undefined {
  const brut = (dpt ?? "").trim().toUpperCase();
  if (PAR_CODE.has(brut)) return brut;
  const cp = (codePostal ?? "").trim();
  if (/^97[1-6]/.test(cp)) return cp.slice(0, 3);
  if (/^20/.test(cp)) {
    /* La Corse n'a pas de code postal qui distingue les deux départements de
       façon fiable ; on tranche sur la borne officielle 201xx / 202xx. */
    return Number(cp.slice(0, 3)) <= 201 ? "2A" : "2B";
  }
  const deux = cp.slice(0, 2);
  return PAR_CODE.has(deux) ? deux : undefined;
}

/** La région d'un département, quel que soit le format reçu. */
export function regionDe(dpt?: string, codePostal?: string): string | undefined {
  const code = codeDepartement(dpt, codePostal);
  return code ? PAR_CODE.get(code)?.region : undefined;
}

/** « 59 — Nord », pour une liste déroulante. */
export const libelleDepartement = (code: string) => {
  const d = PAR_CODE.get(code.trim().toUpperCase());
  return d ? `${d.code} — ${d.nom}` : code;
};
