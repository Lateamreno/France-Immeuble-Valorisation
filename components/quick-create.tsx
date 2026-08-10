"use client";

import { QUICK_CREATE } from "@/lib/nav";

// Icônes des 7 entités (entité + petit « + », comme le BO).
const IC: Record<string, React.ReactNode> = {
  Contact: <><circle cx="10" cy="8" r="3.2" /><path d="M4.5 19.5c.6-3.6 3-5.2 5.5-5.2s4.9 1.6 5.5 5.2" /><path d="M17.5 8.5h4M19.5 6.5v4" /></>,
  Immeuble: <><rect x="4" y="4" width="11" height="16" /><path d="M7.5 8h1.5M11 8h1.5M7.5 12h1.5M11 12h1.5M7.5 16h1.5" /><path d="M17.5 13.5h4M19.5 11.5v4" /></>,
  Mandat: <><path d="M4 9h12v10H4z" /><path d="M7 9V7.5a3 3 0 0 1 6 0V9" /><path d="M17.5 13.5h4M19.5 11.5v4" /></>,
  Recherche: <><circle cx="10" cy="10" r="5.5" /><path d="m18 18-4-4" /><path d="M17.5 8h4M19.5 6v4" /></>,
  Proposition: <><path d="M19 4 4 10l5.5 2.5 2.5 6z" /><path d="M17.5 15.5h4M19.5 13.5v4" /></>,
  Visite: <><path d="M4 14l1.7-4.5h9L16 14" /><rect x="3" y="13.6" width="14" height="3.6" rx="1.2" /><circle cx="6.6" cy="18.6" r="1.2" /><circle cx="13.6" cy="18.6" r="1.2" /><path d="M18.5 8.5h4M20.5 6.5v4" /></>,
  Offre: <><path d="M11 4 4 11l3 3 5.5-5.5M9.5 10.5l5.5 5.5M12.5 13.5l3.5 3.5" /><path d="M17.5 5.5h4M19.5 3.5v4" /></>,
};

// Barre de création rapide fixe en bas — 7 cellules égales (réplique).
export function QuickCreate() {
  return (
    <div className="bottbar">
      {QUICK_CREATE.map((label) => (
        <button key={label} type="button" title={`Créer : ${label}`}>
          <svg viewBox="0 0 24 24">{IC[label]}</svg>
          {label}
        </button>
      ))}
    </div>
  );
}
