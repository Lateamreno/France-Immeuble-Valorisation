"use client";

// Colonne de filtres des vues listes du BO (Immeubles, Recherches).
//
// Reprise du BO d'origine (retours #110 à #113) : fond gris, cases blanches,
// libellé et champ sur la MÊME ligne, séparateurs entre les lignes. Les
// statuts et les tris sont ceux du BO, pas ceux qu'on peut déduire des
// données — une liste déroulante qui change de contenu selon ce qu'on a sous
// les yeux ne se mémorise pas.
import { useState } from "react";
import type { ListCard } from "@/lib/bubble/server";

export type Filtres = {
  ideal: string;
  destination: string;
  statut: string;
  prixMin: string; prixMax: string;
  rentaMin: string;
  occMin: string; occMax: string;
  surfMin: string; surfMax: string;
  /** Villes, départements et régions retenus — en OU entre eux. */
  lieux: string[];
  tri: string;
};

export const FILTRES_VIDES: Filtres = {
  ideal: "", destination: "", statut: "",
  prixMin: "", prixMax: "", rentaMin: "",
  occMin: "", occMax: "", surfMin: "", surfMax: "",
  lieux: [], tri: "relance_recent",
};

/* Les statuts du BO, dans son ordre. Les deux entrées « [OLD] » du menu
   d'origine ne sont pas reprises : MAV les a explicitement écartées. */
export const STATUTS = [
  "1 - FORMULAIRE",
  "2 - Estimation",
  "3 - A transformer",
  "4 - OK pour vendre",
  "5 - Commercialisé (A/B)",
  "6 - Commercialisé (all)",
  "7 - Sous offre",
  "8 - Compromis programmé",
  "9 - Sous compromis",
  "10 - Acte programmé",
  "11 - VENDU",
  "0 - RETIRé",
];

/* Les tris du BO, au complet et dans son ordre. « Date de relance, plus
   récents en premiers » est celui qu'il utilise par défaut. */
const TRIS = [
  { key: "prix_desc", label: "Prix (plus grands en premiers)" },
  { key: "prix_asc", label: "Prix (plus petits en premiers)" },
  { key: "renta_desc", label: "Rendement (plus grands en premiers)" },
  { key: "renta_asc", label: "Rendement (plus petits en premiers)" },
  { key: "occ_desc", label: "Occupation (plus grands en premiers)" },
  { key: "occ_asc", label: "Occupation (plus petits en premiers)" },
  { key: "surface_desc", label: "Surface (plus grands en premiers)" },
  { key: "surface_asc", label: "Surface (plus petits en premiers)" },
  { key: "statut_desc", label: "Statut (plus avancés en premiers)" },
  { key: "statut_asc", label: "Statut (moins avancés en premiers)" },
  { key: "creation_recent", label: "Date de création (plus récents en premiers)" },
  { key: "creation_ancien", label: "Date de création (plus anciens en premiers)" },
  { key: "modif_recent", label: "Date de modification (plus récents en premiers)" },
  { key: "modif_ancien", label: "Date de modification (plus anciens en premiers)" },
  { key: "relance_recent", label: "Date de relance (plus récents en premiers)" },
  { key: "relance_lointain", label: "Date de relance (plus lointains en premiers)" },
  { key: "archiv_recent", label: "Date d'archivage (plus récents en premiers)" },
  { key: "archiv_ancien", label: "Date d'archivage (plus anciens en premiers)" },
];

const n = (v: string) => {
  const x = parseFloat(v.replace(",", "."));
  return Number.isFinite(x) ? x : undefined;
};

/** Le rang numérique d'un statut (« 7 - Sous offre » → 7). */
const rangStatut = (s?: string) => {
  const m = /^(\d+)/.exec(s ?? "");
  return m ? Number(m[1]) : -1;
};

/** Les lieux d'une carte, sous la forme utilisée par le filtre. */
const lieuxDe = (r: ListCard) => {
  const f = r.facettes ?? {};
  return [
    f.ville && `ville:${f.ville}`,
    f.departement && `dep:${f.departement}`,
    f.region && `region:${f.region}`,
  ].filter(Boolean) as string[];
};

