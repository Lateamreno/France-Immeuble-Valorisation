"use client";

// Dashboard découpe.
//
// Celui de la vente est un tableau de bord de PIPELINE : où en est chaque
// affaire. Celui-ci est un tableau de bord d'AVANCEMENT : quelle phase, quels
// lots restent, et ce que la découpe fait gagner sur la vente en bloc.
//
// Un seul composant pour les deux tailles d'écran : le tableau se replie en
// cartes sous 640 px, on ne maintient pas deux écrans en parallèle.
import Link from "next/link";
import { useState, useTransition } from "react";
import type { OperationDecoupe } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import { PHASES, STATUTS_OPERATION, avancement, phase } from "@/lib/decoupe";
import { majOperation } from "@/lib/bo/actions";

const pct = (bloc?: number, dec?: number) =>
  bloc && dec && bloc > 0 ? Math.round(((dec - bloc) / bloc) * 100) : undefined;

export function DecoupeDashboard({ operations, toutes }: {
  operations: OperationDecoupe[];
  /** Vue « Opérations » : les clôturées restent visibles. */
  toutes?: boolean;
}) {
  const ouvertes = toutes ? operations : operations.filter((o) => o.statut !== "Clôturée");
  const lots = ouvertes.reduce((s, o) => s + (o.lots ?? 0), 0);
  const libres = ouvertes.reduce((s, o) => s + (o.lotsLibres ?? 0), 0);
  const bloc = ouvertes.reduce((s, o) => s + (o.valeurBloc ?? 0), 0);
  const dec = ouvertes.reduce((s, o) => s + (o.valeurDecoupe ?? 0), 0);
  const ecart = pct(bloc, dec);

  return (
    <div className="dec">
      <div className="dec-top">
        <span className="dec-h">{toutes ? "Opérations" : "Dashboard découpe"}</span>
        <span className="dec-sub">
          {ouvertes.length} opération{ouvertes.length > 1 ? "s" : ""} en cours · {lots} lots
        </span>
      </div>

      <div className="dec-tuiles">
        <Tuile k="Opérations" v={String(ouvertes.length)} d={`${operations.length - ouvertes.length} clôturée(s)`} />
        <Tuile k="Lots au total" v={String(lots)} d={`${libres} libre${libres > 1 ? "s" : ""}`} />
        <Tuile k="Valeur en bloc" v={euros(bloc) ?? "—"} d={bloc ? undefined : "à renseigner"} />
        <Tuile k="Valeur en découpe" v={euros(dec) ?? "—"} d={dec ? undefined : "à estimer"} />
        <Tuile
          k="Écart" v={ecart !== undefined ? `${ecart > 0 ? "+" : ""}${ecart} %` : "—"}
          d={ecart !== undefined ? euros(dec - bloc) : "les deux valeurs manquent"}
          vert={ecart !== undefined && ecart > 0}
        />
      </div>

      {ouvertes.length === 0 && (
        <div className="fempty" style={{ padding: 40 }}>
          Aucune opération de découpe ouverte. Ouvrez-en une depuis la fiche d&apos;un immeuble,
          bouton « Passer en découpe ».
        </div>
      )}

      <div className="dec-liste">
        {ouvertes.map((o) => <LigneOperation key={o.id} o={o} />)}
      </div>
    </div>
  );
}

function Tuile({ k, v, d, vert }: { k: string; v: string; d?: string; vert?: boolean }) {
  return (
    <div className="dec-tuile">
      <div className="k">{k}</div>
      <div className={`v${vert ? " vert" : ""}`}>{v}</div>
      {d && <div className="d">{d}</div>}
    </div>
  );
}

function LigneOperation({ o }: { o: OperationDecoupe }) {
  const [ouvert, setOuvert] = useState(false);
  const [pending, start] = useTransition();
  const p = phase(o.phase);
  const e = pct(o.valeurBloc, o.valeurDecoupe);

  const changerPhase = (n: number) =>
    start(() => majOperation(o.immeubleId, o.id, { phase: n }));

  return (
    <div className="dec-op">
      <div className="dec-op-h">
        <div className="vign">
          {o.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.photoUrl} alt="" />
          ) : o.adresseGeo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/streetview?a=${encodeURIComponent(o.adresseGeo)}&w=120&h=96`} alt="" loading="lazy" />
          ) : (
            <svg viewBox="0 0 24 24"><path d="M5 2h11v19h3v2H4v-2h1z" /></svg>
          )}
        </div>
        <div className="dec-op-id">
          <Link className="v" href={`/bien/${o.immeubleId}`}>{o.ville || "Immeuble"}</Link>
          <span className="a">{o.adresse}</span>
          <span className="chips">
            <span className="chip">{o.statut}</span>
            <span className="chip">{o.lots} lot{(o.lots ?? 0) > 1 ? "s" : ""}</span>
            {(o.lotsLibres ?? 0) > 0 && <span className="chip">{o.lotsLibres} libre{o.lotsLibres! > 1 ? "s" : ""}</span>}
          </span>
        </div>
        <div className="dec-op-val">
          <span className="l">Bloc</span><b>{euros(o.valeurBloc) ?? "—"}</b>
          <span className="l">Découpe</span><b>{euros(o.valeurDecoupe) ?? "—"}</b>
          {e !== undefined && <span className={`ec${e > 0 ? " vert" : " rouge"}`}>{e > 0 ? "+" : ""}{e} %</span>}
        </div>
      </div>

      <button type="button" className="dec-op-ph" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}>
        <span className="jauge"><i style={{ width: `${avancement(o.phase)}%` }} /></span>
        <span className="t">Phase {p.n}/{PHASES.length} · {p.label}</span>
        <span className="chev">{ouvert ? "˅" : "›"}</span>
      </button>

      {ouvert && (
        <div className="dec-op-d">
          <div className="d">{p.detail}</div>
          <div className="phs">
            {PHASES.map((x) => (
              <button
                key={x.n} type="button" disabled={pending}
                className={`ph${x.n === p.n ? " on" : ""}${x.n < p.n ? " faite" : ""}`}
                title={x.detail}
                onClick={() => changerPhase(x.n)}
              >
                <b>{x.n}</b> {x.label}
              </button>
            ))}
          </div>
          <div className="lk">
            <Link href={`/bien/${o.immeubleId}`}>Ouvrir la fiche</Link>
            <span className="st">{STATUTS_OPERATION.join(" · ")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
