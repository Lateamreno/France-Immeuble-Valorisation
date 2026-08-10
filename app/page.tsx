"use client";

import { useState } from "react";
import { TopBar } from "@/components/topbar";
import { DASHBOARD, type DashCard, type DashCase } from "@/lib/data/dashboard";

function Card({ c }: { c: DashCard }) {
  return (
    <div className="card">
      <div className="l1">
        <span className="ville">{c.ville}</span>
        <span className="cp">({c.cp})</span>
        {c.prix && <span className="prix">{c.prix}</span>}
      </div>
      <div className="l2">
        <span className="note" style={{ color: "var(--sub)" }}>{c.adresse}</span>
        <span className="contact">· {c.contact}</span>
      </div>
      {c.note && <div className="note">{c.note}</div>}
      {(c.badges?.length || c.action) && (
        <div className="l3">
          {c.badges?.map((b) => (
            <span key={b.label} className={`badge ${b.tone ?? ""}`}>{b.label}</span>
          ))}
          {c.action && (
            <button type="button" className="step-btn">› {c.action}</button>
          )}
        </div>
      )}
    </div>
  );
}

function Case({ k }: { k: DashCase }) {
  const hidden = k.total - k.cards.length;
  return (
    <section className="case" aria-label={k.titre}>
      <div className="case-head">
        <span className="t">{k.titre}</span>
        <span className="n">{k.total}</span>
        {k.enAttente ? <span className="wait">{k.enAttente} en attente</span> : null}
      </div>
      <div className="case-body">
        {k.cards.length === 0 && <div className="case-empty">Rien à traiter — tout est à jour.</div>}
        {k.cards.map((c) => (
          <Card key={c.id} c={c} />
        ))}
      </div>
      {hidden > 0 && (
        <div className="case-more">
          {hidden === 1 ? "Voir 1 autre ›" : `Voir les ${hidden} autres ›`}
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const [view, setView] = useState<"blocs" | "kanban">("blocs");

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="content-wrap">
        <div className="dash-head">
          <div className="viewswitch" role="tablist" aria-label="Vue du dashboard">
            <button
              type="button"
              className={view === "blocs" ? "on" : undefined}
              onClick={() => setView("blocs")}
            >
              Entonnoir
            </button>
            <button
              type="button"
              className={view === "kanban" ? "on" : undefined}
              onClick={() => setView("kanban")}
            >
              Kanban
            </button>
          </div>
        </div>

        {view === "blocs" ? (
          DASHBOARD.map((bloc) => (
            <div className="bloc" key={bloc.key}>
              <div className="bloc-head">
                <h2>{bloc.titre}</h2>
                <span className="sum">{bloc.resume}</span>
              </div>
              <div className="bloc-grid">
                {bloc.cases.map((k) => (
                  <Case key={k.key} k={k} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="kanban">
            {DASHBOARD.flatMap((bloc) =>
              bloc.cases.map((k) => (
                <section className="case" key={`${bloc.key}-${k.key}`} aria-label={k.titre}>
                  <div className="kanban-bloc-tag">{bloc.titre}</div>
                  <div className="case-head">
                    <span className="t">{k.titre}</span>
                    <span className="n">{k.total}</span>
                    {k.enAttente ? <span className="wait">{k.enAttente}</span> : null}
                  </div>
                  <div className="case-body">
                    {k.cards.map((c) => (
                      <Card key={c.id} c={c} />
                    ))}
                  </div>
                </section>
              )),
            )}
          </div>
        )}
      </div>
    </>
  );
}
