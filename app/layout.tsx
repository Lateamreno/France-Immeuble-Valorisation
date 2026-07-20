import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";
import { Dock } from "@/components/dock";

export const metadata: Metadata = {
  title: "Cockpit Découpe — France Immeuble",
  description:
    "Cockpit d'opération de vente à la découpe : du mandat à l'encaissement du dernier lot.",
};

const DUST = [
  { left: "22%", top: "20%", d: "0s" }, { left: "48%", top: "12%", d: "1.2s" },
  { left: "70%", top: "26%", d: ".6s" }, { left: "86%", top: "48%", d: "2s" },
  { left: "34%", top: "64%", d: "1.6s" }, { left: "62%", top: "78%", d: ".3s" },
  { left: "12%", top: "52%", d: "2.4s" }, { left: "92%", top: "16%", d: "1s" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <div className="app">
          <div className="dust">
            {DUST.map((p, i) => (
              <i key={i} style={{ left: p.left, top: p.top, animationDelay: p.d }} />
            ))}
          </div>
          <div className="shell">
            <Sidebar />
            <div className="main">
              <TopBar />
              {children}
              <Dock />
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
