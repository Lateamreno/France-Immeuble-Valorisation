"use client";

/**
 * Les modales de la barre d'actions rapides (retours #333, #334, #335, #336).
 *
 * MAV : « quand on clique sur proposition il faut que cela ouvre la modale
 * création de proposition » (#333), « quand on clique sur visite il faut que ça
 * ouvre la modale création de visite. Toutes les modales de la sticky barre du
 * bas viennent compléter les fiches contact, propriétaire, biens etc. » (#334),
 * « quand on clique sur offre il faut que ça lance la modale création d'offre.
 * N'oublie pas de rajouter le bouton pour ajouter l'offre en PDF et propose-moi
 * si je veux écrire un e-mail pour l'envoyer aux propriétaires » (#335), et
 * « dans la fiche client […] il faudrait qu'à chaque fois ce soit les mêmes
 * modales » (#336).
 *
 * Ces trois écrans affichaient jusqu'ici une boîte d'alerte : « se crée depuis
 * la fiche du bien ». C'était vrai, et c'était le problème — il fallait
 * retrouver le bien avant de pouvoir noter une visite qu'on venait de faire.
 *
 * D'où un module unique : la barre du bas et la fiche contact montent les
 * mêmes composants, avec ou sans bien et avec ou sans contact déjà connus.
 * Ce qui est connu ne se redemande pas ; ce qui manque se choisit sur place.
 *
 * Retours du 02/10 (#445 à #450) : l'offre ne propose que les immeubles sous
 * mandat déjà distribués, lie net vendeur, honoraires et HAI comme le mandat,
 * porte la date et le délai de l'offre, et ouvre la fenêtre d'e-mail aux
 * propriétaires avec l'offre en pièce jointe ; la proposition envoie l'e-mail
 * de commercialisation habituel, montre ses pièces jointes et accepte
 * plusieurs immeubles.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ContactPicker } from "@/components/contact-picker";
import { Modale } from "@/components/modale";
import { PastilleStatut } from "@/components/pastille";
import { FenetreRedaction } from "@/components/mails/redaction";
import { contexteRedaction } from "@/lib/bo/mails-actions";
import { ancrePrix, resoudrePrix, type ChampPrix, type Prix } from "@/lib/mandat";
import { group } from "@/lib/format";
import {
  messageCommercialisationPlusieurs, objetCommercialisationPlusieurs,
} from "@/lib/bo/mail-commercialisation";
import {
  addOffre, addVisite, biensPourProposition, chercherImmeubles, creerEtEnvoyerProposition,
  deposerOffrePdf, deposerPieceJointe, proprietairesPourOffre, traiterAProposer,
  type BienProposition, type ContactTrouve, type ImmeubleTrouve,
} from "@/lib/bo/actions";

type Bien = { id: string; libelle: string };
type Personne = { id: string; nom: string; email?: string };
type Piece = { nom: string; path?: string; url?: string };

/* ------------------------------- Sélecteur de bien ------------------------ */

