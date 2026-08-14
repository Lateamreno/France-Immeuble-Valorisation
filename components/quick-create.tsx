"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAgentCourant } from "@/lib/bo/agent-courant";
import { QUICK_CREATE } from "@/lib/nav";
import type { Agent } from "@/lib/bubble/server";
import { createContact, createImmeuble } from "@/lib/bo/actions";
import { AdresseInput, type AdresseChoisie } from "@/components/adresse-input";
import { ContactPicker } from "@/components/contact-picker";

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
  /* Par défaut l'agent aux commandes, pas le premier de la liste (#67). */
  const { slug: agent, choisir: setAgent } = useAgentCourant(agents);

  /* Un contact sans adresse e-mail ne sert à rien : ni estimation, ni
     proposition, ni relance. Elle est donc exigée dès la création (#69). */
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const completContact = !!nom.trim() && emailOk;

  return (
    <div className="modal-ov">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Nouveau contact<button type="button" onClick={onClose}>✕</button></div>
        <div className="modal-b">
          <div className="mrow" style={{ alignItems: "center" }}>
            <select className="min" style={{ width: 110 }} value={civ} onChange={(e) => setCiv(e.target.value)}>
              <option>Monsieur</option><option>Madame</option>
            </select>
            <input className="min" style={{ width: 130 }} placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            <input className={`min${!nom.trim() ? " requis" : ""}`} style={{ width: 150 }}
              placeholder="NOM" value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div className="mrow" style={{ marginTop: 6 }}>
            <input className={`min${email.trim() && !emailOk ? " ko" : ""}${!email.trim() ? " requis" : ""}`}
              style={{ width: 200 }} placeholder="E-mail (obligatoire)" value={email}
              onChange={(e) => setEmail(e.target.value)} />
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
            className={`kgo${completContact ? " btn-pret" : ""}`} type="button"
            disabled={pending || !completContact}
            title={completContact ? undefined : "Le nom et une adresse e-mail valide sont nécessaires"}
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

/* Sources possibles d'un immeuble, relevées sur le menu déroulant du BO. */
const SOURCES_IMMEUBLE = [
  "Appel à l'agence", "E-mail à contact@", "Interragence", "Parrainage",
  "SeLoger", "LeBonCoin", "LaBonnePierre", "Autre portail immobilier",
  "Linkedin", "Facebook", "Prospection", "Relationnel", "Acheteur", "Notaire",
  "Autre", "Immeuble acheté avec France Immeuble", "Site web",
];

function NewImmeubleModal({ agents, onClose }: { agents: Agent[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adresse, setAdresse] = useState<AdresseChoisie | null>(null);
  const [source, setSource] = useState("");
  /* Par défaut l'agent aux commandes, pas le premier de la liste (#67). */
  const { slug: agent, choisir: setAgent } = useAgentCourant(agents);
  const [proprio, setProprio] = useState<{ id: string; nom: string } | null>(null);
  const [picker, setPicker] = useState(false);

  const pret = !!adresse?.ville && !!source;

  return (
    <div className="modal-ov">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Créer un nouvel immeuble<button type="button" onClick={onClose}>✕</button></div>
        <div className="modal-b">
          <div className="mrow" style={{ alignItems: "flex-start", gap: 14 }}>
            <label style={{ flex: 1 }}>
              <span className="mlab">Source</span>
              <select className={`min${source ? "" : " vide"}`} style={{ width: "100%" }} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="" />
                {SOURCES_IMMEUBLE.map((s2) => <option key={s2}>{s2}</option>)}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <span className="mlab">Suivi par</span>
              <select className="min" style={{ width: "100%" }} value={agent} onChange={(e) => setAgent(e.target.value)}>
                {agents.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
              </select>
            </label>
          </div>

          <span className="mlab">Propriétaire</span>
          <div className="mrow" style={{ alignItems: "center" }}>
            {proprio ? (
              <>
                <span className="fchip">{proprio.nom}</span>
                <button type="button" className="fadd" onClick={() => setPicker(true)}>Changer</button>
                <button type="button" className="fadd" onClick={() => setProprio(null)}>Retirer</button>
              </>
            ) : (
              <button type="button" className="fadd" onClick={() => setPicker(true)}>
                + Sélectionner ou créer un propriétaire
              </button>
            )}
          </div>

          <span className="mlab">Adresse</span>
          <AdresseInput autoFocus onChoisir={setAdresse} />
          {adresse && (
            <div style={{ fontSize: 12, color: "var(--green)", marginTop: 4 }}>✓ {adresse.label}</div>
          )}

          <div style={{ fontSize: 12, color: "var(--gray-txt)", marginTop: 10 }}>
            L&apos;immeuble est créé dans « Immeubles à estimer » ; lots et suivi se
            complètent ensuite sur la fiche.
          </div>
        </div>
        <div className="modal-f">
          <button
            className="kgo" type="button" disabled={pending || !pret}
            style={pending || !pret ? { opacity: 0.5 } : undefined}
            onClick={() =>
              start(async () => {
                if (!adresse) return;
                const id = await createImmeuble({
                  agentId: agents.find((a) => a.slug === agent)?.id ?? "",
                  ville: adresse.ville ?? "", zipcode: adresse.cp,
                  rue: adresse.rue, numero_rue: adresse.numero,
                  proprietaireId: proprio?.id,
                  source,
                  geo: adresse.lat !== undefined && adresse.lon !== undefined
                    ? { lat: adresse.lat, lon: adresse.lon, label: adresse.label }
                    : undefined,
                });
                onClose();
                router.push(`/bien/${id}`);
              })
            }
          ><span className="ch">›</span> Créer l&apos;immeuble</button>
        </div>
        {picker && (
          <ContactPicker
            titre="Sélectionner le propriétaire"
            libelleValider="Choisir ce contact"
            onAnnuler={() => setPicker(false)}
            onValider={(c) => { setProprio({ id: c.id, nom: c.nom }); setPicker(false); }}
          />
        )}
      </div>
    </div>
  );
}
