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
 * une réponse de sa part passe devant. Un bien proposé sur lequel il ne s'est
 * pas prononcé est en haut ; ses recherches, qui ne demandent rien, en bas.
 */

import { useTransition } from "react";
import Link from "next/link";
import { deconnexion } from "@/lib/bo/compte-actions";
import type { BienVendeur, PropositionClient, RechercheClient } from "@/lib/bo/espace-client";
import { JALONS } from "@/lib/bo/espace-modele";

const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const dateFr = (v?: string) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "";

export function AccueilClient({ email, immeubles, recherches, propositions }: {
  email: string;
  immeubles: BienVendeur[];
  recherches: RechercheClient[];
  propositions: PropositionClient[];
}) {
  const [pending, start] = useTransition();
  const aRepondre = propositions.filter((p) => !p.reponse);
  const traitees = propositions.filter((p) => p.reponse);

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

      {immeubles.length === 0 && propositions.length === 0 && recherches.length === 0 && (
        <section className="ep-bloc">
          <h2>Votre espace est prêt</h2>
          <p className="ep-intro">
            Rien à afficher pour l&apos;instant. Dès que nous estimons un de vos immeubles ou
            que nous vous proposons un bien, vous le retrouvez ici.
          </p>
        </section>
      )}

      {aRepondre.length > 0 && (
        <section className="ep-bloc">
          <h2>Des biens à regarder</h2>
          <p className="ep-intro">
            Nous vous les avons proposés parce qu&apos;ils correspondent à ce que vous
            cherchez. Dites-nous ce que vous en pensez, même si c&apos;est non — cela
            affine ce que nous vous enverrons ensuite.
          </p>
          <ul className="ep-cartes">
            {aRepondre.map((p) => <CarteBien key={p.id} p={p} />)}
          </ul>
        </section>
      )}

      {immeubles.length > 0 && (
        <section className="ep-bloc">
          <h2>{immeubles.length > 1 ? "Vos immeubles" : "Votre immeuble"}</h2>
          <ul className="ep-cartes">
            {immeubles.map((b) => (
              <li className="ep-carte" key={b.id}>
                <Link href={`/espace/bien/${b.id}`}>
                  <b>{b.adresse || "Immeuble"}</b>
                  <i>{b.ville}{b.nbLots > 0 ? ` · ${b.nbLots} lots` : ""}</i>
                  <span className="ep-badge">{b.jalonLabel || JALONS[0].label}</span>
                  <em>
                    {b.prixDemande !== undefined
                      ? `Votre prix : ${euros(b.prixDemande)} net vendeur`
                      : b.prixAffiche
                        ? `Estimé ${euros(b.prixAffiche)}`
                        : "Estimation en cours"}
                  </em>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recherches.length > 0 && (
        <section className="ep-bloc">
          <h2>{recherches.length > 1 ? "Vos recherches" : "Votre recherche"}</h2>
          <p className="ep-intro">
            Ce que nous avons noté de vos critères. Quelque chose a changé ? Dites-le à
            votre conseiller, nous ajustons.
          </p>
          <ul className="ep-rech">
            {recherches.map((r) => (
              <li key={r.id} className={r.enPause ? "pause" : ""}>
                <b>{r.lieux}</b>
                {r.destinations.length > 0 && <i>{r.destinations.join(" · ")}</i>}
                <div className="ep-crit">
                  {r.surface && <span>Surface {r.surface}</span>}
                  {r.prix && <span>Budget {r.prix}</span>}
                  {r.renta && <span>Rendement {r.renta}</span>}
                </div>
                {r.commentaire && <p className="ep-mot">{r.commentaire}</p>}
                {r.enPause && <span className="ep-badge gris">Recherche en pause</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {traitees.length > 0 && (
        <section className="ep-bloc">
          <h2>Les biens déjà vus</h2>
          <ul className="ep-cartes">
            {traitees.map((p) => <CarteBien key={p.id} p={p} />)}
          </ul>
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

function CarteBien({ p }: { p: PropositionClient }) {
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
          {p.prixAffiche ? euros(p.prixAffiche) : "Prix sur demande"}
          {p.rendement ? ` · ${p.rendement.toLocaleString("fr-FR")} % brut` : ""}
          {p.le ? ` · proposé le ${dateFr(p.le)}` : ""}
        </em>
      </Link>
    </li>
  );
}
