"use client";

/* Écran Mails façon Gmail (retour #108).
 *
 * Trois colonnes : les boîtes à gauche, la liste au milieu, le message à
 * droite. Sélection multiple avec cases à cocher, barre d'actions qui apparaît
 * dès qu'une case est cochée, suppression qui envoie à la corbeille.
 *
 * Deux boutons d'écriture, comme demandé : « Nouveau message » pour un envoi
 * simple, « Salve » pour un envoi ciblé.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { FilMail } from "@/lib/bubble/server";
import type { Brouillon, Dossier, MessageType, Salve } from "@/lib/mails/serveur";
import { classerMails } from "@/lib/bo/mails-actions";
import { FenetreRedaction } from "@/components/mails/redaction";
import { FenetreSalve } from "@/components/mails/salve";
import { Bibliotheque } from "@/components/mails/messages-types";

type Vue = Dossier | "messages_types" | "salves";

const BOITES: { cle: Dossier; label: string; d: React.ReactNode }[] = [
  { cle: "reception", label: "Boîte de réception",
    d: <path d="M4 13h4l1.4 2.6h5.2L16 13h4M4 13 6.6 6.2A1.6 1.6 0 0 1 8.1 5.2h7.8a1.6 1.6 0 0 1 1.5 1L20 13v4.2a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 17.2z" /> },
  { cle: "envoyes", label: "E-mails envoyés",
    d: <path d="M21.6 3.2 2.9 10.4l4.7 1.7 11-7.3-8.6 8.4v4.8l2.3-3 4.4 3.2z" /> },
  { cle: "brouillons", label: "Brouillons",
    d: <path d="M4 20.2 4.7 16 16.2 4.6a2 2 0 0 1 2.8 2.8L7.6 18.9zM14.6 6.4l3 3" /> },
  { cle: "indesirables", label: "Indésirables",
    d: <path d="M12 3.4 20.4 18a1 1 0 0 1-.9 1.5H4.5a1 1 0 0 1-.9-1.5zM12 9.6v4M12 16.4h.01" /> },
  { cle: "corbeille", label: "Éléments supprimés",
    d: <path d="M5 7h14M10 7V4.8h4V7M6.6 7l.8 12.2a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.4 7M10.4 10.6v6M13.6 10.6v6" /> },
];

const jour = (d?: string) => {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const memeJour = x.toDateString() === new Date().toDateString();
  return memeJour
    ? x.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : x.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
};

const initiales = (nom: string) =>
  nom.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? "").join("") || "?";

export function EcranMails({
  mails, brouillons, messagesTypes, salves, agent,
}: {
  /** Les messages du miroir, déjà rangés dans leur boîte. */
  mails: (FilMail & { dossier: Exclude<Dossier, "brouillons">; lu: boolean })[];
  brouillons: Brouillon[];
  messagesTypes: MessageType[];
  salves: Salve[];
  agent: { id: string; nom: string; email?: string; telephone?: string };
}) {
  const [vue, setVue] = useState<Vue>("reception");
  const [q, setQ] = useState("");
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [redaction, setRedaction] = useState<null | { brouillon?: Brouillon; modele?: MessageType }>(null);
  const [salve, setSalve] = useState(false);
  const [pending, start] = useTransition();

  const compte = (d: Dossier) =>
    d === "brouillons" ? brouillons.length : mails.filter((m) => m.dossier === d).length;

  const liste = useMemo(() => {
    if (vue === "brouillons" || vue === "messages_types" || vue === "salves") return [];
    const qq = q.trim().toLowerCase();
    return mails
      .filter((m) => m.dossier === vue)
      .filter((m) => !qq || `${m.objet} ${m.qui} ${m.adresse} ${m.extrait}`.toLowerCase().includes(qq))
      .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  }, [mails, vue, q]);

  const courant = liste.find((m) => m.id === ouvert) ?? liste[0];
  const tousCoches = liste.length > 0 && liste.every((m) => choisis.has(m.id));

  const cocher = (id: string) =>
    setChoisis((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const deplacer = (dossier: "reception" | "indesirables" | "corbeille") =>
    start(async () => {
      await classerMails([...choisis], dossier, agent.id);
      setChoisis(new Set());
    });

  const changerVue = (v: Vue) => { setVue(v); setChoisis(new Set()); setOuvert(null); };

  return (
    <div className="gm">
      {/* ---------------- Colonne des boîtes ---------------- */}
      <aside className="gm-side">
        <button type="button" className="gm-new" onClick={() => setRedaction({})}>
          <svg viewBox="0 0 24 24"><path d="M4 20.2 4.7 16 16.2 4.6a2 2 0 0 1 2.8 2.8L7.6 18.9zM14.6 6.4l3 3" /></svg>
          Nouveau message
        </button>
        <button type="button" className="gm-salve" onClick={() => setSalve(true)}>
          <svg viewBox="0 0 24 24"><path d="M21.6 3.2 2.9 10.4l4.7 1.7 11-7.3-8.6 8.4v4.8l2.3-3 4.4 3.2z" /></svg>
          Envoyer une salve
        </button>

        <nav className="gm-boites">
          {BOITES.map((b) => (
            <button key={b.cle} type="button" className={vue === b.cle ? "on" : undefined}
              onClick={() => changerVue(b.cle)}>
              <svg viewBox="0 0 24 24">{b.d}</svg>
              {b.label}
              {compte(b.cle) > 0 && <span className="n">{compte(b.cle)}</span>}
            </button>
          ))}
        </nav>

        <div className="gm-sep">Bibliothèque</div>
        <nav className="gm-boites">
          <button type="button" className={vue === "messages_types" ? "on" : undefined}
            onClick={() => changerVue("messages_types")}>
            <svg viewBox="0 0 24 24"><path d="M6 3.5h7.5L18 8v12.5H6z" /><path d="M13.4 3.6V8H18M8.6 12h6.8M8.6 15h4" /></svg>
            Messages types
            {messagesTypes.length > 0 && <span className="n">{messagesTypes.length}</span>}
          </button>
          <button type="button" className={vue === "salves" ? "on" : undefined}
            onClick={() => changerVue("salves")}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.4" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M4.8 4.8a10 10 0 0 0 0 14.4M19.2 19.2a10 10 0 0 0 0-14.4" /></svg>
            Salves envoyées
            {salves.length > 0 && <span className="n">{salves.length}</span>}
          </button>
        </nav>
      </aside>

      {/* ---------------- Contenu ---------------- */}
      {vue === "messages_types" ? (
        <Bibliotheque
          modeles={messagesTypes}
          agentId={agent.id}
          onUtiliser={(m) => { setRedaction({ modele: m }); }}
        />
      ) : vue === "salves" ? (
        <JournalSalves salves={salves} />
      ) : vue === "brouillons" ? (
        <ListeBrouillons brouillons={brouillons} onOuvrir={(b) => setRedaction({ brouillon: b })} />
      ) : (
        <>
          <section className="gm-liste">
            <div className="gm-bar">
              <label className="gm-tous" title="Tout sélectionner">
                <input type="checkbox" checked={tousCoches}
                  onChange={() => setChoisis(tousCoches ? new Set() : new Set(liste.map((m) => m.id)))} />
              </label>
              {choisis.size > 0 ? (
                <>
                  <b className="gm-nsel">{choisis.size} sélectionné{choisis.size > 1 ? "s" : ""}</b>
                  <span style={{ flex: 1 }} />
                  {vue !== "corbeille" && (
                    <button type="button" className="gm-act" disabled={pending} onClick={() => deplacer("corbeille")}>
                      🗑 Supprimer
                    </button>
                  )}
                  {vue !== "indesirables" && (
                    <button type="button" className="gm-act" disabled={pending} onClick={() => deplacer("indesirables")}>
                      ⚠ Indésirable
                    </button>
                  )}
                  {(vue === "corbeille" || vue === "indesirables") && (
                    <button type="button" className="gm-act" disabled={pending} onClick={() => deplacer("reception")}>
                      ↩ Restaurer
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="gm-rech">
                    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
                    <input placeholder="Rechercher dans les messages…" value={q} onChange={(e) => setQ(e.target.value)} />
                  </div>
                  <span className="gm-cpt">{liste.length}</span>
                </>
              )}
            </div>

            <div className="gm-rows">
              {liste.map((m) => (
                <div key={m.id}
                  className={`gm-row${courant?.id === m.id ? " on" : ""}${m.lu ? "" : " neuf"}`}
                  onClick={() => setOuvert(m.id)}>
                  <label className="gm-ck" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={choisis.has(m.id)} onChange={() => cocher(m.id)} />
                  </label>
                  <span className="gm-av">{initiales(m.qui || m.adresse)}</span>
                  <div className="gm-mid">
                    <div className="gm-l1">
                      <span className="gm-qui">{m.qui || m.adresse || "—"}</span>
                      <span style={{ flex: 1 }} />
                      {m.pj > 0 && <span className="gm-pj" title={`${m.pj} pièce(s) jointe(s)`}>📎</span>}
                      <span className="gm-date">{jour(m.date)}</span>
                    </div>
                    <div className="gm-l2">
                      <b>{m.objet}</b>
                      <span> — {m.extrait}</span>
                    </div>
                    {m.immeubleLabel && <span className="gm-tag">{m.immeubleLabel}</span>}
                  </div>
                </div>
              ))}
              {liste.length === 0 && (
                <div className="fempty">
                  {vue === "reception"
                    /* Dire pourquoi c'est vide vaut mieux que de laisser croire
                       à une panne : les 600 messages du miroir sont des envois,
                       les reçus arriveront quand IMAP sera branché. */
                    ? "Aucun message reçu. La relève IMAP n'est pas encore branchée : les réponses de vos correspondants arriveront ici."
                    : "Aucun message dans cette boîte."}
                </div>
              )}
            </div>
          </section>

          <section className="gm-lecture">
            {courant ? (
              <>
                <div className="gm-lh">
                  <h2>{courant.objet}</h2>
                  <div className="gm-lmeta">
                    <span className="gm-av">{initiales(courant.qui || courant.adresse)}</span>
                    <div>
                      <b>{courant.qui || courant.adresse}</b>
                      <span>{courant.adresse}</span>
                    </div>
                    <span style={{ flex: 1 }} />
                    <span className="gm-date">{jour(courant.date)}</span>
                  </div>
                  <div className="gm-lliens">
                    {courant.contactId && (
                      <Link className="fadd" href={`/contact/${courant.contactId}`}>Fiche contact ↗</Link>
                    )}
                    {courant.immeubleId && (
                      <Link className="fadd" href={`/bien/${courant.immeubleId}`}>Immeuble ↗</Link>
                    )}
                    <span style={{ flex: 1 }} />
                    <button type="button" className="fadd"
                      onClick={() => setRedaction({
                        brouillon: {
                          id: "", agent_id: agent.id,
                          objet: courant.objet.startsWith("Re :") ? courant.objet : `Re : ${courant.objet}`,
                          corps: `\n\n— Le ${jour(courant.date)}, ${courant.qui} a écrit :\n${courant.corps}`,
                          destinataires: [{ contactId: courant.contactId, email: courant.adresse, nom: courant.qui }],
                          origine: "manuel", statut: "brouillon",
                          created_at: "", updated_at: "",
                        },
                      })}>
                      ↩ Répondre
                    </button>
                  </div>
                </div>
                <pre className="gm-corps">{courant.corps}</pre>
              </>
            ) : (
              <div className="fempty">Sélectionnez un message.</div>
            )}
          </section>
        </>
      )}

      {redaction && (
        <FenetreRedaction
          agent={agent}
          modeles={messagesTypes}
          brouillon={redaction.brouillon}
          modele={redaction.modele}
          onClose={() => setRedaction(null)}
        />
      )}
      {salve && (
        <FenetreSalve agent={agent} modeles={messagesTypes} onClose={() => setSalve(false)} />
      )}
    </div>
  );
}

function ListeBrouillons({ brouillons, onOuvrir }: {
  brouillons: Brouillon[]; onOuvrir: (b: Brouillon) => void;
}) {
  const enAttente = brouillons.filter((b) => b.statut === "a_valider");
  return (
    <section className="gm-plein">
      {enAttente.length > 0 && (
        <div className="gm-avis">
          <b>⚠ {enAttente.length} message{enAttente.length > 1 ? "s" : ""} préparé{enAttente.length > 1 ? "s" : ""} par une automatisation</b>
          <span>Rien ne part tant qu&apos;un commercial n&apos;a pas relu et cliqué sur Envoyer.</span>
        </div>
      )}
      {brouillons.map((b) => (
        <button key={b.id} type="button" className="gm-brouillon" onClick={() => onOuvrir(b)}>
          <span className={`gm-orig ${b.origine}`}>{b.origine === "automatisation" ? "Auto" : "Vous"}</span>
          <div>
            <b>{b.objet || "(sans objet)"}</b>
            <span>{b.destinataires.map((d) => d.nom || d.email).join(", ") || "Sans destinataire"}</span>
          </div>
          <span style={{ flex: 1 }} />
          <span className="gm-date">{jour(b.updated_at)}</span>
        </button>
      ))}
      {brouillons.length === 0 && <div className="fempty">Aucun brouillon.</div>}
    </section>
  );
}

function JournalSalves({ salves }: { salves: Salve[] }) {
  return (
    <section className="gm-plein">
      {salves.map((s) => (
        <div key={s.id} className="gm-salve-l">
          <span className={`gm-st ${s.statut}`}>
            {s.statut === "envoyee" ? "Envoyée" : s.statut === "a_valider" ? "À valider"
              : s.statut === "abandonnee" ? "Abandonnée" : "Préparation"}
          </span>
          <div>
            <b>{s.libelle || s.objet}</b>
            <span>{s.cible} · {s.envoyes} envoyé{s.envoyes > 1 ? "s" : ""}{s.echecs > 0 ? ` · ${s.echecs} échec${s.echecs > 1 ? "s" : ""}` : ""}</span>
          </div>
          <span style={{ flex: 1 }} />
          <span className="gm-date">{jour(s.envoye_at ?? s.created_at)}</span>
        </div>
      ))}
      {salves.length === 0 && <div className="fempty">Aucune salve pour le moment.</div>}
    </section>
  );
}
