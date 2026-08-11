"use client";

// Cartes de situation (retour MAV #13) : deux vues côte à côte — une vue large
// (situation dans la région / France) et une vue rapprochée (le quartier).
//
// Choix technique : mosaïque de tuiles OpenStreetMap posées côte à côte en CSS.
// Aucune clé d'API, aucune dépendance, rendu identique en local, en preview et
// en production — contrairement à Google Static Maps qui exigerait une clé
// facturée et un domaine autorisé. Si une clé Google est fournie un jour
// (NEXT_PUBLIC_GOOGLE_MAPS_KEY), la vue rapprochée bascule automatiquement sur
// Google Static Maps, plus proche des captures actuelles du dossier.
import { useMemo, useRef } from "react";

const TAILLE = 256;

/** Conversion WGS84 → tuiles Web Mercator (fractionnaire). */
function versTuile(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function Carte({
  lat, lon, zoom, largeur, hauteur, titre, fond = "osm",
}: {
  lat: number;
  lon: number;
  zoom: number;
  largeur: number;
  hauteur: number;
  titre: string;
  /** « osm » = plan détaillé (rues), « clair » = fond sobre pour la vue large. */
  fond?: "osm" | "clair";
}) {
  const cleGoogle = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const tuiles = useMemo(() => {
    const c = versTuile(lat, lon, zoom);
    const max = 2 ** zoom;
    // Coin haut-gauche du cadre, exprimé en pixels « monde ».
    const gauche = c.x * TAILLE - largeur / 2;
    const haut = c.y * TAILLE - hauteur / 2;
    const i0 = Math.floor(gauche / TAILLE);
    const i1 = Math.floor((gauche + largeur - 1) / TAILLE);
    const j0 = Math.floor(haut / TAILLE);
    const j1 = Math.floor((haut + hauteur - 1) / TAILLE);
    const liste: { k: string; src: string; l: number; t: number }[] = [];
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        if (j < 0 || j >= max) continue;
        const tx = ((i % max) + max) % max;
        liste.push({
          k: `${i}-${j}`,
          src: `/api/tile?f=${fond}&z=${zoom}&x=${tx}&y=${j}`,
          l: i * TAILLE - gauche,
          t: j * TAILLE - haut,
        });
      }
    }
    return liste;
  }, [lat, lon, zoom, largeur, hauteur, fond]);

  const google = cleGoogle
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}&zoom=${zoom}&size=${Math.min(largeur, 640)}x${Math.min(hauteur, 640)}&scale=2&markers=color:red%7C${lat},${lon}&key=${cleGoogle}`
    : null;

  return (
    <figure className="carte" style={{ width: largeur }}>
      <div className="carte-vue" style={{ width: largeur, height: hauteur }}>
        {google ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={google} alt={titre} width={largeur} height={hauteur} />
        ) : (
          tuiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={t.k} src={t.src} alt="" width={TAILLE} height={TAILLE}
              style={{ position: "absolute", left: t.l, top: t.t }} />
          ))
        )}
        {!google && <span className="carte-pin" aria-hidden />}
        <span className="carte-credit">© OpenStreetMap</span>
      </div>
      <figcaption>{titre}</figcaption>
    </figure>
  );
}

/** Les deux cartes du BO : situation régionale + quartier. */
export function CartesSituation({
  lat, lon, ville, onCapture,
}: {
  lat: number;
  lon: number;
  ville: string;
  /** Rendu du bouton d'import de capture (alimente le BO et le dossier). */
  onCapture?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="cartes" ref={ref}>
      <Carte lat={lat} lon={lon} zoom={9} largeur={310} hauteur={210} fond="clair"
        titre={`Situation — ${ville} et sa région`} />
      <Carte lat={lat} lon={lon} zoom={16} largeur={310} hauteur={210}
        titre="Le quartier (rayon ~500 m)" />
      {onCapture}
    </div>
  );
}
