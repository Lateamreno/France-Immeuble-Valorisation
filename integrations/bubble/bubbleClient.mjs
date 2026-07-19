// Client de lecture Bubble Data API (France Immeuble → Valorisation)
//
// Lecture seule. Zéro dépendance (fetch natif Node >= 18).
// Piloté par variables d'environnement — aucun secret n'est committé.
//
//   BUBBLE_APP_URL   ex. https://france-immeuble.bubbleapps.io  (ou domaine custom)
//   BUBBLE_API_TOKEN token API privé Bubble (facultatif si le data type est public)
//   BUBBLE_ENV       "live" (défaut) ou "test" (utilise /version-test)
//
// Doc Bubble Data API : GET {base}/api/1.1/obj/{type}?limit=100&cursor=0
// Réponse : { response: { results: [...], cursor, remaining, count } }

const DEFAULT_PAGE_SIZE = 100; // maximum autorisé par Bubble

function requireAppUrl() {
  const url = process.env.BUBBLE_APP_URL;
  if (!url) {
    throw new Error(
      "BUBBLE_APP_URL manquant. Ex: export BUBBLE_APP_URL='https://ton-app.bubbleapps.io'",
    );
  }
  return url.replace(/\/+$/, "");
}

// Racine de l'API selon l'environnement (live vs version-test).
export function apiRoot() {
  const appUrl = requireAppUrl();
  const env = (process.env.BUBBLE_ENV || "live").toLowerCase();
  const prefix = env === "test" ? "/version-test" : "";
  return `${appUrl}${prefix}/api/1.1/obj`;
}

function authHeaders() {
  const token = process.env.BUBBLE_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Récupère UNE page d'un data type Bubble.
 * @param {string} type  nom du data type Bubble (ex. "operation", "immeuble", "lot")
 * @param {object} opts  { cursor, limit, constraints, sortField, descending }
 * @returns {Promise<{results: object[], cursor: number, remaining: number, count: number}>}
 */
export async function fetchPage(type, opts = {}) {
  const {
    cursor = 0,
    limit = DEFAULT_PAGE_SIZE,
    constraints,
    sortField,
    descending,
  } = opts;

  const params = new URLSearchParams({
    limit: String(limit),
    cursor: String(cursor),
  });
  if (constraints) params.set("constraints", JSON.stringify(constraints));
  if (sortField) params.set("sort_field", sortField);
  if (descending != null) params.set("descending", String(Boolean(descending)));

  const url = `${apiRoot()}/${encodeURIComponent(type)}?${params.toString()}`;
  const res = await fetch(url, { headers: { ...authHeaders() } });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Bubble ${res.status} ${res.statusText} sur "${type}" — ${body.slice(0, 500)}`,
    );
  }

  const json = await res.json();
  const r = json.response || {};
  return {
    results: r.results || [],
    cursor: r.cursor ?? cursor,
    remaining: r.remaining ?? 0,
    count: r.count ?? (r.results ? r.results.length : 0),
  };
}

/**
 * Récupère TOUTES les lignes d'un data type (pagination automatique).
 * @param {string} type
 * @param {object} opts  { constraints, sortField, descending, pageSize, maxRows, onPage }
 * @returns {Promise<object[]>}
 */
export async function fetchAll(type, opts = {}) {
  const {
    constraints,
    sortField,
    descending,
    pageSize = DEFAULT_PAGE_SIZE,
    maxRows = Infinity,
    onPage,
  } = opts;

  const rows = [];
  let cursor = 0;

  for (;;) {
    const page = await fetchPage(type, {
      cursor,
      limit: pageSize,
      constraints,
      sortField,
      descending,
    });
    rows.push(...page.results);
    if (typeof onPage === "function") {
      onPage({ fetched: rows.length, remaining: page.remaining });
    }
    if (rows.length >= maxRows) return rows.slice(0, maxRows);
    if (page.remaining <= 0 || page.results.length === 0) break;
    cursor += page.results.length;
  }

  return rows;
}
