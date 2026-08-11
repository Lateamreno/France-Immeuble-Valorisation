"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QUICK_CREATE } from "@/lib/nav";
import type { Agent } from "@/lib/bubble/server";
import { createContact, createImmeuble } from "@/lib/bo/actions";

// Icônes des 7 entités (entité + petit « + », comme le BO).
const IC: Record<string, React.ReactNode> = {
  Contact: <><circle cx="10" cy="8" r="3.2" /><path d="M4.5 19.5c.6-3.6 3-5.2 5.5-5.2s4.9 1.6 5.5 5.2" /><path d="M17.5 8.5h4M19.5 6.5v4" /></>,
  Immeuble: <><rect x="4" y="4" width="11" height="16" /><path d="M7.5 8h1.5M11 8h1.5M7.5 12h1.5M11 12h1.5M7.5 16h1.5" /><path d="M17.5 13.5h4M19.5 11.5v4" /></>,
  Mandat: <><path d="M4 9h12v10H4z" /><path d="M7 9V7.5a3 3 0 0 1 6 0V9" /><path d="M17.5 13.5h4M19.5 11.5v4" /></>,
  Recherche: <><circle cx="10" cy="10" r="5.5" /><path d="m18 18-4-4" /><path d="M17.5 8h4M19.5 6v4" /></>,
  Proposition: <><path d="M19 4 4 10l5.5 2.5 2.5 6z" /><path d="M17.5 15.5h4M19.5 13.5v4" /></>,
  Visite: <><path d="M4 14l1.7-4.5h9L16 14" /><rect x="3" y="13.6" width="14" height="3.6" rx="1.2" /><circle cx="6.6" cy="18.6" r="1.2" /><circle cx="13.6" cy="18.6" r="1.2" /><path d="M18.5 8.5h4M20.5 6.5v4" /></>,
  Offre: <><path d="M11 4 4 11l3 3 5.5-5.5M9.5 10.5l5.5 5.5M12.5 13.5l3.5 3.5" /><path d="M17.5 5.5h4M19.5 3.5v4" /></>,
};

const VIA_FICHE = new Set(["Mandat", "Recherche", "Proposition", "Visite", "Offre"]);

// Barre de création rapide fixe en bas — 7 cellules égales (réplique).
// + Contact et + Immeuble sont actifs ; les autres se créent depuis les fiches.
export function QuickCreate({ agents = [] }: { agents?: Agent[] }) {
  const [modal, setModal] = useState<"Contact" | "Immeuble" | null>(null);
  return (
    <>
      <div className="bottbar">
        {QUICK_CREATE.map((label) => (
          <button
            key={label}
            type="button"
            title={VIA_FICHE.has(label) ? `${label} : se crée depuis la fiche du bien` : `Créer : ${label}`}
            onClick={() => {
              if (label === "Contact" || label === "Immeuble") setModal(label);
              else alert(`« + ${label} » se crée depuis la fiche du bien concerné (section Mandats / Acheteurs).`);
            }}
          >
            <svg viewBox="0 0 24 24">{IC[label]}</svg>
            {label}
          </button>
        ))}
      </div>
      {modal === "Contact" && <NewContactModal agents={agents} onClose={() => setModal(null)} />}
      {modal === "Immeuble" && <NewImmeubleModal agents={agents} onClose={() => setModal(null)} />}
    </>
  );
}

