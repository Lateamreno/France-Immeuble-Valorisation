/**
 * Les photos dont Bubble a encore le fichier (retours #460 et #463).
 *
 * Sur Argenteuil, deux photos du dossier sortaient cassées : Bubble répond
 * 200 avec une PAGE HTML quand le fichier n'existe plus, et le relais la
 * servait comme une image. Le dossier de vente part chez des acquéreurs : une
 * vignette cassée y est pire qu'une vignette de moins. On vérifie donc, côté
 * serveur et avant la mise en page, que chaque photo retenue est bien une
 * image — un appel par photo, seize au plus, et le verdict est gardé dix
 * minutes pour ne pas refaire la tournée à chaque aperçu.
 *
 * Ne tourne que côté serveur : le jeton Bubble ne doit jamais atteindre le
 * navigateur.
 */

const VERDICTS = new Map<string, { ok: boolean; a: number }>();
const DUREE = 10 * 60_000;
const ALLOWED = new Set(["vente.france-immeuble.fr", "s3.amazonaws.com"]);
const hoteConnu = (h: string) => ALLOWED.has(h) || h === "cdn.bubble.io" || h.endsWith(".cdn.bubble.io");

/** L'adresse d'origine d'une photo passée par le relais (`/api/photo?u=…`). */
function origine(u: string): URL | null {
  try {
    if (u.startsWith("/api/photo")) {
      const brut = new URL(u, "http://x").searchParams.get("u");
      if (!brut) return null;
      return new URL(brut.startsWith("//") ? `https:${brut}` : brut);
    }
    if (u.startsWith("http")) return new URL(u);
  } catch {
    /* adresse illisible : on ne tranche pas, la photo reste */
  }
  return null;
}

/** Vrai si l'adresse répond une image ; vrai aussi quand on ne sait pas vérifier. */
export async function photoValide(u: string | undefined): Promise<boolean> {
  if (!u) return false;
  const url = origine(u);
  if (!url || !hoteConnu(url.hostname)) return true;
  const cle = url.toString();
  const vu = VERDICTS.get(cle);
  if (vu && Date.now() - vu.a < DUREE) return vu.ok;
  const token = process.env.BUBBLE_API_TOKEN;
  let ok = true;
  try {
    /* Quatre secondes, pas plus : si Bubble ne répond pas, la photo reste —
       on n'écarte que ce qu'on a vu cassé. Sans cette borne, un Bubble muet
       bloquerait l'aperçu du dossier entier. */
    const r = await fetch(url, {
      method: "GET",
      headers: {
        ...(token && url.hostname === "vente.france-immeuble.fr" ? { Authorization: `Bearer ${token}` } : {}),
        Range: "bytes=0-0",
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const type = r.headers.get("Content-Type") ?? "";
    ok = r.ok && /^image\//i.test(type);
    /* On ne lit pas le corps : un octet demandé, la connexion se ferme. */
    await r.body?.cancel().catch(() => undefined);
  } catch {
    ok = true;
  }
  VERDICTS.set(cle, { ok, a: Date.now() });
  return ok;
}

/** Les photos valides, dans le même ordre ; les cassées sont écartées. */
export async function retirerPhotosCassees<T extends { url?: string; urlPleine?: string }>(photos: T[]): Promise<T[]> {
  const verdicts = await Promise.all(photos.map((p) => photoValide(p.urlPleine ?? p.url)));
  return photos.filter((_, i) => verdicts[i]);
}
