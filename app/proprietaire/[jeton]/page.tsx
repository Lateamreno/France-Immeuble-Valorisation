/**
 * Le lien secret sans mot de passe.
 *
 * MAV a voulu le garder pour le propriétaire qui refuse de créer un mot de
 * passe. Le piège aurait été de lui laisser son ancien chemin, servi par la
 * clé de service : on aurait cloisonné une porte et laissé l'autre grande
 * ouverte.
 *
 * Le lien s'échange donc contre une session ordinaire, courte (deux heures),
 * et la personne atterrit sur l'écran de son immeuble — le même que celle qui
 * s'est connectée. Un seul mécanisme d'accès dans toute l'application ; le
 * lien n'est qu'une façon de s'y présenter.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { COOKIE_SESSION, sessionParLien } from "@/lib/bo/espace-anon";

export const metadata: Metadata = {
  title: "Votre espace vendeur — France Immeuble",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const session = await sessionParLien(jeton);

  if (!session) {
    return (
      <main className="ep-wrap etroit">
        <div className="ep-fermee">
          <h1>Ce lien n&apos;est plus valable</h1>
          <p>
            Il a peut-être été fermé par votre conseiller, ou il a expiré. Appelez-nous et
            nous vous en ouvrons un nouveau — ou mieux, un espace avec mot de passe, où
            vous retrouverez tout quand vous voudrez.
          </p>
          <p className="ep-sig">France Immeuble · 01.72.87.52.22</p>
        </div>
      </main>
    );
  }

  (await cookies()).set(COOKIE_SESSION, session, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 2 * 3600,
  });
  redirect("/espace");
}
