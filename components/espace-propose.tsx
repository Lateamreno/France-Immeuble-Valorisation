"use client";

/**
 * Le bien proposé, vu par l'acquéreur — et sa réponse.
 *
 * MAV a choisi que l'acquéreur puisse répondre en ligne. C'est ce qui rend
 * l'espace utile plutôt que décoratif : sans bouton, il faut décrocher son
 * téléphone, et la moitié des gens ne le fait pas — leur silence ne dit alors
 * ni oui, ni non, et la relance part à l'aveugle.
 *
 * Trois réponses seulement, parce qu'un acquéreur en a trois : ça
 * m'intéresse, je veux le voir, ce n'est pas pour moi. La troisième ferme la
 * proposition dans le BO tout de suite — c'est un fait, pas un arbitrage. Les
 * deux autres n'avancent rien : elles alertent l'agent, à qui il revient de
 * rappeler.
 */

import { useState, useTransition } from "react";
import { repondreProposition, type ChoixAcquereur } from "@/lib/bo/compte-actions";
import type { Reponse, VueProprietaire } from "@/lib/bo/espace-modele";

const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

const CHOIX: { cle: ChoixAcquereur; label: string; aide: string }[] = [
  { cle: "interesse", label: "Ce bien m'intéresse", aide: "Votre conseiller vous rappelle pour en parler." },
  { cle: "visite", label: "Je veux le visiter", aide: "Nous vous proposons des créneaux." },
  { cle: "pas_interesse", label: "Ce n'est pas pour moi", aide: "Nous ne vous le représenterons pas." },
];

export function BienProposeEcran({
  propositionId, vue, photos, dossier, rendement, reponse,
}: {
  propositionId: string;
  vue: VueProprietaire;
  photos: string[];
  dossier: boolean;
  rendement?: number;
  reponse?: ChoixAcquereur;
}) {
  const [pending, start] = useTransition();
  const [choix, setChoix] = useState<ChoixAcquereur | null>(reponse ?? null);
  const [mot, setMot] = useState("");
  const [avis, setAvis] = useState<Reponse | null>(null);

  return (
    <main className="ep-wrap">
      <header className="ep-hd">
        <span className="ep-marque">FRANCE IMMEUBLE</span>
        <h1>{vue.adresse || "Immeuble de rapport"}</h1>
        <p className="ep-sous">
          {vue.ville}
          {vue.nbLots > 0 && ` · ${vue.nbLots} lot${vue.nbLots > 1 ? "s" : ""}`}
          {vue.surface ? ` · ${vue.surface.toLocaleString("fr-FR")} m²` : ""}
        </p>
      </header>

      {photos.length > 0 && (
        <div className="ep-photos">
          {photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={`Photo ${i + 1} de l'immeuble`} loading="lazy" />
          ))}
        </div>
      )}

      <section className="ep-bloc">
        <h2>Les chiffres</h2>
        <div className="ep-chiffres">
          {vue.estimationHai !== undefined && (
            <span><b>{euros(vue.estimationHai)}</b> prix de vente</span>
          )}
          {rendement !== undefined && (
            <span><b>{rendement.toLocaleString("fr-FR")} %</b> de rendement brut</span>
          )}
          {vue.surface !== undefined && vue.estimationHai !== undefined && vue.surface > 0 && (
            <span><b>{Math.round(vue.estimationHai / vue.surface).toLocaleString("fr-FR")} €</b> le m²</span>
          )}
          {vue.nbLots > 0 && <span><b>{vue.nbLots}</b> lots</span>}
        </div>
        {dossier && (
          <p style={{ marginTop: 12 }}>
            <a className="ep-lien" href={`/espace/propose/${propositionId}/dossier`} target="_blank" rel="noreferrer">
              Télécharger le dossier complet (PDF)
            </a>
          </p>
        )}
        <p className="ep-fine">
          Le dossier détaille l&apos;état locatif lot par lot. Les occupants y sont désignés
          par leur qualité, jamais par leur nom.
        </p>
      </section>

      <section className="ep-bloc">
        <h2>Qu&apos;en pensez-vous ?</h2>
        <p className="ep-intro">
          Même un non nous est utile : il affine ce que nous vous enverrons ensuite.
        </p>
        <ul className="ep-choix">
          {CHOIX.map((c) => (
            <li key={c.cle}>
              <button type="button" className={choix === c.cle ? "on" : ""}
                onClick={() => { setChoix(c.cle); setAvis(null); }}>
                <b>{c.label}</b><i>{c.aide}</i>
              </button>
            </li>
          ))}
        </ul>

        <label className="ep-lab" htmlFor="epp-mot">Un mot (facultatif)</label>
        <textarea id="epp-mot" className="ep-zone" rows={3} value={mot}
          onChange={(e) => setMot(e.target.value)}
          placeholder="Ce qui vous plaît, ce qui vous retient, vos disponibilités…" />

        <div className="ep-actions">
          <button className="ep-go" type="button" disabled={pending || !choix}
            onClick={() => start(async () => {
              setAvis(await repondreProposition(propositionId, choix!, mot));
            })}>
            {pending ? "…" : reponse ? "Modifier ma réponse" : "Envoyer ma réponse"}
          </button>
          {avis && <span className={`ep-avis${avis.ok ? " ok" : " ko"}`}>{avis.message}</span>}
        </div>
      </section>

      <footer className="ep-pied">
        <p>
          {vue.agentNom
            ? <>Votre conseiller : <b>{vue.agentNom}</b>{vue.agentTel ? ` · ${vue.agentTel}` : ""}</>
            : "France Immeuble · 01.72.87.52.22"}
        </p>
      </footer>
    </main>
  );
}
