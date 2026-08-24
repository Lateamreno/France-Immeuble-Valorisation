"use client";

// Coquille des listes dont la table est trop volumineuse pour être chargée
// dans le navigateur (contacts, propositions) : la recherche, le tri et la
// pagination se font en base, l'état vit dans l'URL. Même habillage que
// ListeShell pour que les deux familles d'écrans restent identiques.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ListCard } from "@/lib/bubble/server";

const TAILLES = [10, 25, 50, 100];

export function ListeServeur({
  rows, total, page, taille, q, searchPlaceholder,
  titre, agents, agent = "",
}: {
  rows: ListCard[];
  total: number;
  page: number;
  taille: number;
  q: string;
  searchPlaceholder: string;
  /** Repris dans la barre collée. */
  titre?: string;
  /** Sélecteur « suivis par » : présent seulement quand on le passe. */
  agents?: { id: string; name: string }[];
  agent?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [saisie, setSaisie] = useState(q);
  const [pending, start] = useTransition();
  const pages = Math.max(1, Math.ceil(total / taille));

  const aller = (maj: Record<string, string | number>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(maj)) {
      if (v === "" || v === undefined) p.delete(k);
      else p.set(k, String(v));
    }
    start(() => router.push(`${pathname}?${p}`));
  };

  // Recherche différée : on ne relance pas une requête à chaque frappe.
  useEffect(() => {
    if (saisie === q) return;
    const t = setTimeout(() => aller({ q: saisie, page: 1 }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisie]);

  return (
    <div className={agents ? "lstx" : "lst"} style={pending ? { opacity: 0.6 } : undefined}>
      {/* Barre collée pleine largeur, comme dans le BO : le titre, la
          recherche, puis « suivis par » à droite. Tous les contacts sont
          affichés par défaut — un administrateur travaille sur l'ensemble du
          fichier, pas seulement sur le sien. */}
      <div className={agents ? "lstx-top" : "lst-bar"}>
        {agents && titre && <h1 className="lstx-titre">{titre}</h1>}
        <div className="lst-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
          <input placeholder={searchPlaceholder} value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        </div>
        {agents ? (
          <select className="lstx-agent" value={agent}
            onChange={(e) => aller({ agent: e.target.value, page: 1 })}>
            <option value="">Tous les contacts</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>Suivis par {a.name}</option>
            ))}
          </select>
        ) : (
          <span className="lst-count">{total.toLocaleString("fr-FR")} résultat{total > 1 ? "s" : ""}</span>
        )}
      </div>
      <div className="lst-col-simple">

      {rows.map((r) => {
        const inner = (
          <>
            <span className="lav" style={r.avatarCouleur ? { background: r.avatarCouleur } : undefined}>
              {r.avatar}
            </span>
            {/* Un agent immobilier ne se présente pas comme un client : le
                BO lui donne une silhouette distincte, et c'est ce qui évite
                d'écrire à un confrère comme on écrit à un vendeur. */}
            {r.qualite !== undefined && (
              <span className={`lsil${r.estAgent ? " agent" : ""}`} title={r.qualite}>
                <svg viewBox="0 0 24 24">
                  {r.estAgent ? (
                    <>
                      <circle cx="12" cy="8.5" r="3.4" />
                      <path d="M5.5 20.5c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" />
                      <path d="M6.6 7.4h4.2M13.2 7.4h4.2" />
                      <circle cx="8.7" cy="8.2" r="2.1" /><circle cx="15.3" cy="8.2" r="2.1" />
                    </>
                  ) : (
                    <>
                      <circle cx="12" cy="8.5" r="3.6" />
                      <path d="M5.5 20.5c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" />
                    </>
                  )}
                </svg>
              </span>
            )}
            <div className="lmid">
              <div className="lt">{r.title}{r.note && <span className="lnote"> · {r.note}</span>}</div>
              {r.qualite && <div className="lqual">{r.qualite}</div>}
              {r.sub && <div className="ls">{r.sub}</div>}
            </div>
            {r.compteurs && (
              <span className="lcpt">
                <i title={`${r.compteurs.immeubles ?? 0} immeuble(s)`}>
                  <svg viewBox="0 0 24 24"><path d="M5 3h9a1 1 0 0 1 1 1v17h4v1H4v-1h1V4a1 1 0 0 1 0-1z" /></svg>
                  {r.compteurs.immeubles ?? 0}
                </i>
                <i title={`${r.compteurs.recherches ?? 0} recherche(s)`}>
                  <svg viewBox="0 0 24 24"><circle cx="7" cy="14" r="3.6" /><circle cx="17" cy="14" r="3.6" /><path d="M7 10.4V6h3.4M17 10.4V6h-3.4M10.6 14h2.8" /></svg>
                  {r.compteurs.recherches ?? 0}
                </i>
              </span>
            )}
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
          </>
        );
        return r.href
          ? <Link key={r.id} href={r.href} className="lrow">{inner}</Link>
          : <div key={r.id} className="lrow">{inner}</div>;
      })}
      {rows.length === 0 && <div className="fempty">Aucun résultat.</div>}

      <div className="lst-pager">
        <span className="lst-res">{total.toLocaleString("fr-FR")} résultat{total > 1 ? "s" : ""}</span>
        <span className="sp" style={{ flex: 1 }} />
        <button className="pgb" type="button" title="Première page" disabled={page <= 1} onClick={() => aller({ page: 1 })}>«</button>
        <button className="pgb" type="button" title="Page précédente" disabled={page <= 1} onClick={() => aller({ page: page - 1 })}>‹</button>
        <span className="pgn">Page {page} / {pages}</span>
        <button className="pgb" type="button" title="Page suivante" disabled={page >= pages} onClick={() => aller({ page: page + 1 })}>›</button>
        <button className="pgb" type="button" title="Dernière page" disabled={page >= pages} onClick={() => aller({ page: pages })}>»</button>
        <span className="sp" style={{ flex: 1 }} />
        <select className="pgs" value={taille} onChange={(e) => aller({ per: e.target.value, page: 1 })}>
          {TAILLES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="pgl">éléments par page</span>
      </div>
      </div>
    </div>
  );
}
