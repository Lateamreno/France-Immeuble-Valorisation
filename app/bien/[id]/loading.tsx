/**
 * L'écran d'attente de la fiche d'un bien (retour #432).
 *
 * Sans lui, un clic sur une vignette du dashboard ne faisait RIEN à l'écran
 * tant que le serveur n'avait pas fini de lire les vingt tables de la fiche :
 * l'agent restait sur le dashboard, sans savoir si le clic avait pris. Avec
 * lui, la page change immédiatement ; la fiche remplace le squelette dès que
 * les données arrivent.
 */
export default function ChargementBien() {
  return (
    <div className="wrap chargement" aria-busy="true" aria-label="Chargement de la fiche">
      <div className="chg-h">
        <span className="chg-b" style={{ width: 120, height: 90 }} />
        <div className="chg-c">
          <span className="chg-b" style={{ width: "42%", height: 22 }} />
          <span className="chg-b" style={{ width: "26%", height: 14 }} />
          <span className="chg-b" style={{ width: "34%", height: 14 }} />
        </div>
      </div>
      <div className="chg-g">
        <span className="chg-b" style={{ height: 160 }} />
        <span className="chg-b" style={{ height: 160 }} />
        <span className="chg-b" style={{ height: 160 }} />
      </div>
      <span className="chg-b" style={{ height: 220 }} />
    </div>
  );
}
