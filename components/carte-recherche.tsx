"use client";

/* La carte d'une recherche — partagée par l'écran Recherches et l'onglet
 * Recherches de la fiche contact (retours #116, #117, #119). Une seule
 * définition : les deux écrans ne peuvent pas diverger. */

import { useState } from "react";
import Link from "next/link";
import type { RechercheCard } from "@/lib/bubble/server";

/* Les quatre destinations du BO, dans son ordre. Un picto éteint dit « pas
   recherché » — l'absence de picto ne dirait rien du tout. */
export const DESTINATIONS: { cle: string; titre: string; d: React.ReactNode }[] = [
  { cle: "Logement", titre: "Logement", d: <path d="M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /> },
  { cle: "Parking", titre: "Parking", d: <path d="M5 11.5 6.4 7.4A2 2 0 0 1 8.3 6h7.4a2 2 0 0 1 1.9 1.4L19 11.5V17h-2.5v-1.6h-9V17H5zM7.4 14a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm9.2 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z" /> },
  { cle: "Commerce", titre: "Commerce", d: <path d="M4 7h16l-1 3.2a2.4 2.4 0 0 1-4.6.3 2.4 2.4 0 0 1-4.8 0 2.4 2.4 0 0 1-4.6-.3zM5.5 12.6V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6.4" /> },
  { cle: "Bureau", titre: "Bureau", d: <path d="M4 20V8.6a1 1 0 0 1 .6-.9l6-2.6a1 1 0 0 1 1.4.9V20M12 20V11h7a1 1 0 0 1 1 1v8M7 10.5h1.6M7 13.6h1.6M7 16.7h1.6M15 14h2M15 17h2" /> },
];

/** Une puce de critère : grisée avec son intitulé quand rien n'est renseigné. */
export function Puce({ label, valeur, euro }: { label: string; valeur?: string; euro?: boolean }) {
  return (
    <span className={`rc-puce${valeur ? " on" : ""}`}>
      {euro && <b>€</b>}
      {valeur ?? label}
    </span>
  );
}

export function CarteRecherche({
  r, choisi, onCocher, onDetail, onAProposer, onModifier,
  /** Sur la fiche contact, le nom de l'acquéreur est déjà dans l'en-tête. */
  sansContact = false,
  /** Mention posée à droite des destinations (« Mandat de recherche actif »). */
  mention,
}: {
  r: RechercheCard;
  choisi?: boolean;
  onCocher?: (id: string) => void;
  onDetail: (r: RechercheCard) => void;
  /** Retour #331 : la pastille ouvre les biens qu'on pourrait lui envoyer. */
  onAProposer?: (r: RechercheCard) => void;
  /** Retour #330 : cliquer la recherche ouvre la modale qui la modifie. */
  onModifier?: (r: RechercheCard) => void;
  sansContact?: boolean;
  mention?: string;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="rc">
      {onCocher && (
        <label className="rc-cocher">
          <input type="checkbox" checked={!!choisi} onChange={() => onCocher(r.id)} />
        </label>
      )}

      {/* Colonne de gauche : le compteur d'immeubles à proposer, les jumelles,
          puis le commercial. */}
      <div className="rc-gauche">
        <button
          type="button"
          className={`rc-cpt${r.aProposer > 0 ? " chaud" : ""}`}
          title={r.aProposer > 0
            ? `${r.aProposer} immeuble(s) en mandat correspondent et ne lui ont jamais été envoyés`
            : "Rien de nouveau à lui proposer"}
          onClick={() => (onAProposer ?? onDetail)(r)}
        >
          {r.aProposer}
        </button>
        <span className="rc-jum">
          <svg viewBox="0 0 24 24"><circle cx="7" cy="14" r="3.6" /><circle cx="17" cy="14" r="3.6" /><path d="M7 10.4V6h3.4M17 10.4V6h-3.4M10.6 14h2.8" /></svg>
        </span>
        <span className="lav" style={r.agentCouleur ? { background: r.agentCouleur } : undefined}>{r.agent}</span>
      </div>

      <div className="rc-corps">
        <div className="rc-ligne1">
          {/* Retour #330 — « il faut qu'en cliquant sur une recherche on
              puisse la modifier avec le popup qui s'ouvre. » La carte n'avait
              aucune prise : on la lisait, on ne la corrigeait pas. C'est son
              titre — le secteur — qui ouvre la modale ; le reste de la carte
              garde ses gestes propres (la pastille, le contact, les détails). */}
          {onModifier ? (
            <button type="button" className="rc-lieux modif" onClick={() => onModifier(r)}
              title="Modifier cette recherche">
              {r.lieux.slice(0, 6).join(", ")}
              {r.lieux.length > 6 && <i> +{r.lieux.length - 6}</i>}
              <svg viewBox="0 0 24 24" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
            </button>
          ) : (
            <span className="rc-lieux">
              {r.lieux.slice(0, 6).join(", ")}
              {r.lieux.length > 6 && <i> +{r.lieux.length - 6}</i>}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {sansContact ? null : r.contact ? (
            <span className="rc-ct-zone">
              <button type="button" className="rc-ct" onClick={() => setOuvert(!ouvert)}>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
                {r.contact.nom}
                {r.contact.note && <b className={`note n${r.contact.note}`}>{r.contact.note}</b>}
              </button>
              {ouvert && (
                <>
                  <span className="rc-voile" onClick={() => setOuvert(false)} />
                  <span className="rc-pop">
                    <span className="rc-pop-h">
                      <span className="lav" style={r.agentCouleur ? { background: r.agentCouleur } : undefined}>{r.agent}</span>
                      <span>
                        <b>
                          {r.contact.note && <i className={`note n${r.contact.note}`}>{r.contact.note}</i>}
                          {r.contact.nom}
                        </b>
                        <em>{r.contact.qualite}</em>
                        {r.contact.tel && <span>{r.contact.tel}</span>}
                        {r.contact.email && <span>{r.contact.email}</span>}
                        <span className="rc-pop-cpt">
                          {r.contact.immeubles} immeuble{r.contact.immeubles > 1 ? "s" : ""} ·{" "}
                          {r.contact.recherches} recherche{r.contact.recherches > 1 ? "s" : ""}
                        </span>
                      </span>
                    </span>
                    <span className="rc-pop-f">
                      {r.contact.tel && <a href={`tel:${r.contact.tel.replace(/[^\d+]/g, "")}`}>☎ Appeler</a>}
                      {r.contact.email && <a href={`mailto:${r.contact.email}`}>✉ E-mail</a>}
                      {/* Deuxième clic : on ouvre la fiche pour la modifier. */}
                      <Link href={`/contact/${r.contact.id}`}>Fiche ↗</Link>
                    </span>
                  </span>
                </>
              )}
            </span>
          ) : (
            <span className="rc-orphelin">
              <em>{[r.orphelin?.email, r.orphelin?.tel].filter(Boolean).join(" · ") || "Sans coordonnées"}</em>
              <Link className="rc-creer" href="/contacts">⚠ Créer un contact</Link>
            </span>
          )}
        </div>

        <div className="rc-ligne2">
          <span className="rc-dest">
            {DESTINATIONS.map((d) => (
              <i key={d.cle} className={r.destinations.includes(d.cle) ? "on" : undefined} title={d.titre}>
                <svg viewBox="0 0 24 24">{d.d}</svg>
              </i>
            ))}
          </span>
          {r.commentaire && (
            <button type="button" className="rc-details" onClick={() => onDetail(r)}>
              <svg viewBox="0 0 24 24"><path d="M12 3C6.8 3 2.6 6.3 2.6 10.4c0 2.3 1.3 4.4 3.4 5.7-.2 1.3-.9 2.5-1.9 3.4 1.9 0 3.7-.7 5-1.9.9.2 1.8.3 2.9.3 5.2 0 9.4-3.3 9.4-7.5S17.2 3 12 3z" /></svg>
              Voir les détails
            </button>
          )}
          {mention && <span className="rc-mention">● {mention}</span>}
        </div>

        <div className="rc-ligne3">
          <span className="rc-cible">
            <svg viewBox="0 0 24 24"><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></svg>
            {r.cible ?? "Type non précisé"}
          </span>
          <span style={{ flex: 1 }} />
          <Puce label="Surface" valeur={r.surface} />
          <Puce label="Occupation" valeur={r.occupation} />
          <Puce label="Budget" valeur={r.prix} euro />
          <Puce label="Rendement" valeur={r.renta} />
        </div>
      </div>
    </div>
  );
}

/** Le détail d'une recherche, en fenêtre. */
export function ModaleRecherche({
  detail, onClose, onAProposer, onModifier,
}: {
  detail: RechercheCard;
  onClose: () => void;
  onAProposer?: (r: RechercheCard) => void;
  onModifier?: (r: RechercheCard) => void;
}) {
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal lieu-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <b>{detail.contact?.nom ?? "Recherche"} — {detail.cible ?? "Recherche"}</b>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        <div className="modal-b">
          <div className="rc-det">
            <b>Où</b><span>{detail.lieux.join(", ")}</span>
            <b>Destinations</b><span>{detail.destinations.join(", ") || "Toutes"}</span>
            <b>Surface</b><span>{detail.surface ?? "Non précisée"}</span>
            <b>Occupation</b><span>{detail.occupation ?? "Non précisée"}</span>
            <b>Budget</b><span>{detail.prix ?? "Non précisé"}</span>
            <b>Rendement</b><span>{detail.renta ?? "Non précisé"}</span>
            <b>À proposer</b>
            <span>
              {detail.aProposer > 0
                ? `${detail.aProposer} immeuble(s) en mandat correspondent et ne lui ont jamais été envoyés.`
                : "Rien de nouveau : tout ce qui correspond lui a déjà été envoyé."}
            </span>
          </div>
          {detail.commentaire && <p className="rc-com">{detail.commentaire}</p>}
        </div>
        <div className="modal-f">
          <span style={{ flex: 1 }} />
          {onModifier && (
            <button type="button" className="fadd" onClick={() => onModifier(detail)}>
              Modifier la recherche
            </button>
          )}
          {detail.aProposer > 0 && (
            onAProposer ? (
              <button type="button" className="savebar-go" onClick={() => onAProposer(detail)}>
                <span className="ch">›</span> Voir les immeubles à proposer
              </button>
            ) : (
              <Link className="savebar-go" href={`/acheteurs?recherche=${detail.id}`}>
                <span className="ch">›</span> Voir les immeubles à proposer
              </Link>
            )
          )}
        </div>
      </div>
    </div>
  );
}
