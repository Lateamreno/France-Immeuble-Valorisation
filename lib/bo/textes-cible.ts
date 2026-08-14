// Textes de la page « Détermination de la cible » du dossier d'estimation.
//
// Le bloc Investisseurs est repris MOT POUR MOT du dossier Drancy fourni par
// MAV : c'est le discours commercial de la maison, on n'y touche pas.
// Les trois autres cibles n'existaient pas dans ce dossier : ils sont
// PROPOSÉS, calqués sur la structure du premier, et attendent la relecture de
// MAV. Ce fichier est fait pour être relu et corrigé directement.

export type TexteCible = {
  /** Libellé au pluriel, tel qu'imprimé dans le bandeau « Cible ». */
  pluriel: string;
  /** Forme utilisée dans la phrase « s'adresse à une cible … ». */
  genitif: string;
  principal: string;
  secondaire: string;
  /** Paragraphe d'introduction des critères. */
  intro: string;
  /** Liste à puces : les mots en gras sont encadrés d'astérisques. */
  criteres: string[];
  /** true tant que MAV n'a pas validé le texte. */
  aValider?: boolean;
};

export const TEXTES_CIBLE: Record<string, TexteCible> = {
  /* ------------------------------------------------------------------ */
  /* Repris à l'identique du dossier Drancy — validé.                    */
  Investisseur: {
    pluriel: "Investisseurs",
    genitif: "d'investisseurs",
    principal: "Rendement",
    secondaire: "Prix au m²",
    intro:
      "Les *investisseurs* ont pour critère principal la *rentabilité* mais n’achètent jamais au dessus du *prix au m²* du marché. Il faut donc veiller à proposer un rendement suffisant *et* un prix au m² intéressant par rapport aux standards de la ville.",
    criteres: [
      "Attractivité de l'*emplacement*",
      "*Prix au m²* par rapport au marché",
      "*Rentabilité*",
      "*Plus-value* potentielle à court ou long terme",
      "*Loyers au m²* cohérents avec le marché",
      "Fiabilité des *locataires*",
      "Qualité du *bâti*",
    ],
  },

  /* ------------------------------------------------------------------ */
  /* Propositions à valider par MAV.                                     */
  Patrimonial: {
    pluriel: "Investisseurs patrimoniaux",
    genitif: "d'investissements patrimoniaux",
    principal: "Emplacement",
    secondaire: "Qualité du bâti",
    aValider: true,
    intro:
      "Les *investisseurs patrimoniaux* achètent d'abord un *emplacement* et une *qualité de bâti* qu'ils conserveront longtemps. Le rendement passe au second plan : ils acceptent une rentabilité plus faible en échange d'un actif sûr, bien situé et sans travaux lourds à venir.",
    criteres: [
      "Qualité de l'*emplacement* et de l'adresse",
      "Qualité du *bâti* et absence de gros travaux",
      "*Pérennité* des loyers et solidité des baux",
      "*Plus-value* à long terme",
      "Faible besoin de *gestion*",
      "Prix au m² cohérent avec le marché",
    ],
  },

  "Marchand de biens": {
    pluriel: "Marchands de biens",
    genitif: "de marchands de biens",
    principal: "Prix au m²",
    secondaire: "Marge à la revente",
    aValider: true,
    intro:
      "Les *marchands de biens* raisonnent en *marge*. Ils achètent décoté pour revendre après travaux ou à la découpe, et comparent systématiquement le prix d'achat au m² aux prix de revente lot par lot. Le rendement locatif ne les intéresse que le temps de porter l'opération.",
    criteres: [
      "*Prix au m²* décoté par rapport à la revente",
      "*Potentiel de division* ou de découpe",
      "*Libération* des lots possible",
      "Montant et nature des *travaux*",
      "Qualité du *bâti* et de la structure",
      "Rapidité de *revente* sur le secteur",
    ],
  },

  Promoteur: {
    pluriel: "Promoteurs",
    genitif: "de promoteurs",
    principal: "Charge foncière",
    secondaire: "Constructibilité",
    aValider: true,
    intro:
      "Les *promoteurs* achètent un *droit à construire* plus qu'un immeuble. Ils raisonnent en *charge foncière* au m² constructible et étudient le PLU avant le bâti existant. La libération du site et la faisabilité administrative conditionnent leur offre.",
    criteres: [
      "*Constructibilité* et règles du PLU",
      "*Charge foncière* au m² de surface de plancher",
      "*Libération* des lieux et relogement",
      "Taille et forme de la *parcelle*",
      "Absence de *servitudes* ou de recours",
      "Attractivité de l'*emplacement* à la revente",
    ],
  },
};

/** Cible principale = la première cochée ; c'est elle qui donne les critères. */
export function cibleTexte(cibles: string[]): TexteCible {
  for (const c of cibles) if (TEXTES_CIBLE[c]) return TEXTES_CIBLE[c];
  return TEXTES_CIBLE.Investisseur;
}

/** « Investisseurs et Investisseurs patrimoniaux » */
export function cibleLibelle(cibles: string[]): { titre: string; suite?: string } {
  const noms = cibles.map((c) => TEXTES_CIBLE[c]?.pluriel).filter(Boolean) as string[];
  if (noms.length === 0) return { titre: "Investisseurs" };
  return { titre: noms[0], suite: noms.length > 1 ? `et ${noms.slice(1).join(", ")}` : undefined };
}

/** « d'investisseurs et d'investissements patrimoniaux » */
export function cibleGenitif(cibles: string[]): string {
  const g = cibles.map((c) => TEXTES_CIBLE[c]?.genitif).filter(Boolean) as string[];
  if (g.length === 0) return "d'investisseurs";
  if (g.length === 1) return g[0];
  return `${g.slice(0, -1).join(", ")} et ${g[g.length - 1]}`;
}

/** Méthodologie — texte fixe repris du dossier du BO. */
export const METHODOLOGIE = [
  "Pour déterminer le prix de vente nous recherchons les données du secteur concernant le prix au m² (source notaire) et les locations. En recoupant ces informations nous déterminons le rendement secteur. Nous comparons ensuite les valeurs théoriques de votre immeuble selon le rendement et le prix au m² pour déterminer le facteur limitant.",
  "En effet, les acheteurs recherchent des biens correspondant à ces deux critères simultanément. Par ailleurs, les immeubles sont généralement vendus avec une décote du prix au m² allant de 5 à 20 % en fonction de la taille du bâtiment.",
];

/** Mentions légales du dos de couverture. */
export const MENTIONS = [
  "Siège social : 66 avenue des Champs Elysées – 75008 Paris",
  "France Immeuble S.A.S. au capital de 100 000 € - RCS Paris - SIRET : 835 369 562 00011 Garantie financière Galian de 120 k€ - RCP MMA Entreprises n°120137405",
  "Carte professionnelle Transactions sans maniement de fonds : CPI 7501 2018 000 026 004 délivrée par la CCI Paris Ile-de-France : 27 Avenue de Friedland, 75008 Paris",
  "TVA intracommunautaire FR14835369562",
];

export const SOCIETE = {
  tel: "01.72.87.52.22",
  email: "contact@france-immeuble.fr",
  site: "www.france-immeuble.fr",
};
