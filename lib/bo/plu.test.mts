import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chiffreDansExtraits, dateGpu, ecrirePlages, lectureDe, lirePlages, lireReponse, lireServitudes, lireZoneGpu,
  nettoyerPages, pagesALire, planDuReglement, propositions, racineZone, typeZoneEnClair,
  type LecturePlu,
} from "./plu.ts";

const ZONE = { features: [{ properties: {
  libelle: "UAi7c5", libelong: "Secteur économique dédié aux vastes emprises d'emplois productifs", typezone: "U",
  nomfic: "200057990_reglement_20250630.pdf#page=55", gpu_doc_id: "35b89739df91562887f9e4623801ace5",
  partition: "DU_200057990", datvalid: "20250630",
} }] };
const DOCS = { features: [{ properties: { id: "35b89739df91562887f9e4623801ace5", grid_title: "PLUI BOUCLE NORD DE SEINE", du_type: "PLUi" } }] };

test("Géoportail : la zone, son type, le document et le PDF du règlement", () => {
  const z = lireZoneGpu(ZONE, DOCS)!;
  assert.equal(z.zone, "UAi7c5");
  assert.equal(z.type, "Urbaine");
  assert.equal(z.code, "U");
  assert.equal(z.document, "PLUi Boucle Nord de Seine");
  assert.equal(z.approuve, "2025-06-30");
  assert.equal(z.page, 55);
  assert.equal(z.reglement, "https://data.geopf.fr/annexes/gpu/documents/DU_200057990/35b89739df91562887f9e4623801ace5/200057990_reglement_20250630.pdf");
});

test("Géoportail : aucun zonage numérisé → rien", () => {
  assert.equal(lireZoneGpu({ features: [] }), null);
  assert.equal(lireZoneGpu(null), null);
  assert.equal(lireZoneGpu({ features: [{ properties: { libelle: "" } }] }), null);
});

test("Géoportail : types de zone et dates", () => {
  assert.equal(typeZoneEnClair("AUc"), "À urbaniser");
  assert.equal(typeZoneEnClair("N"), "Naturelle");
  assert.equal(typeZoneEnClair("A"), "Agricole");
  assert.equal(typeZoneEnClair("Nh"), "");
  assert.equal(dateGpu("2025-06-30"), "2025-06-30");
  assert.equal(dateGpu(""), undefined);
});

test("Géoportail : une zone sans PDF, ou une adresse entière dans urlfic", () => {
  const sans = lireZoneGpu({ features: [{ properties: { libelle: "UB", typezone: "U" } }] })!;
  assert.equal(sans.reglement, undefined);
  const url = lireZoneGpu({ features: [{ properties: { libelle: "UB", urlfic: "https://exemple.fr/reglement.pdf#page=12" } }] })!;
  assert.equal(url.reglement, "https://exemple.fr/reglement.pdf");
  assert.equal(url.page, 12);
});

test("Géoportail : les servitudes, sans doublon", () => {
  const a = { features: [{ properties: { libelle: "Droit de préemption urbain" } }, { properties: { libelle: "droit de préemption urbain" } }] };
  const b = { features: [{ properties: { libelle: "Permis de démolir" } }, { properties: {} }] };
  assert.deepEqual(lireServitudes(a, null, b), ["Droit de préemption urbain", "Permis de démolir"]);
});

test("pages : le tampon et le pied numéroté qui reviennent partout sont retirés", () => {
  const pages = Array.from({ length: 40 }, (_, i) => [
    "Accusé de réception en préfecture", i < 6 ? `Règlement écrit– Tome 2 - Page - ${i + 1}` : `Règlement écrit – Tome 1 – Page – ${i + 1}`,
    i === 12 ? "ARTICLE 4. EMPRISE AU SOL" : `Texte propre à la page ${i % 3 === 0 ? "a" : "b"} numéro ${"x".repeat(i)}`,
  ].join("\n"));
  const net = nettoyerPages(pages);
  assert.equal(net[12], "ARTICLE 4. EMPRISE AU SOL");
  assert.ok(net.every((p) => !p.includes("Accusé") && !p.includes("Règlement écrit")));
});

