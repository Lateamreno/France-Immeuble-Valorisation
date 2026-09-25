"use client";

/**
 * La proposition — un seul objet, partout (fiche contact, fiche immeuble).
 *
 * Retours #365, #366, #373 et #374, et la demande du 23/09 sur le bouton
 * scindé. La carte est celle du BO : l'avion et l'agent qui a envoyé, la date
 * d'envoi et la dernière relance, la ou les recherches matchées (un clic ouvre
 * la recherche), le client et sa classe (un clic ouvre sa vignette), la note
 * de suivi qui s'écrit directement, le dossier envoyé (V1, V2… et une pastille
 * rouge quand une version plus récente existe), la cloche verte ou rouge des
 * relances, Refuser en barre de texte, et Relancer en bouton scindé :
 * e-mail au clic, e-mail + SMS ou SMS seul sous la flèche.
 *
 * Doctrine §7.1 : le clic de l'agent est l'envoi. Rien n'est marqué relancé
 * si le message n'est pas parti. Entre deux relances, vingt-quatre heures au
 * moins (#374) — plus de blocage à sept jours sur la fiche immeuble.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { PropositionLigne } from "@/lib/bubble/server";
import { ModaleRechercheEdition, type DepartRecherche } from "@/components/recherche-modale";
import { ModaleApresRefus } from "@/components/proposition-refus";
import { VignetteContact, type VignetteData } from "@/components/vignette-contact";
import { Modale } from "@/components/modale";
import { Pastille, PastilleStatut } from "@/components/pastille";
import { Avatar } from "@/components/avatar";
import { PuceImmeuble } from "@/components/puce-immeuble";
import { noterProposition, setPropositionStatut } from "@/lib/bo/actions";
import {
  couperRelances, departRecherche, departRechercheDeProposition, envoyerRelances, marquerRelances,
  relanceEnvoiPossible,
} from "@/lib/bo/relances-actions";
import { apercuRelanceSms, chargerPropositionsDuBien, relancerParSms } from "@/lib/bo/propositions-actions";
import { joursDepuis, messageRelance, objetRelance, type ClientRelance, type ImmeubleRelance } from "@/lib/bo/relances";

export const STATUTS_CLOS_PROP = new Set(["Refusée (sans offre)", "Offre refusée", "Offre obtenue", "Offre acceptée", "Vendu"]);

/** Vingt-quatre heures entre deux relances (#374). */
export const JOURS_ENTRE_RELANCES = 1;

export type ModeRelance = "email" | "email_sms" | "sms";

const IC_AVION = <path d="M3 11.5 21 3l-8.5 18-2.5-7.5L3 11.5z" />;

/* ------------------------------------------------------- Bouton scindé */

/**
 * Un bouton en deux parties : l'action habituelle à gauche, la flèche à
 * droite ouvre les variantes (le dessin envoyé par MAV le 23/09). Avec un
 * `menu`, la flèche déroule ; sans, elle appelle `onFleche`.
 */
