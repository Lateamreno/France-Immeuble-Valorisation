import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOTIFS_SUPPRESSION_CONTACT, MOTIF_SPAM, annonceSuppression, ceQuiRetient, contactSupprime, destinSuppression,
  recherchesARendre, recherchesARetirer, relancesACouper, relancesARendre,
} from "./contact-suppression.ts";

const RIEN = { immeubles: 0, recherches: 0, propositions: 0, mandats: 0, suivis: 0 };

test("les motifs sont ceux d'un contact, pas ceux d'un immeuble", () => {
  assert.equal(MOTIFS_SUPPRESSION_CONTACT[0], MOTIF_SPAM);
  for (const m of ["Ne souhaite pas vendre", "Mandat expiré", "Préfère vendre à la découpe", "Pas un immeuble"]) {
    assert.ok(!MOTIFS_SUPPRESSION_CONTACT.includes(m), m);
  }
});

test("un faux contact sans rien : corbeille", () => {
  assert.equal(destinSuppression(MOTIF_SPAM, RIEN), "corbeille");
  assert.equal(destinSuppression("C'était un test", RIEN), "corbeille");
});

test("un faux contact auquel quelque chose tient : retiré des listes, pas effacé", () => {
  assert.equal(destinSuppression(MOTIF_SPAM, { ...RIEN, propositions: 1 }), "retrait");
  assert.equal(destinSuppression(MOTIF_SPAM, { ...RIEN, suivis: 2 }), "retrait");
});

test("un doublon ou de mauvaises coordonnées ne partent jamais à la corbeille", () => {
  assert.equal(destinSuppression("Doublon", RIEN), "retrait");
  assert.equal(destinSuppression("Mauvaises coordonnées", RIEN), "retrait");
  assert.equal(destinSuppression("Autre", RIEN), "retrait");
});

test("ce qui retient une fiche se dit en clair", () => {
  assert.equal(ceQuiRetient(RIEN), "");
  assert.equal(ceQuiRetient({ ...RIEN, recherches: 1 }), "1 recherche");
  assert.equal(ceQuiRetient({ ...RIEN, propositions: 2, recherches: 1 }), "2 propositions et 1 recherche");
  assert.equal(ceQuiRetient({ immeubles: 1, mandats: 1, propositions: 3, recherches: 0, suivis: 0 }), "1 bien, 1 mandat et 3 propositions");
});

test("la fenêtre n'annonce la corbeille que pour un faux contact ou un essai", () => {
  assert.match(annonceSuppression(MOTIF_SPAM), /corbeille/);
  assert.doesNotMatch(annonceSuppression("Doublon"), /corbeille/);
  assert.match(annonceSuppression("Doublon"), /Contacts supprimés/);
});

test("à la suppression : les recherches encore actives sortent, les relances des envois sont coupées", () => {
  const recherches = [
    { id: "r1", data: {} }, { id: "r2", data: { archived: false, standby: true } }, { id: "r3", data: { archived: true } },
  ];
  assert.deepEqual(recherchesARetirer(recherches), ["r1", "r2"]);
  const props = [
    { id: "p1", data: { Statut: "Envoyée" } }, { id: "p2", data: { Statut: "Envoyée", stop_relances_yn: true } },
    { id: "p3", data: { Statut: "Refusée" } }, { id: "p4", data: { Statut: "Visite" } },
  ];
  assert.deepEqual(relancesACouper(props), ["p1"]);
});

test("au rétablissement : on ne rend que ce que la suppression avait retiré", () => {
  const recherches = [
    { id: "r1", data: { archived: true, retiree_avec_contact: true } },
    { id: "r3", data: { archived: true } }, // archivée par l'agent bien avant : elle le reste
    { id: "r4", data: { archived: false, retiree_avec_contact: true } },
  ];
  assert.deepEqual(recherchesARendre(recherches), ["r1"]);
  const props = [
    { id: "p1", data: { stop_relances_yn: true, relances_coupees_avec_contact: true } },
    { id: "p2", data: { stop_relances_yn: true } }, // coupée à la demande du client : elle le reste
  ];
  assert.deepEqual(relancesARendre(props), ["p1"]);
});

test("un contact supprimé se reconnaît à sa marque, et à elle seule", () => {
  assert.equal(contactSupprime({ archived: true }), true);
  assert.equal(contactSupprime({ archived: false }), false);
  assert.equal(contactSupprime({}), false);
  assert.equal(contactSupprime(undefined), false);
});
