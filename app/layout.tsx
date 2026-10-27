import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Rail } from "@/components/rail";
import { Burger } from "@/components/burger";
import { getAgents } from "@/lib/bubble/server";
import { QuickCreate } from "@/components/quick-create";
import { RevueButton } from "@/components/revue";
import { listFeedbackOuverts } from "@/lib/bo/feedback";
import { lireMode } from "@/lib/bo/mode";
import { PastilleSalve, SalveRelancesProvider } from "@/components/salve-relances";
import { redirect } from "next/navigation";
import { authActive, compteCourant, peutReviser } from "@/lib/auth/comptes";
import { SessionProvider } from "@/components/session";

/** Un déploiement de recette porte la marque en négatif et le dit dans le
 *  titre : avec le tableau de bord Vercel, la preview et la production
 *  ouverts côte à côte, l'onglet se reconnaît sans le lire. */
const preview = process.env.VERCEL_ENV === "preview";

export const metadata: Metadata = {
  title: preview ? "Preview · France Immeuble" : "France Immeuble — Back-office",
  description:
    "Back-office France Immeuble : prospection, commercialisation et bouclage des ventes d'immeubles de rapport.",
  icons: {
    icon: [{ url: preview ? "/favicon-preview.svg" : "/favicon.svg", type: "image/svg+xml" }],
    // iOS ignore les icônes du manifeste pour l'écran d'accueil : sans
    // celle-ci, « Ajouter à l'écran d'accueil » pose une capture de la page.
    apple: [{ url: "/icone-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "France Immeuble" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#121110",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* Les anciennes adresses de l'espace client (fermé le 22/10, contrat §9)
     mènent à une page « Votre espace a déménagé » qui s'adresse à un client :
     ni rail, ni création rapide, ni revue des retours. Le chemin vient du
     middleware, qui existe pour ça. */
  const chemin = (await headers()).get("x-chemin") ?? "";
  if (chemin.startsWith("/proprietaire") || chemin.startsWith("/espace")) {
    return (
      <html lang="fr">
        <body className="hors-bo">{children}</body>
      </html>
    );
  }
  /* La page de connexion : le BO sans son menu (MAV, 27/10). */
  if (chemin.startsWith("/connexion")) {
    return (
      <html lang="fr">
        <body className="page-connexion">{children}</body>
      </html>
    );
  }

  /* Le middleware a vérifié la signature du cookie ; ici on relit le compte :
     un accès coupé par la direction ne passe plus, même avec un cookie valide. */
  const compte = await compteCourant();
  if (authActive() && !compte) redirect("/connexion");
  const agents = await getAgents().catch(() => []);
  const moi = compte ? agents.find((a) => a.id === compte.agent_id) : undefined;
  const session = {
    direction: compte ? compte.role === "direction" : !authActive(),
    agentSlug: moi?.slug,
    nom: moi?.name,
    email: compte?.email,
  };

  return (
    <html lang="fr">
      <body>
        {/* La salve de relances vit ici, au-dessus des pages : on ferme la
            fenêtre, on change de page, elle continue, et sa pastille la suit. */}
        <SessionProvider value={session}>
        <SalveRelancesProvider>
          <div className="shell">
            <Burger />
            <Rail mode={await lireMode()} direction={session.direction} nom={session.nom} connecte={!!compte} />
            <div className="main">
              {children}
              <QuickCreate agents={agents.filter((a) => a.actif)} />
            </div>
            {await peutReviser() && <RevueButton pins={await listFeedbackOuverts().catch(() => [])} />}
            <PastilleSalve />
          </div>
        </SalveRelancesProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
