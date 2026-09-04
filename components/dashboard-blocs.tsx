"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KBloc, KCard, KCol } from "@/lib/data/dashboard";
import {
  addSuivi, archiverImmeuble, mettreEnAttente, reactiver, reculerStatut, setStatut,
  transfererImmeuble,
} from "@/lib/bo/actions";
import { SuiviModal } from "@/components/suivi-modal";
import { Facade } from "@/components/facade";
import {
  FicheContact, ModaleAttente, ModaleMoyenContact, ModaleTransfert,
} from "@/components/dashboard-modales";
import { MOTIFS_ARCHIVAGE } from "@/lib/referentiels";

const COL_IC: Record<KCol["icon"], React.ReactNode> = {
  form: <path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1.6 3v2.4h5V7h-5zm7 .4v1.6h5.8V7.4h-5.8zM5.6 11.6v1.6h12.2v-1.6H5.6zm0 3.6V17h12.2v-1.8H5.6z" />,
  building: <path d="M5 2h11a1 1 0 0 1 1 1v18h3v2H4v-2h1V3a1 1 0 0 1 0-1zm2.5 3v2h2V5h-2zm4 0v2h2V5h-2zm-4 3.6v2h2v-2h-2zm4 0v2h2v-2h-2zm-4 3.6v2h2v-2h-2zm4 0v2h2v-2h-2zm-2 3.8V21h4v-5h-4z" />,
  flame: <><path d="M12 3c1 3-3 4.5-3 8a3 3 0 0 0 6 0c0-1.5-.8-2.5-.8-2.5S17 10 17 13a5 5 0 0 1-10 0c0-4.5 4-6 5-10z" /></>,
  pdf: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></>,
  spread: <><path d="M12 3v7M12 10l-6 8M12 10l6 8" /><circle cx="12" cy="3" r="1.6" /><circle cx="6" cy="19" r="1.6" /><circle cx="18" cy="19" r="1.6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" /></>,
  tool: <><path d="M13 3 4 12l3.5 3.5L14 9M11 12l6 6M14 15l4 4" /></>,
  bank: <><path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18" /></>,
  flag: <><path d="M5 3v18M5 4h12l-2.5 3.5L17 11H5" /></>,
};

const BLOC_IC: Record<KBloc["icon"], React.ReactNode> = {
  in: <><path d="M14 4h6v16h-6M3 12h11M10 8l4 4-4 4" /></>,
  megaphone: <><path d="M3 10v4l4 .8V9.2zM7 9l11-5v16l-11-5" /><path d="M8 15l1 5h3l-.8-4.6" /></>,
  flag: <><path d="M4 21V4" /><path d="M4 5c3-2 6 1 9 0s5-1 7 0v9c-2-1-4-1-7 0s-6 2-9 0" /></>,
};

