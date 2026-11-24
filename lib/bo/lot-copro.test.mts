import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enCopropriete, aUnCommerce, tantiemesVendus, echeancesBail, dureeEnClair, reperesBail,
  tonTauxEffort, chargesAnnuelles, lireRegistre,
} from "./lot-copro.ts";

const AUJ = new Date("2026-11-20T00:00:00Z");

test("la copropriété se dit, elle ne se devine pas", () => {
  assert.equal(enCopropriete({}), false);
  assert.equal(enCopropriete({ en_copropriete: "true" }), false);
  assert.equal(enCopropriete({ en_copropriete: true }), true);
});

test("un bail du 1er avril 2019 a ses échéances la veille des anniversaires", () => {
  const e = echeancesBail("2019-04-01", undefined, AUJ);
  assert.deepEqual(e.map((x) => x.date), ["2022-03-31", "2025-03-31", "2028-03-31"]);
  assert.deepEqual(e.map((x) => x.passee), [true, true, false]);
  assert.equal(e[2].libelle, "Fin du bail");
});

test("une fin de bail saisie remplace les neuf ans", () => {
  const e = echeancesBail("2019-04-01T00:00:00.000Z", "2031-03-31", AUJ);
  assert.deepEqual(e.map((x) => x.date), ["2022-03-31", "2025-03-31", "2028-03-31", "2031-03-31"]);
  assert.equal(echeancesBail("", undefined, AUJ).length, 0);
});

test("la durée se dit en années et en mois", () => {
  assert.equal(dureeEnClair(AUJ, new Date("2028-03-31T00:00:00Z")), "1 an et 4 mois");
  assert.equal(dureeEnClair(AUJ, new Date("2027-06-20T00:00:00Z")), "7 mois");
  assert.equal(dureeEnClair(AUJ, new Date("2029-11-20T00:00:00Z")), "3 ans");
  assert.equal(dureeEnClair(AUJ, new Date("2026-11-25T00:00:00Z")), "moins d'un mois");
});

test("les repères de l'exemple des maquettes", () => {
  const r = reperesBail({
    loyerAnnuel: 57_950, prixHai: 990_000, surface: 92, effet: "2019-04-01",
    bail: { revision: "04-01" }, locataire: { ca: 612_000, ca_annee: 2025 }, aujourdHui: AUJ,
  });
  assert.equal(r.rendement, 5.85);
  assert.equal(r.tauxEffort, 9.5);
  assert.equal(r.tauxEffortSource, "comptes publiés 2025");
  assert.equal(r.loyerM2, 630);
  assert.equal(r.prixM2, 10761);
  assert.equal(r.prochaineEcheance, "2028-03-31");
  assert.equal(r.dureeFerme, "1 an et 4 mois");
  assert.equal(r.congeAvant, "2027-09-30");
  assert.equal(r.prochaineRevision, "2027-04-01");
  assert.ok(r.avancement! > 0.84 && r.avancement! < 0.86);
});

test("sans chiffre d'affaires, pas de taux d'effort ; le chiffre déclaré est nommé", () => {
  const base = { loyerAnnuel: 60_000, prixHai: 1_000_000, bail: {}, aujourdHui: AUJ };
  assert.equal(reperesBail({ ...base, locataire: {} }).tauxEffort, undefined);
  const r = reperesBail({ ...base, locataire: { ca_declare: 500_000, ca_declare_annee: 2026 } });
  assert.equal(r.tauxEffort, 12);
  assert.equal(r.tauxEffortSource, "chiffre déclaré 2026");
});

test("un local vide n'a ni rendement ni échéance", () => {
  const r = reperesBail({ prixHai: 9_010_000, surface: 742, bail: {}, locataire: {}, aujourdHui: AUJ });
  assert.equal(r.rendement, undefined);
  assert.equal(r.prixM2, 12143);
  assert.deepEqual(r.echeances, []);
  assert.equal(r.dureeFerme, undefined);
});

test("le taux d'effort se lit en trois tons", () => {
  assert.equal(tonTauxEffort(9.5), "bon");
  assert.equal(tonTauxEffort(11), "moyen");
  assert.equal(tonTauxEffort(15), "tendu");
  assert.equal(tonTauxEffort(undefined), "");
});

test("les charges annuelles viennent de l'appel du trimestre", () => {
  assert.equal(chargesAnnuelles({ charges_trimestre: 412 }), 1648);
  assert.equal(chargesAnnuelles({}), undefined);
});

test("le registre : comptes publiés, ou rien", () => {
  const r = lireRegistre({
    siren: "123456789", nom_complet: "EXEMPLE RESTAURATION (LE COMPTOIR)", nom_raison_sociale: "EXEMPLE RESTAURATION",
    date_creation: "2016-09-14", nombre_etablissements_ouverts: 1,
    dirigeants: [{ type_dirigeant: "personne physique", nom: "EXEMPLE", prenoms: "ALEX MARIE", qualite: "Président" }],
    finances: { "2024": { ca: 580000, resultat_net: 20000 }, "2025": { ca: 612000, resultat_net: 31000 } },
  });
  assert.deepEqual(r, {
    siren: "123456789", societe: "EXEMPLE RESTAURATION", creee_le: "2016-09-14", etablissements: 1,
    dirigeant: "ALEX EXEMPLE, président", ca: 612000, ca_annee: 2025, resultat: 31000,
  });
  const sans = lireRegistre({ siren: "123456789", finances: null, dirigeants: [] });
  assert.deepEqual(sans, { siren: "123456789" });
  assert.equal(lireRegistre({ siren: "12" }), null);
});

test("les tantièmes vendus s'additionnent lot par lot", () => {
  assert.equal(tantiemesVendus({ lots: [{ numero: "2", tantiemes: 60 }, { numero: "31", tantiemes: 27 }, { numero: "40" }] }), 87);
  assert.equal(tantiemesVendus({ lots: [{ numero: "2" }] }), undefined);
  assert.equal(tantiemesVendus({}), undefined);
});

test("un commerce parmi les lots ouvre l'emplacement commercial", () => {
  assert.equal(aUnCommerce([{ Destination: "Cave" }, { Destination: "Commerce" }]), true);
  assert.equal(aUnCommerce([{ Destination: "Logement" }]), false);
});
