import {
  classer, htmlRappel, objetRappel, phraseCalme, phraseNouveau, phraseRapport, phraseTotal, rappelVide, texteRappel,
  bienDepuisRapport, type BienRappel,
} from "./rapport-rappel.ts";
import { construireRapport } from "./rapport-commercialisation.ts";

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };

const LUNDI = "2026-11-23T07:00:00.000Z";
const bien = (id: string, plus: Partial<BienRappel> = {}): BienRappel => ({
  id, libelle: `${id} rue des Lilas, 75018 Paris`,
  chiffres: { contactes: 0, repondants: 0, visites: 0, offres: 0 }, aVerifier: [], ...plus,
});

console.log("— Qui doit un rapport —");
const jamais = bien("1", { debut: "2026-11-03T15:00:00.000Z", derniereAction: "2026-11-16T08:00:00.000Z", chiffres: { contactes: 187, repondants: 14, visites: 3, offres: 1, offreHaute: 500_000 }, aVerifier: ["2 réponses ne sont pas encore traitées"] });
const ancien = bien("2", { dernierRapport: "2026-11-12T10:00:00.000Z", derniereAction: "2026-11-18T09:00:00.000Z", chiffres: { contactes: 60, repondants: 5, visites: 1, offres: 0 }, nouveau: { contactes: 12, reponses: 3, visites: 1, offres: 0 } });
const calme = bien("3", { dernierRapport: "2026-11-02T10:00:00.000Z", derniereAction: "2026-10-28T09:00:00.000Z", chiffres: { contactes: 40, repondants: 2, visites: 0, offres: 0 }, nouveau: { contactes: 0, reponses: 0, visites: 0, offres: 0 } });
const recent = bien("4", { dernierRapport: "2026-11-19T10:00:00.000Z", chiffres: { contactes: 10, repondants: 1, visites: 0, offres: 0 }, nouveau: { contactes: 5, reponses: 0, visites: 0, offres: 0 } });
const muet = bien("5");
const c = classer([recent, calme, ancien, muet, jamais], LUNDI);

ok(c.aEnvoyer.map((b) => b.id).join() === "1,2", "à envoyer : jamais de rapport d'abord, puis le plus ancien");
ok(c.rienDeNouveau.map((b) => b.id).join() === "5,3", "rien de nouveau : le mandat sans aucun envoi, puis le bien sans action depuis le dernier rapport");
ok(c.aJour.map((b) => b.id).join() === "4", "un rapport de moins de sept jours : le bien est à jour, même s'il y a du nouveau");
ok(classer([bien("6", { dernierRapport: "2026-11-16T07:00:00.000Z", nouveau: { contactes: 1, reponses: 0, visites: 0, offres: 0 } })], LUNDI).aEnvoyer.length === 1, "sept jours pile : le rapport est dû");
ok(!rappelVide(c) && rappelVide(classer([recent], LUNDI)) && rappelVide(classer([], LUNDI)), "tout est à jour, ou aucun bien : aucun e-mail");
ok(objetRappel(c) === "4 rapports aux propriétaires à envoyer cette semaine" && objetRappel(classer([jamais], LUNDI)) === "1 rapport au propriétaire à envoyer cette semaine", "l'objet compte les rapports dus");

console.log("— Les phrases —");
ok(phraseRapport(jamais, LUNDI) === "Aucun rapport envoyé depuis le début de la commercialisation, le 3 novembre.", "jamais de rapport");
ok(phraseRapport(ancien, LUNDI) === "Dernier rapport le 12 novembre, il y a 10 jours.", "le dernier rapport et son âge");
ok(phraseNouveau(ancien) === "Depuis : 12 acquéreurs contactés, 3 réponses, 1 visite." && phraseNouveau(jamais) === undefined, "ce qui est nouveau, sans les zéros");
ok(phraseTotal(jamais) === "Depuis le début : 187 contactés, 14 répondants, 3 visites, 1 offre (à 500 000 €)." && phraseTotal(muet) === undefined, "le total depuis le début");
ok(phraseCalme(calme, LUNDI) === "Rien de nouveau depuis le rapport du 2 novembre. Dernière action le 28 octobre, il y a 25 jours.", "rien de nouveau : la dernière action et son âge");
ok(phraseCalme(muet, LUNDI) === "Mandat en cours, aucun envoi du dossier à ce jour.", "un mandat sans aucun envoi");

console.log("— L'e-mail —");
const ctx = { prenom: "Romain", base: "https://bo.exemple", maintenant: LUNDI };
const t = texteRappel(c, ctx);
ok(t.startsWith("Bonjour Romain,") && t.includes("RAPPORT À ENVOYER (2)") && t.includes("RIEN DE NOUVEAU À DIRE AU PROPRIÉTAIRE (2)"), "les deux rubriques");
ok(t.includes("https://bo.exemple/bien/1?sect=vente&ecran=vente"), "le lien ouvre le Suivi de la vente du bien");
ok(t.includes("À vérifier avant d'envoyer : 2 réponses ne sont pas encore traitées."), "les points à vérifier");
ok(t.includes("À jour (rapport de moins de 7 jours) : 4 rue des Lilas, 75018 Paris."), "les biens à jour, en une ligne");
const h = htmlRappel(c, ctx);
ok(!/<img/i.test(h) && h.includes("max-width:600px"), "aucune image, 600 px au plus");
ok(h.includes("1 rue des Lilas, 75018 Paris") && h.includes("sect=vente&amp;ecran=vente"), "le bien et son lien, échappé");
ok(htmlRappel(classer([bien("7", { libelle: "<b>x</b>", sansAgent: true })], LUNDI), ctx).includes("&lt;b&gt;x&lt;/b&gt;"), "un libellé est échappé");
ok(texteRappel(classer([bien("7", { sansAgent: true })], LUNDI), ctx).includes("(sans agent actif dans le BO)"), "un bien sans agent actif est signalé");

console.log("— Depuis un rapport calculé —");
const r = construireRapport({
  maintenant: LUNDI, depuis: "2026-11-12T10:00:00.000Z", prixMandat: 1_030_000,
  salves: [{ id: "s1", date: "2026-11-03T15:06:00.000Z", mails: 2, mobiles: 0 }, { id: "s2", date: "2026-11-17T09:00:00.000Z", mails: 1, mobiles: 0 }],
  propositions: [
    { id: "p1", qui: { nom: "Alpha", initiales: "A." }, creeLe: "2026-11-03T15:06:00.000Z", salveId: "s1", statut: "Envoyée" },
    { id: "p2", qui: { nom: "Bravo", initiales: "B." }, creeLe: "2026-11-17T09:00:00.000Z", salveId: "s2", statut: "Envoyée" },
  ],
  reponses: [{ propositionId: "p2", canal: "email", recuLe: "2026-11-18T10:00:00.000Z", traite: false }],
  visites: [], offres: [],
});
const b = bienDepuisRapport("9", "9 rue des Lilas", r, "2026-11-12T10:00:00.000Z");
ok(b.prixMandat === 1_030_000 && b.derniereAction?.startsWith("2026-11-17") === true, "le prix du mandat et la dernière action");
ok(b.nouveau?.contactes === 1 && b.nouveau.reponses === 1, "ce qui est nouveau depuis le dernier rapport");
ok(b.aVerifier.length === 1 && /réponse/.test(b.aVerifier[0]) && !/Bravo/.test(b.aVerifier.join()), "les points à vérifier, sans nom");
ok(bienDepuisRapport("9", "x", r).nouveau === undefined, "sans rapport précédent, pas de « depuis »");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
