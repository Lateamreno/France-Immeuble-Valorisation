import { correspond, matcher, FILTRES_MATCH_DEFAUT, type CriteresBien } from "./matching.ts";

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };

/** Un immeuble décrit par ses loyers annuels potentiels, type par type. */
const im = (revenus: Record<string, number>, o: Partial<CriteresBien> = {}): CriteresBien => ({
  immeubleId: "i", departement: "75", destinations: [],
  repartition: { revenus, surfaces: {} }, ...o,
});
const recoit = (types: string[], bien: CriteresBien) => correspond({ Destinations: types, dpts: ["75"] }, bien);

const choisy = im({ Logement: 94632 });
const charonne = im({ Logement: 90929, Commerce: 61196 });            // 60 / 40
const livry = im({ Logement: 53319, Commerce: 86600 });               // 38 / 62
const courbevoie = im({ Logement: 10750, Commerce: 35748 });          // 23 / 77
const vingt = im({ Logement: 20000, Commerce: 80000 });               // 20 / 80
const oleron = im({ Logement: 7920, Logistique: 103140 });            // 7 / 93
const herblay = im({ Commerce: 103464, Logistique: 114312 });         // 48 / 52
const sebastopol = im({ Commerce: 600000 });
const argenteuil = im({ Bureau: 235505, Parking: 3495 });

console.log("— Recherche « logement » : au moins 20 % de logement —");
ok(recoit(["Logement"], choisy), "100 % habitation → reçoit");
ok(recoit(["Logement"], charonne), "60 % de logement → reçoit");
ok(recoit(["Logement"], livry), "38 % de logement → reçoit");
ok(recoit(["Logement"], courbevoie), "23 % de logement → reçoit");
ok(recoit(["Logement"], vingt), "20 % pile → reçoit");
ok(!recoit(["Logement"], im({ Logement: 19, Commerce: 81 })), "19 % de logement → ne reçoit plus");
ok(!recoit(["Logement"], oleron), "7 % de logement → ne reçoit plus");
ok(!recoit(["Logement"], sebastopol), "100 % commerce → aucun type en commun");
ok(recoit(["Cave", "Logement", "Parking"], charonne), "caves et parkings cochés ne changent rien");

console.log("— Recherche pro seulement : 20 % de logement au plus, ses types à 50 % —");
ok(recoit(["Commerce"], sebastopol), "100 % commerce → reçoit");
ok(recoit(["Commerce"], vingt), "20 % de logement, 80 % de commerce → reçoit");
ok(!recoit(["Commerce"], courbevoie), "23 % de logement → trop (« à 21 déjà c'est trop »)");
ok(!recoit(["Commerce"], im({ Logement: 21, Commerce: 79 })), "21 % de logement → ne reçoit pas");
ok(recoit(["Logistique"], oleron), "7 % de logement, 93 % de logistique → reçoit");
ok(!recoit(["Commerce"], herblay), "48 % de commerce → moins de la moitié");
ok(recoit(["Logistique"], herblay), "52 % de logistique → reçoit");
ok(recoit(["Bureau", "Commerce"], im({ Bureau: 60, Commerce: 40 })), "bureau + commerce font 100 % → reçoit");
ok(recoit(["Commerce", "Logistique"], im({ Bureau: 50, Commerce: 40, Logistique: 10 })),
  "commerce + logistique : 40 % + 10 % = 50 % → reçoit (exemple de MAV)");
ok(!recoit(["Commerce", "Logistique"], im({ Bureau: 51, Commerce: 39, Logistique: 10 })), "39 % + 10 % = 49 % → ne reçoit pas");
ok(!recoit(["Commerce", "Logistique"], im({ Logement: 50, Commerce: 40, Logistique: 10 })),
  "50 % + 50 % de logement → trop de logement pour une recherche pro");
ok(!recoit(["Commerce"], im({ Bureau: 60, Commerce: 40 })), "commerce seul à 40 % → ne reçoit pas");
ok(recoit(["Bureau"], argenteuil), "bureaux + parkings → les parkings ne comptent pas");
ok(!recoit(["Bureau"], im({}, { repartition: undefined, destinations: ["Logement", "Bureau"] })),
  "sans lot, fiche avec logement → une recherche pro ne le reçoit pas");

