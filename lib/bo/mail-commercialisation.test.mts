import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deptDeCp, messageCommercialisation, natureImmeuble, objetCommercialisation,
  phraseRendement, prixCourt, groupeNominal, villeNue,
} from "./mail-commercialisation.ts";

test("prixCourt : le million s'écrit avec une décimale", () => {
  assert.equal(prixCourt(1_720_000), "1,7 M€");
  assert.equal(prixCourt(7_300_000), "7,3 M€");
  assert.equal(prixCourt(1_000_000), "1 M€");
});

test("prixCourt : en dessous du million, des milliers arrondis", () => {
  assert.equal(prixCourt(425_200), "425 k€");
  assert.equal(prixCourt(999_400), "999 k€");
});

test("prixCourt : rien à dire sur un prix absent ou nul", () => {
  assert.equal(prixCourt(undefined), undefined);
  assert.equal(prixCourt(0), undefined);
});

test("deptDeCp : les deux premiers chiffres, et rien si ce n'est pas un code postal", () => {
  assert.equal(deptDeCp("59000"), "59");
  assert.equal(deptDeCp("06400"), "06");
  assert.equal(deptDeCp("Lille"), undefined);
  assert.equal(deptDeCp(undefined), undefined);
});

test("objet : la ligne complète de MAV", () => {
  assert.equal(
    objetCommercialisation({
      ville: "Lille", codePostal: "59000", prixHai: 425_200, renta: 9.2, prixM2: 2203,
    }),
    "Immeuble à vendre à Lille (59), 425 k€, 9,2 %, 2 203 €/m²",
  );
});

test("objet : ce qui manque disparaît, sans « n.c. »", () => {
  assert.equal(
    objetCommercialisation({ ville: "Gron", codePostal: "89100" }),
    "Immeuble à vendre à Gron (89)",
  );
});

test("nature : une seule destination donne son nom", () => {
  assert.equal(natureImmeuble(["Logement"]), "logement");
  assert.equal(natureImmeuble(["Commerce", "Commerce"]), "commerce");
});

test("nature : deux destinations donnent « mixte »", () => {
  assert.equal(natureImmeuble(["Logement", "Commerce"]), "mixte");
});

test("nature : caves et parkings ne rendent pas un immeuble mixte", () => {
  assert.equal(natureImmeuble(["Logement", "Cave", "Parking"]), "logement");
});

test("nature : sans lot renseigné, on retombe sur « rapport »", () => {
  assert.equal(natureImmeuble([]), "rapport");
  assert.equal(natureImmeuble(undefined), "rapport");
});

test("rendement : partiellement loué, le potentiel s'annonce", () => {
  assert.equal(
    phraseRendement({ occupation: 90, renta: 9.6, rentaPotentielle: 10.6 }),
    "L'immeuble est loué à 90 % pour un rendement brut de 9,6 %. "
      + "Intégralement loué, le rendement brut passera à 10,6 %.",
  );
});

test("rendement : intégralement loué, pas de phrase de potentiel", () => {
  assert.equal(
    phraseRendement({ occupation: 100, renta: 8.1, rentaPotentielle: 8.9 }),
    "L'immeuble est intégralement loué, pour un rendement brut de 8,1 %.",
  );
});

test("rendement : un potentiel qui rejoint l'actuel ne s'annonce pas", () => {
  assert.equal(
    phraseRendement({ occupation: 80, renta: 7.4, rentaPotentielle: 7.45 }),
    "L'immeuble est loué à 80 % pour un rendement brut de 7,4 %.",
  );
});

test("rendement : un immeuble vide a sa propre phrase", () => {
  // Le piège de Lille : 0 % occupé et pourtant 9,2 % de rendement, parce que
  // le chiffre porte sur des loyers de marché. « Loué à 0 % » se contredirait.
  assert.equal(
    phraseRendement({ occupation: 0, renta: 9.2 }),
    "L'immeuble est actuellement vide. Loué, le rendement brut ressortirait à 9,2 %.",
  );
});

test("rendement : sans aucun chiffre, pas de phrase", () => {
  assert.equal(phraseRendement({ occupation: 50 }), undefined);
});

