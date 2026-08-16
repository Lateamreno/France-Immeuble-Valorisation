import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Rail } from "@/components/rail";
import { Burger } from "@/components/burger";
import { getAgents } from "@/lib/bubble/server";
import { QuickCreate } from "@/components/quick-create";
import { RevueButton } from "@/components/revue";
import { listFeedback } from "@/lib/bo/feedback";

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
  return (
    <html lang="fr">
      <body>
        <div className="shell">
          <Burger />
          <Rail />
          <div className="main">
            {children}
            <QuickCreate agents={await getAgents().catch(() => [])} />
          </div>
          <RevueButton pins={await listFeedback().catch(() => [])} />
        </div>
      </body>
    </html>
  );
}
