/* Champs de fusion (retour #108).
 *
 * Un champ de fusion, c'est `{{civilite}}` dans le texte et « Monsieur » dans
 * le message reçu. Cette bibliothèque est la seule source : l'éditeur pioche
 * dedans pour proposer les puces cliquables, et le moteur d'envoi s'en sert
 * pour remplacer. Ajouter un champ ici le rend disponible partout.
 *
 * Règle d'or : un champ de fusion ne doit JAMAIS laisser un trou dans le
 * message. Chacun porte donc un repli — et quand le repli ne suffit pas
 * (« Bonjour Monsieur » qu'on ne peut pas deviner), le champ est déclaré
 * `sensible` : l'écran refuse alors d'envoyer aux contacts concernés tant
 * qu'on n'a pas choisi quoi faire d'eux.
 */

export type Groupe = "Personne" | "Société" | "Immeuble" | "Agent" | "Agence";

export type ChampFusion = {
  /** Ce qu'on écrit dans le texte : `{{cle}}`. */
  cle: string;
  label: string;
  groupe: Groupe;
  /** Exemple montré dans l'éditeur — c'est ce qui rend la puce lisible. */
  exemple: string;
  /** Ce qui est écrit quand la donnée manque. Vide = trou à combler. */
  repli: string;
  /** Un trou ici se voit dans le message : on avertit avant d'envoyer. */
  sensible?: boolean;
  aide?: string;
};

export const CHAMPS: ChampFusion[] = [
  /* --- Personne --- */
  { cle: "civilite", label: "Civilité", groupe: "Personne", exemple: "Monsieur", repli: "",
    sensible: true,
    aide: "Monsieur ou Madame. Déduit du prénom quand la fiche ne le dit pas." },
  { cle: "prenom", label: "Prénom", groupe: "Personne", exemple: "Nicolas", repli: "" },
  { cle: "nom", label: "Nom", groupe: "Personne", exemple: "LANSKI", repli: "" },
  { cle: "nom_complet", label: "Nom complet", groupe: "Personne", exemple: "M. Nicolas LANSKI", repli: "",
    sensible: true, aide: "Civilité + prénom + nom." },
  { cle: "politesse", label: "Formule d'appel", groupe: "Personne", exemple: "Bonjour Monsieur LANSKI",
    repli: "Bonjour",
    aide: "S'adapte toute seule : « Bonjour Monsieur LANSKI », ou simplement « Bonjour » quand on ne sait pas." },
  { cle: "email", label: "E-mail", groupe: "Personne", exemple: "nicolas.lanski@gmail.com", repli: "" },
  { cle: "telephone", label: "Téléphone", groupe: "Personne", exemple: "06.69.95.41.18", repli: "" },

  /* --- Société --- */
  { cle: "societe", label: "Raison sociale", groupe: "Société", exemple: "SCI LLA", repli: "" },
  { cle: "poste", label: "Poste", groupe: "Société", exemple: "Gérant", repli: "" },

  /* --- Immeuble --- */
  { cle: "immeuble", label: "Immeuble", groupe: "Immeuble", exemple: "Montreuil (93100) - 15 Rue de Normandie", repli: "" },
  { cle: "immeuble_ville", label: "Ville", groupe: "Immeuble", exemple: "Montreuil", repli: "" },
  { cle: "immeuble_cp", label: "Code postal", groupe: "Immeuble", exemple: "93100", repli: "" },
  { cle: "immeuble_prix", label: "Prix HAI", groupe: "Immeuble", exemple: "8 678 843 €", repli: "" },
  { cle: "immeuble_surface", label: "Surface Carrez", groupe: "Immeuble", exemple: "1 436 m²", repli: "" },
  { cle: "immeuble_renta", label: "Rendement", groupe: "Immeuble", exemple: "6,9 %", repli: "" },

  /* --- Agent --- */
  { cle: "agent", label: "Votre nom", groupe: "Agent", exemple: "Marc-Antoine VOCI", repli: "France Immeuble" },
  { cle: "agent_prenom", label: "Votre prénom", groupe: "Agent", exemple: "Marc-Antoine", repli: "" },
  { cle: "agent_email", label: "Votre e-mail", groupe: "Agent", exemple: "ma.voci@france-immeuble.fr", repli: "" },
  { cle: "agent_tel", label: "Votre téléphone", groupe: "Agent", exemple: "06 12 34 56 78", repli: "" },

  /* --- Agence --- */
  { cle: "agence", label: "Agence", groupe: "Agence", exemple: "France Immeuble", repli: "France Immeuble" },
  { cle: "site", label: "Site web", groupe: "Agence", exemple: "france-immeuble.fr", repli: "france-immeuble.fr" },
];

export const GROUPES: Groupe[] = ["Personne", "Société", "Immeuble", "Agent", "Agence"];
export const champParCle = new Map(CHAMPS.map((c) => [c.cle, c]));

/** Les `{{…}}` présents dans un texte, dans l'ordre, sans doublon. */
export function champsUtilises(texte: string): string[] {
  const vus = new Set<string>();
  for (const m of texte.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) vus.add(m[1].toLowerCase());
  return [...vus];
}

/** Les `{{…}}` qui ne correspondent à aucun champ connu — donc des fautes de
 *  frappe qui partiraient telles quelles dans le message. */
export const champsInconnus = (texte: string) =>
  champsUtilises(texte).filter((c) => !champParCle.has(c));

export type Valeurs = Record<string, string | undefined>;

/** Remplace les champs par leurs valeurs. Renvoie aussi ce qui manquait, pour
 *  que l'écran puisse le dire avant d'envoyer plutôt qu'après. */
