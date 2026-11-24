import { choisirParObjet, jetonsCites, messageIdDuJeton, type Indice } from "./rattachement.ts";

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };

console.log("— Réponses aux relances (16/11) —");
const ind = (id: string, im: string, ville: string, o: Partial<Indice> = {}): Indice => ({
  ref: { propositionId: id, immeubleId: im }, objets: [`Immeuble à vendre à ${ville}`], villes: [ville], ...o,
});
/* Romain Desbordes : deux biens à Argenteuil, seul le second vient d'être relancé. */
const argenteuil = [
  ind("p1", "im_vieux", "Argenteuil", { relanceLe: "2026-09-29T15:00:00Z" }),
  ind("p2", "im_bureaux", "Argenteuil", { relanceLe: "2026-11-16T08:56:20Z" }),
  ind("p3", "im_sin", "Sin-le-Noble", { relanceLe: "2026-11-16T08:50:00Z" }),
];
const objet = "Re: Re : Relance Immeuble de Argenteuil (95) - 10 % - 2,4 M€";
const c1 = choisirParObjet(objet, argenteuil, "2026-11-16T09:19:29Z");
ok(c1?.ref.propositionId === "p2" && c1.par === "relance", "deux biens dans la ville : celui relancé juste avant la réponse");
ok(choisirParObjet(objet, argenteuil) === null, "sans la date de la réponse, on ne devine pas");
ok(choisirParObjet(objet, argenteuil, "2026-12-20T09:00:00Z") === null, "une réponse plus de 3 semaines après la relance ne tranche pas");
const deux = argenteuil.map((x) => (x.ref.propositionId === "p1" ? { ...x, relanceLe: "2026-11-16T08:56:20Z" } : x));
ok(choisirParObjet(objet, deux, "2026-11-16T09:19:29Z") === null, "deux biens relancés le même jour : à choisir");
ok(choisirParObjet("Récapitulatif — Relance Argenteuil (95100) : 45 / 45 e-mails envoyés", argenteuil, "2026-11-16T09:19:29Z") === null,
  "le récapitulatif d'une salve n'est pas une réponse");

const relObjet = [
  ind("p1", "im_vieux", "Argenteuil"),
  ind("p2", "im_bureaux", "Argenteuil", { objets: ["Immeuble à vendre à Argenteuil", "Relance Immeuble de Argenteuil (95) - 10 % - 2,4 M€"] }),
];
ok(choisirParObjet(objet, relObjet)?.ref.propositionId === "p2", "l'objet de la relance, gardé sur la proposition, suffit");

const paris = [
  ind("q1", "im_p18", "Paris 18e", { villes: ["Paris 18e", "Paris 18"] }),
  ind("q2", "im_p11", "Paris 11e", { villes: ["Paris 11e", "Paris 11"] }),
];
ok(choisirParObjet("Re: Relance Immeuble vide à Paris 18 - 1 M€", paris)?.ref.propositionId === "q1", "« Paris 18 » dans l'objet retrouve le 18e");

console.log("— Jeton —");
const id = messageIdDuJeton("ab12cd34ef56", "agence.france-immeuble.fr");
ok(jetonsCites({ de: "x@y.fr", inReplyTo: id })[0] === "ab12cd34ef56", "le jeton revient de l'In-Reply-To");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
