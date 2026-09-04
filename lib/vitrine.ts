// La vitrine France Immeuble sur Plein Bail.
//
// Une page publique d'agence — /vendeur/france-immeuble — figure au bas de
// chacune de nos annonces. Aucun flux du marché ne transporte un logo ni un
// texte de présentation : Poliris, Ubiflow et Apimo décrivent un BIEN, pas une
// enseigne. C'est donc au back-office de les pousser.
//
// Le texte vit ici, en dur, et non en base : il change une fois par an, il est
// relu avant de partir, et une agence qui trouve sa présentation dans une table
// de configuration finit par la laisser pourrir. L'écran Diffusion permet de le
// modifier avant l'envoi si besoin.

/** Le barème d'honoraires publié — obligation de l'arrêté du 10 janvier 2017. */
export const BAREME_HONORAIRES =
  "https://www.france-immeuble.fr/wp-content/uploads/2022/05/Tarifs-2022.pdf";

export const SITE_WEB = "https://www.france-immeuble.fr";

/** Charte 2026 : logo couleur sur fond clair, la variante par défaut. */
export const LOGO_CHEMIN = "/logos/fi-couleur-fond-clair.png";

export const SLOGAN =
  "L'agence dédiée aux immeubles. Services et réseau spécifiques à la vente d'immeuble.";

export const ZONE_INTERVENTION =
  "Paris, Île-de-France et préfectures de région";

/* Les chiffres cités sont ceux que France Immeuble affiche déjà publiquement
   sur son propre site, sous « Nos clients recherchent actuellement » : 365
   recherches d'immeubles patrimoniaux, 1 372 d'investissement, 359 d'opérations
   marchandes. On ne s'autorise ici aucune donnée qui ne soit pas déjà publique
   et vérifiable — une vitrine qui gonfle ses chiffres se retourne contre
   l'agence au premier client qui compte. */
export const PRESENTATION = `France Immeuble ne vend que des immeubles. Pas d'appartements, pas de maisons : des immeubles de rapport, des murs commerciaux et des opérations de découpe, à Paris, en Île-de-France et dans les préfectures de région.

Ce choix change la façon de travailler. Un immeuble ne se vend pas sur une surface et un coup de cœur, mais sur un état locatif, un rendement, une fiscalité et un potentiel. Chaque bien que nous présentons est donc préparé comme un dossier d'investissement : état locatif lot par lot, baux et échéances, charges et taxe foncière détaillées, travaux chiffrés, rendement en place et rendement une fois l'immeuble repositionné. L'acquéreur sait ce qu'il achète avant de se déplacer ; le vendeur ne perd pas ses samedis avec des visiteurs qui découvrent le sujet sur place.

Notre fichier recense aujourd'hui 2 096 recherches actives : 365 acquéreurs sur l'immeuble patrimonial à Paris et dans les Hauts-de-Seine, 1 372 sur l'investissement locatif partout en France, 359 sur les opérations marchandes en Île-de-France. Une grande partie de nos ventes se conclut auprès d'eux, souvent avant la diffusion publique.

Nous intervenons aussi en amont de la vente : estimation gratuite et argumentée, arbitrage entre vente en bloc et vente à la découpe, mise en copropriété, purge des droits de préemption, négociation avec les locataires en place. C'est là que se joue l'écart entre ce qu'un immeuble affiche et ce qu'il vaut.

France Immeuble — groupe Grey Stone Capital.`;

export type VitrineSaisie = {
  slogan: string;
  presentation: string;
  site_web: string;
  zone_intervention: string;
  logo_url: string;
};

/* Les plafonds de Plein Bail. Au-delà, ils tronquent sans refuser — on préfère
   couper nous-mêmes et le montrer, plutôt que de découvrir une phrase coupée
   au milieu sur la page publique. */
export const LIMITES = { slogan: 140, presentation: 3000, zone: 200 } as const;

export function vitrineParDefaut(origine: string): VitrineSaisie {
  return {
    slogan: SLOGAN,
    presentation: PRESENTATION,
    site_web: SITE_WEB,
    zone_intervention: ZONE_INTERVENTION,
    logo_url: `${origine.replace(/\/$/, "")}${LOGO_CHEMIN}`,
  };
}
