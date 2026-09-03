/**
 * Un immeuble que le client nous a confié.
 *
 * On réemploie l'écran du lien secret : le prix, les pièces, l'avancement. La
 * seule différence est la porte — ici c'est une session, là un jeton — et c'est
 * `espaceOuJeton` qui l'absorbe, pour que l'écran n'ait pas à savoir par où la
 * personne est entrée.
 *
 * L'appartenance est vérifiée ici, en base : l'immeuble doit avoir CE contact
 * pour propriétaire. Sans ce contrôle, changer l'identifiant dans l'URL
 * ouvrirait l'immeuble du voisin.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { clientConnecte } from "@/lib/bo/compte-client";
import { Connexion } from "@/components/espace-connexion";
import { EspaceProprietaire } from "@/components/espace-proprietaire";
import { espaceOuJeton } from "@/lib/bo/espace-jeton";
import { piecesDeposees, vueProprietaire } from "@/lib/bo/espace-proprietaire";
import { fetchAll } from "@/lib/bubble/server";

export const metadata: Metadata = {
  title: "Votre immeuble — France Immeuble",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const compte = await clientConnecte();
  if (!compte) return <Connexion />;

  const a = await fetchAll("immeuble", [
    { key: "_id", constraint_type: "equals", value: id },
    { key: "PROPRIETAIRE", constraint_type: "equals", value: compte.contact_id },
  ], 1).catch(() => [] as Record<string, unknown>[]);
  if (a.length === 0) {
    return (
      <main className="ep-wrap etroit">
        <div className="ep-fermee">
          <h1>Immeuble introuvable</h1>
          <p>Cet immeuble ne figure pas parmi les vôtres.</p>
          <p><Link className="ep-lien" href="/espace">Revenir à votre espace</Link></p>
        </div>
      </main>
    );
  }

  /* Le prix et les pièces se rangent sur l'espace du bien : le client qui
     entre par son compte et celui qui entre par le lien secret alimentent le
     même dossier, sinon l'agent aurait deux prix à réconcilier. */
  const jeton = await espaceOuJeton(id, compte.contact_id);
  const [vue, pieces] = await Promise.all([
    vueProprietaire(id),
    piecesDeposees(jeton.jeton),
  ]);
  if (!vue) {
    return (
      <main className="ep-wrap etroit">
        <div className="ep-fermee"><h1>Momentanément indisponible</h1><p>Réessayez dans quelques minutes.</p></div>
      </main>
    );
  }

  return (
    <>
      <div className="ep-retour"><Link href="/espace">← Votre espace</Link></div>
      <EspaceProprietaire
        jeton={jeton.jeton}
        vue={vue}
        pieces={pieces}
        prixPose={jeton.prix_nv ?? undefined}
        motPose={jeton.prix_mot ?? undefined}
      />
    </>
  );
}
