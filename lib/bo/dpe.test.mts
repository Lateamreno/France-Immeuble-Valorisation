import {
  adresseInterrogeable, estPerime, libelleAdresse, lotsPlausibles, normaliserVoie,
  repartition, scoreRapprochement, situationDpe, trierDpe, variantesNumero, type Dpe,
} from "./dpe.ts";

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };
const dpe = (o: Partial<Dpe> = {}): Dpe => ({ numeroDpe: "2295E0000001X", ...o });

console.log("— La normalisation des voies —");
ok(normaliserVoie("Bd du Gal de Gaulle") === normaliserVoie("Boulevard du Général de Gaulle"),
  "« Bd du Gal de Gaulle » retrouve « Boulevard du Général de Gaulle »");
ok(normaliserVoie("Rue Volant") === normaliserVoie("rue volant"), "la casse ne compte pas");
ok(normaliserVoie("Av. des Champs-Élysées") === "avenue champs elysees", "tirets, accents et point");
ok(normaliserVoie("Rue Jules Guesde") !== normaliserVoie("Rue Jules Verne"), "deux rues différentes le restent");
ok(normaliserVoie(undefined) === "", "une voie absente ne casse rien");

console.log("\n— Les numéros —");
ok(JSON.stringify(variantesNumero("34 Bis")) === JSON.stringify(["34bis", "34"]),
  `« 34 Bis » → 34bis puis 34 (obtenu ${JSON.stringify(variantesNumero("34 Bis"))})`);
ok(JSON.stringify(variantesNumero("55")) === JSON.stringify(["55"]), "un numéro nu n'a qu'une écriture");
ok(variantesNumero("")[0] === undefined, "pas de numéro, pas de variante");
ok(variantesNumero("19bis")[0] === "19bis" && variantesNumero("19bis").includes("19"),
  "« 19bis » collé marche aussi");

console.log("\n— Peut-on chercher ? —");
ok(adresseInterrogeable({ codePostal: "92000", rue: "Rue Volant" }), "code postal + voie suffisent");
ok(!adresseInterrogeable({ codePostal: "92000" }), "sans voie, on ne cherche pas");
ok(!adresseInterrogeable({ rue: "Rue Volant" }), "sans code postal non plus");
ok(!adresseInterrogeable({ codePostal: "920", rue: "Rue Volant" }), "un code postal tronqué est refusé");
ok(libelleAdresse({ numero: "55", rue: "Rue Volant", codePostal: "92000", ville: "Nanterre" })
  === "55 Rue Volant, 92000 Nanterre", "le libellé se lit");

console.log("\n— La validité —");
const T = Date.parse("2026-09-09T00:00:00Z");
ok(estPerime(dpe({ dateFinValidite: "2025-06-30" }), T), "un DPE échu est signalé");
ok(!estPerime(dpe({ dateFinValidite: "2035-04-25" }), T), "un DPE en cours ne l'est pas");
ok(!estPerime(dpe({}), T), "sans date de fin, on ne présume rien");

console.log("\n— L'affichage —");
ok(situationDpe(dpe({ etage: 0 })) === "rez-de-chaussée", "l'étage 0 seul s'écrit en toutes lettres");
ok(situationDpe(dpe({ etage: 3, complement: "À droite" })) === "3ᵉ étage · « À droite »",
  "étage + les mots du diagnostiqueur, entre guillemets");
ok(situationDpe(dpe({})) === "", "aucun étage connu → aucune invention");
/* Cas réel relevé au 55 rue Volant : le champ étage vaut 0 alors que le
   complément dit « Etage 2 ». Le zéro est un champ vide, pas un RDC. */
ok(situationDpe(dpe({ etage: 0, complement: "Etage 2; Porte Droite" })) === "« Etage 2; Porte Droite »",
  `un 0 contredit par le complément se tait (obtenu « ${situationDpe(dpe({ etage: 0, complement: "Etage 2; Porte Droite" }))} »)`);
ok(situationDpe(dpe({ etage: 2, complement: "Etage 2" })) === "2ᵉ étage · « Etage 2 »",
  "un étage non nul reste affiché même si le complément le répète");
const rep = repartition([dpe({ etiquetteDpe: "E" }), dpe({ etiquetteDpe: "E" }), dpe({ etiquetteDpe: "F" })]);
ok(rep.length === 2 && rep[0].lettre === "E" && rep[0].n === 2, "la répartition compte par lettre");
const tri = trierDpe([dpe({ etage: 2 }), dpe({ etage: 0 }), dpe({ etage: undefined })]);
ok(tri[0].etage === 0 && tri[2].etage === undefined, "du bas vers le haut, les inconnus en dernier");

console.log("\n— Le rapprochement (proposition, jamais décision) —");
const lots = [
  { id: "l1", libelle: "Lot 1 — T2", etage: 0, surface: 48 },
  { id: "l2", libelle: "Lot 7 — T3", etage: 2, surface: 58 },
  { id: "l3", libelle: "Lot 9 — cave", etage: undefined, surface: undefined },
];
ok(scoreRapprochement(dpe({ surface: 48.1, etage: 0 }), lots[0])! > 90, "surface et étage concordants → score haut");
ok(scoreRapprochement(dpe({ surface: 48.1, etage: 0 }), lots[1]) === 0, "le mauvais étage annule tout");
ok(scoreRapprochement(dpe({ surface: 80 }), lots[0]) === 0, "20 m² d'écart : ce n'est pas le même lot");
ok(scoreRapprochement(dpe({}), lots[0]) === undefined, "rien à comparer → aucun score, pas un zéro");
ok(scoreRapprochement(dpe({ surface: 48.1 }), lots[2]) === undefined, "un lot sans surface ne se juge pas");
const plaus = lotsPlausibles(dpe({ surface: 58.2, etage: 2 }), lots);
ok(plaus[0].lot.id === "l2", "le lot le plus plausible arrive en tête");
ok(plaus.length === 3, "aucun lot n'est retiré de la liste : l'agent garde la main");

console.log(ko === 0 ? "\nTout tient." : `\n${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
