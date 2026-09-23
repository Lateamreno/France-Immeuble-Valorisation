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
export function ModaleApresRefus({ motif, onNon, onOui, pending }: {
  motif?: string;
  onNon: () => void;
  onOui: () => void;
  pending: boolean;
}) {
  return (
    <div className="modal-ov" onClick={onNon}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          Refus enregistré
          <button type="button" onClick={onNon}>✕</button>
        </div>
        <div className="modal-b">
          <div className="asst-note">
            {motif ? <>Motif retenu : <b>{motif}</b>. </> : null}
            Voulez-vous corriger sa recherche dans la foulée ? C&apos;est maintenant
            qu&apos;on sait pourquoi le dossier ne lui allait pas — dans dix minutes,
            le critère restera faux et il recevra le même type de bien.
          </div>
        </div>
        <div className="modal-f">
          <button className="fadd" type="button" onClick={onNon}>Non, plus tard</button>
          <span className="sp" style={{ flex: 1 }} />
          <button className="kgo" type="button" disabled={pending} onClick={onOui}>
            <span className="ch">›</span> Ouvrir sa recherche
          </button>
        </div>
      </div>
    </div>
  );
}
