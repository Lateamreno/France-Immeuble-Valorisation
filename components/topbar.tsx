"use client";

import { useState } from "react";
import { AGENTS } from "@/lib/nav";

export function TopBar({ title = "Dashboard" }: { title?: string }) {
  const [agent, setAgent] = useState<string>(AGENTS[1]);

  return (
    <div className="topbar">
      <h1>{title}</h1>
      <div className="spacer" />
      <label className="searchbox">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4-4" />
        </svg>
        <input placeholder="Rechercher un immeuble, un contact, un mandat…" aria-label="Recherche globale" />
      </label>
      <div className="agentpick" title="Filtrer par agent">
        <span className="av">{agent === "Tous les agents" ? "∗" : agent.slice(0, 1)}</span>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          style={{ border: 0, background: "transparent", font: "inherit", color: "inherit", outline: 0, cursor: "pointer" }}
          aria-label="Filtrer par agent"
        >
          {AGENTS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
