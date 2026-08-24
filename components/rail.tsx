"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV, NAV_DECOUPE } from "@/lib/nav";
import { changerMode } from "@/lib/bo/mode";
import type { Mode } from "@/lib/decoupe";
import { useTransition } from "react";

// Icônes PLEINES (style FontAwesome solid) relevées sur les captures du BO :
// tachymètre, calculatrice, immeuble, mallette, JUMELLES (recherches),
// groupe (contacts), avion en papier, BULLE (questions), voiture, marteau,
// historique, horloge, base de données.
const IC: Record<string, React.ReactNode> = {
  "/": <path d="M12 4a9 9 0 0 0-8 13.2c.3.5.9.8 1.5.8h13c.6 0 1.2-.3 1.5-.8A9 9 0 0 0 12 4zm-6.2 9.2a1.1 1.1 0 1 1 0-2.3 1.1 1.1 0 0 1 0 2.3zm2.4-3.6a1.1 1.1 0 1 1 0-2.3 1.1 1.1 0 0 1 0 2.3zm3.8-.9a1.1 1.1 0 1 1 0-2.3 1.1 1.1 0 0 1 0 2.3zm4.7 1.7-2.3 3.6a2 2 0 1 1-1.7-1l4-2.6z" />,
  "/estimation": <path d="M6.5 2h11A1.5 1.5 0 0 1 19 3.5v17A1.5 1.5 0 0 1 17.5 22h-11A1.5 1.5 0 0 1 5 20.5v-17A1.5 1.5 0 0 1 6.5 2zM7 4v3.2h10V4H7zm.4 5.6v1.8h1.8V9.6H7.4zm3.7 0v1.8h1.8V9.6h-1.8zm3.7 0v1.8h1.8V9.6h-1.8zM7.4 13v1.8h1.8V13H7.4zm3.7 0v1.8h1.8V13h-1.8zm3.7 0v1.8h1.8V13h-1.8zM7.4 16.4v1.8h1.8v-1.8H7.4zm3.7 0v1.8h1.8v-1.8h-1.8zm3.7 0v1.8h1.8v-1.8h-1.8z" />,
  "/immeubles": <path d="M5 2h11a1 1 0 0 1 1 1v18h3v2H4v-2h1V3a1 1 0 0 1 0-1zm2.5 3v2h2V5h-2zm4 0v2h2V5h-2zm-4 3.6v2h2v-2h-2zm4 0v2h2v-2h-2zm-4 3.6v2h2v-2h-2zm4 0v2h2v-2h-2zm-2 3.8V21h4v-5h-4z" />,
  "/mandats": <path d="M9 2h6a2 2 0 0 1 2 2v1h3.5A1.5 1.5 0 0 1 22 6.5V10H2V6.5A1.5 1.5 0 0 1 3.5 5H7V4a2 2 0 0 1 2-2zm0 3h6V4H9v1zM2 11.5h7V13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1.5h7V19a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 19v-7.5z" />,
  "/recherches": <path d="M6 4h3.2a1 1 0 0 1 1 .9l.3 3.1H8.9L8.7 6H6.6L5.4 11h4.7v-1.2h3.8V11h4.7l-1.2-5h-2.1l-.2 2H13.5l.3-3.1a1 1 0 0 1 1-.9H18a1 1 0 0 1 1 .8l1.8 7.6A4.6 4.6 0 1 1 14 16v-3h-4v3a4.6 4.6 0 1 1-6.8-4.6L5 4.8A1 1 0 0 1 6 4zm.6 9.6a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zm10.8 0a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z" />,
  "/contacts": <path d="M8.5 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zm8 .2a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM8.5 12.6c-3 0-6 1.6-6 4.3V19h12v-2.1c0-2.7-3-4.3-6-4.3zm8 .4c-.7 0-1.4.1-2 .3 1.2 1 2 2.3 2 3.9V19h6v-1.9c0-2.4-2.6-4.1-6-4.1z" />,
  "/propositions": <path d="M21.6 3.2 2.9 10.4a.7.7 0 0 0 .1 1.3l4.6 1.6 11-7.3-8.6 8.4v4.8c0 .7.9 1 1.3.4l2.3-3 4.4 3.2c.5.4 1.2.1 1.3-.5l2.9-14.9a.8.8 0 0 0-1-.9z" />,
  "/questions": <path d="M12 3C6.8 3 2.6 6.3 2.6 10.4c0 2.3 1.3 4.4 3.4 5.7-.2 1.3-.9 2.5-1.9 3.4-.2.2-.1.5.2.5 1.9 0 3.7-.7 5-1.9.9.2 1.8.3 2.7.3 5.2 0 9.4-3.3 9.4-7.4S17.2 3 12 3z" />,
  "/visites": <path d="M5.2 6.6A2.4 2.4 0 0 1 7.5 5h9a2.4 2.4 0 0 1 2.3 1.6L20 10h.6a1.4 1.4 0 0 1 1.4 1.4v4.2c0 .6-.4 1-1 1H21v1.6a1.4 1.4 0 0 1-1.4 1.4h-1.2A1.4 1.4 0 0 1 17 18.2v-1.6H7v1.6a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 18.2v-1.6h-.1c-.5 0-1-.4-1-1v-4.2A1.4 1.4 0 0 1 3.4 10H4l1.2-3.4zM6.4 10h11.2l-.9-2.6a.7.7 0 0 0-.7-.4h-8a.7.7 0 0 0-.7.4L6.4 10zM5.6 12a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm12.8 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z" />,
  "/offres": <path d="m14.7 2.3 7 7-2.1 2.1-1.1-1-4.3 4.3 1 1-2.1 2.2-7-7 2.1-2.2 1 1L13.6 5l-1-1 2.1-2.1zM8.2 13.7l2.1 2.1-6.4 6.4a1.5 1.5 0 1 1-2.1-2.1l6.4-6.4z" />,
  "/suivi": <path d="M12 3a9 9 0 1 0 8.5 12h-2.2A6.9 6.9 0 1 1 12 5.1c1.9 0 3.6.8 4.9 2L14 10h7V3l-2.6 2.6A8.9 8.9 0 0 0 12 3zm-1 4.5v5.2l4.2 2.5.8-1.3-3.5-2.1V7.5H11z" />,
  "/objectifs": <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2.2a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6zm-1 1.9v5.5l4.4 2.6.9-1.4-3.6-2.2V7.1H11z" />,
  "/decoupe": <path d="M4 3h7v7H4V3zm9 0h7v7h-7V3zM4 14h7v7H4v-7zm9 0h7v7h-7v-7z" />,
  "/decoupe/operations": <path d="M5 2h11a1 1 0 0 1 1 1v18h3v2H4v-2h1V3a1 1 0 0 1 0-1zm2.5 3v2h2V5h-2zm4 0v2h2V5h-2zm-4 3.6v2h2v-2h-2zm4 0v2h2v-2h-2zm-2 7.4V21h4v-5h-4z" />,
  "/analytics": <path d="M12 2c4.4 0 8 1.3 8 3v2c0 1.7-3.6 3-8 3s-8-1.3-8-3V5c0-1.7 3.6-3 8-3zm8 7.6V13c0 1.7-3.6 3-8 3s-8-1.3-8-3V9.6c1.7 1.2 4.7 1.8 8 1.8s6.3-.6 8-1.8zm0 5.8V19c0 1.7-3.6 3-8 3s-8-1.3-8-3v-3.6c1.7 1.2 4.7 1.8 8 1.8s6.3-.6 8-1.8z" />,
  "/mails": <path d="M3 5.5h18c.6 0 1 .4 1 1v.4l-10 6-10-6v-.4c0-.6.4-1 1-1zm-1 3.8 9.5 5.7c.3.2.7.2 1 0L22 9.3v8.2c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1V9.3z" />,
  // Diffusion : l'antenne qui émet.
  "/diffusion": <path d="M12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zm-4.3-3a1 1 0 0 1 .1 1.5 5.9 5.9 0 0 0 0 7.8 1 1 0 1 1-1.5 1.3 7.9 7.9 0 0 1 0-10.4 1 1 0 0 1 1.4-.2zm8.6 0a1 1 0 0 1 1.4.2 7.9 7.9 0 0 1 0 10.4 1 1 0 0 1-1.5-1.3 5.9 5.9 0 0 0 0-7.8 1 1 0 0 1 .1-1.5zM4.6 3.3a1 1 0 0 1 .2 1.4 10.8 10.8 0 0 0 0 14.6 1 1 0 0 1-1.5 1.3 12.8 12.8 0 0 1 0-17.2 1 1 0 0 1 1.3-.1zm14.8 0a1 1 0 0 1 1.3.1 12.8 12.8 0 0 1 0 17.2 1 1 0 1 1-1.5-1.3 10.8 10.8 0 0 0 0-14.6 1 1 0 0 1 .2-1.4z" />,
  "#mailing": <path d="M3 5.5h18c.6 0 1 .4 1 1v.4l-10 6-10-6v-.4c0-.6.4-1 1-1zm-1 3.8 9.5 5.7c.3.2.7.2 1 0L22 9.3v8.2c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1V9.3z" />,
};

