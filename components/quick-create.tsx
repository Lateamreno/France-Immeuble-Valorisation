"use client";

import { useState } from "react";
import { QUICK_CREATE } from "@/lib/nav";

// Barre de création rapide (desktop : barre fixe en bas ;
// mobile : bouton flottant + menu). Les modales de création viendront
// avec les modules correspondants — pour l'instant chaque bouton est
// un point d'ancrage inactif.
export function QuickCreate() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="quickbar">
        <span className="lbl">Créer</span>
        {QUICK_CREATE.map((label) => (
          <button key={label} type="button" title={`Créer : ${label}`}>
            <span className="plus">+</span> {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="fab"
        aria-label="Créer"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
      <div className={`fab-menu${open ? " open" : ""}`}>
        {QUICK_CREATE.map((label) => (
          <button key={label} type="button" onClick={() => setOpen(false)}>
            + {label}
          </button>
        ))}
      </div>
    </>
  );
}