test("message : la trame de MAV, avec son lien", () => {
  const m = messageCommercialisation({
    ville: "Viry-Châtillon", codePostal: "91170", surfaceCarrez: 206,
    prixHai: 850_000, occupation: 90, renta: 9.6, rentaPotentielle: 10.6,
    destinations: ["Logement"], agentNom: "Romain Voci", agentTel: "06 12 34 56 78",
  }, "https://transfer.it/t/0rYZT3pV3DTY");

  assert.match(m, /^Bonjour,\n\n/);
  assert.ok(m.includes(
    "Vous trouverez ci-joint le dossier d'un immeuble de logement à Viry-Châtillon (91170)"
    + " d'une surface de 206 m² proposé à 850 000 € honoraires d'agence inclus.",
  ));
  assert.ok(m.includes("Intégralement loué, le rendement brut passera à 10,6 %."));
  assert.ok(m.includes("via ce lien : https://transfer.it/t/0rYZT3pV3DTY"));
  assert.ok(m.endsWith("Cordialement\n\nRomain Voci\nFrance Immeuble\n06 12 34 56 78"));
});

test("message : sans lien, on propose de l'envoyer plutôt qu'un lien vide", () => {
  const m = messageCommercialisation({ ville: "Lille", codePostal: "59000" }, "");
  assert.ok(!m.includes("via ce lien"));
  assert.ok(m.includes("je vous les transmets aussitôt"));
});

test("message : pas de ligne vide double quand un morceau manque", () => {
  const m = messageCommercialisation({ ville: "Lille" }, "");
  assert.ok(!m.includes("\n\n\n"), "trois sauts de ligne = un morceau absent mal recousu");
});

test("message : l'agent absent ne laisse pas de ligne fantôme", () => {
  const m = messageCommercialisation({ ville: "Lille", codePostal: "59000" }, "");
  assert.ok(m.endsWith("Cordialement\n\nFrance Immeuble"));
});

test("les milliers sont séparés par une espace INSÉCABLE étroite", () => {
  // Une espace ordinaire laisserait « 1 » en fin de ligne et « 720 000 » à la
  // suivante, dans l'objet comme dans le corps. Le test verrouille le
  // caractère, invisible à la lecture et donc impossible à surveiller à l'œil.
  assert.ok(prixCourt(1_720_000)!.includes(" ") === false, "1,7 M€ n'a pas de millier");
  const m = messageCommercialisation({ ville: "Lille", prixHai: 1_250_000 }, "");
  assert.ok(m.includes("1 250 000 €"), "le corps doit porter U+202F");
  assert.ok(!m.includes("1 250 000 €"), "et surtout pas une espace ordinaire");
});

test("la ville ne reçoit pas deux fois son code postal", () => {
  // `b.ville` porte déjà « Lille (59000) » : l'objet sortait
  // « Lille (59000) (59) » et le corps « Lille (59000) (59000) ».
  assert.equal(villeNue("Lille (59000)"), "Lille");
  assert.equal(villeNue("Viry-Châtillon"), "Viry-Châtillon");
  assert.equal(
    objetCommercialisation({ ville: "Lille (59000)", codePostal: "59000", prixHai: 425_200 }),
    "Immeuble à vendre à Lille (59), 425 k€",
  );
  const m = messageCommercialisation({
    ville: "Lille (59000)", codePostal: "59000", surfaceCarrez: 193,
  }, "");
  assert.ok(m.includes("à Lille (59000) d'une surface de 193 m²"), m.split("\n")[2]);
  assert.equal(m.match(/\(59000\)/g)?.length, 1, "le code postal ne doit sortir qu'une fois");
});

test("« un immeuble mixte », pas « un immeuble de mixte »", () => {
  assert.equal(groupeNominal("mixte"), "un immeuble mixte");
  assert.equal(groupeNominal("logement"), "un immeuble de logement");
  assert.equal(groupeNominal("rapport"), "un immeuble de rapport");
  assert.ok(messageCommercialisation({ ville: "Lille", destinations: ["Logement", "Commerce"] }, "")
    .includes("d'un immeuble mixte à Lille"));
});
