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
import { capturerCartes, uploadPhoto } from "@/lib/bo/actions";

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
  /* Google répond-il ? Tant que la clé n'est pas posée, /api/staticmap renvoie
     404 : on retombe sur la carte intégrée et la capture reste manuelle. */
  const [googleOk, setGoogleOk] = useState(true);

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
      <VueCarte titre={`La France — ${adresse}`} lat={lat} lon={lon} zoom={5}
        onEchec={() => setGoogleOk(false)} />
      <VueCarte titre={`Le quartier — ${adresse}`} lat={lat} lon={lon} zoom={14}
        onEchec={() => setGoogleOk(false)} />
      {immeubleId && (
        <CaptureCarte immeubleId={immeubleId} dejaCapturee={!!capture} auto={googleOk} />
      )}
    </div>
  );
}

/** Une carte avec ses contrôles : carré satellite et croix directionnelle,
 *  comme dans le BO (retour #43). Ils agissent réellement sur la vue —
 *  la croix décale le centre, le carré bascule en vue aérienne. */
function VueCarte({
  titre, lat, lon, zoom, onEchec,
}: {
  titre: string; lat: number; lon: number; zoom: number;
  /** Prévient le parent que Google ne répond pas (clé absente ou refusée). */
  onEchec?: () => void;
}) {
  const [statique, setStatique] = useState(true);
  /* #178 — la croix de déplacement et la bascule plan/satellite ont disparu :
     « fais disparaître la photo satellite à gauche et la croix de navigation à
     droite ». Elles encombraient la carte en permanence, et la carte intégrée
     se déplace très bien à la souris. La carte reste donc centrée sur le
     point géocodé, sans commande posée dessus. */
  const cLat = lat;
  const cLon = lon;
  const q = `${cLat},${cLon}`;

  return (
    <div className="emp-map">
      {/* Repli visuel : si Google ne se charge pas (réseau d'entreprise,
          extension qui bloque), la carte OpenStreetMap reste visible
          dessous plutôt qu'un rectangle vide. */}
      <span className="emp-map-fond">
        <Carte lat={cLat} lon={cLon} zoom={zoom} largeur={340} hauteur={210}
          titre={titre} fond={zoom < 8 ? "clair" : "osm"} />
      </span>
      {/* Carte statique servie par notre relais : la clé Google reste au
          serveur. Si elle n'est pas configurée, la route répond 404 et on
          bascule sur la carte intégrée, sans clé. */}
      {statique ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={titre}
          src={`/api/staticmap?lat=${cLat}&lon=${cLon}&z=${zoom}&w=400&h=300&pin=${zoom < 8 ? 0 : 1}`}
          onError={() => { setStatique(false); onEchec?.(); }} />
      ) : (
        <iframe title={titre} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
          src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&output=embed`} />
      )}

    </div>
  );
}

/** Import d'une capture de carte : elle rejoint les photos de l'immeuble
 *  (type « Carte ») et devient donc disponible dans le dossier de vente. */
function CaptureCarte({
  immeubleId, dejaCapturee, auto,
}: {
  immeubleId: string; dejaCapturee?: boolean;
  /** Google répond : l'app sait fabriquer la capture toute seule (#75). */
  auto?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [ok, setOk] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const capturer = () =>
    start(async () => {
      setErreur(null);
      try {
        await capturerCartes(immeubleId);
        setOk(true);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "capture impossible");
      }
    });

  const envoyer = (f: File) =>
    start(async () => {
      const fd = new FormData();
      fd.set("file", f);
      const r = await uploadPhoto(immeubleId, "Carte", null, fd);
      if (r.ok) setOk(true);
      else setErreur(r.message);
    });

  return (
    <div className="carte-cap">
      <p>
        {auto
          ? (dejaCapturee
            ? "Une capture existe déjà : « Capturer les cartes » la remplacera dans le dossier de vente."
            : "L'app peut fabriquer la capture des deux cartes toute seule — ou collez la vôtre (Ctrl+V).")
          : (dejaCapturee
            ? "Une capture existe déjà : en déposer une nouvelle la remplacera dans le dossier de vente."
            : "La capture de la carte n'est pas encore faite. Collez (Ctrl+V) ou déposez-la : elle remplacera la carte ici et sera reprise dans le dossier de vente.")}
      </p>
      {auto && (
        <button type="button" className="carte-auto" disabled={pending} onClick={capturer}>
          {pending ? "Capture en cours…" : ok ? "✓ Cartes capturées — recommencer" : "📷 Capturer les cartes"}
        </button>
      )}
      {erreur && <p className="carte-err">{erreur}</p>}
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
