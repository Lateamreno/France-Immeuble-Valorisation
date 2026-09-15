import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NUMERO_STOP, PLAFOND_SMS, etatSms, expediteurValide, longueurFacturee,
  mentionStop, segments,
} from "./sms.ts";

test("segments : un message court tient en un", () => {
  assert.equal(
    segments("Bonjour, un immeuble de rapport a Nanterre, 12 lots, 9,2% brut. Dossier sur demande."),
    1,
  );
  assert.equal(segments("a".repeat(160)), 1, "160 caractères pile");
  assert.equal(segments("a".repeat(161)), 2, "161 caractères, 153 par segment");
});

test("segments : hors alphabet GSM, on compte au pire", () => {
  assert.equal(segments("Immeuble à Nanterre — 9,2 %"), 1, "le tiret cadratin sort du GSM mais tient en 70");
  assert.equal(segments("Immeuble 🏢 à vendre"), 1, "un emoji bascule en UCS-2");
  assert.equal(segments("é".repeat(71)), 1, "é EST dans l'alphabet GSM");
  assert.equal(segments("ê".repeat(71)), 2, "ê n'y est pas → UCS-2, 67 par segment");
  assert.equal(segments("œ".repeat(80)), 2);
});

test("segments : un message vide n'en consomme aucun", () => {
  assert.equal(segments(""), 0);
});

test("segments : jamais plus de neuf concaténés", () => {
  // MailingVox s'arrête à neuf. Annoncer douze ferait diverger `smslongnbr`
  // et ferait rejeter la campagne.
  assert.equal(segments("a".repeat(5000)), 9);
});

test("les caractères étendus comptent DOUBLE", () => {
  // « Les caractères |, ^, €, }, {, [, ~, ] et \\ comptent doubles » — c'est le
  // calcul qui se trompe en silence, et l'erreur ne se voit qu'à la facture.
  assert.equal(longueurFacturee("abc"), 3);
  assert.equal(longueurFacturee("€"), 2);
  assert.equal(longueurFacturee("a€b"), 4);
  assert.equal(longueurFacturee("[]{}~^|\\"), 16, "huit caractères étendus = seize places");
  // 80 euros = 160 places : encore un segment. 81 en ferait deux.
  assert.equal(segments("€".repeat(80)), 1);
  assert.equal(segments("€".repeat(81)), 2);
});

test("mentionStop : la désinscription doit être là", () => {
  assert.equal(mentionStop(`France Immeuble. STOP au ${NUMERO_STOP}`), true);
  assert.equal(mentionStop("stop au 36200"), true, "insensible à la casse");
  assert.equal(mentionStop("Immeuble à vendre, dossier sur demande."), false);
  // Piège : « stopper » contient « stop » mais n'est pas une mention.
  assert.equal(mentionStop("Nous allons stopper la commercialisation"), false);
});

test("expediteurValide : les règles MailingVox", () => {
  assert.equal(expediteurValide("FRANCEIMMO").ok, true);
  assert.equal(expediteurValide("FI2026").ok, true);
  assert.equal(expediteurValide("FRANCE IMMO").ok, false, "l'espace est refusé");
  assert.equal(expediteurValide("FRANCE-IMMO").ok, false, "le tiret est refusé");
  assert.equal(expediteurValide("IMMOBILIÈRE").ok, false, "l'accent est refusé");
  assert.equal(expediteurValide("FI").ok, false, "trois caractères minimum");
  assert.equal(expediteurValide("FRANCEIMMOBILIER").ok, false, "onze maximum");
  assert.equal(expediteurValide("202FI").ok, true, "trois chiffres devant passent");
  assert.equal(expediteurValide("2026FI").ok, false, "quatre chiffres devant, non");
});

test("le pont se déclare, et dit pourquoi quand il ne marche pas", () => {
  const e = etatSms();
  assert.equal(typeof e.configure, "boolean");
  assert.ok(e.message.length > 0, "un état sans explication n'aide personne");
  if (!e.configure) assert.match(e.message, /MAILINGVOX/, "dire QUELLE variable manque");
});

test("le plafond d'envoi est un nombre utilisable", () => {
  assert.ok(Number.isFinite(PLAFOND_SMS) && PLAFOND_SMS > 0);
});
