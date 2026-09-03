/**
 * L'espace propriétaire — la page.
 *
 * Servie sans authentification : le jeton de l'URL EST la preuve d'accès. Elle
 * ne reçoit donc jamais d'identifiant d'immeuble de l'extérieur — elle le
 * déduit du jeton, côté serveur, à chaque ouverture.
 *
 * `noindex` : un lien secret qui se retrouve dans un moteur de recherche n'est
 * plus secret. L'en-tête `robots` le dit, et le middleware la garde hors du
 * décor du back-office.
 */

import type { Metadata } from "next";
import { EspaceProprietaire } from "@/components/espace-proprietaire";
import { lireEspace, piecesDeposees, vueProprietaire } from "@/lib/bo/espace-proprietaire";
import { noterVisite } from "@/lib/bo/espace-actions";

export const metadata: Metadata = {
  title: "Votre espace vendeur — France Immeuble",
  robots: { index: false, follow: false, nocache: true },
};

/** Rien n'est mis en cache : un lien coupé doit l'être tout de suite. */
export const dynamic = "force-dynamic";

function Fermee({ titre, texte }: { titre: string; texte: string }) {
  return (
    <main className="ep-wrap">
      <div className="ep-fermee">
        <h1>{titre}</h1>
        <p>{texte}</p>
        <p className="ep-sig">France Immeuble · 01.72.87.52.22</p>
      </div>
    </main>
  );
}

export default async function Page({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const espace = await lireEspace(jeton);

  if (espace === "revoque") {
    return <Fermee
      titre="Ce lien a été fermé"
      texte="Votre conseiller a clos cet accès. Contactez-le pour en recevoir un nouveau." />;
  }
  if (espace === "expire") {
    return <Fermee
      titre="Ce lien a expiré"
      texte="Par sécurité, un espace vendeur ne reste ouvert que quelques mois. Votre conseiller peut vous en rouvrir un." />;
  }
  if (espace === "inconnu") {
    return <Fermee
      titre="Lien introuvable"
      texte="Vérifiez que vous avez bien copié l'adresse complète reçue par e-mail." />;
  }

  const [vue, pieces] = await Promise.all([
    vueProprietaire(espace.immeuble_id),
    piecesDeposees(jeton),
  ]);
  if (!vue) {
    return <Fermee
      titre="Espace momentanément indisponible"
      texte="Réessayez dans quelques minutes, ou appelez votre conseiller." />;
  }

  /* La visite se note après coup : elle ne doit pas retarder l'affichage, ni
     empêcher la page de s'ouvrir si l'écriture échoue. */
  void noterVisite(jeton);

  return (
    <EspaceProprietaire
      jeton={jeton}
      vue={vue}
      pieces={pieces}
      prixPose={espace.prix_nv ?? undefined}
      motPose={espace.prix_mot ?? undefined}
    />
  );
}
