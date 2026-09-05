import { aRelancer, grouperParClient, joursDepuis, messageRelance, objetRelance, type PropositionRelance } from "./relances";

const T0 = Date.parse("2026-09-04T12:00:00Z");
const ilYA = (j: number) => new Date(T0 - j * 86400000).toISOString();
const base = (o: Partial<PropositionRelance> = {}): PropositionRelance => ({
  id: "p", immeubleId: "i", contactId: "c", nom: "M. X", email: "x@y.fr",
  statut: "Envoyée", depuis: ilYA(10), stop: false, ...o,
});

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };

console.log("— Qui mérite une relance —");
ok(aRelancer(base(), T0), "10 jours sans réponse → à relancer");
ok(!aRelancer(base({ depuis: ilYA(3) }), T0), "3 jours → trop tôt");
ok(aRelancer(base({ depuis: ilYA(7) }), T0), "7 jours pile → à relancer");
ok(!aRelancer(base({ stop: true }), T0), "relances coupées → jamais");
ok(!aRelancer(base({ statut: "Refusée (sans offre)" }), T0), "refusée → sujet clos");
ok(!aRelancer(base({ statut: "Vendu" }), T0), "vendu → on ne relance pas");
ok(!aRelancer(base({ statut: "Offre acceptée" }), T0), "offre acceptée → sujet clos");
ok(!aRelancer(base({ email: undefined }), T0), "sans e-mail → la relance n'irait nulle part");
ok(aRelancer(base({ depuis: undefined }), T0), "aucune date → jamais suivie, donc à relancer");
ok(joursDepuis(undefined, T0) === undefined, "aucune date → aucune ancienneté");

console.log("\n— Le regroupement par client —");
const libelles = new Map([
  ["i1", { libelle: "Nanterre (92000) — 55 Rue Volant", prix: "2 912 590 €" }],
  ["i2", { libelle: "Sarcelles (95200) — 56 Bd du Général de Gaulle", prix: "1 218 000 €" }],
  ["i3", { libelle: "Antibes (06600) — 18 Bd du Président Wilson" }],
]);
const props: PropositionRelance[] = [
  base({ id: "a", immeubleId: "i1", contactId: "c1", nom: "A. DUPONT", email: "a@x.fr", depuis: ilYA(12) }),
  base({ id: "b", immeubleId: "i2", contactId: "c1", nom: "A. DUPONT", email: "a@x.fr", depuis: ilYA(30) }),
  base({ id: "c", immeubleId: "i3", contactId: "c1", nom: "A. DUPONT", email: "a@x.fr", depuis: ilYA(8) }),
  base({ id: "d", immeubleId: "i1", contactId: "c2", nom: "B. MARTIN", email: "b@x.fr", depuis: ilYA(9) }),
  base({ id: "e", immeubleId: "i2", contactId: "c3", nom: "C. PETIT", email: "c@x.fr", depuis: ilYA(2) }),
  base({ id: "f", immeubleId: "i1", contactId: "c4", nom: "D. STOP", email: "d@x.fr", stop: true }),
];
const g = grouperParClient(props, libelles, T0);
ok(g.length === 2, `2 clients à relancer sur 4 (un trop récent, un coupé) — obtenu ${g.length}`);
ok(g[0].contactId === "c1", "le plus en retard passe en tête");
ok(g[0].immeubles.length === 3, "les 3 immeubles de A. DUPONT dans UN SEUL envoi");
ok(g[0].immeubles[0].immeubleId === "i2", "chez lui, l'attente la plus ancienne d'abord (30 j)");
ok(g[0].joursMax === 30, "l'urgence du client = son attente la plus ancienne");
ok(!g.some((c) => c.contactId === "c4"), "le client aux relances coupées est absent");

console.log("\n— Les doublons du miroir —");
/* Le miroir porte souvent DEUX propositions pour la même personne sur le même
   immeuble : l'envoi, puis le téléchargement du dossier. Les écrire deux fois
   dans le même e-mail serait exactement la faute que cet écran doit éviter. */
const dbl = grouperParClient(
  [
    base({ id: "x1", immeubleId: "i1", contactId: "c9", nom: "E. DOUBLE", email: "e@x.fr", depuis: ilYA(20) }),
    base({ id: "x2", immeubleId: "i1", contactId: "c9", nom: "E. DOUBLE", email: "e@x.fr", depuis: ilYA(14) }),
    base({ id: "x3", immeubleId: "i2", contactId: "c9", nom: "E. DOUBLE", email: "e@x.fr", depuis: ilYA(9) }),
  ],
  libelles, T0,
);
ok(dbl.length === 1 && dbl[0].immeubles.length === 2, `2 lignes, pas 3 — obtenu ${dbl[0]?.immeubles.length}`);
const l1 = dbl[0].immeubles.find((i) => i.immeubleId === "i1")!;
ok(l1.propositionId === "x1", "la ligne visible est la plus ancienne des deux");
ok(l1.autresIds.length === 1 && l1.autresIds[0] === "x2", "la jumelle suit dans le lot à marquer");
ok(dbl[0].joursMax === 20, "l'urgence reste celle de la plus ancienne");
ok(!messageRelance(dbl[0]).includes("55 Rue Volant\n  • Nanterre"), "l'immeuble n'apparaît qu'une fois dans le message");

console.log("\n— Le message —");
const m = messageRelance(g[0], { nom: "Marc-Antoine VOCI", tel: "06 12 34 56 78" });
ok(m.includes("3 dossiers"), "il annonce le nombre de dossiers");
ok(m.includes("55 Rue Volant") && m.includes("56 Bd du Général") && m.includes("18 Bd du Président"), "les trois immeubles sont listés");
ok(m.includes("2 912 590 €"), "le prix suit l'immeuble quand on l'a");
ok(!m.includes("undefined"), "aucun trou de fusion");
ok(objetRelance(g[0]) === "Votre avis sur 3 dossiers", "objet pluriel");
ok(objetRelance(g[1]).startsWith("Votre avis sur Nanterre"), "objet singulier : l'immeuble est nommé");
console.log("\n--- le message rendu ---\n" + m + "\n---");

console.log(ko === 0 ? `\nTout tient.` : `\n${ko} cas en échec.`);
process.exit(ko === 0 ? 0 : 1);
