// Les quatre cibles d'un immeuble — les mêmes que les quatre types de
// recherche d'acquéreur (Investisseur, Marchand de biens, Patrimonial,
// Promoteur). Une seule source pour l'estimation (page 3) et la fiche du bien
// (retour #591), avec leurs pictos. Les valeurs sont celles que le BO range
// dans `Cibles`, et que le site reçoit traduites en type d'opération
// (lib/diffusion.ts, `operationsDuBien`).
export const CIBLES_EST = [
  { valeur: "Investisseur", label: "Locatif", picto: <><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></> },
  { valeur: "Patrimonial", label: "Patrimonial", picto: <><path d="m12 3 2.5 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.4 6.8 19.2l1.1-5.9L3.6 9.2l5.9-.8z" /></> },
  { valeur: "Marchand de biens", label: "Marchand", picto: <><path d="m14.5 5.5 4 4-8.5 8.5H6v-4z" /><path d="M13 7 17 11" /></> },
  { valeur: "Promoteur", label: "Promotion", picto: <><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></> },
] as const;