function Card({
  c, mock, agents = [], peutTransferer = true,
}: {
  c: KCard; mock?: boolean;
  agents?: { id: string; name: string }[];
  /** Un agent ne transfère que ses propres biens ; l'admin transfère tout. */
  peutTransferer?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [suiviOpen, setSuiviOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [hist, setHist] = useState(false);
  const [moyen, setMoyen] = useState(false);
  const [transfert, setTransfert] = useState(false);
  const [attente, setAttente] = useState(false);
  const [fiche, setFiche] = useState(false);
  const [note, setNote] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [menu]);

  // « Contacté » : on demande d'abord par quel moyen le contact a été joint
  // (statistiques), puis on avance le statut et on ouvre la fiche sur l'état
  // locatif pour enchaîner l'estimation (retours MAV #5 et #25).
  // Annuler ne déclenche aucune action et ne navigue nulle part (#28).
  const onAction = () => {
    if (mock || pending || !c.action) return;
    if (c.action.kind !== "green" && c.action.next === 2) { setMoyen(true); return; }
    startTransition(async () => {
      if (c.action!.kind === "green") await reactiver(c.id);
      else if (c.action!.next) await setStatut(c.id, c.action!.next);
    });
  };

  const confirmerMoyen = (m: string) => {
    setMoyen(false);
    startTransition(async () => {
      await addSuivi({ immeubleId: c.id, agentId: "", contactId: c.contactId, canaux: [m], notes: "" });
      await setStatut(c.id, c.action!.next!);
      router.push(`/bien/${c.id}?section=locatif`);
    });
  };
  const top = (
    <>
        <Vignette c={c} />
        <div className="kbody">
          <div className="krow1">
            <span className="kt">{c.ville}</span>
            <span className="kcontact-wrap">
              <span className="kcontact" role="button" tabIndex={0}
                title="Voir les coordonnées"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFiche((v) => !v); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setFiche((v) => !v); } }}>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
                {c.contact}
              </span>
              {fiche && (
                <FicheContact
                  c={{ ...(c.contactInfo ?? { nom: c.contact }), initiales: c.rvText, initialesCouleur: c.rvCouleur }}
                  onClose={() => setFiche(false)}
                />
              )}
            </span>
          </div>

          {c.statusMandat && (
            <div className="kstatus">
              <svg viewBox="0 0 24 24"><path d="M5 8h14v12H5z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
              {c.statusMandat}
            </div>
          )}

          {(c.date || c.note || c.estimation) && !c.wait && (
            <div className="krow2">
              {c.date && <span className="kdate">{c.date}</span>}
              {c.estimation && (
                <span className="knote">
                  <span className="nic"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg></span>
                  Estimation
                </span>
              )}
              {c.note && (
                <span className="knote">
                  {c.note === "Formulaire" && (
                    <span className="nic"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></svg></span>
                  )}
                  {c.note}
                </span>
              )}
              {c.chevron && (
                <span className={`kchev${note ? " on" : ""}`} role="button" tabIndex={0}
                  title={note ? "Replier la note" : "Dérouler la note"}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNote((v) => !v); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setNote((v) => !v); } }}>
                  <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
                </span>
              )}
            </div>
          )}

          {note && c.noteComplete && <div className="knote-full">{c.noteComplete}</div>}

          {c.wait && (
            <div className={`kwait${c.wait.late === false ? " soon" : ""}`}>
              <span className="d">{c.wait.from}</span>
              <span className="mid">
                <span className="lbl">{c.wait.motif}</span>
                {c.wait.pct !== undefined && <span className="bar"><i style={{ width: `${c.wait.pct}%` }} /></span>}
                <span className="ar">▾</span>
              </span>
              <span className="d">{c.wait.to}</span>
            </div>
          )}

          {(c.adresse || c.prix || c.fee) && (
            <div className="krow3">
              {c.adresse && <span className="kaddr">{c.adresse}</span>}
              {c.fee && <span className="kfee">{c.fee}</span>}
              {c.prix && <span className="kprice" style={!c.fee ? { marginLeft: "auto" } : undefined}>{c.prix}</span>}
            </div>
          )}
        </div>
    </>
  );
  return (
    <div className={`kard${c.wait ? (c.wait.late === false ? " hold" : " alert") : ""}`}>
      {mock ? (
        <div className="kard-top" style={{ display: "flex" }}>{top}</div>
      ) : (
        <Link href={`/bien/${c.id}`} className="kard-top" style={{ display: "flex" }}>{top}</Link>
      )}

      <div className="kact">
        <div className="kmenu-wrap" ref={menuRef}>
          <button className="kbtn" type="button" aria-label="Autres actions" onClick={() => setMenu((v) => !v)}>
            {menu
              ? <svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg>
              : <svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></svg>}
          </button>
          {menu && (
            <div className="kmenu">
              <button type="button" onClick={() => { setMenu(false); setSuiviOpen(true); }}>
                <svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
                Appeler
              </button>
              <button type="button" onClick={() => { setMenu(false); setSuiviOpen(true); }}>
                <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 5 9-5" /></svg>
                Envoyer un e-mail
              </button>
              <button type="button" onClick={() => {
                setMenu(false);
                const motif = prompt(`Motif d'archivage ?\n\n${MOTIFS_ARCHIVAGE.join(" · ")}`, "Ne souhaite pas vendre");
                if (motif) startTransition(() => archiverImmeuble(c.id, motif));
              }}>
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" /><path d="M5 8v12h14V8M10 12h4" /></svg>
                Archiver
              </button>
              <button type="button" onClick={() => { setMenu(false); setTransfert(true); }}>
                <svg viewBox="0 0 24 24"><path d="M4 12h14M13 7l5 5-5 5" /></svg>
                Transférer à un collègue
              </button>
              {/* Repousser n'est pas archiver : le dossier sort du « en cours »
                  mais garde une date de retour (retour #139). */}
              <button type="button" onClick={() => { setMenu(false); setAttente(true); }}>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                Mettre en attente
              </button>
              <button type="button" onClick={() => {
                setMenu(false);
                if (c.statutNum) startTransition(() => reculerStatut(c.id, c.statutNum!));
              }}>
                <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
                Renvoyer à l&apos;étape précédente
              </button>
            </div>
          )}
        </div>
        {c.history && (
          <button className={`kbtn${hist ? " on" : ""}`} type="button" aria-label="Historique" onClick={() => setHist((v) => !v)}>
            <svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 1 1-1 5" /><path d="M4 4v5h5" /><path d="M12 8v4l3 2" /></svg>
          </button>
        )}
        {c.redIcons && (
          <>
            <button className="kbtn redic" type="button" aria-label="Mandat manquant">
              <svg viewBox="0 0 24 24"><path d="M5 8h14v12H5z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
            </button>
            <button className="kbtn redic" type="button" aria-label="Dossier PDF manquant">
              <svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></svg>
            </button>
            <button className="kbtn redic" type="button" aria-label="Contacts manquants">
              <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.6 14.2c2.4.2 4.2 1.6 4.6 4.3" /></svg>
            </button>
            <button className="kbtn" type="button" aria-label="Verrouillé">
              <svg viewBox="0 0 24 24"><rect x="6" y="10" width="12" height="10" rx="2" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></svg>
            </button>
          </>
        )}
        <span className="sp" />
        <button className="kbtn msg" type="button" aria-label="Messages" onClick={() => setSuiviOpen(true)}>
          <svg viewBox="0 0 24 24"><path d="M8.4 3h9.2A3.4 3.4 0 0 1 21 6.4v4.4a3.4 3.4 0 0 1-3.4 3.4h-.6v2.5c0 .5-.6.8-1 .5l-3.6-3H8.4A3.4 3.4 0 0 1 5 10.8V6.4A3.4 3.4 0 0 1 8.4 3z" /><path d="M3.2 8.6v4.6a4.2 4.2 0 0 0 4.2 4.2h.6v1.4c0 .5.6.8 1 .4l1.2-1H7.4a4.9 4.9 0 0 1-4.2-4.9V8.6z" /></svg>
        </button>
        {c.counts && (
          <>
            <span className="kcount"><svg viewBox="0 0 24 24"><path d="M21 4 3 11l7 3 3 7z" /></svg>{c.counts.prop}</span>
            <span className="kcount"><svg viewBox="0 0 24 24"><path d="M4 15l2-6h12l2 6" /><rect x="3" y="15" width="18" height="4" rx="1.5" /><circle cx="7.5" cy="19" r="1.4" /><circle cx="16.5" cy="19" r="1.4" /></svg>{c.counts.vis}</span>
            <span className="kcount"><svg viewBox="0 0 24 24"><path d="M13 3 4 12l3.5 3.5L14 9M11 12l6 6M14 15l4 4" /></svg>{c.counts.off}</span>
          </>
        )}
        {c.action && (
          <button
            className={`kgo${c.action.kind === "green" ? " green" : ""}`}
            type="button"
            disabled={pending}
            style={pending ? { opacity: 0.5 } : undefined}
            onClick={onAction}
          >
            {c.action.kind === "green" ? (
              <svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 1 1-1 5" /><path d="M4 4v5h5" /></svg>
            ) : (
              <span className="ch">›</span>
            )}
            {c.action.label}
          </button>
        )}
      </div>

      {hist && c.historique && c.historique.length > 0 && (
        <div className="khist">
          {c.historique.map((h, i) => (
            <div className="l" key={i}>
              <span className="d">{h.date}</span>
              <span className="m">{h.motif}</span>
              <span>{h.note}</span>
            </div>
          ))}
        </div>
      )}

      {moyen && (
        <ModaleMoyenContact onAnnuler={() => setMoyen(false)} onConfirmer={confirmerMoyen} />
      )}

      {transfert && (
        <ModaleTransfert
          bien={{ ville: c.ville, adresse: c.adresse, contact: c.contact, photoUrl: c.photoUrl, initiales: c.rvText, initialesCouleur: c.rvCouleur, note: c.note }}
          agents={agents}
          peutTransferer={peutTransferer}
          onAnnuler={() => setTransfert(false)}
          onTransferer={(agentId, avecProprio) => {
            setTransfert(false);
            startTransition(() => transfererImmeuble(c.id, agentId, avecProprio ? c.contactId ?? null : null));
          }}
        />
      )}

      {attente && (
        <ModaleAttente
          bien={{
            ville: c.ville, adresse: c.adresse,
            proprietaire: c.contactInfo?.nom ?? c.contact,
            email: c.contactInfo?.email,
          }}
          onAnnuler={() => setAttente(false)}
          onValider={({ motif, dateRelance, email }) => {
            setAttente(false);
            startTransition(async () => {
              await mettreEnAttente({ immeubleId: c.id, agentId: "", motif, dateRelance });
              /* L'e-mail au propriétaire n'est jamais envoyé d'ici : on ouvre
                 la fenêtre de rédaction de la boîte, pré-remplie. */
              if (email) {
                router.push(
                  `/mails?to=${encodeURIComponent(email.to)}`
                  + `&objet=${encodeURIComponent(email.objet)}`
                  + `&corps=${encodeURIComponent(email.corps)}`,
                );
              }
            });
          }}
        />
      )}

      {suiviOpen && (
        <SuiviModal
          immeubleId={c.id}
          agentId=""
          objet={c.objet ?? c.ville}
          contactNom={c.contact}
          contactId={c.contactId}
          onClose={() => setSuiviOpen(false)}
        />
      )}
    </div>
  );
}

