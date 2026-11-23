import { test } from "node:test";
import assert from "node:assert/strict";
import { clausesPublicite } from "./mandat-publicite.ts";

test("mandat avec publication : le pouvoir de publicité, tel qu'il a toujours été écrit", () => {
  const c = clausesPublicite(true);
  assert.equal(c.pouvoir, "Engager toute publicité sur tout support à sa convenance, les frais restant à sa charge.");
  assert.match(c.piecesSansLesquelles, /aucune publicité ne peut être engagée/);
});

test("mandat sans publication : aucun pouvoir de publicité, et l'interdiction écrite", () => {
  const c = clausesPublicite(false);
  assert.doesNotMatch(c.pouvoir, /Engager toute publicité|à sa convenance/);
  assert.match(c.pouvoir, /sans publicité/);
  assert.match(c.pouvoir, /s’interdit toute annonce/);
  assert.match(c.pouvoir, /sauf accord écrit du Mandant/);
  assert.doesNotMatch(c.pouvoir, /seul fichier/);
  // la page des obligations n'a que quatre lignes de marge : une phrase, pas un paragraphe
  assert.ok(c.pouvoir.length <= 200, `pouvoir trop long : ${c.pouvoir.length} caractères`);
  assert.doesNotMatch(c.piecesSansLesquelles, /publicité/);
});
