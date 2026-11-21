/**
 * Le greffe d'immatriculation d'une société, déduit du département de son
 * siège (retour #208).
 *
 * Pourquoi une table et pas une API : le numéro RCS s'écrit « RCS <ville du
 * greffe> », et aucune base publique gratuite ne l'expose. L'annuaire des
 * entreprises (DINUM) donne le SIREN, la raison sociale et le siège, jamais le
 * greffe ni le capital — ils viennent du registre du commerce, qui demande un
 * compte. Le greffe compétent étant celui du tribunal dans le ressort duquel
 * se trouve le siège, le département le donne.
 *
 * Ce que cette table vaut, honnêtement : une quarantaine de départements ont
 * DEUX greffes ou plus (le 13 : Marseille, Aix, Tarascon). On y retient le
 * plus important, et le champ reste modifiable à l'écran — c'est un
 * pré-remplissage, pas une vérité. En Île-de-France, où se font la plupart des
 * mandats, un seul greffe par département : la déduction y est exacte, sauf en
 * Seine-et-Marne (Meaux et Melun).
 */
const GREFFES: Record<string, string> = {
  "01": "Bourg-en-Bresse", "02": "Soissons", "03": "Cusset", "04": "Manosque",
  "05": "Gap", "06": "Nice", "07": "Aubenas", "08": "Sedan", "09": "Foix",
  "10": "Troyes", "11": "Carcassonne", "12": "Rodez", "13": "Marseille",
  "14": "Caen", "15": "Aurillac", "16": "Angoulême", "17": "La Rochelle",
  "18": "Bourges", "19": "Brive-la-Gaillarde", "21": "Dijon",
  "22": "Saint-Brieuc", "23": "Guéret", "24": "Périgueux", "25": "Besançon",
  "26": "Romans-sur-Isère", "27": "Évreux", "28": "Chartres", "29": "Brest",
  "2A": "Ajaccio", "2B": "Bastia", "30": "Nîmes", "31": "Toulouse",
  "32": "Auch", "33": "Bordeaux", "34": "Montpellier", "35": "Rennes",
  "36": "Châteauroux", "37": "Tours", "38": "Grenoble", "39": "Lons-le-Saunier",
  "40": "Mont-de-Marsan", "41": "Blois", "42": "Saint-Étienne",
  "43": "Le Puy-en-Velay", "44": "Nantes", "45": "Orléans", "46": "Cahors",
  "47": "Agen", "48": "Mende", "49": "Angers", "50": "Coutances",
  "51": "Reims", "52": "Chaumont", "53": "Laval", "54": "Nancy",
  "55": "Bar-le-Duc", "56": "Vannes", "57": "Metz", "58": "Nevers",
  "59": "Lille Métropole", "60": "Compiègne", "61": "Alençon", "62": "Arras",
  "63": "Clermont-Ferrand", "64": "Pau", "65": "Tarbes", "66": "Perpignan",
  "67": "Strasbourg", "68": "Mulhouse", "69": "Lyon", "70": "Vesoul",
  "71": "Chalon-sur-Saône", "72": "Le Mans", "73": "Chambéry", "74": "Annecy",
  "75": "Paris", "76": "Rouen", "77": "Meaux", "78": "Versailles",
  "79": "Niort", "80": "Amiens", "81": "Albi", "82": "Montauban",
  "83": "Toulon", "84": "Avignon", "85": "La Roche-sur-Yon", "86": "Poitiers",
  "87": "Limoges", "88": "Épinal", "89": "Auxerre", "90": "Belfort",
  "91": "Évry", "92": "Nanterre", "93": "Bobigny", "94": "Créteil",
  "95": "Pontoise",
  "971": "Pointe-à-Pitre", "972": "Fort-de-France", "973": "Cayenne",
  "974": "Saint-Denis de La Réunion", "976": "Mamoudzou",
};

/* Les départements à plusieurs greffes où la commune du siège tranche sans
   ambiguïté. On ne les liste pas tous : seulement ceux dont l'autre greffe
   couvre un bassin assez peuplé pour se présenter souvent. */
const PAR_COMMUNE: Record<string, string> = {
  "AIXENPROVENCE": "Aix-en-Provence", "ARLES": "Tarascon", "TARASCON": "Tarascon",
  "LEHAVRE": "Le Havre", "DIEPPE": "Dieppe",
  "MELUN": "Melun", "FONTAINEBLEAU": "Melun",
  "SAINTNAZAIRE": "Saint-Nazaire", "LIBOURNE": "Libourne",
  "BEZIERS": "Béziers", "NARBONNE": "Narbonne", "SAINTMALO": "Saint-Malo",
  "QUIMPER": "Quimper", "LORIENT": "Lorient", "BAYONNE": "Bayonne",
  "ALES": "Alès", "CANNES": "Cannes", "ANTIBES": "Cannes", "GRASSE": "Cannes",
  "DRAGUIGNAN": "Draguignan", "FREJUS": "Fréjus",
  "SAINTQUENTIN": "Saint-Quentin", "MONTLUCON": "Montluçon",
  "ROANNE": "Roanne", "VIENNE": "Vienne", "SAUMUR": "Saumur",
  "CHERBOURGENCOTENTIN": "Cherbourg-en-Cotentin",
  "LISIEUX": "Lisieux", "SAINTES": "Saintes", "TULLE": "Tulle",
  "BERGERAC": "Bergerac", "MACON": "Mâcon", "SENS": "Sens",
  "THONONLESBAINS": "Thonon-les-Bains", "CASTRES": "Castres",
  "CARPENTRAS": "Carpentras", "COLMAR": "Colmar", "SAVERNE": "Saverne",
  "THIONVILLE": "Thionville", "SARREGUEMINES": "Sarreguemines",
  "DOUAI": "Douai", "DUNKERQUE": "Dunkerque", "VALENCIENNES": "Valenciennes",
  "CAMBRAI": "Cambrai", "BEAUVAIS": "Beauvais", "SENLIS": "Senlis",
  "ARGENTAN": "Argentan", "BOULOGNESURMER": "Boulogne-sur-Mer",
  "BETHUNE": "Béthune", "DAX": "Dax", "CHALONSENCHAMPAGNE": "Châlons-en-Champagne",
  "VILLEFRANCHESURSAONE": "Villefranche-Tarare",
};

const sansAccent = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

/**
 * Le greffe d'un siège social. `departement` est le code INSEE tel que
 * l'annuaire des entreprises le sert (« 92 », « 2A », « 974 ») ; `commune`
 * départage les départements à plusieurs greffes. Rend `undefined` plutôt que
 * de deviner quand le département est inconnu : mieux vaut un champ vide qu'un
 * greffe faux dans un mandat.
 */
export function greffeDe(departement?: string, commune?: string): string | undefined {
  const parVille = commune ? PAR_COMMUNE[sansAccent(commune)] : undefined;
  if (parVille) return parVille;
  const d = (departement ?? "").trim().toUpperCase();
  return GREFFES[d];
}
