"use client";

// Modale de sélection / création de contact (retours MAV #31 et #32).
// Réplique de « Sélectionner un apporteur » du BO : rappel de la valeur
// courante, recherche en base, et création à la volée si le contact n'existe
// pas encore. Le même composant sert pour l'apporteur d'affaire et pour la
// personne contactée de la modale Suivi.
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { chercherContacts, createContact, type ContactTrouve } from "@/lib/bo/actions";

export function ContactPicker({
  titre, libelleValider, valeurActuelle, onAnnuler, onValider,
}: {
  /** Ex. « Sélectionner un apporteur ». */
  titre: string;
  /** Ex. « Modifier l'apporteur ». */
  libelleValider: string;
  valeurActuelle?: string;
  onAnnuler: () => void;
  onValider: (c: ContactTrouve) => void;
}) {
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<ContactTrouve[]>([]);
  const [choisi, setChoisi] = useState<ContactTrouve | null>(null);
  const [creation, setCreation] = useState(false);
  const [nouveau, setNouveau] = useState({ prenom: "", nom: "", email: "", tel: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => { champ.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onAnnuler(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnnuler]);

  // Recherche différée : on ne part pas en base à chaque frappe.
  useEffect(() => {
    if (creation) return;
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setResultats([]); return; }
      chercherContacts(q).then(setResultats).catch(() => setResultats([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, creation]);

  const creer = () =>
    start(async () => {
      setErr(null);
      try {
        const id = await createContact({
          "prénom": nouveau.prenom.trim() || undefined,
          nom: nouveau.nom.trim() || undefined,
          email: nouveau.email.trim() || undefined,
          portable: nouveau.tel.trim() || undefined,
        });
        onValider({
          id,
          nom: `${nouveau.prenom} ${nouveau.nom}`.trim(),
          email: nouveau.email.trim() || undefined,
          tel: nouveau.tel.trim() || undefined,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });

  return createPortal(
    <div className="modal-ov" onClick={onAnnuler}>
      <div className="modal cp" onClick={(e) => e.stopPropagation()}>
        <div className="cp-head">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
          {titre}
        </div>

        <div className="cp-rappel">
          <span className="cp-alerte">
            <svg viewBox="0 0 24 24"><path d="M12 3 1.8 21h20.4z" /><path d="M12 10v5M12 17.6v.2" /></svg>
            {choisi ? "Contact sélectionné" : titre}
          </span>
          <span className={`cp-val${choisi || valeurActuelle ? " on" : ""}`}>
            {!choisi && !valeurActuelle && (
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m6 18 12-12" /></svg>
            )}
            {choisi?.nom ?? valeurActuelle ?? "Pas de contact"}
          </span>
        </div>

        {creation ? (
          <div className="cp-form">
            <input className="min" autoFocus placeholder="Prénom" value={nouveau.prenom}
              onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })} />
            <input className="min" placeholder="Nom" value={nouveau.nom}
              onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} />
            <input className="min" placeholder="E-mail" value={nouveau.email}
              onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} />
            <input className="min" placeholder="Téléphone" value={nouveau.tel}
              onChange={(e) => setNouveau({ ...nouveau, tel: e.target.value })} />
          </div>
        ) : (
          <>
            <div className="cp-search">
              <input ref={champ} placeholder="Recherchez un contact..." value={q}
                onChange={(e) => { setQ(e.target.value); setChoisi(null); }} />
              <button type="button" className="cp-plus" title="Créer un contact"
                onClick={() => { setCreation(true); const [p, ...r] = q.trim().split(" "); setNouveau({ prenom: p ?? "", nom: r.join(" "), email: "", tel: "" }); }}>
                <svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="3.4" /><path d="M3.5 20c.7-4 3.2-5.6 6.5-5.6M17 12v6M14 15h6" /></svg>
              </button>
              <span className="cp-loupe">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
              </span>
            </div>
            {resultats.length > 0 && (
              <div className="cp-list">
                {resultats.map((c) => (
                  <button key={c.id} type="button" className={`cp-item${choisi?.id === c.id ? " on" : ""}`}
                    onClick={() => setChoisi(c)}>
                    <b>{c.nom}</b>
                    <i>{[c.type, c.tel, c.email].filter(Boolean).join(" · ")}</i>
                  </button>
                ))}
              </div>
            )}
            {q.trim().length >= 2 && resultats.length === 0 && (
              <div className="cp-vide">Aucun contact trouvé — utilisez le bouton pour le créer.</div>
            )}
          </>
        )}

        {err && <div className="warnbox" style={{ margin: "0 16px", color: "var(--red)", borderColor: "var(--red)" }}>{err}</div>}

        <div className="cp-foot">
          <button type="button" className="vf-annuler"
            onClick={() => (creation ? setCreation(false) : onAnnuler())}>
            {creation ? "Retour" : "Annuler"}
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="vf-go"
            disabled={pending || (creation ? !nouveau.nom.trim() : !choisi)}
            onClick={() => (creation ? creer() : choisi && onValider(choisi))}>
            <span className="ch">›</span> {creation ? "Créer le contact" : libelleValider}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
