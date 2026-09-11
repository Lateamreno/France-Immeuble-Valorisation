"use client";

// Modales du dashboard reprises du BO (retours MAV #25, #26, #29) :
//   • « Validation du formulaire » — par quel moyen le contact a été joint,
//     avant de faire passer le bien à l'étape suivante (donnée de statistique) ;
//   • fiche contact en survol — coordonnées seules, sans ouvrir le bien ;
//   • « Transférer à un collègue » — agent destinataire + transfert éventuel
//     du propriétaire, avec les droits du BO.
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

/* ---------- Validation du formulaire (mode de contact) ---------- */

const MOYENS = [
  { key: "Téléphone", icon: <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /> },
  { key: "SMS", icon: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18.5h2" /></> },
  { key: "E-mail", icon: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 5 9-5" /></> },
];

export function ModaleMoyenContact({
  onAnnuler, onConfirmer,
}: {
  onAnnuler: () => void;
  /** Reçoit le moyen retenu ; c'est l'appelant qui fait avancer le statut. */
  onConfirmer: (moyen: string) => void;
}) {
  const [moyen, setMoyen] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onAnnuler(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnnuler]);

  return createPortal(
    <div className="modal-ov">
      <div className="modal vf" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mod-x" title="Fermer" aria-label="Fermer" onClick={onAnnuler}>✕</button>

        <div className="vf-head">Validation du formulaire</div>
        <div className="vf-body">
          <p>Indiquez par quel moyen vous avez réussi à joindre le contact :</p>
          <div className="vf-choix">
            {MOYENS.map((m) => (
              <button key={m.key} type="button" className={`vf-opt${moyen === m.key ? " on" : ""}`}
                onClick={() => setMoyen(m.key)}>
                <svg viewBox="0 0 24 24">{m.icon}</svg>
                {m.key}
              </button>
            ))}
          </div>
        </div>
        <div className="vf-foot">
          <button type="button" className="vf-annuler" onClick={onAnnuler}>Annuler</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="vf-go" disabled={!moyen || pending}
            onClick={() => moyen && start(() => onConfirmer(moyen))}>
            <svg viewBox="0 0 24 24"><rect x="6" y="10" width="12" height="10" rx="2" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></svg>
            Confirmer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Fiche contact en survol ---------- */

export type ContactBref = {
  nom: string;
  type?: string;
  tel?: string;
  email?: string;
  initiales?: string;
  /** Couleur de l'agent (#344), pour la pastille d'initiales. */
  initialesCouleur?: string;
  nbImmeubles?: number;
  nbRecherches?: number;
};

export function FicheContact({ c, onClose }: { c: ContactBref; onClose: () => void }) {
  useEffect(() => {
    const away = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // Le clic qui vient d'ouvrir la fiche ne doit pas la refermer aussitôt.
    const t = setTimeout(() => document.addEventListener("mousedown", away), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fcont" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <div className="fcont-h">
        <span className="fcont-av">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c.8-4.2 3.9-6 7.5-6s6.7 1.8 7.5 6" /></svg>
          {c.initiales && <b style={c.initialesCouleur ? { background: c.initialesCouleur } : undefined}>{c.initiales}</b>}
        </span>
        <div className="fcont-id">
          <div className="n">{c.nom || "—"}</div>
          {c.type && <div className="t">{c.type}</div>}
          {c.tel && (
            <div className="l">
              <svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18.5h2" /></svg>
              {c.tel}
            </div>
          )}
          {c.email && <div className="l m">{c.email}</div>}
        </div>
      </div>
      <div className="fcont-n">
        <span>
          <svg viewBox="0 0 24 24"><path d="M5 2h11v20H5z" /><path d="M8 6h2M12 6h2M8 10h2M12 10h2M8 14h2M12 14h2" /></svg>
          {c.nbImmeubles ?? 0}
        </span>
        <span className="off">
          <svg viewBox="0 0 24 24"><circle cx="7" cy="14" r="4" /><circle cx="17" cy="14" r="4" /><path d="M7 10V6h10v4" /></svg>
          {c.nbRecherches ?? 0}
        </span>
      </div>
      <div className="fcont-f">
        <a className={c.tel ? "" : "off"} href={c.tel ? `tel:${c.tel}` : undefined}>
          <svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
          Appeler
        </a>
        <a className={c.email ? "" : "off"} href={c.email ? `mailto:${c.email}` : undefined}>
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 5 9-5" /></svg>
          E-mail
        </a>
      </div>
    </div>
  );
}

/* ---------- Transférer à un collègue ---------- */

export function ModaleTransfert({
  bien, agents, peutTransferer, onAnnuler, onTransferer,
}: {
  bien: { ville: string; adresse: string; contact?: string; photoUrl?: string; initiales?: string; initialesCouleur?: string; statut?: string; note?: string };
  agents: { id: string; name: string }[];
  /** Un agent ne transfère que ses propres biens ; l'admin transfère tout. */
  peutTransferer: boolean;
  onAnnuler: () => void;
  onTransferer: (agentId: string, avecProprietaire: boolean) => void;
}) {
  const [dest, setDest] = useState("");
  const [avecProprio, setAvecProprio] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onAnnuler(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnnuler]);

  return createPortal(
    <div className="modal-ov">
      <div className="modal tr" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mod-x" title="Fermer" aria-label="Fermer" onClick={onAnnuler}>✕</button>

        <div className="tr-head">
          <svg viewBox="0 0 24 24"><path d="M4 12h14M13 7l5 5-5 5" /></svg>
          Transférer à un collègue
        </div>
        <div className="tr-body">
          <div className="tr-lab">
            <svg viewBox="0 0 24 24"><path d="M5 2h11v20H5z" /><path d="M8 6h2M12 6h2M8 10h2M12 10h2" /></svg>
            Immeuble
          </div>
          <div className="tr-bien">
            <span className="tr-photo">
              {bien.photoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={bien.photoUrl} alt="" />
                : <svg viewBox="0 0 24 24"><path d="M5 2h11v20H5z" /></svg>}
              {bien.initiales && <b style={bien.initialesCouleur ? { background: bien.initialesCouleur } : undefined}>{bien.initiales}</b>}
            </span>
            <div className="tr-info">
              <div className="tr-t">
                {bien.ville} <span>- {bien.adresse}</span>
                {bien.contact && (
                  <span className="tr-c">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
                    {bien.contact}
                  </span>
                )}
              </div>
              {bien.note && <div className="tr-n">{bien.note}</div>}
            </div>
          </div>

          <div className="tr-row">
            <span className="tr-lab dim">
              <svg viewBox="0 0 24 24"><path d="M4 12h14M13 7l5 5-5 5" /></svg>
              Transférer à
            </span>
            <select className={`tr-sel${dest ? "" : " vide"}`} value={dest} onChange={(e) => setDest(e.target.value)}>
              <option value="" />
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div className="tr-row">
            <span className="tr-lab">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
              Transférer également le propriétaire
            </span>
            <span className="tr-radios">
              <button type="button" className={avecProprio ? "on" : ""} onClick={() => setAvecProprio(true)}>
                <i /> Oui
              </button>
              <button type="button" className={!avecProprio ? "on" : ""} onClick={() => setAvecProprio(false)}>
                <i /> Non
              </button>
            </span>
          </div>

          {!peutTransferer && (
            <div className="warnbox">
              Vous ne pouvez transférer que les immeubles que vous suivez.
            </div>
          )}
        </div>
        <div className="tr-foot">
          <button type="button" className="vf-annuler" onClick={onAnnuler}>Annuler</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="vf-go" disabled={!dest || pending || !peutTransferer}
            onClick={() => dest && start(() => onTransferer(dest, avecProprio))}>
            <span className="ch">›</span> Transférer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Mettre un dossier en attente (retours #139 et #141).
 *
 * MAV : « passer en "en attente car peu important" et du coup ils sont dans le
 * "en attente" et ils sortent du "en cours" ». Ce n'est pas un archivage : le
 * dossier n'est pas mort, il est repoussé. La date de déblocage est donc
 * obligatoire dans l'esprit, même quand elle vaut « indéfiniment ».
 *
 * L'e-mail au propriétaire est proposé, jamais imposé : « ça permet de mettre
 * le propriétaire dans la boucle ». Il n'est pas envoyé d'ici — l'écran le
 * prépare, l'agent l'envoie depuis sa boîte, comme partout ailleurs.
 */
const DELAIS = [
  { label: "1 mois", mois: 1 },
  { label: "3 mois", mois: 3 },
  { label: "6 mois", mois: 6 },
  { label: "1 an", mois: 12 },
  { label: "Indéfiniment", mois: 0 },
] as const;

const MOTIFS_ATTENTE = [
  "Peu important",
  "Prix trop élevé pour le marché",
  "Propriétaire pas décidé",
  "À revoir après travaux",
  "Succession / indivision en cours",
];

/** yyyy-mm-dd, n mois plus tard. */
function dansNMois(mois: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + mois);
  return d.toISOString().slice(0, 10);
}

export function ModaleAttente({
  bien, onAnnuler, onValider,
}: {
  bien: { ville: string; adresse: string; proprietaire?: string; email?: string };
  onAnnuler: () => void;
  onValider: (v: { motif: string; dateRelance?: string; email?: { to: string; objet: string; corps: string } }) => void;
}) {
  const [motif, setMotif] = useState(MOTIFS_ATTENTE[0]);
  const [choix, setChoix] = useState(2); // 6 mois par défaut
  const [date, setDate] = useState(dansNMois(6));
  const [prevenir, setPrevenir] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onAnnuler(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnnuler]);

  const indefini = DELAIS[choix].mois === 0;
  const quand = date.split("-").reverse().join("/");
  const objet = `Votre bien ${bien.ville} — nous restons à votre disposition`;
  const corps = [
    `Bonjour${bien.proprietaire ? ` ${bien.proprietaire}` : ""},`,
    "",
    `Comme convenu, nous mettons votre dossier${bien.adresse ? ` (${bien.adresse}, ${bien.ville})` : ""} en attente.`,
    indefini
      ? "Nous restons évidemment disponibles : dites-nous simplement quand vous souhaitez que nous reprenions le sujet."
      : `Nous vous recontacterons autour du ${quand}. N'hésitez pas à nous proposer une date si vous préférez en reparler plus tôt.`,
    "",
    "Bien à vous,",
  ].join("\n");

  return createPortal(
    <div className="modal-ov">
      <div className="modal att" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mod-x" title="Fermer" aria-label="Fermer" onClick={onAnnuler}>✕</button>

        <div className="tr-head">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          Mettre en attente
        </div>

        <div className="tr-body">
          <div className="att-bien">
            <b>{bien.ville}</b> <span>— {bien.adresse}</span>
          </div>

          <label className="att-ch">
            <span>Motif</span>
            <input list="att-motifs" value={motif} onChange={(e) => setMotif(e.target.value)} />
            <datalist id="att-motifs">
              {MOTIFS_ATTENTE.map((m) => <option key={m} value={m} />)}
            </datalist>
          </label>

          <div className="att-ch">
            <span>On y revient dans</span>
            <div className="att-delais">
              {DELAIS.map((d, i) => (
                <button key={d.label} type="button" className={choix === i ? "on" : ""}
                  onClick={() => { setChoix(i); if (d.mois) setDate(dansNMois(d.mois)); }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {!indefini && (
            <label className="att-ch">
              {/* La date exacte en plus des raccourcis (retour #141). */}
              <span>Date exacte</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          )}

          <label className="att-prev">
            <input type="checkbox" checked={prevenir} disabled={!bien.email}
              onChange={() => setPrevenir(!prevenir)} />
            Prévenir le propriétaire par e-mail
            {!bien.email && <i> — pas d&apos;adresse e-mail sur la fiche</i>}
          </label>

          {prevenir && bien.email && (
            <div className="att-mail">
              <b>{objet}</b>
              <pre>{corps}</pre>
              <span>Le message s&apos;ouvrira dans la fenêtre de rédaction : rien ne part sans vous.</span>
            </div>
          )}
        </div>

        <div className="tr-foot">
          <button type="button" className="vf-annuler" onClick={onAnnuler}>Annuler</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="vf-go" disabled={pending || !motif.trim()}
            onClick={() => start(() => onValider({
              motif: motif.trim(),
              dateRelance: indefini ? undefined : date,
              email: prevenir && bien.email ? { to: bien.email, objet, corps } : undefined,
            }))}>
            <span className="ch">›</span> Mettre en attente
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
