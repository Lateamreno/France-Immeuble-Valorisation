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

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Brouillon, Dossier, MessageType, Salve } from "@/lib/mails/serveur";
import type { MessageComplet, RoleDossier } from "@/lib/mails/client";
import { BoiteVivante, oublierBoite } from "@/components/mails/boite-vivante";
import { FenetreRedaction, type Reponse } from "@/components/mails/redaction";
import { FenetreSalve } from "@/components/mails/salve";
import { Bibliotheque } from "@/components/mails/messages-types";

/* La réception se lit en deux vues : le courrier humain, et ce que le site
   envoie (formulaires, nouvelles recherches, questions). Rien n'est déplacé
   sur le serveur — c'est un tri d'affichage (retour #130). */
type Vue = Dossier | "site" | "messages_types" | "salves";

const BOITES: { cle: Vue; label: string; d: React.ReactNode }[] = [
  { cle: "reception", label: "Boîte de réception",
    d: <path d="M4 13h4l1.4 2.6h5.2L16 13h4M4 13 6.6 6.2A1.6 1.6 0 0 1 8.1 5.2h7.8a1.6 1.6 0 0 1 1.5 1L20 13v4.2a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 17.2z" /> },
  { cle: "site", label: "France Immeuble",
    d: <><path d="M4 20V9.5L12 4l8 5.5V20z" /><path d="M9.5 20v-6h5v6" /></> },
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

export function EcranMails({
  brouillons, messagesTypes, salves, agent, boite, agents,
}: {
  brouillons: Brouillon[];
  messagesTypes: MessageType[];
  salves: Salve[];
  agent: { id: string; nom: string; email?: string; telephone?: string; slug?: string };
  /** La boîte de l'agent, quand il en a branché une. */
  boite?: { adresse: string; nomAffiche?: string };
  /** Les commerciaux, pour que l'admin puisse passer d'une boîte à l'autre
   *  (retour #128) — comme la barre du dashboard. */
  agents?: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [vue, setVue] = useState<Vue>("reception");
  const [redaction, setRedaction] = useState<
    null | { brouillon?: Brouillon; modele?: MessageType; reponse?: Reponse }
  >(null);
  const [salve, setSalve] = useState(false);
  /** Compteurs des dossiers, remontés par la boîte au fil des lectures. */
  const [compteurs, setCompteurs] = useState<Partial<Record<RoleDossier | "site", number>>>({});
  /** Change à chaque envoi : c'est ce qui force la boîte à se relire. */
  const [tour, setTour] = useState(0);

  const compte = (d: Vue) =>
    d === "brouillons" ? brouillons.length
      : d === "site" ? compteurs.site ?? 0
        : compteurs[d as RoleDossier] ?? 0;

  const noterCompteurs = useCallback((cle: RoleDossier | "site", total: number, nonLus: number) => {
    setCompteurs((c) => ({ ...c, [cle]: cle === "reception" || cle === "site" ? nonLus || total : total }));
  }, []);
  const noterReception = useCallback(
    (_r: RoleDossier, t: number, n: number) => noterCompteurs("reception", t, n), [noterCompteurs]);
  const noterSite = useCallback(
    (_r: RoleDossier, t: number, n: number) => noterCompteurs("site", t, n), [noterCompteurs]);

  const repondreA = (m: MessageComplet, reponse: Reponse) =>
    setRedaction({
      reponse,
      brouillon: {
        id: "", agent_id: agent.id,
        objet: /^re\s*:/i.test(m.objet) ? m.objet : `Re : ${m.objet}`,
        corps: `\n\n— Le ${jour(m.date)}, ${m.deNom || m.de} a écrit :\n${m.corps}`,
        destinataires: [{ email: m.de, nom: m.deNom || m.de }],
        origine: "manuel", statut: "brouillon",
        created_at: "", updated_at: "",
      },
    });

  const changerVue = (v: Vue) => setVue(v);

  return (
    <div className="gm-page">
      {/* Qui on lit, et de qui. Le sélecteur est en haut à droite, comme la
          barre du dashboard (retour #128). */}
      <div className="gm-top">
        <span className="gm-top-adr">
          {boite ? boite.adresse : "Aucune boîte branchée"}
        </span>
        <span style={{ flex: 1 }} />
        {agents && agents.length > 1 && (
          <select className="gm-agent" value={agent.slug ?? ""} aria-label="Boîte de"
            onChange={(e) => router.push(`/mails?agent=${e.target.value}`)}>
            {agents.map((a) => (
              <option key={a.slug} value={a.slug}>Boîte de {a.name}</option>
            ))}
          </select>
        )}
      </div>

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

        {/* C'est ici qu'on branche sa boîte. Sans ce lien, l'écran de réglages
            existait mais n'était accessible qu'en tapant l'adresse à la main. */}
        <div className="gm-sep">Réglages</div>
        <nav className="gm-boites">
          <Link className="gm-lien" href="/mails/reglages">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
            </svg>
            Ma boîte e-mail
          </Link>
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
      ) : boite ? (
        /* La boîte de l'agent, lue en direct : plus rien ne transite par une
           copie en base, donc plus de décalage avec le téléphone. */
        <BoiteVivante
          key={`${vue}-${tour}`}
          agentId={agent.id}
          role={vue === "site" ? "reception" : (vue as RoleDossier)}
          adresse={boite.adresse}
          tri={vue === "site" ? "site" : vue === "reception" ? "humain" : undefined}
          onNouveau={() => setRedaction({})}
          onRepondre={repondreA}
          onRafraichi={vue === "site" ? noterSite : noterReception}
        />
      ) : (
        <section className="gm-plein">
          <div className="gm-avis">
            <b>Aucune boîte e-mail branchée.</b>
            <span>
              Les messages affichés ici sont ceux de VOTRE boîte, lue en direct sur son
              serveur. Tant qu&apos;elle n&apos;est pas renseignée, il n&apos;y a rien à afficher.
            </span>
            <Link className="fadd" href="/mails/reglages">Brancher ma boîte</Link>
          </div>
        </section>
      )}

      {redaction && (
        <FenetreRedaction
          agent={agent}
          modeles={messagesTypes}
          brouillon={redaction.brouillon}
          modele={redaction.modele}
          reponse={redaction.reponse}
          onClose={() => setRedaction(null)}
          /* Un message parti change la boîte : ce qu'on gardait est périmé. */
          onEnvoye={() => { oublierBoite(agent.id); setTour((t) => t + 1); }}
        />
      )}
      </div>

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
