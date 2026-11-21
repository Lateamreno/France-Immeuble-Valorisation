// Les modifications Google Ads que le BO sait faire (Acquisition, lot 2), et
// leurs garde-fous. Module PUR : il décrit, vérifie et traduit ; il n'appelle
// personne. L'application vit dans lib/bo/google-ads-ecriture.ts.
//
// Garde-fous (CLAUDE.md §7.6), les mêmes pour le BO et pour Claude :
//  · un PLAFOND de dépense par jour (somme des budgets des campagnes actives),
//    posé par la direction dans le BO ; tant qu'il n'est pas posé, aucune
//    hausse de budget ni réactivation de campagne ;
//  · jamais plus de ±30 points de modulation d'enchère, ni +30 % de budget,
//    en un seul changement ;
//  · pas de requête large (MAV, 10/11 : « un affichage que sur les termes
//    qu'on veut ») ;
//  · une annonce ne peut envoyer que vers france-immeuble.fr.

export type Correspondance = "exact" | "expression" | "large";

export type Changement =
  | { type: "exclure"; campagne: string; texte: string; correspondance: Correspondance }
  | { type: "retirer_exclusion"; ressource: string }
  | { type: "mot_cle_ajouter"; groupe: string; texte: string; correspondance: Correspondance }
  | { type: "mot_cle_statut"; ressource: string; statut: "ENABLED" | "PAUSED" | "REMOVED" }
  | { type: "campagne_statut"; ressource: string; statut: "ENABLED" | "PAUSED" }
  | { type: "budget"; campagne: string; euros: number }
  | { type: "zone_ajouter"; campagne: string; zone: string; exclue?: boolean; nom?: string }
  | { type: "zone_retirer"; ressource: string }
  | { type: "zone_modulation"; ressource: string; pourcent: number }
  | { type: "zone_mode"; campagne: string; mode: "PRESENCE" | "PRESENCE_OR_INTEREST" }
  | { type: "annonce_url"; ressource: string; url: string };

export const TYPES_CHANGEMENT = [
  "exclure", "retirer_exclusion", "mot_cle_ajouter", "mot_cle_statut", "campagne_statut",
  "budget", "zone_ajouter", "zone_retirer", "zone_modulation", "zone_mode", "annonce_url",
] as const;

/** Ce que les garde-fous ont besoin de savoir de l'état actuel du compte. */
export type EtatCompte = {
  compte: string;
  plafondJour: number | null;
  campagnes: { ressource: string; nom: string; statut: string; budgetJour: number; budgetRessource: string; budgetPartage: boolean; zoneMode: string }[];
  groupes: { ressource: string; nom: string; campagne: string }[];
  motsCles: { ressource: string; texte: string; correspondance: string; statut: string; groupe: string }[];
  exclusions: { ressource: string | null; texte: string; correspondance: string; portee: string }[];
  zones: { ressource: string; nom: string; campagne: string; exclue: boolean; modulation: number | null }[];
  annonces: { ressource: string; urls: string[]; groupe: string }[];
};

const MATCH: Record<Correspondance, string> = { exact: "EXACT", expression: "PHRASE", large: "BROAD" };
const MATCH_INV: Record<string, Correspondance> = { exact: "exact", expression: "expression", large: "large" };
export const SAUT_MAX = 0.3;

const eur = (v: number) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;
const kw = (texte: string, c: Correspondance) => (c === "exact" ? `[${texte}]` : c === "expression" ? `"${texte}"` : texte);
const pct = (m: number) => `${m >= 1 ? "+" : "−"}${Math.round(Math.abs(m - 1) * 100)} %`;

