// Acquisition — l'origine d'un formulaire du site (module pur, sans lecture).
//
// Le site joint à chaque formulaire `attribution` : l'identifiant du clic
// Google (gclid, ou gbraid / wbraid sur iPhone), les paramètres UTM, la page
// d'arrivée et le site d'où venait le visiteur (contrat site §18). Le BO en
// déduit un canal, puis — parce qu'il suit déjà le formulaire jusqu'au mandat —
// le coût d'un formulaire et le coût d'un mandat.

export type Origine = {
  gclid?: string | null; utm_source?: string | null; utm_medium?: string | null;
  utm_campaign?: string | null; utm_term?: string | null; utm_content?: string | null;
  landing?: string | null; referrer?: string | null;
};

export type Canal = "Google Ads" | "Recherche naturelle" | "Réseaux sociaux" | "E-mail" | "Autre site" | "Direct ou inconnu";
export const CANAUX: Canal[] = ["Google Ads", "Recherche naturelle", "Réseaux sociaux", "E-mail", "Autre site", "Direct ou inconnu"];

const bas = (v?: string | null) => (v ?? "").trim().toLowerCase();

function domaine(url?: string | null): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

export function canalDe(o: Origine): Canal {
  const src = bas(o.utm_source);
  const med = bas(o.utm_medium);
  if (o.gclid || (/google|adwords/.test(src) && /cpc|ppc|paid|ads/.test(med))) return "Google Ads";
  if (/social|paid_social/.test(med) || /facebook|instagram|linkedin|fb|ig|meta|tiktok|twitter|x\.com/.test(src)) return "Réseaux sociaux";
  if (/e-?mail|newsletter|sms|rcs/.test(med) || /sendgrid|mailing|mailingvox|newsletter/.test(src)) return "E-mail";
  const ref = domaine(o.referrer);
  if (/(^|\.)google\.|(^|\.)bing\.|duckduckgo|qwant|ecosia|yahoo\./.test(ref) || /organic/.test(med)) return "Recherche naturelle";
  if (/facebook|instagram|linkedin|t\.co$/.test(ref)) return "Réseaux sociaux";
  if (ref && !/france-immeuble/.test(ref)) return "Autre site";
  return "Direct ou inconnu";
}

/** Le chemin de la page d'arrivée, sans domaine ni paramètres. */
export function cheminArrivee(url?: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url, "https://www.france-immeuble.fr");
    return u.pathname || "/";
  } catch {
    return url.split("?")[0];
  }
}

/** Les types d'envoi du site qui sont un formulaire, pas une mise à jour. */
export const TYPES_FORMULAIRE: Record<string, string> = {
  estimation: "Estimation",
  recherche_acquereur: "Recherche",
  contact: "Contact",
  compte: "Compte créé",
  rendez_vous: "Rendez-vous",
  offre_acquereur: "Offre",
};

/** Période lue : 7, 30 ou 90 jours pleins, jusqu'à hier inclus (heure de Paris). */
export function periodeDe(jours: number): { du: string; au: string; jours: number } {
  const j = [7, 30, 90].includes(jours) ? jours : 30;
  const paris = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const hier = new Date(Date.now() - 86_400_000);
  const debut = new Date(hier.getTime() - (j - 1) * 86_400_000);
  return { du: paris(debut), au: paris(hier), jours: j };
}
