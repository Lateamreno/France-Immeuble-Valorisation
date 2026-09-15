"use client";

// Module Objectifs — réplique du BO : période, filtres Prioritaires /
// Secondaires, onglets En cours / Historique, portée France Immeuble ou
// Agents, et une carte par objectif dépliable sur Réussis / Manqués / Tous.
import { useMemo, useState } from "react";
import type { Objectif, ObjectifsData } from "@/lib/bubble/server";

const moisFr = (p: string) => {
  const [a, m] = p.split("-").map(Number);
  return new Date(a, (m ?? 1) - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};

export function Objectifs({ d, periode }: { d: ObjectifsData; periode: string }) {
  const [priorite, setPriorite] = useState<"tous" | "prioritaire" | "secondaire">("tous");
  const [portee, setPortee] = useState<"fi" | "agents" | "tous">("tous");
  const [onglet, setOnglet] = useState<"en_cours" | "historique">("en_cours");

  const finPeriode = (o: Objectif) => new Date(o.fin).getTime() < Date.now();

  const liste = useMemo(
    () =>
      d.objectifs.filter((o) => {
        if (priorite !== "tous" && o.priorite !== priorite) return false;
        if (portee === "fi" && o.agent) return false;
        if (portee === "agents" && !o.agent) return false;
        return onglet === "historique" ? finPeriode(o) : !finPeriode(o);
      }),
    [d.objectifs, priorite, portee, onglet],
  );

  return (
    <>
      <div className="obj-bar">
        <form method="get" className="obj-per">
          <select name="periode" defaultValue={periode} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
            {d.periodes.map((p) => <option key={p} value={p}>{moisFr(p)}</option>)}
          </select>
        </form>

        <span className="obj-seg">
          <button type="button" className={priorite === "tous" ? "on" : ""} onClick={() => setPriorite("tous")}>Tous les types d&apos;objectifs</button>
          <button type="button" className={priorite === "prioritaire" ? "on" : ""} onClick={() => setPriorite("prioritaire")}>⚠ Prioritaires</button>
          <button type="button" className={priorite === "secondaire" ? "on" : ""} onClick={() => setPriorite("secondaire")}>Secondaires</button>
        </span>

        <span className="sp" style={{ flex: 1 }} />

        <span className="obj-seg">
          <button type="button" className={onglet === "en_cours" ? "on" : ""} onClick={() => setOnglet("en_cours")}>En cours</button>
          <button type="button" className={onglet === "historique" ? "on" : ""} onClick={() => setOnglet("historique")}>Historique</button>
        </span>

        <span className="obj-seg">
          <button type="button" className={portee === "fi" ? "on" : ""} onClick={() => setPortee("fi")}>France Immeuble</button>
          <button type="button" className={portee === "agents" ? "on" : ""} onClick={() => setPortee("agents")}>Agents</button>
          <button type="button" className={portee === "tous" ? "on" : ""} onClick={() => setPortee("tous")}>Tout le monde</button>
        </span>
      </div>

      {liste.length === 0 && <div className="fempty">Aucun objectif sur cette période.</div>}
      <div className="obj-grid">
        {liste.map((o) => <Carte key={o.id} o={o} libelles={d.libelles} />)}
      </div>
    </>
  );
}

function Carte({ o, libelles }: { o: Objectif; libelles: Record<string, string> }) {
  const [vue, setVue] = useState<"" | "reussis" | "manques" | "tous">("");
  const pct = o.cible > 0 ? Math.min(100, Math.round((o.valeur / o.cible) * 100)) : o.avancement;
  const valeur = o.unite === "pct" ? `${Math.round(o.valeur)} %` : String(o.valeur);
  const cible = o.unite === "pct" ? `${Math.round(o.cible)} %` : String(o.cible);
  const atteint = o.cible > 0 && o.valeur >= o.cible;

  const items = vue === "reussis" ? o.reussis : vue === "manques" ? o.manques : vue === "tous" ? o.tous : [];

  return (
    <div className={`obj-c${atteint ? " ok" : ""}`}>
      <div className="obj-h">
        <span className="obj-t">{o.label}</span>
        {o.agent
          ? <span className="obj-ag">{o.agent}</span>
          : <span className="obj-ag fi">France Immeuble</span>}
      </div>
      <div className="obj-p">{moisFr(o.periode)}</div>
      <div className="obj-v">
        {o.cible > 0 ? <><b>{valeur}</b> / {cible}</> : <b>n.a.</b>}
      </div>
      <div className="obj-jauge"><i style={{ width: `${pct}%` }} /></div>
      <div className="obj-f">
        <button type="button" className={vue === "reussis" ? "on" : ""} onClick={() => setVue(vue === "reussis" ? "" : "reussis")}>
          Réussis ({o.reussis.length})
        </button>
        <button type="button" className={vue === "manques" ? "on" : ""} onClick={() => setVue(vue === "manques" ? "" : "manques")}>
          Manqués ({o.manques.length})
        </button>
        <button type="button" className={vue === "tous" ? "on" : ""} onClick={() => setVue(vue === "tous" ? "" : "tous")}>
          Tous ({o.tous.length})
        </button>
      </div>
      {vue && (
        <ul className="obj-l">
          {items.length === 0 && <li className="vide">Aucun élément.</li>}
          {items.slice(0, 40).map((id) => <li key={id}>{libelles[id] ?? id}</li>)}
          {items.length > 40 && <li className="vide">… et {items.length - 40} autres.</li>}
        </ul>
      )}
    </div>
  );
}
