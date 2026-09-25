/**
 * Le seul rôle de ce fichier : dire à la mise en page racine sur quelle URL
 * elle se trouve.
 *
 * L'espace client (`/espace/…`) et le lien propriétaire (`/proprietaire/…`) sont
 * les premières pages du site qui ne s'adressent pas à un agent : elle ne doit porter ni le rail, ni le bouton de
 * création rapide, ni la revue des retours. Or `app/layout.tsx` est le seul
 * layout du projet et les monte pour tout le monde.
 *
 * Un groupe de routes ne suffirait pas — il s'imbrique DANS le layout racine,
 * il ne le remplace pas. Déplacer les cinquante routes du BO sous `app/(bo)/`
 * serait la solution propre à froid ; à chaud, c'est un remaniement à risque
 * pour un besoin d'une ligne. On pose donc le chemin dans un en-tête, et le
 * layout choisit.
 *
 * Ce middleware N'AUTHENTIFIE RIEN et ne doit pas le laisser croire : le BO
 * n'a pas encore de connexion, qui a l'URL a l'accès. La protection de
 * l'espace propriétaire tient à son jeton, vérifié côté serveur à chaque
 * lecture et à chaque écriture.
 */

import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("x-chemin", req.nextUrl.pathname);
  return res;
}

export const config = {
  /* Tout sauf les fichiers servis tels quels : inutile de traverser le
     middleware pour une image ou un chunk. */
  matcher: ["/((?!_next/static|_next/image|favicon|icone|.*\\.svg$|.*\\.png$).*)"],
};
