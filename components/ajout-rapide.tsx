"use client";

/**
 * L'habillage des fenêtres d'ajout rapide (retours #520, #526, #527).
 *
 * MAV : « je veux que tu recopies le style à 100 %, là c'est triste ta
 * modale », « donne-lui de la couleur et de la structure comme sur l'ancien
 * BO, ce qui ne t'empêche pas de la rendre plus belle », « revois toutes les
 * modales d'ajout rapide pour qu'elles soient sur le même style ».
 *
 * Le dessin du BO Bubble, repris pièce à pièce :
 *   · un bandeau sombre, l'icône et le titre en blanc, centrés ;
 *   · le corps en lignes séparées d'un filet : une icône, un libellé, et à
 *     droite ce qui est choisi ;
 *   · tant qu'il manque quelque chose d'obligatoire, la ligne le dit en rouge,
 *     triangle d'alerte compris (« Sélectionnez un immeuble ») ;
 *   · un pied gris clair, la question oui / non à gauche, le bouton vert à
 *     droite.
 *
 * Toutes les fenêtres d'ajout (contact, immeuble, recherche, proposition,
 * visite, offre) passent par ici : une seule source, modifiée partout.
 */
import { useState, type ReactNode } from "react";
import { Modale } from "@/components/modale";

/** Les icônes des lignes, au trait, dans la grammaire des pictos du BO. */
export const ICA = {
  immeuble: <><rect x="5" y="3.5" width="14" height="17" rx="1" /><path d="M9 7.5h2M13 7.5h2M9 11h2M13 11h2M9 14.5h2M13 14.5h2M10.5 20.5v-3h3v3" /></>,
  personne: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6" /></>,
  personnes: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5" /><circle cx="16.5" cy="7.5" r="2.5" /><path d="M15.5 13.2c2.6-.3 4.6 1.3 5 4.3" /></>,
  avion: <><path d="M21 3 3 10.5l6.5 2.5L12 20z" /><path d="m9.5 13 5-4.5" /></>,
  enveloppe: <><rect x="3" y="5.5" width="18" height="13" rx="1.5" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></>,
  trombone: <path d="m16.5 6.5-7.8 7.8a2.2 2.2 0 0 0 3.1 3.1l8.2-8.2a4 4 0 0 0-5.7-5.7L5.9 12a5.8 5.8 0 0 0 8.2 8.2l7-7" />,
  bulle: <path d="M12 4C7 4 3 7.1 3 11c0 2.1 1.2 4 3.2 5.3-.2 1.2-.8 2.3-1.8 3.2 1.8 0 3.4-.6 4.6-1.7.9.2 1.9.3 3 .3 5 0 9-3.1 9-7S17 4 12 4z" />,
  calendrier: <><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>,
  euro: <><path d="M17.5 6.5A6.5 6.5 0 1 0 17.5 17.5" /><path d="M4.5 10.5h9M4.5 13.5h9" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.4" /></>,
  etiquette: <><path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z" /><circle cx="8" cy="8" r="1.4" /></>,
  pdf: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 13h6M9 16.5h4" /></>,
  repere: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  tel: <path d="M6.6 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.1 6.1l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" />,
  cible: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".8" /></>,
  loupe: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.8-4.8" /></>,
  agent: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5.5 20.5c.7-4 3.4-6 6.5-6s5.8 2 6.5 6" /><path d="m12 14.5 1.3 2.2L12 20l-1.3-3.3z" /></>,
};

const ALERTE = <><path d="M12 3.5 21.5 20h-19z" /><path d="M12 10v4.5M12 17.2v.3" /></>;
const CHEVRON = <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />;

/** La fenêtre : bandeau sombre, icône et titre au centre. */
export function FenetreAjout({
  icone, titre, onFermer, pied, large, children, className,
}: {
  icone: ReactNode;
  titre: ReactNode;
  onFermer: () => void;
  pied?: ReactNode;
  large?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Modale
      titre={<span className="aj-titre"><svg viewBox="0 0 24 24" aria-hidden>{icone}</svg>{titre}</span>}
      onFermer={onFermer} fermeDehors={false}
      className={`aj${large ? " lg" : ""}${className ? ` ${className}` : ""}`}
      pied={pied}
    >
      {children}
    </Modale>
  );
}

/**
 * Une ligne de la fenêtre. `manque` (un texte) la passe en rouge avec le
 * triangle, à la place du libellé. `resume` se range à droite. `repliable` :
 * la ligne s'ouvre et se ferme d'un clic, comme les chevrons du BO.
 */
export function Ligne({
  icone, titre, manque, resume, repliable, ouverte = true, children,
}: {
  icone: ReactNode;
  titre: ReactNode;
  manque?: string | false | null;
  resume?: ReactNode;
  repliable?: boolean;
  ouverte?: boolean;
  children?: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(ouverte);
  const visible = !repliable || ouvert;
  const tete = (
    <>
      <svg className="aj-ic" viewBox="0 0 24 24" aria-hidden>{manque ? ALERTE : icone}</svg>
      <span className="aj-lt">{manque || titre}</span>
      {resume && <span className="aj-lr">{resume}</span>}
      {repliable && <svg className={`aj-chev${ouvert ? " on" : ""}`} viewBox="0 0 24 24" aria-hidden>{CHEVRON}</svg>}
    </>
  );
  return (
    <section className={`aj-l${manque ? " manque" : ""}`}>
      {repliable
        ? <button type="button" className="aj-lh" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>{tete}</button>
        : <div className="aj-lh">{tete}</div>}
      {visible && children && <div className="aj-lc">{children}</div>}
    </section>
  );
}

/** « Envoyer par e-mail ○ Oui ○ Non » — la question du pied, à gauche. */
export function OuiNon({
  libelle, valeur, onChange,
}: { libelle: string; valeur: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="aj-on" role="radiogroup" aria-label={libelle}>
      <span>{libelle}</span>
      {([[true, "Oui"], [false, "Non"]] as const).map(([v, l]) => (
        <button key={l} type="button" role="radio" aria-checked={valeur === v}
          className={valeur === v ? "on" : ""} onClick={() => onChange(v)}>
          <i />{l}
        </button>
      ))}
    </span>
  );
}

/** Une pastille de résumé, à droite d'une ligne (« MAV », « Benjamin S. »). */
export function Resume({ children, vide }: { children: ReactNode; vide?: boolean }) {
  return <span className={`aj-res${vide ? " vide" : ""}`}>{children}</span>;
}
