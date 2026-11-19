import { choisirDossiers, langueDe, rolesADepartager, type Candidat } from "./dossiers.ts";

let ko = 0;
const ok = (cond: boolean, quoi: string) => { if (!cond) ko++; console.log(`${cond ? "✓" : "✗"} ${quoi}`); };

console.log("— Quel dossier tient quel rôle —");

/* La boîte de MAV : deux dossiers d'envoi, aucun attribut spécial. */
const mav: Candidat[] = [
  { role: "brouillons", chemin: "Brouillons", special: false },
  { role: "corbeille", chemin: "Deleted Items", special: false },
  { role: "brouillons", chemin: "Drafts", special: false },
  { role: "envoyes", chemin: "Éléments envoyés", special: false },
  { role: "indesirables", chemin: "Junk Email", special: false },
  { role: "envoyes", chemin: "Sent Items", special: false },
];
ok(rolesADepartager(mav).sort().join() === "brouillons,envoyes", "deux dossiers pour un rôle, sans attribut : il faut compter");
/* Le doublon de MAV contient PLUS de messages que le vrai dossier : des années
   d'un ancien logiciel. Le nombre seul choisissait le mauvais (19/11). */
const comptes = mav.map((c) => ({
  ...c,
  messages: { "Sent Items": 900, "Éléments envoyés": 8400, Drafts: 79, Brouillons: 140 }[c.chemin],
}));
const choix = choisirDossiers(comptes);
ok(choix.envoyes === "Sent Items", "corbeille et indésirables en anglais : le vrai dossier d'envoi est « Sent Items », même moins rempli");
ok(choix.brouillons === "Drafts", "de même pour les brouillons");
ok(choix.corbeille === "Deleted Items" && choix.indesirables === "Junk Email", "un seul candidat : c'est lui");
ok(choisirDossiers(mav).envoyes === "Sent Items", "sans même compter, la langue de la boîte suffit");

/* Une boîte en français qui porte un « Sent » laissé par un autre logiciel. */
const francaise: Candidat[] = [
  { role: "corbeille", chemin: "Éléments supprimés", special: false },
  { role: "indesirables", chemin: "Courrier indésirable", special: false },
  { role: "envoyes", chemin: "Sent", special: false, messages: 4000 },
  { role: "envoyes", chemin: "Éléments envoyés", special: false, messages: 12 },
];
ok(choisirDossiers(francaise).envoyes === "Éléments envoyés", "boîte en français : le vrai dossier d'envoi est le français");

/* Aucune langue ne se dégage : le nombre de messages départage. */
const muette: Candidat[] = [
  { role: "envoyes", chemin: "Sent Items", special: false, messages: 8400 },
  { role: "envoyes", chemin: "Éléments envoyés", special: false, messages: 310 },
];
ok(choisirDossiers(muette).envoyes === "Sent Items", "sans langue reconnue, le plus rempli");
ok(langueDe("Sent Items") === "en" && langueDe("Éléments envoyés") === "fr" && langueDe("Clients") === null, "la langue d'un nom de dossier");

/* Un serveur qui désigne lui-même le dossier : on le croit, quel que soit le nombre. */
const designe: Candidat[] = [
  { role: "envoyes", chemin: "Envoyés perso", special: false, messages: 9000 },
  { role: "envoyes", chemin: "Sent", special: true, messages: 3 },
];
ok(rolesADepartager(designe).length === 0, "attribut spécial présent : rien à compter");
ok(choisirDossiers(designe).envoyes === "Sent", "l'attribut spécial du serveur l'emporte");

/* La boîte de Romain : tout en français, un seul dossier par rôle. */
const romain: Candidat[] = [
  { role: "envoyes", chemin: "Éléments envoyés", special: false },
  { role: "corbeille", chemin: "Éléments supprimés", special: false },
];
ok(rolesADepartager(romain).length === 0 && choisirDossiers(romain).envoyes === "Éléments envoyés", "un seul dossier d'envoi en français : il reste retenu");

const egal: Candidat[] = [
  { role: "envoyes", chemin: "A", special: false, messages: 5 },
  { role: "envoyes", chemin: "B", special: false, messages: 5 },
];
ok(choisirDossiers(egal).envoyes === "A", "à égalité, le premier de la liste");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
