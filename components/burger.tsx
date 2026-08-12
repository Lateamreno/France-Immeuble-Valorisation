"use client";

// Navigation en petite fenêtre (retour #57) : sous un certain seuil les deux
// barres latérales sortent du flux pour laisser toute la largeur au tableau.
// Un burger les rappelle en superposition, un second clic les referme et rend
// la place au travail en cours.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Même seuil que la bascule des barres latérales côté CSS. */
const SEUIL = 1100;

export function Burger() {
  const chemin = usePathname();
  const [etroit, setEtroit] = useState(false);
  const [ouvert, setOuvert] = useState<"nav" | "fiche" | null>(null);
  const [aFiche, setAFiche] = useState(false);

  useEffect(() => {
    const mesurer = () => setEtroit(window.innerWidth < SEUIL);
    mesurer();
    window.addEventListener("resize", mesurer);
    return () => window.removeEventListener("resize", mesurer);
  }, []);

  // Le sommaire de fiche n'existe que sur les écrans qui en ont un.
  useEffect(() => {
    setAFiche(!!document.querySelector(".brail"));
    setOuvert(null);
  }, [chemin]);

  // Les classes pilotent la mise en page : le CSS reste maître du rendu.
  useEffect(() => {
    const c = document.body.classList;
    c.toggle("nav-etroite", etroit);
    c.toggle("nav-ouverte", ouvert === "nav");
    c.toggle("fiche-ouverte", ouvert === "fiche");
    return () => { c.remove("nav-etroite", "nav-ouverte", "fiche-ouverte"); };
  }, [etroit, ouvert]);

  // Échap referme, comme partout ailleurs dans l'outil.
  useEffect(() => {
    if (!ouvert) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ouvert]);

  if (!etroit) return null;

  const bascule = (quoi: "nav" | "fiche") => setOuvert((o) => (o === quoi ? null : quoi));

  return (
    <>
      <div className="brg-bar">
        <button type="button" className={`brg${ouvert === "nav" ? " on" : ""}`}
          aria-expanded={ouvert === "nav"} onClick={() => bascule("nav")}>
          <Traits /> Menu
        </button>
        {aFiche && (
          <button type="button" className={`brg${ouvert === "fiche" ? " on" : ""}`}
            aria-expanded={ouvert === "fiche"} onClick={() => bascule("fiche")}>
            <Traits /> Sommaire de la fiche
          </button>
        )}
      </div>
      {ouvert && <div className="brg-voile" onClick={() => setOuvert(null)} aria-hidden />}
    </>
  );
}

const Traits = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
