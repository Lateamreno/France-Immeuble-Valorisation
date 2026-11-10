// Google Ads en lecture (Acquisition, lot 1 — MAV, 10/11).
//
// Deux façons d'entrer, la première trouvée sert :
//  1. OAUTH (la voie retenue le 10/11) : MAV clique « Connecter Google Ads »
//     sur la page Acquisition, avec le compte Google qui gère les annonces. Le
//     BO garde le jeton de renouvellement chiffré (lib/bo/google-ads-oauth.ts).
//     Raison : l'organisation Google interdit les clés de compte de service.
//  2. Compte de service (GOOGLE_ADS_SA_JSON), si un jour la clé existe.
// Depuis le 9 septembre 2026, Google a retiré les jetons développeur : l'accès
// à l'API passe par le projet Cloud (niveau « Explorer »). Ce module ne sait
// QUE lire, et rien ici n'écrit chez Google. Les changements viendront au
// lot 2, par « À valider », jamais d'office.
//
// Variables (posées par MAV dans Vercel, jamais dans la conversation) :
//   GOOGLE_ADS_OAUTH_CLIENT_ID / _SECRET  le client OAuth du projet Cloud
//   GOOGLE_ADS_SA_JSON            (autre voie) la clé JSON du compte de service
//   GOOGLE_ADS_CUSTOMER_ID        le compte lu (avec ou sans tirets)
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID  le compte administrateur (MCC), s'il y en a un
//   GOOGLE_ADS_API_VERSION        v26 par défaut
//
// Module serveur seulement (node:crypto) : jamais importé par un composant client.
import { createSign } from "node:crypto";
import { clientOAuth, lireConnexion } from "@/lib/bo/google-ads-oauth";

const VERSION = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v26";
const chiffres = (v?: string) => (v ?? "").replace(/\D/g, "");

type CleCompteService = { client_email: string; private_key: string; token_uri?: string };

export type EtatAds =
  | { pret: true; compte: string; mcc?: string; identite: string; mode: "oauth" | "service" }
  /** `connectable` : le client OAuth est posé, il ne manque que le clic « Connecter ». */
  | { pret: false; manque: string[]; erreur?: string; connectable: boolean };

function cle(): CleCompteService | { erreur: string } | null {
  const brut = process.env.GOOGLE_ADS_SA_JSON?.trim();
  if (!brut) return null;
  try {
    const j = JSON.parse(brut) as Partial<CleCompteService>;
    if (!j.client_email || !j.private_key) return { erreur: "La clé JSON ne contient ni client_email ni private_key." };
    return { client_email: j.client_email, private_key: j.private_key, token_uri: j.token_uri };
  } catch {
    return { erreur: "GOOGLE_ADS_SA_JSON n'est pas un JSON lisible : collez le fichier entier, accolades comprises." };
  }
}

/* La connexion OAuth est relue en base au plus une fois par minute. */
let connexionEnCache: { quand: number; valeur: Awaited<ReturnType<typeof lireConnexion>> } | null = null;
async function connexion() {
  if (!connexionEnCache || Date.now() - connexionEnCache.quand > 60_000) {
    connexionEnCache = { quand: Date.now(), valeur: await lireConnexion() };
  }
  return connexionEnCache.valeur;
}
/** Après « Connecter » ou « Déconnecter » : oublier ce qui était en mémoire. */
export function oublierCacheAds() {
  connexionEnCache = null;
  jetonEnCache = null;
}

