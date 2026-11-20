import { test } from "node:test";
import assert from "node:assert/strict";
import { chargesDuDossier, estUneTaxe } from "./dossier-charges.ts";

const c = (type: string, total: number) => ({ type, total, recup: total, nonRecup: 0 });
const ARGENTEUIL = [
  c("Taxe Foncière", 44048), c("Eau", 1400), c("Ascenseur", 1650), c("Ménage", 8760), c("Entretien", 1000), c("Assurance", 4582),
  c("Poubelles", 2976), c("Autre", 500), c("Entretien", 2000), c("Electricité", 13000), c("Taxe Bureau", 5300), c("Autre", 400),
];

test("peu de charges : la page ne change pas", () => {
  const r = chargesDuDossier(ARGENTEUIL.slice(0, 5), 2);
  assert.equal(r.lignes.length, 5);
  assert.equal(r.tasse, false);
  assert.equal(r.detail, undefined);
});

test("Argenteuil, douze charges : toutes gardées, lignes resserrées", () => {
  const r = chargesDuDossier(ARGENTEUIL, 2);
  assert.deepEqual(r.lignes, ARGENTEUIL);
  assert.equal(r.tasse, true);
  assert.equal(r.detail, undefined);
});

test("treize charges tiennent encore sans regrouper", () => {
  const r = chargesDuDossier([...ARGENTEUIL, c("Gaz", 700)], 2);
  assert.equal(r.lignes.length, 13);
  assert.equal(r.detail, undefined);
});

test("au-delà de treize : les taxes une à une, le reste réuni, et le détail à la suite", () => {
  const tout = [...ARGENTEUIL, c("Gaz", 700), c("Internet", 300), c("Taxe de balayage", 250)];
  const r = chargesDuDossier(tout, 2);
  assert.deepEqual(r.lignes.map((l) => l.type), ["Taxe Foncière", "Taxe Bureau", "Taxe de balayage", "Autres charges"]);
  const autres = r.lignes[3];
  assert.equal(autres.postes, 12);
  assert.equal(autres.total, 1400 + 1650 + 8760 + 1000 + 4582 + 2976 + 500 + 2000 + 13000 + 400 + 700 + 300);
  assert.equal(r.lignes.reduce((s, l) => s + (l.total ?? 0), 0), tout.reduce((s, l) => s + l.total, 0), "le total ne bouge pas");
  assert.equal(r.tasse, false);
  assert.equal(r.detail!.lignes.length, 15);
  assert.equal(r.detail!.tasse, false);
});

test("ce qui compte comme une taxe", () => {
  for (const t of ["Taxe Foncière", "Taxe Bureau", "CRL", "Cotisation Foncière des Entreprises", "Taxe de balayage"]) assert.ok(estUneTaxe(t), t);
  for (const t of ["Eau", "Assurance", "Autre", "Poubelles"]) assert.ok(!estUneTaxe(t), t);
});

test("un montant inconnu reste inconnu dans la ligne réunie", () => {
  const tout = Array.from({ length: 14 }, (_, i) => ({ type: `Poste ${i}` }));
  assert.equal(chargesDuDossier(tout, 1).lignes[0].total, undefined);
});
