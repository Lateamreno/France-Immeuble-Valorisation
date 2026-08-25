"use client";

// Champ d'adresse avec suggestions au fil de la frappe (retours #59 et #60),
// sur la Base Adresse Nationale — gratuite, sans clé, géocodage inclus.
import { useEffect, useRef, useState } from "react";

export type AdresseChoisie = {
  label: string;
  numero?: string;
  rue?: string;
  cp?: string;
  ville?: string;
  lat?: number;
  lon?: number;
};

type Feature = {
  properties: {
    label: string; housenumber?: string; street?: string; name?: string;
    postcode?: string; city?: string;
  };
  geometry: { coordinates: [number, number] };
};

export function AdresseInput({
  valeur = "", placeholder = "Commencez à taper l'adresse…", autoFocus, classe = "min",
  disabled, onChoisir, onSaisie,
}: {
  valeur?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Classe de l'input : les écrans n'ont pas tous la même grille. */
  classe?: string;
  disabled?: boolean;
  onChoisir: (a: AdresseChoisie) => void;
  /** Frappe libre : une adresse peut être hors base (lieu-dit, étranger). */
  onSaisie?: (v: string) => void;
}) {
  const [q, setQ] = useState(valeur);
  const [sugg, setSugg] = useState<Feature[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [sel, setSel] = useState(-1);
  const boite = useRef<HTMLDivElement>(null);
  /** L'adresse retenue : tant que la saisie ne rebouge pas, on ne recherche plus. */
  const [figee, setFigee] = useState<string | null>(valeur || null);

  /* La valeur peut changer d'en haut — c'est le cas quand on rattache un
     contact et que sa fiche remplit l'adresse (retour #133). Sans ça, le champ
     resterait sur ce qu'il affichait avant. */
  const [vue, setVue] = useState(valeur);
  if (valeur !== vue) {
    setVue(valeur);
    /* …mais pas quand c'est notre propre frappe qui remonte : sinon on gèlerait
       la recherche au caractère près. */
    if (valeur !== q) {
      setQ(valeur);
      setFigee(valeur || null);
      setOuvert(false);
    }
  }

  useEffect(() => {
    const t = q.trim();
    const court = t.length < 4 || t === figee;
    const timer = setTimeout(async () => {
      if (court) { setSugg([]); return; }
      try {
        // Relais serveur : voir app/api/adresse/route.ts.
        const r = await fetch(`/api/adresse?q=${encodeURIComponent(t)}`);
        if (!r.ok) return;
        const d = (await r.json()) as { features: Feature[] };
        setSugg(d.features ?? []);
        setOuvert(true);
        setSel(-1);
      } catch { /* réseau coupé : la saisie manuelle reste possible */ }
    }, court ? 0 : 300);
    return () => clearTimeout(timer);
  }, [q, figee]);

  // Un clic hors du champ referme la liste.
  useEffect(() => {
    const fermer = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, []);

  const choisir = (f: Feature) => {
    const p = f.properties;
    setFigee(p.label);
    setQ(p.label);
    setOuvert(false);
    onChoisir({
      label: p.label,
      numero: p.housenumber,
      rue: p.street ?? (p.housenumber ? undefined : p.name),
      cp: p.postcode,
      ville: p.city,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    });
  };

  return (
    <div className="adr-box" ref={boite}>
      <input
        className={classe} style={{ width: "100%" }} disabled={disabled}
        placeholder={placeholder} value={q} autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); onSaisie?.(e.target.value); }}
        onFocus={() => sugg.length > 0 && setOuvert(true)}
        onKeyDown={(e) => {
          if (!ouvert || sugg.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, sugg.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          else if (e.key === "Enter" && sel >= 0) { e.preventDefault(); choisir(sugg[sel]); }
          else if (e.key === "Escape") setOuvert(false);
        }}
      />
      {ouvert && sugg.length > 0 && (
        <div className="adr-sugg">
          {sugg.map((f, i) => (
            <button key={`${f.properties.label}-${i}`} type="button"
              className={i === sel ? "on" : ""}
              onMouseDown={(e) => { e.preventDefault(); choisir(f); }}>
              {f.properties.label}
            </button>
          ))}
          <span className="adr-src">Base Adresse Nationale</span>
        </div>
      )}
    </div>
  );
}
