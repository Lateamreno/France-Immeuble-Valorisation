import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOTIFS_SUPPRESSION_CONTACT, MOTIF_SPAM, annonceSuppression, ceQuiRetient, destinSuppression,
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
