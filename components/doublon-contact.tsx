"use client";

/**
 * L'alerte de doublon d'adresse e-mail (retour #248).
 *
 * MAV : « on ne devrait pas pouvoir créer un contact qui existe déjà : quand
 * on donne une adresse e-mail qui existe déjà dans la base, il nous demande si
 * on veut utiliser le contact avec l'adresse e-mail en question, ou créer un
 * nouveau contact avec une autre adresse. »
 *
 * Deux fiches pour une même adresse, ce n'est pas seulement une ligne en trop :
 * les mails entrants se rattachent à l'adresse, et l'historique se coupe en
 * deux sans que personne le voie. On bloque donc la création — mais on ne
 * l'interdit pas : l'agent choisit, et les deux issues sont légitimes. Une
 * même personne peut avoir une seconde adresse ; c'est alors la sienne qu'il
 * faut corriger, pas le doublon qu'il faut créer.
 *
 * Le même bloc sert aux deux écrans qui créent un contact — la fenêtre rapide
 * et le sélecteur — pour que la question se pose de la même façon des deux
 * côtés.
 */

import type { ContactTrouve } from "@/lib/bo/actions";

export function DoublonContact({ existant, onReprendre, onChanger }: {
  existant: ContactTrouve;
  /** Utiliser la fiche déjà là — le cas de loin le plus fréquent. */
  onReprendre: () => void;
  /** Revenir au formulaire pour saisir une autre adresse. */
  onChanger: () => void;
}) {
  return (
    <div className="dbl">
      <div className="dbl-h">
        <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3 1.8 21h20.4z" /><path d="M12 10v5M12 17.6v.2" /></svg>
        Cette adresse est déjà dans la base
      </div>
      <div className="dbl-c">
        <b>{existant.nom}</b>
        <span>{existant.email}</span>
        {existant.tel && <span>{existant.tel}</span>}
        {existant.societe && <span>{existant.societe}</span>}
      </div>
      <p className="dbl-p">
        Créer une seconde fiche couperait en deux l&apos;historique des échanges :
        les mails reçus se rattachent à l&apos;adresse, pas au nom.
      </p>
      <div className="dbl-f">
        <button type="button" className="fadd" onClick={onChanger}>
          Saisir une autre adresse
        </button>
        <button type="button" className="kgo" onClick={onReprendre}>
          <span className="ch">›</span> Utiliser ce contact
        </button>
      </div>
    </div>
  );
}
