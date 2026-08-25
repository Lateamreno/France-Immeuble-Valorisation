"use client";

/* Fenêtre « Nouveau message » (retour #108).
 *
 * Un envoi unitaire. On peut partir d'un message type, et à la fin enregistrer
 * ce qu'on vient d'écrire comme nouveau message type — c'est le moment où on
 * sait que le texte est bon.
 */

import { useState, useTransition } from "react";
import type { Brouillon, MessageType } from "@/lib/mails/serveur";
import { ZoneRedaction } from "@/components/mails/editeur";
import {
  creerBrouillon, creerMessageType, envoyerUnMessage, majBrouillon,
} from "@/lib/bo/mails-actions";
import { repondre } from "@/lib/bo/boite-actions";
import { ChampDestinataires } from "@/components/mails/destinataires";

/** Aperçu : on ne connaît pas encore le destinataire réel dans une fenêtre
 *  d'envoi unitaire, on montre donc l'exemple de chaque champ. */
const APERCU_UNITAIRE = {
  civilite: "Monsieur", prenom: "Nicolas", nom: "LANSKI",
  nom_complet: "M. Nicolas LANSKI", politesse: "Bonjour Monsieur LANSKI",
  societe: "SCI LLA",
};

/**
 * Le message auquel on répond.
 *
 * Sans lui, une réponse repart comme un message neuf : le fil se casse chez le
 * destinataire, le chevron « répondu » ne s'allume pas dans la boîte, et le
 * jeton de rattachement ne revient pas. On le transporte donc jusqu'à l'envoi.
 */
export type Reponse = {
  role: "reception" | "envoyes" | "brouillons" | "indesirables" | "corbeille";
  uid: number;
  messageId?: string;
  references: string[];
};

export function FenetreRedaction({
  agent, modeles, brouillon, modele, reponse, onClose, onEnvoye,
}: {
  agent: { id: string; nom: string; email?: string; telephone?: string };
  modeles: MessageType[];
  brouillon?: Brouillon;
  modele?: MessageType;
  /** Renseigné quand la fenêtre est ouverte depuis « Répondre ». */
  reponse?: Reponse;
  onClose: () => void;
  /** Prévient l'écran qu'un message est parti, pour qu'il se rafraîchisse. */
  onEnvoye?: () => void;
}) {
  const [a, setA] = useState(brouillon?.destinataires.map((d) => d.email).join(", ") ?? "");
  const [objet, setObjet] = useState(brouillon?.objet ?? modele?.objet ?? "");
  const [corps, setCorps] = useState(brouillon?.corps ?? modele?.corps ?? "");
  const [enregistrerType, setEnregistrerType] = useState(false);
  const [libelleType, setLibelleType] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const appliquer = (id: string) => {
    const m = modeles.find((x) => x.id === id);
    if (!m) return;
    setObjet(m.objet);
    setCorps(m.corps);
  };

  const valeurs = {
    ...APERCU_UNITAIRE,
    email: a.split(",")[0]?.trim(),
    agent: agent.nom, agent_prenom: agent.nom.split(" ")[0],
    agent_email: agent.email, agent_tel: agent.telephone,
    agence: "France Immeuble", site: "france-immeuble.fr",
  };

  const envoyer = () =>
    start(async () => {
      setErreur(null);
      try {
        /* Une réponse passe par la boîte de l'agent avec le fil : c'est ce qui
           allume le chevron « répondu » et garde la conversation groupée. */
        let copie: boolean | undefined;
        if (reponse) {
          const r = await repondre(agent.id, {
            to: a, objet, texte: corps,
            inReplyTo: reponse.messageId,
            references: [...reponse.references, reponse.messageId].filter(Boolean) as string[],
            role: reponse.role, uid: reponse.uid,
          });
          copie = r.copieDansEnvoyes;
        } else {
          const r = await envoyerUnMessage({
            to: a, objet, corps, repondreA: agent.email, agentId: agent.id,
            brouillonId: brouillon?.id || undefined,
          });
          copie = r?.copieDansEnvoyes;
        }
        if (enregistrerType && libelleType.trim()) {
          await creerMessageType({ libelle: libelleType, objet, corps, agentId: agent.id });
        }
        setFait(copie === false
          ? "Message envoyé — mais impossible de le copier dans « Envoyés » : il est parti, il n'apparaîtra pas dans cette boîte."
          : "Message envoyé.");
        onEnvoye?.();
        setTimeout(onClose, 900);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    });

  const garder = () =>
    start(async () => {
      setErreur(null);
      try {
        const dest = a.split(",").map((x) => x.trim()).filter(Boolean).map((email) => ({ email }));
        if (brouillon?.id) await majBrouillon(brouillon.id, { objet, corps, destinataires: dest });
        else await creerBrouillon({ objet, corps, destinataires: dest, agentId: agent.id });
        setFait("Brouillon enregistré.");
        setTimeout(onClose, 700);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal mail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <b>Nouveau message</b>
          <button type="button" onClick={onClose}>✕</button>
        </div>

        <div className="modal-b">
          <div className="mred-entete">
            <ChampDestinataires valeur={a} onChange={setA} agentId={agent.id} />
            {modeles.length > 0 && (
              <label className="mred-l court">
                <span>Message type</span>
                <select defaultValue="" onChange={(e) => appliquer(e.target.value)}>
                  <option value="">— Partir de zéro —</option>
                  {modeles.map((m) => <option key={m.id} value={m.id}>{m.libelle}</option>)}
                </select>
              </label>
            )}
          </div>

          <ZoneRedaction
            objet={objet} corps={corps} setObjet={setObjet} setCorps={setCorps}
            valeursApercu={valeurs} nomApercu="un destinataire type"
          />

          {/* Le moment où on sait que le texte est bon, c'est maintenant. */}
          <label className="mred-garder">
            <input type="checkbox" checked={enregistrerType}
              onChange={() => setEnregistrerType(!enregistrerType)} />
            Enregistrer ce texte comme message type
          </label>
          {enregistrerType && (
            <input className="mred-nom" value={libelleType} onChange={(e) => setLibelleType(e.target.value)}
              placeholder="Nom du message type (ex. « Relance propriétaire — 1re relance »)" />
          )}

          {erreur && <div className="dif-avis" style={{ marginTop: 10 }}>{erreur}</div>}
          {fait && <div className="mred-ok">{fait}</div>}
        </div>

        <div className="modal-f">
          <button type="button" className="fadd" disabled={pending} onClick={garder}>
            Enregistrer comme brouillon
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="savebar-go" disabled={pending || !a.trim() || !objet.trim()}
            onClick={envoyer}>
            <span className="ch">›</span> Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
