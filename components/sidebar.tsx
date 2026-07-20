"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto p-2 md:h-full md:flex-col md:gap-0.5 md:overflow-visible md:p-3">
      <div className="hidden px-3 pb-4 pt-2 md:block">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          France Immeuble
        </p>
        <p className="text-sm font-bold">Cockpit Découpe</p>
      </div>

      {NAV.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
              (active
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")
            }
          >
            <span aria-hidden className="text-base leading-none">
              {item.icon}
            </span>
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