/** Le libellé d'un changement, tel qu'on le lit dans le journal. */
export function libelle(c: Changement, e: EtatCompte): string {
  const camp = (r: string) => e.campagnes.find((x) => x.ressource === r)?.nom ?? r;
  switch (c.type) {
    case "exclure": return `Exclure ${kw(c.texte, c.correspondance)} — ${camp(c.campagne)}`;
    case "retirer_exclusion": {
      const x = e.exclusions.find((y) => y.ressource === c.ressource);
      return `Retirer l'exclusion ${x ? kw(x.texte, MATCH_INV[x.correspondance] ?? "large") : c.ressource}${x ? ` — ${x.portee}` : ""}`;
    }
    case "mot_cle_ajouter": {
      const g = e.groupes.find((x) => x.ressource === c.groupe);
      return `Ajouter le mot-clé ${kw(c.texte, c.correspondance)} — ${g ? `${g.campagne} › ${g.nom}` : c.groupe}`;
    }
    case "mot_cle_statut": {
      const k = e.motsCles.find((x) => x.ressource === c.ressource);
      const verbe = c.statut === "ENABLED" ? "Réactiver" : c.statut === "PAUSED" ? "Mettre en pause" : "Supprimer";
      return `${verbe} le mot-clé ${k ? kw(k.texte, MATCH_INV[k.correspondance] ?? "large") : c.ressource}`;
    }
    case "campagne_statut": return `${c.statut === "ENABLED" ? "Activer" : "Mettre en pause"} la campagne ${camp(c.ressource)}`;
    case "budget": {
      const x = e.campagnes.find((y) => y.ressource === c.campagne);
      return `Budget de ${camp(c.campagne)} : ${x ? `${eur(x.budgetJour)} → ` : ""}${eur(c.euros)} par jour`;
    }
    case "zone_ajouter": return `${c.exclue ? "Exclure" : "Cibler"} la zone ${c.nom ?? c.zone} — ${camp(c.campagne)}`;
    case "zone_retirer": {
      const z = e.zones.find((x) => x.ressource === c.ressource);
      return `Retirer la zone ${z ? `${z.nom} — ${z.campagne}` : c.ressource}`;
    }
    case "zone_modulation": {
      const z = e.zones.find((x) => x.ressource === c.ressource);
      return `Enchère ${z ? `${z.nom} (${z.campagne})` : c.ressource} : ${z ? `${pct(z.modulation ?? 1)} → ` : ""}${pct(1 + c.pourcent / 100)}`;
    }
    case "zone_mode": return `${camp(c.campagne)} : ${c.mode === "PRESENCE" ? "seulement les personnes présentes dans la zone" : "présence ou intérêt pour la zone"}`;
    case "annonce_url": return `Page d'arrivée d'une annonce → ${c.url}`;
  }
}

const texteValide = (t: unknown) => typeof t === "string" && t.trim().length >= 2 && t.trim().length <= 80 && t.trim().split(/\s+/).length <= 10;

/** Le total des budgets des campagnes actives, après une série de changements. */
export function totalActif(budgets: Map<string, { budget: number; actif: boolean }>): number {
  let t = 0;
  for (const b of budgets.values()) if (b.actif) t += b.budget;
  return Math.round(t * 100) / 100;
}

export function budgetsDe(e: EtatCompte): Map<string, { budget: number; actif: boolean }> {
  return new Map(e.campagnes.map((c) => [c.ressource, { budget: c.budgetJour, actif: c.statut === "ENABLED" }]));
}

/**
 * Vérifie un changement contre l'état du compte. Rend le motif du refus, ou
 * null. `budgets` est la photographie des budgets APRÈS les changements déjà
 * acceptés de la série : le plafond se compte changement après changement,
 * et la fonction la met à jour quand elle accepte.
 */