console.log("— Recherche logement + pro : l'une des deux voies —");
ok(recoit(["Commerce", "Logement"], courbevoie), "23 % de logement mais du commerce → reçoit");
ok(recoit(["Bureau", "Logement"], courbevoie), "23 % de logement → reçoit par le logement");
ok(!recoit(["Bureau", "Logement"], oleron), "7 % de logement et pas de bureau → ne reçoit pas");
ok(recoit(["Commerce", "Logement"], herblay), "pas de logement, 48 % de commerce → reçoit (Q3 : un type en commun suffit)");
ok(recoit(["Bureau", "Commerce", "Logement", "Logistique"], oleron), "les 4 types → reçoit");

console.log("— Loyers manquants : on passe à la surface —");
const vides = { immeubleId: "i", departement: "75", destinations: [],
  repartition: { revenus: { Commerce: 20000 }, surfaces: { Commerce: 40, Logement: 200 }, loyersIncomplets: true } };
ok(recoit(["Logement"], vides), "logements vides sans loyer : 83 % de la surface → reçoit");
ok(!recoit(["Commerce"], vides), "et une recherche commerce ne le reçoit pas");
ok(!recoit(["Logement"], { ...vides, repartition: { ...vides.repartition, loyersIncomplets: false } }),
  "sans le drapeau, la part serait lue en loyers (0 % de logement)");

console.log("— Sans type ni lot —");
ok(recoit([], courbevoie), "recherche sans type → reçoit tout");
ok(recoit(["Commerce"], im({}, { repartition: undefined })), "bien sans lot ni fiche → pas d'opposition");

console.log("— Villes : la ville choisie, et pas une autre (MAV, 13/11) —");
const a = (ville: string, departement: string) => im({ Logement: 100 }, { ville, departement });
const geo = (villes: string[], bien: CriteresBien, exclues: string[] = []) =>
  correspond({ villes }, bien, { destinations: [], villes: exclues, departements: [], regions: [] });
ok(geo(["Saint-Denis (93)"], a("Saint-Denis", "93")), "Saint-Denis (93) → l'immeuble de Saint-Denis du 93");
ok(!geo(["Saint-Denis (93)"], a("Saint-Denis", "974")), "Saint-Denis (93) → pas celui de La Réunion");
ok(!geo(["Saint-Denis (93)"], a("Saint-Denis-en-Val", "45")), "Saint-Denis (93) → pas Saint-Denis-en-Val");
ok(geo(["Saint-Denis (974)"], a("Saint-Denis", "974")), "Saint-Denis (974) → celui de La Réunion");
ok(geo(["L'Haÿ-les-Roses (94)"], a("L'Hay-les-Roses", "94")), "accents et apostrophes ne comptent pas");
ok(geo(["Saint-Denis"], a("Saint-Denis", "974")), "ancienne saisie sans département : toutes les Saint-Denis, comme avant");
ok(!geo([], a("Saint-Denis", "93"), ["Saint-Denis (93)"]), "exclure Saint-Denis (93) écarte celui du 93");
ok(geo([], a("Saint-Denis", "974"), ["Saint-Denis (93)"]), "… et pas celui de La Réunion");
ok(correspond({ dpts: ["2A"] }, a("Ajaccio", "2A")), "la Corse-du-Sud (2A) se reconnaît");

console.log("— Déjà reçu : jamais deux fois (MAV, 13/11, Sin-le-Noble) —");
const rech = (id: string, contact: string) => ({ _id: id, ACHETEUR: contact, Note: "A", Destinations: [], IMMEUBLEs_proposed: [] });
const vivier = [rech("r1", "c1"), rech("r2", "c2")];
const bienX = im({ Logement: 100 }, { immeubleId: "imX" });
const sortis = (f: Partial<typeof FILTRES_MATCH_DEFAUT> & { dejaRecus?: string[] }) =>
  matcher(vivier, new Map(), bienX, { ...FILTRES_MATCH_DEFAUT, ...f }).map((a) => a.rechercheId).join(",");
ok(sortis({ dejaRecus: ["c1"] }) === "r2", "c1 a déjà une proposition pour l'immeuble → il ne la reçoit pas de nouveau");
ok(sortis({ dejaRecus: ["c1"], exclureDejaVus: false }) === "r1,r2", "case « renvoyer aussi » cochée → il la reçoit");
ok(FILTRES_MATCH_DEFAUT.exclureDejaVus === true, "par défaut, les déjà vus sont exclus");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
