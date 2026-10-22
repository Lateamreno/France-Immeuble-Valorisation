"use client";

/* Bibliothèque des messages types (retour #108).
 *
 * MAV : « peut-être qu'il ne faudrait pas appeler ça brouillons mais message
 * type pour ne pas confondre avec les brouillons non encore envoyés ». Les
 * deux existent donc et ne se mélangent pas : un message type est un texte
 * réutilisable, un brouillon est un message qui attend de partir.
 */

import { useState, useTransition } from "react";
import type { MessageType } from "@/lib/mails/serveur";
import { CIBLES } from "@/lib/mails/audience";
import { TexteBalise, ZoneRedaction } from "@/components/mails/editeur";
import { archiverMessageType, creerMessageType, majMessageType } from "@/lib/bo/mails-actions";

const APERCU = {
  civilite: "Monsieur", prenom: "Nicolas", nom: "LANSKI",
  nom_complet: "M. Nicolas LANSKI", politesse: "Bonjour Monsieur LANSKI",
  societe: "SCI LLA", immeuble: "Montreuil (93100) - 15 Rue de Normandie",
  immeuble_ville: "Montreuil", immeuble_cp: "93100",
  immeuble_prix: "8 678 843 €", immeuble_surface: "1 436 m²", immeuble_renta: "6,9 %",
  agence: "France Immeuble", site: "france-immeuble.fr",
};

export function Bibliotheque({ modeles, agentId, onUtiliser }: {
  modeles: MessageType[];
  agentId: string;
  onUtiliser: (m: MessageType) => void;
}) {
  const [edite, setEdite] = useState<MessageType | "nouveau" | null>(null);

  return (
    <section className="gm-plein">
      <div className="gm-plein-h">
        <h2>Messages types</h2>
        <p>
          Des textes réutilisables, avec leurs champs de fusion. À ne pas confondre
          avec les brouillons, qui sont des messages en attente d&apos;envoi.
        </p>
        <span style={{ flex: 1 }} />
        <button type="button" className="gm-new petit" onClick={() => setEdite("nouveau")}>
          + Nouveau message type
        </button>
      </div>

      <div className="mt-grille">
        {modeles.map((m) => (
          <article key={m.id} className="mt-carte">
            <header>
              <b>{m.libelle}</b>
              {m.cible && <span className="mt-cible">{CIBLES.find((c) => c.cle === m.cible)?.label ?? m.cible}</span>}
              {m.usages > 0 && <i>{m.usages} envoi{m.usages > 1 ? "s" : ""}</i>}
            </header>
            <div className="mt-objet"><TexteBalise texte={m.objet || "(sans objet)"} /></div>
            <div className="mt-corps"><TexteBalise texte={m.corps.slice(0, 320)} />{m.corps.length > 320 && "…"}</div>
            <footer>
              <button type="button" className="fadd" onClick={() => onUtiliser(m)}>Utiliser</button>
              <button type="button" className="fadd" onClick={() => setEdite(m)}>Modifier</button>
              <span style={{ flex: 1 }} />
              <ArchiverBouton id={m.id} />
            </footer>
          </article>
        ))}
        {modeles.length === 0 && (
          <div className="fempty">
            Aucun message type. Créez-en un, ou cochez « Enregistrer ce texte comme
            message type » à la fin d&apos;un envoi.
          </div>
        )}
      </div>

      {edite && (
        <Editeur
          modele={edite === "nouveau" ? undefined : edite}
          agentId={agentId}
          onClose={() => setEdite(null)}
        />
      )}
    </section>
  );
}

function ArchiverBouton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [sur, setSur] = useState(false);
  if (!sur) {
    return <button type="button" className="xdel" title="Archiver" onClick={() => setSur(true)}>🗑</button>;
  }
  return (
    <span className="mt-confirm">
      Archiver ?
      <button type="button" className="fadd" onClick={() => setSur(false)}>Non</button>
      <button type="button" className="fadd danger" disabled={pending}
        onClick={() => start(() => archiverMessageType(id))}>Oui</button>
    </span>
  );
}

function Editeur({ modele, agentId, onClose }: {
  modele?: MessageType; agentId: string; onClose: () => void;
}) {
  const [libelle, setLibelle] = useState(modele?.libelle ?? "");
  const [cible, setCible] = useState<string>(modele?.cible ?? "");
  const [objet, setObjet] = useState(modele?.objet ?? "");
  const [corps, setCorps] = useState(modele?.corps ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const enregistrer = () =>
    start(async () => {
      setErreur(null);
      try {
        if (modele) await majMessageType(modele.id, { libelle, cible: cible || null, objet, corps });
        else await creerMessageType({ libelle, cible: cible || null, objet, corps, agentId });
        onClose();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal mail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <b>{modele ? "Modifier le message type" : "Nouveau message type"}</b>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <div className="modal-b">
          <div className="mred-entete">
            <label className="mred-l">
              <span>Nom</span>
              <input value={libelle} onChange={(e) => setLibelle(e.target.value)}
                placeholder="Relance propriétaire — 1re relance" autoFocus />
            </label>
            <label className="mred-l court">
              <span>Pour qui</span>
              <select value={cible} onChange={(e) => setCible(e.target.value)}>
                <option value="">Tout le monde</option>
                {CIBLES.map((c) => <option key={c.cle} value={c.cle}>{c.label}</option>)}
              </select>
            </label>
          </div>

          <ZoneRedaction objet={objet} corps={corps} setObjet={setObjet} setCorps={setCorps}
            valeursApercu={APERCU} nomApercu="un destinataire type" />

          {erreur && <div className="dif-avis" style={{ marginTop: 10 }}>{erreur}</div>}
        </div>
        <div className="modal-f">
          <span style={{ flex: 1 }} />
          <button type="button" className="savebar-go" disabled={pending || !libelle.trim()}
            onClick={enregistrer}>
            <span className="ch">›</span> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
