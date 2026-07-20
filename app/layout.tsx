import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

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
      <body className="min-h-full">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-slate-200 bg-white md:w-64 md:shrink-0 md:border-b-0 md:border-r dark:border-slate-800 dark:bg-slate-950">
            <Sidebar />
          </aside>
          <main className="flex-1 px-5 py-8 md:px-10 md:py-12">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
