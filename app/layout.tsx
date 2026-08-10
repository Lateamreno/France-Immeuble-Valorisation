import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Rail } from "@/components/rail";
import { QuickCreate } from "@/components/quick-create";

export const metadata: Metadata = {
  title: "France Immeuble — Back-office",
  description:
    "Back-office France Immeuble : prospection, commercialisation et bouclage des ventes d'immeubles de rapport.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#121110",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <div className="shell">
          <Rail />
          <div className="main">
            {children}
            <QuickCreate />
          </div>
        </div>
      </body>
    </html>
  );
}
