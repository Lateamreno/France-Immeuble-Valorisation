"use client";

/**
 * Le bandeau de l'aperçu (#382 bis) : dit ce qu'on regarde, et referme.
 *
 * La page s'ouvre dans un nouvel onglet depuis la fiche : « Fermer » referme
 * cet onglet. Un onglet que le navigateur refuse de fermer (ouvert à la main,
 * par exemple) renvoie à la fiche du bien, pour ne jamais laisser l'agent
 * devant un bouton qui ne fait rien.
 */

export function BandeauApercu({ immeubleId }: { immeubleId: string }) {
  const fermer = () => {
    window.close();
    setTimeout(() => {
      if (!window.closed) window.location.href = `/bien/${immeubleId}`;
    }, 150);
  };
  return (
    <div className="apv-bandeau" role="status">
      <span className="apv-txt">
        <b>Aperçu</b> — ce que verra le propriétaire. Rien n&apos;est envoyé.
      </span>
      <button type="button" className="apv-fermer" onClick={fermer}>Fermer l&apos;aperçu</button>
    </div>
  );
}
