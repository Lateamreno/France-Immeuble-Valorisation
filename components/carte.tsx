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
import { useMemo, useRef, useState, useTransition } from "react";
import { uploadPhoto } from "@/lib/bo/actions";

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

/**
 * Les deux cartes du BO, collées l'une à l'autre pour que la capture d'écran
 * de l'agent soit d'un seul tenant (retour MAV #35) : à gauche la France, à
 * droite le quartier. On reste sur Google Maps comme demandé — l'embed public
 * ne demande aucune clé ; avec NEXT_PUBLIC_GOOGLE_MAPS_KEY on bascule sur les
 * cartes statiques officielles, plus propres pour une capture (pas de
 * contrôles ni de bandeau).
 */
export function CartesSituation({
  lat, lon, adresse, immeubleId,
}: {
  lat: number;
  lon: number;
  adresse: string;
  /** Permet d'enregistrer la capture dans les photos de l'immeuble. */
  immeubleId?: string;
}) {
  const cle = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const q = `${lat},${lon}`;
  const vues: { titre: string; zoom: number }[] = [
    { titre: `La France — ${adresse}`, zoom: 5 },
    { titre: `Le quartier — ${adresse}`, zoom: 14 },
  ];

  return (
    <div className="emp-maps">
      {vues.map((v) => (
        <div className="emp-map" key={v.zoom}>
          {/* Repli visuel : si Google ne se charge pas (réseau d'entreprise,
              extension qui bloque), la carte OpenStreetMap reste visible
              dessous plutôt qu'un rectangle vide. */}
          <span className="emp-map-fond">
            <Carte lat={lat} lon={lon} zoom={v.zoom} largeur={340} hauteur={210}
              titre={v.titre} fond={v.zoom < 8 ? "clair" : "osm"} />
          </span>
          {cle ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={v.titre}
              src={`https://maps.googleapis.com/maps/api/staticmap?center=${q}&zoom=${v.zoom}&size=400x300&scale=2&markers=${q}&key=${cle}`} />
          ) : (
            <iframe title={v.titre} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${v.zoom}&output=embed`} />
          )}
        </div>
      ))}
      {immeubleId && <CaptureCarte immeubleId={immeubleId} />}
    </div>
  );
}

/** Import d'une capture de carte : elle rejoint les photos de l'immeuble
 *  (type « Carte ») et devient donc disponible dans le dossier de vente. */
function CaptureCarte({ immeubleId }: { immeubleId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [ok, setOk] = useState(false);

  const envoyer = (f: File) =>
    start(async () => {
      const fd = new FormData();
      fd.set("file", f);
      await uploadPhoto(immeubleId, "Carte", null, fd);
      setOk(true);
    });

  return (
    <div className="carte-cap">
      <p>
        Collez (Ctrl+V) ou déposez une capture de carte : elle est enregistrée
        dans les photos de l&apos;immeuble et reprise dans le dossier de vente.
      </p>
      <div
        className="carte-drop"
        onPaste={(e) => {
          const f = [...e.clipboardData.files][0];
          if (f) envoyer(f);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) envoyer(f);
        }}
        onClick={() => input.current?.click()}
        tabIndex={0}
        role="button"
      >
        {pending ? "Envoi…" : ok ? "✓ Capture enregistrée — recommencer" : "Cliquer, coller ou déposer une image"}
      </div>
      <input ref={input} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) envoyer(f); }} />
    </div>
  );
}
