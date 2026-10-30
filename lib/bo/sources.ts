// Sources d'une visite (retour #522) : la liste de base, à laquelle s'ajoutent
// celles que l'agent a acceptées depuis « Autre » (rangées dans les réglages
// de l'agence, `sourcesVisite`).
export const SOURCES_VISITE_BASE = [
  "Offmarket", "Plein Bail", "SeLoger", "LeBonCoin", "Facebook", "Interagence",
  "Relationnel", "Prospection",
];

/** « facebook » et « Facebook » sont la même source. */
export const memeSource = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