/** Vrai quand le dashboard est en mode téléphone (classe posée par Burger). */
const estTel = () => typeof document !== "undefined" && document.body.classList.contains("ecran-tel");


/**
 * La vignette d'une carte du dashboard.
 *
 * Ordre de repli : la photo du bien, puis — faute de photo — la façade en vue
 * de rue, puis le pictogramme. Les deux premières colonnes du dashboard
 * n'ont presque jamais de photo (les immeubles viennent d'arriver) : sans la
 * vue de rue, l'agent trie une liste de pictogrammes identiques.
 *
 * La vue de rue est un repère DANS l'outil : les conditions d'usage de Google
 * interdisent de la réutiliser comme photo du bien, dossier de vente ou
 * annonce comprises.
 */
function Vignette({ c }: { c: KCard }) {
  return (
    <div className={`kthumb${c.photoUrl ? " has-photo" : ""}`}>
      <Facade photoUrl={c.photoUrl} facadeRue={c.facadeRue}
        repli={<svg viewBox="0 0 24 24">{c.photo ? COL_IC.building : COL_IC.form}</svg>} />
      {c.rv && <span className="rv" style={c.rvCouleur ? { background: c.rvCouleur } : undefined}>{c.rvText ?? "RV"}</span>}
    </div>
  );
}

