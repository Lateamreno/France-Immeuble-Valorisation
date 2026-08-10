"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

// Icônes trait 24×24 par entrée (pas de lib externe : build hermétique).
const ICONS: Record<string, React.ReactNode> = {
  "/": (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  "/immeubles": (
    <>
      <path d="M3 21h18M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-5h6v5" />
    </>
  ),
  "/estimation": (
    <>
      <path d="M4 4v16h16" />
      <path d="M7 15l3-4 3 2 4-6" />
    </>
  ),
  "/documents": (
    <>
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  "/recherches": (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4-4" />
    </>
  ),
  "/contacts": (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5" />
      <path d="M16 4a3.5 3.5 0 0 1 0 7M18 14.7c2 .8 3 2.4 3 4.3" />
    </>
  ),
  "/propositions": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3 8 9 5 9-5" />
    </>
  ),
  "/visites": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  "/offres": (
    <>
      <path d="M12 2l2.6 5.6L20 8.5l-4 4 1 5.9-5-2.8-5 2.8 1-5.9-4-4 5.4-.9z" />
    </>
  ),
  "/suivi": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  "/objectifs": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  "/analytics": (
    <>
      <path d="M5 21V10M12 21V4M19 21v-8" />
    </>
  ),
};

export function Rail() {
  const pathname = usePathname();

  return (
    <aside className="rail">
      <div className="rail-brand">
        <div className="seal">FI</div>
        <div>
          <div className="a">France Immeuble</div>
          <div className="b">Back-office</div>
        </div>
      </div>

      <nav className="rail-nav">
        {NAV.map((it) => {
          const active =
            it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={active ? "sel" : undefined}>
              <span className="ric">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[it.href]}
                </svg>
              </span>
              {it.label}
              {it.count !== undefined && <span className="count">{it.count}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="rail-foot">
        <div className="av">MA</div>
        <div className="who">
          <b>Marc-Antoine</b>
          <span>Admin</span>
        </div>
      </div>
    </aside>
  );
}