export function BoutonScinde({ children, onPrincipal, onFleche, menu, pending, rouge, titre, desactive }: {
  children: React.ReactNode;
  onPrincipal: () => void;
  onFleche?: () => void;
  menu?: { label: string; aide?: string; onClick: () => void }[];
  pending?: boolean; rouge?: boolean; titre?: string; desactive?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => { if (!boite.current?.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);
  return (
    <span className={`bsc${rouge ? " rouge" : ""}`} ref={boite}>
      <button type="button" className="bsc-m" disabled={pending || desactive} title={titre} onClick={onPrincipal}>
        {pending ? "…" : children}
      </button>
      <button type="button" className="bsc-c" disabled={pending} title="Autres façons de relancer"
        aria-label="Autres options" aria-expanded={ouvert}
        onClick={() => (menu ? setOuvert((o) => !o) : onFleche?.())}>
        <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {menu && ouvert && (
        <span className="bsc-menu">
          {menu.map((m) => (
            <button key={m.label} type="button" onClick={() => { setOuvert(false); m.onClick(); }}>
              {m.label}{m.aide && <i>{m.aide}</i>}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------- Pagination */

export const TAILLES_PAGE = [10, 25, 50, 100];

/** La barre de pages du BO : résultats, pages, éléments par page. Collée en bas quand `collee`. */
export function Pagination({ total, page, taille, onPage, onTaille, collee, quoi = "résultat" }: {
  total: number; page: number; taille: number;
  onPage: (p: number) => void; onTaille: (t: number) => void;
  collee?: boolean; quoi?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / taille));
  const cur = Math.min(page, pages);
  return (
    <div className={`lst-pager${collee ? " collee" : ""}`}>
      <span className="lst-res">{total} {quoi}{total > 1 ? "s" : ""}</span>
      <span className="sp" style={{ flex: 1 }} />
      <button className="pgb" type="button" disabled={cur <= 1} onClick={() => onPage(1)}>«</button>
      <button className="pgb" type="button" disabled={cur <= 1} onClick={() => onPage(cur - 1)}>‹</button>
      <span className="pgn">Page {cur} / {pages}</span>
      <button className="pgb" type="button" disabled={cur >= pages} onClick={() => onPage(cur + 1)}>›</button>
      <button className="pgb" type="button" disabled={cur >= pages} onClick={() => onPage(pages)}>»</button>
      <span className="sp" style={{ flex: 1 }} />
      <select className="pgs" value={taille} onChange={(e) => onTaille(Number(e.target.value))}>
        {TAILLES_PAGE.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <span className="pgl">éléments par page</span>
    </div>
  );
}

/* ---------------------------------------------------------- Note de suivi */

/** La note de suivi, écrite directement sur la carte : on tape, on sort du champ, c'est enregistré. */
export function NoteProposition({ propositionId, contactId, valeur }: {
  propositionId: string; contactId: string; valeur: string;
}) {
  const [texte, setTexte] = useState(valeur);
  const [pending, start] = useTransition();
  return (
    <textarea
      className={`cfc-saisie${pending ? " occupe" : ""}`}
      rows={texte ? 2 : 1}
      value={texte}
      placeholder="Écrivez une note de suivi…"
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => { if (texte !== valeur) start(() => noterProposition(propositionId, contactId, texte)); }}
    />
  );
}

/* ------------------------------------------------------------- La carte */

export function CarteProposition({
  p, contexte, vignette, note, jours, montrerImmeuble, onRelancer, onRelancerModale, onRafraichir,
}: {
  p: PropositionLigne;
  /** D'où l'on regarde : la fiche du contact, ou celle de l'immeuble. */
  contexte: { contactId?: string; immeubleId?: string };
  /** Le contact, quand la ligne ne le porte pas (fiche contact). */
  vignette?: VignetteData; note?: string;
  jours?: number;
  /** Sur la fiche contact, l'immeuble se lit ; sur la fiche immeuble, non. */
  montrerImmeuble?: boolean;
  onRelancer: (mode: ModeRelance) => void;
  onRelancerModale: () => void;
  onRafraichir: () => void;
}) {
  const [pending, start] = useTransition();
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState("");
  const [apres, setApres] = useState<string | null>(null);
  const [recherche, setRecherche] = useState<DepartRecherche | null>(null);
  const [creerPour, setCreerPour] = useState<{ id: string; nom: string } | null>(null);
  const immeubleId = contexte.immeubleId ?? p.immeuble?.id ?? "";
  const contactId = contexte.contactId ?? p.contact?.id ?? "";
  const qui: VignetteData | undefined = p.contact ?? vignette;
  const classe = p.contact?.note ?? note;
  const ouverte = !p.refusee && !STATUTS_CLOS_PROP.has(p.statut ?? "");
  const tropTot = jours !== undefined && jours < JOURS_ENTRE_RELANCES;
  const aRelancer = ouverte && !p.stop && !tropTot;

  const ouvrirRecherche = (rid: string) =>
    start(async () => {
      const r = await departRecherche(rid);
      if (r?.recherche) setRecherche(r.recherche);
    });

  return (
    <div className={`cfc${ouverte ? "" : " pale"}`}>
      <div className="cfc-g">
        <span className="cfc-pic"><svg viewBox="0 0 24 24">{IC_AVION}</svg></span>
        {p.agent && (
          <Avatar initiales={p.agent.initiales} couleur={p.agent.couleur} titre="Agent qui a envoyé la proposition" />
        )}
      </div>
      <div className="cfc-c">
        <div className="cfc-l1">
          <span className="cfc-t">{p.quand}</span>
          {/* Retour #400 : une proposition refusée le dit EN DESSOUS, dans un
              cadre rouge qui porte le motif — comme le BO. */}
          {p.statut && !p.refusee && <PastilleStatut statut={p.statut} />}
          <span style={{ flex: 1 }} />
          {/* #366 — les recherches matchées : un clic ouvre la recherche. */}
          {p.recherches.map((r) => (
            <button key={r.id} type="button" className="cfc-rch" disabled={pending}
              title="Ouvrir cette recherche pour la modifier" onClick={() => ouvrirRecherche(r.id)}>
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
              {r.libelle}
            </button>
          ))}
          {/* #366 — le client, avec sa vignette et sa classe. */}
          {qui && (
            <span className="cfc-qui">
              <VignetteContact v={qui} immeuble={p.immeuble?.libelle}
                badge={classe ? <b className={`note n${classe}`}>{classe}</b> : undefined} />
            </span>
          )}
        </div>
        <div className="cfc-l2">
          {/* MAV, 25/09 : « le refusé juste en dessous de la relance ou de la
              date de proposition, avec la date dessus ». Une personne qui a
              refusé n'est plus relancée (statut clos). */}
          {p.refusee && (
            <span className="cfc-refuse">
              <b>{p.statut || "Refusée"}</b>{p.refusLe && <> le {p.refusLe}</>}{p.motif && <> — {p.motif}</>}
            </span>
          )}
          {p.motif && !p.refusee && <span className="cfc-motif">✕ {p.motif}</span>}
          {p.relanceLe
            ? <span className="cfc-num">Relancé le {p.relanceLe}</span>
            : ouverte && <span className="cfc-num off">Jamais relancé</span>}
          {aRelancer && jours !== undefined && jours >= 7 && (
            <span className="cfc-past">À relancer · {jours} j</span>
          )}
          {p.stop && ouverte && <span className="cfc-num rouge">Relances coupées</span>}
        </div>
        <NoteProposition propositionId={p.id} contactId={contactId} valeur={p.commentaire ?? ""} />
        <div className="cfc-l3">
          {montrerImmeuble && p.immeuble && (
            <PuceImmeuble id={p.immeuble.id} libelle={p.immeuble.libelle} petit />
          )}
          {p.dossier && immeubleId && (
            <Link className="cfc-doc" href={`/bien/${immeubleId}?ecran=dossiers`} title="Voir les dossiers de l'immeuble">
              Dossier <b>{p.dossier.version}</b>
            </Link>
          )}
          {p.dossier?.pdf && (
            <a className="cfc-doc" href={p.dossier.pdf} target="_blank" rel="noreferrer">📎 PDF</a>
          )}
          {/* #373 — « une vignette rouge pour dire que le dossier précédemment
              envoyé a changé quand on a refait une version ». */}
          {p.dossier?.perime && ouverte && (
            <span className="cfc-perime" title="Une version plus récente du dossier existe : la relance l'enverra">
              Dossier changé depuis
            </span>
          )}
          <span style={{ flex: 1 }} />
          {ouverte ? (
            <span className="cfc-btns">
              {/* #373 — la cloche : verte quand la personne reçoit les relances,
                  rouge quand elle a demandé qu'on arrête. */}
              <button type="button" className={`cfc-cloche${p.stop ? " off" : ""}`} disabled={pending}
                title={p.stop ? "Relances coupées à sa demande — cliquer pour les rétablir" : "Reçoit les relances — cliquer pour les couper"}
                onClick={() => start(async () => { await couperRelances(p.id, !p.stop, immeubleId || undefined); onRafraichir(); })}>
                <svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 21h4" />{p.stop && <path d="M4 4l16 16" />}</svg>
              </button>
              <button className="fadd" type="button" disabled={pending} style={{ color: "var(--red)", borderColor: "#e6b3b3" }}
                onClick={() => setRefus((v) => !v)}>Refuser</button>
              <BoutonScinde pending={pending} desactive={!aRelancer && !p.stop}
                onPrincipal={() => onRelancer("email")}
                titre={p.stop ? "Relances coupées pour cette personne"
                  : tropTot ? "Relancé il y a moins de 24 h"
                  : jours === undefined ? "Envoyer la relance habituelle par e-mail"
                  : `Sans nouvelle depuis ${jours} jour${jours > 1 ? "s" : ""} — envoyer la relance habituelle par e-mail`}
                menu={[
                  { label: "Modifier le message…", aide: "relire avant d'envoyer", onClick: onRelancerModale },
                  { label: "Relancer par e-mail + SMS", aide: "les deux en même temps", onClick: () => onRelancer("email_sms") },
                  { label: "Relancer par SMS seul", aide: "MailingVox, horaires légaux", onClick: () => onRelancer("sms") },
                ]}>
                Relancer
              </BoutonScinde>
            </span>
          ) : (
            <button className="fadd" type="button" disabled={pending}
              onClick={() => start(async () => {
                await setPropositionStatut(immeubleId, p.id, "reactiver", undefined, undefined, contactId || undefined);
                onRafraichir();
              })}>
              ↻ Réactiver
            </button>
          )}
        </div>
        {refus && ouverte && (
          <div className="cfc-refus">
            <input className="min" value={motif} autoFocus placeholder="Pourquoi il refuse — ex. : pas de résidentiel, trop cher, secteur"
              onChange={(e) => setMotif(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setRefus(false); }} />
            <button type="button" className="cfc-refus-x" onClick={() => setRefus(false)}>Annuler</button>
            <button type="button" className="cfc-refus-go" disabled={pending || !motif.trim()}
              onClick={() => start(async () => {
                await setPropositionStatut(immeubleId, p.id, "refuser", motif.trim(), undefined, contactId || undefined);
                setRefus(false);
                setApres(motif.trim());
                onRafraichir();
              })}>
              <span className="ch">›</span> Enregistrer le refus
            </button>
          </div>
        )}
        {apres !== null && (
          <ModaleApresRefus
            motif={apres || undefined}
            pending={pending}
            onNon={() => setApres(null)}
            onOui={() => start(async () => {
              const r = await departRechercheDeProposition(p.id);
              setApres(null);
              if (r?.recherche) setRecherche(r.recherche);
              else if (r?.contact) setCreerPour({ id: r.contact.id, nom: r.contact.nom });
            })}
          />
        )}
        {(recherche || creerPour) && (
          <ModaleRechercheEdition
            depart={recherche ?? undefined}
            contactImpose={creerPour ?? undefined}
            onFermer={() => { setRecherche(null); setCreerPour(null); }}
            onEnregistre={() => { setRecherche(null); setCreerPour(null); onRafraichir(); }}
          />
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------- La fenêtre derrière la flèche */

/**
 * Le texte de la relance, modifiable, les dossiers qu'elle cite (retirables),
 * et l'envoi — ou « ouvrir dans le client mail » quand aucune boîte n'est
 * branchée. Avec, en option, le SMS qui part en plus.
 */
export function ModaleRelance({ lignes, ids, client, agent, email, tel, chemins, onFermer, onFait }: {
  lignes: { p: PropositionLigne; libelle: string; jours?: number }[];
  ids: string[];
  client: (ids: string[]) => ClientRelance;
  agent?: { id?: string; nom?: string; tel?: string };
  email: string;
  tel?: string;
  chemins: string[];
  onFermer: () => void;
  onFait: (message: string) => void;
}) {
  const [pending, start] = useTransition();
  const [retenus, setRetenus] = useState<string[]>(ids);
  const [texte, setTexte] = useState<string | null>(null);
  const [possible, setPossible] = useState<boolean | null>(null);
  const [sms, setSms] = useState(false);
  const [apercuSms, setApercuSms] = useState<{ texte: string; configure: boolean } | null>(null);
  const c = client(retenus);
  const corps = texte ?? messageRelance(c, agent);
  const objet = objetRelance(c);
  const agentId = agent?.id;
  const agentNom = agent?.nom;
  const premierLibelle = c.immeubles[0]?.libelle ?? "";
  useEffect(() => {
    let vivant = true;
    relanceEnvoiPossible(agentId)
      .then((p) => { if (vivant) setPossible(p); })
      .catch(() => { if (vivant) setPossible(false); });
    apercuRelanceSms(premierLibelle, agentNom)
      .then((a) => { if (vivant) setApercuSms(a); })
      .catch(() => undefined);
    return () => { vivant = false; };
  }, [agentId, agentNom, premierLibelle]);

  const basculer = (id: string) =>
    setRetenus((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Modale
      titre={`Relancer ${c.nom}`}
      onFermer={onFermer}
      largeur={640}
      pied={
        <>
          <button className="fadd" type="button" onClick={onFermer}>Fermer</button>
          <span className="sp" style={{ flex: 1 }} />
          <a className="fadd" href={`mailto:${email}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`}
            onClick={() => start(async () => { await marquerRelances(retenus, chemins); })}>
            Ouvrir dans le client mail
          </a>
          <button className="kgo" type="button" disabled={pending || !email || retenus.length === 0 || possible === false}
            onClick={() => start(async () => {
              try {
                const r = await envoyerRelances(
                  [{ contactId: c.contactId, email, objet, corps, propositionIds: retenus }],
                  agent?.id, undefined, chemins,
                );
                let msg = r.envoyes ? `Relance envoyée à ${email}.` : `Échec : ${r.journal[0] ?? "l'envoi n'est pas parti."}`;
                if (sms && r.envoyes) {
                  const s = await relancerParSms([{ contactId: c.contactId, tel, libelle: premierLibelle, propositionIds: retenus }], agentNom, chemins);
                  msg += s.envoyes ? " SMS envoyé." : ` SMS non envoyé : ${s.journal[0] ?? ""}`;
                }
                onFait(msg);
              } catch (e) {
                onFait(`Échec : ${e instanceof Error ? e.message : "l'envoi a échoué."}`);
              }
            })}>
            <span className="ch">›</span> Envoyer{sms ? " l'e-mail + le SMS" : ""}
          </button>
        </>
      }
    >
      <span className="mlab">Dossiers cités dans la relance</span>
      <div className="rlz-lignes" style={{ padding: 0, marginBottom: 12 }}>
        {lignes.map(({ p, libelle, jours }) => {
          const off = !retenus.includes(p.id);
          return (
            <div key={p.id} className={`rlz-l${off ? " off" : ""}`}>
              <span>{libelle}</span>
              {p.dossier && <span className="rlz-prix">Dossier {p.dossier.version}</span>}
              <span className="rlz-j">{jours === undefined ? "date inconnue" : `${jours} j`}</span>
              <span className="sp" style={{ flex: 1 }} />
              <button type="button" className="rlz-x" onClick={() => basculer(p.id)}>{off ? "ajouter" : "retirer"}</button>
            </div>
          );
        })}
      </div>
      <span className="mlab">Objet</span>
      <input className="min" value={objet} readOnly />
      <span className="mlab" style={{ marginTop: 10 }}>Message — modifiable avant l&apos;envoi</span>
      <textarea className="min" rows={11} value={corps} onChange={(e) => setTexte(e.target.value)} />
      <div className="asst-note">
        Part de la boîte de {agent?.nom ?? "l'agent"} vers <b>{email || "— aucune adresse sur la fiche —"}</b>.
        Le dossier est cité avec le lien de sa dernière version.
        {possible === false && " Aucune boîte d'envoi n'est branchée : ouvrez le message dans votre client mail."}
      </div>
      {/* #373 — le SMS en plus, avec son texte tel qu'il partira. */}
      <label className={`prop-sms${!tel || apercuSms?.configure === false ? " off" : ""}`}>
        <input type="checkbox" checked={sms} disabled={!tel || apercuSms?.configure === false}
          onChange={() => setSms((v) => !v)} />
        <span>
          <b>Relancer aussi par SMS</b>{tel ? ` au ${tel}` : " — pas de portable sur la fiche"}
          {apercuSms?.configure === false && " — l'envoi de SMS n'est pas branché sur cet environnement"}
          {apercuSms && <i>{apercuSms.texte}</i>}
        </span>
      </label>
    </Modale>
  );
}

/* ------------------------------------ L'écran Propositions de la fiche immeuble */

/**
 * Retour #373 : toutes les propositions de l'immeuble (plus dix), en cours ou
 * terminées, avec la recherche, le tri par classe, la barre de pages collée
 * en bas, et la carte partagée.
 */
export function EcranPropositionsBien({ immeubleId, libelle, prix, agent, titre, actions }: {
  immeubleId: string;
  /** « Ville (CP) — adresse », cité dans les relances. */
  libelle: string;
  prix?: string;
  agent?: { id?: string; nom?: string; tel?: string };
  /** Le titre de la section, avec ses compteurs. */
  titre: (badges: React.ReactNode) => React.ReactNode;
  /** Les boutons sous le titre (créer, relancer tous). */
  actions?: React.ReactNode;
}) {
  const [lignes, setLignes] = useState<PropositionLigne[] | null>(null);
  const [version, setVersion] = useState(0);
  const [vue, setVue] = useState<"en_cours" | "terminees">("en_cours");
  const [q, setQ] = useState("");
  const [tri, setTri] = useState<"date" | "classe">("date");
  const [page, setPage] = useState(1);
  const [taille, setTaille] = useState(10);
  const [maintenant] = useState(() => Date.now());
  const [relance, setRelance] = useState<{ ids: string[]; p: PropositionLigne } | null>(null);
  const [rapport, setRapport] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rafraichir = () => setVersion((v) => v + 1);

  useEffect(() => {
    let vivant = true;
    chargerPropositionsDuBien(immeubleId)
      .then((l) => { if (vivant) setLignes(l); })
      .catch(() => { if (vivant) setLignes([]); });
    return () => { vivant = false; };
  }, [immeubleId, version]);

  const enCours = (p: PropositionLigne) => !p.refusee && !STATUTS_CLOS_PROP.has(p.statut ?? "");
  const nbEnCours = (lignes ?? []).filter(enCours).length;
  const nbTerminees = (lignes ?? []).length - nbEnCours;

  const filtrees = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const liste = (lignes ?? []).filter((p) => {
      if (enCours(p) !== (vue === "en_cours")) return false;
      if (!qq) return true;
      return [p.contact?.nom, p.contact?.email, p.contact?.tel, p.email, p.contact?.qualite, p.commentaire, p.motif]
        .filter(Boolean).join(" ").toLowerCase().includes(qq);
    });
    if (tri === "classe") {
      const rang = (n?: string) => ({ A: 0, B: 1, C: 2, D: 3 } as Record<string, number>)[n ?? ""] ?? 9;
      liste.sort((a, b) => rang(a.contact?.note) - rang(b.contact?.note));
    }
    return liste;
  }, [lignes, vue, q, tri]);
  const tranche = filtrees.slice((page - 1) * taille, page * taille);

  /** La relance d'une personne, pour ce bien : un e-mail, et le SMS si demandé. */
  const client = (p: PropositionLigne) => (ids: string[]): ClientRelance => {
    const j = joursDepuis(p.depuis, maintenant);
    const immeubles: ImmeubleRelance[] = ids.includes(p.id)
      ? [{ propositionId: p.id, immeubleId, libelle, prix, jours: j, autresIds: [], lien: p.dossier?.pdf }]
      : [];
    return { contactId: p.contact?.id ?? "", nom: p.contact?.nom ?? "", email: p.contact?.email ?? p.email ?? "", immeubles, joursMax: j ?? 999 };
  };
  const chemins = [`/bien/${immeubleId}`];

  const relancer = (p: PropositionLigne, mode: ModeRelance) =>
    start(async () => {
      setRapport(null);
      const email = p.contact?.email ?? p.email;
      const tel = p.contact?.tel;
      const c = client(p)([p.id]);
      const messages: string[] = [];
      try {
        if (mode !== "sms") {
          if (!email) { messages.push("Pas d'adresse e-mail pour cette personne."); }
          else {
            const r = await envoyerRelances(
              [{ contactId: c.contactId, email, objet: objetRelance(c), corps: messageRelance(c, agent), propositionIds: [p.id] }],
              agent?.id, undefined, chemins,
            );
            messages.push(r.envoyes ? `E-mail envoyé à ${email}.` : `E-mail non envoyé : ${r.journal[0] ?? "l'envoi n'est pas parti."}`);
          }
        }
        if (mode !== "email") {
          const s = await relancerParSms([{ contactId: c.contactId, tel, libelle, propositionIds: [p.id] }], agent?.nom, chemins);
          messages.push(s.envoyes ? `SMS envoyé au ${tel}.` : `SMS non envoyé : ${s.journal[0] ?? ""}`);
        }
      } catch (e) {
        messages.push(`Échec : ${e instanceof Error ? e.message : "l'envoi a échoué."}`);
      }
      setRapport(messages.join(" "));
      rafraichir();
    });

  return (
    <>
      {titre(
        <>
          <Pastille ton="rouge">{nbEnCours} à traiter</Pastille>
          <Pastille ton="vert">{nbTerminees} traitée{nbTerminees > 1 ? "s" : ""}</Pastille>
        </>,
      )}
      {actions}

      <div className="prop-barre">
        <div className="lst-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
          <input placeholder="Recherchez une proposition — nom, téléphone, e-mail…" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <div className="lstx-sw" role="group" aria-label="Vue">
          {([["en_cours", "En cours", nbEnCours], ["terminees", "Terminées", nbTerminees]] as const).map(([k, l, n]) => (
            <button key={k} type="button" className={vue === k ? "on" : undefined}
              onClick={() => { setVue(k); setPage(1); }}>
              {k === "en_cours" ? <i className="prop-pt vert" /> : <i className="prop-pt gris" />}
              {l}{n > 0 && <span className="n">{n}</span>}
            </button>
          ))}
        </div>
        <select className="pgs" value={tri} onChange={(e) => setTri(e.target.value as "date" | "classe")} title="Tri">
          <option value="date">Tri : date d&apos;envoi</option>
          <option value="classe">Tri : classe A → D</option>
        </select>
      </div>

      {rapport && <div className={`cfx-rapport${/Échec|non envoyé|Pas d'/.test(rapport) ? " ko" : ""}`}>{rapport}</div>}
      {lignes === null && <div className="fempty">Lecture des propositions…</div>}
      {lignes !== null && tranche.length === 0 && (
        <div className="fempty">{vue === "en_cours" ? "Aucune proposition en cours." : "Aucune proposition terminée."}</div>
      )}
      {tranche.map((p) => (
        <CarteProposition
          key={p.id} p={p} contexte={{ immeubleId }}
          jours={joursDepuis(p.depuis, maintenant)}
          onRelancer={(mode) => relancer(p, mode)}
          onRelancerModale={() => setRelance({ ids: [p.id], p })}
          onRafraichir={rafraichir}
        />
      ))}
      {lignes !== null && filtrees.length > 0 && (
        <Pagination total={filtrees.length} page={page} taille={taille} collee quoi="proposition"
          onPage={setPage} onTaille={(t) => { setTaille(t); setPage(1); }} />
      )}
      {relance && (
        <ModaleRelance
          lignes={[{ p: relance.p, libelle, jours: joursDepuis(relance.p.depuis, maintenant) }]}
          ids={relance.ids} client={client(relance.p)} agent={agent}
          email={relance.p.contact?.email ?? relance.p.email ?? ""} tel={relance.p.contact?.tel}
          chemins={chemins}
          onFermer={() => setRelance(null)}
          onFait={(msg) => { setRelance(null); setRapport(msg); rafraichir(); }}
        />
      )}
      {pending && null}
    </>
  );
}
