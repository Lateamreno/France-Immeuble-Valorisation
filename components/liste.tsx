"use client";

// Coquille commune des vues listes du BO : recherche, onglets de statut,
// compteur de résultats, pagination 10/page, cartes avec avatar agent.
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ListCard } from "@/lib/bubble/server";

const TAILLES = [10, 25, 50, 100];

export function ListeShell({
  rows,
  tabs,
  searchPlaceholder,
}: {
  rows: ListCard[];
  tabs: { key: string; label: string }[];
  searchPlaceholder: string;
}) {
  const [tab, setTab] = useState(tabs[0]?.key ?? "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [taille, setTaille] = useState(10);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.group === tab &&
        (!qq || `${r.title} ${r.sub ?? ""} ${r.note ?? ""}`.toLowerCase().includes(qq)),
    );
  }, [rows, tab, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / taille));
  const cur = Math.min(page, pages);
  const slice = filtered.slice((cur - 1) * taille, cur * taille);
  const countOf = (k: string) => rows.filter((r) => r.group === k).length;

  return (
    <div className="lst">
      <div className="lst-bar">
        <div className="lst-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
          <input placeholder={searchPlaceholder} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <span className="lst-count">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
      </div>
      <div className="ftabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={`ftab${tab === t.key ? " on" : ""}`} onClick={() => { setTab(t.key); setPage(1); }}>
            {t.label}{countOf(t.key) > 0 && <span className="n">{countOf(t.key)}</span>}
          </button>
        ))}
      </div>

      {slice.map((r) => {
        const inner = (
          <>
            <span className="lav">{r.avatar}</span>
            <div className="lmid">
              <div className="lt">{r.title}{r.note && <span className="lnote"> · {r.note}</span>}</div>
              {r.sub && <div className="ls">{r.sub}</div>}
            </div>
            {(r.acquereur || r.grade) && (
              <span className="lcont">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
                {r.acquereur}
                {r.grade && <b className={`note n${r.grade}`}>{r.grade}</b>}
              </span>
            )}
            {r.right && r.right.length > 0 && (
              <div className="lright">{r.right.map((x, i) => <span key={i}>{x}</span>)}</div>
            )}
            {r.badge && (
              <span className={r.badge.tone === "green" ? "badge-g" : r.badge.tone === "red" ? "badge-r" : "badge-o"}>
                {r.badge.label}
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
}
