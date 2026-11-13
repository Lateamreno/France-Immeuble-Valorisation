"use client";

// Bouton « copier », comme le plugin du BO : un clic met la valeur dans le
// presse-papier et le dit — sans confirmation visible, on ne sait jamais si
// le clic a pris.
//
// `navigator.clipboard` n'existe qu'en HTTPS (ou sur localhost). Repli sur la
// vieille méthode pour que le bouton marche partout, y compris derrière un
// proxy interne en http.
import { useEffect, useRef, useState } from "react";

export async function copierTexte(t: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {
    /* refus du navigateur : on tente le repli */
  }
  try {
    const z = document.createElement("textarea");
    z.value = t;
    z.style.position = "fixed";
    z.style.opacity = "0";
    document.body.appendChild(z);
    z.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(z);
    return ok;
  } catch {
    return false;
  }
}

export function Copier({
  valeur, titre = "Copier", petit, cls, children,
}: {
  valeur: string;
  titre?: string;
  /** Variante discrète, posée à côté d'une valeur dans une case. */
  petit?: boolean;
  /** Classe d'habillage, pour se fondre dans une barre d'icônes existante. */
  cls?: string;
  children?: React.ReactNode;
}) {
  const [etat, setEtat] = useState<"" | "ok" | "ko">("");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);

  const cliquer = async () => {
    const ok = await copierTexte(valeur);
    setEtat(ok ? "ok" : "ko");
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setEtat(""), 1600);
  };

  return (
    <button
      type="button"
      className={`${cls ?? "cop"}${petit ? " petit" : ""}${etat ? ` ${etat}` : ""}`}
      title={etat === "ok" ? "Copié" : etat === "ko" ? "Copie impossible" : titre}
      aria-label={titre}
      disabled={!valeur}
      onClick={cliquer}
    >
      {etat === "ok" ? (
        <svg viewBox="0 0 24 24" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="9" y="9" width="11" height="12" rx="1.5" /><path d="M5 15V4h11" />
        </svg>
      )}
      {children && <span>{etat === "ok" ? "Copié" : children}</span>}
    </button>
  );
}
