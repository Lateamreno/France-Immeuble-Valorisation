/**
 * L'analyse de l'estimation, rédigée depuis les chiffres (retour #272).
 *
 * MAV a dicté le canevas, phrase par phrase :
 *
 *   « L'immeuble est X situé et en X état. Les loyers sont X % en dessous / au
 *   dessus du marché, ce qui impacte le rendement et donc le prix / ce qui
 *   devrait nous permettre de nous positionner au plus haut en terme de prix
 *   au m². Les DPE des logements quant à eux sont bons (si tous sont en D ou
 *   mieux, uniquement pour les logements) / x logements ont des DPE inférieurs
 *   à D. Si on a prévu des travaux alors on écrit x € de travaux sont
 *   prévisionnés pour sortir des interdictions de louer. Si on n'a pas chiffré,
 *   on indique qu'une négociation à hauteur du montant des travaux est à
 *   prévoir. Au vu de ces éléments nous estimons l'immeuble à XX € HAI
 *   (x € net vendeur) soit X % de rendement potentiel et x €/m² après travaux,
 *   soit x % en dessous du prix au m² à la découpe. »
 *
 * Quatre paragraphes, donc, et chacun n'écrit que ce qu'il sait. Une donnée
 * manquante fait sauter sa phrase — jamais un « — » ni un « X » au milieu d'un
 * texte que le propriétaire va lire. C'est aussi pour ça que le texte reste
 * modifiable : il propose une rédaction, il ne la impose pas.
 */

const fr1 = (x: number) => x.toFixed(1).replace(".", ",");
const groupe = (x: number) => Math.round(x).toLocaleString("fr-FR");
const eur = (x: number) => `${groupe(x)} €`;

/** Les DPE qui interdisent ou vont interdire la location. */
const MAUVAIS_DPE = new Set(["E", "F", "G", "G+"]);

export type SourceAnalyse = {
  /** Les libellés choisis aux étoiles : « bien situé », « en état d'usage ». */
  phraseEmplacement?: string;
  phraseBati?: string;
  /** Écart des loyers PRATIQUÉS au loyer du secteur, en %. */
  ecartLoyers: number;
  /** Les DPE des seuls logements — les commerces ne sont pas concernés. */
  dpeLogements: string[];
  /** Travaux chiffrés au dossier, bâti et lots confondus. */
  travaux: number;
  /** L'état technique dit-il qu'il y a des travaux, même non chiffrés ? */
  travauxAPrevoir?: boolean;
  hai: number;
  netVendeur: number;
  /** Rendement sur les loyers potentiels, travaux inclus dans le prix. */
  rendementPotentiel: number;
  /** €/m² après travaux, et le prix au m² de la découpe pour s'y comparer. */
  m2ApresTravaux: number;
  m2Decoupe?: number;
};

/** La situation et l'état, en une phrase — celle qui ouvre le texte. */
function phraseIdentite(b: SourceAnalyse): string | undefined {
  const emp = b.phraseEmplacement?.trim();
  const bati = b.phraseBati?.trim();
  if (!emp && !bati) return undefined;
  if (emp && bati) return `L'immeuble est ${emp} et ${bati}.`;
  return `L'immeuble est ${emp ?? bati}.`;
}

/**
 * Les loyers face au marché, et ce que ça change pour le prix.
 *
 * Sous le marché, le rendement d'aujourd'hui est faible et pèse sur le prix ;
 * au-dessus, l'immeuble tient déjà ses revenus et on peut viser le haut de la
 * fourchette au m². C'est l'arbitrage que MAV fait à l'oral, écrit une fois.
 */
function phraseLoyers(b: SourceAnalyse): string | undefined {
  const e = Math.round(b.ecartLoyers);
  if (!Number.isFinite(e)) return undefined;
  if (Math.abs(e) < 3) {
    return "Les loyers sont dans le marché : le rendement affiché reflète déjà le potentiel réel de l'immeuble.";
  }
  if (e < 0) {
    return `Les loyers sont ${Math.abs(e)} % en dessous du marché, ce qui pèse sur le rendement et donc sur le prix.`;
  }
  return `Les loyers sont ${e} % au-dessus du marché, ce qui devrait nous permettre de nous positionner au plus haut en termes de prix au m².`;
}

