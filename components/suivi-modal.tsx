"use client";

// Modale « Suivi » — réplique fidèle de celle du BO (capture MAV du 11/08) :
// Personne contactée (+ bouton de changement), Objet de l'échange, Contacté par
// en MULTI-sélection, Notes, « Mettre en attente jusqu'au … car … » avec
// bascule Oui/Non. Utilisée depuis la bulle des cartes du dashboard ET depuis
// la fiche bien.
import { useState, useTransition } from "react";
import { addSuivi } from "@/lib/bo/actions";
import { ContactPicker } from "@/components/contact-picker";
import { Modale } from "@/components/modale";
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

  const toggleCanal = (k: string) =>
    setCanaux((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  /* Le bouton n'est vert que lorsque l'enregistrement est réellement
     possible : un mode de contact, une note non vide, et — si le bien part
     en attente — un motif et une date postérieure à aujourd'hui (#72). */
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const complet =
    canaux.length > 0 &&
    notes.trim().length > 0 &&
    (!attente || (!!motif && date > aujourdhui));

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

  /* En-tête maison (bandeau sombre, croix blanche) et lignes à bordure : la
     fenêtre partagée ne pose que le voile, Échap et le portail. */
  return (
    <Modale className="sv" onFermer={onClose} fermeDehors={false} entete={false} brut>
      <button type="button" className="mod-x" title="Fermer" aria-label="Fermer" onClick={onClose}>✕</button>

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
          {/* Retour #467 : une vraie ampoule, bulbe et culot. */}
          <svg viewBox="0 0 24 24"><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.9.7 1.4 1.5 1.6 2.4h4.4c.2-.9.7-1.7 1.6-2.4A6.5 6.5 0 0 0 12 2.5z" /><path d="M9.5 18.5h5M9.8 20.5h4.4M11 22.3h2" /></svg>
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
          {/* Retour #469 : un « i » dans un cercle, avec son point visible. */}
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.6" r="1.15" fill="currentColor" stroke="none" /></svg>
          Notes
        </span>
        <textarea className="sv-notes" rows={2} autoFocus
          placeholder="Ecrivez ici vos notes de suivi, remarques..."
          value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {/* Replié par défaut sur « Non » : la date et le motif n'apparaissent
          qu'une fois « Oui » choisi, comme dans le BO (retour #33). Et tout
          tient sur UNE ligne, comme dans le BO : « Mettre en attente jusqu'au
          [date] car [motif] … Oui / Non » (retour #471). */}
      <div className="sv-row sv-attente">
        <span className="sv-lab">
          {/* Retour #470 : un vrai sablier. */}
          <svg viewBox="0 0 24 24"><path d="M6 3h12M6 21h12" /><path d="M8 3v3.2a4 4 0 0 0 1.6 3.2L12 12l2.4-2.6A4 4 0 0 0 16 6.2V3" /><path d="M8 21v-3.2a4 4 0 0 1 1.6-3.2L12 12l2.4 2.6a4 4 0 0 1 1.6 3.2V21" /><path d="M10.5 19.5h3" fill="currentColor" /></svg>
          Mettre en attente{attente && <span className="sv-dim"> jusqu&apos;au</span>}
        </span>
        <span className="sv-val">
          {attente && (
            <>
              <input className="min" type="date" style={{ width: 140 }} value={date}
                onChange={(e) => setDate(e.target.value)} />
              <span className="sv-dim">car</span>
              <select className="min" style={{ width: 220 }} value={motif}
                onChange={(e) => setMotif(e.target.value)}>
                <option value="">Sélectionnez un motif</option>
                {MOTIFS_STANDBY.map((m) => <option key={m}>{m}</option>)}
              </select>
            </>
          )}
          <span className="sv-yn">
            <button type="button" className={attente ? "on" : ""} onClick={() => setAttente(true)}>Oui</button>
            <button type="button" className={!attente ? "on non" : "non"} onClick={() => setAttente(false)}>Non</button>
          </span>
        </span>
      </div>

      {err && <div className="warnbox" style={{ margin: "0 18px", color: "var(--red)", borderColor: "var(--red)" }}>{err}</div>}

      <div className="sv-foot">
        <button type="button" className="sv-annuler" onClick={onClose}>Annuler</button>
        <span style={{ flex: 1 }} />
        <button className={`sv-go${complet ? " pret" : ""}`} type="button"
          disabled={pending || !complet}
          title={complet ? undefined : "Renseignez le mode de contact et une note" }
          onClick={valider}>
          {attente ? (
            <><svg viewBox="0 0 24 24"><path d="M6 3h12M6 21h12" /><path d="M8 3v3.2a4 4 0 0 0 1.6 3.2L12 12l2.4-2.6A4 4 0 0 0 16 6.2V3" /><path d="M8 21v-3.2a4 4 0 0 1 1.6-3.2L12 12l2.4 2.6a4 4 0 0 1 1.6 3.2V21" /></svg> Mettre en attente</>
          ) : (
            <><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg> Enregistrer le suivi</>
          )}
        </button>
      </div>
    </Modale>
  );
}
