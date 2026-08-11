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
  lat, lon, adresse, immeubleId, captures = [],
}: {
  lat: number;
  lon: number;
  adresse: string;
  /** Permet d'enregistrer la capture dans les photos de l'immeuble. */
  immeubleId?: string;
  /** Captures de carte déjà enregistrées : la plus récente remplace la carte
   *  vivante, comme le veut le BO (retour #44). */
  captures?: { id: string; url?: string }[];
}) {
  const capture = captures.find((c) => c.url);
  const [vivante, setVivante] = useState(!capture);

  if (capture && !vivante) {
    return (
      <div className="emp-maps">
        <figure className="emp-capture">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={capture.url} alt={`Carte de situation — ${adresse}`} />
          <figcaption>
            Capture enregistrée
            <button type="button" className="fadd" onClick={() => setVivante(true)}>
              Reprendre la carte
            </button>
          </figcaption>
        </figure>
      </div>
    );
  }

  return (
    <div className="emp-maps">
      <VueCarte titre={`La France — ${adresse}`} lat={lat} lon={lon} zoom={5} />
      <VueCarte titre={`Le quartier — ${adresse}`} lat={lat} lon={lon} zoom={14} />
      {immeubleId && <CaptureCarte immeubleId={immeubleId} dejaCapturee={!!capture} />}
    </div>
  );
}

/** Une carte avec ses contrôles : carré satellite et croix directionnelle,
 *  comme dans le BO (retour #43). Ils agissent réellement sur la vue —
 *  la croix décale le centre, le carré bascule en vue aérienne. */
function VueCarte({
  titre, lat, lon, zoom,
}: {
  titre: string; lat: number; lon: number; zoom: number;
}) {
  const cle = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const [sat, setSat] = useState(false);
  const [dLat, setDLat] = useState(0);
  const [dLon, setDLon] = useState(0);

  // Un cran de déplacement vaut environ un quart de la vue au zoom courant.
  const pas = 360 / 2 ** zoom / 4;
  const cLat = lat + dLat;
  const cLon = lon + dLon;
  const q = `${cLat},${cLon}`;
  const recentrer = () => { setDLat(0); setDLon(0); };

  return (
    <div className="emp-map">
      {/* Repli visuel : si Google ne se charge pas (réseau d'entreprise,
          extension qui bloque), la carte OpenStreetMap reste visible
          dessous plutôt qu'un rectangle vide. */}
      <span className="emp-map-fond">
        <Carte lat={cLat} lon={cLon} zoom={zoom} largeur={340} hauteur={210}
          titre={titre} fond={zoom < 8 ? "clair" : "osm"} />
      </span>
      {cle ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={titre}
          src={`https://maps.googleapis.com/maps/api/staticmap?center=${q}&zoom=${zoom}&size=400x300&scale=2&maptype=${sat ? "hybrid" : "roadmap"}&markers=${lat},${lon}&key=${cle}`} />
      ) : (
        <iframe title={titre} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
          src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&t=${sat ? "k" : "m"}&output=embed`} />
      )}

      {/* Croix directionnelle */}
      <div className="map-croix" aria-label="Déplacer la carte">
        <button type="button" className="h" onClick={() => setDLat(dLat + pas)} aria-label="Vers le nord">▲</button>
        <button type="button" className="g" onClick={() => setDLon(dLon - pas)} aria-label="Vers l&apos;ouest">◀</button>
        <button type="button" className="c" onClick={recentrer} aria-label="Recentrer sur le bien">●</button>
        <button type="button" className="d" onClick={() => setDLon(dLon + pas)} aria-label="Vers l&apos;est">▶</button>
        <button type="button" className="b" onClick={() => setDLat(dLat - pas)} aria-label="Vers le sud">▼</button>
      </div>

      {/* Carré de bascule plan / satellite */}
      <button type="button" className={`map-sat${sat ? " on" : ""}`} onClick={() => setSat(!sat)}
        title={sat ? "Revenir au plan" : "Vue satellite"}>
        <span>{sat ? "Plan" : "Satellite"}</span>
      </button>
    </div>
  );
}

/** Import d'une capture de carte : elle rejoint les photos de l'immeuble
 *  (type « Carte ») et devient donc disponible dans le dossier de vente. */
function CaptureCarte({ immeubleId, dejaCapturee }: { immeubleId: string; dejaCapturee?: boolean }) {
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
        {dejaCapturee
          ? "Une capture existe déjà : en déposer une nouvelle la remplacera dans le dossier de vente."
          : "La capture de la carte n'est pas encore faite. Collez (Ctrl+V) ou déposez-la : elle remplacera la carte ici et sera reprise dans le dossier de vente."}
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
