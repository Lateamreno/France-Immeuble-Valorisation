import { construireRapport, etiquette, initialesDe, offreDansTexte, type EntreesRapport, type Personne } from "./rapport-commercialisation.ts";
import { blocPleinBail } from "./rapport-contenu.ts";

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };

console.log("— Une offre écrite dans une note —");
ok(offreDansTexte("Offre à 500 k€ HAI") === 500_000, "« Offre à 500 k€ HAI »");
ok(offreDansTexte("Il fait une offre de 1,2 M€ net vendeur") === 1_200_000, "« offre de 1,2 M€ »");
ok(offreDansTexte("offre 480 000 € sous conditions") === 480_000, "« offre 480 000 € »");
ok(offreDansTexte("Il ne fera pas d'offre, trop de travaux") === undefined, "« pas d'offre » sans montant : rien");
ok(offreDansTexte("Même à 5 k€/m² il n'irait pas") === undefined, "un prix au m² sans le mot offre : rien");
ok(offreDansTexte("Offre possible si le loyer passe à 900 €") === undefined, "un montant de loyer n'est pas une offre");

console.log("— Ce que le propriétaire lit d'un acquéreur —");
ok(initialesDe("Mathilde", "DELARUE") === "M. D." && initialesDe("Élie", "kabuya") === "E. K.", "prénom et nom en initiales, sans accent (#626)");
ok(initialesDe(undefined, "DELARUE") === "D." && initialesDe("", "", "SBGROUP") === "S." && initialesDe("", "", "Jean Dupont") === "J. D." && initialesDe() === "X.", "sans prénom, sans fiche, sans rien");
ok(etiquette({ nom: "Mathilde DELARUE", initiales: "M. D.", profil: "marchand de biens" }) === "M. D. — marchand de biens", "initiales et profil, jamais le nom");

console.log("— Le rapport —");
const qui = (nom: string, note?: string, profil = "investisseur"): Personne =>
  ({ contactId: nom, nom, initiales: `${nom[0]}.`, profil, note });
const e: EntreesRapport = {
  maintenant: "2026-11-19T09:00:00.000Z",
  prixMandat: 1_030_000,
  salves: [
    { id: "s1", date: "2026-11-03T15:06:00.000Z", mails: 2, mobiles: 2 },
    { id: "s2", date: "2026-11-09T18:44:00.000Z", mails: 2, mobiles: 1 },
  ],
  propositions: [
    { id: "p1", qui: qui("Alpha", "B", "marchand de biens"), creeLe: "2026-11-03T15:06:00.000Z", salveId: "s1", statut: "Refusée (sans offre)", motifRefus: "Trop de travaux", relanceLe: "2026-11-04T08:00:00.000Z" },
    { id: "p2", qui: qui("Bravo", "B"), creeLe: "2026-11-03T15:06:00.000Z", salveId: "s1", statut: "Refusée (sans offre)", motifRefus: "Pas intéressé (bouton RCS)" },
    { id: "p3", qui: qui("Charlie", "C"), creeLe: "2026-11-09T18:44:00.000Z", salveId: "s2", statut: "Envoyée", relanceLe: "2026-11-16T08:00:00.000Z" },
    { id: "p4", qui: qui("Delta", "C"), creeLe: "2026-11-09T18:44:00.000Z", salveId: "s2", statut: "Intéressé" },
    { id: "p5", qui: qui("Echo"), creeLe: "2026-11-16T16:20:00.000Z", statut: "Envoyée", dossierLe: "2026-11-17T10:00:00.000Z" },
  ],
  reponses: [
    { propositionId: "p1", canal: "email", recuLe: "2026-11-05T10:00:00.000Z", traite: true },
    { propositionId: "p3", canal: "email", recuLe: "2026-11-17T10:00:00.000Z", traite: false },
    { propositionId: "p5", canal: "rcs_dossier", recuLe: "2026-11-17T10:00:00.000Z", traite: false },
  ],
  visites: [
    { id: "v1", date: "2026-11-13T12:45:00.000Z", statut: "Effectuée", qui: qui("Mike", "B"), retourInterne: "Offre à 500 k€ HAI", source: "Plein Bail" },
    { id: "v2", date: "2026-11-17T10:30:00.000Z", statut: "Effectuée", qui: qui("Romeo"), retourVendeur: "Étudie une démolition." },
    { id: "v3", date: "2026-11-18T10:30:00.000Z", statut: "Programmée", qui: qui("Sierra") },
    { id: "v4", date: "2026-11-25T10:30:00.000Z", statut: "Programmée", qui: qui("Tango") },
  ],
  offres: [],
};
const r = construireRapport(e);

