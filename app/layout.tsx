import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cockpit Découpe — France Immeuble",
  description:
    "Cockpit d'opération de vente à la découpe : du mandat à l'encaissement du dernier lot.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
