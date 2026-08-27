// La vignette d'un immeuble : sa photo, ou le repli.
//
// Arbitrage MAV : aucun appel à Google à l'affichage. La façade en vue de rue
// est capturée une seule fois par immeuble (voir `capturerFacadeRue` dans
// lib/bo/actions.ts), rangée dans notre coffre et promue photo principale.
// Ce composant ne sert donc que notre propre image — parcourir le dashboard
// ou la liste ne coûte rien.
//
// Quand cette photo est une capture, le bandeau « à remplacer » le dit :
// c'est un repère provisoire, pas la photo du bien, et elle ne part ni dans
// le dossier de vente ni dans une annonce.

export function Facade({
  photoUrl, facadeRue, repli, badge = true,
}: {
  photoUrl?: string;
  /** La photo principale est une capture Street View, pas une vraie photo. */
  facadeRue?: boolean;
  /** Ce qu'on montre quand l'immeuble n'a aucune photo. */
  repli?: React.ReactNode;
  badge?: boolean;
}) {
  if (!photoUrl) return <>{repli}</>;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="" loading="lazy" />
      {facadeRue && badge && (
        <span className="kvue" title="Façade Google Street View — repère provisoire, à remplacer par une vraie photo">
          À remplacer
        </span>
      )}
    </>
  );
}
