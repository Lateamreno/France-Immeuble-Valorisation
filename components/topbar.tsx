"use client";

import { useRouter } from "next/navigation";

const AGENT_ORDER = ["marc-antoine", "romain", "guillaume", "francois", "sophie"];

// Barre haute — réplique : titre + recherche immeuble + filtres
// « En cours / En attente » + bouton orange « Immeubles suivis par X ».
// Cliquer le bouton orange passe à l'agent suivant (le BO ouvre un menu).
export function TopBar({
  title = "Dashboard",
  enCours = 5,
  agent = "Romain",
  agentSlug = "romain",
}: {
  title?: string;
  enCours?: number;
  agent?: string;
  agentSlug?: string;
}) {
  const router = useRouter();
  const next = AGENT_ORDER[(AGENT_ORDER.indexOf(agentSlug) + 1) % AGENT_ORDER.length];

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
      <div className="search">
        <label className="in">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
          <input placeholder="Recherchez un immeuble..." aria-label="Recherche immeuble" />
        </label>
        <button className="go" type="button" aria-label="Rechercher">
          <svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg>
        </button>
      </div>
      <div className="pills">
        <button className="pill" type="button">
          <span className="dotg" /> En cours <span className="cnt">{enCours}</span>
        </button>
        <button className="pill off" type="button">
          <svg viewBox="0 0 24 24"><path d="M7 3h10M7 21h10M8 3c0 8 8 6 8 11M16 3c0 8-8 6-8 11M8 21c0-4 8-4 8 0" /></svg>
          En attente
        </button>
      </div>
      <button
        className="agentbtn"
        type="button"
        title="Changer d'agent"
        onClick={() => router.push(`/?agent=${next}`)}
      >
        Immeubles suivis par {agent}
      </button>
    </div>
  );
}
