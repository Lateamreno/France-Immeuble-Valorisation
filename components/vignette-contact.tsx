"use client";

/**
 * La vignette d'un contact (retour #205).
 *
 * MAV : « la petite vignette sur le nom du client qui est cliquable et qui
 * permet d'afficher ses coordonnées, son nombre d'immeubles et de recherches,
 * et quand on clique sur la fiche sauf sur le bouton appeler ou email alors ça
 * nous renvoie directement à la fiche contact du client. Ça c'est quelque chose
 * que tu dois implémenter à plusieurs endroits, c'est très pratique. »
 *
 * D'où un composant seul dans son fichier plutôt qu'un bloc recopié : le jour
 * où la carte change, elle change partout. Trois règles tenues ici :
 *
 *   · la carte entière est un lien vers la fiche contact — sauf « Appeler » et
 *     « E-mail », qui font ce qu'ils annoncent et rien d'autre ;
 *   · elle s'ouvre au clic, se ferme à l'échappement, au clic dehors, ou en
 *     rouvrant la même — jamais deux ouvertes à la fois, chacune gère la sienne ;
 *   · sans contact rattaché, on n'affiche pas de vignette morte : on rend le
 *     nom tel quel, ou rien.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type VignetteData = {
  id: string;
  nom: string;
  qualite?: string;
  tel?: string;
  email?: string;
  immeubles: number;
  recherches: number;
};

const IC_PERS = (
  <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></>
);

export function VignetteContact({
  v, nom, prefixe,
}: {
  /** La fiche du contact ; absente, la vignette n'est qu'un libellé. */
  v?: VignetteData;
  /** Nom à afficher quand il n'y a pas de fiche derrière. */
  nom?: string;
  /** Étiquette posée devant, comme dans le BO : « Mandant », « Propriétaire ». */
  prefixe?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const libelle = v?.nom || nom || "";
  if (!libelle) return null;

  if (!v) {
    return (
      <span className="vgn">
        {prefixe && <i className="vgn-pre">{prefixe}</i>}
        <span className="vgn-chip plat">
          <svg viewBox="0 0 24 24" aria-hidden>{IC_PERS}</svg>
          {libelle}
        </span>
      </span>
    );
  }

  const tel = v.tel?.replace(/[^\d+]/g, "");

  return (
    <span className="vgn" ref={boite}>
      {prefixe && <i className="vgn-pre">{prefixe}</i>}
      <button
        type="button" className={`vgn-chip${ouvert ? " on" : ""}`}
        aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}
      >
        <svg viewBox="0 0 24 24" aria-hidden>{IC_PERS}</svg>
        {libelle}
      </button>

      {ouvert && (
        <span className="vgn-pop">
          {/* Toute la carte mène à la fiche : c'est le geste attendu quand on
              clique sur quelqu'un. Les deux boutons du bas en sont sortis. */}
          <Link className="vgn-card" href={`/contact/${v.id}`}>
            <span className="av"><svg viewBox="0 0 24 24" aria-hidden>{IC_PERS}</svg></span>
            <span className="txt">
              <b>{v.nom}</b>
              {v.qualite && <i>{v.qualite}</i>}
              {v.tel && <span className="l">{v.tel}</span>}
              {v.email && <span className="l mail">{v.email}</span>}
              <span className="cpt">
                <span title="Immeubles rattachés">
                  <svg viewBox="0 0 24 24" aria-hidden><path d="M5 2h11v19h3v2H4v-2h1z" /></svg>
                  {v.immeubles}
                </span>
                <span title="Recherches en cours">
                  <svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
                  {v.recherches}
                </span>
              </span>
            </span>
          </Link>
          <span className="vgn-act">
            <a href={tel ? `tel:${tel}` : undefined} className={tel ? "" : "off"}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
              Appeler
            </a>
            <a href={v.email ? `mailto:${v.email}` : undefined} className={v.email ? "" : "off"}>
              <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 5 9-5" /></svg>
              E-mail
            </a>
          </span>
        </span>
      )}
    </span>
  );
}
