/* L'argument que MAV utilise à l'oral et qui convertit : « avec un crédit sur
 * 20 ans, il faut tel apport pour que l'opération s'équilibre ». Le mettre
 * dans le dossier évite au propriétaire d'avoir à le croire sur parole.
 *
 * Rien d'inventé ici : le calcul est celui d'un tableau d'amortissement
 * classique, et toutes les hypothèses (taux, durée, frais) sont affichées à
 * côté du résultat. Un chiffre dont on ne voit pas les hypothèses ne se
 * discute pas — et c'est justement une conversation qu'on veut avoir.
 */

export type Hypotheses = {
  /** Taux nominal annuel, hors assurance, en %. */
  taux: number;
  /** Durée en années. */
  duree: number;
  /** Assurance emprunteur, en % du capital emprunté par an. */
  assurance: number;
  /** Frais d'acquisition (notaire + formalités), en % du prix. */
  frais: number;
};

/** Marché de référence, août 2026. Affichées et modifiables : ce sont des
 *  hypothèses, pas des constantes physiques. */
export const HYPOTHESES: Hypotheses = {
  taux: 3.4,
  duree: 20,
  assurance: 0.34,
  frais: 7.5,
};

/** Mensualité d'un capital emprunté, assurance comprise. */
export function mensualite(capital: number, h = HYPOTHESES) {
  if (capital <= 0) return 0;
  const n = h.duree * 12;
  const i = h.taux / 100 / 12;
  /* Un taux nul n'est pas qu'une hypothèse d'école : c'est aussi ce qu'on
     obtient si quelqu'un met 0 dans le champ. La division par i exploserait. */
  const amortissement = i === 0 ? capital / n : (capital * i) / (1 - (1 + i) ** -n);
  return amortissement + (capital * (h.assurance / 100)) / 12;
}

/** Capital qu'une mensualité donnée permet d'emprunter — l'opération inverse. */
export function capitalFinancable(mens: number, h = HYPOTHESES) {
  if (mens <= 0) return 0;
  const n = h.duree * 12;
  const i = h.taux / 100 / 12;
  const facteur = (i === 0 ? 1 / n : i / (1 - (1 + i) ** -n)) + h.assurance / 100 / 12;
  return mens / facteur;
}

export type Equilibre = {
  /** Ce que coûte l'acquisition, frais compris. */
  coutTotal: number;
  frais: number;
  /** Revenu net de charges, par mois. */
  revenuMensuel: number;
  /** Capital que ce revenu rembourse à lui seul. */
  empruntable: number;
  /** Apport pour que la mensualité soit couverte par les loyers. */
  apport: number;
  /** Part de l'apport dans le prix, en %. */
  apportPct: number;
  /** Mensualité si l'acquéreur finance tout sauf les frais. */
  mensualiteSansApport: number;
  /** Effort mensuel restant dans ce cas (négatif = ça s'autofinance). */
  effortSansApport: number;
  hypotheses: Hypotheses;
};

/**
 * L'apport nécessaire pour que les loyers couvrent la mensualité.
 *
 * `charges` sont les charges non récupérables annuelles : ce sont elles qui
 * font la différence entre un rendement affiché et un revenu réel.
 */
export function equilibre(
  prix: number,
  loyersAn: number,
  charges = 0,
  h = HYPOTHESES,
): Equilibre {
  const frais = Math.round((prix * h.frais) / 100);
  const coutTotal = prix + frais;
  const revenuMensuel = Math.max(0, (loyersAn - charges) / 12);
  const empruntable = capitalFinancable(revenuMensuel, h);
  const apport = Math.max(0, Math.round(coutTotal - empruntable));
  const mensualiteSansApport = mensualite(prix, h);
  return {
    coutTotal,
    frais,
    revenuMensuel,
    empruntable,
    apport,
    apportPct: prix > 0 ? (apport / prix) * 100 : 0,
    mensualiteSansApport,
    /* « Sans apport » veut dire : on emprunte le prix, on paie les frais de sa
       poche. Personne ne prête les frais de notaire. */
    effortSansApport: mensualiteSansApport - revenuMensuel,
    hypotheses: h,
  };
}

/* ===================== Position dans le marché =====================
   Un prix seul ne dit rien. Le même chiffre est cher ou donné selon le
   secteur : c'est la comparaison qui informe, pas la valeur absolue. */

export type Position = {
  /** Valeur du bien sur l'axe. */
  valeur: number;
  /** Référence du secteur. */
  reference: number;
  /** Écart en %, positif = au-dessus du secteur. */
  ecart: number;
  /** Position 0–100 sur une échelle allant de −30 % à +30 % du secteur. */
  curseur: number;
  /** Lecture en clair, pour ne pas laisser le propriétaire interpréter seul. */
  verdict: string;
  ton: "sous" | "dans" | "sur";
};

export function positionner(valeur: number, reference: number, quoi: string): Position | undefined {
  if (!(valeur > 0) || !(reference > 0)) return undefined;
  const ecart = (valeur / reference - 1) * 100;
  /* L'échelle s'arrête à ±30 % : au-delà, la barre ne dit plus rien de plus
     que « très au-dessus », et l'écart chiffré est là pour ça. */
  const curseur = Math.min(100, Math.max(0, ((ecart + 30) / 60) * 100));
  const ton = ecart < -7 ? "sous" : ecart > 7 ? "sur" : "dans";
  const abs = Math.abs(Math.round(ecart));
  const verdict =
    ton === "dans"
      ? `${quoi} dans le marché du secteur`
      : ton === "sous"
        ? `${quoi} ${abs} % sous le marché du secteur`
        : `${quoi} ${abs} % au-dessus du marché du secteur`;
  return { valeur, reference, ecart, curseur, verdict, ton };
}

/** Prix au m² qu'implique un prix total — utile quand le curseur bouge. */
export const prixM2 = (prix: number, surface: number) => (surface > 0 ? prix / surface : 0);

/** Rendement brut qu'implique un prix total. */
export const rendement = (prix: number, loyersAn: number) => (prix > 0 ? (loyersAn / prix) * 100 : 0);

/** Fourchette du curseur : −20 % / +20 % autour du prix estimé, arrondie au
 *  millier. Assez large pour que le propriétaire teste son idée de prix, assez
 *  serrée pour ne pas donner de faux espoirs. */
export function fourchettePrix(hai: number) {
  const pas = 1000;
  const bas = Math.round((hai * 0.8) / pas) * pas;
  const haut = Math.round((hai * 1.2) / pas) * pas;
  return { bas, haut, pas };
}
