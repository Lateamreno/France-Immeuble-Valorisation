"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

// Icônes trait 24×24 approchant les icônes du BO (FontAwesome-like).
const IC: Record<string, React.ReactNode> = {
  "/": <><circle cx="12" cy="12" r="9" /><path d="M12 3v4M12 12l5 3" /></>,
  "/estimation": <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h4" /></>,
  "/immeubles": <><rect x="5" y="3" width="14" height="18" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>,
  "/documents": <><path d="M4 8h16v11H4z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
  "/recherches": <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></>,
  "/contacts": <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.6 14.2c2.4.2 4.2 1.6 4.6 4.3" /></>,
  "/propositions": <><path d="M21 4 3 11l7 3 3 7z" /></>,
  "/questions": <><path d="M21 12a9 9 0 1 0-3.5 7.1L21 20z" /><path d="M10 10a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.8M12 16.4v.1" /></>,
  "/visites": <><path d="M4 15l2-6h12l2 6" /><rect x="3" y="15" width="18" height="4" rx="1.5" /><circle cx="7.5" cy="19" r="1.4" /><circle cx="16.5" cy="19" r="1.4" /></>,
  "/offres": <><path d="M13 3 4 12l3.5 3.5L14 9M11 12l6 6M14 15l4 4" /><path d="M17 4l3 3" /></>,
  "/suivi": <><path d="M4 9a8 8 0 1 1-1 5" /><path d="M4 4v5h5" /><path d="M12 8v4l3 2" /></>,
  "/objectifs": <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5V12l5.5 5.5" /></>,
  "/analytics": <><ellipse cx="12" cy="6" rx="7" ry="2.6" /><path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" /><path d="M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6" /></>,
  "#notion": <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.8 2.1c-.9.5-1.3 1-1.3 2M12 17v.1" /></>,
  "#mailing": <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 5 9-5" /></>,
  "#dimmax": <><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></>,
  "#debug": <><circle cx="12" cy="13" r="5" /><path d="M12 8V5M7 10 4.5 8M17 10l2.5-2M7 16l-2.5 2M17 16l2.5 2" /></>,
};

export function Rail() {
  const pathname = usePathname();

  return (
    <aside className="side">
      {NAV.map((it) => {
        if (it.tool === "switch-onoff") {
          return (
            <div className="srow" key={it.href}>
              <span className="sic">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" /><path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4" /></svg>
              </span>
              <span className="sw">
                <span className="on"><i /> ON</span>
                <span className="off"><i /> OFF</span>
              </span>
            </div>
          );
        }
        if (it.tool === "toggle") {
          return (
            <div className="srow" key={it.href}>
              <span className="sic"><svg viewBox="0 0 24 24">{IC[it.href]}</svg></span>
              {it.label}
              <span className="mini-toggle" />
            </div>
          );
        }
        const isLink = !it.href.startsWith("#");
        const active = isLink && (it.href === "/" ? pathname === "/" : pathname.startsWith(it.href));
        const inner = (
          <>
            <span className="sic"><svg viewBox="0 0 24 24">{IC[it.href]}</svg></span>
            {it.label}
            {it.count !== undefined && <span className="nred">{it.count}</span>}
            {it.count2 !== undefined && <span className="norange">{it.count2}</span>}
          </>
        );
        return isLink ? (
          <Link key={it.href} href={it.href} className={active ? "sel" : undefined}>
            {inner}
          </Link>
        ) : (
          <a key={it.href} href={undefined} role="button">{inner}</a>
        );
      })}
    </aside>
  );
}
