import { dateCivile, dmy, jourIso } from "./format";

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };

/* Les trois formes réellement présentes dans le miroir, relevées sur les 124
   contacts qui portent une date de naissance :
     96 × instant UTC à 23 h (hiver, CET = UTC+1)
     26 × instant UTC à 22 h (été,   CEST = UTC+2)
      2 × date nue AAAA-MM-JJ
   Bubble enregistre le MINUIT PARISIEN du jour choisi. Lire ces instants en
   UTC — ou couper la chaîne à dix caractères — rend le jour précédent. */

console.log("— La date d'état civil, à l'affichage —");
ok(dateCivile("1964-12-15T23:00:00.000Z") === "16/12/1964",
  `hiver : minuit parisien du 16 → 16/12/1964 (obtenu ${dateCivile("1964-12-15T23:00:00.000Z")})`);
ok(dateCivile("1985-06-30T22:00:00.000Z") === "01/07/1985",
  `été : minuit parisien du 1er → 01/07/1985 (obtenu ${dateCivile("1985-06-30T22:00:00.000Z")})`);
ok(dateCivile("1964-12-16") === "16/12/1964", "une date nue se lit telle quelle");
ok(dateCivile("1964-12-15T23:00:00.000Z")?.endsWith("1964") === true, "l'année tient sur quatre chiffres");
ok(dmy("1964-12-15T23:00:00.000Z") === "16/12/64",
  "dmy reste sur deux chiffres — c'est pourquoi on ne s'en sert pas pour un état civil");
ok(dateCivile(undefined) === undefined, "rien en entrée, rien en sortie");
ok(dateCivile("") === undefined, "une chaîne vide n'est pas une date");
ok(dateCivile("pas une date") === undefined, "une chaîne illisible ne rend pas « Invalid Date »");
ok(dateCivile(1964) === undefined, "un nombre n'est pas accepté sans le dire");

console.log("\n— La date d'état civil, dans la case de saisie —");
ok(jourIso("1964-12-15T23:00:00.000Z") === "1964-12-16",
  `hiver : la case affiche le 16, pas le 15 (obtenu ${jourIso("1964-12-15T23:00:00.000Z")})`);
ok(jourIso("1985-06-30T22:00:00.000Z") === "1985-07-01", "été : même règle");
ok(jourIso("1964-12-16") === "1964-12-16", "une date nue ressort à l'identique");
/* Le point qui compte : la valeur relue doit redonner la même, sinon la date
   recule d'un jour à chaque enregistrement. */
ok(jourIso(jourIso("1964-12-15T23:00:00.000Z")) === "1964-12-16",
  "idempotente : deux passages ne décalent rien");
ok(jourIso("") === undefined && jourIso(undefined) === undefined, "vide → undefined");
ok(jourIso("n'importe quoi") === undefined, "illisible → undefined");

console.log("\n— Le défaut d'origine, pour mémoire —");
const AVANT = "1964-12-15T23:00:00.000Z".slice(0, 10);
ok(AVANT === "1964-12-15" && jourIso("1964-12-15T23:00:00.000Z") === "1964-12-16",
  `slice(0,10) rendait ${AVANT}, soit un jour de moins`);

console.log(ko === 0 ? "\nTout tient." : `\n${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