function ChoixBien({
  valeur, onChoisir, pour, exclure = [], libelleChanger = "Changer de bien",
}: {
  valeur?: Bien;
  onChoisir: (b: Bien | undefined) => void;
  /** Retour #445 : pour une offre, seuls les immeubles sous mandat déjà
   *  distribués ont un sens. */
  pour?: "offre";
  /** Les biens déjà dans la proposition : inutile de les reproposer. */
  exclure?: string[];
  libelleChanger?: string;
}) {
  const [q, setQ] = useState("");
  const [liste, setListe] = useState<ImmeubleTrouve[]>([]);
  const [ouvert, setOuvert] = useState(!valeur);
  const [pending, start] = useTransition();

  /* Sans mot-clé, la liste montre les biens en commercialisation : une modale
     qui s'ouvre vide oblige à deviner ce qu'elle attend. */
  useEffect(() => {
    if (!ouvert) return;
    const t = setTimeout(() => {
      start(async () => { setListe(await chercherImmeubles(q, pour).catch(() => [])); });
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, ouvert, pour]);

  if (valeur && !ouvert) {
    return (
      <div className="mrow" style={{ alignItems: "center" }}>
        <span className="fchip">{valeur.libelle}</span>
        <button type="button" className="fadd" onClick={() => setOuvert(true)}>{libelleChanger}</button>
      </div>
    );
  }

  const visibles = liste.filter((b) => !exclure.includes(b.id));
  return (
    <>
      <div className="lst-search" style={{ maxWidth: "none" }}>
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
        <input autoFocus placeholder="Ville, rue, numéro…" value={q}
          onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="arp-biens">
        {pending && visibles.length === 0 && <div className="fempty">Recherche…</div>}
        {!pending && visibles.length === 0 && (
          <div className="fempty">
            {pour === "offre"
              ? "Aucun immeuble sous mandat déjà distribué ne correspond."
              : "Aucun immeuble ne correspond."}
          </div>
        )}
        {/* Retour #449 : « un peu de couleur dans le popup ». Le statut prend
            la pastille du catalogue, le prix sa couleur d'or. */}
        {visibles.map((b) => (
          <button key={b.id} type="button" className="arp-bien"
            onClick={() => { onChoisir({ id: b.id, libelle: b.libelle }); setOuvert(false); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {b.photoUrl ? <img src={b.photoUrl} alt="" /> : <span className="arp-vide" />}
            <span>
              <b>{b.libelle}</b>
              <em className="arp-meta">
                {b.statut && <PastilleStatut statut={b.statut} />}
                {b.prix && <i className="arp-prix">{b.prix} HAI</i>}
                {!b.statut && !b.prix && "—"}
              </em>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ------------------------- Sélecteur de personnes ------------------------- */

function ChoixPersonnes({
  libelle, valeur, onChange,
}: {
  libelle: string;
  valeur: Personne[];
  onChange: (v: Personne[]) => void;
}) {
  const [picker, setPicker] = useState(false);
  return (
    <>
      <div className="mrow" style={{ alignItems: "center", flexWrap: "wrap" }}>
        {valeur.map((p) => (
          <span key={p.id} className="fchip">
            {p.nom}
            <button type="button" className="arp-x"
              onClick={() => onChange(valeur.filter((x) => x.id !== p.id))}
              aria-label={`Retirer ${p.nom}`}>✕</button>
          </span>
        ))}
        <button type="button" className="fadd" onClick={() => setPicker(true)}>
          + {libelle}
        </button>
      </div>
      {picker && (
        <ContactPicker
          titre={libelle} libelleValider="Rattacher"
          onAnnuler={() => setPicker(false)}
          onValider={(c) => {
            if (!valeur.some((x) => x.id === c.id)) {
              onChange([...valeur, { id: c.id, nom: c.nom, email: c.email }]);
            }
            setPicker(false);
          }}
        />
      )}
    </>
  );
}

/** Une pièce jointe affichée : le nom, un lien pour la voir, et son retrait. */
function ChipPiece({ p, onRetirer }: { p: Piece; onRetirer?: () => void }) {
  const href = p.path ? `/api/photo?s=${encodeURIComponent(p.path)}` : p.url;
  return (
    <span className="fchip arp-pj">
      <svg viewBox="0 0 24 24"><path d="m16.5 6.5-7.8 7.8a2.2 2.2 0 0 0 3.1 3.1l8.2-8.2a4 4 0 0 0-5.7-5.7L5.9 12a5.8 5.8 0 0 0 8.2 8.2l7-7" /></svg>
      {href ? <a href={href} target="_blank" rel="noreferrer">{p.nom}</a> : p.nom}
      {onRetirer && <button type="button" className="arp-x" onClick={onRetirer} aria-label={`Retirer ${p.nom}`}>✕</button>}
    </span>
  );
}

/* ------------------------------- Proposition ------------------------------ */

/**
 * Retour #333 — « soit d'envoyer le dossier si c'est pas déjà fait, soit de
 * dire qu'on a déjà envoyé tel ou tel dossier. »
 *
 * Retour #450 (MAV, 02/10) : « il faut que ce soit les mêmes e-mails qu'on
 * envoie d'habitude pour les propositions avec les mêmes objet, le lien et la
 * PJ ; je veux aussi que tu m'affiches la PJ et la possibilité d'en mettre une
 * autre ; un bouton pour ajouter un autre immeuble à la proposition, et du
 * coup ça change l'objet et le texte. » L'e-mail est celui de la
 * commercialisation (lib/bo/mail-commercialisation.ts), et il PART d'ici, de
 * la boîte de l'agent, avec les dossiers en pièces jointes — c'est le clic
 * sur « Créer et envoyer » qui l'envoie.
 */
export function ModaleProposition({
  bien, contact, onFermer,
}: {
  bien?: Bien;
  contact?: Personne;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [biens, setBiens] = useState<BienProposition[]>([]);
  /** Le choix d'un bien est ouvert : le premier, ou « un autre immeuble ». */
  const [choix, setChoix] = useState(!bien);
  const [chargement, setChargement] = useState(!!bien);
  const [gens, setGens] = useState<Personne[]>(contact ? [contact] : []);
  const [mode, setMode] = useState<"envoyer" | "deja_envoye">("envoyer");
  /* `null` = pas encore touché : l'objet et le message suivent les biens
     tant que l'agent n'y a pas mis la main (même règle que #331). */
  const [objetSaisi, setObjetSaisi] = useState<string | null>(null);
  const [messageSaisi, setMessageSaisi] = useState<string | null>(null);
  const [piecesEnPlus, setPiecesEnPlus] = useState<Piece[]>([]);
  const [piecesRetirees, setPiecesRetirees] = useState<string[]>([]);
  const [retour, setRetour] = useState<"aucun" | "interesse" | "refus">("aucun");
  const [retourTexte, setRetourTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fichier = useRef<HTMLInputElement>(null);

  const ajouterBien = (b: Bien | undefined) => {
    if (!b || biens.some((x) => x.id === b.id)) { setChoix(false); return; }
    setChoix(false);
    setChargement(true);
    setErreur(null);
    biensPourProposition([b.id])
      .then((l) => {
        setBiens((prev) => [...prev, ...l.filter((x) => !prev.some((p) => p.id === x.id))]);
        if (l.length === 0) setErreur("Cet immeuble n'a pas pu être lu.");
      })
      .catch(() => setErreur("Cet immeuble n'a pas pu être lu."))
      .finally(() => setChargement(false));
  };
  /* Le bien connu d'avance (fiche contact, fiche bien) se charge à l'ouverture. */
  const [bienInitial] = useState(bien);
  useEffect(() => {
    if (!bienInitial) return;
    let vivant = true;
    biensPourProposition([bienInitial.id])
      .then((l) => { if (vivant) setBiens(l); })
      .catch(() => { if (vivant) setErreur("Cet immeuble n'a pas pu être lu."); })
      .finally(() => { if (vivant) setChargement(false); });
    return () => { vivant = false; };
  }, [bienInitial]);

  const servi = useMemo(() => ({
    objet: biens.length ? objetCommercialisationPlusieurs(biens.map((b) => b.mail)) : "",
    message: biens.length ? messageCommercialisationPlusieurs(biens.map((b) => ({ mail: b.mail, lien: b.lien }))) : "",
  }), [biens]);
  const objet = objetSaisi ?? servi.objet;
  const message = messageSaisi ?? servi.message;

  /* Les pièces : le dossier de chaque bien, moins ceux qu'on a retirés, plus
     celles déposées à la main. */
  const pieces: Piece[] = useMemo(() => [
    ...biens.flatMap((b) => (b.piece && !piecesRetirees.includes(b.id) ? [b.piece] : [])),
    ...piecesEnPlus,
  ], [biens, piecesRetirees, piecesEnPlus]);
  const sansLien = biens.filter((b) => !b.lien);
  const sansPiece = biens.filter((b) => !b.piece);

  const deposer = (f: File | undefined) => {
    const premier = biens[0];
    if (!f || !premier) return;
    setErreur(null);
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("file", f);
        const p = await deposerPieceJointe(premier.id, fd);
        setPiecesEnPlus((l) => [...l, p]);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Dépôt impossible");
      }
    });
  };

  const pret = biens.length > 0 && gens.length > 0 && !chargement
    && (mode !== "envoyer" || (!!objet.trim() && !!message.trim()));

  const valider = () =>
    start(async () => {
      if (biens.length === 0) return;
      setErreur(null);
      const ids = biens.map((b) => b.id);
      try {
        if (mode === "envoyer") {
          const r = await creerEtEnvoyerProposition({
            immeubleIds: ids, personnes: gens.map((p) => ({ id: p.id, email: p.email })),
            objet, message, pieces,
          });
          if (r.echecs.length) {
            setBilan(`${r.crees} proposition${r.crees > 1 ? "s" : ""} créée${r.crees > 1 ? "s" : ""}, ${r.envoyes} e-mail${r.envoyes > 1 ? "s" : ""} parti${r.envoyes > 1 ? "s" : ""}. ${r.echecs.join(" ")}`);
            return;
          }
        } else {
          /* `traiterAProposer` raisonne par recherche ; ici on part des personnes.
             Une proposition sans recherche reste une proposition : c'est le bien et
             l'acquéreur qui comptent. */
          for (const p of gens) {
            await traiterAProposer("", ids, {
              mode: "deja_envoye",
              retour: retour === "aucun" ? undefined : {
                statut: retour === "refus" ? "Refusée (sans offre)" : "Intéressé",
                commentaire: retourTexte,
              },
            }, undefined, p.id);
          }
        }
        onFermer();
        router.push("/propositions");
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "L'envoi a échoué.");
      }
    });

  return (
    <Modale
      titre="Nouvelle proposition" onFermer={onFermer} className="lg" fermeDehors={false}
      pied={
        <>
          <span style={{ flex: 1 }} />
          <button className="fadd" type="button" onClick={onFermer}>{bilan ? "Fermer" : "Annuler"}</button>
          {!bilan && (
            <button className="kgo" type="button" disabled={pending || !pret}
              style={pending || !pret ? { opacity: 0.5 } : undefined} onClick={valider}>
              <span className="ch">›</span>{" "}
              {pending
                ? (mode === "envoyer" ? "Envoi…" : "Enregistrement…")
                : mode === "envoyer"
                  ? `Créer et envoyer${gens.length > 1 ? ` (${gens.length} e-mails)` : ""}`
                  : `Créer ${gens.length > 1 ? `${gens.length} propositions` : "la proposition"}`}
            </button>
          )}
        </>
      }
    >
      <span className="mlab">Immeuble{biens.length > 1 ? "s" : ""} proposé{biens.length > 1 ? "s" : ""}</span>
      {biens.length > 0 && (
        <div className="mrow" style={{ alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          {biens.map((b) => (
            <span key={b.id} className="fchip">
              {b.libelle}
              <button type="button" className="arp-x" aria-label={`Retirer ${b.libelle}`}
                onClick={() => setBiens((l) => l.filter((x) => x.id !== b.id))}>✕</button>
            </span>
          ))}
          {!choix && (
            <button type="button" className="fadd" onClick={() => setChoix(true)}>+ Ajouter un autre immeuble</button>
          )}
        </div>
      )}
      {chargement && <div className="fempty">Lecture du bien…</div>}
      {choix && (
        <>
          <ChoixBien onChoisir={ajouterBien} exclure={biens.map((b) => b.id)} />
          {biens.length > 0 && (
            <button type="button" className="fadd" style={{ marginTop: 6 }} onClick={() => setChoix(false)}>Annuler l&apos;ajout</button>
          )}
        </>
      )}

      <span className="mlab">Acquéreur(s)</span>
      <ChoixPersonnes libelle="Rattacher un acquéreur" valeur={gens} onChange={setGens} />

      <span className="mlab">Que fait-on ?</span>
      <div className="mrow">
        <button type="button" className={`mopt${mode === "envoyer" ? " on" : ""}`}
          onClick={() => setMode("envoyer")}>Envoyer le dossier</button>
        <button type="button" className={`mopt${mode === "deja_envoye" ? " on" : ""}`}
          onClick={() => setMode("deja_envoye")}>Déjà envoyé</button>
      </div>

      {mode === "envoyer" ? (
        <>
          <span className="mlab">Objet</span>
          <input className="min" value={objet} onChange={(e) => setObjetSaisi(e.target.value)} />
          <span className="mlab">Message</span>
          <textarea className="min" rows={12} value={message}
            onChange={(e) => setMessageSaisi(e.target.value)} />
          {(objetSaisi !== null || messageSaisi !== null) && (
            <div className="mrow" style={{ marginTop: 6 }}>
              <button className="fadd" type="button" onClick={() => { setObjetSaisi(null); setMessageSaisi(null); }}>
                Régénérer l&apos;objet et le message
              </button>
            </div>
          )}

          <span className="mlab">Pièce{pieces.length > 1 ? "s" : ""} jointe{pieces.length > 1 ? "s" : ""}</span>
          <div className="mrow" style={{ alignItems: "center", flexWrap: "wrap" }}>
            {biens.map((b) => b.piece && !piecesRetirees.includes(b.id) && (
              <ChipPiece key={b.id} p={b.piece} onRetirer={() => setPiecesRetirees((l) => [...l, b.id])} />
            ))}
            {piecesEnPlus.map((p) => (
              <ChipPiece key={p.path ?? p.nom} p={p} onRetirer={() => setPiecesEnPlus((l) => l.filter((x) => x !== p))} />
            ))}
            <input ref={fichier} type="file" accept="application/pdf,image/*,.xlsx,.csv" hidden
              onChange={(e) => { deposer(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" className="fadd" disabled={biens.length === 0 || pending}
              onClick={() => fichier.current?.click()}>+ Joindre une autre pièce</button>
          </div>
          {sansPiece.length > 0 && (
            <p className="rm-avert">
              Pas de dossier PDF sur {sansPiece.map((b) => b.libelle).join(", ")} : l&apos;e-mail partirait sans pièce pour ce bien.
            </p>
          )}
          {sansLien.length > 0 && (
            <p className="rm-avert">
              Pas de lien transfer.it valable sur {sansLien.map((b) => b.libelle).join(", ")} — à poser sur la fiche (Dossiers).
            </p>
          )}
          <p className="rm-aide">
            L&apos;e-mail part de votre boîte, à chaque acquéreur, avec les pièces ci-dessus. C&apos;est votre clic qui l&apos;envoie.
          </p>
        </>
      ) : (
        <>
          <span className="mlab">A-t-on eu un retour ?</span>
          <div className="mrow">
            {([["aucun", "Pas encore"], ["interesse", "Intéressé"], ["refus", "Refus"]] as const)
              .map(([k, l]) => (
                <button key={k} type="button" className={`mopt${retour === k ? " on" : ""}`}
                  onClick={() => setRetour(k)}>{l}</button>
              ))}
          </div>
          {retour !== "aucun" && (
            <>
              <span className="mlab">Ce qu&apos;il a dit</span>
              <input className="min" value={retourTexte}
                onChange={(e) => setRetourTexte(e.target.value)} />
            </>
          )}
        </>
      )}
      {erreur && <p className="rm-avert">{erreur}</p>}
      {bilan && <p className="rm-aide"><b>{bilan}</b></p>}
    </Modale>
  );
}

/* ---------------------------------- Visite -------------------------------- */

const SOURCES_VISITE = [
  "Offmarket", "Plein Bail", "SeLoger", "LeBonCoin", "Interagence",
  "Relationnel", "Prospection", "Autre",
];

export function ModaleVisite({
  bien, contact, onFermer,
}: {
  bien?: Bien;
  contact?: Personne;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [b, setB] = useState<Bien | undefined>(bien);
  const [gens, setGens] = useState<Personne[]>(contact ? [contact] : []);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [source, setSource] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [pending, start] = useTransition();

  const pret = !!b && !!date;

  return (
    <Modale
      titre="Nouvelle visite" onFermer={onFermer} fermeDehors={false}
      pied={
        <>
          <span style={{ flex: 1 }} />
          <button className="fadd" type="button" onClick={onFermer}>Annuler</button>
          <button className="kgo" type="button" disabled={pending || !pret}
            style={pending || !pret ? { opacity: 0.5 } : undefined}
            onClick={() => start(async () => {
              if (!b) return;
              await addVisite(b.id, "", {
                date,
                visiteur: gens.map((g) => g.nom).join(", ") || undefined,
                visiteurIds: gens.map((g) => g.id),
                commentaire_interne: commentaire || undefined,
                source: source || undefined,
              });
              onFermer();
              router.push("/visites");
            })}>
            <span className="ch">›</span> {pending ? "Enregistrement…" : "Programmer la visite"}
          </button>
        </>
      }
    >
      <span className="mlab">Immeuble visité</span>
      <ChoixBien valeur={b} onChoisir={setB} />

      <span className="mlab">Visiteur(s)</span>
      <ChoixPersonnes libelle="Rattacher un visiteur" valeur={gens} onChange={setGens} />
      <p className="rm-aide">
        C&apos;est le rattachement qui fait apparaître la visite sur la fiche de
        l&apos;acquéreur — un nom tapé à la main ne remonte nulle part.
      </p>

      <div className="mrow" style={{ gap: 14, flexWrap: "wrap" }}>
        <label style={{ flex: 1, minWidth: 200 }}>
          <span className="mlab">Date et heure</span>
          <input className="min" type="datetime-local" style={{ width: "100%" }}
            value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 180 }}>
          <span className="mlab">Source</span>
          <select className="min" style={{ width: "100%" }} value={source}
            onChange={(e) => setSource(e.target.value)}>
            <option value="">Non précisée</option>
            {SOURCES_VISITE.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <span className="mlab">Commentaire interne</span>
      <textarea className="min" rows={3} value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        placeholder="Ce qu'il faut savoir avant d'y aller…" />
    </Modale>
  );
}

/* ----------------------------------- Offre -------------------------------- */

/** « 12/03/2026 » depuis « 2026-03-12 ». */
const dateFr = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};
const jourLocal = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return z.toISOString().slice(0, 10);
};
const plusJours = (iso: string, jours: number) => {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + jours);
  return jourLocal(d);
};
const ecartJours = (de: string, a: string) => {
  const d1 = new Date(`${de}T12:00:00`).getTime();
  const d2 = new Date(`${a}T12:00:00`).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return undefined;
  return Math.round((d2 - d1) / 86_400_000);
};
const parseMontant = (s: string) => {
  const v = parseFloat(s.replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

/**
 * Une case de prix, comme sur le mandat : le montant qu'on tape est l'ancre,
 * les autres se déduisent (retour #446 : « le même système que pour les
 * mandats dans lesquels on rentre deux variables et ça calcule le reste »).
 */
function CaseMontant({
  label, unite, v, pilote, onChange, fort, decimal,
}: {
  label: string; unite: string; v?: number; pilote: boolean;
  onChange: (s: string) => void; fort?: boolean; decimal?: boolean;
}) {
  const [brut, setBrut] = useState<string | null>(null);
  const affiche = brut ?? (v === undefined ? "" : decimal ? String(v).replace(".", ",") : group(v));
  return (
    <label className={`mdt-cp${pilote ? " pilote" : ""}${fort ? " fort" : ""}`}>
      <span className="l">{label}{pilote && <i title="Case saisie : elle pilote les autres">saisi</i>}</span>
      <span className="in">
        <input value={affiche} inputMode="decimal" placeholder="—"
          onChange={(e) => { setBrut(e.target.value); onChange(e.target.value); }}
          onBlur={() => setBrut(null)} />
        <i>{unite}</i>
      </span>
    </label>
  );
}

export function ModaleOffre({
  bien, contact, onFermer,
}: {
  bien?: Bien;
  contact?: Personne;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [b, setB] = useState<Bien | undefined>(bien);
  const [gens, setGens] = useState<Personne[]>(contact ? [contact] : []);
  /* Net vendeur, honoraires TTC, HAI et taux, liés comme sur le mandat. Le
     taux et les honoraires n'ont ici pas de barème imposé : une offre dit ce
     qu'elle dit. */
  const [p, setP] = useState<Prix>({});
  const [pilotes, setPilotes] = useState<ChampPrix[]>([]);
  const [dateOffre, setDateOffre] = useState(() => jourLocal());
  const [validite, setValidite] = useState("");
  const [expiration, setExpiration] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [pdf, setPdf] = useState<{ nom: string; url: string } | null>(null);
  const [envoiErr, setEnvoiErr] = useState<string | null>(null);
  /* Retour #335 — « propose-moi si je veux écrire un e-mail pour l'envoyer aux
     propriétaires ». On propose, on ne présume pas : la case est décochée. */
  const [prevenir, setPrevenir] = useState(false);
  /* Retour #448 : la fenêtre d'e-mail aux propriétaires, prérédigée, qui
     s'ouvre une fois l'offre enregistrée. */
  const [mail, setMail] = useState<null | {
    agent: { id: string; nom: string; email?: string; telephone?: string };
    modeles: Awaited<ReturnType<typeof contexteRedaction>>["modeles"];
    to: string; objet: string; corps: string; titre: string;
    destinataire: ContactTrouve | null; pieces: Piece[]; immeuble: string;
  }>(null);
  const [pending, start] = useTransition();
  const fichier = useRef<HTMLInputElement>(null);

  const saisir = (cle: ChampPrix) => (v: string) => {
    const suite = [...pilotes.filter((c) => c !== cle), cle];
    setPilotes(suite);
    setP(resoudrePrix({ ...p, [cle]: parseMontant(v) }, suite));
  };
  const dernier = pilotes[pilotes.length - 1];
  const ancre = ancrePrix(pilotes);
  const pilote = (c: ChampPrix) => pilotes.length > 0 && (c === dernier || c === ancre);

  const changerValidite = (v: string) => {
    const propre = v.replace(/\D/g, "").slice(0, 3);
    setValidite(propre);
    const n = parseInt(propre, 10);
    setExpiration(Number.isFinite(n) && n > 0 ? plusJours(dateOffre, n) : "");
  };
  const changerExpiration = (v: string) => {
    setExpiration(v);
    const n = v ? ecartJours(dateOffre, v) : undefined;
    setValidite(n !== undefined && n > 0 ? String(n) : "");
  };
  const changerDate = (v: string) => {
    setDateOffre(v);
    const n = parseInt(validite, 10);
    if (Number.isFinite(n) && n > 0 && v) setExpiration(plusJours(v, n));
  };

  const pret = !!b && !!p.nv && p.nv > 0;

  const deposer = (f: File | undefined) => {
    if (!f || !b) return;
    setEnvoiErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", f);
      try {
        const url = await deposerOffrePdf(b.id, fd);
        setPdf({ nom: f.name, url });
      } catch (e) {
        setEnvoiErr(e instanceof Error ? e.message : "Dépôt impossible");
      }
    });
  };

  const enregistrer = () => start(async () => {
    if (!b || !p.nv) return;
    setEnvoiErr(null);
    try {
      await addOffre(b.id, {
        acheteur: gens.map((g) => g.nom).join(", ") || undefined,
        acheteurIds: gens.map((g) => g.id),
        prix_nv: p.nv,
        honos_ttc: p.honos,
        honos_ht: p.honos !== undefined ? Math.round(p.honos / 1.2) : undefined,
        prix_hai: p.hai,
        date: dateOffre || undefined,
        validite_jours: validite ? parseInt(validite, 10) : undefined,
        date_expiration: expiration || undefined,
        commentaire: commentaire || undefined,
        pdfUrl: pdf?.url,
      });
      if (!prevenir) { onFermer(); router.push("/offres"); return; }

      /* L'e-mail aux propriétaires : prérédigé, dans la fenêtre flottante,
         l'offre en pièce jointe. Rien ne part sans le clic sur Envoyer. */
      const [ctx, proprios] = await Promise.all([contexteRedaction(), proprietairesPourOffre(b.id)]);
      const libelle = proprios.libelle || b.libelle;
      const lignes = [
        "Bonjour,",
        "",
        `Nous avons reçu une offre d'achat pour votre immeuble ${libelle}.`,
        "",
        gens.length ? `Acquéreur : ${gens.map((g) => g.nom).join(", ")}` : "",
        `Prix net vendeur : ${group(p.nv)} €`,
        p.honos !== undefined ? `Honoraires d'agence : ${group(p.honos)} € TTC${p.hai ? `, soit ${group(p.hai)} € honoraires inclus` : ""}` : "",
        `Date de l'offre : ${dateFr(dateOffre)}${validite ? `, valable ${validite} jour${Number(validite) > 1 ? "s" : ""}${expiration ? ` (jusqu'au ${dateFr(expiration)})` : ""}` : expiration ? `, valable jusqu'au ${dateFr(expiration)}` : ""}`,
        commentaire.trim() ? `Conditions : ${commentaire.trim()}` : "",
        "",
        pdf ? "Vous trouverez l'offre en pièce jointe." : "",
        "Pouvez-vous me dire si vous souhaitez l'accepter, la refuser ou faire une contre-proposition ? Je reste à votre disposition pour en parler.",
        "",
        "Cordialement",
        "",
        ctx.agent.nom,
        "France Immeuble",
        ctx.agent.telephone ?? "",
      ].filter((l, i, a) => !(l === "" && (i === 0 || a[i - 1] === ""))).join("\n").trimEnd();
      setMail({
        agent: ctx.agent, modeles: ctx.modeles,
        to: proprios.destinataires.map((d) => d.email).filter(Boolean).join(", "),
        objet: `Offre d'achat reçue pour votre immeuble - ${libelle}`,
        corps: lignes,
        titre: `Propriétaires — ${libelle}`,
        destinataire: proprios.destinataires[0] ?? null,
        pieces: pdf ? [{ nom: pdf.nom, path: pdf.url.replace(/^storage:/, "") }] : [],
        immeuble: libelle,
      });
    } catch (e) {
      setEnvoiErr(e instanceof Error ? e.message : "L'enregistrement a échoué.");
    }
  });

  /* L'offre est enregistrée : la modale s'efface, la fenêtre d'e-mail reste. */
  if (mail) {
    return createPortal(
      <FenetreRedaction
        agent={mail.agent} modeles={mail.modeles}
        amorce={{ to: mail.to, objet: mail.objet, corps: mail.corps }}
        flottante={{ titre: mail.titre }}
        destinataire={mail.destinataire}
        immeuble={mail.immeuble}
        pieces={mail.pieces}
        onClose={() => { setMail(null); onFermer(); router.push("/offres"); }}
      />,
      document.body,
    );
  }

  return (
    <Modale
      titre="Nouvelle offre" onFermer={onFermer} fermeDehors={false} className="lg"
      pied={
        <>
          <span style={{ flex: 1 }} />
          <button className="fadd" type="button" onClick={onFermer}>Annuler</button>
          <button className="kgo" type="button" disabled={pending || !pret}
            style={pending || !pret ? { opacity: 0.5 } : undefined} onClick={enregistrer}>
            <span className="ch">›</span> {pending ? "Enregistrement…" : prevenir ? "Enregistrer et écrire aux propriétaires" : "Enregistrer l'offre"}
          </button>
        </>
      }
    >
      <span className="mlab">Immeuble concerné</span>
      {/* Retour #445 : sous mandat et déjà distribué — rien d'autre. */}
      <ChoixBien valeur={b} onChoisir={setB} pour="offre" />

      <span className="mlab">Acquéreur(s)</span>
      <ChoixPersonnes libelle="Rattacher un acquéreur" valeur={gens} onChange={setGens} />

      <span className="mlab">Le prix de l&apos;offre</span>
      <div className="mdt-prix arp-prix-bloc">
        <CaseMontant label="Net vendeur" unite="€" v={p.nv} pilote={pilote("nv")} onChange={saisir("nv")} fort />
        <span className="op">+</span>
        <CaseMontant label="Honoraires TTC" unite="€" v={p.honos} pilote={pilote("honos")} onChange={saisir("honos")} />
        <span className="op sep">soit</span>
        <CaseMontant label="Taux" unite="%" v={p.taux} pilote={pilote("taux")} onChange={saisir("taux")} decimal />
        <span className="op">=</span>
        <CaseMontant label="Prix HAI" unite="€" v={p.hai} pilote={pilote("hai")} onChange={saisir("hai")} fort />
      </div>
      <p className="rm-aide">
        Saisissez deux montants, le reste se déduit : un net vendeur et des honoraires donnent le HAI ; un HAI et un taux donnent le net vendeur. Un seul montant saisi se complète au barème.
      </p>

      <div className="mrow" style={{ gap: 14, flexWrap: "wrap" }}>
        <label style={{ flex: 1, minWidth: 150 }}>
          <span className="mlab">Date de l&apos;offre</span>
          <input className="min" type="date" style={{ width: "100%" }} value={dateOffre}
            onChange={(e) => changerDate(e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 150 }}>
          <span className="mlab">Validité (jours)</span>
          <input className="min" inputMode="numeric" style={{ width: "100%" }} value={validite} placeholder="facultatif"
            onChange={(e) => changerValidite(e.target.value)} />
        </label>
        <label style={{ flex: 1, minWidth: 170 }}>
          <span className="mlab">Valable jusqu&apos;au</span>
          <input className="min" type="date" style={{ width: "100%" }} value={expiration}
            onChange={(e) => changerExpiration(e.target.value)} />
        </label>
      </div>

      {/* Retour #335 : le PDF de l'offre se dépose ici, dans le coffre du
          bien. L'offre signée est la pièce qui compte. */}
      <span className="mlab">Offre en PDF</span>
      <div className="mrow" style={{ alignItems: "center" }}>
        <input ref={fichier} type="file" accept="application/pdf,image/*" hidden
          onChange={(e) => deposer(e.target.files?.[0])} />
        <button type="button" className="fadd" disabled={!b || pending}
          title={b ? undefined : "Choisissez d'abord l'immeuble"}
          onClick={() => fichier.current?.click()}>
          {pdf ? "Remplacer le PDF" : "+ Joindre l'offre en PDF"}
        </button>
        {pdf && <ChipPiece p={{ nom: pdf.nom, path: pdf.url.replace(/^storage:/, "") }} />}
      </div>
      {envoiErr && <p className="rm-avert">{envoiErr}</p>}

      <span className="mlab">Commentaire</span>
      <textarea className="min" rows={3} value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        placeholder="Conditions, financement, délais…" />

      <label className="arp-case">
        <input type="checkbox" checked={prevenir} onChange={() => setPrevenir(!prevenir)} />
        <span>
          <b>Écrire aux propriétaires pour leur transmettre l&apos;offre</b>
          <em>
            L&apos;offre est enregistrée, puis la fenêtre d&apos;e-mail s&apos;ouvre, prérédigée,
            {pdf ? " l'offre en pièce jointe" : " avec l'offre en pièce jointe si vous la joignez"}. Rien ne part sans vous.
          </em>
        </span>
      </label>
    </Modale>
  );
}