function NewContactModal({ agents, onClose }: { agents: Agent[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [civ, setCiv] = useState("Monsieur");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [portable, setPortable] = useState("");
  const [acheteur, setAcheteur] = useState(false);
  const [vendeur, setVendeur] = useState(false);
  const [agent, setAgent] = useState(agents[0]?.slug ?? "");
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Nouveau contact<button type="button" onClick={onClose}>✕</button></div>
        <div className="modal-b">
          <div className="mrow" style={{ alignItems: "center" }}>
            <select className="min" style={{ width: 110 }} value={civ} onChange={(e) => setCiv(e.target.value)}>
              <option>Monsieur</option><option>Madame</option>
            </select>
            <input className="min" style={{ width: 130 }} placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            <input className="min" style={{ width: 150 }} placeholder="NOM" value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div className="mrow" style={{ marginTop: 6 }}>
            <input className="min" style={{ width: 200 }} placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="min" style={{ width: 140 }} placeholder="Portable" value={portable} onChange={(e) => setPortable(e.target.value)} />
          </div>
          <span className="mlab">Projet</span>
          <div className="mrow">
            <button type="button" className={`mopt${acheteur ? " on" : ""}`} onClick={() => setAcheteur(!acheteur)}>Acheter</button>
            <button type="button" className={`mopt${vendeur ? " on" : ""}`} onClick={() => setVendeur(!vendeur)}>Vendre</button>
          </div>
          <span className="mlab">Suivi par</span>
          <div className="mrow">
            {agents.map((a) => (
              <button key={a.slug} type="button" className={`mopt${agent === a.slug ? " on" : ""}`} onClick={() => setAgent(a.slug)}>{a.name}</button>
            ))}
          </div>
        </div>
        <div className="modal-f">
          <button
            className="kgo" type="button" disabled={pending || !nom.trim()}
            style={pending || !nom.trim() ? { opacity: 0.5 } : undefined}
            onClick={() =>
              start(async () => {
                const id = await createContact({
                  "Civilité": civ, "prénom": prenom || undefined, nom,
                  email: email || undefined, portable: portable || undefined,
                  acheteur, vendeur,
                  agentId: agents.find((a) => a.slug === agent)?.id,
                });
                onClose();
                router.push(`/contact/${id}`);
              })
            }
          ><span className="ch">›</span> Créer le contact</button>
        </div>
      </div>
    </div>
  );
}

function NewImmeubleModal({ agents, onClose }: { agents: Agent[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [numero, setNumero] = useState("");
  const [rue, setRue] = useState("");
  const [ville, setVille] = useState("");
  const [cp, setCp] = useState("");
  const [agent, setAgent] = useState(agents[0]?.slug ?? "");
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Nouvel immeuble<button type="button" onClick={onClose}>✕</button></div>
        <div className="modal-b">
          <span className="mlab">Adresse</span>
          <div className="mrow" style={{ alignItems: "center" }}>
            <input className="min" style={{ width: 60 }} placeholder="N°" value={numero} onChange={(e) => setNumero(e.target.value)} />
            <input className="min" style={{ flex: 1, minWidth: 180 }} placeholder="Rue" value={rue} onChange={(e) => setRue(e.target.value)} />
          </div>
          <div className="mrow" style={{ marginTop: 6 }}>
            <input className="min" style={{ width: 90 }} placeholder="CP" value={cp} onChange={(e) => setCp(e.target.value)} />
            <input className="min" style={{ width: 180 }} placeholder="Ville" value={ville} onChange={(e) => setVille(e.target.value)} />
          </div>
          <span className="mlab">Suivi par</span>
          <div className="mrow">
            {agents.map((a) => (
              <button key={a.slug} type="button" className={`mopt${agent === a.slug ? " on" : ""}`} onClick={() => setAgent(a.slug)}>{a.name}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--gray-txt)", marginTop: 10 }}>
            L&apos;immeuble est créé en statut « Estimation » ; propriétaire, lots et
            suivi se complètent ensuite sur la fiche.
          </div>
        </div>
        <div className="modal-f">
          <button
            className="kgo" type="button" disabled={pending || !ville.trim()}
            style={pending || !ville.trim() ? { opacity: 0.5 } : undefined}
            onClick={() =>
              start(async () => {
                const id = await createImmeuble({
                  agentId: agents.find((a) => a.slug === agent)?.id ?? "",
                  ville: ville.trim(), zipcode: cp || undefined,
                  rue: rue || undefined, numero_rue: numero || undefined,
                  source: "BO",
                });
                onClose();
                router.push(`/bien/${id}`);
              })
            }
          ><span className="ch">›</span> Créer l&apos;immeuble</button>
        </div>
      </div>
    </div>
  );
}
