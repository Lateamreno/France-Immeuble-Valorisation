// Le PDF d'un dossier, lu pour être JOINT à un e-mail — et le dernier dossier
// de chaque immeuble.
//
// MAV (28/09) : « dans la relance je n'avais pas la pièce jointe mais un lien
// vers le dossier. Je veux qu'il y ait toujours une pièce jointe physique et
// que le seul lien soit le lien transfer.it. »
//
// Code serveur (clé de service, jeton Bubble) : à n'importer que depuis des
// modules serveur. Il factorise ce que la commercialisation faisait déjà pour
// sa propre pièce jointe (retour du 25/09).

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const S = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Le nom du fichier joint : « Dossier-Sens-V2.pdf ». */
export function nomPieceDossier(ville: string | undefined, version: unknown): string {
  const v = (ville ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Dossier-${v || "immeuble"}-V${S(version) || "1"}.pdf`;
}

/** Où vit le PDF d'un dossier : dans notre coffre (`path`) ou chez Bubble (`url`). */
export function sourcePdfDossier(d: Record<string, unknown>): { path?: string; url?: string } | null {
  const u = [d.pdf, d.FILE].map(S).find((x) => x.length > 0) ?? "";
  if (!u) return null;
  if (u.startsWith("storage:")) return { path: u.slice("storage:".length) };
  if (u.startsWith("/api/photo?s=")) return { path: decodeURIComponent(u.slice("/api/photo?s=".length)) };
  return { url: u.replace(/^\/\//, "https://") };
}

/**
 * Lit une pièce (PDF du coffre ou « fileupload » Bubble). Bubble sert ses
 * fichiers en 401 à toute requête anonyme : le jeton d'API ouvre la porte, et
 * il ne sort pas d'ici.
 */
/* Le cache des pièces lues (MAV, 05/10 : « pourquoi c'est aussi lent »). Une
   salve lit le même PDF à chaque paquet, et une fonction Vercel qui reste
   chaude le garde en mémoire quelques minutes : un dossier de plusieurs Mo
   n'est plus retéléchargé douze fois. Borné en nombre et en durée — une
   fonction froide repart à vide, ce n'est pas grave. */
const CACHE_PIECES = new Map<string, { quand: number; piece: { nom: string; contenu: Buffer; type: string } }>();
const CACHE_PIECES_MS = 10 * 60_000;
const CACHE_PIECES_MAX = 12;

export async function lirePiece(p: { nom: string; path?: string; url?: string }): Promise<
  { ok: true; piece: { nom: string; contenu: Buffer; type: string } } | { ok: false; message: string }
> {
  if (!SB_KEY) return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY absente." };
  const source = p.path
    ? `${SB_URL}/storage/v1/object/bo-files/${p.path}`
    : p.url && /^https:\/\/(vente\.france-immeuble\.fr|[a-z0-9-]+\.supabase\.co)\//i.test(p.url) ? p.url : "";
  if (!source) return { ok: false, message: `Pièce jointe introuvable : ${p.nom}.` };
  const cle = `${source}|${p.nom}`;
  const deja = CACHE_PIECES.get(cle);
  if (deja && Date.now() - deja.quand < CACHE_PIECES_MS) return { ok: true, piece: deja.piece };
  const jetonBubble = process.env.BUBBLE_API_TOKEN;
  const res = await fetch(source, {
    headers: p.path
      ? { Authorization: `Bearer ${SB_KEY}` }
      : jetonBubble && /^https:\/\/vente\.france-immeuble\.fr\//i.test(source) ? { Authorization: `Bearer ${jetonBubble}` } : undefined,
    redirect: "follow",
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return { ok: false, message: `Pièce jointe introuvable : ${p.nom}${res ? ` (réponse ${res.status})` : ""}.` };
  const type = /\.csv$/i.test(p.nom) ? "text/csv" : /\.xlsx$/i.test(p.nom)
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf";
  const piece = { nom: p.nom, contenu: Buffer.from(await res.arrayBuffer()), type };
  if (CACHE_PIECES.size >= CACHE_PIECES_MAX) {
    const plusVieille = [...CACHE_PIECES.entries()].sort((a, b) => a[1].quand - b[1].quand)[0]?.[0];
    if (plusVieille) CACHE_PIECES.delete(plusVieille);
  }
  CACHE_PIECES.set(cle, { quand: Date.now(), piece });
  return { ok: true, piece };
}

/**
 * Envoie en parallèle, par groupes de `largeur`, en gardant l'ordre des
 * résultats. C'est ce qui fait passer une salve de 2,5 s par message à
 * quelques dixièmes : SendGrid accepte plusieurs connexions, et c'est la
 * pièce jointe à pousser qui prend le temps, pas le relais.
 */
export async function parGroupes<T, R>(liste: T[], largeur: number, f: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < liste.length; i += largeur) {
    const tranche = liste.slice(i, i + largeur);
    out.push(...(await Promise.all(tranche.map((x, k) => f(x, i + k)))));
  }
  return out;
}

/**
 * Le dernier dossier de chaque immeuble (la version la plus haute), par
 * identifiant d'immeuble. Une seule requête pour tous.
 */
export async function derniersDossiers(immeubleIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const ids = [...new Set(immeubleIds.filter(Boolean))];
  if (!SB_KEY || ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 100) {
    const lot = ids.slice(i, i + 100).map((v) => `"${v}"`).join(",");
    const res = await fetch(
      `${SB_URL}/rest/v1/bo_dossier?select=data&data->>IMMEUBLE=in.(${lot})&limit=5000`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, cache: "no-store" },
    ).catch(() => null);
    if (!res?.ok) continue;
    const rows = (await res.json()) as { data: Record<string, unknown> }[];
    for (const { data: d } of rows) {
      const im = S(d.IMMEUBLE);
      if (!im) continue;
      const deja = out.get(im);
      if (!deja || Number(d.version ?? 0) > Number(deja.version ?? 0)) out.set(im, d);
    }
  }
  return out;
}
