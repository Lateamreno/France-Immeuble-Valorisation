"use client";

// Navigation en petite fenêtre (retour #57) : sous un certain seuil les deux
// barres latérales sortent du flux pour laisser toute la largeur au tableau.
// Un burger les rappelle en superposition, un second clic les referme et rend
// la place au travail en cours.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Même seuil que la bascule des barres latérales côté CSS. */
const SEUIL = 1100;
/** Téléphone : en dessous, le dashboard replie ses colonnes par défaut. */
const SEUIL_TEL = 640;

export function Burger() {
  const chemin = usePathname();
  const [etroit, setEtroit] = useState(false);
  const [tel, setTel] = useState(false);
  const [ouvert, setOuvert] = useState<"nav" | "fiche" | null>(null);
  const [aFiche, setAFiche] = useState(false);

  useEffect(() => {
    const mesurer = () => {
      setEtroit(window.innerWidth < SEUIL);
      setTel(window.innerWidth < SEUIL_TEL);
    };
    mesurer();
    window.addEventListener("resize", mesurer);
    return () => window.removeEventListener("resize", mesurer);
  }, []);

  // Changer de page referme ce qui était ouvert. Ajusté pendant le rendu,
  // la façon prévue de réagir à un changement d'adresse sans clignoter.
  const [cheminVu, setCheminVu] = useState(chemin);
  if (chemin !== cheminVu) {
    setCheminVu(chemin);
    setOuvert(null);
  }

  // Le sommaire de fiche n'existe que sur les écrans qui en ont un. On le
  // lisait une fois, au changement d'adresse ; depuis l'écran d'attente de la
  // fiche (#432) l'adresse change AVANT que le rail ne soit monté, et cette
  // lecture unique le manquait : le bouton « Sommaire » n'apparaissait plus
  // jamais sur téléphone (MAV : « sur portable je n'ai pas accès au menu
  // sticky de droite de l'immeuble »). On observe donc le document, et on suit
  // le rail à son arrivée comme à son départ — une seule lecture par image,
  // quel que soit le nombre de changements.
  useEffect(() => {
    let prevu: number | null = null;
    const lire = () => { prevu = null; setAFiche(!!document.querySelector(".brail")); };
    const obs = new MutationObserver(() => { if (prevu === null) prevu = requestAnimationFrame(lire); });
    obs.observe(document.body, { childList: true, subtree: true });
    prevu = requestAnimationFrame(lire);
    return () => { obs.disconnect(); if (prevu !== null) cancelAnimationFrame(prevu); };
  }, []);

  // Sur un panneau qui couvre l'écran, choisir une rubrique doit montrer la
  // rubrique : le sommaire se referme sur le choix. Les en-têtes de groupe
  // (Documents, Acheteurs) ne font que déplier leurs entrées, ils le laissent
  // ouvert.
  useEffect(() => {
    if (ouvert !== "fiche") return;
    const clic = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest(".brail button.srow2:not(.sgroupe), .brail .srow2-in")) setOuvert(null);
    };
    document.addEventListener("click", clic);
    return () => document.removeEventListener("click", clic);
  }, [ouvert]);

  // Les classes pilotent la mise en page : le CSS reste maître du rendu.
  useEffect(() => {
    const c = document.body.classList;
    c.toggle("nav-etroite", etroit);
    c.toggle("ecran-tel", tel);
    c.toggle("nav-ouverte", ouvert === "nav");
    c.toggle("fiche-ouverte", ouvert === "fiche");
    return () => { c.remove("nav-etroite", "ecran-tel", "nav-ouverte", "fiche-ouverte"); };
  }, [etroit, tel, ouvert]);

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
        {/* Poussé à droite par le `space-between` de la barre : c'est le bord
            d'où sort le sommaire. Sur les très petits écrans le libellé se
            réduit à « Sommaire », sinon les deux boutons se chevauchent. */}
        {aFiche && (
          <button type="button" className={`brg${ouvert === "fiche" ? " on" : ""}`}
            aria-expanded={ouvert === "fiche"} onClick={() => bascule("fiche")}>
            <Traits /> {tel ? "Sommaire" : "Sommaire de la fiche"}
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
