/* Trois brouillons pour démarrer une campagne (MAV, 27/10 : « des e-mails
 * commerciaux pour présenter Plein Bail, la team réno ou la découpe
 * d'immeubles en bloc »).
 *
 * Ce sont des points de départ, pas des messages prêts : les passages entre
 * crochets « [à compléter …] » attendent un fait que seul MAV peut donner (un
 * lien, un chiffre, un nom). La fenêtre refuse de programmer tant qu'il en
 * reste un.
 */

export type ModeleCampagne = { cle: string; libelle: string; objet: string; corps: string };

export const A_COMPLETER = /\[à compléter[^\]]*\]/i;

export const MODELES_CAMPAGNE: ModeleCampagne[] = [
  {
    cle: "plein-bail",
    libelle: "Présenter Plein Bail",
    objet: "Des immeubles et des lots déjà loués, réunis au même endroit",
    corps: [
      "{{politesse}},",
      "",
      "Vous nous connaissez pour l'achat et la vente d'immeubles. Nous lançons Plein Bail, une place de marché "
        + "dédiée aux biens vendus loués : immeubles de rapport, lots occupés, murs commerciaux.",
      "",
      "Chaque annonce donne l'état locatif, les loyers et le rendement, sans détour. [à compléter : ce qui distingue Plein Bail, en une phrase]",
      "",
      "Pour découvrir les biens en ligne : [à compléter : lien vers Plein Bail]",
      "",
      "Je reste à votre disposition si vous cherchez un bien précis, ou si vous souhaitez vendre un bien loué.",
      "",
      "Bien à vous,",
      "{{agent}}",
      "{{agent_tel}}",
    ].join("\n"),
  },
  {
    cle: "team-reno",
    libelle: "Présenter la team réno",
    objet: "Vos travaux, de l'estimation à la remise des clés",
    corps: [
      "{{politesse}},",
      "",
      "Un immeuble se vend mieux, et se loue plus cher, quand il est rénové. C'est pourquoi nous travaillons avec "
        + "[à compléter : nom de l'équipe travaux], qui prend en charge les travaux de nos clients : parties "
        + "communes, rénovation de lots, mises aux normes, DPE.",
      "",
      "[à compléter : une réalisation récente ou un chiffre qui parle]",
      "",
      "Si vous avez un projet, même à l'état d'idée, je vous mets en relation : un premier passage sur place "
        + "permet d'y voir clair.",
      "",
      "Bien à vous,",
      "{{agent}}",
      "{{agent_tel}}",
    ].join("\n"),
  },
  {
    cle: "decoupe-bloc",
    libelle: "Vendre en bloc ou à la découpe",
    objet: "Votre immeuble : vendre en bloc, ou lot par lot ?",
    corps: [
      "{{politesse}},",
      "",
      "Vendre un immeuble entier ou le vendre lot par lot, ce ne sont pas les mêmes prix, ni les mêmes délais. "
        + "France Immeuble accompagne les propriétaires dans les deux cas : vente en bloc auprès d'investisseurs, "
        + "ou vente à la découpe, de la mise en copropriété à la signature du dernier lot.",
      "",
      "[à compléter : un exemple récent, par exemple l'écart obtenu entre bloc et découpe]",
      "",
      "Si vous vous posez la question pour l'un de vos biens, je peux vous en faire une estimation dans les deux "
        + "hypothèses, sans engagement.",
      "",
      "Bien à vous,",
      "{{agent}}",
      "{{agent_tel}}",
    ].join("\n"),
  },
];
