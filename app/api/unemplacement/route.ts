// Loyers et prix de l'immobilier d'entreprise, lus sur unemplacement.com.
//
// La lecture se fait ICI, pas dans le navigateur : leur site ne sert pas les
// en-têtes CORS, et de toute façon c'est une page HTML de 500 ko qu'on n'a
// aucune raison de faire télécharger à l'agent. On en renvoie deux nombres.
//
// Mise en cache une journée : ces estimations sont mensuelles, les rafraîchir
// à chaque ouverture de modale serait du bruit — chez eux comme chez nous.
import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { lireUnemplacement, urlUnemplacement, type ValeurUE } from "@/lib/unemplacement";

export const maxDuration = 30;

const JOUR = 60 * 60 * 24;

const lire = unstable_cache(
  async (url: string): Promise<ValeurUE | null> => {
    try {
      const r = await fetch(url, {
        headers: {
          // Sans en-tête de navigateur, le site répond une page vide.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept-Language": "fr-FR,fr;q=0.9",
        },
        cache: "no-store",
      });
      if (!r.ok) return null;
      return lireUnemplacement(await r.text(), url) ?? null;
    } catch {
      return null;
    }
  },
  ["unemplacement"],
  { revalidate: JOUR, tags: ["unemplacement"] },
);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const dest = q.get("dest") ?? "";
  const lieu = {
    cp: q.get("cp") ?? undefined,
    ville: q.get("ville") ?? undefined,
    insee: q.get("insee") ?? undefined,
  };
  const uLoyer = urlUnemplacement(dest, lieu, "loyer");
  const uPrix = urlUnemplacement(dest, lieu, "prix");
  if (!uLoyer || !uPrix) return Response.json({ loyer: null, prix: null });

  const [loyer, prix] = await Promise.all([lire(uLoyer), lire(uPrix)]);
  return Response.json({ loyer, prix });
}
