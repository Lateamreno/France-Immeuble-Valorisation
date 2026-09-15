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
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ContactPicker } from "@/components/contact-picker";
import {
  addOffre, addVisite, chercherImmeubles, deposerOffrePdf, traiterAProposer,
  type ImmeubleTrouve,
} from "@/lib/bo/actions";

type Bien = { id: string; libelle: string };
type Personne = { id: string; nom: string; email?: string };

/* ------------------------------- Sélecteur de bien ------------------------ */

function ChoixBien({
  valeur, onChoisir,
}: {
  valeur?: Bien;
  onChoisir: (b: Bien | undefined) => void;
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
      start(async () => { setListe(await chercherImmeubles(q).catch(() => [])); });
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, ouvert]);

  if (valeur && !ouvert) {
    return (
      <div className="mrow" style={{ alignItems: "center" }}>
        <span className="fchip">{valeur.libelle}</span>
        <button type="button" className="fadd" onClick={() => setOuvert(true)}>Changer de bien</button>
      </div>
    );
  }

  return (
    <>
      <div className="lst-search" style={{ maxWidth: "none" }}>
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
        <input autoFocus placeholder="Ville, rue, numéro…" value={q}
          onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="arp-biens">
        {pending && liste.length === 0 && <div className="fempty">Recherche…</div>}
        {!pending && liste.length === 0 && (
          <div className="fempty">Aucun immeuble ne correspond.</div>
        )}
        {liste.map((b) => (
          <button key={b.id} type="button" className="arp-bien"
            onClick={() => { onChoisir({ id: b.id, libelle: b.libelle }); setOuvert(false); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {b.photoUrl ? <img src={b.photoUrl} alt="" /> : <span className="arp-vide" />}
            <span>
              <b>{b.libelle}</b>
              <em>{[b.statut, b.prix].filter(Boolean).join(" · ") || "—"}</em>
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

/* ------------------------------- Proposition ------------------------------ */

/**
 * Retour #333 — « soit d'envoyer le dossier si c'est pas déjà fait, soit de
 * dire qu'on a déjà envoyé tel ou tel dossier. »
 *
 * L'écriture passe par `traiterAProposer`, la même que le panneau des biens à
 * proposer (#331) : une proposition créée d'ici doit être indiscernable d'une
 * proposition créée là-bas.
 */
export function ModaleProposition({
  bien, contact, onFermer,
}: {
  bien?: Bien;
  contact?: Personne;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [b, setB] = useState<Bien | undefined>(bien);
  const [gens, setGens] = useState<Personne[]>(contact ? [contact] : []);
  const [mode, setMode] = useState<"envoyer" | "deja_envoye">("envoyer");
  const [objet, setObjet] = useState("");
  const [message, setMessage] = useState("");
  const [retour, setRetour] = useState<"aucun" | "interesse" | "refus">("aucun");
  const [retourTexte, setRetourTexte] = useState("");
  const [pending, start] = useTransition();

  /* Le message se rédige dès qu'on sait de quoi on parle et à qui. */
  const servi = b
    ? {
        objet: `Immeuble à vendre — ${b.libelle}`,
        message:
          `${gens.length === 1 ? `Bonjour ${gens[0].nom},` : "Bonjour,"}\n\n` +
          `Je vous adresse un immeuble qui correspond à votre recherche : ${b.libelle}.\n\n` +
          `Le dossier complet est en pièce jointe. Je reste à votre disposition pour ` +
          `organiser une visite.\n\nBien à vous,`,
      }
    : { objet: "", message: "" };
  const objetFinal = objet || servi.objet;
  const messageFinal = message || servi.message;

  const pret = !!b && gens.length > 0;

  const valider = () =>
    start(async () => {
      if (!b) return;
      /* `traiterAProposer` raisonne par recherche ; ici on part des personnes.
         Une proposition sans recherche reste une proposition : c'est le bien et
         l'acquéreur qui comptent. */
      for (const p of gens) {
        await traiterAProposer("", [b.id],
          mode === "envoyer"
            ? { mode: "envoyer", objet: objetFinal, message: messageFinal, email: p.email }
            : {
                mode: "deja_envoye",
                retour: retour === "aucun" ? undefined : {
                  statut: retour === "refus" ? "Refusée (sans offre)" : "Intéressé",
                  commentaire: retourTexte,
                },
              },
          undefined, p.id);
      }
      onFermer();
      router.push("/propositions");
    });

  return (
    <div className="modal-ov">
      <div className="modal lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Nouvelle proposition<button type="button" onClick={onFermer}>✕</button></div>
        <div className="modal-b">
          <span className="mlab">Immeuble proposé</span>
          <ChoixBien valeur={b} onChoisir={setB} />

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
              <input className="min" value={objetFinal} onChange={(e) => setObjet(e.target.value)} />
              <span className="mlab">Message</span>
              <textarea className="min" rows={8} value={messageFinal}
                onChange={(e) => setMessage(e.target.value)} />
              <p className="rm-aide">
                Le dernier dossier du bien part en pièce jointe. Rien n&apos;est envoyé
                d&apos;ici : la proposition est préparée, vous l&apos;envoyez.
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
        </div>
        <div className="modal-f">
          <span style={{ flex: 1 }} />
          <button className="fadd" type="button" onClick={onFermer}>Annuler</button>
          <button className="kgo" type="button" disabled={pending || !pret}
            style={pending || !pret ? { opacity: 0.5 } : undefined} onClick={valider}>
            <span className="ch">›</span>{" "}
            {pending ? "Enregistrement…" : `Créer ${gens.length > 1 ? `${gens.length} propositions` : "la proposition"}`}
          </button>
        </div>
      </div>
    </div>
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
    <div className="modal-ov">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Nouvelle visite<button type="button" onClick={onFermer}>✕</button></div>
        <div className="modal-b">
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
        </div>
        <div className="modal-f">
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
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------- Offre -------------------------------- */

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
  const [prix, setPrix] = useState("");
  const [honos, setHonos] = useState("");
  const [expiration, setExpiration] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [pdf, setPdf] = useState<{ nom: string; url: string } | null>(null);
  const [envoiErr, setEnvoiErr] = useState<string | null>(null);
  /* Retour #335 — « propose-moi si je veux écrire un e-mail pour l'envoyer aux
     propriétaires ». On propose, on ne présume pas : la case est décochée. */
  const [prevenir, setPrevenir] = useState(false);
  const [pending, start] = useTransition();
  const fichier = useRef<HTMLInputElement>(null);

  const num = (s: string) => {
    const v = parseFloat(s.replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(v) ? v : undefined;
  };
  const prixN = num(prix);
  const pret = !!b && prixN !== undefined && prixN > 0;

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

  return (
    <div className="modal-ov">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Nouvelle offre<button type="button" onClick={onFermer}>✕</button></div>
        <div className="modal-b">
          <span className="mlab">Immeuble concerné</span>
          <ChoixBien valeur={b} onChoisir={setB} />

          <span className="mlab">Acquéreur(s)</span>
          <ChoixPersonnes libelle="Rattacher un acquéreur" valeur={gens} onChange={setGens} />

          <div className="mrow" style={{ gap: 14, flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: 160 }}>
              <span className="mlab">Prix net vendeur</span>
              <input className="min" style={{ width: "100%" }} value={prix}
                onChange={(e) => setPrix(e.target.value)} placeholder="€" />
            </label>
            <label style={{ flex: 1, minWidth: 160 }}>
              <span className="mlab">Honoraires HT</span>
              <input className="min" style={{ width: "100%" }} value={honos}
                onChange={(e) => setHonos(e.target.value)} placeholder="€" />
            </label>
            <label style={{ flex: 1, minWidth: 180 }}>
              <span className="mlab">Validité de l&apos;offre</span>
              <input className="min" type="date" style={{ width: "100%" }} value={expiration}
                onChange={(e) => setExpiration(e.target.value)} />
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
            {pdf && <span className="fchip">{pdf.nom}</span>}
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
                L&apos;offre est enregistrée, puis l&apos;écran de rédaction s&apos;ouvre sur la
                fiche du bien. Rien ne part sans vous.
              </em>
            </span>
          </label>
        </div>
        <div className="modal-f">
          <span style={{ flex: 1 }} />
          <button className="fadd" type="button" onClick={onFermer}>Annuler</button>
          <button className="kgo" type="button" disabled={pending || !pret}
            style={pending || !pret ? { opacity: 0.5 } : undefined}
            onClick={() => start(async () => {
              if (!b || prixN === undefined) return;
              await addOffre(b.id, {
                acheteur: gens.map((g) => g.nom).join(", ") || undefined,
                acheteurIds: gens.map((g) => g.id),
                prix_nv: prixN,
                honos_ht: num(honos),
                date_expiration: expiration || undefined,
                commentaire: commentaire || undefined,
                pdfUrl: pdf?.url,
              });
              onFermer();
              router.push(prevenir ? `/bien/${b.id}?ecran=proprietaire&offre=1` : "/offres");
            })}>
            <span className="ch">›</span> {pending ? "Enregistrement…" : "Enregistrer l'offre"}
          </button>
        </div>
      </div>
    </div>
  );
}
