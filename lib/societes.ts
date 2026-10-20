// La société comme ENTITÉ (retour #489, décision MAV du 20/10/26).
//
// « Un bien peut appartenir à une société, plusieurs propriétaires
// indivisaires. Il faut que les sociétés soient associées à un ou plusieurs
// propriétaires avec chacun leur fonction (actionnaire, gérant, président…).
// Qu'on puisse mettre plusieurs sociétés par propriétaire. Les immeubles
// seront toujours rattachés à une ou plusieurs personnes physiques. La société
// n'est là que comme entité de facturation et comme signataire du mandat. »
//
// D'où trois règles, portées par ce module et par `lib/bo/societes-actions.ts` :
//   1. Le bien est rattaché à des PERSONNES (`PROPRIETAIRE`, le principal que
//      Bubble connaît, et `PROPRIETAIREs`, la liste complète) ; il peut en plus
//      dire qu'il est DÉTENU par une société (`SOCIETE_PROPRIETAIRE`), choisie
//      parmi celles de ses propriétaires.
//   2. Une société vit dans `bo_societe`, table du BO que Bubble ne connaît
//      pas, avec ses associés : des contacts, chacun avec sa fonction.
//   3. Au mandat, la société signe (personne morale) et l'un de ses associés
//      la représente, avec la fonction que la société lui connaît.
//
// Ce fichier ne contient que des types et des fonctions pures : il est importé
// des deux côtés (écrans et actions serveur).

export type Associe = {
  contactId: string;
  /** Gérant, Président, Associé, Actionnaire… */
  fonction?: string;
};

export type SocieteEntite = {
  id: string;
  nom: string;
  /** Forme juridique en clair (SCI, SAS…), quand l'annuaire l'a donnée. */
  forme?: string;
  siren?: string;
  rcs?: string;
  capital?: number;
  siege?: string;
  kbis?: string;
  kbisLe?: string;
  /** La holding qui la représente, le cas échéant (retour #292). */
  representante?: { nom?: string; siren?: string; rcs?: string; capital?: number; siege?: string };
  associes: Associe[];
  creeLe?: string;
};

/** Une société avec ses associés nommés — ce que les écrans affichent. */
export type SocieteNommee = SocieteEntite & {
  associesNommes: { contactId: string; nom: string; fonction?: string }[];
};

/** Les fonctions qu'un associé peut tenir dans une société. Liste ouverte :
 *  le champ accepte aussi une saisie libre (« Gérant dûment habilité »). */
export const FONCTIONS_ASSOCIE = [
  "Gérant",
  "Gérante",
  "Cogérant",
  "Président",
  "Présidente",
  "Directeur Général",
  "Associé",
  "Associée",
  "Actionnaire",
  "Usufruitier",
  "Nu-propriétaire",
  "Mandataire",
];

/** Les fonctions qui font d'un associé le SIGNATAIRE naturel d'un mandat. */
const SIGNATAIRES = ["gérant", "gérante", "cogérant", "président", "présidente", "directeur général", "mandataire"];

/** L'associé qui représente la société dans un acte : le premier dont la
 *  fonction engage la société, à défaut le premier de la liste. */
export function representantDe(s: SocieteEntite): Associe | undefined {
  return s.associes.find((a) => SIGNATAIRES.includes((a.fonction ?? "").trim().toLowerCase())) ?? s.associes[0];
}

/** Le SIREN identifie une société ; à défaut son nom réduit à ses lettres et
 *  ses chiffres, « SCI DU PARC » et « S.C.I. du Parc » étant la même. */
export function cleSociete(s: { siren?: string; nom?: string }): string {
  return (s.siren ?? "").replace(/\D/g, "") || (s.nom ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** « SCI DU PARC · SIREN 123 456 789 · RCS Paris » */
export function sousTitreSociete(s: SocieteEntite): string {
  return [s.forme, s.siren && `SIREN ${s.siren}`, s.rcs && `RCS ${s.rcs}`].filter(Boolean).join(" · ");
}

/** Lit un document `bo_societe` tel qu'il est en base. */
export function lireSocieteDoc(d: Record<string, unknown>): SocieteEntite {
  const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const rep = d.representante && typeof d.representante === "object" ? (d.representante as Record<string, unknown>) : undefined;
  const associes = Array.isArray(d.associes)
    ? (d.associes as Record<string, unknown>[])
        .map((a) => ({ contactId: String(a.contactId ?? ""), fonction: S(a.fonction) }))
        .filter((a) => a.contactId)
    : [];
  return {
    id: String(d._id ?? d.id ?? ""),
    nom: S(d.nom) ?? "Société sans nom",
    forme: S(d.forme),
    siren: S(d.siren),
    rcs: S(d.rcs),
    capital: N(d.capital),
    siege: S(d.siege),
    kbis: S(d.kbis),
    kbisLe: S(d.kbisLe),
    representante: rep ? { nom: S(rep.nom), siren: S(rep.siren), rcs: S(rep.rcs), capital: N(rep.capital), siege: S(rep.siege) } : undefined,
    associes,
    creeLe: S(d.app_created) ?? S(d["Created Date"]),
  };
}
