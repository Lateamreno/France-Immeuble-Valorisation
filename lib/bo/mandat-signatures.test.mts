import { test } from "node:test";
import assert from "node:assert/strict";
import { dispositionSignatures, lignesDeSignatures } from "./mandat-signatures.ts";

test("jusqu'à quatre signataires : rien ne change (deux colonnes, cadre de 30 mm)", () => {
  for (const n of [1, 2, 3, 4]) assert.deepEqual(dispositionSignatures(n), { colonnes: 2, cadreMm: 30, ecartMm: 7 });
});

test("cinq ou six signataires : trois colonnes, deux lignes, cadre inchangé", () => {
  for (const n of [5, 6]) {
    assert.equal(dispositionSignatures(n).colonnes, 3);
    assert.equal(dispositionSignatures(n).cadreMm, 30);
    assert.equal(lignesDeSignatures(n), 2);
  }
});

test("la page ne porte jamais plus de deux lignes de cadres de 30 mm", () => {
  for (let n = 1; n <= 12; n++) {
    const d = dispositionSignatures(n);
    if (d.cadreMm === 30) assert.ok(lignesDeSignatures(n) <= 2, `${n} signataires`);
  }
});

test("au-delà de six : les cadres rétrécissent, on garde de quoi signer", () => {
  assert.equal(lignesDeSignatures(9), 3);
  assert.ok(dispositionSignatures(9).cadreMm >= 15);
  assert.equal(lignesDeSignatures(12), 4);
  assert.ok(dispositionSignatures(12).cadreMm >= 10);
});
