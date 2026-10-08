/* Ciblage d'une salve (retour #108).
 *
 * On choisit d'abord QUI : propriétaires, acquéreurs, partenaires. Puis on
 * resserre avec les mêmes filtres que les recherches — destination, prix,
 * rendement, surface, lieu, note, statut de l'immeuble.
 *
 * Ce fichier ne contient que la définition de la cible et le prédicat. La
 * lecture des données est dans lib/bubble/server.ts, l'envoi dans
 * lib/bo/mails-actions.ts : le tri d'une audience doit rester testable sans
 * base et sans réseau.
 */

export type Cible = "proprietaires" | "acquereurs" | "partenaires";

export const CIBLES: { cle: Cible; label: string; aide: string }[] = [
  { cle: "proprietaires", label: "Propriétaires",
    aide: "Les contacts qui portent au moins un immeuble." },
  { cle: "acquereurs", label: "Acquéreurs",
    aide: "Les contacts marqués acheteur ou porteurs d'une recherche." },
  { cle: "partenaires", label: "Partenaires",
    aide: "Agents immobiliers, notaires, banquiers, apporteurs, avocats…" },
];

/** Profils qui font d'un contact un partenaire et non un client. */
export const PROFILS_PARTENAIRE = new Set([
  "Agent immobilier", "Notaire", "Banquier", "Apporteur", "Partenaire",
  "Avocat", "Architecte", "Gestionnaire", "Lotisseur", "Technicien",
]);

/**
 * Ce qui écarte un contact, quoi qu'il ait par ailleurs (retour #121).
 *
 * L'inclusion et l'exclusion ne sont pas symétriques : inclure « 93 » veut
 * dire « au moins un bien dans le 93 », exclure « D » veut dire « pas de D du
 * tout ». L'exclusion l'emporte toujours — c'est ce qu'on attend d'elle.
 */
export type Exclusions = {
  profils: string[];
  notes: string[];
  lieux: string[];
  destinations: string[];
  statuts: string[];
  /** Contacts retirés un par un depuis la liste des destinataires. */
  contacts: string[];
};

export const EXCLUSIONS_VIDES: Exclusions = {
  profils: [], notes: [], lieux: [], destinations: [], statuts: [], contacts: [],
};

export type Filtres = {
  /** Profils du contact (`Types`) — au moins un doit correspondre. */
  profils: string[];
  /** Note acquéreur A/B/C/D — au moins une. */
  notes: string[];
  /** Villes, départements ou régions, en OU (comme l'écran Recherches). */
  lieux: string[];
  /** Destination principale de l'immeuble / recherchée. */
  destinations: string[];
  /** Statuts d'immeuble retenus (libellés sans le préfixe numérique). */
  statuts: string[];
  prixMin?: number;
  prixMax?: number;
  rentaMin?: number;
  rentaMax?: number;
  surfaceMin?: number;
  surfaceMax?: number;
  /** Écarter ceux qui ont refusé les e-mails. Coché par défaut. */
  respecterDesabo: boolean;
  /** Écarter ceux dont on ignore la civilité (évite « Bonjour » sec). */
  exclureSansCivilite: boolean;
  /** Ce qu'on retire de la sélection, quels que soient les filtres ci-dessus. */
  exclure: Exclusions;
};

export const FILTRES_VIDES: Filtres = {
  profils: [], notes: [], lieux: [], destinations: [], statuts: [],
  respecterDesabo: true, exclureSansCivilite: false,
  exclure: EXCLUSIONS_VIDES,
};

/** Ce qu'on sait d'un destinataire au moment de trier l'audience. */
export type Candidat = {
  contactId: string;
  nom: string;
  email: string;
  prenom?: string;
  civilite?: string;
  societe?: string;
  telephone?: string;
  note?: string;
  profils: string[];
  proprietaire: boolean;
  acquereur: boolean;
  /** Refus explicite d'être contacté par e-mail. */
  desabonne: boolean;
  /** Agrégats de ses immeubles / recherches, pour les filtres chiffrés. */
  villes: string[];
  departements: string[];
  destinations: string[];
  statuts: string[];
  prix: number[];
  rentas: number[];
  surfaces: number[];
};

const dansFourchette = (valeurs: number[], min?: number, max?: number) => {
  if (min === undefined && max === undefined) return true;
  /* Un contact passe si AU MOINS un de ses biens (ou de ses recherches) tombe
     dans la fourchette : quelqu'un qui possède un immeuble à 500 k€ et un
     autre à 3 M€ est bien concerné par « au-dessus de 2 M€ ». */
  return valeurs.some((v) => (min === undefined || v >= min) && (max === undefined || v <= max));
};

const croise = (a: string[], b: string[]) => b.length === 0 || a.some((x) => b.includes(x));
/** Version stricte, pour les exclusions : une liste vide n'exclut personne. */
const touche = (a: string[], b: string[]) => b.length > 0 && a.some((x) => b.includes(x));