/** Ce qui manque pour lire Google Ads — rien ne part chez Google ici. */
export async function etatAds(): Promise<EtatAds> {
  const compte = chiffres(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const mcc = chiffres(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) || undefined;
  const client = clientOAuth();
  const k = cle();
  const manque: string[] = [];
  if (!client && !k) manque.push("GOOGLE_ADS_OAUTH_CLIENT_ID", "GOOGLE_ADS_OAUTH_CLIENT_SECRET");
  if (!compte) manque.push("GOOGLE_ADS_CUSTOMER_ID");
  else if (compte.length !== 10) return { pret: false, manque: [], erreur: "GOOGLE_ADS_CUSTOMER_ID doit compter dix chiffres.", connectable: !!client };
  if (client) {
    const c = await connexion();
    if (c && compte) return { pret: true, compte, mcc, identite: c.email ?? "compte Google connecté", mode: "oauth" };
    if (!k) return { pret: false, manque, connectable: true };
  }
  if (k && "erreur" in k) return { pret: false, manque, erreur: k.erreur, connectable: !!client };
  if (manque.length || !k) return { pret: false, manque, connectable: !!client };
  return { pret: true, compte, mcc, identite: k.client_email, mode: "service" };
}

/* ------------------------------------------------------------ Jeton */

let jetonEnCache: { valeur: string; expire: number } | null = null;
/* Les lectures partent en parallèle : un seul échange de jeton pour toutes. */
let jetonEnCours: Promise<string> | null = null;

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

async function jeton(mode: "oauth" | "service"): Promise<string> {
  if (jetonEnCache && jetonEnCache.expire > Date.now() + 60_000) return jetonEnCache.valeur;
  jetonEnCours ??= (mode === "oauth" ? jetonOAuth() : jetonService()).finally(() => { jetonEnCours = null; });
  return jetonEnCours;
}

async function echanger(url: string, corps: Record<string, string>, quoi: string): Promise<string> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corps),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw new Error(`${quoi} : l'autorisation a expiré ou a été retirée. Cliquez « Reconnecter Google Ads ».`);
    throw new Error(`${quoi} : ${j.error_description ?? j.error ?? r.status}`);
  }
  jetonEnCache = { valeur: j.access_token, expire: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

/** Jeton d'accès renouvelé depuis la connexion « Connecter Google Ads ». */
async function jetonOAuth(): Promise<string> {
  const client = clientOAuth();
  const c = await connexion();
  if (!client || !c) throw new Error("Google Ads n'est pas connecté.");
  return echanger("https://oauth2.googleapis.com/token", {
    grant_type: "refresh_token", refresh_token: c.refresh, client_id: client.id, client_secret: client.secret,
  }, "Google refuse la connexion");
}

/** Jeton du compte de service (JWT signé RS256, échangé chez Google). */
async function jetonService(): Promise<string> {
  const k = cle();
  if (!k || "erreur" in k) throw new Error(k && "erreur" in k ? k.erreur : "GOOGLE_ADS_SA_JSON absente.");
  const aud = k.token_uri || "https://oauth2.googleapis.com/token";
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corps = b64url(JSON.stringify({
    iss: k.client_email,
    scope: "https://www.googleapis.com/auth/adwords",
    aud,
    iat: maintenant,
    exp: maintenant + 3600,
  }));
  const signe = createSign("RSA-SHA256").update(`${entete}.${corps}`).sign(k.private_key.replace(/\\n/g, "\n"));
  return echanger(aud, {
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: `${entete}.${corps}.${b64url(signe)}`,
  }, "Google refuse le compte de service");
}

/* ------------------------------------------------------------- GAQL */

type Ligne = Record<string, Record<string, unknown> | undefined>;

/** Le message d'erreur utile d'une réponse Google Ads, en clair. */
function erreurGoogle(statut: number, corps: unknown): string {
  const lot = Array.isArray(corps) ? corps[0] : corps;
  const e = (lot as { error?: { message?: string; status?: string; details?: { errors?: { message?: string; errorCode?: Record<string, string> }[] }[] } })?.error;
  const detail = e?.details?.flatMap((d) => d.errors ?? [])[0];
  const code = detail?.errorCode ? Object.values(detail.errorCode)[0] : undefined;
  const texte = detail?.message ?? e?.message ?? `HTTP ${statut}`;
  if (code === "USER_PERMISSION_DENIED" || code === "CUSTOMER_NOT_ENABLED") {
    return `${texte} — le compte connecté a-t-il bien accès à ce compte Google Ads (et faut-il un GOOGLE_ADS_LOGIN_CUSTOMER_ID pour un compte administrateur) ?`;
  }
  if (code === "DEVELOPER_TOKEN_NOT_APPROVED" || /test account/i.test(texte)) {
    return `${texte} — l'accès « Explorer » n'est pas encore accordé au projet Google Cloud.`;
  }
  if (statut === 403 && /has not been used|is disabled/i.test(texte)) {
    return `${texte} — activez « Google Ads API » dans le projet Google Cloud (API et services › Bibliothèque).`;
  }
  return code ? `${texte} (${code})` : texte;
}

/** Une requête GAQL en flux : toutes les lignes, toutes les pages. */
export async function gaql(requete: string): Promise<Ligne[]> {
  const e = await etatAds();
  if (!e.pret) throw new Error("Google Ads n'est pas branché.");
  const r = await fetch(`https://googleads.googleapis.com/${VERSION}/customers/${e.compte}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await jeton(e.mode)}`,
      "Content-Type": "application/json",
      ...(e.mcc ? { "login-customer-id": e.mcc } : {}),
    },
    body: JSON.stringify({ query: requete }),
    cache: "no-store",
  });
  const corps = await r.json().catch(() => null);
  if (!r.ok) throw new Error(erreurGoogle(r.status, corps));
  return (Array.isArray(corps) ? corps : []).flatMap((lot: { results?: Ligne[] }) => lot.results ?? []);
}

