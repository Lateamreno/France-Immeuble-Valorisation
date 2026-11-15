import { calculerEtude, typologieDuLot, REGLAGES_VIDES, type Reference } from "./etude-decoupe.ts";

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };

console.log("— Typologie des lots —");
const t = (Destination: string, Type_lot?: string) => JSON.stringify(typologieDuLot({ Destination, Type_lot }));
ok(t("Logement", "T2") === JSON.stringify({ cle: "A2", libelle: "T2" }), "T2 → appartement 2 pièces");
ok(t("Logement", "Studio") === JSON.stringify({ cle: "A1", libelle: "Studio / T1" }), "studio → 1 pièce");
ok(t("Logement", "Duplex T3 + ext").includes("A3"), "duplex T3 → 3 pièces");
ok(t("Commerce", "Boulangerie").includes('"L"'), "commerce → locaux DVF");
ok(t("Bureau", "Bureaux").includes('"L"'), "bureaux → locaux DVF");
ok(t("Parking").includes("Parking"), "parking → forfait");
ok(t("Cave", "Cave").includes("Cave"), "cave → forfait");

console.log("— Paliers, médiane, exclusions —");
let n = 0;
const vente = (o: Partial<Reference>): Reference => ({
  id: `m${++n}`, date: "2025-11-15", type: "A", pieces: 2, surface: 45, prix: 270000, annexes: 0, numero: String(n), voie: "RUE X",
  commune: "Nanterre", insee: "92050", cleAdresse: `92050_0001_${String(n).padStart(5, "0")}`, lat: 0, lon: 0, distance: 100, prixM2: 6000, ...o,
});
const lots = [
  { Destination: "Logement", Type_lot: "T2", surface_carrez: 45, loyer: 900 },
  { Destination: "Logement", Type_lot: "T2", surface_carrez: 40 },
  { Destination: "Parking" },
];
const proches = Array.from({ length: 8 }, (_, i) => vente({ prixM2: 5000 + i * 100 }));
const e1 = calculerEtude(lots, proches, "2025-12-31", REGLAGES_VIDES);
const g1 = e1.groupes[0];
ok(g1.palier.rayon === 300 && g1.palier.mois === 6, "8 ventes à 300 m sur 6 mois : on s'arrête au premier palier");
ok(g1.medianeM2 === 5350, "médiane des 8 ventes : 5 350 €/m²");
ok(g1.valeurLibre === Math.round(45 * 5350) + Math.round(40 * 5350), "valeur libre = surface × médiane, lot par lot");

const peu = [vente({}), vente({ distance: 420, date: "2025-03-01" }), ...Array.from({ length: 7 }, () => vente({ distance: 420, date: "2025-03-01" }))];
const g2 = calculerEtude(lots, peu, "2025-12-31", REGLAGES_VIDES).groupes[0];
ok(g2.palier.rayon === 450 && g2.palier.mois === 12, "trop peu près et récent : on élargit à 450 m et 12 mois");

const avecFou = [...proches, vente({ prixM2: 1500 })];
const g3 = calculerEtude(lots, avecFou, "2025-12-31", REGLAGES_VIDES).groupes[0];
ok(g3.refs.some((r) => r.etat === "hors_marche") && g3.retenues === 8, "une vente à 1 500 €/m² est écartée d'office (hors marché)");

const g4 = calculerEtude(lots, proches, "2025-12-31", { ...REGLAGES_VIDES, immeublesExclus: { [proches[7].cleAdresse]: "standing" } }).groupes[0];
ok(g4.retenues === 7 && g4.refs.find((r) => r.id === proches[7].id)?.etat === "immeuble_exclu", "écarter un immeuble écarte ses ventes");

const loin = [...proches, vente({ surface: 80 })];
ok(calculerEtude(lots, loin, "2025-12-31", REGLAGES_VIDES).groupes[0].refs.length === 8, "un 80 m² ne compare pas des T2 de 40 à 45 m² (± 20 %)");

console.log("— Occupé, forfaits —");
const e5 = calculerEtude(lots, proches, "2025-12-31", { ...REGLAGES_VIDES, rendements: { A2: 5 }, forfaits: { Parking: 15000 } });
ok(e5.groupes[0].valeurOccupee === Math.round(10800 / 0.05) + Math.round(40 * 5350), "loué : loyer annuel / 5 % ; libre : valeur libre");
ok(e5.forfaits[0].valeur === 15000, "parking au forfait saisi");
ok(e5.totalLibre === e5.groupes[0].valeurLibre + 15000, "total libre = typologies + forfaits");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
