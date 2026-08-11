"use client";

// Colonne de filtres des vues listes du BO (Immeubles, Recherches) :
// Idéal pour · Destination principale · Prix · Rentabilité · Occupation ·
// Surface · Statut · Tri · Réinitialiser.
import type { ListCard } from "@/lib/bubble/server";

export type Filtres = {
  ideal: string;
  destination: string;
  statut: string;
  prixMin: string; prixMax: string;
  rentaMin: string;
  occMin: string; occMax: string;
  surfMin: string; surfMax: string;
  tri: string;
};

export const FILTRES_VIDES: Filtres = {
  ideal: "", destination: "", statut: "",
  prixMin: "", prixMax: "", rentaMin: "",
  occMin: "", occMax: "", surfMin: "", surfMax: "", tri: "recent",
};

const TRIS = [
  { key: "recent", label: "Date de modification (plus récents en premiers)" },
  { key: "ancien", label: "Date de modification (plus anciens en premiers)" },
  { key: "prix_desc", label: "Prix (décroissant)" },
  { key: "prix_asc", label: "Prix (croissant)" },
  { key: "renta_desc", label: "Rentabilité (décroissante)" },
  { key: "surface_desc", label: "Surface (décroissante)" },
];

const n = (v: string) => {
  const x = parseFloat(v.replace(",", "."));
  return Number.isFinite(x) ? x : undefined;
};

/** Applique les filtres puis le tri à une liste de cartes. */
export function appliquerFiltres(rows: ListCard[], f: Filtres): ListCard[] {
  const entre = (v: number | undefined, min?: number, max?: number) =>
    (min === undefined || (v !== undefined && v >= min)) &&
    (max === undefined || (v !== undefined && v <= max));

  const gardees = rows.filter((r) => {
    const m = r.mesures ?? {};
    const fa = r.facettes ?? {};
    if (f.ideal && fa.ideal !== f.ideal) return false;
    if (f.destination && fa.destination !== f.destination) return false;
    if (f.statut && fa.statut !== f.statut) return false;
    if (!entre(m.prix, n(f.prixMin), n(f.prixMax))) return false;
    if (!entre(m.renta, n(f.rentaMin), undefined)) return false;
    if (!entre(m.occupation, n(f.occMin), n(f.occMax))) return false;
    if (!entre(m.surface, n(f.surfMin), n(f.surfMax))) return false;
    return true;
  });

  const val = (r: ListCard, k: "prix" | "renta" | "surface") => r.mesures?.[k] ?? -Infinity;
  const parDate = (a: ListCard, b: ListCard) => String(b.date ?? "").localeCompare(String(a.date ?? ""));
  switch (f.tri) {
    case "ancien": return [...gardees].sort((a, b) => -parDate(a, b));
    case "prix_desc": return [...gardees].sort((a, b) => val(b, "prix") - val(a, "prix"));
    case "prix_asc": return [...gardees].sort((a, b) => val(a, "prix") - val(b, "prix"));
    case "renta_desc": return [...gardees].sort((a, b) => val(b, "renta") - val(a, "renta"));
    case "surface_desc": return [...gardees].sort((a, b) => val(b, "surface") - val(a, "surface"));
    default: return [...gardees].sort(parDate);
  }
}

export function PanneauFiltres({
  rows, f, onChange,
}: {
  /** Sert à ne proposer que les valeurs réellement présentes. */
  rows: ListCard[];
  f: Filtres;
  onChange: (f: Filtres) => void;
}) {
  const valeurs = (k: "ideal" | "destination" | "statut") =>
    [...new Set(rows.map((r) => r.facettes?.[k]).filter(Boolean) as string[])].sort();
  const set = (patch: Partial<Filtres>) => onChange({ ...f, ...patch });
  const actif = JSON.stringify(f) !== JSON.stringify(FILTRES_VIDES);

  return (
    <aside className="fltr">
      <label className="fltr-l">
        <span><svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z" /></svg> Idéal pour</span>
        <select value={f.ideal} onChange={(e) => set({ ideal: e.target.value })}>
          <option value="">Tous</option>
          {valeurs("ideal").map((v) => <option key={v}>{v}</option>)}
        </select>
      </label>

      <label className="fltr-l">
        <span><svg viewBox="0 0 24 24"><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></svg> Destination principale</span>
        <select value={f.destination} onChange={(e) => set({ destination: e.target.value })}>
          <option value="">Toutes</option>
          {valeurs("destination").map((v) => <option key={v}>{v}</option>)}
        </select>
      </label>

      <div className="fltr-l">
        <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M15 9.2c-.7-.8-1.8-1.2-3-1.2-1.7 0-2.7.8-2.7 1.9 0 2.7 5.7 1.3 5.7 4.1 0 1.2-1.1 2-2.9 2-1.3 0-2.4-.4-3.1-1.2M12 6.2v11.6" /></svg> Prix</span>
        <div className="fltr-r">
          <input value={f.prixMin} onChange={(e) => set({ prixMin: e.target.value })} /><i>€</i>
          <em>à</em>
          <input value={f.prixMax} onChange={(e) => set({ prixMax: e.target.value })} /><i>€</i>
        </div>
      </div>

      <div className="fltr-l">
        <span><svg viewBox="0 0 24 24"><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></svg> Rentabilité</span>
        <div className="fltr-r">
          <em>≥</em>
          <input value={f.rentaMin} onChange={(e) => set({ rentaMin: e.target.value })} /><i>%</i>
        </div>
      </div>

      <div className="fltr-l">
        <span><svg viewBox="0 0 24 24"><circle cx="8" cy="14" r="4" /><path d="M11 11 20 2M16 6l2.5 2.5" /></svg> Occupation</span>
        <div className="fltr-r">
          <input value={f.occMin} onChange={(e) => set({ occMin: e.target.value })} /><i>%</i>
          <em>à</em>
          <input value={f.occMax} onChange={(e) => set({ occMax: e.target.value })} /><i>%</i>
        </div>
      </div>

      <div className="fltr-l">
        <span><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 15v5h-5M4 4l7 7M20 20l-7-7" /></svg> Surface</span>
        <div className="fltr-r">
          <input value={f.surfMin} onChange={(e) => set({ surfMin: e.target.value })} /><i>m²</i>
          <em>à</em>
          <input value={f.surfMax} onChange={(e) => set({ surfMax: e.target.value })} /><i>m²</i>
        </div>
      </div>

      {valeurs("statut").length > 0 && (
        <label className="fltr-l">
          <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3 2" /></svg> Statut</span>
          <select value={f.statut} onChange={(e) => set({ statut: e.target.value })}>
            <option value="">Tous</option>
            {valeurs("statut").map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
      )}

      <label className="fltr-l">
        <span><svg viewBox="0 0 24 24"><path d="M4 7h13M4 12h9M4 17h5M17 11v8M14 16l3 3 3-3" /></svg> Tri</span>
        <select value={f.tri} onChange={(e) => set({ tri: e.target.value })}>
          {TRIS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </label>

      <button type="button" className="fltr-raz" disabled={!actif} onClick={() => onChange(FILTRES_VIDES)}>
        ⟲ Réinitialiser
      </button>
    </aside>
  );
}