/**
 * Une écriture chez Google (lot 2) : `service` = campaignCriteria,
 * adGroupCriteria, campaigns, campaignBudgets, ads. Ne passe QUE par
 * lib/bo/google-ads-ecriture.ts, qui garde, applique et journalise.
 * `essai` = validateOnly : Google vérifie sans rien changer.
 */
export async function muter(service: string, operations: unknown[], essai = false): Promise<string[]> {
  const e = await etatAds();
  if (!e.pret) throw new Error("Google Ads n'est pas branché.");
  const r = await fetch(`https://googleads.googleapis.com/${VERSION}/customers/${e.compte}/${service}:mutate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await jeton(e.mode)}`,
      "Content-Type": "application/json",
      ...(e.mcc ? { "login-customer-id": e.mcc } : {}),
    },
    body: JSON.stringify({ operations, validateOnly: essai }),
    cache: "no-store",
  });
  const corps = await r.json().catch(() => null);
  if (!r.ok) throw new Error(erreurGoogle(r.status, corps));
  return ((corps as { results?: { resourceName?: string }[] } | null)?.results ?? []).map((x) => x.resourceName ?? "");
}

/* ------------------------------------------------------- Lecture */

const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v ? Number(v) : 0) || 0;
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const euros = (micros: unknown) => n(micros) / 1_000_000;
const o = (v: unknown) => (v ?? {}) as Record<string, unknown>;

export type Periode = { du: string; au: string; jours: number };

/* Chaque objet porte sa `ressource` (le nom Google, ex. customers/1/campaigns/2) :
   c'est elle que vise une modification. */
export type Campagne = {
  id: string; ressource: string; nom: string; statut: string; canal: string;
  budgetJour: number; budgetRessource: string; budgetPartage: boolean;
  /** PRESENCE = seulement les gens qui sont dans la zone ; PRESENCE_OR_INTEREST = aussi ceux qui s'y intéressent. */
  zoneMode: string;
  impressions: number; clics: number; cout: number; conversions: number;
};
export type Groupe = { ressource: string; nom: string; campagne: string; campagneRessource: string; statut: string };
export type Annonce = { ressource: string; groupe: string; campagne: string; statut: string; type: string; urls: string[]; titres: string[] };
export type Jour = { date: string; cout: number; clics: number; conversions: number };
export type TermeRecherche = { terme: string; statut: string; campagne: string; campagneRessource: string; impressions: number; clics: number; cout: number; conversions: number };
export type MotCle = {
  ressource: string; texte: string; correspondance: string; statut: string;
  campagne: string; groupe: string; groupeRessource: string; qualite: number | null;
  clics: number; cout: number; conversions: number;
};
export type Zone = { ressource: string; campagne: string; campagneRessource: string; nom: string; type: string; exclue: boolean; modulation: number | null };
export type ZonePerf = { nom: string; clics: number; cout: number; conversions: number };
/** `ressource` absente : exclusion d'une liste partagée, à modifier dans Google Ads. */
export type Exclusion = { ressource: string | null; texte: string; correspondance: string; portee: string };
export type PageArrivee = { url: string; impressions: number; clics: number; cout: number; conversions: number };

export type LectureAds = {
  compte: { nom: string; devise: string; fuseau: string; id: string } | null;
  campagnes: Campagne[];
  groupes: Groupe[];
  annonces: Annonce[];
  jours: Jour[];
  termes: TermeRecherche[];
  motsCles: MotCle[];
  zones: Zone[];
  zonesPerf: ZonePerf[];
  exclusions: Exclusion[];
  pages: PageArrivee[];
  /** Une section qui n'a pas pu être lue n'empêche pas les autres. */
  erreurs: Record<string, string>;
  lu: string;
};

export const CORRESPONDANCE: Record<string, string> = { EXACT: "exact", PHRASE: "expression", BROAD: "large" };

