// Google Ads en lecture (Acquisition, lot 1 — MAV, 10/11).
//
// Le BO lit le compte avec un COMPTE DE SERVICE Google Cloud : depuis le
// 9 septembre 2026, Google a retiré les jetons développeur, l'accès à l'API
// passe par le projet Cloud (niveau « Explorer », 2 880 opérations par jour).
// Le compte de service a « Lecture seule » dans Google Ads : ce module ne sait
// QUE lire, et rien ici n'écrit chez Google. Les changements viendront au
// lot 2, par « À valider », jamais d'office.
//
// Variables (posées par MAV dans Vercel, jamais dans la conversation) :
//   GOOGLE_ADS_SA_JSON            la clé JSON du compte de service, entière
//   GOOGLE_ADS_CUSTOMER_ID        le compte lu (avec ou sans tirets)
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID  le compte administrateur (MCC), s'il y en a un
//   GOOGLE_ADS_API_VERSION        v26 par défaut
//
// Module serveur seulement (node:crypto) : jamais importé par un composant client.
import { createSign } from "node:crypto";

const VERSION = process.env.GOOGLE_ADS_API_VERSION?.trim() || "v26";
const chiffres = (v?: string) => (v ?? "").replace(/\D/g, "");

type CleCompteService = { client_email: string; private_key: string; token_uri?: string };

export type EtatAds =
  | { pret: true; compte: string; mcc?: string; identite: string }
  | { pret: false; manque: string[]; erreur?: string };

function cle(): CleCompteService | { erreur: string } | null {
  const brut = process.env.GOOGLE_ADS_SA_JSON?.trim();
  if (!brut) return null;
  try {
    const j = JSON.parse(brut) as Partial<CleCompteService>;
    if (!j.client_email || !j.private_key) return { erreur: "La clé JSON ne contient ni client_email ni private_key : est-ce bien le fichier de l'étape 5 ?" };
    return { client_email: j.client_email, private_key: j.private_key, token_uri: j.token_uri };
  } catch {
    return { erreur: "GOOGLE_ADS_SA_JSON n'est pas un JSON lisible : collez le fichier entier, accolades comprises." };
  }
}

/** Ce qui manque pour lire Google Ads — rien ne part chez Google ici. */
export function etatAds(): EtatAds {
  const k = cle();
  const compte = chiffres(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const manque: string[] = [];
  if (!k) manque.push("GOOGLE_ADS_SA_JSON");
  if (!compte) manque.push("GOOGLE_ADS_CUSTOMER_ID");
  else if (compte.length !== 10) return { pret: false, manque: [], erreur: "GOOGLE_ADS_CUSTOMER_ID doit compter dix chiffres." };
  if (k && "erreur" in k) return { pret: false, manque, erreur: k.erreur };
  if (manque.length || !k) return { pret: false, manque };
  const mcc = chiffres(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) || undefined;
  return { pret: true, compte, mcc, identite: k.client_email };
}

/* ------------------------------------------------------------ Jeton */

let jetonEnCache: { valeur: string; expire: number } | null = null;
/* Les lectures partent en parallèle : un seul échange de jeton pour toutes. */
let jetonEnCours: Promise<string> | null = null;

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** Jeton OAuth du compte de service (JWT signé RS256, échangé chez Google). */
async function jeton(): Promise<string> {
  if (jetonEnCache && jetonEnCache.expire > Date.now() + 60_000) return jetonEnCache.valeur;
  jetonEnCours ??= nouveauJeton().finally(() => { jetonEnCours = null; });
  return jetonEnCours;
}

async function nouveauJeton(): Promise<string> {
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
  const r = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${entete}.${corps}.${b64url(signe)}`,
    }),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google refuse le compte de service : ${j.error_description ?? j.error ?? r.status}`);
  jetonEnCache = { valeur: j.access_token, expire: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
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
    return `${texte} — le compte de service a-t-il bien reçu l'accès dans Google Ads (Administration › Accès et sécurité) ?`;
  }
  if (code === "DEVELOPER_TOKEN_NOT_APPROVED" || /test account/i.test(texte)) {
    return `${texte} — l'accès « Explorer » n'est pas encore accordé au projet Google Cloud.`;
  }
  return code ? `${texte} (${code})` : texte;
}