/** Combien de logements sont sous D — le seuil qui déclenche les interdictions. */
function logementsSousD(b: SourceAnalyse): number {
  const connus = b.dpeLogements.map((d) => d.trim().toUpperCase()).filter((d) => d && d !== "N.C." && d !== "VIERGE");
  return connus.filter((d) => MAUVAIS_DPE.has(d)).length;
}

/** Les DPE des logements — et eux seuls : un commerce ne se loue pas au DPE. */
function phraseDpe(b: SourceAnalyse): string | undefined {
  const connus = b.dpeLogements.map((d) => d.trim().toUpperCase()).filter((d) => d && d !== "N.C." && d !== "VIERGE");
  if (connus.length === 0) return undefined;
  const mauvais = logementsSousD(b);
  if (mauvais === 0) return "Les DPE des logements sont bons.";
  return mauvais === 1
    ? "Un logement a un DPE inférieur à D."
    : `${mauvais} logements ont des DPE inférieurs à D.`;
}

/**
 * Les travaux : chiffrés, ou à négocier faute de chiffrage.
 *
 * Retour #282 — « s'il n'y a aucun logement en plus de D, alors il ne faut pas
 * dire dans le texte automatique, s'il y a des travaux, que cela sert à sortir
 * des interdictions de louer. » La phrase précédente le disait de tout
 * immeuble, y compris quand elle venait de certifier deux lignes plus haut que
 * les DPE étaient bons : le texte se contredisait sous les yeux du
 * propriétaire. Le motif ne s'écrit donc que là où il existe — un logement au
 * moins sous D.
 */
function phraseTravaux(b: SourceAnalyse): string | undefined {
  if (b.travaux > 0) {
    const motif = logementsSousD(b) > 0 ? ", notamment pour sortir des interdictions de louer" : "";
    return `${eur(b.travaux)} de travaux sont prévisionnés${motif}.`;
  }
  if (b.travauxAPrevoir) {
    return "Les travaux ne sont pas encore chiffrés : une négociation à hauteur de leur montant est à prévoir.";
  }
  return undefined;
}

/** La conclusion : le prix, et ce qu'il représente. */
function phrasePrix(b: SourceAnalyse): string | undefined {
  if (b.hai <= 0) return undefined;
  const bouts = [`Au vu de ces éléments, nous estimons l'immeuble à ${eur(b.hai)} HAI`];
  if (b.netVendeur > 0) bouts.push(` (${eur(b.netVendeur)} net vendeur)`);
  const suites: string[] = [];
  if (b.rendementPotentiel > 0) suites.push(`${fr1(b.rendementPotentiel)} % de rendement potentiel`);
  if (b.m2ApresTravaux > 0) suites.push(`${groupe(b.m2ApresTravaux)} €/m² après travaux`);
  if (suites.length) bouts.push(`, soit ${suites.join(" et ")}`);
  /* L'écart au prix de la découpe ne s'écrit que dans le sens qui a du sens :
     au-dessus du prix de revente lot par lot, l'immeuble n'a pas d'histoire à
     raconter à un marchand, et la phrase se tairait mieux. */
  if (b.m2Decoupe && b.m2Decoupe > 0 && b.m2ApresTravaux > 0) {
    const ecart = Math.round((1 - b.m2ApresTravaux / b.m2Decoupe) * 100);
    if (ecart > 0) bouts.push(`, soit ${ecart} % en dessous du prix au m² à la découpe`);
  }
  return `${bouts.join("")}.`;
}

/**
 * Le texte complet, prêt à relire.
 *
 * Les phrases se suivent dans un seul paragraphe : c'est un avis, pas une
 * liste, et le dossier lui réserve un bloc de quelques lignes.
 */
export function analyseAuto(b: SourceAnalyse): string {
  return [
    phraseIdentite(b),
    phraseLoyers(b),
    phraseDpe(b),
    phraseTravaux(b),
    phrasePrix(b),
  ].filter(Boolean).join(" ");
}