export function Rail({ mode = "bloc" }: { mode?: Mode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const decoupe = mode === "decoupe";

  const basculer = (vers: Mode) =>
    start(async () => {
      await changerMode(vers);
      // La fiche d'un bien vaut dans les deux métiers : on y reste.
      if (pathname.startsWith("/bien/")) return;
      router.push(vers === "decoupe" ? "/decoupe" : "/");
    });

  return (
    <aside className={`side${decoupe ? " mode-decoupe" : ""}`}>
      {/* Changer de mode emmène au tableau de bord du mode choisi (retour
          #106). Le menu changeait sous les yeux de l'agent, mais la page
          restait celle de l'autre métier : on se retrouvait avec la sidebar
          Découpe devant le dashboard Bloc. Une bascule de métier est un
          changement de contexte, pas un simple filtre sur le menu.
          Exception : une fiche immeuble est partagée par les deux métiers,
          on n'en sort donc pas. */}
      <div className="modesw" role="group" aria-label="Mode de travail">
        <button type="button" className={decoupe ? undefined : "on"} disabled={pending}
          onClick={() => basculer("bloc")}>Bloc</button>
        <button type="button" className={decoupe ? "on" : undefined} disabled={pending}
          onClick={() => basculer("decoupe")}>Découpe</button>
      </div>
      <div className="modelab">{decoupe ? "Opérations de découpe" : "Vente en bloc"}</div>

      {(decoupe ? NAV_DECOUPE : NAV).map((it) => {
        if (it.tool === "switch-onoff") {
          return (
            <div className="srow" key={it.href}>
              <span className="sic">
                <svg viewBox="0 0 24 24">
                  <path d="M12 2.5 13.6 6l3.8.4-2.8 2.6.8 3.8L12 11l-3.4 1.8.8-3.8L6.6 6.4 10.4 6 12 2.5z" />
                </svg>
              </span>
              <span className="sw">
                <span className="on"><i />ON</span>
                <span className="off"><i />OFF</span>
              </span>
            </div>
          );
        }
        const isLink = !it.href.startsWith("#");
        const active = isLink && (it.href === "/" ? pathname === "/" : pathname.startsWith(it.href));
        const inner = (
          <>
            <span className="sic"><svg viewBox="0 0 24 24">{IC[it.href]}</svg></span>
            {it.label}
            {it.tool === "toggle" && <span className="mini-toggle" />}
          </>
        );
        return isLink ? (
          <Link key={it.href} href={it.href} className={active ? "sel" : undefined}>{inner}</Link>
        ) : (
          <a key={it.href} href={undefined} role="button">{inner}</a>
        );
      })}
    </aside>
  );
}
