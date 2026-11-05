"use client";

// La carte RCS telle que l'acquéreur la voit sur son téléphone (MAV, 03/11 :
// « j'aimerais que ça m'affiche la façon dont ça va les afficher au client »).
//
// Objet partagé (CLAUDE.md §13) : l'essai de Réglages › Envois et l'étape RCS
// de la commercialisation montrent la même chose, au même dessin. Deux vues
// côte à côte, parce que l'acquéreur n'a pas tous le même téléphone : la carte
// sur un téléphone qui lit le RCS, le SMS de repli sur les autres.

export type CarteRcsVue = {
  titre: string;
  /** `<br>` pour les retours à la ligne (format MailingVox). */
  texte: string;
  photo?: string;
  lienDossier?: string;
  lienPerime?: boolean;
  repli: string;
};

/** Le texte de la carte : `<br>` devient un vrai retour à la ligne, rien d'autre n'est interprété. */
const lignes = (t: string) => t.split(/<br\s*\/?>/i);

export function TelephoneRcs({ carte }: { carte: CarteRcsVue }) {
  return (
    <div className="rcs-tels">
      <figure className="rcs-tel" aria-label="La carte RCS sur le téléphone de l'acquéreur">
        <div className="rcs-tel-h">
          <span className="rcs-tel-av" aria-hidden>FI</span>
          <span className="rcs-tel-nom">France Immeuble <i title="Expéditeur vérifié chez MailingVox">✓</i></span>
        </div>
        <div className="rcs-tel-fil">
          <div className="rcs-carte">
            {carte.photo
              ? <img src={carte.photo} alt="" />
              : <div className="rcs-sans">Pas de photo principale : la carte ne peut pas partir.</div>}
            <div className="rcs-corps">
              <b>{carte.titre}</b>
              <p>{lignes(carte.texte).map((l, i) => <span key={i}>{l}<br /></span>)}</p>
            </div>
            <div className="rcs-boutons">
              <span>Intéressé</span>
              <span>Pas intéressé</span>
              {carte.lienDossier && <span>Télécharger le dossier</span>}
            </div>
          </div>
        </div>
        <figcaption>Téléphone compatible RCS (Android, iPhone récent)</figcaption>
      </figure>
      <figure className="rcs-tel sms" aria-label="Le SMS de repli">
        <div className="rcs-tel-h">
          <span className="rcs-tel-av" aria-hidden>FI</span>
          <span className="rcs-tel-nom">France Immeuble</span>
        </div>
        <div className="rcs-tel-fil">
          <div className="rcs-bulle">{carte.repli}</div>
        </div>
        <figcaption>Sans RCS : ce SMS à la place ({[...carte.repli].length} caractères)</figcaption>
      </figure>
    </div>
  );
}