/** Une requête GAQL en flux : toutes les lignes, toutes les pages. */
export async function gaql(requete: string): Promise<Ligne[]> {
  const e = etatAds();
  if (!e.pret) throw new Error("Google Ads n'est pas branché.");
  const r = await fetch(`https://googleads.googleapis.com/${VERSION}/customers/${e.compte}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await jeton()}`,
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

/* ------------------------------------------------------- Lecture */

const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v ? Number(v) : 0) || 0;
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const euros = (micros: unknown) => n(micros) / 1_000_000;

export type Periode = { du: string; au: string; jours: number };

export type Campagne = {
  id: string; nom: string; statut: string; canal: string; budgetJour: number;
  impressions: number; clics: number; cout: number; conversions: number;
};
export type Jour = { date: string; cout: number; clics: number; conversions: number };
export type TermeRecherche = { terme: string; statut: string; campagne: string; impressions: number; clics: number; cout: number; conversions: number };
export type MotCle = { texte: string; correspondance: string; campagne: string; groupe: string; qualite: number | null; clics: number; cout: number; conversions: number };
export type Zone = { campagne: string; nom: string; type: string; exclue: boolean; modulation: number | null };
export type ZonePerf = { nom: string; clics: number; cout: number; conversions: number };
export type Exclusion = { texte: string; correspondance: string; portee: string };
export type PageArrivee = { url: string; impressions: number; clics: number; cout: number; conversions: number };

export type LectureAds = {
  compte: { nom: string; devise: string; fuseau: string; id: string } | null;
  campagnes: Campagne[];
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

const CORRESPONDANCE: Record<string, string> = { EXACT: "exact", PHRASE: "expression", BROAD: "large" };

async function noms(ressources: string[]): Promise<Map<string, { nom: string; type: string }>> {
  const uniques = [...new Set(ressources.filter(Boolean))];
  const out = new Map<string, { nom: string; type: string }>();
  for (let i = 0; i < uniques.length; i += 200) {
    const lot = uniques.slice(i, i + 200).map((r) => `'${r.replace(/'/g, "")}'`).join(", ");
    const rows = await gaql(`SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${lot})`);
    for (const r of rows) {
      const g = r.geoTargetConstant ?? {};
      /* « Hauts-de-Seine,Ile-de-France,France » → « Hauts-de-Seine, Ile-de-France » */
      const nom = (s(g.canonicalName) || s(g.name)).split(",").filter((x) => x && x !== "France").join(", ");
      out.set(s(g.resourceName), { nom, type: s(g.targetType) });
    }
  }
  return out;
}

const cache = new Map<string, { quand: number; valeur: LectureAds }>();

/** Tout ce que le lot 1 montre, lu en une fois (10 minutes de cache par période). */
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

  const [compte, campagnes, jours, termes, motsCles, zonesBrutes, zonesPerfBrutes, exclusions, pages] = await Promise.all([
    essai("compte", async () => {
      const [r] = await gaql("SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer");
      const c = r?.customer ?? {};
      return { id: s(c.id), nom: s(c.descriptiveName), devise: s(c.currencyCode), fuseau: s(c.timeZone) };
    }, null),
    essai("campagnes", async () => (await gaql(
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${quand} AND campaign.status != 'REMOVED'`,
    )).map((r): Campagne => ({
      id: s(r.campaign?.id), nom: s(r.campaign?.name), statut: s(r.campaign?.status), canal: s(r.campaign?.advertisingChannelType),
      budgetJour: euros(r.campaignBudget?.amountMicros),
      impressions: n(r.metrics?.impressions), clics: n(r.metrics?.clicks), cout: euros(r.metrics?.costMicros), conversions: n(r.metrics?.conversions),
    })).sort((a, b) => b.cout - a.cout), [] as Campagne[]),
    essai("jours", async () => (await gaql(
      `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions FROM customer WHERE ${quand}`,
    )).map((r): Jour => ({ date: s(r.segments?.date), cout: euros(r.metrics?.costMicros), clics: n(r.metrics?.clicks), conversions: n(r.metrics?.conversions) }))
      .sort((a, b) => a.date.localeCompare(b.date)), [] as Jour[]),
    essai("termes", async () => (await gaql(
      `SELECT search_term_view.search_term, search_term_view.status, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE ${quand} ORDER BY metrics.cost_micros DESC LIMIT 200`,
    )).map((r): TermeRecherche => ({
      terme: s(r.searchTermView?.searchTerm), statut: s(r.searchTermView?.status), campagne: s(r.campaign?.name),
      impressions: n(r.metrics?.impressions), clics: n(r.metrics?.clicks), cout: euros(r.metrics?.costMicros), conversions: n(r.metrics?.conversions),
    })), [] as TermeRecherche[]),
    essai("motsCles", async () => (await gaql(
      `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.quality_info.quality_score, campaign.name, ad_group.name, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE ${quand} AND ad_group_criterion.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 200`,
    )).map((r): MotCle => {
      const k = (r.adGroupCriterion?.keyword ?? {}) as Record<string, unknown>;
      const q = (r.adGroupCriterion?.qualityInfo ?? {}) as Record<string, unknown>;
      return {
        texte: s(k.text), correspondance: CORRESPONDANCE[s(k.matchType)] ?? s(k.matchType).toLowerCase(),
        campagne: s(r.campaign?.name), groupe: s(r.adGroup?.name), qualite: q.qualityScore == null ? null : n(q.qualityScore),
        clics: n(r.metrics?.clicks), cout: euros(r.metrics?.costMicros), conversions: n(r.metrics?.conversions),
      };
    }), [] as MotCle[]),
    essai("zones", async () => gaql(
      "SELECT campaign.name, campaign_criterion.type, campaign_criterion.location.geo_target_constant, campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units, campaign_criterion.proximity.address.city_name, campaign_criterion.negative, campaign_criterion.bid_modifier FROM campaign_criterion WHERE campaign_criterion.type IN ('LOCATION', 'PROXIMITY') AND campaign.status != 'REMOVED'",
    ), [] as Ligne[]),
    essai("zonesPerf", async () => gaql(
      `SELECT segments.geo_target_department, metrics.clicks, metrics.cost_micros, metrics.conversions FROM geographic_view WHERE ${quand}`,
    ), [] as Ligne[]),
    essai("exclusions", async () => {
      const [camp, groupe, listes] = await Promise.all([
        gaql("SELECT campaign.name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE AND campaign.status != 'REMOVED'"),
        gaql("SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = TRUE AND ad_group_criterion.status != 'REMOVED'"),
        gaql("SELECT shared_set.name, shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.status = 'ENABLED'"),
      ]);
      const kw = (k: unknown) => (k ?? {}) as Record<string, unknown>;
      const m = (k: unknown) => CORRESPONDANCE[s(kw(k).matchType)] ?? "";
      return [
        ...listes.map((r): Exclusion => ({ texte: s(kw(r.sharedCriterion?.keyword).text), correspondance: m(r.sharedCriterion?.keyword), portee: `Liste « ${s(r.sharedSet?.name)} »` })),
        ...camp.map((r): Exclusion => ({ texte: s(kw(r.campaignCriterion?.keyword).text), correspondance: m(r.campaignCriterion?.keyword), portee: s(r.campaign?.name) })),
        ...groupe.map((r): Exclusion => ({ texte: s(kw(r.adGroupCriterion?.keyword).text), correspondance: m(r.adGroupCriterion?.keyword), portee: `${s(r.campaign?.name)} › ${s(r.adGroup?.name)}` })),
      ].filter((x) => x.texte);
    }, [] as Exclusion[]),
    essai("pages", async () => (await gaql(
      `SELECT landing_page_view.unexpanded_final_url, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM landing_page_view WHERE ${quand} ORDER BY metrics.clicks DESC LIMIT 50`,
    )).map((r): PageArrivee => ({
      url: s(r.landingPageView?.unexpandedFinalUrl),
      impressions: n(r.metrics?.impressions), clics: n(r.metrics?.clicks), cout: euros(r.metrics?.costMicros), conversions: n(r.metrics?.conversions),
    })), [] as PageArrivee[]),
  ]);

  /* Les zones arrivent en identifiants Google (geoTargetConstants/1006094) :
     un seul aller-retour pour leur donner un nom. */
  const geo = await essai("zones", () => noms([
    ...zonesBrutes.map((r) => s((r.campaignCriterion?.location as Record<string, unknown> | undefined)?.geoTargetConstant)),
    ...zonesPerfBrutes.map((r) => s(r.segments?.geoTargetDepartment)),
  ]), new Map<string, { nom: string; type: string }>());

  const zones = zonesBrutes.map((r): Zone => {
    const c = r.campaignCriterion ?? {};
    const prox = c.proximity as Record<string, unknown> | undefined;
    const ressource = s((c.location as Record<string, unknown> | undefined)?.geoTargetConstant);
    const g = geo.get(ressource);
    const nom = prox
      ? `${s((prox.address as Record<string, unknown> | undefined)?.cityName) || "Point"} + ${n(prox.radius)} ${s(prox.radiusUnits) === "MILES" ? "mi" : "km"}`
      : g?.nom ?? ressource;
    const mod = c.bidModifier == null ? null : n(c.bidModifier);
    return { campagne: s(r.campaign?.name), nom, type: prox ? "Rayon" : g?.type ?? "", exclue: c.negative === true, modulation: mod };
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
    compte, campagnes, jours, termes, motsCles, zones,
    zonesPerf: [...parDep.values()].sort((a, b) => b.cout - a.cout),
    exclusions, pages, erreurs, lu: new Date().toISOString(),
  };
  cache.set(cleCache, { quand: Date.now(), valeur });
  return valeur;
}
