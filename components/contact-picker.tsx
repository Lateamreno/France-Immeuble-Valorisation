"use client";

// Modale de sélection / création de contact (retours MAV #31 et #32).
// Réplique de « Sélectionner un apporteur » du BO : rappel de la valeur
// courante, recherche en base, et création à la volée si le contact n'existe
// pas encore. Le même composant sert pour l'apporteur d'affaire et pour la
// personne contactée de la modale Suivi.
import { useEffect, useState } from "react";
import { chercherContacts, type ContactTrouve } from "@/lib/bo/actions";
import { Modale } from "@/components/modale";
import { FenetreNouveauContact } from "@/components/nouveau-contact";

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
  /* La création ouvre LA fenêtre « Nouveau contact », la même que la barre du
     bas (MAV, 16/11) : un contact créé d'ici a les mêmes champs, le même
     « suivi par » et le même contrôle de doublon. */
  const [creation, setCreation] = useState<{ prenom: string; nom: string } | null>(null);

  // Recherche différée : on ne part pas en base à chaque frappe.
  useEffect(() => {
    if (creation) return;
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setResultats([]); return; }
      chercherContacts(q).then(setResultats).catch(() => setResultats([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, creation]);

  /* L'en-tête sombre et le pied sont ceux du BO : la fenêtre partagée ne
     fournit ici que le fond, Échap et le portail. */
  if (creation) {
    return (
      <FenetreNouveauContact initial={creation} onFermer={() => setCreation(null)} onCree={(c) => onValider(c)} />
    );
  }

  return (
    <Modale onFermer={onAnnuler} className="cp" fermeDehors={false} entete={false} brut>
      <button type="button" className="mod-x" title="Fermer" aria-label="Fermer" onClick={onAnnuler}>✕</button>

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

      <>
          <div className="cp-search">
            <input autoFocus placeholder="Recherchez un contact..." value={q}
              onChange={(e) => { setQ(e.target.value); setChoisi(null); }} />
            <button type="button" className="cp-plus" title="Créer un contact"
              onClick={() => { const [p, ...r] = q.trim().split(" "); setCreation({ prenom: p ?? "", nom: r.join(" ") }); }}>
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

      <div className="cp-foot">
        <button type="button" className="vf-annuler" onClick={onAnnuler}>Annuler</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="vf-go" disabled={!choisi}
          onClick={() => choisi && onValider(choisi)}>
          <span className="ch">›</span> {libelleValider}
        </button>
      </div>
    </Modale>
  );
}