function Bloc({ b, mock, agents }: { b: KBloc; mock?: boolean; agents?: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(b.openDefault);
  /* Colonnes repliées / dépliées EXPLICITEMENT par l'agent. Deux ensembles
     plutôt qu'un booléen : le pli par défaut n'est pas le même sur téléphone
     (tout replié, pour lire les neuf en-têtes d'un coup d'œil) et sur écran
     large (tout ouvert, comme aujourd'hui). En laissant le défaut au CSS, le
     rendu du serveur et celui du navigateur restent identiques — aucun
     clignotement, aucune alerte d'hydratation. */
  const [plies, setPlies] = useState<Set<string>>(new Set());
  const [deplies, setDeplies] = useState<Set<string>>(new Set());
  const basculerCol = (cle: string) => {
    const ouverteMaintenant = deplies.has(cle) || (!plies.has(cle) && !estTel());
    setPlies((s) => { const n = new Set(s); if (ouverteMaintenant) n.add(cle); else n.delete(cle); return n; });
    setDeplies((s) => { const n = new Set(s); if (ouverteMaintenant) n.delete(cle); else n.add(cle); return n; });
  };
  return (
    <section className="bloc">
      <div className="bloc-band" onClick={() => setOpen((v) => !v)} role="button" aria-expanded={open}>
        <span className="bic"><svg viewBox="0 0 24 24">{BLOC_IC[b.icon]}</svg></span>
        <h2>{b.titre}</h2>
        <span className="sp" />
        {b.ventes && (
          <>
            <span style={{ fontSize: 12.5, color: "var(--slate-2)", fontWeight: 700 }}>{b.ventes.left}</span>
            <span className="karrow">→</span>
            <span className="kchip">{b.ventes.right}</span>
          </>
        )}
        {b.nred > 0 && <span className="nred">{b.nred}</span>}
        <span className="nsq">{b.nsq}</span>
        {/* Rien n'indiquait que le bandeau était cliquable (retour MAV). */}
        <span className={`bchev${open ? " on" : ""}`} aria-hidden>˅</span>
      </div>
      {open && b.ventes && (
        <div className="vbar">
          <span className="g" style={{ width: `${b.ventes.pctGreen}%` }} />
          <span className="r" />
        </div>
      )}
      {open && (
        <div className="cols">
          {b.cols.map((col) => (
            <div
              className={`col${plies.has(col.key) ? " plie" : ""}${deplies.has(col.key) ? " deplie" : ""}`}
              key={col.key}
            >
              <button type="button" className="col-head" onClick={() => basculerCol(col.key)}>
                <span className="cic"><svg viewBox="0 0 24 24">{COL_IC[col.icon]}</svg></span>
                <span className="t">{col.titre}</span>
                {col.fee && <span className="kchip">{col.fee}</span>}
                <span className="n">{col.count}</span>
                <span className="cchev" aria-hidden>˅</span>
              </button>
              <div className="col-body">
                {col.cards.map((c) => (
                  <Card key={c.id} c={c} mock={mock} agents={agents} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Le dashboard filtré par la recherche de la barre haute (retour #306).
 *
 * MAV : « quand je fais une recherche, je veux juste que ça cache tous les
 * immeubles qui ne correspondent pas à la recherche, que ce soit par nom de
 * proprio, par ville ou par adresse. Je t'ai mis ce à quoi ça ressemble. »
 *
 * La barre partait sur un écran de résultats à part : on perdait les colonnes,
 * donc l'étape où chaque dossier se trouve — et c'est justement ce qu'on
 * cherche en tapant un nom. Les colonnes restent ; seules les cartes qui ne
 * correspondent pas disparaissent, et les compteurs suivent.
 *
 * Mot à mot : « voci nanterre » trouve la carte de Nanterre de M. Voci, dans
 * l'ordre qu'on veut. Chaque mot doit se retrouver quelque part — ville,
 * adresse, contact — ce qui évite les faux positifs d'une recherche « ou ».
 */
function correspond(c: KCard, mots: string[]): boolean {
  if (mots.length === 0) return true;
  const foin = [
    c.ville, c.adresse, c.contact, c.objet,
    c.contactInfo?.nom, c.contactInfo?.email, c.contactInfo?.tel,
  ]
    .filter(Boolean).join(" ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return mots.every((m) => foin.includes(m));
}

const decouper = (q: string) =>
  q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/\s+/).map((x) => x.trim()).filter(Boolean);

export function DashboardBlocs({ blocs, mock, agents, recherche = "" }: {
  blocs: KBloc[]; mock?: boolean; agents?: { id: string; name: string }[];
  /** Ce qui est tapé dans la barre haute (#306). */
  recherche?: string;
}) {
  const mots = useMemo(() => decouper(recherche), [recherche]);

  const vus = useMemo(() => {
    if (mots.length === 0) return blocs;
    return blocs.map((b) => {
      const cols = b.cols.map((c) => {
        const cards = c.cards.filter((x) => correspond(x, mots));
        return { ...c, cards, count: cards.length };
      }) as KBloc["cols"];
      const total = cols.reduce((s, c) => s + c.cards.length, 0);
      /* Les pastilles du bandeau comptent ce que l'écran montre, pas ce qu'il
         montrerait sans filtre : un « 45 » à côté de deux cartes visibles
         ferait douter du filtre. */
      return { ...b, cols, nsq: total, nred: Math.min(b.nred, total), openDefault: total > 0 };
    });
  }, [blocs, mots]);

  const trouves = vus.reduce((s, b) => s + b.cols.reduce((t, c) => t + c.cards.length, 0), 0);

  return (
    <div className="wrap">
      {mots.length > 0 && (
        <div className="dash-filtre">
          {trouves === 0
            ? <>Aucun immeuble ne correspond à <b>{recherche}</b>.</>
            : <>{trouves} immeuble{trouves > 1 ? "s" : ""} {trouves > 1 ? "correspondent" : "correspond"} à <b>{recherche}</b> — les autres sont masqués.</>}
          <Link className="dash-filtre-x" href="/">✕ Tout afficher</Link>
        </div>
      )}
      {vus.map((b) => (
        <Bloc key={b.key} b={b} mock={mock} agents={agents} />
      ))}
    </div>
  );
}
