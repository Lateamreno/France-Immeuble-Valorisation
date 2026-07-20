"use client";

import { useState } from "react";

const LOTS = [
  { id: 2, etage: "2ᵉ étage", surface: "58 m²", prix: "—", st: "lib", stl: "Libre" },
  { id: 3, etage: "2ᵉ étage", surface: "41 m²", prix: "720 €", st: "con", stl: "Congé en cours" },
  { id: 4, etage: "3ᵉ étage", surface: "76 m²", prix: "1 040 €", st: "occ", stl: "Occupé" },
  { id: 5, etage: "3ᵉ étage", surface: "29 m²", prix: "560 €", st: "occ", stl: "Occupé" },
];

const EVENTS = [
  { hot: true, d: "J‑14", x: "Fin fenêtre de congé — lot 3", y: "LRAR · commissaire de justice",
    icon: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></> },
  { hot: false, d: "J‑23", x: "Relance devis géomètre", y: "2 devis reçus sur 3",
    icon: <><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/></> },
  { hot: false, d: "J‑31", x: "Compromis — lot 7", y: "Étude Me Berger · 10 h 00",
    icon: <><path d="M12 20h9M3 20l1-4 11-11 3 3-11 11z"/></> },
  { hot: false, d: "J‑46", x: "Purge préemption — lot 2", y: "DPU · mairie de Nanterre",
    icon: <><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/></> },
];

const BUILDING = (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6}><path d="M3 21h18M5 21V8l7-4 7 4v13"/></svg>
);
const CHEV = <svg viewBox="0 0 24 24" fill="none" strokeWidth={2}><path d="m9 6 6 6-6 6"/></svg>;

export default function OperationOverview() {
  const [sel, setSel] = useState(3);

  return (
    <div className="content panel">
      <div className="head">
        <div className="lead" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>55 RUE VOLANT — NANTERRE</h1>
          <div className="meta">
            <span className="chip"><i /> Commercialisation</span>
            <span className="tag"><b>11</b> lots + annexes</span>
            <span className="tag"><b>3</b> indivisaires</span>
          </div>
        </div>
        <div className="cta">
          Voir l&apos;opération
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8}><path d="M7 17 17 7M9 7h8v8"/></svg>
        </div>
      </div>

      <div className="pods">
        <div className="pod">
          <div className="pk">Valeur bloc
            <svg viewBox="0 0 60 26"><polyline points="2,20 12,15 20,17 30,9 40,12 50,5 58,7" fill="none" stroke="#d8b25a" strokeWidth="1.6"/><circle cx="58" cy="7" r="2" fill="#f0d074"/></svg>
          </div>
          <div className="pv">3,4<small> M€</small></div>
          <div className="pu">estimation vendeur</div>
        </div>
        <div className="pod key">
          <div className="pk">Cible découpe
            <svg viewBox="0 0 60 26"><g fill="#d8b25a"><rect x="4" y="14" width="5" height="9"/><rect x="13" y="10" width="5" height="13"/><rect x="22" y="16" width="5" height="7"/><rect x="31" y="7" width="5" height="16"/><rect x="40" y="11" width="5" height="12"/><rect x="49" y="4" width="5" height="19" fill="#f0d074"/></g></svg>
          </div>
          <div className="pv">4,1<small> M€</small></div>
          <div className="pu"><b>+20,6 %</b> vs bloc</div>
        </div>
        <div className="pod">
          <div className="pk">Lots vendus
            <svg viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" fill="none" stroke="rgba(226,200,130,.18)" strokeWidth="3"/><circle cx="13" cy="13" r="10" fill="none" stroke="#f0d074" strokeWidth="3" strokeDasharray="62.8" strokeDashoffset="40" strokeLinecap="round" transform="rotate(-90 13 13)"/></svg>
          </div>
          <div className="pv">4<small> / 11</small></div>
          <div className="pu">2 sous compromis</div>
        </div>
        <div className="pod">
          <div className="pk">Prochaine échéance
            <svg viewBox="0 0 24 24" fill="none" stroke="#d8b25a" strokeWidth={1.6}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
          </div>
          <div className="pv">14<small> j</small></div>
          <div className="pu">fenêtre de congé · lot 3</div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="ch"><span className="ct">Lots &amp; état locatif</span><span className="cm">Tout voir →</span></div>
          <table className="lots">
            <thead><tr><th>Lot</th><th>Étage</th><th>Surface</th><th>Prix</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {LOTS.map((l) => (
                <tr key={l.id} className={sel === l.id ? "sel" : undefined} onClick={() => setSel(l.id)}>
                  <td><span className="lotn"><span className="ic">{BUILDING}</span><b>Lot {l.id}</b></span></td>
                  <td className="num">{l.etage}</td>
                  <td className="num">{l.surface}</td>
                  <td className="num">{l.prix}</td>
                  <td><span className={`stt ${l.st}`}><i /> {l.stl}</span></td>
                  <td style={{ color: "var(--muted)" }}>{CHEV}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="iso-wrap">
            <svg className="iso" viewBox="0 0 360 200">
              <defs>
                <linearGradient id="isoG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#f0d074" /><stop offset="1" stopColor="#a97f2e" />
                </linearGradient>
              </defs>
              <g stroke="rgba(184,137,43,.45)" strokeWidth="1" fill="none">
                <path d="M180 40 320 120 180 200 40 120Z" />
                <path d="M110 80 250 160M250 80 110 160M180 40 180 200M40 120 320 120" opacity=".45" />
              </g>
              <g>
                <path d="M110 108 145 128 145 96 110 76Z" fill="url(#isoG)" opacity=".92" />
                <path d="M145 128 180 108 180 76 145 96Z" fill="#c9a34a" opacity=".85" />
                <path d="M110 76 145 96 180 76 145 56Z" fill="#f4dc8f" />
                <path d="M180 128 215 148 215 120 180 100Z" fill="url(#isoG)" opacity=".72" />
                <path d="M215 148 250 128 250 100 215 120Z" fill="#c9a34a" opacity=".66" />
                <path d="M180 100 215 120 250 100 215 80Z" fill="#f4dc8f" opacity=".92" />
              </g>
              <g fill="#f0d074"><circle cx="90" cy="70" r="1.8" /><circle cx="270" cy="90" r="1.8" /><circle cx="230" cy="60" r="1.4" /><circle cx="150" cy="180" r="1.4" /></g>
            </svg>
            <div className="iso-btn">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6}><path d="M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
              Vue 3D de la découpe
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><span className="ct">Prochaines échéances</span></div>
          {EVENTS.map((e) => (
            <div key={e.d} className={`ev ${e.hot ? "hot" : "cool"}`}>
              <div className="eic"><svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6}>{e.icon}</svg></div>
              <div>
                <div className="ed">{e.d}</div>
                <div className="ex">{e.x}</div>
                <div className="ey">{e.y}</div>
              </div>
            </div>
          ))}
          <div className="cf">Voir tout le calendrier →</div>
        </div>
      </div>
    </div>
  );
}
