import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aSavoirAvant, concerne, copiePour, docFicheLot, ficheDeLUnite, ficheLotDe, libelleLot, rangStatut,
  regrouperLots, reglementAuCoffre, statutInitial, unitesDeVente, ventiler,
} from "./scission.ts";

const LOTS = [
  { _id: "a", numero: 1, Destination: "Commerce", Type_lot: "Boutique", etage: "0", surface_carrez: 58, loyer: 1800, prix_retenu: 310000 },
  { _id: "b", numero: 2, Destination: "Logement", Type_lot: "T2", etage: 2, surface_carrez: 34.25, loyer: 950, prix_retenu: 189000 },
  { _id: "c", numero: 12, Destination: "Cave", vente_avec: "b", prix_retenu: 4000 },
  { _id: "d", numero: 3, Destination: "Logement", Type_lot: "T3", etage: 3, surface_carrez: 61 },
  { _id: "e", numero: 20, Destination: "Parking", prix_retenu: 15000 },
  { _id: "f", numero: 21, Destination: "Parking", vente_avec: "disparu", prix_retenu: 15000 },
];

test("unités de vente : une cave rattachée part avec son lot, un parking seul se vend seul", () => {
  const u = unitesDeVente(LOTS);
  assert.deepEqual(u.map((x) => x.id), ["a", "b", "d", "e", "f"]);
  const t2 = u[1];
  assert.deepEqual(t2.lotIds, ["b", "c"]);
  assert.equal(t2.libelle, "Lot 2 — T2, 2e étage, 34,3 m² + cave 12");
  assert.equal(t2.prixHai, 193000);
  assert.equal(t2.loyer, 950);
  assert.ok(t2.loue);
  assert.equal(u[0].libelle, "Lot 1 — Boutique, rez-de-chaussée, 58 m²");
  assert.equal(u[3].libelle, "Lot 20 — Parking");
  assert.equal(u[4].lotIds.length, 1, "un rattachement vers un lot disparu est ignoré");
});

test("unités de vente : sans prix retenu, pas de total, et on dit lequel manque", () => {
  const t3 = unitesDeVente(LOTS)[2];
  assert.equal(t3.prixHai, undefined);
  assert.deepEqual(t3.sansPrix, ["Lot 3 — T3, 3e étage, 61 m²"]);
  assert.equal(t3.loue, false);
  assert.match(aSavoirAvant(t3)[0], /Sans prix retenu/);
  assert.deepEqual(aSavoirAvant(unitesDeVente(LOTS)[0]), []);
});

test("libellé d'un lot : ce qu'on a, sans trou", () => {
  assert.equal(libelleLot({ numero: 4 }), "Lot 4");
  assert.equal(libelleLot({ Destination: "Logement", etage: "-1" }), "Lot — Logement, sous-sol 1");
  assert.equal(libelleLot({ numero: 7, Type_lot: "Studio", etage: 1, surface_sol: 18 }), "Lot 7 — Studio, 1er étage, 18 m²");
});

test("statut de départ : celui de l'immeuble avant la vente, jamais commercialisé d'office", () => {
  assert.equal(statutInitial("2 - Estimation"), "2 - Estimation");
  assert.equal(statutInitial("6 - Commercialisé (all)"), "4 - OK pour vendre");
  assert.equal(statutInitial("11 - VENDU"), "4 - OK pour vendre");
  assert.equal(statutInitial(undefined), "4 - OK pour vendre");
  assert.equal(rangStatut("10 - Acte programmé"), 10);
});

test("prix : honoraires inclus ventilé au taux du mandat de l'immeuble", () => {
  assert.deepEqual(ventiler(210000, 5), { nv: 200000, honos: 10000 });
  assert.deepEqual(ventiler(193000, 4), { nv: 185577, honos: 7423 });
});

const IMMEUBLE = {
  _id: "im1", Statut: "6 - Commercialisé (all)", AGENT: "ag1", PROPRIETAIRE: "c1", source: "Réseau",
  adresse_ville: "Nanterre", adresse_rue: "rue Volant", adresse_numero_rue: "55", adresse_zipcode: "92000",
  emp_population: 96000, photo_main_compressed: "x.jpg", year_constru: 1930,
  prix_hai: 2400000, descriptif: "L'immeuble entier", plu_zone: "UA", ter_surface: 400, LOTs: ["a"], MANDATs: ["m1"],
  site_statut: "en_ligne", archived: false, etude_decoupe: { lots: {} },
};