export function estDeLaCible(c: Candidat, cible: Cible) {
  const partenaire = c.profils.some((p) => PROFILS_PARTENAIRE.has(p));
  if (cible === "partenaires") return partenaire;
  /* Un confrère n'est ni un propriétaire ni un acquéreur au sens du fichier :
     on ne lui écrit pas la même chose, il ne doit pas tomber dans une salve
     client par accident. */
  if (partenaire) return false;
  return cible === "proprietaires" ? c.proprietaire : c.acquereur;
}

/**
 * Un contact est-il dans la salve ?
 *
 * `cibles` est une liste depuis le retour #121 : on écrit souvent aux
 * propriétaires ET aux acquéreurs d'un coup. Il suffit d'appartenir à l'une
 * d'elles ; il suffit d'être dans une exclusion pour en sortir.
 */
export function retenu(c: Candidat, cibles: Cible[], f: Filtres): boolean {
  if (!c.email) return false;
  if (f.respecterDesabo && c.desabonne) return false;
  if (!cibles.length || !cibles.some((k) => estDeLaCible(c, k))) return false;

  /* Les exclusions passent en premier : elles priment sur tout le reste, y
     compris sur un filtre d'inclusion qui aurait ramené le contact. */
  const x = f.exclure ?? EXCLUSIONS_VIDES;
  if (x.contacts.includes(c.contactId)) return false;
  if (touche(c.profils, x.profils)) return false;
  if (c.note && x.notes.includes(c.note)) return false;
  if (touche(c.destinations, x.destinations)) return false;
  if (touche(c.statuts, x.statuts)) return false;
  if (touche([...c.villes, ...c.departements], x.lieux)) return false;

  if (f.profils.length && !croise(c.profils, f.profils)) return false;
  if (f.notes.length && !(c.note && f.notes.includes(c.note))) return false;
  if (f.destinations.length && !croise(c.destinations, f.destinations)) return false;
  if (f.statuts.length && !croise(c.statuts, f.statuts)) return false;
  if (f.lieux.length && !croise([...c.villes, ...c.departements], f.lieux)) return false;

  if (!dansFourchette(c.prix, f.prixMin, f.prixMax)) return false;
  if (!dansFourchette(c.rentas, f.rentaMin, f.rentaMax)) return false;
  if (!dansFourchette(c.surfaces, f.surfaceMin, f.surfaceMax)) return false;

  return true;
}

/** Résumé lisible d'un ciblage, pour le journal de la salve et l'écran. */
export function resumerCiblage(cibles: Cible[], f: Filtres): string {
  const bouts: string[] = [
    cibles.map((k) => CIBLES.find((c) => c.cle === k)?.label ?? k).join(" + ") || "personne",
  ];
  if (f.profils.length) bouts.push(f.profils.join(", "));
  if (f.notes.length) bouts.push(`note ${f.notes.join("/")}`);
  if (f.lieux.length) bouts.push(f.lieux.slice(0, 4).join(", ") + (f.lieux.length > 4 ? `+${f.lieux.length - 4}` : ""));
  if (f.destinations.length) bouts.push(f.destinations.join(", "));
  if (f.statuts.length) bouts.push(f.statuts.join(", "));
  const borne = (label: string, min?: number, max?: number, unite = "") => {
    if (min === undefined && max === undefined) return;
    const fmt = (v: number) => `${v.toLocaleString("fr-FR")}${unite}`;
    bouts.push(
      min !== undefined && max !== undefined ? `${label} ${fmt(min)} à ${fmt(max)}`
        : min !== undefined ? `${label} ≥ ${fmt(min)}` : `${label} ≤ ${fmt(max!)}`,
    );
  };
  borne("prix", f.prixMin, f.prixMax, " €");
  borne("rendement", f.rentaMin, f.rentaMax, " %");
  borne("surface", f.surfaceMin, f.surfaceMax, " m²");
  if (f.exclureSansCivilite) bouts.push("civilité connue");

  /* Les exclusions se disent à part, et en toutes lettres : une salve dont on
     ne relit pas ce qu'elle écarte est une salve qu'on n'a pas relue. */
  const x = f.exclure ?? EXCLUSIONS_VIDES;
  const sorties = [
    ...x.profils, ...x.notes.map((n) => `note ${n}`), ...x.lieux,
    ...x.destinations, ...x.statuts,
  ];
  if (x.contacts.length) sorties.push(`${x.contacts.length} contact${x.contacts.length > 1 ? "s" : ""} retiré${x.contacts.length > 1 ? "s" : ""}`);
  if (sorties.length) bouts.push(`sauf ${sorties.join(", ")}`);
  return bouts.join(" · ");
}