async function noms(ressources: string[]): Promise<Map<string, { nom: string; type: string }>> {
  const uniques = [...new Set(ressources.filter(Boolean))];
  const out = new Map<string, { nom: string; type: string }>();
  for (let i = 0; i < uniques.length; i += 200) {
    const lot = uniques.slice(i, i + 200).map((r) => `'${r.replace(/'/g, "")}'`).join(", ");
    const rows = await gaql(`SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${lot})`);
    for (const r of rows) {
      const g = o(r.geoTargetConstant);
      /* « Hauts-de-Seine,Ile-de-France,France » → « Hauts-de-Seine, Ile-de-France » */
      const nom = (s(g.canonicalName) || s(g.name)).split(",").filter((x) => x && x !== "France").join(", ");
      out.set(s(g.resourceName), { nom, type: s(g.targetType) });
    }
  }
  return out;
}

/** Les zones Google dont le nom contient `q` (France), pour en ajouter une. */
export async function chercherZonesGoogle(q: string): Promise<{ ressource: string; nom: string; type: string }[]> {
  const t = q.trim().replace(/['\\%]/g, "");
  if (t.length < 2) return [];
  const rows = await gaql(`SELECT geo_target_constant.resource_name, geo_target_constant.canonical_name, geo_target_constant.target_type, geo_target_constant.status FROM geo_target_constant WHERE geo_target_constant.country_code = 'FR' AND geo_target_constant.name LIKE '%${t}%' LIMIT 25`);
  return rows.map((r) => {
    const g = o(r.geoTargetConstant);
    return { ressource: s(g.resourceName), nom: s(g.canonicalName).split(",").filter((x) => x && x !== "France").join(", "), type: s(g.targetType), statut: s(g.status) };
  }).filter((z) => z.statut !== "REMOVAL_PLANNED").map((z) => ({ ressource: z.ressource, nom: z.nom, type: z.type }));
}

const cache = new Map<string, { quand: number; valeur: LectureAds }>();

/** Après une modification : la prochaine lecture repart de Google. */
export function viderCacheLecture() {
  cache.clear();
}

/** Tout ce que montre la page, lu en une fois (10 minutes de cache par période). */
export async function lireAds(p: Periode, frais = false): Promise<LectureAds> {
  const cleCache = `${p.du}|${p.au}`;
  const deja = cache.get(cleCache);
  if (!frais && deja && Date.now() - deja.quand < 10 * 60_000) return deja.valeur;

  const quand = `segments.date BETWEEN '${p.du}' AND '${p.au}'`;
  const erreurs: Record<string, string> = {};
  const essai = async <T,>(section: string, f: () => Promise<T>, defaut: T): Promise<T> => {
    try {
      return await f();
    } catch (e) {
      erreurs[section] = e instanceof Error ? e.message : String(e);
      return defaut;
    }
  };

  /* Deux lectures par objet : sa STRUCTURE (sans date, pour voir aussi ce qui
     n'a rien dépensé) et ses CHIFFRES sur la période, recollés par ressource. */
  const [compte, structCampagnes, chiffresCampagnes, groupes, annonces, jours, termes, structMotsCles, chiffresMotsCles, zonesBrutes, zonesPerfBrutes, exclusions, pages] = await Promise.all([
    essai("compte", async () => {
      const [r] = await gaql("SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer");
      const c = o(r?.customer);
      return { id: s(c.id), nom: s(c.descriptiveName), devise: s(c.currencyCode), fuseau: s(c.timeZone) };
    }, null),
    essai("campagnes", () => gaql(
      "SELECT campaign.resource_name, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.geo_target_type_setting.positive_geo_target_type, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED'",
    ), [] as Ligne[]),
    essai("campagnes", () => gaql(
      `SELECT campaign.resource_name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${quand} AND campaign.status != 'REMOVED'`,
    ), [] as Ligne[]),
    essai("groupes", async () => (await gaql(
      "SELECT ad_group.resource_name, ad_group.name, ad_group.status, campaign.name, campaign.resource_name FROM ad_group WHERE ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'",
    )).map((r): Groupe => ({
      ressource: s(r.adGroup?.resourceName), nom: s(r.adGroup?.name), statut: s(r.adGroup?.status),
      campagne: s(r.campaign?.name), campagneRessource: s(r.campaign?.resourceName),
    })), [] as Groupe[]),
    essai("annonces", async () => (await gaql(
      "SELECT ad_group_ad.ad.resource_name, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.status, ad_group.name, campaign.name FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND campaign.status != 'REMOVED'",
    )).map((r): Annonce => {
      const ad = o(o(r.adGroupAd).ad);
      return {
        ressource: s(ad.resourceName), type: s(ad.type), statut: s(o(r.adGroupAd).status),
        urls: (Array.isArray(ad.finalUrls) ? ad.finalUrls : []).map(s),
        titres: (Array.isArray(o(ad.responsiveSearchAd).headlines) ? (o(ad.responsiveSearchAd).headlines as unknown[]) : []).map((h) => s(o(h).text)).filter(Boolean),
        groupe: s(r.adGroup?.name), campagne: s(r.campaign?.name),
      };
    }), [] as Annonce[]),
    essai("jours", async () => (await gaql(
      `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions FROM customer WHERE ${quand}`,
    )).map((r): Jour => ({ date: s(r.segments?.date), cout: euros(r.metrics?.costMicros), clics: n(r.metrics?.clicks), conversions: n(r.metrics?.conversions) }))
      .sort((a, b) => a.date.localeCompare(b.date)), [] as Jour[]),
    essai("termes", async () => (await gaql(
      `SELECT search_term_view.search_term, search_term_view.status, campaign.name, campaign.resource_name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE ${quand} ORDER BY metrics.cost_micros DESC LIMIT 200`,
    )).map((r): TermeRecherche => ({
      terme: s(r.searchTermView?.searchTerm), statut: s(r.searchTermView?.status), campagne: s(r.campaign?.name), campagneRessource: s(r.campaign?.resourceName),
      impressions: n(r.metrics?.impressions), clics: n(r.metrics?.clicks), cout: euros(r.metrics?.costMicros), conversions: n(r.metrics?.conversions),
    })), [] as TermeRecherche[]),
    essai("motsCles", () => gaql(
      "SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, campaign.name, ad_group.name, ad_group.resource_name FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED'",
    ), [] as Ligne[]),
    essai("motsCles", () => gaql(
      `SELECT ad_group_criterion.resource_name, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE ${quand}`,
    ), [] as Ligne[]),
    essai("zones", () => gaql(
      "SELECT campaign.name, campaign.resource_name, campaign_criterion.resource_name, campaign_criterion.type, campaign_criterion.location.geo_target_constant, campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units, campaign_criterion.proximity.address.city_name, campaign_criterion.negative, campaign_criterion.bid_modifier FROM campaign_criterion WHERE campaign_criterion.type IN ('LOCATION', 'PROXIMITY') AND campaign.status != 'REMOVED'",
    ), [] as Ligne[]),
    essai("zonesPerf", () => gaql(
      `SELECT segments.geo_target_department, metrics.clicks, metrics.cost_micros, metrics.conversions FROM geographic_view WHERE ${quand}`,
    ), [] as Ligne[]),
    essai("exclusions", async () => {
      const [camp, groupe, listes] = await Promise.all([
        gaql("SELECT campaign.name, campaign_criterion.resource_name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE AND campaign.status != 'REMOVED'"),
        gaql("SELECT campaign.name, ad_group.name, ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = TRUE AND ad_group_criterion.status != 'REMOVED'"),
        gaql("SELECT shared_set.name, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.status = 'ENABLED'"),
      ]);
      const m = (k: unknown) => CORRESPONDANCE[s(o(k).matchType)] ?? "";
      return [
        ...listes.map((r): Exclusion => ({ ressource: null, texte: s(o(r.sharedCriterion?.keyword).text), correspondance: m(r.sharedCriterion?.keyword), portee: `Liste « ${s(r.sharedSet?.name)} »` })),
        ...camp.map((r): Exclusion => ({ ressource: s(r.campaignCriterion?.resourceName), texte: s(o(r.campaignCriterion?.keyword).text), correspondance: m(r.campaignCriterion?.keyword), portee: s(r.campaign?.name) })),
        ...groupe.map((r): Exclusion => ({ ressource: s(r.adGroupCriterion?.resourceName), texte: s(o(r.adGroupCriterion?.keyword).text), correspondance: m(r.adGroupCriterion?.keyword), portee: `${s(r.campaign?.name)} › ${s(r.adGroup?.name)}` })),
      ].filter((x) => x.texte);
    }, [] as Exclusion[]),
    essai("pages", async () => (await gaql(
      `SELECT landing_page_view.unexpanded_final_url, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM landing_page_view WHERE ${quand} ORDER BY metrics.clicks DESC LIMIT 50`,
    )).map((r): PageArrivee => ({
      url: s(r.landingPageView?.unexpandedFinalUrl),
      impressions: n(r.metrics?.impressions), clics: n(r.metrics?.clicks), cout: euros(r.metrics?.costMicros), conversions: n(r.metrics?.conversions),
    })), [] as PageArrivee[]),
  ]);

  const chiffresC = new Map(chiffresCampagnes.map((r) => [s(r.campaign?.resourceName), o(r.metrics)]));
  const campagnes = structCampagnes.map((r): Campagne => {
    const c = o(r.campaign);
    const b = o(r.campaignBudget);
    const m = chiffresC.get(s(c.resourceName)) ?? {};
    return {
      id: s(c.id), ressource: s(c.resourceName), nom: s(c.name), statut: s(c.status), canal: s(c.advertisingChannelType),
      budgetJour: euros(b.amountMicros), budgetRessource: s(b.resourceName), budgetPartage: b.explicitlyShared === true,
      zoneMode: s(o(c.geoTargetTypeSetting).positiveGeoTargetType),
      impressions: n(m.impressions), clics: n(m.clicks), cout: euros(m.costMicros), conversions: n(m.conversions),
    };
  }).sort((a, b) => b.cout - a.cout || a.nom.localeCompare(b.nom));

  const chiffresK = new Map(chiffresMotsCles.map((r) => [s(r.adGroupCriterion?.resourceName), o(r.metrics)]));
  const motsCles = structMotsCles.map((r): MotCle => {
    const k = o(r.adGroupCriterion);
    const kw = o(k.keyword);
    const q = o(k.qualityInfo);
    const m = chiffresK.get(s(k.resourceName)) ?? {};
    return {
      ressource: s(k.resourceName), texte: s(kw.text), correspondance: CORRESPONDANCE[s(kw.matchType)] ?? s(kw.matchType).toLowerCase(),
      statut: s(k.status), campagne: s(r.campaign?.name), groupe: s(r.adGroup?.name), groupeRessource: s(r.adGroup?.resourceName),
      qualite: q.qualityScore == null ? null : n(q.qualityScore),
      clics: n(m.clicks), cout: euros(m.costMicros), conversions: n(m.conversions),
    };
  }).sort((a, b) => b.cout - a.cout || a.texte.localeCompare(b.texte));

  /* Les zones arrivent en identifiants Google (geoTargetConstants/1006094) :
     un seul aller-retour pour leur donner un nom. */
  const geo = await essai("zones", () => noms([
    ...zonesBrutes.map((r) => s(o(r.campaignCriterion?.location).geoTargetConstant)),
    ...zonesPerfBrutes.map((r) => s(r.segments?.geoTargetDepartment)),
  ]), new Map<string, { nom: string; type: string }>());

  const zones = zonesBrutes.map((r): Zone => {
    const c = o(r.campaignCriterion);
    const prox = c.proximity ? o(c.proximity) : undefined;
    const ressource = s(o(c.location).geoTargetConstant);
    const g = geo.get(ressource);
    const nom = prox
      ? `${s(o(prox.address).cityName) || "Point"} + ${n(prox.radius)} ${s(prox.radiusUnits) === "MILES" ? "mi" : "km"}`
      : g?.nom ?? ressource;
    const mod = c.bidModifier == null ? null : n(c.bidModifier);
    return {
      ressource: s(c.resourceName), campagne: s(r.campaign?.name), campagneRessource: s(r.campaign?.resourceName),
      nom, type: prox ? "Rayon" : g?.type ?? "", exclue: c.negative === true, modulation: mod,
    };
  });

  const parDep = new Map<string, ZonePerf>();
  for (const r of zonesPerfBrutes) {
    const res = s(r.segments?.geoTargetDepartment);
    const nom = geo.get(res)?.nom.split(",")[0] ?? (res || "Non déterminé");
    const z = parDep.get(nom) ?? { nom, clics: 0, cout: 0, conversions: 0 };
    z.clics += n(r.metrics?.clicks); z.cout += euros(r.metrics?.costMicros); z.conversions += n(r.metrics?.conversions);
    parDep.set(nom, z);
  }

  const valeur: LectureAds = {
    compte, campagnes, groupes, annonces, jours, termes, motsCles, zones,
    zonesPerf: [...parDep.values()].sort((a, b) => b.cout - a.cout),
    exclusions, pages, erreurs, lu: new Date().toISOString(),
  };
  cache.set(cleCache, { quand: Date.now(), valeur });
  return valeur;
}