test("fiche du lot : ce qu'elle reprend de l'immeuble, et ce qu'elle ne reprend pas", () => {
  const u = unitesDeVente(LOTS)[1];
  const doc = docFicheLot(IMMEUBLE, u, 5, "2026-11-22T08:00:00.000Z");
  assert.equal(doc.lot_de, "im1");
  assert.deepEqual(doc.lots_origine, ["b", "c"]);
  assert.equal(doc.lot_libelle, u.libelle);
  assert.equal(doc.en_copropriete, true);
  assert.equal(doc.Statut, "4 - OK pour vendre");
  assert.equal(doc.AGENT, "ag1");
  assert.equal(doc.PROPRIETAIRE, "c1");
  assert.equal(doc.adresse_rue, "rue Volant");
  assert.equal(doc.emp_population, 96000);
  assert.equal(doc.prix_hai, 193000);
  assert.equal(doc.prix_nv, 183810);
  assert.equal(doc.prix_honos_ttc, 9190);
  for (const k of ["_id", "descriptif", "plu_zone", "ter_surface", "LOTs", "MANDATs", "site_statut", "etude_decoupe"]) {
    assert.ok(!(k in doc), `${k} ne doit pas être repris`);
  }
  const sansPrix = docFicheLot(IMMEUBLE, unitesDeVente(LOTS)[2], 5, "2026-11-22T08:00:00.000Z");
  assert.ok(!("prix_hai" in sansPrix));
});

test("copies : rattachées à la fiche, renvois traduits, lien vers l'origine", () => {
  const corr = new Map([["b", "b2"], ["c", "c2"], ["loc1", "loc2"]]);
  const cave = copiePour({ ...LOTS[2], IMMEUBLE: "im1", site_rang: 3, "Created By": "x" }, "fiche", "t", corr);
  assert.equal(cave.IMMEUBLE, "fiche");
  assert.equal(cave.origine, "c");
  assert.equal(cave.vente_avec, "b2");
  assert.ok(!("site_rang" in cave) && !("_id" in cave) && !("Created By" in cave));
  const bail = copiePour({ _id: "bail1", IMMEUBLE: "im1", LOTs: ["b", "z"], LOCATAIREs: ["loc1"], loyer_init: 900 }, "fiche", "t", corr);
  assert.deepEqual(bail.LOTs, ["b2"]);
  assert.deepEqual(bail.LOCATAIREs, ["loc2"]);
  assert.equal(bail.loyer_init, 900);
  const seul = copiePour({ _id: "x", lot_rattache: "ailleurs" }, "fiche", "t", corr);
  assert.equal(seul.lot_rattache, null, "un renvoi hors de l'unité tombe");
  assert.ok(concerne({ LOTs: ["z", "c"] }, ["b", "c"]));
  assert.ok(!concerne({ LOTs: ["z"] }, ["b", "c"]));
  assert.ok(!concerne({}, ["b"]));
});

test("fiches déjà créées : retrouvées par le lot principal, une fiche archivée ne compte plus", () => {
  const u = unitesDeVente(LOTS)[1];
  const fiches = [
    ficheLotDe({ _id: "f0", lots_origine: ["b", "c"], archived: true, Statut: "0 - RETIRé" }),
    ficheLotDe({ _id: "f1", lot_libelle: "Lot 2", lots_origine: ["b", "c"], Statut: "4 - OK pour vendre", prix_hai: 193000 }),
  ];
  assert.equal(ficheDeLUnite(u, fiches)?.id, "f1");
  assert.equal(ficheDeLUnite(unitesDeVente(LOTS)[0], fiches), undefined);
});

test("règlement de copropriété : reconnu à son nom", () => {
  assert.ok(reglementAuCoffre([{ name: "Règlement de copropriété 2024.pdf" }]));
  assert.ok(reglementAuCoffre([{ file_name: "EDD - état descriptif de division.pdf" }]));
  assert.ok(!reglementAuCoffre([{ name: "Règlement intérieur.pdf" }, { name: "Bail lot 2.pdf" }]));
});

test("tableau de bord : les lots se rangent sous leur immeuble, le reste ne bouge pas", () => {
  const c = (id: string, lotDe?: string) => ({ id, lotDe });
  assert.deepEqual(regrouperLots([c("x"), c("l1", "im"), c("y"), c("im"), c("l2", "im")]).map((k) => k.id), ["x", "y", "im", "l1", "l2"]);
  assert.deepEqual(regrouperLots([c("x"), c("l1", "im"), c("y"), c("l2", "im")]).map((k) => k.id), ["x", "l1", "l2", "y"], "immeuble absent : à la place du premier lot");
  const sans = [c("a"), c("b")];
  assert.equal(regrouperLots(sans), sans);
});
