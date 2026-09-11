import { aggLocatif, ecartRef, loyerM2Actuel, loyerM2Potentiel } from "./marche";

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };
const f2 = (n: number) => Math.round(n * 100) / 100;

/* L'immeuble de l'avis de valeur à 436 000 €, repris tel quel du miroir :
   193 m² de surfaces louées pour 3 150 €/mois, plus quatre lots sans surface
   (deux caves, deux parkings) à 50 € chacun. */
const LOTS = [
  { Destination: "Logistique", surface_carrez: 45, loyer: 400, loyer_max: 400 },
  { Destination: "Logistique", surface_carrez: 45, loyer: 400, loyer_max: 400 },
  { Destination: "Logement", surface_carrez: 20, loyer: 400, loyer_max: 400 },
  { Destination: "Logement", surface_carrez: 25, loyer: 450, loyer_max: 450 },
  { Destination: "Commerce", surface_carrez: 14, loyer: 400, loyer_max: 400 },
  { Destination: "Commerce", surface_carrez: 14, loyer: 400, loyer_max: 400 },
  { Destination: "Bureau", surface_carrez: 15, loyer: 350, loyer_max: 350 },
  { Destination: "Bureau", surface_carrez: 15, loyer: 350, loyer_max: 350 },
  { Destination: "Parking", surface_carrez: 0, loyer: 50, loyer_max: 50 },
  { Destination: "Parking", surface_carrez: 0, loyer: 50, loyer_max: 50 },
  { Destination: "Cave", surface_carrez: 0, loyer: 50, loyer_max: 50 },
  { Destination: "Cave", surface_carrez: 0, loyer: 50, loyer_max: 50 },
];
const a = aggLocatif(LOTS);

console.log("— Ce que l'agrégat doit compter —");
ok(a.carrez === 193, `193 m² au total (obtenu ${a.carrez})`);
ok(a.loyersAn === 40200, `40 200 € de revenus, caves et parkings compris (obtenu ${a.loyersAn})`);
ok(a.loyersSurfAn === 37800, `37 800 € pour les seuls lots qui ont une surface (obtenu ${a.loyersSurfAn})`);
ok(a.loyersAn - a.loyersSurfAn === 2400, "2 400 € de caves et parkings, qui ne pèsent aucun m²");

console.log("\n— Le loyer au m², le défaut de l'avis de valeur —");
/* Le défaut : 200 €/mois de caves et parkings répartis sur les 193 m² des
   autres lots, soit +1,04 €/m² — et 8 points d'écart sur le verdict. */
const AVANT = a.loyersAn / 12 / a.carrezOcc;
ok(f2(AVANT) === 17.36, `l'ancien calcul rendait 17,36 €/m²/mois (obtenu ${f2(AVANT)})`);
ok(f2(loyerM2Actuel(a)) === 16.32, `le bon calcul rend 16,32 €/m²/mois (obtenu ${f2(loyerM2Actuel(a))})`);
ok(f2(loyerM2Potentiel(a)) === 16.32, "le potentiel suit la même règle");

console.log("\n— Le verdict du résumé —");
const REF = 12.79; // le loyer de secteur pondéré de cet immeuble
ok(ecartRef(AVANT, REF) === 36, `l'ancien calcul annonçait « +36 % » (obtenu ${ecartRef(AVANT, REF)})`);
ok(ecartRef(loyerM2Actuel(a), REF) === 28, `le bon calcul annonce « +28 % » (obtenu ${ecartRef(loyerM2Actuel(a), REF)})`);

console.log("\n— Ce qui ne doit PAS changer —");
/* Un loyer de cave reste un revenu : il entre au rendement comme les autres.
   Seul le ratio au m² l'exclut. */
ok(a.loyersAn === 40200, "le rendement continue de compter tous les loyers");
ok(f2((a.loyersAn / 436000) * 100) === 9.22, `rendement brut inchangé : 9,22 % (obtenu ${f2((a.loyersAn / 436000) * 100)})`);

console.log("\n— Les cas limites —");
const vide = aggLocatif([]);
ok(loyerM2Actuel(vide) === 0 && loyerM2Potentiel(vide) === 0, "aucun lot : zéro, pas une division par zéro");
const queDesCaves = aggLocatif([{ Destination: "Cave", surface_carrez: 0, loyer: 50 }]);
ok(loyerM2Actuel(queDesCaves) === 0, "que des caves : aucun loyer au m² n'a de sens");
const partiel = aggLocatif([
  { Destination: "Logement", surface_carrez: 50, loyer: 600 },
  { Destination: "Logement", surface_carrez: 50, loyer: 0 },
]);
ok(f2(loyerM2Actuel(partiel)) === 12, "un lot vide ne dilue pas le loyer au m² : on divise par la surface LOUÉE");

console.log(ko === 0 ? "\nTout tient." : `\n${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