ok(r.actions.map((a) => a.libelle).join() === "Premier envoi du dossier,Relance,Nouvel envoi du dossier,Relance,Envoi individuel", "les actions dans l'ordre : envois, relances, envoi à la main");
ok(r.actions[0].mode === "E-mail (2) + message mobile (2)" && r.actions[0].nombre === 2, "le mode de contact et le nombre d'acquéreurs d'un envoi");
ok(r.chiffres.contactes === 5 && r.chiffres.repondants === 5 && r.chiffres.tauxReponse === 100, "contactés et répondants, par personne");
ok(construireRapport({ ...e, reponses: [] }).chiffres.repondants === 4, "une proposition « Envoyée » sans réponse ni retour n'a pas répondu");
ok(r.chiffres.refus === 2 && r.chiffres.refusMotives === 1 && r.refusSansExplication === 1, "le bouton « Pas intéressé » est un refus sans explication");
ok(r.chiffres.dossiers === 1 && r.chiffres.interesses === 1, "dossiers téléchargés et intéressés");
ok(r.retours.length === 1 && r.retours[0].qui === "A. — marchand de biens" && r.retours[0].note === "B", "un retour motivé : initiales, profil et note");
ok(r.retours[0].nom === "Alpha" && r.visites[0].nom === "Mike", "le nom complet reste à part, pour l'écran de l'agent");
ok(r.parNote.find((l) => l.note === "B")?.repondants === 2, "les répondants par note");
ok(r.visites.length === 2 && r.visites[0].qui === "M." && r.visites[0].aRelire && !r.visites[1].aRelire, "les visites effectuées ; la note de l'agent est à relire, pas le texte écrit pour le vendeur");
ok(r.visitesParSource[0].source === "Plein Bail" || r.visitesParSource.some((s) => s.source === "Plein Bail" && s.nombre === 1), "les visites par source");
ok(r.barometre?.prixMandat === 1_030_000 && !r.barometre.offreHaute, "sans offre saisie, le baromètre n'a que le prix du mandat");

console.log("— Les contrôles —");
const titres = r.controles.map((c) => c.titre).join(" | ");
ok(/offre est écrite dans un retour de visite/.test(titres), "une offre écrite dans un retour de visite et non saisie est signalée");
ok(r.controles.find((c) => c.geste === "offre")?.detail?.includes("Mike") === true, "le contrôle nomme la personne : c'est l'agent qui lit");
ok(/2 réponses ne sont pas encore traitées/.test(titres), "les réponses non traitées");
ok(/1 acquéreur est « Intéressé » sans visite ni suite notée/.test(titres), "un intéressé sans suite");
ok(/1 visite est passée sans être notée/.test(titres) && !/Tango/.test(r.controles.map((c) => c.detail).join()), "une visite passée encore « programmée » ; une visite à venir ne compte pas");
ok(r.controles[0].niveau === "alerte" && r.controles[r.controles.length - 1].niveau === "ok", "les alertes d'abord, ce qui est en ordre ensuite");

const avecOffre = construireRapport({
  ...e, depuis: "2026-11-10T00:00:00.000Z",
  offres: [{ id: "o1", date: "2026-11-13T15:00:00.000Z", statut: "Refusée", prixHai: 500_000, qui: qui("Mike", "B") }],
});
ok(!avecOffre.controles.some((c) => c.geste === "offre"), "l'offre saisie, l'alerte disparaît");
ok(avecOffre.barometre?.offreHaute?.pct === 49 && avecOffre.barometre.offreHaute.ecart === 530_000, "le baromètre : 49 % du prix, 530 000 € d'écart");
ok(avecOffre.nouveau?.visites === 2 && avecOffre.nouveau.offres === 1 && avecOffre.nouveau.contactes === 1, "ce qui est nouveau depuis le dernier rapport");

console.log("— Les retombées Plein Bail —");
const pb = blocPleinBail({
  periode: { depuis: "2026-11-01T00:00:00.000Z", jusqu_a: "2026-11-19T00:00:00.000Z" },
  vues: 342, visiteurs: 211, impressions: 1890, position_moyenne: 4.3,
  contacts: 7, telephones: 4, favoris: 11, alertes: 26,
  sources: { recherche: 240, alerte: 41, direct: 38, moteur: 17, site: 4, externe: 2 },
});
ok(pb.source === "Plein Bail — du 1ᵉʳ au 19 novembre 2026", "la période que Plein Bail a comptée");
ok(pb.lignes.find((l) => l.libelle === "apparitions dans les résultats")?.valeur === "1 890", "les apparitions, avec le séparateur de milliers");
ok(pb.lignes.find((l) => l.libelle === "position moyenne dans les résultats")?.valeur === "4,3", "la position moyenne, à la française");
ok(pb.lignes.length === 8 && pb.lignes.some((l) => l.libelle === "visiteurs distincts" && l.valeur === "211"), "les huit compteurs");
ok(pb.note === "Origine des visiteurs : recherche sur Plein Bail 240, alerte e-mail 41, lien direct 38, moteur de recherche 17, autres pages du site 4, autre site 2.", "l'origine des visiteurs, de la plus fréquente à la plus rare");
const ancien = blocPleinBail({ contacts: 1, telephones: 0 });
ok(ancien.source === "Plein Bail" && ancien.lignes.length === 2 && ancien.lignes[0].libelle === "message reçu" && !ancien.note, "l'ancien format : seuls les compteurs envoyés s'affichent");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
