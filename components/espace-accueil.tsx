"use client";

/**
 * L'accueil de l'espace client.
 *
 * Une seule personne, deux casquettes : ce qu'elle vend, ce qu'elle cherche.
 * Elles vivent sur la même page parce qu'elles vivent chez la même personne —
 * le propriétaire qui nous confie un immeuble est très souvent celui qui en
 * cherche un autre.
 *
 * L'ordre est celui de l'urgence, pas celui de l'organigramme : ce qui attend
 * une réponse de sa part passe devant ; ses recherches, qui ne demandent rien,
 * viennent après.
 */

import { useTransition } from "react";
import Link from "next/link";
import { deconnexion } from "@/lib/bo/espace-client-actions";
import type {
  BienEnLigne, BienVendeur, PropositionClient, RechercheClient,
} from "@/lib/bo/espace-anon";
import { JALONS } from "@/lib/bo/espace-modele";
import { FormRecherche } from "@/components/espace-recherche";

const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const dateFr = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "";

/** Les onze statuts du BO repliés sur six jalons qu'un vendeur comprend. */
function jalonDuStatut(statut: string): number {
  const n = parseInt(statut, 10);
  if (!Number.isFinite(n)) return 0;
  if (n >= 10) return 5;
  if (n >= 8) return 4;
  if (n === 7) return 3;
  if (n >= 5) return 2;
  if (n >= 4) return 1;
  return 0;
}

export function AccueilClient({ email, immeubles, recherches, propositions, enLigne }: {
  email: string;
  immeubles: BienVendeur[];
  recherches: RechercheClient[];
  propositions: PropositionClient[];
  enLigne: BienEnLigne[];
}) {
  const [pending, start] = useTransition();
  const aRepondre = propositions.filter((p) => !p.reponse);
  const traitees = propositions.filter((p) => p.reponse);
  const dejaVus = new Set(propositions.map((p) => p.immeubleId));
  /* Un bien déjà proposé n'a pas à réapparaître dans la vitrine : il est plus
     haut, avec sa demande de réponse. */
  const vitrine = enLigne.filter((b) => !dejaVus.has(b.immeubleId));

  return (
    <main className="ep-wrap">
      <header className="ep-hd ligne">
        <div>
          <span className="ep-marque">FRANCE IMMEUBLE</span>
          <h1>Votre espace</h1>
          <p className="ep-sous">{email}</p>
        </div>
        <button className="ep-lien-b" type="button" disabled={pending}
          onClick={() => start(async () => { await deconnexion(); location.reload(); })}>
          Se déconnecter
        </button>
      </header>

      {aRepondre.length > 0 && (
        <section className="ep-bloc">
          <h2>Des biens à regarder</h2>
          <p className="ep-intro">
            Nous vous les avons proposés parce qu&apos;ils correspondent à ce que vous
            cherchez. Dites-nous ce que vous en pensez, même si c&apos;est non — cela
            affine ce que nous vous enverrons ensuite.
          </p>
          <ul className="ep-cartes">{aRepondre.map((p) => <CarteProposition key={p.id} p={p} />)}</ul>
        </section>
      )}

      {immeubles.length > 0 && (
        <section className="ep-bloc">
          <h2>{immeubles.length > 1 ? "Vos immeubles" : "Votre immeuble"}</h2>
          <ul className="ep-cartes">
            {immeubles.map((b) => {
              const jalon = jalonDuStatut(b.statut);
              return (
                <li className="ep-carte" key={b.id}>
                  <Link href={`/espace/bien/${b.id}`}>
                    <b>{b.adresse || "Immeuble"}</b>
                    <i>{b.ville}{b.nbLots > 0 ? ` · ${b.nbLots} lots` : ""}</i>
                    <span className="ep-badge">{JALONS[jalon].label}</span>
                    <em>
                      {b.prixDemande != null
                        ? `Votre prix : ${euros(b.prixDemande)} net vendeur`
                        : b.prixAffiche != null
                          ? `Estimé ${euros(b.prixAffiche)}`
                          : "Estimation en cours"}
                    </em>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Ses critères, qu'il remplit lui-même (demande de MAV). */}
      <FormRecherche recherches={recherches} />

      {vitrine.length > 0 && (
        <section className="ep-bloc">
          <h2>Nos biens en ligne</h2>
          <p className="ep-intro">
            Ce que nous présentons publiquement en ce moment. Un bien qui vous parle ?
            Dites-le à votre conseiller.
          </p>
          <ul className="ep-cartes">
            {vitrine.map((b) => (
              <li className="ep-carte" key={b.immeubleId}>
                <a href={b.url} target="_blank" rel="noreferrer">
                  <b>{b.ville}</b>
                  <i>
                    {b.nbLots > 0 ? `${b.nbLots} lots` : "Immeuble"}
                    {b.surface ? ` · ${Math.round(b.surface).toLocaleString("fr-FR")} m²` : ""}
                  </i>
                  <em>
                    {b.prixAffiche != null ? euros(b.prixAffiche) : "Prix sur demande"}
                    {b.prixAffiche && b.loyers
                      ? ` · ${(Math.round((b.loyers / b.prixAffiche) * 1000) / 10).toLocaleString("fr-FR")} % brut`
                      : ""}
                  </em>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {traitees.length > 0 && (
        <section className="ep-bloc">
          <h2>Les biens déjà vus</h2>
          <ul className="ep-cartes">{traitees.map((p) => <CarteProposition key={p.id} p={p} />)}</ul>
        </section>
      )}

      {immeubles.length === 0 && propositions.length === 0 && vitrine.length === 0 && (
        <section className="ep-bloc">
          <h2>Votre espace est prêt</h2>
          <p className="ep-intro">
            Rien d&apos;autre à afficher pour l&apos;instant. Remplissez vos critères ci-dessus :
            dès qu&apos;un bien y correspond, vous le retrouvez ici.
          </p>
        </section>
      )}

      <footer className="ep-pied">
        <p>France Immeuble · 01.72.87.52.22</p>
        <p className="ep-fine">
          Les informations de cet espace vous sont réservées. Elles ne comportent aucune
          donnée nominative concernant les occupants des immeubles.
        </p>
      </footer>
    </main>
  );
}

const ETIQUETTE = {
  interesse: "Vous êtes intéressé",
  visite: "Visite demandée",
  pas_interesse: "Vous avez décliné",
} as const;

function CarteProposition({ p }: { p: PropositionClient }) {
  const renta = p.prixAffiche && p.loyers
    ? Math.round((p.loyers / p.prixAffiche) * 1000) / 10 : undefined;
  return (
    <li className={`ep-carte${p.reponse ? " vue" : ""}`}>
      <Link href={`/espace/propose/${p.id}`}>
        <b>{p.adresse || "Immeuble"}</b>
        <i>
          {p.ville}
          {p.nbLots > 0 ? ` · ${p.nbLots} lots` : ""}
          {p.surface ? ` · ${Math.round(p.surface).toLocaleString("fr-FR")} m²` : ""}
        </i>
        {p.reponse && <span className="ep-badge">{ETIQUETTE[p.reponse]}</span>}
        <em>
          {p.prixAffiche != null ? euros(p.prixAffiche) : "Prix sur demande"}
          {renta ? ` · ${renta.toLocaleString("fr-FR")} % brut` : ""}
          {p.le ? ` · proposé le ${dateFr(p.le)}` : ""}
        </em>
      </Link>
    </li>
  );
}
