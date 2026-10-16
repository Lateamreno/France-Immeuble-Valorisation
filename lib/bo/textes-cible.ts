// Textes de la page « Détermination de la cible » du dossier d'estimation.
//
// Repris mot pour mot du BO (dossier Drancy pour la cible seule, capture MAV
// du 14/08 pour les quatre typologies cochées ensemble).
//
// Le BO ne fait pas un bloc par cible mais UN BLOC PAR FAMILLE d'acheteurs :
// les investisseurs d'un côté, les marchands de biens et promoteurs de
// l'autre. Chaque bloc nomme les cibles retenues de sa famille — « Les
// marchands de biens, promoteurs ont pour critère principal… ». Les
// investisseurs patrimoniaux partagent le mot « investisseurs » : cocher les
// deux n'écrit pas deux fois le mot, exactement comme dans le BO.
//
// Les mots en gras sont encadrés d'astérisques.

export type Cible = {
  /** Libellé du bandeau « Cible », au pluriel. */
  pluriel: string;
  /** Forme utilisée dans « s'adresse à une cible … ». */
  genitif: string;
  /** Mot repris dans la phrase de sa famille (dédoublonné). */
  mot: string;
  famille: "investisseurs" | "marchands";
};

export const CIBLES: Record<string, Cible> = {
  Investisseur: {
    pluriel: "Investisseurs", genitif: "d'investisseurs",
    mot: "investisseurs", famille: "investisseurs",
  },
  Patrimonial: {
    pluriel: "Investisseurs patrimoniaux", genitif: "d'investissements patrimoniaux",
    mot: "investisseurs", famille: "investisseurs",
  },
  "Marchand de biens": {
    pluriel: "Marchands de biens", genitif: "de marchands de biens",
    mot: "marchands de biens", famille: "marchands",
  },
  Promoteur: {
    pluriel: "Promoteurs", genitif: "de promoteurs",
    mot: "promoteurs", famille: "marchands",
  },
};

export type Famille = {
  principal: string;
  secondaire: string;
  /** `liste` = les cibles cochées de la famille, séparées par des virgules. */
  intro: (liste: string) => string;
  criteres: string[];
};

export const FAMILLES: Record<string, Famille> = {
  investisseurs: {
    principal: "Rendement",
    secondaire: "Prix au m²",
    intro: (l) =>
      `Les *${l}* ont pour critère principal la *rentabilité* mais n’achètent jamais au dessus du *prix au m²* du marché. Il faut donc veiller à proposer un rendement suffisant *et* un prix au m² intéressant par rapport aux standards de la ville.`,
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
  marchands: {
    principal: "Marge sur opération",
    secondaire: "Prix à la revente",
    intro: (l) =>
      `Les *${l}* ont pour critère principal la *marge sur opération* mais regardent également le *prix à la revente*. Il faut donc veiller à proposer un prix au m² permettant de générer une *marge d'au moins 15 % après travaux*.`,
    criteres: [
      "Attractivité de l'*emplacement*",
      "*Prix au m²* par rapport au marché",
      "*Potentiel constructible*",
      "*Plus-value* potentielle à court ou moyen terme",
    ],
  },
};

/** Ordre d'affichage des blocs, indépendant de l'ordre des cases cochées. */
const ORDRE = ["investisseurs", "marchands"] as const;

/** Un bloc de critères par famille représentée, dans l'ordre du BO. */
export function blocsCible(cibles: string[]): { cle: string; liste: string; f: Famille }[] {
  return ORDRE.flatMap((cle) => {
    const mots = [...new Set(
      cibles.map((c) => CIBLES[c]).filter((c) => c?.famille === cle).map((c) => c.mot),
    )];
    if (!mots.length) return [];
    return [{ cle, liste: mots.join(", "), f: FAMILLES[cle] }];
  });
}

/** Critères du bandeau : ceux de la première famille retenue. */
export function criteresEntete(cibles: string[]): Famille {
  return blocsCible(cibles)[0]?.f ?? FAMILLES.investisseurs;
}

/** « Investisseurs » + « et Investisseurs patrimoniaux, Marchands de biens ». */
export function cibleLibelle(cibles: string[]): { titre: string; suite?: string } {
  const noms = cibles.map((c) => CIBLES[c]?.pluriel).filter(Boolean) as string[];
  if (noms.length === 0) return { titre: "Investisseurs" };
  return { titre: noms[0], suite: noms.length > 1 ? `et ${noms.slice(1).join(", ")}` : undefined };
}

/** « d'investisseurs et d'investissements patrimoniaux » */
export function cibleGenitif(cibles: string[]): string {
  const g = cibles.map((c) => CIBLES[c]?.genitif).filter(Boolean) as string[];
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
