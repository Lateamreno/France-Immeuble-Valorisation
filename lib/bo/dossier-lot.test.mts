import { test } from "node:test";
import assert from "node:assert/strict";
import { pagesLot } from "./dossier-lot.ts";

const AUJ = new Date("2026-11-20T00:00:00Z");
const lot = { _id: "L1", Destination: "Commerce", surface_carrez: 92, loyer: 4829.17, Type_bail: "3/6/9" };
const reserve = { _id: "L2", Destination: "Cave", surface_carrez: 30 };
const bail = { LOTs: ["L1"], date_start: "2019-04-01T00:00:00.000Z", loyer_init: 4333.33, depot_garantie: 14487, indice_type: "ILC" };
const im = {
  en_copropriete: true, nature: "local_commercial",
  bail_local: { revision: "04-01", destination: "Restauration traditionnelle", taxe_fonciere: "Le locataire", charges_copro: "Le locataire", gros_travaux: "Le bailleur", droit_preference: true },
  locataire_local: { enseigne: "Le Comptoir d'Exemple", societe: "EXEMPLE RESTAURATION", activite: "Restaurant", creee_le: "2016-09-14", dirigeant: "Alex Exemple, président", etablissements: 1, ca: 612000, ca_annee: 2025, note_interne: "paie en retard" },
  copro: { lots_total: 24, lots_principaux: 14, syndic: "Cabinet Exemple", tantiemes: 87, tantiemes_base: 1000, charges_trimestre: 412, travaux: [{ libelle: "Ravalement", montant: 148000, part: 12876, charge: "Vendeur" }, { libelle: "  " }] },
  emp_commerce: { qualite: "N° 1 bis", concurrents: "3 restaurants à moins de 200 m" },
};
const b = { im, lots: [lot, reserve], baux: [bail], locataires: [] };
const plat = (x: unknown) => JSON.stringify(x);

test("pas de copropriété, pas de page", () => {
  assert.equal(pagesLot({ ...b, im: { ...im, en_copropriete: false } }, { prixHai: 990000, aujourdHui: AUJ }), null);
});

test("le bail : échéances, lignes, qui paie quoi, à savoir", () => {
  const p = pagesLot(b, { prixHai: 990000, aujourdHui: AUJ })!;
  assert.equal(p.nature, "Local commercial");
  assert.deepEqual(p.bail!.frise!.echeances.map((e) => e.date), ["2022-03-31", "2025-03-31", "2028-03-31"]);
  const l = Object.fromEntries(p.bail!.lignes);
  assert.equal(l["Type"], "Commercial 3/6/9");
  assert.equal(l["Date d'effet"], "1ᵉʳ avril 2019");
  assert.equal(l["Prochaine échéance"], "31 mars 2028");
  assert.equal(l["Durée ferme restante"], "1 an et 4 mois");
  assert.equal(l["Loyer annuel HT HC"], "57 950 €");
  assert.equal(l["Loyer à la signature"], "52 000 €");
  assert.equal(l["Signé le"], undefined, "une ligne vide ne s'imprime pas");
  assert.deepEqual(p.bail!.quiPaie.map((x) => x[1]), ["Le locataire", "Le locataire", "Le bailleur"]);
  assert.equal(p.bail!.aSavoir.length, 2);
  assert.match(p.bail!.aSavoir[0], /30 septembre 2027/);
});

test("le locataire n'est nommé que si l'agent l'a choisi", () => {
  const anonyme = pagesLot(b, { prixHai: 990000, aujourdHui: AUJ })!.locataire!;
  assert.equal(anonyme.nomme, false);
  for (const interdit of ["Comptoir", "EXEMPLE", "612", "Alex", "retard"]) assert.ok(!plat(anonyme).includes(interdit), interdit);
  assert.ok(plat(anonyme).includes("Communiqué sur demande"));
  const nomme = pagesLot(b, { prixHai: 990000, nommerLocataire: true, aujourdHui: AUJ })!.locataire!;
  assert.ok(plat(nomme).includes("Le Comptoir d'Exemple"));
  assert.ok(plat(nomme).includes("612 000 € (comptes publiés)"));
  assert.ok(plat(nomme).includes("9,5 % du chiffre d'affaires"));
});

test("le dirigeant et la note interne ne sortent jamais", () => {
  const tout = plat(pagesLot(b, { prixHai: 990000, nommerLocataire: true, aujourdHui: AUJ }));
  assert.ok(!tout.includes("Alex"));
  assert.ok(!tout.includes("retard"));
  assert.ok(!tout.includes("concurrents") && !tout.includes("3 restaurants"));
});

test("les chiffres de l'investissement et ce qui reste au bailleur", () => {
  const p = pagesLot(b, { prixHai: 990000, aujourdHui: AUJ })!.locataire!;
  assert.deepEqual(p.chiffres.map((c) => c.valeur), ["5,85 %", "630 €", "10 761 €"]);
  assert.deepEqual(Object.fromEntries(p.lecture)["Reste à la charge du bailleur"], "gros travaux");
});

test("la copropriété : lignes remplies seulement, travaux sans ligne vide", () => {
  const tout = pagesLot(b, { prixHai: 990000, aujourdHui: AUJ })!;
  const c = tout.copro!;
  assert.deepEqual(c.lignes, [["Nombre de lots", "24, dont 14 principaux"], ["Syndic", "Cabinet Exemple"]]);
  assert.deepEqual(c.lot, [["Tantièmes généraux", "87 / 1 000"], ["Charges", "412 € par trimestre · 1 648 € par an"]]);
  assert.equal(c.travaux.length, 1);
  assert.equal(c.travaux[0].part, "12 876 €");
  assert.deepEqual(tout.emplacement, [["Qualité de l'emplacement", "N° 1 bis"]]);
});

test("un local libre n'a ni page bail ni page locataire", () => {
  const p = pagesLot({ im: { en_copropriete: true }, lots: [{ _id: "L1", Destination: "Commerce", surface_carrez: 742, Type_bail: "Vide" }], baux: [], locataires: [] }, { prixHai: 9010000, aujourdHui: AUJ })!;
  assert.equal(p.bail, undefined);
  assert.equal(p.locataire, undefined);
  assert.equal(p.copro, undefined);
  assert.equal(p.nature, "Immeuble entier");
});
