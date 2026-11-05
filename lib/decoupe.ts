// Référentiels de la vente à la découpe.
//
// Une opération de découpe, ce n'est pas une vente avec plus d'étapes : c'est
// un autre métier posé sur le même immeuble. Les sept phases ci-dessous sont
// celles du dossier type — elles servent d'ossature au dashboard découpe, et
// engendreront les tâches datées à la livraison suivante.

export type Phase = {
  /** Rang, de 1 à 7. C'est ce rang qui est stocké sur l'opération. */
  n: number;
  cle: string;
  label: string;
  /** Ce qu'on fait pendant cette phase, en une ligne. */
  detail: string;
};

export const PHASES: Phase[] = [
  { n: 1, cle: "urbanisme", label: "Urbanisme", detail: "PLU, servitudes, droit de préemption urbain, faisabilité de la division." },
  { n: 2, cle: "dtg", label: "DTG & géomètre", detail: "Diagnostic technique global, relevés et métrés du géomètre." },
  { n: 3, cle: "edd", label: "EDD & règlement", detail: "État descriptif de division et règlement de copropriété." },
  { n: 4, cle: "syndic", label: "Syndic", detail: "Mise en place de la copropriété et désignation du syndic." },
  { n: 5, cle: "locataires", label: "Locataires", detail: "Congés, offres de vente, préemptions, négociations de départ." },
  { n: 6, cle: "pricing", label: "Diagnostics & pricing", detail: "Diagnostics par lot, grille de prix libre et occupé." },
  { n: 7, cle: "commercialisation", label: "Commercialisation & actes", detail: "Mise en vente des lots, compromis, actes authentiques." },
];

export const phase = (n?: number) => PHASES.find((p) => p.n === n) ?? PHASES[0];

/** Statuts d'une opération, du premier contact à la clôture. */
export const STATUTS_OPERATION = [
  "Prospection",
  "Mandat",
  "Montage",
  "Commercialisation",
  "Clôturée",
] as const;
export type StatutOperation = (typeof STATUTS_OPERATION)[number];

/** Les deux modes de travail. Le mode change le menu et le tableau de bord —
 *  jamais la fiche immeuble, qui reste unique et partagée. */
export const MODES = ["bloc", "decoupe"] as const;
export type Mode = (typeof MODES)[number];
export const estMode = (v: unknown): v is Mode => v === "bloc" || v === "decoupe";

/** Nom du cookie qui retient le mode. Lu par le serveur au rendu de la mise
 *  en page : le menu sort déjà dans le bon mode, sans clignotement. */
export const COOKIE_MODE = "fi_mode";

/** Avancement d'une opération, en pourcentage de phases franchies. */
export const avancement = (n?: number) =>
  Math.round((Math.min(PHASES.length, Math.max(1, n ?? 1)) / PHASES.length) * 100);
