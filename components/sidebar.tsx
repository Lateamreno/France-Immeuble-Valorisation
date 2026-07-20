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
  { href: "/documents", label: "Documents", n: undefined,
    icon: <><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/></> },
];

const PHASES = [
  { lb: "Mandat", sm: "signé · n° 2026‑014", state: "done" },
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
      </div>
    </aside>
  );
}
