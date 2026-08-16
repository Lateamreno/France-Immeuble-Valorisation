import {
  adresseSeule, sansEtiquette, estEnvoiDeMasse, jetonsCites, messageIdDuJeton,
  nouveauJeton, reconnaitre, type Recherches, type Enveloppe,
} from "../lib/bo/rattachement.ts";

const JETON = "ab12cd34ef56";
const r: Recherches = {
  parJeton: async (j) => (j === JETON
    ? { ref: { immeubleId: "im1", estimationId: "est1" }, contactId: "c1" } : null),
  parAdresse: async (a) => ({
    "p.marchand@orange.fr": { id: "c1", nom: "Philippe Marchand" },
    "s.ollivier@free.fr": { id: "c2", nom: "Sylvie Ollivier" },
    "vieux.client@wanadoo.fr": { id: "c3", nom: "Ancien client" },
  } as Record<string, { id: string; nom: string }>)[a] ?? null,
  affairesDe: async (id) => ({
    c1: [{ immeubleId: "im1" }],
    c2: [{ immeubleId: "im2" }, { immeubleId: "im3" }, { immeubleId: "im4" }],
    c3: [],
  } as Record<string, { immeubleId: string }[]>)[id] ?? [],
};

let ko = 0;
const test = async (nom: string, env: Enveloppe, attendu: string, extra?: (x: any) => boolean) => {
  const res = await reconnaitre(env, r);
  const ok = res.niveau === attendu && (!extra || extra(res));
  if (!ok) ko++;
  console.log(`${ok ? "✓" : "✗"}  ${nom.padEnd(52)} → ${res.niveau}${ok ? "" : ` (attendu ${attendu})`}`);
};

const mid = messageIdDuJeton(JETON, "france-immeuble.fr");
console.log("Message-ID posé par le BO :", mid, "\n");

// unitaires
const u = (n: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) ko++; console.log(`${ok ? "✓" : "✗"}  ${n.padEnd(52)} → ${JSON.stringify(a)}`); };
u("adresseSeule sur « Nom <a@b> »", adresseSeule("Philippe MARCHAND <P.Marchand@Orange.fr>"), "p.marchand@orange.fr");
u("sansEtiquette retire le +tag", sansEtiquette("ma.voci+devis@france-immeuble.fr"), "ma.voci@france-immeuble.fr");
u("jeton lu dans In-Reply-To", jetonsCites({ de: "x", inReplyTo: mid }), [JETON]);
u("jeton lu dans References", jetonsCites({ de: "x", references: ["<autre@ovh.net>", mid] }), [JETON]);
u("aucun jeton sur un fil étranger", jetonsCites({ de: "x", inReplyTo: "<zz@gmail.com>" }), []);
u("List-Unsubscribe = masse", estEnvoiDeMasse({ "list-unsubscribe": "<https://x>" }), true);
u("Precedence: bulk = masse", estEnvoiDeMasse({ precedence: "bulk" }), true);
u("Return-Path vide = rebond", estEnvoiDeMasse({ "return-path": "<>" }), true);
u("auto-submitted: no reste humain", estEnvoiDeMasse({ "auto-submitted": "no" }), false);
u("mail normal n'est pas de la masse", estEnvoiDeMasse({ "return-path": "<p@orange.fr>" }), false);
console.log();

await test("réponse du vendeur à son estimation", { de: "Philippe MARCHAND <p.marchand@orange.fr>", inReplyTo: mid }, "fil", (x) => x.certain && x.ref.estimationId === "est1");
await test("réponse citée seulement dans References", { de: "p.marchand@orange.fr", references: ["<x@y>", mid] }, "fil");
await test("réponse auto sur NOTRE envoi (le fil gagne)", { de: "p.marchand@orange.fr", inReplyTo: mid, entetes: { "auto-submitted": "auto-replied" } }, "fil");
await test("newsletter SeLoger", { de: "news@seloger.com", entetes: { "list-unsubscribe": "<https://seloger>" } }, "masse");
await test("contact connu, une seule affaire", { de: "p.marchand@orange.fr" }, "contact", (x) => x.certain && x.ref.immeubleId === "im1");
await test("contact connu, trois affaires", { de: "Sylvie <S.Ollivier@free.fr>" }, "a_choisir", (x) => !x.certain && x.candidats.length === 3);
await test("contact connu, aucune affaire en cours", { de: "vieux.client@wanadoo.fr" }, "inconnu", (x) => x.contactId === "c3");
await test("nouveau vendeur, écrit à la main", { de: "nouveau@gmail.com", objet: "Demande d'estimation" }, "inconnu", (x) => !x.certain);
await test("comptable inconnu (va en À classer, pas en Affaires)", { de: "cabinet@ledoux-expertise.fr" }, "inconnu");

console.log(ko === 0 ? "\nTous les cas passent." : `\n${ko} cas en échec.`);
process.exit(ko ? 1 : 0);
