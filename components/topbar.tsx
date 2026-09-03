"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";


// Barre haute — réplique : titre + recherche immeuble + filtres
// « En cours / En attente » + sélecteur orange « Immeubles suivis par X »
// (menu déroulant natif comme le BO).
export function TopBar({
  title = "Dashboard",
  enCours = 5,
  enAttente = 0,
  vue = "cours",
  agentSlug = "",
  agents = [],
  recherche = "",
}: {
  title?: string;
  enCours?: number;
  /** Biens mis en attente dont la date de relance n'est pas atteinte. */
  enAttente?: number;
  vue?: "cours" | "attente";
  agent?: string;
  agentSlug?: string;
  /** Agents réels du BO (table agentfi). */
  agents?: { slug: string; name: string }[];
  /** Ce qui filtre déjà le dashboard, pour que la case le montre (#306). */
  recherche?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(recherche);
  /* La case suit l'adresse : vider le filtre depuis le bandeau doit vider la
     case, sinon elle affiche une recherche qui ne s'applique plus. */
  const [vu, setVu] = useState(recherche);
  if (vu !== recherche) { setVu(recherche); setQ(recherche); }

  const queue = (v: string) =>
    `/?agent=${agentSlug}${v === "attente" ? "&vue=attente" : ""}`;
  const va = (v: "cours" | "attente") =>
    router.push(`${queue(v)}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`);

  /* Retour #306 — la recherche filtre le dashboard sur place. Elle passe donc
     par l'adresse de CET écran, pas par un écran de résultats : les colonnes
     restent, et avec elles l'étape où se trouve chaque dossier. */
  const chercher = () =>
    router.push(`${queue(vue)}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`);

  return (
    <div className="topbar">
      <div className="tt">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18c1.5 0 1.8-1 1.3-1.9-.6-1 .1-2.1 1.2-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10z" />
          <circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7.5" r="1" /><circle cx="14.5" cy="7.5" r="1" />
        </svg>
        {title}
      </div>
      <form
        className="search"
        onSubmit={(e) => { e.preventDefault(); chercher(); }}
      >
        <label className="in">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
          <input
            name="q" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Ville, adresse ou nom du propriétaire…"
            aria-label="Filtrer les immeubles du tableau de bord"
          />
          {q && (
            <button type="button" className="raz" title="Effacer la recherche"
              onClick={() => { setQ(""); router.push(queue(vue)); }}>✕</button>
          )}
        </label>
        <button className="go" type="submit" aria-label="Rechercher">
          <svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg>
        </button>
      </form>
      <div className="pills">
        <button className={`pill${vue === "attente" ? " off" : ""}`} type="button" onClick={() => va("cours")}>
          <span className="dotg" /> En cours <span className="cnt">{enCours}</span>
        </button>
        <button className={`pill${vue === "cours" ? " off" : ""}`} type="button" onClick={() => va("attente")}>
          <svg viewBox="0 0 24 24"><path d="M7 3h10M7 21h10M8 3c0 8 8 6 8 11M16 3c0 8-8 6-8 11M8 21c0-4 8-4 8 0" /></svg>
          En attente{enAttente > 0 && <span className="cnt">{enAttente}</span>}
        </button>
      </div>
      <select
        className="agentbtn"
        value={agentSlug}
        onChange={(e) => router.push(`/?agent=${e.target.value}`)}
        aria-label="Filtrer par agent"
        style={{ cursor: "pointer", appearance: "none" }}
      >
        {agents.map(({ slug, name }) => (
          <option key={slug} value={slug}>
            Immeubles suivis par {name}
          </option>
        ))}
      </select>
    </div>
  );
}
