import { test } from "node:test";
import assert from "node:assert/strict";
import { ventilerHai } from "./bareme.ts";

test("Montval-sur-Loir : 208 000 € HAI → 12 000 € d'honoraires, le minimum du barème", () => {
  const v = ventilerHai(208_000, 5);
  assert.equal(v.honos, 12_000);
  assert.equal(v.nv, 196_000);
  assert.equal(v.auMinimum, true);
  assert.equal(v.taux, 6.12);
});

test("au-dessus du minimum, le pourcentage du barème : 5 % TTC du net vendeur", () => {
  const v = ventilerHai(1_030_000, 5);
  assert.equal(v.nv, 980_952);
  assert.equal(v.honos, 49_048);
  assert.equal(v.auMinimum, false);
});

test("sans taux saisi, c'est le barème", () => {
  assert.deepEqual(ventilerHai(208_000), ventilerHai(208_000, 5));
});

test("un taux au-dessus du barème est ramené au barème (le barème est un plafond)", () => {
  assert.equal(ventilerHai(1_030_000, 7).honos, 49_048);
});

test("un taux consenti plus bas est gardé, mais jamais sous le minimum", () => {
  const bas = ventilerHai(1_030_000, 4);
  assert.equal(bas.nv, 990_385);
  assert.equal(bas.auMinimum, false);
  const petit = ventilerHai(208_000, 3);
  assert.equal(petit.honos, 12_000);
  assert.equal(petit.auMinimum, true);
});

test("la tranche du dessus : 4 % TTC au-delà de 5 M€ de net vendeur", () => {
  const v = ventilerHai(7_280_000, 4);
  assert.equal(v.nv, 7_000_000);
  assert.equal(v.honos, 280_000);
});
