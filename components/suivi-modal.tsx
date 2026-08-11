"use client";

// Modale « Suivi » — réplique fidèle de celle du BO (capture MAV du 11/08) :
// Personne contactée (+ bouton de changement), Objet de l'échange, Contacté par
// en MULTI-sélection, Notes, « Mettre en attente jusqu'au … car … » avec
// bascule Oui/Non. Utilisée depuis la bulle des cartes du dashboard ET depuis
// la fiche bien.
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { addSuivi } from "@/lib/bo/actions";
import { ContactPicker } from "@/components/contact-picker";
import { MOTIFS_STANDBY } from "@/lib/referentiels";

const CANAUX = [
  { key: "Téléphone", icon: <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /> },
  { key: "Message téléphonique", icon: <path d="M4 9v6h3l5 4V5L7 9H4zM17 8a6 6 0 0 1 0 8M19.5 5.5a10 10 0 0 1 0 13" /> },
  { key: "SMS", icon: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18.5h2" /></> },
  { key: "E-mail", icon: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 5 9-5" /></> },
];

const dansUnMois = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
};

export function SuiviModal({
  immeubleId, agentId, objet, contactNom, contactId, onClose,
}: {
  immeubleId: string;
  agentId: string;
  /** Libellé de l'objet de l'échange (ville - adresse). */
  objet: string;
  contactNom?: string;
  contactId?: string;
  onClose: () => void;
}) {
  const [canaux, setCanaux] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [attente, setAttente] = useState(false);
  const [date, setDate] = useState(dansUnMois());
  const [motif, setMotif] = useState("");
  const [personne, setPersonne] = useState(contactNom ?? "");
  const [personneId, setPersonneId] = useState(contactId);
  const [changePersonne, setChangePersonne] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleCanal = (k: string) =>
    setCanaux((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  const valider = () =>
    start(async () => {
      setErr(null);
      try {
        await addSuivi({
          immeubleId, agentId, contactId: personneId,
          canaux: canaux.length ? canaux : ["Téléphone"],
          notes,
          standby: attente && motif ? { motif, dateRelance: date } : undefined,
        });
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });

  if (changePersonne) {
    return (
      <ContactPicker
        titre="Sélectionner la personne contactée"
        libelleValider="Choisir cette personne"
        valeurActuelle={personne || undefined}
        onAnnuler={() => setChangePersonne(false)}
        onValider={(c) => { setPersonne(c.nom); setPersonneId(c.id); setChangePersonne(false); }}
      />
    );
  }

  return createPortal(
    <div className="modal-ov" onClick={onClose}>
      <div className="modal sv" onClick={(e) => e.stopPropagation()}>
        <div className="sv-head">
          <svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" /></svg>
          Suivi
        </div>

        <div className="sv-row">
          <span className="sv-lab">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
            Personne contactée
          </span>
          <span className="sv-val">
            <span className="sv-chip">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
              {personne || "—"}
            </span>
            <button className="sv-swap" type="button" title="Changer la personne contactée"
              onClick={() => setChangePersonne(true)}>⇄</button>
          </span>
        </div>

        <div className="sv-row">
          <span className="sv-lab">
            <svg viewBox="0 0 24 24"><path d="M12 3a5 5 0 0 1 3 9v2H9v-2a5 5 0 0 1 3-9zM10 18h4" /></svg>
            Objet de l&apos;échange
            <button className="sv-mini" type="button" title="Ajouter un autre objet" disabled>+</button>
          </span>
          <span className="sv-val">
            <span className="sv-chip">
              <svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2" /></svg>
              {objet}
            </span>
            <button className="sv-mini" type="button" title="Retirer cet objet" disabled>
              <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
            </button>
          </span>
        </div>

        <div className="sv-row">
          <span className="sv-lab">
            <svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" /></svg>
            Contacté par
          </span>
          <span className="sv-val sv-canaux">
            {CANAUX.map((c) => (
              <button key={c.key} type="button" className={`sv-canal${canaux.includes(c.key) ? " on" : ""}`}
                onClick={() => toggleCanal(c.key)}>
                <svg viewBox="0 0 24 24">{c.icon}</svg>{c.key}
              </button>
            ))}
          </span>
        </div>

        <div className="sv-row col">
          <span className="sv-lab">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.2" /></svg>
            Notes
          </span>
          <textarea className="sv-notes" rows={2} autoFocus
            placeholder="Ecrivez ici vos notes de suivi, remarques..."
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* Replié par défaut sur « Non » : la date et le motif n'apparaissent
            qu'une fois « Oui » choisi, comme dans le BO (retour #33). */}
        <div className="sv-row">
          <span className="sv-lab">
            <svg viewBox="0 0 24 24"><path d="M7 3h10M7 21h10M8 3c0 4 8 5 8 9s-8 5-8 9" /></svg>
            Mettre en attente
          </span>
          <span className="sv-val">
            <span className="sv-yn">
              <button type="button" className={attente ? "on" : ""} onClick={() => setAttente(true)}>Oui</button>
              <button type="button" className={!attente ? "on non" : "non"} onClick={() => setAttente(false)}>Non</button>
            </span>
          </span>
        </div>
        {attente && (
          <div className="sv-row">
            <span className="sv-lab dim">jusqu&apos;au</span>
            <span className="sv-val">
              <input className="min" type="date" style={{ width: 140 }} value={date}
                onChange={(e) => setDate(e.target.value)} />
              <span style={{ fontSize: 12.5, color: "var(--gray-txt)" }}>car</span>
              <select className="min" style={{ width: 220 }} value={motif}
                onChange={(e) => setMotif(e.target.value)}>
                <option value="">Sélectionnez un motif</option>
                {MOTIFS_STANDBY.map((m) => <option key={m}>{m}</option>)}
              </select>
            </span>
          </div>
        )}

        {err && <div className="warnbox" style={{ margin: "0 18px", color: "var(--red)", borderColor: "var(--red)" }}>{err}</div>}

        <div className="sv-foot">
          <button type="button" className="sv-annuler" onClick={onClose}>Annuler</button>
          <span style={{ flex: 1 }} />
          <button className="sv-go" type="button" disabled={pending || (attente && !motif)}
            style={pending || (attente && !motif) ? { opacity: 0.5 } : undefined} onClick={valider}>
            {attente ? (
              <><svg viewBox="0 0 24 24"><path d="M7 3h10M7 21h10M8 3c0 4 8 5 8 9s-8 5-8 9" /></svg> Mettre en attente</>
            ) : (
              <><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg> Enregistrer le suivi</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
