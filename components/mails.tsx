"use client";

// Écran Mails — la boîte métier (livraison 1).
//
// Trois piles : ce qui est rattaché à une affaire, ce qui attend d'être
// classé, et ce qui est parti du BO. Le fil s'ouvre à droite ; quand il est
// rattaché à une estimation ou une proposition, la carte dorée propose
// d'écrire le retour dans le suivi.
//
// Servi aujourd'hui par les 657 mails de `bo_mail`. La relève IMAP remplira
// la même table avec les entrants : cet écran n'aura pas à bouger.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { FilMail } from "@/lib/bubble/server";
import { noterRetourMail } from "@/lib/bo/actions";

const PILES = [
  { cle: "affaires", label: "Affaires" },
  { cle: "a_classer", label: "À classer" },
  { cle: "envoyes", label: "Envoyés" },
] as const;

/** Les retours possibles d'un vendeur sur une estimation ou une proposition. */
const RETOURS = [
  "Accepte le prix",
  "Trouve le prix bas",
  "Trouve le prix haut",
  "Demande à en discuter",
  "Refuse",
  "À relancer",
];

const jour = (d?: string) => {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const auj = new Date();
  const memeJour = x.toDateString() === auj.toDateString();
  return memeJour
    ? x.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : x.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
};

export function MailsEcran({ mails }: { mails: FilMail[] }) {
  const [pile, setPile] = useState<(typeof PILES)[number]["cle"]>("affaires");
  const [ouvert, setOuvert] = useState<string | null>(mails[0]?.id ?? null);
  const [recherche, setRecherche] = useState("");

  const parPile = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const filtre = (m: FilMail) =>
      !q || `${m.objet} ${m.qui} ${m.adresse} ${m.extrait}`.toLowerCase().includes(q);
    return {
      affaires: mails.filter((m) => m.pile === "affaires" && m.entrant !== false).filter(filtre),
      a_classer: mails.filter((m) => m.pile === "a_classer").filter(filtre),
      envoyes: mails.filter((m) => !m.entrant).filter(filtre),
    };
  }, [mails, recherche]);

  // Tant qu'IMAP n'est pas branché il n'y a aucun entrant : la pile Affaires
  // serait vide et l'écran illisible. On y montre alors les fils rattachés,
  // quel que soit leur sens.
  const listeAffaires = parPile.affaires.length
    ? parPile.affaires
    : mails.filter((m) => m.pile === "affaires").filter((m) =>
        !recherche.trim() || `${m.objet} ${m.qui}`.toLowerCase().includes(recherche.trim().toLowerCase()));

  const liste = pile === "affaires" ? listeAffaires : parPile[pile];
  const courant = liste.find((m) => m.id === ouvert) ?? liste[0];

  return (
    <div className="ml">
      <div className="ml-top">
        <span className="ml-h">Mails</span>
        <span className="ml-sub">{mails.length} messages rattachés · relève IMAP à brancher</span>
        <span style={{ flex: 1 }} />
        <input
          className="min" style={{ width: 220 }} placeholder="Rechercher un échange…"
          value={recherche} onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <div className="ml-tabs">
        {PILES.map((p) => {
          const n = p.cle === "affaires" ? listeAffaires.length : parPile[p.cle].length;
          return (
            <button key={p.cle} type="button" className={pile === p.cle ? "on" : undefined}
              onClick={() => { setPile(p.cle); setOuvert(null); }}>
              {p.label} <span className="c">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="ml-corps">
        <div className="ml-liste">
          {liste.map((m) => (
            <button
              key={m.id} type="button"
              className={`ml-row${courant?.id === m.id ? " on" : ""}`}
              onClick={() => setOuvert(m.id)}
            >
              <span className="l1">
                <b>{m.qui}</b>
                <i>{jour(m.date)}</i>
              </span>
              <span className="ob">{m.objet}</span>
              <span className="ex">{m.extrait}</span>
              <span className="tags">
                {m.immeubleLabel && <span className="mtag im">{m.immeubleLabel}</span>}
                {m.estimationId && <span className="mtag af">Estimation</span>}
                {!m.entrant && <span className="mtag n">Envoyé</span>}
                {m.pj > 0 && <span className="mtag n">{m.pj} PJ</span>}
              </span>
            </button>
          ))}
          {liste.length === 0 && (
            <div className="fempty" style={{ padding: 30 }}>
              {recherche ? "Aucun échange pour cette recherche." : "Aucun message dans cette pile."}
            </div>
          )}
        </div>

        <div className="ml-fil">
          {courant ? <Fil m={courant} /> : <div className="fempty" style={{ padding: 40 }}>Sélectionnez un échange.</div>}
        </div>
      </div>
    </div>
  );
}

function Fil({ m }: { m: FilMail }) {
  const [note, setNote] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const [pending, start] = useTransition();
  /** La carte n'a de sens que sur un fil rattaché à une affaire chiffrée. */
  const proposable = !!m.estimationId && !fait;

  return (
    <>
      <div className="ml-fh">
        <div>
          <div className="t">{m.objet}</div>
          <div className="s">
            {m.qui}
            {m.adresse && <> · {m.adresse}</>}
            {m.immeubleId && (
              <> · <Link href={`/bien/${m.immeubleId}`}>{m.immeubleLabel || "voir l'immeuble"}</Link></>
            )}
          </div>
        </div>
      </div>

      {proposable && (
        <div className="ml-carte">
          <div className="q">Noter le retour dans l&apos;estimation ?</div>
          <div className="w">
            Un clic écrit la note dans le suivi de l&apos;immeuble et met à jour l&apos;estimation.
          </div>
          <div className="opts">
            {RETOURS.map((r) => (
              <button key={r} type="button" className={`opt${note === r ? " on" : ""}`} onClick={() => setNote(r)}>
                {r}
              </button>
            ))}
            <button type="button" className="opt no" onClick={() => setFait(true)}>Ne rien noter</button>
          </div>
          {note && (
            <div className="mrow" style={{ marginTop: 9 }}>
              <button
                className="kgo" type="button" disabled={pending}
                style={pending ? { opacity: 0.5 } : undefined}
                onClick={() => start(async () => {
                  await noterRetourMail({
                    mailId: m.id,
                    immeubleId: m.immeubleId,
                    contactId: m.contactId,
                    estimationId: m.estimationId,
                    retour: note,
                  });
                  setFait(true);
                })}
              >
                <span className="ch">›</span> {pending ? "Enregistrement…" : `Noter « ${note} »`}
              </button>
            </div>
          )}
        </div>
      )}
      {fait && <div className="ml-note-ok">Retour enregistré dans le suivi.</div>}

      <div className={`ml-msg${m.entrant ? "" : " out"}`}>
        <div className="mh">
          <b>{m.entrant ? m.qui : "Vous"}</b>
          <span className="w">{m.adresse}</span>
          <span className="d">{jour(m.date)}</span>
        </div>
        <p>{m.corps || "(message vide)"}</p>
        {m.pj > 0 && <span className="ml-pj">{m.pj} pièce{m.pj > 1 ? "s" : ""} jointe{m.pj > 1 ? "s" : ""}</span>}
      </div>

      <div className="ml-rep">
        Répondre depuis le back-office — disponible dès la relève IMAP branchée.
      </div>
    </>
  );
}

/** Onglet « Échanges » de la fiche contact. */
export function EchangesContact({ mails }: { mails: FilMail[] }) {
  if (mails.length === 0) {
    return <div className="fempty">Aucun échange enregistré avec ce contact.</div>;
  }
  return (
    <div className="ml-ech">
      {mails.map((m) => (
        <div key={m.id} className="ml-echrow">
          <span className="dir" title={m.entrant ? "Reçu" : "Envoyé"}>{m.entrant ? "←" : "→"}</span>
          <div style={{ minWidth: 0 }}>
            <div className="ob">{m.objet}</div>
            <div className="ex">{m.extrait}</div>
            {m.immeubleId && (
              <Link className="lk" href={`/bien/${m.immeubleId}`}>{m.immeubleLabel || "Immeuble"}</Link>
            )}
          </div>
          <span className="dt">{jour(m.date)}</span>
        </div>
      ))}
    </div>
  );
}
