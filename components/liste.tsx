"use client";

// Coquille commune des vues listes du BO : recherche, onglets de statut,
// compteur de résultats, pagination 10/page, cartes avec avatar agent.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ListCard } from "@/lib/bubble/server";
import { appliquerFiltres, FILTRES_VIDES, PanneauFiltres, type Filtres } from "@/components/filtres-liste";
import { Facade } from "@/components/facade";

const TAILLES = [10, 25, 50, 100];

export function ListeShell({
  rows,
  tabs,
  searchPlaceholder,
  /** Affiche la colonne de filtres du BO (Immeubles, Recherches). */
  filtres = false,
  vignettes = false,
  titre,
  actions,
}: {
  rows: ListCard[];
  tabs: { key: string; label: string }[];
  searchPlaceholder: string;
  filtres?: boolean;
  /** Ajoute la vignette de façade et le lien Street View (Immeubles, #122). */
  vignettes?: boolean;
  /** Repris dans la barre collée quand les filtres sont affichés. */
  titre?: string;
  /** Action propre à l'écran, posée à droite de la barre du haut. */
  actions?: React.ReactNode;
}) {
  const [tab, setTab] = useState(tabs[0]?.key ?? "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [taille, setTaille] = useState(10);
  const [f, setF] = useState<Filtres>(FILTRES_VIDES);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const base = rows.filter(
      (r) =>
        r.group === tab &&
        (!qq || `${r.title} ${r.sub ?? ""} ${r.note ?? ""} ${r.acquereur ?? ""}`.toLowerCase().includes(qq)),
    );
    return filtres ? appliquerFiltres(base, f) : base;
  }, [rows, tab, q, filtres, f]);
  const pages = Math.max(1, Math.ceil(filtered.length / taille));
  const cur = Math.min(page, pages);
  const slice = filtered.slice((cur - 1) * taille, cur * taille);
  const countOf = (k: string) => rows.filter((r) => r.group === k).length;

  /* Avec les filtres, la recherche monte dans une barre collée en haut, sur
     toute la largeur, et les onglets deviennent un interrupteur à sa droite —
     c'est la disposition du BO (retour #110). Sans filtres, on garde la barre
     simple : les écrans concernés n'ont pas de colonne à gauche. */
  const barre = (
    <div className={filtres ? "lstx-top" : "lst-bar"}>
      {filtres && titre && <h1 className="lstx-titre">{titre}</h1>}
      <div className="lst-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
        <input placeholder={searchPlaceholder} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {filtres ? (
        <div className="lstx-sw" role="group" aria-label="Vue">
          {tabs.map((t) => (
            <button key={t.key} type="button" className={tab === t.key ? "on" : undefined}
              onClick={() => { setTab(t.key); setPage(1); }}>
              {t.label}{countOf(t.key) > 0 && <span className="n">{countOf(t.key)}</span>}
            </button>
          ))}
        </div>
      ) : (
        <span className="lst-count">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
      )}
      {actions}
    </div>
  );

  const contenu = (
    <div className="lst">
      {!filtres && barre}
      {!filtres && (
        <div className="ftabs">
          {tabs.map((t) => (
            <button key={t.key} type="button" className={`ftab${tab === t.key ? " on" : ""}`} onClick={() => { setTab(t.key); setPage(1); }}>
              {t.label}{countOf(t.key) > 0 && <span className="n">{countOf(t.key)}</span>}
            </button>
          ))}
        </div>
      )}

      {slice.map((r) => {
        const inner = (
          <>
            {/* La façade, quand on l'a : une liste d'immeubles sans photo, « on
                comprend rien » (retour #122). */}
            {vignettes && (
              <span className="lphoto">
                <Facade photoUrl={r.photoUrl} facadeRue={r.facadeRue}
                  repli={<i>Pas de photo</i>} />
              </span>
            )}
            {/* La couleur du commercial vient de la base : c'est elle qui fait
                qu'on repère à qui appartient une fiche sans lire les initiales. */}
            <span className="lav" style={r.avatarCouleur ? { background: r.avatarCouleur } : undefined}>
              {r.avatar}
            </span>
            <div className="lmid">
              <div className="lt">{r.title}{r.note && <span className="lnote"> · {r.note}</span>}</div>
              {r.sub && <div className="ls">{r.sub}</div>}
            </div>
            {r.acquereur ? (
              <span className="lcont">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
                {r.acquereur}
                {r.grade && <b className={`note n${r.grade}`}>{r.grade}</b>}
              </span>
            ) : r.grade ? (
              // Le nom est déjà dans le sous-titre : seule la note est ajoutée.
              <b className={`note n${r.grade}`} title={`Classement acquéreur ${r.grade}`}>{r.grade}</b>
            ) : null}
            {r.right && r.right.length > 0 && (
              <div className="lright">{r.right.map((x, i) => <span key={i}>{x}</span>)}</div>
            )}
            {r.badge && (
              <span className={r.badge.tone === "green" ? "badge-g" : r.badge.tone === "red" ? "badge-r" : "badge-o"}>
                {r.badge.label}
              </span>
            )}
            {/* La façade en Street View, dans une autre fenêtre : on regarde la
                rue sans perdre sa place dans la liste (retour #122). La ligne
                étant déjà un lien, c'est un bouton — pas un <a> dans un <a>. */}
            {vignettes && r.streetUrl && (
              <span
                className="lstreet" role="button" tabIndex={0}
                title="Voir la façade sur Google Street View (nouvelle fenêtre)"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(r.streetUrl, "_blank", "noopener"); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault(); e.stopPropagation();
                    window.open(r.streetUrl, "_blank", "noopener");
                  }
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="7" r="3" />
                  <path d="M6.5 21c.3-4.2 2.6-6.4 5.5-6.4s5.2 2.2 5.5 6.4" />
                  <path d="M3 12.5A9 9 0 0 1 12 3.5a9 9 0 0 1 9 9" />
                </svg>
                Street View
              </span>
            )}
          </>
        );
        return r.href ? (
          <Link key={r.id} href={r.href} className="lrow">{inner}</Link>
        ) : (
          <div key={r.id} className="lrow">{inner}</div>
        );
      })}
      {slice.length === 0 && <div className="fempty">Aucun résultat.</div>}

      {/* Barre de pagination du BO : résultats à gauche, navigation au centre,
          nombre d'éléments par page à droite. */}
      <div className="lst-pager">
        <span className="lst-res">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
        <span className="sp" style={{ flex: 1 }} />
        <button className="pgb" type="button" title="Première page" disabled={cur <= 1} onClick={() => setPage(1)}>«</button>
        <button className="pgb" type="button" title="Page précédente" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>‹</button>
        <span className="pgn">Page {cur} / {pages}</span>
        <button className="pgb" type="button" title="Page suivante" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>›</button>
        <button className="pgb" type="button" title="Dernière page" disabled={cur >= pages} onClick={() => setPage(pages)}>»</button>
        <span className="sp" style={{ flex: 1 }} />
        <select className="pgs" value={taille} onChange={(e) => { setTaille(Number(e.target.value)); setPage(1); }}>
          {TAILLES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="pgl">éléments par page</span>
      </div>
    </div>
  );

  if (!filtres) return contenu;
  return (
    <div className="lstx">
      {barre}
      <div className="lst-avec-filtres">
        <PanneauFiltres rows={rows.filter((r) => r.group === tab)} f={f}
          onChange={(nf) => { setF(nf); setPage(1); }} />
        <div className="lst-col">{contenu}</div>
      </div>
    </div>
  );
}
