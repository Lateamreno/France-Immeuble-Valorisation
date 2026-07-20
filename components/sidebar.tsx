"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Dashboard", n: undefined as string | undefined,
    icon: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></> },
  { href: "/immeubles", label: "Opérations", n: "3",
    icon: <><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/></> },
  { href: "/prestataires", label: "Prestataires", n: undefined,
    icon: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 8 9 5 9-5"/></> },
  { href: "/analytics", label: "Analytics", n: undefined,
    icon: <><path d="M4 4v16h16"/><path d="M7 15l3-4 3 2 4-6"/></> },
  { href: "/documents", label: "Documents", n: undefined,
    icon: <><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/></> },
  { href: "/communications", label: "Communications", n: undefined,
    icon: <><path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.7L3 21l1.8-5.8A8.5 8.5 0 1 1 21 11.5z"/></> },
];

const PHASES = [
  { lb: "Mandat", sm: "signé · 12 mai 2026", state: "done" },
  { lb: "Urbanisme & structuration", sm: "EDD · géomètre", state: "done" },
  { lb: "Syndic & copropriété", sm: "", state: "done" },
  { lb: "Diagnostics & pricing", sm: "", state: "done" },
  { lb: "Commercialisation", sm: "4 / 11 lots vendus", state: "now" },
  { lb: "Actes & encaissement", sm: "", state: "todo" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [phase, setPhase] = useState(4);

  return (
    <aside className="side panel">
      <div className="brand">
        <div className="seal"><span>FI</span></div>
        <div>
          <div className="a">France Immeuble</div>
          <div className="b">Cockpit Découpe</div>
        </div>
      </div>

      <div className="glabel">Global</div>
      <nav className="nav">
        {NAV.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={active ? "sel" : undefined}>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.7}>{it.icon}</svg>
              {it.label}
              {it.n && <span className="n">{it.n}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="thread">
        <div className="th-head"><span className="t">55 rue Volant</span><span className="c">Nanterre</span></div>
        <div className="line">
          <span className="rail-wire" />
          {PHASES.map((p, i) => (
            <div
              key={p.lb}
              className={`step ${p.state} ${i === phase ? "sel" : ""}`}
              onClick={() => setPhase(i)}
            >
              <span className="dot" />
              <div className="lb">{p.lb}</div>
              {p.sm && <div className="sm">{p.sm}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="side-foot">
        <div className="av">MA</div>
        <div className="who"><b>Marc-Antoine</b><span>Admin</span></div>
        <span className="foot-cog">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.7}><line x1="4" y1="8" x2="20" y2="8"/><circle cx="9" cy="8" r="2.4"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="15" cy="16" r="2.4"/></svg>
        </span>
      </div>
      <div className="foot-links">
        <span>Paramètres</span>
        <span>Déconnexion</span>
      </div>
    </aside>
  );
}