export function fusionner(texte: string, v: Valeurs): { texte: string; manquants: string[] } {
  const manquants = new Set<string>();
  const sorti = texte.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (brut, cleBrute: string) => {
    const cle = cleBrute.toLowerCase();
    const champ = champParCle.get(cle);
    if (!champ) return brut; // champ inconnu : on le laisse voir, il saute aux yeux
    const val = v[cle]?.trim();
    if (val) return val;
    manquants.add(cle);
    return champ.repli;
  });
  /* Un champ vide en début de phrase laisse une espace en trop et parfois une
     virgule orpheline : « Bonjour , » se voit tout de suite. */
  return {
    texte: sorti.replace(/[ \t]{2,}/g, " ").replace(/ +([,.;:!?])/g, "$1").replace(/^[ \t]+$/gm, ""),
    manquants: [...manquants],
  };
}

/* ===================== Civilité =====================
   Relevé sur la base au 24/08/26 : 3 793 contacts, 2 306 avec une civilité
   (1 780 M · 526 Mme), 1 487 sans. Parmi les 1 340 qui ont malgré tout un
   prénom, 825 portent un prénom que le fichier lui-même tranche à plus de
   90 % — on peut donc les servir sans rien inventer. Restent 662 fiches
   (17 %) pour lesquelles on n'écrit tout simplement pas de civilité.

   Rien n'est enregistré : la déduction se refait à chaque envoi. Bubble
   réécrit `bo_contact` toutes les nuits, une civilité posée par nous serait
   effacée — et surtout, écrire « Madame » dans la fiche de quelqu'un sur la
   foi de son prénom, c'est une affirmation que personne n'a validée. */

export type RefPrenoms = Record<string, "Monsieur" | "Madame">;

/** Construit la table prénom → civilité à partir des fiches renseignées.
 *  Elle s'améliore toute seule à mesure que le fichier se remplit. */
export function tablePrenoms(
  contacts: { prenom?: string; civilite?: string }[],
  seuil = 0.9,
  miniOccurrences = 2,
): RefPrenoms {
  const compte = new Map<string, { m: number; f: number }>();
  for (const c of contacts) {
    const p = clePrenom(c.prenom);
    const civ = c.civilite?.trim();
    if (!p || (civ !== "Monsieur" && civ !== "Madame")) continue;
    const e = compte.get(p) ?? { m: 0, f: 0 };
    if (civ === "Monsieur") e.m += 1; else e.f += 1;
    compte.set(p, e);
  }
  const ref: RefPrenoms = {};
  for (const [p, { m, f }] of compte) {
    const n = m + f;
    if (n < miniOccurrences) continue;
    if (m / n >= seuil) ref[p] = "Monsieur";
    else if (f / n >= seuil) ref[p] = "Madame";
  }
  return ref;
}

/** Premier prénom, sans accent ni casse : « Jean-Pierre » et « jean pierre »
 *  doivent tomber sur la même case. */
export function clePrenom(p?: string) {
  const brut = (p ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return brut.split(/[\s-]+/)[0] ?? "";
}

export type Civilite = {
  valeur?: "Monsieur" | "Madame";
  /** D'où elle vient — l'écran le dit, on ne devine pas dans le dos de l'agent. */
  origine: "fiche" | "prenom" | "inconnue";
};

export function civiliteDe(
  c: { prenom?: string; civilite?: string },
  ref: RefPrenoms,
): Civilite {
  const dite = c.civilite?.trim();
  if (dite === "Monsieur" || dite === "Madame") return { valeur: dite, origine: "fiche" };
  const devinee = ref[clePrenom(c.prenom)];
  if (devinee) return { valeur: devinee, origine: "prenom" };
  return { origine: "inconnue" };
}

export type Expediteur = { nom?: string; email?: string; telephone?: string };

/** Les valeurs de fusion d'un destinataire.
 *
 *  Volontairement synchrone et sans accès réseau : l'aperçu de l'écran et
 *  l'envoi doivent produire exactement le même texte. Deux moteurs, ce serait
 *  un aperçu qui ment. */
export function valeursDe(
  c: {
    nom: string; email: string; prenom?: string; civilite?: string;
    societe?: string; telephone?: string;
  },
  ref: RefPrenoms,
  agent: Expediteur,
): Valeurs {
  const civ = civiliteDe(c, ref);
  const patronyme = c.nom.trim().split(/\s+/).slice(-1)[0];
  return {
    civilite: civ.valeur,
    prenom: c.prenom,
    nom: patronyme,
    nom_complet: [civ.valeur === "Monsieur" ? "M." : civ.valeur === "Madame" ? "Mme" : "", c.nom]
      .filter(Boolean).join(" "),
    politesse: formuleAppel(civ, patronyme),
    email: c.email,
    telephone: c.telephone,
    societe: c.societe,
    agent: agent.nom,
    agent_prenom: agent.nom?.split(" ")[0],
    agent_email: agent.email,
    agent_tel: agent.telephone,
    agence: "France Immeuble",
    site: "france-immeuble.fr",
  };
}

/** « Bonjour Monsieur LANSKI », ou « Bonjour » quand on ne sait pas. Jamais
 *  « Bonjour Monsieur/Madame », qui dit surtout qu'on ne connaît pas les gens
 *  à qui on écrit. */
export function formuleAppel(civ: Civilite, nom?: string) {
  if (!civ.valeur) return "Bonjour";
  return nom?.trim() ? `Bonjour ${civ.valeur} ${nom.trim().toUpperCase()}` : `Bonjour ${civ.valeur}`;
}