export const libelleLieu = (l: string) => {
  const [k, v] = l.split(":");
  return k === "dep" ? `Département ${v}` : k === "region" ? v : v;
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
    /* Un OU, jamais un ET : choisir Paris ET le 92 doit sortir les biens de
       l'un OU de l'autre. Exiger les deux ne renverrait jamais rien — un
       immeuble n'est pas dans deux départements. */
    if (f.lieux.length) {
      const siens = lieuxDe(r);
      if (!f.lieux.some((l) => siens.includes(l))) return false;
    }
    if (!entre(m.prix, n(f.prixMin), n(f.prixMax))) return false;
    if (!entre(m.renta, n(f.rentaMin), undefined)) return false;
    if (!entre(m.occupation, n(f.occMin), n(f.occMax))) return false;
    if (!entre(m.surface, n(f.surfMin), n(f.surfMax))) return false;
    return true;
  });

  const val = (r: ListCard, k: "prix" | "renta" | "surface" | "occupation") =>
    r.mesures?.[k] ?? -Infinity;
  const date = (r: ListCard) => String(r.date ?? "");
  const parDate = (a: ListCard, b: ListCard) => date(b).localeCompare(date(a));
  const tri = [...gardees];

  switch (f.tri) {
    case "prix_desc": return tri.sort((a, b) => val(b, "prix") - val(a, "prix"));
    case "prix_asc": return tri.sort((a, b) => val(a, "prix") - val(b, "prix"));
    case "renta_desc": return tri.sort((a, b) => val(b, "renta") - val(a, "renta"));
    case "renta_asc": return tri.sort((a, b) => val(a, "renta") - val(b, "renta"));
    case "occ_desc": return tri.sort((a, b) => val(b, "occupation") - val(a, "occupation"));
    case "occ_asc": return tri.sort((a, b) => val(a, "occupation") - val(b, "occupation"));
    case "surface_desc": return tri.sort((a, b) => val(b, "surface") - val(a, "surface"));
    case "surface_asc": return tri.sort((a, b) => val(a, "surface") - val(b, "surface"));
    case "statut_desc": return tri.sort((a, b) => rangStatut(b.facettes?.statut) - rangStatut(a.facettes?.statut));
    case "statut_asc": return tri.sort((a, b) => rangStatut(a.facettes?.statut) - rangStatut(b.facettes?.statut));
    /* Création, modification, relance et archivage tombent sur la même date
       tant que la carte n'en porte qu'une. Les entrées existent quand même :
       le menu du BO les propose, et les masquer donnerait l'impression que le
       tri a été oublié. */
    case "creation_ancien":
    case "modif_ancien":
    case "archiv_ancien":
    case "relance_lointain": return tri.sort((a, b) => -parDate(a, b));
    default: return tri.sort(parDate);
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
  const [lieuOuvert, setLieuOuvert] = useState(false);
  const valeurs = (k: "ideal" | "destination") =>
    [...new Set(rows.map((r) => r.facettes?.[k]).filter(Boolean) as string[])].sort();
  const set = (patch: Partial<Filtres>) => onChange({ ...f, ...patch });
  const actif = JSON.stringify(f) !== JSON.stringify(FILTRES_VIDES);

  /** Les lieux réellement présents, groupés. */
  const lieuxDispo = () => {
    const villes = new Set<string>(), deps = new Set<string>(), regions = new Set<string>();
    for (const r of rows) {
      const a = r.facettes ?? {};
      if (a.ville) villes.add(`ville:${a.ville}`);
      if (a.departement) deps.add(`dep:${a.departement}`);
      if (a.region) regions.add(`region:${a.region}`);
    }
    return {
      villes: [...villes].sort((x, y) => x.localeCompare(y)),
      deps: [...deps].sort(),
      regions: [...regions].sort(),
    };
  };

  const basculerLieu = (l: string) =>
    set({ lieux: f.lieux.includes(l) ? f.lieux.filter((x) => x !== l) : [...f.lieux, l] });

  return (
    <aside className="fltr">
      {/* La localisation d'abord : c'est le premier tri que fait un
          commercial, avant même le prix. */}
      <div className="fltr-l">
        <span><svg viewBox="0 0 24 24"><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></svg> Emplacement</span>
        <button type="button" className="fltr-lieu" onClick={() => setLieuOuvert(true)}>
          {f.lieux.length === 0
            ? "Partout"
            : f.lieux.length <= 2
              ? f.lieux.map(libelleLieu).join(", ")
              : `${f.lieux.slice(0, 2).map(libelleLieu).join(", ")} +${f.lieux.length - 2}`}
        </button>
      </div>

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

      <label className="fltr-l">
        <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3 2" /></svg> Statut</span>
        <select value={f.statut} onChange={(e) => set({ statut: e.target.value })}>
          <option value="">Tous</option>
          {STATUTS.map((v) => <option key={v}>{v}</option>)}
        </select>
      </label>

      <label className="fltr-l">
        <span><svg viewBox="0 0 24 24"><path d="M4 7h13M4 12h9M4 17h5M17 11v8M14 16l3 3 3-3" /></svg> Tri</span>
        <select value={f.tri} onChange={(e) => set({ tri: e.target.value })}>
          {TRIS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </label>

      <button type="button" className="fltr-raz" disabled={!actif} onClick={() => onChange(FILTRES_VIDES)}>
        ⟲ Réinitialiser
      </button>

      {lieuOuvert && (
        <div className="modal-ov" onClick={() => setLieuOuvert(false)}>
          <div className="modal lieu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <b>Emplacement</b>
              <button type="button" onClick={() => setLieuOuvert(false)}>✕</button>
            </div>
            <div className="lieu-corps">
              <p className="lieu-aide">
                Plusieurs choix possibles. Un bien sort s&apos;il correspond à <b>l&apos;un</b>{" "}
                d&apos;eux.
              </p>
              {([
                ["Régions", lieuxDispo().regions],
                ["Départements", lieuxDispo().deps],
                ["Villes", lieuxDispo().villes],
              ] as const).map(([titre, liste]) =>
                liste.length ? (
                  <div className="lieu-groupe" key={titre}>
                    <div className="lieu-titre">{titre}</div>
                    <div className="lieu-puces">
                      {liste.map((l) => (
                        <button
                          key={l} type="button"
                          className={`lieu-puce${f.lieux.includes(l) ? " on" : ""}`}
                          onClick={() => basculerLieu(l)}
                        >
                          {libelleLieu(l)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
            <div className="modal-f">
              <button type="button" className="fltr-raz" disabled={!f.lieux.length}
                onClick={() => set({ lieux: [] })}>Tout effacer</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="savebar-go" onClick={() => setLieuOuvert(false)}>
                <span className="ch">›</span> Appliquer
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