export function refus(c: Changement, e: EtatCompte, budgets: Map<string, { budget: number; actif: boolean }>): string | null {
  const aNous = (r: unknown) => typeof r === "string" && r.startsWith(`customers/${e.compte}/`);
  const campagne = (r: string) => e.campagnes.find((x) => x.ressource === r);
  const plafond = e.plafondJour;
  if (!c || typeof c !== "object" || !TYPES_CHANGEMENT.includes(c.type)) return "Type de changement inconnu.";
  switch (c.type) {
    case "exclure":
    case "mot_cle_ajouter": {
      if (!texteValide(c.texte)) return "Texte invalide (2 à 80 caractères, 10 mots au plus).";
      if (!MATCH[c.correspondance]) return "Correspondance : exact, expression ou large.";
      if (c.type === "mot_cle_ajouter") {
        if (c.correspondance === "large") return "Pas de requête large (décision du 10/11) : exact ou expression seulement.";
        if (!e.groupes.some((g) => g.ressource === c.groupe)) return "Groupe d'annonces inconnu.";
        if (e.motsCles.some((k) => k.groupe === c.groupe && k.texte.toLowerCase() === c.texte.trim().toLowerCase() && k.correspondance === c.correspondance && k.statut !== "REMOVED")) return "Ce mot-clé existe déjà dans ce groupe.";
      } else {
        if (!campagne(c.campagne)) return "Campagne inconnue.";
        if (e.exclusions.some((x) => x.ressource && x.portee === campagne(c.campagne)?.nom && x.texte.toLowerCase() === c.texte.trim().toLowerCase() && x.correspondance === c.correspondance)) return "Déjà exclu sur cette campagne.";
      }
      return null;
    }
    case "retirer_exclusion": {
      const x = e.exclusions.find((y) => y.ressource === c.ressource);
      if (!x || !aNous(c.ressource)) return "Exclusion inconnue (une exclusion de liste partagée se retire dans Google Ads).";
      return null;
    }
    case "mot_cle_statut":
      if (!e.motsCles.some((k) => k.ressource === c.ressource)) return "Mot-clé inconnu.";
      if (!["ENABLED", "PAUSED", "REMOVED"].includes(c.statut)) return "Statut invalide.";
      return null;
    case "campagne_statut": {
      const x = campagne(c.ressource);
      if (!x) return "Campagne inconnue.";
      if (!["ENABLED", "PAUSED"].includes(c.statut)) return "Statut invalide.";
      const b = budgets.get(c.ressource)!;
      if (c.statut === "ENABLED" && !b.actif) {
        if (plafond == null) return "Posez d'abord le plafond de dépense par jour (page Acquisition) : sans lui, aucune campagne ne se réactive.";
        const apres = totalActif(budgets) + b.budget;
        if (apres > plafond) return `Le total des budgets actifs passerait à ${eur(apres)} par jour, au-delà du plafond de ${eur(plafond)}.`;
      }
      budgets.set(c.ressource, { ...b, actif: c.statut === "ENABLED" });
      return null;
    }
    case "budget": {
      const x = campagne(c.campagne);
      if (!x) return "Campagne inconnue.";
      if (x.budgetPartage) return "Budget partagé entre plusieurs campagnes : à modifier dans Google Ads.";
      if (!(typeof c.euros === "number" && c.euros >= 1 && c.euros <= 10_000)) return "Montant invalide (1 à 10 000 € par jour).";
      const b = budgets.get(c.campagne)!;
      if (c.euros > b.budget) {
        if (plafond == null) return "Posez d'abord le plafond de dépense par jour (page Acquisition) : sans lui, aucune hausse de budget.";
        if (b.budget > 0 && c.euros > b.budget * (1 + SAUT_MAX) + 0.005) return `Hausse limitée à +30 % en un changement (au plus ${eur(Math.floor(b.budget * (1 + SAUT_MAX) * 100) / 100)}).`;
        const apres = totalActif(budgets) - (b.actif ? b.budget : 0) + (b.actif ? c.euros : 0);
        if (apres > plafond) return `Le total des budgets actifs passerait à ${eur(apres)} par jour, au-delà du plafond de ${eur(plafond)}.`;
      }
      budgets.set(c.campagne, { ...b, budget: c.euros });
      return null;
    }
    case "zone_ajouter":
      if (!campagne(c.campagne)) return "Campagne inconnue.";
      if (!/^geoTargetConstants\/\d+$/.test(c.zone)) return "Zone invalide (geoTargetConstants/…).";
      return null;
    case "zone_retirer":
      if (!e.zones.some((z) => z.ressource === c.ressource)) return "Zone inconnue.";
      return null;
    case "zone_modulation": {
      const z = e.zones.find((x) => x.ressource === c.ressource);
      if (!z) return "Zone inconnue.";
      if (z.exclue) return "Une zone exclue n'a pas d'enchère.";
      if (typeof c.pourcent !== "number" || c.pourcent < -90 || c.pourcent > 900) return "Modulation invalide (−90 % à +900 %).";
      const avant = z.modulation ?? 1;
      const apres = 1 + c.pourcent / 100;
      if (Math.abs(apres - avant) > SAUT_MAX + 1e-9) return `Pas plus de 30 points d'écart en un changement (aujourd'hui ${pct(avant)}).`;
      return null;
    }
    case "zone_mode":
      if (!campagne(c.campagne)) return "Campagne inconnue.";
      if (!["PRESENCE", "PRESENCE_OR_INTEREST"].includes(c.mode)) return "Mode invalide.";
      return null;
    case "annonce_url": {
      if (!e.annonces.some((a) => a.ressource === c.ressource)) return "Annonce inconnue.";
      try {
        const u = new URL(c.url);
        if (u.protocol !== "https:" || !/(^|\.)france-immeuble\.fr$/.test(u.hostname)) return "Une annonce ne peut envoyer que vers https://…france-immeuble.fr.";
      } catch {
        return "Adresse invalide.";
      }
      return null;
    }
  }
}

export type Operation = { service: string; operation: Record<string, unknown> };

