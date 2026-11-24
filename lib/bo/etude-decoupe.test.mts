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

console.log("— Lot par lot —");
const lots2 = [
  { _id: "a", Destination: "Logement", Type_lot: "T2", surface_carrez: 45, etage: "5" },
  { _id: "b", Destination: "Logement", Type_lot: "T2", surface_carrez: 40, etage: "RDC" },
  { _id: "c", Destination: "Commerce", Type_lot: "Boutique", surface_carrez: 60, loyer: 1500 },
  { _id: "d", Destination: "Parking" },
  { _id: "e", Destination: "Annexe" },
];
const locaux = Array.from({ length: 8 }, (_, i) => vente({ type: "L", pieces: 0, surface: 60, prixM2: 3000 + i * 100 }));
const e6 = calculerEtude(lots2, [...proches, ...locaux], "2025-12-31", {
  ...REGLAGES_VIDES, rendements: { L: 6 }, forfaits: { Parking: 15000 },
  lots: { a: { etage: 5, exterieur: 3 }, b: { etage: -10, note: "sur rue" } },
});
ok(e6.lots.map((l) => l.id).join() === "a,b,c,d,e", "chaque lot de l'état locatif, dans son ordre");
const la = e6.lots[0], lb = e6.lots[1], lc = e6.lots[2];
ok(la.prediction === Math.round(45 * 5350) && la.ajustementPct === 8, "prédiction = surface × prix secteur ; ajustements additionnés");
ok(la.valeurLibre === Math.round(la.prediction * 1.08), "valeur libre = prédiction × (1 + ajustements)");
ok(lb.valeurLibre === Math.round(lb.prediction * 0.9) && lb.prixM2Retenu === Math.round(lb.valeurLibre / 40), "un rez-de-chaussée à −10 %, et son prix au m² retenu");
ok(lc.methode === "rendement" && lc.valeurLibre === Math.round(18000 / 0.06), "local loué : loyer annuel / rendement, libre comme occupé");
ok(lc.ecartSecteur === Math.round(((300000 / 60 - lc.prixM2Secteur!) / lc.prixM2Secteur!) * 100), "local au rendement : écart avec le prix au m² du secteur");
ok(e6.lots[3].methode === "forfait" && e6.lots[3].valeurLibre === 15000, "parking : au forfait");
ok(e6.lots[4].methode === "aucune" && e6.lots[4].valeurLibre === 0, "annexe : non chiffrée");
ok(e6.totalLibre === la.valeurLibre + lb.valeurLibre + lc.valeurLibre + 15000, "le total libre suit les lots ajustés");
const sansRdt = calculerEtude(lots2, [...proches, ...locaux], "2025-12-31", REGLAGES_VIDES).lots[2];
ok(sansRdt.methode === "m2" && sansRdt.valeurLibre === sansRdt.prediction, "local loué sans rendement saisi : au prix du secteur");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
