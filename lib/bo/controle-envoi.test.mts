import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAFOND_PJ_OCTETS, controlerEnvoi, domaineSuspect, emailPlausible,
  peserPiecesJointes, type Cible,
} from "./controle-envoi.ts";

const c = (n: string, email?: string, id?: string): Cible =>
  ({ rechercheId: `r-${n}`, contactId: id ?? `c-${n}`, nom: n, email });

test("emailPlausible : les adresses normales passent", () => {
  for (const v of [
    "marc@france-immeuble.fr", "m.a.voci+bo@gmail.com", "contact@sous.domaine.co.uk",
    "jean_dupont@orange.fr", "a1@b.io",
  ]) assert.equal(emailPlausible(v).ok, true, v);
});

test("emailPlausible : les vraies fautes de saisie sont attrapées", () => {
  const cas: [string, string][] = [
    ["", "vide"],
    ["marc voci@gmail.com", "contient une espace"],
    ["marcgmail.com", "pas d'arobase"],
    ["marc@@gmail.com", "plusieurs arobases"],
    ["@gmail.com", "rien avant l'arobase"],
    ["marc@gmailcom", "domaine sans point"],
    ["marc..voci@gmail.com", "deux points de suite"],
    [".marc@gmail.com", "commence ou finit par un point"],
    ["marc@gmail.c", "extension trop courte"],
    ["marc@gmail.123", "extension « .123 » douteuse"],
  ];
  for (const [v, raison] of cas) {
    const r = emailPlausible(v);
    assert.equal(r.ok, false, `${v} devrait être refusée`);
    assert.equal(r.raison, raison, v);
  }
});

test("domaineSuspect : la faute de frappe qui passe toutes les vérifications", () => {
  // « gmial.com » est une adresse parfaitement VALIDE. Elle n'existe
  // simplement pas — c'est pour ça qu'on la signale sans l'écarter.
  assert.equal(emailPlausible("marc@gmial.com").ok, true);
  assert.equal(domaineSuspect("marc@gmial.com"), "gmail.com");
  assert.equal(domaineSuspect("marc@ORANG.FR"), "orange.fr", "insensible à la casse");
  assert.equal(domaineSuspect("marc@gmail.com"), undefined);
});

test("contrôle : deux recherches du même client ne font qu'un destinataire", () => {
  const r = controlerEnvoi([
    c("Dupont", "dupont@gmail.com"),
    c("Dupont (2e recherche)", "Dupont@Gmail.com"),
    c("Martin", "martin@free.fr"),
  ]);
  assert.equal(r.personnes, 2, "deux personnes, pas trois");
  assert.equal(r.adresses.length, 2);
  assert.equal(r.doublons.length, 1);
  assert.deepEqual(r.doublons[0].noms, ["Dupont", "Dupont (2e recherche)"]);
});

test("contrôle : une adresse cassée est rendue avec sa raison ET sa fiche", () => {
  const r = controlerEnvoi([c("Durand", "durand@gmailcom", "contact-42")]);
  assert.equal(r.personnes, 0);
  assert.equal(r.invalides.length, 1);
  assert.equal(r.invalides[0].contactId, "contact-42", "sans la fiche, on ne peut pas corriger");
  assert.equal(r.invalides[0].raison, "domaine sans point");
  assert.equal(r.invalides[0].valeur, "durand@gmailcom");
});

test("contrôle : un acquéreur sans adresse est compté à part", () => {
  const r = controlerEnvoi([c("Sans-Mail", undefined), c("Vide", "   ")]);
  assert.equal(r.sansAdresse.length, 2);
  assert.equal(r.invalides.length, 0, "une fiche sans adresse n'est pas une adresse fausse");
});

test("contrôle : les exclusions arrivent avec leur motif", () => {
  const r = controlerEnvoi(
    [c("Parti", "parti@gmail.com"), c("Reste", "reste@gmail.com")],
    { exclues: new Map([["parti@gmail.com", "désinscrit"]]) },
  );
  assert.equal(r.personnes, 1);
  assert.equal(r.invalides[0].raison, "désinscrit");
});

test("contrôle : personne n'est écarté en silence", () => {
  const cibles = [
    c("A", "a@gmail.com"), c("B", "a@gmail.com"), c("C", "cassee@"),
    c("D", undefined), c("E", "e@free.fr"),
  ];
  const r = controlerEnvoi(cibles);
  const compte = r.personnes + r.invalides.length + r.sansAdresse.length
    + r.doublons.reduce((s, d) => s + d.noms.length - 1, 0);
  assert.equal(compte, cibles.length, "chaque ciblé doit se retrouver quelque part");
});

test("pièces jointes : le plafond de 3 Mo", () => {
  assert.equal(peserPiecesJointes([]).message, "Aucune pièce jointe.");
  const ok = peserPiecesJointes([1_000_000, 500_000]);
  assert.equal(ok.depasse, false);
  assert.match(ok.message, /^1,4 Mo|^1.4 Mo/);
  const trop = peserPiecesJointes([2_500_000, 1_200_000]);
  assert.equal(trop.depasse, true);
  assert.match(trop.message, /délivrabilité chute/);
  assert.equal(PLAFOND_PJ_OCTETS, 3 * 1024 * 1024);
});

test("pièces jointes : un poids inconnu se dit, il ne se devine pas", () => {
  // L'hébergeur du dossier ne renvoie pas toujours `content-length`. Compter
  // le fichier pour zéro laisserait croire qu'on tient sous le plafond.
  const r = peserPiecesJointes([1_000_000, undefined]);
  assert.match(r.message, /dont l'hébergeur ne donne pas le poids/);
  assert.equal(r.octets, 1_000_000);
});
