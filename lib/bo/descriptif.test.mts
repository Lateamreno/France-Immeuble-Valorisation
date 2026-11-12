import { descriptifAuto } from "./descriptif.ts";

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };

const lot = (Destination: string, Type_lot: string, surface: number | null, loyer: number | null, Type_bail = loyer ? "3/6/9" : "Vide") =>
  ({ Destination, Type_lot, surface_carrez: surface, loyer, Type_bail });

/* Argenteuil, rue Jean Grandel (retour #622) : des bureaux et des parkings, la gare loin, un bus tout près. */
const argenteuil = descriptifAuto({
  im: {
    adresse_ville: "Argenteuil", adresse_zipcode: "95100", ter_surface: 2218,
    emp_gare_name: "Val d'Argenteuil", emp_gare_time: 25, emp_gare_moyen: "à pied",
    emp_bus_name: "Jean Poulmarch", emp_bus_time: 3, emp_bus_moyen: "à pied",
    emp_com_name: "Centre Commercial Les Allées de Cormeilles", emp_com_time: 14, emp_com_moyen: "à pied",
  },
  lots: [lot("Bureau", "Bureaux", 97, 432), lot("Bureau", "Bureaux", 61.76, null), lot("Parking", "Parking", null, 29), lot("Parking", "Parking", null, null)],
  parcelles: [],
});
console.log(argenteuil, "\n");
ok(!argenteuil.includes("habitable"), "des bureaux : la surface est « utile », pas « habitable »");
ok(argenteuil.includes("2 bureaux (environ 159 m²) et 2 parkings"), "les lots se nomment, sans répéter « Bureaux »");
ok(!argenteuil.includes("Val d'Argenteuil") && !argenteuil.includes("Cormeilles"), "ni le nom de la gare, ni celui des commerces");
ok(argenteuil.includes("L'immeuble est à 3 min à pied d'un arrêt de bus, à 25 min à pied de la gare et à 14 min à pied des commerces."), "la phrase d'accès se lit");

/* Paris : une station de métro, à deux pas. */
const paris = descriptifAuto({
  im: { adresse_ville: "Paris", adresse_zipcode: "75011", emp_gare_name: "Metro Saint Ambroise", emp_gare_time: 5, emp_bus_time: 2, emp_com_name: "Franprix", emp_com_time: 2 },
  lots: [lot("Logement", "T2", 40, 1200), lot("Logement", "T3", 60, 1600), lot("Commerce", "Commerce", 50, 2000), lot("Cave", "Cave", null, null)],
  parcelles: [],
});
console.log(paris, "\n");
ok(paris.includes("surface habitable et utile"), "habitation et commerce : « habitable et utile »");
ok(paris.includes("2 logements (1 T2, 1 T3, environ 100 m²), 1 local commercial (environ 50 m²) et 1 cave"), "logements typés, local commercial, cave");
ok(paris.includes("L'immeuble est à 5 min à pied du métro et à 2 min à pied des commerces."), "métro ; pas de bus quand le métro est proche");

/* Tout en habitation, un RER sans durée. */
const hab = descriptifAuto({
  im: { adresse_ville: "Corbeil-Essonnes", adresse_zipcode: "91100", emp_gare_name: "RER D - Moulin Galant" },
  lots: [lot("Logement", "Studio", 20, 500), lot("Logement", "Studio", 22, 520)],
  parcelles: [],
});
console.log(hab, "\n");
ok(hab.includes("surface habitable totale"), "que de l'habitation : « habitable »");
ok(hab.includes("2 logements (2 Studio, environ 42 m²)"), "le type d'habitation est gardé");
ok(hab.includes("L'immeuble est proche du RER."), "un nom sans durée : « proche du RER »");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
