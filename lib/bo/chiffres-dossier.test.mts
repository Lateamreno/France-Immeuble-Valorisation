import { test } from "node:test";
import assert from "node:assert/strict";
import { chiffresDossier, ecartsDossierMandat, mandatDeReference } from "./chiffres-dossier.ts";

/* Le dossier V1 de Paris 18 tel qu'il est en base (03/11) ; son PDF imprime
   7 981 €/m², 3,6 % de rendement brut potentiel, 129 m², 0 % d'occupation. */
const P18 = {
  prix_hai: 1030000, prix_nv: 980952, "honos_taux_x,xx": 0.05, surface: 129.06,
  occupation: 0, loyer_hc_an: 0, loyer_hc_an_max: 46496.76000000001, travaux: 256500,
  renta_actuelle: 0, renta_max: 3.6,
};
const M2117 = { Statut: "En cours", prix_hai: 1030000, prix_nv: 980952, honos_taux: 5, date_signature: "2026-11-02T00:00:00.000Z" };

test("Paris 18 : les chiffres du dossier sont ceux du PDF", () => {
  const c = chiffresDossier(P18)!;
  assert.equal(c.prixM2, 7981);
  assert.equal(c.rentaPotentielle, 3.6);
  assert.equal(c.occupation, 0);
  assert.equal(c.honosPct, 5);
  assert.equal(c.source, "dossier");
});

test("les chiffres posés à la fabrication du PDF priment", () => {
  const c = chiffresDossier({ ...P18, chiffres_pdf: { prix_hai: 1030000, prix_m2: 7981, renta_potentielle: 3.5, surface: 129.06 } })!;
  assert.equal(c.rentaPotentielle, 3.5);
  assert.equal(c.source, "pdf");
});

test("sans renta_max, le potentiel se recalcule sur les loyers et travaux du dossier", () => {
  const c = chiffresDossier({ ...P18, renta_max: undefined })!;
  assert.equal(c.rentaPotentielle, 3.6);
});

test("dossier et mandat concordants : aucun écart", () => {
  assert.deepEqual(ecartsDossierMandat(P18, M2117), []);
});

test("un prix différent du mandat est signalé, avec les deux valeurs", () => {
  const e = ecartsDossierMandat(P18, { ...M2117, prix_hai: 1000000, prix_nv: 952381 });
  assert.equal(e.length, 2);
  assert.equal(e[0].quoi, "Prix HAI");
  assert.equal(e[0].dossier, "1 030 000 €");
  assert.equal(e[0].mandat, "1 000 000 €");
  assert.equal(e[1].quoi, "Net vendeur");
});

test("un taux d'honoraires différent est signalé", () => {
  const e = ecartsDossierMandat(P18, { ...M2117, honos_taux: 6 });
  assert.deepEqual(e.map((x) => x.quoi), ["Honoraires"]);
  assert.equal(e[0].dossier, "5 %");
  assert.equal(e[0].mandat, "6 %");
});

test("un euro d'arrondi n'est pas un écart", () => {
  assert.deepEqual(ecartsDossierMandat(P18, { ...M2117, prix_nv: 980953 }), []);
});

test("le mandat de référence : le dernier signé, jamais un annulé", () => {
  const m = mandatDeReference([
    { _id: "a", Statut: "Annulé", date_signature: "2026-12-01" },
    { _id: "b", Statut: "En cours", date_signature: "2026-10-01" },
    { _id: "c", Statut: "En cours", date_signature: "2026-11-02" },
    { _id: "d", Statut: "En cours" },
  ]);
  assert.equal(m?._id, "c");
});
