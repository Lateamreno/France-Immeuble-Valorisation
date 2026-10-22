"use client";

// Saisie d'adresses e-mail comme dans une vraie messagerie : on tape, et dès
// qu'on valide (espace, virgule, point-virgule, entrée, ou en quittant le
// champ) l'adresse devient une pastille avec sa croix. Retour arrière sur un
// champ vide retire la dernière — le réflexe de tout le monde.
import { useState } from "react";

const VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AdressesInput({
  valeurs, onChange, placeholder, id,
}: {
  valeurs: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [saisie, setSaisie] = useState("");
  const [refus, setRefus] = useState(false);

  const ajouter = (brut: string) => {
    const a = brut.trim().replace(/[;,]$/, "");
    if (!a) return true;
    if (!VALIDE.test(a)) { setRefus(true); return false; }
    setRefus(false);
    if (!valeurs.includes(a)) onChange([...valeurs, a]);
    setSaisie("");
    return true;
  };

  return (
    <div className={`adrs${refus ? " refus" : ""}`}>
      {valeurs.map((a) => (
        <span className="adrs-p" key={a}>
          {a}
          <button type="button" title="Retirer" aria-label={`Retirer ${a}`}
            onClick={() => onChange(valeurs.filter((x) => x !== a))}>✕</button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={saisie}
        placeholder={valeurs.length ? "" : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          // Un séparateur en fin de frappe vaut validation.
          if (/[\s,;]$/.test(v)) ajouter(v);
          else { setSaisie(v); setRefus(false); }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); ajouter(saisie); }
          if (e.key === "Backspace" && !saisie && valeurs.length) {
            onChange(valeurs.slice(0, -1));
          }
        }}
        onBlur={() => ajouter(saisie)}
      />
      {refus && <span className="adrs-ko">Adresse incomplète</span>}
    </div>
  );
}