/** La traduction en opération Google Ads (API REST, noms en camelCase). */
export function operation(c: Changement, e: EtatCompte): Operation {
  switch (c.type) {
    case "exclure":
      return { service: "campaignCriteria", operation: { create: { campaign: c.campagne, negative: true, keyword: { text: c.texte.trim(), matchType: MATCH[c.correspondance] } } } };
    case "retirer_exclusion":
      return { service: c.ressource.includes("/adGroupCriteria/") ? "adGroupCriteria" : "campaignCriteria", operation: { remove: c.ressource } };
    case "mot_cle_ajouter":
      return { service: "adGroupCriteria", operation: { create: { adGroup: c.groupe, status: "ENABLED", keyword: { text: c.texte.trim(), matchType: MATCH[c.correspondance] } } } };
    case "mot_cle_statut":
      return c.statut === "REMOVED"
        ? { service: "adGroupCriteria", operation: { remove: c.ressource } }
        : { service: "adGroupCriteria", operation: { update: { resourceName: c.ressource, status: c.statut }, updateMask: "status" } };
    case "campagne_statut":
      return { service: "campaigns", operation: { update: { resourceName: c.ressource, status: c.statut }, updateMask: "status" } };
    case "budget":
      return { service: "campaignBudgets", operation: { update: { resourceName: e.campagnes.find((x) => x.ressource === c.campagne)?.budgetRessource ?? "", amountMicros: String(Math.round(c.euros * 100) * 10_000) }, updateMask: "amount_micros" } };
    case "zone_ajouter":
      return { service: "campaignCriteria", operation: { create: { campaign: c.campagne, negative: !!c.exclue, location: { geoTargetConstant: c.zone } } } };
    case "zone_retirer":
      return { service: "campaignCriteria", operation: { remove: c.ressource } };
    case "zone_modulation":
      return { service: "campaignCriteria", operation: { update: { resourceName: c.ressource, bidModifier: Math.round((1 + c.pourcent / 100) * 100) / 100 }, updateMask: "bid_modifier" } };
    case "zone_mode":
      return {
        service: "campaigns",
        operation: {
          update: { resourceName: c.campagne, geoTargetTypeSetting: { positiveGeoTargetType: c.mode } },
          updateMask: "geo_target_type_setting.positive_geo_target_type",
        },
      };
    case "annonce_url":
      return { service: "ads", operation: { update: { resourceName: c.ressource, finalUrls: [c.url] }, updateMask: "final_urls" } };
  }
}

/** Le geste qui défait un changement (bouton « Annuler » du journal), s'il existe. */
export function inverse(c: Changement, e: EtatCompte, creee?: string): Changement | null {
  switch (c.type) {
    case "exclure": return creee ? { type: "retirer_exclusion", ressource: creee } : null;
    case "retirer_exclusion": {
      const x = e.exclusions.find((y) => y.ressource === c.ressource);
      const camp = e.campagnes.find((y) => y.nom === x?.portee);
      return x && camp && c.ressource.includes("/campaignCriteria/")
        ? { type: "exclure", campagne: camp.ressource, texte: x.texte, correspondance: MATCH_INV[x.correspondance] ?? "exact" }
        : null;
    }
    case "mot_cle_ajouter": return creee ? { type: "mot_cle_statut", ressource: creee, statut: "REMOVED" } : null;
    case "mot_cle_statut": {
      const k = e.motsCles.find((y) => y.ressource === c.ressource);
      return k && c.statut !== "REMOVED" ? { type: "mot_cle_statut", ressource: c.ressource, statut: k.statut === "PAUSED" ? "PAUSED" : "ENABLED" } : null;
    }
    case "campagne_statut": {
      const x = e.campagnes.find((y) => y.ressource === c.ressource);
      return x ? { type: "campagne_statut", ressource: c.ressource, statut: x.statut === "PAUSED" ? "PAUSED" : "ENABLED" } : null;
    }
    case "budget": {
      const x = e.campagnes.find((y) => y.ressource === c.campagne);
      return x ? { type: "budget", campagne: c.campagne, euros: x.budgetJour } : null;
    }
    case "zone_ajouter": return creee ? { type: "zone_retirer", ressource: creee } : null;
    case "zone_retirer": return null;
    case "zone_modulation": {
      const z = e.zones.find((y) => y.ressource === c.ressource);
      return z ? { type: "zone_modulation", ressource: c.ressource, pourcent: Math.round(((z.modulation ?? 1) - 1) * 100) } : null;
    }
    case "zone_mode": {
      const x = e.campagnes.find((y) => y.ressource === c.campagne);
      return x && (x.zoneMode === "PRESENCE" || x.zoneMode === "PRESENCE_OR_INTEREST") ? { type: "zone_mode", campagne: c.campagne, mode: x.zoneMode } : null;
    }
    case "annonce_url": {
      const a = e.annonces.find((y) => y.ressource === c.ressource);
      return a?.urls[0] ? { type: "annonce_url", ressource: c.ressource, url: a.urls[0] } : null;
    }
  }
}
