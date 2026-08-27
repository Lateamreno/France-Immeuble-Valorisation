"use client";

// La façade d'un immeuble, à défaut de photo.
//
// Un immeuble qui vient d'arriver n'a pas de photo : le dashboard, la liste
// Immeubles et l'en-tête de fiche affichaient alors un pictogramme identique
// pour tout le monde. La vue de rue Google donne à chaque fiche un visage,
// sans rien demander à l'agent.
//
// ATTENTION — usage. Ces images appartiennent à Google. Leurs conditions
// autorisent l'affichage dans l'outil (le filigrane Google reste visible et
// l'image n'est jamais recopiée chez nous) mais interdisent de les réutiliser
// comme photo du bien : ni dossier de vente, ni annonce, ni diffusion Plein
// Bail. C'est pour ça que la façade est calculée à l'affichage et n'est
// jamais enregistrée comme photo principale : dès qu'un agent dépose une
// vraie photo, elle prend la place.
import { useEffect, useRef, useState } from "react";

export function Facade({
  photoUrl, adresse, w = 164, h = 152, repli, badge = true,
}: {
  /** Photo réelle du bien : elle gagne toujours. */
  photoUrl?: string;
  /** Adresse complète telle que géocodée (« 12 rue X, 75011 Paris »). */
  adresse?: string;
  w?: number;
  h?: number;
  /** Ce qu'on montre quand il n'y a ni photo ni vue de rue. */
  repli?: React.ReactNode;
  /** Le bandeau « Vue de rue » — il dit à l'agent que ce n'est pas la photo. */
  badge?: boolean;
}) {
  /* La route répond 404 quand la clé manque, que l'adresse est trop imprécise
     ou qu'aucune prise de vue n'existe : on retombe alors sur le repli plutôt
     que d'afficher un cadre cassé. */
  const [rueKo, setRueKo] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  /* L'image est dans le HTML rendu par le serveur : le navigateur la demande
     avant que React n'ait branché onError. Sur un 404 rapide, l'événement est
     donc perdu et le cadre restait cassé. On rattrape l'échec au montage. */
  useEffect(() => {
    const i = img.current;
    if (i && i.complete && i.naturalWidth === 0) setRueKo(true);
  }, []);

  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" loading="lazy" />;
  }
  if (!adresse || rueKo) return <>{repli}</>;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} alt="" loading="lazy" onError={() => setRueKo(true)}
        src={`/api/streetview?a=${encodeURIComponent(adresse)}&w=${w}&h=${h}`} />
      {badge && (
        <span className="kvue" title="Vue de rue Google — repère dans l'outil, pas photo du bien">
          Vue de rue
        </span>
      )}
    </>
  );
}