test("plan : une ligne par page, avec ce qu'elle contient d'utile", () => {
  const plan = planDuReglement([
    "Table des matières\nTitre I",
    "Zone urbaine / Article 4. Emprise au sol\nL'emprise au sol maximale… l'emprise au sol",
    "Zone UAi7c5\nLa hauteur maximale",
    "Dispositions de la zone UA et hauteur",
    "",
  ], "UAi7c5").split("\n");
  assert.equal(plan.length, 5);
  assert.match(plan[0], /^1 \| Table des matières · Titre I \| sommaire$/);
  assert.match(plan[1], /emprise×3/);
  assert.match(plan[2], /zone UAi7c5, hauteur×1/);
  assert.match(plan[3], /mention UA, hauteur×1/);
  assert.equal(plan[4], "5 | (page sans texte)");
  assert.equal(racineZone("UAi7c5"), "UA");
  assert.equal(racineZone("1AUb"), "1AU");
});

test("plages de pages : lire, écrire, borner", () => {
  assert.deepEqual(lirePlages("12-14, 54 et 83 à 85", 100), [12, 13, 14, 54, 83, 84, 85]);
  assert.deepEqual(lirePlages("98-103", 100), [98, 99, 100]);
  assert.deepEqual(lirePlages("AUCUNE", 100), []);
  assert.deepEqual(lirePlages("1-400", 500), [], "une plage démesurée est écartée");
  assert.equal(ecrirePlages([54, 12, 13, 14, 55, 90]), "12-14, 54-55, 90");
  assert.deepEqual(pagesALire([83, 84, 900, 0], 55, 583), [55, 56, 57, 83, 84]);
  assert.equal(pagesALire(Array.from({ length: 200 }, (_, i) => i + 1), undefined, 583).length, 45);
});

const REPONSE = [
  { text: "## EMPRISE\nVALEUR: 70\nMENTION: AUCUNE\nREGLE: " },
  { text: "L'indice de densité « c » fixe un taux maximal d'emprise au sol de 70 %.", citations: [{ cited_text: "c 70% 20% 10%\r\n", start_page_number: 4 }] },
  { text: "\n\n## HAUTEUR\nVALEUR: 19\nMENTION: AUCUNE\nREGLE: " },
  { text: "L'indice de hauteur 5 donne une hauteur totale maximale de 19 m.", citations: [{ cited_text: "5 19 R+4+C R+5 ou R+4+C", start_page_number: 6 }] },
  { text: "\n\n## A_SAVOIR\n- " },
  { text: "20 % du terrain en pleine terre.", citations: [{ cited_text: "c 70% 20% 10%", start_page_number: 4 }] },
  { text: "\n- " },
  { text: "Le dernier niveau doit être un comble ou un attique.", citations: [{ cited_text: "le dernier niveau autorisé", start_page_number: 6 }] },
  { text: "\n\n## PAGES_MANQUANTES\nAUCUNE\n\n## RESERVE\nAUCUNE" },
];
const ENVOYEES = [54, 55, 56, 83, 84, 89];

test("réponse de l'IA : chaque chiffre avec son extrait, ramené à la page du règlement", () => {
  const r = lireReponse(REPONSE, ENVOYEES);
  assert.equal(r.emprise?.valeur, 70);
  assert.equal(r.emprise?.mention, undefined);
  assert.deepEqual(r.emprise?.extraits, [{ page: 83, texte: "c 70% 20% 10%" }]);
  assert.equal(r.emprise?.controle, "chiffre_cite");
  assert.equal(r.hauteur?.valeur, 19);
  assert.equal(r.hauteur?.extraits[0].page, 89);
  assert.equal(r.hauteur?.controle, "chiffre_cite");
  assert.match(r.hauteur!.regle, /indice de hauteur 5/);
  assert.equal(r.aSavoir.length, 2);
  assert.deepEqual(r.aSavoir[0].extraits, [{ page: 83, texte: "c 70% 20% 10%" }]);
  assert.equal(r.aSavoir[1].extraits[0].page, 89);
  assert.equal(r.manquantes, "");
  assert.equal(r.reserve, undefined);
});

