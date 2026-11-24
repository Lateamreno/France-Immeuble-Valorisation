/**
 * Le seul rôle de ce fichier : dire à la mise en page racine sur quelle URL
 * elle se trouve.
 *
 * Les anciennes adresses de l'espace client (`/espace/…`, `/proprietaire/…`),
 * fermé le 22/10, mènent à une page qui s'adresse à un client : elle ne doit
 * porter ni le rail, ni le bouton de création rapide, ni la revue des retours. Or `app/layout.tsx` est le seul
 * layout du projet et les monte pour tout le monde.
 *
 * Un groupe de routes ne suffirait pas — il s'imbrique DANS le layout racine,
 * il ne le remplace pas. Déplacer les cinquante routes du BO sous `app/(bo)/`
 * serait la solution propre à froid ; à chaud, c'est un remaniement à risque
 * pour un besoin d'une ligne. On pose donc le chemin dans un en-tête, et le
 * layout choisit.
 *
 * Depuis le 27/10, il garde aussi la porte : toute adresse demande une session
 * (cookie signé, lib/auth/jeton.ts), sauf la page de connexion et les adresses
 * des machines, qui ont chacune leur propre clé. Sans session, une page mène à
 * /connexion ; une adresse /api/ répond 401. Ce contrôle ne regarde que la
 * signature : le compte est relu en base côté serveur (lib/auth/comptes.ts),
 * c'est là qu'un accès désactivé est refusé. La porte ne se ferme qu'avec
 * `BO_AUTH=on` (Vercel) : avant, chacun a le temps de choisir son mot de passe.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cheminPublic, COOKIE_SESSION, lireSession } from "@/lib/auth/jeton";

export async function middleware(req: NextRequest) {
  const chemin = req.nextUrl.pathname;
  if (process.env.BO_AUTH?.trim().toLowerCase() === "on" && !cheminPublic(chemin)) {
    const session = await lireSession(req.cookies.get(COOKIE_SESSION)?.value);
    if (!session) {
      if (chemin.startsWith("/api/")) return NextResponse.json({ ok: false, message: "Connexion requise." }, { status: 401 });
      const vers = req.nextUrl.clone();
      vers.pathname = "/connexion";
      vers.search = chemin === "/" ? "" : `?suite=${encodeURIComponent(chemin + req.nextUrl.search)}`;
      return NextResponse.redirect(vers);
    }
  }
  /* Le chemin descend à la mise en page, par l'en-tête de la REQUÊTE : c'est
     celui que `headers()` relit côté serveur. */
  const entetes = new Headers(req.headers);
  entetes.set("x-chemin", chemin);
  const res = NextResponse.next({ request: { headers: entetes } });
  res.headers.set("x-chemin", chemin);
  return res;
}

export const config = {
  /* Tout sauf les fichiers servis tels quels : inutile de traverser le
     middleware pour une image ou un chunk. */
  matcher: ["/((?!_next/static|_next/image|favicon|icone|fonts/|.*\\.(?:svg|png|jpe?g|webp|ico|woff2?|ttf|otf|txt|webmanifest)$).*)"],
};
