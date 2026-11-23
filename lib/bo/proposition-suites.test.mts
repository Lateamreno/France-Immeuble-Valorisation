import { test } from "node:test";
import assert from "node:assert/strict";
import { cleSuite, mentionOffre, mentionVisite, montantCourt, suitesDesPropositions } from "./proposition-suites.ts";

test("un montant se dit en k€, puis en M€", () => {
  assert.equal(montantCourt(450000), "450 k€");
  assert.equal(montantCourt(1250000), "1,25 M€");
  assert.equal(montantCourt(2000000), "2 M€");
  assert.equal(montantCourt(0), undefined);
  assert.equal(montantCourt(undefined), undefined);
});

test("#629 — l'offre : son montant, sa date, son issue", () => {
  assert.equal(mentionOffre({ prix_hai: 450000, date: "2026-11-18T10:00:00.000Z", Statut: "En cours" }), "Offre à 450 k€ le 18/11/26");
  assert.equal(mentionOffre({ prix_hai: 450000, date: "2026-11-18", Statut: "Acceptée" }), "Offre à 450 k€ le 18/11/26 — acceptée");
  assert.equal(mentionOffre({ prix_hai: 450000, date: "2026-11-18", Statut: "Compromis signé" }), "Offre à 450 k€ le 18/11/26 — acceptée");
  assert.equal(mentionOffre({ prix_nv: 430000, date: "2026-11-18", Statut: "Refusée" }), "Offre à 430 k€ le 18/11/26 — refusée");
  assert.equal(mentionOffre({ Statut: "En cours" }), "Offre");
});

test("#630 — la visite : prévue ou effectuée, jamais une visite annulée", () => {
  assert.equal(mentionVisite({ Statut: "Effectuée", date: "2026-11-20T14:00:00.000Z" }), "Visite effectuée le 20/11/26");
  assert.equal(mentionVisite({ Statut: "Confirmée", date: "2026-12-02" }), "Visite prévue le 02/12/26");
  assert.equal(mentionVisite({ Statut: "En attente", date: "2026-12-02" }), "Visite prévue le 02/12/26");
  assert.equal(mentionVisite({ Statut: "Annulée", date: "2026-12-02" }), undefined);
});

test("offres et visites se rattachent par contact et par immeuble ; la plus récente gagne", () => {
  const s = suitesDesPropositions(
    [
      { ACHETEURs: ["c1"], IMMEUBLEs: ["im1"], prix_hai: 400000, date: "2026-11-10", Statut: "Refusée" },
      { ACHETEURs: ["c1", "c2"], IMMEUBLEs: ["im1"], prix_hai: 450000, date: "2026-11-18", Statut: "En cours" },
      { ACHETEURs: ["c1"], IMMEUBLEs: ["im2"], prix_hai: 900000, date: "2026-11-01", Statut: "En cours" },
    ],
    [
      { VISITEURs: ["c1"], IMMEUBLE: "im1", date: "2026-11-05", Statut: "Effectuée" },
      { VISITEURs: ["c1"], IMMEUBLE: "im1", date: "2026-11-25", Statut: "Annulée" },
      { VISITEURs: ["c3"], IMMEUBLE: "im1", date: "2026-12-01", Statut: "Confirmée" },
    ],
  );
  assert.deepEqual(s.get(cleSuite("c1", "im1")), { offre: "Offre à 450 k€ le 18/11/26", visite: "Visite effectuée le 05/11/26" });
  assert.deepEqual(s.get(cleSuite("c2", "im1")), { offre: "Offre à 450 k€ le 18/11/26" });
  assert.deepEqual(s.get(cleSuite("c1", "im2")), { offre: "Offre à 900 k€ le 01/11/26" });
  assert.deepEqual(s.get(cleSuite("c3", "im1")), { visite: "Visite prévue le 01/12/26" });
  assert.equal(s.get(cleSuite("c9", "im1")), undefined);
});