test("réponse de l'IA : un chiffre sans extrait, ou un extrait sans le chiffre, se voit", () => {
  const nu = lireReponse([{ text: "## EMPRISE\nVALEUR: 60\nREGLE: Soixante pour cent.\n## HAUTEUR\nVALEUR: 12,5\nREGLE: " },
    { text: "Douze mètres cinquante au faîtage.", citations: [{ cited_text: "la hauteur est limitée à 9 m à l'égout", start_page_number: 1 }] }], [10]);
  assert.equal(nu.emprise?.controle, "sans_extrait");
  assert.equal(nu.hauteur?.valeur, 12.5);
  assert.equal(nu.hauteur?.controle, "cite_sans_chiffre");
});

test("réponse de l'IA : pas de chiffre, des pages manquantes, une réserve", () => {
  const r = lireReponse([{ text: "## EMPRISE\nVALEUR: AUCUNE\nMENTION: non réglementée\nREGLE: " },
    { text: "L'emprise au sol n'est pas réglementée.", citations: [{ cited_text: "a non réglementé 0 20%", start_page_number: 1 }] },
    { text: "\n## HAUTEUR\nVALEUR: AUCUNE\nMENTION: AUCUNE\nREGLE:\n## A_SAVOIR\n## PAGES_MANQUANTES\n88-91\n## RESERVE\nLe plan des hauteurs n'est pas joint." }], [83]);
  assert.equal(r.emprise?.valeur, undefined);
  assert.equal(r.emprise?.mention, "non réglementée");
  assert.equal(r.emprise?.controle, "chiffre_cite");
  assert.equal(r.hauteur, undefined);
  assert.equal(r.manquantes, "88-91");
  assert.equal(r.reserve, "Le plan des hauteurs n'est pas joint.");
  assert.deepEqual(r.aSavoir, []);
});

test("contrôle : 70 dans « 70% », pas dans « 170 » ni « 7,70 »", () => {
  assert.ok(chiffreDansExtraits(70, [{ page: 1, texte: "c 70% 20%" }]));
  assert.ok(chiffreDansExtraits(12.5, [{ page: 1, texte: "limitée à 12,5 m" }]));
  assert.ok(chiffreDansExtraits(19, [{ page: 1, texte: "19,00 mètres" }]));
  assert.ok(!chiffreDansExtraits(70, [{ page: 1, texte: "170 m²" }]));
  assert.ok(!chiffreDansExtraits(70, [{ page: 1, texte: "7,70 m" }]));
});

const LECTURE: LecturePlu = {
  fait_le: "2026-11-21T09:00:00.000Z", zone: lireZoneGpu(ZONE, DOCS)!, servitudes: [], a_savoir: [], pages_lues: ENVOYEES,
  emprise: lireReponse(REPONSE, ENVOYEES).emprise, hauteur: lireReponse(REPONSE, ENVOYEES).hauteur,
};

test("propositions : on remplit, on signale l'écart, on garde un type plus fin", () => {
  const vide = propositions(LECTURE, { zone: "", type: "", hauteur: "", emprise: "" });
  assert.deepEqual(vide.cases, { zone: "UAi7c5", type: "Urbaine", hauteur: "19", emprise: "70" });
  assert.deepEqual(vide.ecarts, []);
  const saisie = propositions(LECTURE, { zone: "UAi7c5", type: "Zone d'activités", hauteur: "19,0", emprise: "65" });
  assert.equal(saisie.cases.type, "Zone d'activités");
  assert.deepEqual(saisie.ecarts, [{ case: "emprise", fiche: "65", lu: "70" }]);
  const sans = propositions({ ...LECTURE, emprise: undefined }, { zone: "", type: "", hauteur: "", emprise: "50" });
  assert.equal(sans.cases.emprise, "50", "une case que la lecture ne sait pas remplir ne bouge pas");
});

test("lecture gardée sur la fiche : relue, ou rien", () => {
  assert.equal(lectureDe({}), null);
  assert.equal(lectureDe({ plu_ia: { zone: {} } }), null);
  assert.equal(lectureDe({ plu_ia: JSON.parse(JSON.stringify(LECTURE)) })?.emprise?.valeur, 70);
});
