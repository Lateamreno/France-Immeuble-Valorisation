"use client";

/**
 * Juste après un refus : la recherche de l'acquéreur mérite-t-elle d'être
 * corrigée ?
 *
 * MAV (#332) : « quand on clique sur refus on demande si on veut modifier la
 * recherche et ça ouvre la modale recherche si on dit oui. » Le refus est le
 * seul moment où l'on apprend quelque chose de précis sur ce que le client
 * veut ; trois minutes plus tard on est passé à autre chose et le critère
 * reste faux.
 *
 * La même fenêtre sert à la fiche immeuble et à la fiche contact (#365) :
 * elle vit donc seule dans son fichier.
 */
import { Modale } from "@/components/modale";

export function ModaleApresRefus({ motif, onNon, onOui, pending }: {
  motif?: string;
  onNon: () => void;
  onOui: () => void;
  pending: boolean;
}) {
  return (
    /* Retour #399 (25/09) : « ok pour laisser la fenêtre mais faut qu'elle
       s'affiche vite et qu'elle se ferme vite ». Une ligne, deux boutons ;
       Échap ou Entrée ferment (« Plus tard » a le focus). */
    <Modale
      titre="Refus noté"
      onFermer={onNon}
      largeur={420}
      pied={
        <>
          <button className="fadd" type="button" autoFocus onClick={onNon}>Plus tard</button>
          <span className="sp" style={{ flex: 1 }} />
          <button className="kgo" type="button" disabled={pending} onClick={onOui}>
            <span className="ch">›</span> Corriger la recherche
          </button>
        </>
      }
    >
      <div className="asst-note">
        {motif ? <><b>{motif}</b>. </> : null}Corriger sa recherche ?
      </div>
    </Modale>
  );
}
