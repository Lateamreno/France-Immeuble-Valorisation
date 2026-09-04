"use client";

/* Écran Recherches — reprise du BO (retours #116 et #117).
 *
 * Une carte doit répondre à quatre questions d'un coup d'œil : à qui la
 * recherche appartient, où elle porte, ce qu'elle cherche, et combien
 * d'immeubles on pourrait lui envoyer sans se répéter. Ce dernier chiffre est
 * le seul en rouge : c'est le travail qui reste à faire. */

import { useMemo, useState } from "react";
import type { RechercheCard } from "@/lib/bubble/server";
import { CarteRecherche, DESTINATIONS, ModaleRecherche } from "@/components/carte-recherche";
import { ModaleRechercheEdition } from "@/components/recherche-modale";
import { PanneauAProposer } from "@/components/a-proposer";

const TAILLES = [10, 25, 50, 100];

type Vue = "en_cours" | "en_attente" | "archivees";

export function EcranRecherches({
  rows, agents,
}: {
  rows: RechercheCard[];
  agents: { id: string; name: string; initials: string }[];
}) {
  const [vue, setVue] = useState<Vue>("en_cours");
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState("");
  const [cible, setCible] = useState("");
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [nonSuivies, setNonSuivies] = useState(false);
  const [avecContact, setAvecContact] = useState(false);
  const [aProposerSeul, setAProposerSeul] = useState(false);
  const [tri, setTri] = useState("modif");
  const [page, setPage] = useState(1);
  const [taille, setTaille] = useState(10);
  const [detail, setDetail] = useState<RechercheCard | null>(null);
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  /* Retours #330 et #332 : la même modale modifie une recherche existante et
     en crée une nouvelle. `edition` vaut `null` quand rien n'est ouvert,
     `{ r: undefined }` en création. */
  const [edition, setEdition] = useState<{ r?: RechercheCard } | null>(null);
  /* Retour #331 : les biens à proposer à une recherche donnée. */
  const [aProposer, setAProposer] = useState<string | null>(null);

  const compte = (v: Vue) => rows.filter((r) => r.group === v).length;

  /* À qui attribuer une recherche créée ici ? Le BO n'a pas encore
     d'authentification : faute d'agent connecté, on prend celui que le filtre
     du bandeau désigne. Sans filtre, la recherche reste non suivie et la carte
     l'annonce « FI » — ce qui est vrai, et se corrige d'un clic. */
  const agentId = agents.find((a) => a.initials === agent)?.id;

  const filtrees = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const gardees = rows.filter((r) => {
      if (r.group !== vue) return false;
      /* La recherche porte sur tout ce qui identifie : le lieu, le type, le
         commentaire, et surtout le nom, l'e-mail ou le téléphone de
         l'acquéreur — c'est comme ça qu'on retrouve quelqu'un qui vient
         d'appeler. */
      if (qq) {
        const foin = [
          r.lieux.join(" "), r.cible, r.commentaire,
          r.contact?.nom, r.contact?.email, r.contact?.tel,
          r.orphelin?.email, r.orphelin?.tel,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!foin.includes(qq)) return false;
      }
      if (agent && r.agent !== agent) return false;
      if (cible && r.cible !== cible) return false;
      if (destination && !r.destinations.includes(destination)) return false;
      if (note && r.contact?.note !== note) return false;
      if (nonSuivies && r.agent !== "FI") return false;
      if (avecContact && !r.contact) return false;
      if (aProposerSeul && r.aProposer === 0) return false;
      return true;
    });
    const d = (r: RechercheCard) => String(r.date ?? "");
    switch (tri) {
      case "modif_ancien": return [...gardees].sort((a, b) => d(a).localeCompare(d(b)));
      case "aproposer": return [...gardees].sort((a, b) => b.aProposer - a.aProposer);
      case "note": return [...gardees].sort((a, b) => (a.contact?.note ?? "Z").localeCompare(b.contact?.note ?? "Z"));
      default: return [...gardees].sort((a, b) => d(b).localeCompare(d(a)));
    }
  }, [rows, vue, q, agent, cible, destination, note, nonSuivies, avecContact, aProposerSeul, tri]);

  const pages = Math.max(1, Math.ceil(filtrees.length / taille));
  const cur = Math.min(page, pages);
  const tranche = filtrees.slice((cur - 1) * taille, cur * taille);

  const cibles = [...new Set(rows.map((r) => r.cible).filter(Boolean) as string[])].sort();
  const raz = () => {
    setAgent(""); setCible(""); setDestination(""); setNote("");
    setNonSuivies(false); setAvecContact(false); setAProposerSeul(false);
    setTri("modif"); setPage(1);
  };
  const filtreActif = !!(agent || cible || destination || note || nonSuivies || avecContact || aProposerSeul || tri !== "modif");

  const cocher = (id: string) =>
    setChoisies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <div className="lstx">
      <div className="lstx-top">
        <h1 className="lstx-titre">Recherches</h1>
        {/* Retour #332 — « quand on clique sur créer une recherche il faut la
            modale de recherche qui va créer la recherche pour le client. » */}
        <button type="button" className="lstx-add" onClick={() => setEdition({})}>
          + Créer une recherche
        </button>
        <div className="lst-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
          <input
            placeholder="Un mot-clé, une ville, un nom, un e-mail, un téléphone…"
            value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <div className="lstx-sw" role="group" aria-label="Vue">
          {([["en_cours", "En cours"], ["en_attente", "En attente"], ["archivees", "Archivées"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={vue === k ? "on" : undefined}
              onClick={() => { setVue(k); setPage(1); }}>
              {l}{compte(k) > 0 && <span className="n">{compte(k)}</span>}
            </button>
          ))}
        </div>
        <select className="lstx-agent" value={agent} onChange={(e) => { setAgent(e.target.value); setPage(1); }}>
          <option value="">Toutes les recherches</option>
          {agents.map((a) => (
            <option key={a.id} value={a.initials}>Suivies par {a.name}</option>
          ))}
        </select>
      </div>

      <div className="lst-avec-filtres">
        <aside className="fltr">
          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z" /></svg> Type d&apos;opération</span>
            <select value={cible} onChange={(e) => { setCible(e.target.value); setPage(1); }}>
              <option value="">Tous</option>
              {cibles.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>

          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></svg> Destination</span>
            <select value={destination} onChange={(e) => { setDestination(e.target.value); setPage(1); }}>
              <option value="">Toutes</option>
              {DESTINATIONS.map((d) => <option key={d.cle}>{d.cle}</option>)}
            </select>
          </label>

          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9 14.5s1 1.5 3 1.5 3-1.5 3-1.5M9.2 9.8h.01M14.8 9.8h.01" /></svg> Note</span>
            <select value={note} onChange={(e) => { setNote(e.target.value); setPage(1); }}>
              <option value="">Toutes</option>
              {["A", "B", "C", "D"].map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>

          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m8 16 8-8" /></svg> Non suivies uniquement</span>
            <select value={nonSuivies ? "oui" : "non"} onChange={(e) => { setNonSuivies(e.target.value === "oui"); setPage(1); }}>
              <option value="non">Non</option><option value="oui">Oui</option>
            </select>
          </label>

          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg> Avec contact uniquement</span>
            <select value={avecContact ? "oui" : "non"} onChange={(e) => { setAvecContact(e.target.value === "oui"); setPage(1); }}>
              <option value="non">Non</option><option value="oui">Oui</option>
            </select>
          </label>

          {/* Absent du BO, mais c'est la question que MAV pose à cet écran :
              « qu'est-ce que j'ai à envoyer aujourd'hui ? ». */}
          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><path d="M21.6 3.2 2.9 10.4l4.7 1.7 11-7.3-8.6 8.4v4.8l2.3-3 4.4 3.2z" /></svg> À proposer seulement</span>
            <select value={aProposerSeul ? "oui" : "non"} onChange={(e) => { setAProposerSeul(e.target.value === "oui"); setPage(1); }}>
              <option value="non">Non</option><option value="oui">Oui</option>
            </select>
          </label>

          <label className="fltr-l">
            <span><svg viewBox="0 0 24 24"><path d="M4 7h13M4 12h9M4 17h5M17 11v8M14 16l3 3 3-3" /></svg> Tri</span>
            <select value={tri} onChange={(e) => setTri(e.target.value)}>
              <option value="modif">Date de modification (plus récents en premiers)</option>
              <option value="modif_ancien">Date de modification (plus anciens en premiers)</option>
              <option value="aproposer">Immeubles à proposer (plus nombreux en premiers)</option>
              <option value="note">Note acquéreur (A en premier)</option>
            </select>
          </label>

          <button type="button" className="fltr-raz" disabled={!filtreActif} onClick={raz}>⟲ Réinitialiser</button>
        </aside>

        <div className="lst-col">
          {choisies.size > 0 && (
            <div className="rc-selbar">
              <b>{choisies.size} recherche{choisies.size > 1 ? "s" : ""} sélectionnée{choisies.size > 1 ? "s" : ""}</b>
              <span style={{ flex: 1 }} />
              <button type="button" className="dif-x" onClick={() => setChoisies(new Set())}>Tout décocher</button>
              <button type="button" className="savebar-go" onClick={() => setDetail(null)}>
                <span className="ch">›</span> Écrire à la sélection
              </button>
            </div>
          )}

          {tranche.map((r) => (
            <CarteRecherche
              key={r.id} r={r} choisi={choisies.has(r.id)} onCocher={cocher}
              onDetail={setDetail}
              onAProposer={(x) => setAProposer(x.id)}
              onModifier={(x) => setEdition({ r: x })}
            />
          ))}

          {tranche.length === 0 && <div className="fempty">Aucune recherche.</div>}

          <div className="lst-pager">
            <span className="lst-res">{filtrees.length} résultat{filtrees.length > 1 ? "s" : ""}</span>
            <span className="sp" style={{ flex: 1 }} />
            <button className="pgb" type="button" disabled={cur <= 1} onClick={() => setPage(1)}>«</button>
            <button className="pgb" type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>‹</button>
            <span className="pgn">Page {cur} / {pages}</span>
            <button className="pgb" type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>›</button>
            <button className="pgb" type="button" disabled={cur >= pages} onClick={() => setPage(pages)}>»</button>
            <span className="sp" style={{ flex: 1 }} />
            <select className="pgs" value={taille} onChange={(e) => { setTaille(Number(e.target.value)); setPage(1); }}>
              {TAILLES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="pgl">éléments par page</span>
          </div>
        </div>
      </div>

      {detail && (
        <ModaleRecherche
          detail={detail} onClose={() => setDetail(null)}
          onAProposer={(x) => { setDetail(null); setAProposer(x.id); }}
          onModifier={(x) => { setDetail(null); setEdition({ r: x }); }}
        />
      )}

      {edition && (
        <ModaleRechercheEdition
          depart={edition.r} agentId={agentId}
          onFermer={() => setEdition(null)}
          /* Retour #332 : « à la fin du processus de création on va dire s'il y
             a des biens qui correspondent ». On enchaîne donc sur le panneau
             des biens à proposer, plutôt que de renvoyer l'agent le chercher. */
          onEnregistre={({ id }) => { setEdition(null); setAProposer(id); }}
        />
      )}

      {aProposer && (
        <PanneauAProposer
          rechercheId={aProposer} agentId={agentId}
          onFermer={() => setAProposer(null)}
        />
      )}
    </div>
  );
}
