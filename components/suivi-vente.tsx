"use client";

/* Suivi de la vente (MAV, 27/10, retour #549) : les jalons, les parties — dont
 * les notaires de chacun —, et les e-mails échangés avec elles, à l'envoi
 * comme à la réception. Le moteur est dans lib/bo/vente.ts ; les e-mails sont
 * cherchés à l'ouverture de la section, dans la boîte de l'agent du bien.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { ContactPicker } from "@/components/contact-picker";
import { BarreEnregistrer } from "@/components/barre-enregistrer";
import { Modale } from "@/components/modale";
import { Pastille } from "@/components/pastille";
import type { DonneesVente, Echange, LienPieces, Partie, Poste, RolePartie } from "@/lib/bo/vente";
import type { MessageComplet } from "@/lib/mails/client";
import {
  chargerEchanges, chargerVente, choisirEnCharge, choisirEntite, choisirIntervenant, enregistrerJalons, enregistrerLien,
  envoyerMailVente, ouvrirEchange, poserCivilite, retirerLien, signatureCourante,
} from "@/lib/bo/vente-actions";
import {
  destinataireInterdit, destinatairesParDefaut, mailInformationClient, mailLibre, mailMiseEnRelation, objetVente,
  PIECES_LIEN, type ModeleVente, type Signature,
} from "@/lib/vente-mail";

const LIBELLE: Record<RolePartie, string> = {
  vendeur: "Vendeur", acquereur: "Acquéreur",
  notaire_vendeur: "Notaire du vendeur", notaire_acquereur: "Notaire de l'acquéreur",
  clerc_vendeur: "Clerc du vendeur", clerc_acquereur: "Clerc de l'acquéreur",
  gestionnaire: "Gestionnaire",
};
/** Le titre de la fenêtre de choix, par poste. */
const CHOISIR: Record<Poste, string> = {
  notaire_vendeur: "Le notaire du vendeur", notaire_acquereur: "Le notaire de l'acquéreur",
  clerc_vendeur: "Le clerc du notaire du vendeur", clerc_acquereur: "Le clerc du notaire de l'acquéreur",
  gestionnaire: "Le gestionnaire de l'immeuble",
};
const jour = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : undefined);
const dateInput = (iso?: string) => (iso ? iso.slice(0, 10) : "");
const euros = (n?: number) => (n ? `${Math.round(n).toLocaleString("fr-FR")} €` : undefined);

export function SuiviVente({ immeubleId }: { immeubleId: string }) {
  const [d, setD] = useState<DonneesVente | null | undefined>(undefined);
  const [tour, setTour] = useState(0);
  useEffect(() => {
    let vivant = true;
    chargerVente(immeubleId).then((v) => { if (vivant) setD(v); }).catch(() => { if (vivant) setD(null); });
    return () => { vivant = false; };
  }, [immeubleId, tour]);
  const recharger = () => setTour((t) => t + 1);
  const [ecrire, setEcrire] = useState(false);

  if (d === undefined) return <div className="fempty">Chargement du suivi de la vente…</div>;
  if (d === null) return <div className="fempty">Le suivi de la vente n&apos;a pas pu être lu.</div>;
  if (!d.ouverte) {
    return (
      <div className="fempty">
        Le suivi de la vente s&apos;ouvre à la signature du mandat, et se complète quand une offre est acceptée.
      </div>
    );
  }
  return (
    <div className="sv2">
      <Jalons d={d} immeubleId={immeubleId} onFait={recharger} />
      <Parties d={d} immeubleId={immeubleId} onFait={recharger} />
      <Liens d={d} immeubleId={immeubleId} onFait={recharger} />
      <Echanges d={d} immeubleId={immeubleId} tour={tour} onEcrire={() => setEcrire(true)} />
      {ecrire && (
        <Ecrire d={d} immeubleId={immeubleId} onFait={recharger}
          onFermer={(envoye) => { setEcrire(false); if (envoye) recharger(); }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Les jalons */

function Jalons({ d, immeubleId, onFait }: { d: DonneesVente; immeubleId: string; onFait: () => void }) {
  const o = d.offre;
  const [compromis, setCompromis] = useState(dateInput(o?.dateCompromis));
  const [acte, setActe] = useState(dateInput(o?.dateActe));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const modifie = !!o && (compromis !== dateInput(o.dateCompromis) || acte !== dateInput(o.dateActe));
  const vendu = o?.statut === "Vendu";
  const etapes = [
    { t: "Mandat signé", fait: !!d.mandat, detail: d.mandat ? [d.mandat.numero && `n° ${d.mandat.numero}`, jour(d.mandat.signeLe)].filter(Boolean).join(" · ") : "—" },
    { t: "Offre acceptée", fait: !!o, detail: o ? [euros(o.prixHai), jour(o.date)].filter(Boolean).join(" · ") : "En attente d'une offre" },
    { t: "Compromis", fait: !!o?.dateCompromis && new Date(o.dateCompromis) <= new Date(), detail: o?.dateCompromis ? jour(o.dateCompromis) : "À programmer" },
    { t: "Acte authentique", fait: !!o?.dateActe && new Date(o.dateActe) <= new Date(), detail: o?.dateActe ? jour(o.dateActe) : "À programmer" },
    { t: "Vendu", fait: vendu, detail: vendu ? "Honoraires dus à l'acte" : "—" },
  ];
  return (
    <section>
      <h3 className="fsub">Où en est la vente</h3>
      <ol className="sv2-frise">
        {etapes.map((e, i) => (
          <li key={e.t} className={e.fait ? "fait" : etapes.slice(0, i).every((x) => x.fait) ? "cours" : undefined}>
            <b>{e.t}</b><span>{e.detail}</span>
          </li>
        ))}
      </ol>
      {o && (
        <div className="sv2-dates">
          <label>
            <span>Date du compromis</span>
            <input type="date" className="min" value={compromis} onChange={(e) => setCompromis(e.target.value)} />
          </label>
          <label>
            <span>Date de l&apos;acte authentique</span>
            <input type="date" className="min" value={acte} onChange={(e) => setActe(e.target.value)} />
          </label>
          <span className="mhint">Offre « {o.statut} »{o.acheteurNom ? ` de ${o.acheteurNom}` : ""}. Ces dates alimentent le tableau de bord et le récit de vente.</span>
          {msg && <span className="mhint">{msg}</span>}
        </div>
      )}
      {o && (
        <BarreEnregistrer modifie={modifie} pending={pending}
          onAnnuler={() => { setCompromis(dateInput(o.dateCompromis)); setActe(dateInput(o.dateActe)); }}
          onEnregistrer={() => start(async () => {
            const r = await enregistrerJalons(immeubleId, o.id, {
              dateCompromis: compromis !== dateInput(o.dateCompromis) ? compromis || null : undefined,
              dateActe: acte !== dateInput(o.dateActe) ? acte || null : undefined,
            }).catch(() => ({ ok: false, message: "Le BO n'a pas répondu." }));
            setMsg(r.message);
            if (r.ok) onFait();
          })} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------ Les parties */

function CartePartie({ p, pending, onEntite }: { p: Partie; pending?: boolean; onEntite?: (cle: string) => void }) {
  return (
    <div className="sv2-p">
      <span className="sv2-role">{LIBELLE[p.role]}</span>
      <b>{p.contactId ? <a href={`/contact/${p.contactId}`}>{p.nom}</a> : p.nom}</b>
      {/* Retour #571 : l'entité de facturation — la société qu'il engage
          (propriétaire pour le vendeur, acquéreuse pour l'acquéreur), ou
          lui-même. C'est elle que nomment les e-mails aux notaires. */}
      {p.contactId && onEntite ? (
        <label className="sv2-ent">
          <span>Entité de facturation</span>
          <select className="min" value={p.entite?.cle ?? ""} disabled={pending} onChange={(e) => onEntite(e.target.value)}>
            <option value="">En nom propre</option>
            {(p.entites ?? []).map((e) => <option key={e.cle} value={e.cle}>{e.nom}{e.fonction ? ` (${e.fonction.toLowerCase()})` : ""}</option>)}
          </select>
          {(p.entites ?? []).length === 0 && <i className="mhint">Aucune société sur sa fiche : à rattacher depuis la fiche contact.</i>}
        </label>
      ) : p.societe && p.societe !== p.nom && <span>{p.societe}</span>}
      {p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span className="mhint">Pas d&apos;e-mail : ses échanges ne peuvent pas être retrouvés.</span>}
      {p.tel && <a href={`tel:${p.tel.replace(/[^\d+]/g, "")}`}>{p.tel}</a>}
    </div>
  );
}

/**
 * Un intervenant choisi par l'agent : notaire, clerc ou gestionnaire (#568).
 * Sa civilité se règle ici — c'est elle qui fait « Bonjour Madame MARTIN » —,
 * et, entre le notaire et le clerc d'un même côté, on désigne celui qui suit
 * le dossier : il reçoit les e-mails, l'autre est en copie.
 */
function Intervenant({ poste, p, pending, peutSuivre, onChoisir, onRetirer, onSuivre, onCivilite }: {
  poste: Poste;
  p?: Partie;
  pending: boolean;
  /** Le bouton « Suit le dossier » : seulement quand l'autre existe aussi. */
  peutSuivre: boolean;
  onChoisir: () => void;
  onRetirer: () => void;
  onSuivre: () => void;
  onCivilite: (c: string) => void;
}) {
  const libelle = LIBELLE[poste];
  if (!p) {
    return (
      <div className="sv2-p vide">
        <span className="sv2-role">{libelle}</span>
        <button type="button" className="fadd" disabled={pending} onClick={onChoisir}>
          + {poste.startsWith("clerc") ? "Ajouter le clerc" : poste === "gestionnaire" ? "Ajouter un gestionnaire" : "Choisir le notaire"}
        </button>
      </div>
    );
  }
  return (
    <div className={`sv2-p${p.enCharge && peutSuivre ? " charge" : ""}`}>
      <span className="sv2-role">
        {libelle}
        {p.enCharge && peutSuivre && <Pastille ton="orange">Suit le dossier</Pastille>}
      </span>
      <span className="sv2-nom">
        {p.contactId && (
          <select className="sv2-civ" value={p.civilite ?? ""} disabled={pending} aria-label="Civilité"
            onChange={(e) => onCivilite(e.target.value)}>
            <option value="">Civilité</option>
            <option value="Madame">Madame</option>
            <option value="Monsieur">Monsieur</option>
          </select>
        )}
        <b>{p.contactId ? <a href={`/contact/${p.contactId}`}>{p.nom}</a> : p.nom}</b>
      </span>
      {p.societe && p.societe !== p.nom && <span>{p.societe}</span>}
      {p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span className="mhint">Pas d&apos;e-mail sur sa fiche : il ne recevra rien.</span>}
      {p.tel && <a href={`tel:${p.tel.replace(/[^\d+]/g, "")}`}>{p.tel}</a>}
      <span className="sv2-act">
        {peutSuivre && !p.enCharge && (
          <button type="button" className="fadd" disabled={pending} onClick={onSuivre}>Suit le dossier</button>
        )}
        <button type="button" className="fadd" disabled={pending} onClick={onChoisir}>Changer</button>
        <button type="button" className="fadd" disabled={pending} onClick={onRetirer}>Retirer</button>
      </span>
    </div>
  );
}

function Parties({ d, immeubleId, onFait }: { d: DonneesVente; immeubleId: string; onFait: () => void }) {
  const [choix, setChoix] = useState<Poste | null>(null);
  const [pending, start] = useTransition();
  const de = (r: RolePartie) => d.parties.filter((p) => p.role === r);
  const geste = (f: () => Promise<unknown>) => start(async () => { await f(); onFait(); });
  const intervenant = (poste: Poste) => {
    const p = de(poste)[0];
    const cote = poste.endsWith("vendeur") ? "vendeur" : "acquereur";
    const autre = poste.startsWith("notaire") ? de(`clerc_${cote}`)[0] : de(`notaire_${cote}`)[0];
    return (
      <Intervenant key={poste} poste={poste} p={p} pending={pending}
        peutSuivre={poste !== "gestionnaire" && !!autre}
        onChoisir={() => setChoix(poste)}
        onRetirer={() => geste(() => choisirIntervenant(immeubleId, poste, null))}
        onSuivre={() => geste(() => choisirEnCharge(immeubleId, cote, poste.startsWith("clerc") ? "clerc" : "notaire"))}
        onCivilite={(c) => p?.contactId && geste(() => poserCivilite(p.contactId!, c))} />
    );
  };
  return (
    <section>
      <h3 className="fsub">Les parties</h3>
      <div className="sv2-parties">
        <div className="sv2-col">
          {de("vendeur").length ? de("vendeur").map((p, i) => <CartePartie key={`v${i}`} p={p} pending={pending} onEntite={(cle) => geste(() => choisirEntite(immeubleId, p.contactId!, cle))} />)
            : <div className="sv2-p vide"><span className="sv2-role">Vendeur</span><span className="mhint">Aucun propriétaire sur la fiche.</span></div>}
          {intervenant("notaire_vendeur")}
          {intervenant("clerc_vendeur")}
        </div>
        <div className="sv2-col">
          {de("acquereur").length ? de("acquereur").map((p, i) => <CartePartie key={`a${i}`} p={p} pending={pending} onEntite={(cle) => geste(() => choisirEntite(immeubleId, p.contactId!, cle))} />)
            : <div className="sv2-p vide"><span className="sv2-role">Acquéreur</span><span className="mhint">Il apparaît dès qu&apos;une offre est acceptée.</span></div>}
          {intervenant("notaire_acquereur")}
          {intervenant("clerc_acquereur")}
        </div>
      </div>
      {/* Retour #570 : le gestionnaire, une partie de plus quand il y en a un. */}
      <div className="sv2-gest">{intervenant("gestionnaire")}</div>
      {choix && (
        <ContactPicker
          titre={CHOISIR[choix]}
          libelleValider="Choisir ce contact"
          valeurActuelle={de(choix)[0]?.nom}
          onAnnuler={() => setChoix(null)}
          onValider={(c) => start(async () => {
            await choisirIntervenant(immeubleId, choix, c.id);
            setChoix(null);
            onFait();
          })}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------- Les liens de pièces */

/** Les cases d'un lien : la liste type, plus ce qu'on y a ajouté à la main. */
function CasesPieces({ pieces, onChange }: { pieces: string[]; onChange: (p: string[]) => void }) {
  const [autre, setAutre] = useState("");
  const toutes = [...PIECES_LIEN, ...pieces.filter((x) => !PIECES_LIEN.includes(x))];
  const basculer = (x: string) => onChange(pieces.includes(x) ? pieces.filter((y) => y !== x) : [...pieces, x]);
  return (
    <div className="sv2-cases">
      {toutes.map((x) => (
        <label key={x} className="sv2-case">
          <input type="checkbox" checked={pieces.includes(x)} onChange={() => basculer(x)} /> {x}
        </label>
      ))}
      <span className="sv2-autre">
        <input className="min" placeholder="Autre pièce…" value={autre} onChange={(e) => setAutre(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && autre.trim()) { e.preventDefault(); onChange([...pieces, autre.trim()]); setAutre(""); } }} />
        <button type="button" className="fadd" disabled={!autre.trim()}
          onClick={() => { onChange([...pieces, autre.trim()]); setAutre(""); }}>Ajouter</button>
      </span>
    </div>
  );
}

function NouveauLien({ immeubleId, onFait, onAnnuler }: {
  immeubleId: string; onFait: (l: LienPieces) => void; onAnnuler: () => void;
}) {
  const [url, setUrl] = useState("");
  const [pieces, setPieces] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="sv2-nl">
      <input className="min" placeholder="https://… (le lien de partage des pièces)" value={url} onChange={(e) => setUrl(e.target.value)} />
      <span className="mhint">Cochez ce que contient ce lien : la liste partira dans l&apos;e-mail.</span>
      <CasesPieces pieces={pieces} onChange={setPieces} />
      {msg && <span className="dif-avis">{msg}</span>}
      <span className="sv2-act">
        <button type="button" className="fadd" onClick={onAnnuler}>Annuler</button>
        <button type="button" className="vf-go" disabled={pending || !url.trim() || pieces.length === 0}
          onClick={() => start(async () => {
            const r = await enregistrerLien(immeubleId, { url, pieces })
              .catch(() => ({ ok: false, message: "Le BO n'a pas répondu.", lien: undefined }));
            if (!r.ok || !r.lien) { setMsg(r.message); return; }
            onFait(r.lien);
          })}>
          <span className="ch">›</span> Enregistrer le lien
        </button>
      </span>
    </div>
  );
}

/**
 * Retour #570 : « j'aimerais que dans chaque lien je puisse cocher les éléments
 * que j'ai mis dedans. Je peux faire plusieurs liens au fur et à mesure. »
 */
function Liens({ d, immeubleId, onFait }: { d: DonneesVente; immeubleId: string; onFait: () => void }) {
  const [nouveau, setNouveau] = useState(false);
  const [pending, start] = useTransition();
  return (
    <section>
      <div className="sv2-eh">
        <h3 className="fsub">Les liens de pièces</h3>
        <span style={{ flex: 1 }} />
        {!nouveau && <button type="button" className="fadd" onClick={() => setNouveau(true)}>+ Nouveau lien</button>}
      </div>
      {nouveau && (
        <NouveauLien immeubleId={immeubleId} onAnnuler={() => setNouveau(false)}
          onFait={() => { setNouveau(false); onFait(); }} />
      )}
      {d.liens.length === 0 && !nouveau ? (
        <p className="mhint">Aucun lien envoyé pour l&apos;instant. Chaque lien garde la liste de ce qu&apos;il contient.</p>
      ) : (
        <div className="sv2-liens">
          {[...d.liens].reverse().map((l) => (
            <div key={l.id} className="sv2-lien">
              <span className="sv2-dt">{jour(l.date)}</span>
              <a href={l.url} target="_blank" rel="noreferrer">{l.url}</a>
              <span className="sv2-avec">{l.pieces.map((x) => <Pastille key={x} ton="gris">{x}</Pastille>)}</span>
              <button type="button" className="fadd" disabled={pending}
                onClick={() => start(async () => { await retirerLien(immeubleId, l.id); onFait(); })}>Retirer</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- Écrire */

/** Les modèles de la fenêtre, dans l'ordre où ils servent. */
const MODELES: [ModeleVente, string][] = [
  ["notaires", "Mise en relation · notaires"],
  ["client_vendeur", "Information du vendeur"],
  ["client_acquereur", "Information de l'acquéreur"],
  ["libre", "Message libre"],
];

/**
 * La fenêtre « Écrire » (#568, #570). L'objet est toujours « VENTE VENDEUR /
 * ACQUÉREUR », la formule d'appel suit les destinataires (« Bonjour Maître… »),
 * et le premier e-mail aux notaires se rédige seul. Rien ne part sans le clic
 * sur « Envoyer » : l'agent relit, corrige, et envoie de sa boîte.
 */
function Ecrire({ d, immeubleId, onFait, onFermer }: {
  d: DonneesVente; immeubleId: string; onFait: () => void; onFermer: (envoye: boolean) => void;
}) {
  const [modele, setModele] = useState<ModeleVente>("notaires");
  const [choix, setChoix] = useState<Record<string, "a" | "cc" | "">>(() => destinatairesParDefaut(d, "notaires"));
  const [lienId, setLienId] = useState(d.liens[d.liens.length - 1]?.id ?? "");
  const [nouveauLien, setNouveauLien] = useState(false);
  const [objet, setObjet] = useState(() => objetVente(d));
  const [corpsEcrit, setCorpsEcrit] = useState<string | null>(null);
  const [sig, setSig] = useState<Signature>({ nom: "" });
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let vivant = true;
    signatureCourante(immeubleId).then((x) => { if (vivant) setSig(x); }).catch(() => undefined);
    return () => { vivant = false; };
  }, [immeubleId]);

  const avecEmail = d.parties.filter((p) => p.email);
  const a = avecEmail.filter((p) => choix[p.email!] === "a");
  const lien = d.liens.find((l) => l.id === lienId);
  /* Recalculé à chaque rendu — c'est du texte — tant que l'agent n'a pas
     retouché le message ; « Reprendre le modèle » y revient. */
  const auto = modele === "notaires" ? mailMiseEnRelation(d, a, sig, lien)
    : modele === "libre" ? mailLibre(a, sig, lien)
    : mailInformationClient(d, modele === "client_vendeur" ? "vendeur" : "acquereur", a, sig, lien);
  /* Le garde-fou de confidentialité (#571), vérifié avant d'envoyer. */
  const interdits = avecEmail
    .filter((p) => choix[p.email!] === "a" || choix[p.email!] === "cc")
    .map((p) => ({ p, raison: destinataireInterdit(modele, p) }))
    .filter((x) => x.raison);
  const corps = corpsEcrit ?? auto;
  const sansEmail = d.parties.filter((p) => !p.email && p.role !== "vendeur" && p.role !== "acquereur");

  const envoyer = () => start(async () => {
    setMsg(null);
    const r = await envoyerMailVente(immeubleId, {
      a: a.map((p) => p.email!),
      cc: avecEmail.filter((p) => choix[p.email!] === "cc").map((p) => p.email!),
      objet, corps, modele,
    }).catch(() => ({ ok: false, message: "Le BO n'a pas répondu." }));
    setMsg({ ok: r.ok, texte: r.message });
    if (r.ok) setTimeout(() => onFermer(true), 1200);
  });

  return (
    <Modale titre="Écrire aux parties de la vente" largeur={820} onFermer={() => onFermer(false)} fermeDehors={false}
      pied={(
        <>
          <button type="button" className="vf-annuler" onClick={() => onFermer(false)}>Annuler</button>
          <span style={{ flex: 1 }} />
          {msg && <span className={msg.ok ? "mhint" : "dif-avis"}>{msg.texte}</span>}
          <button type="button" className="vf-go" disabled={pending || a.length === 0 || interdits.length > 0 || !objet.trim() || !corps.trim()} onClick={envoyer}>
            <span className="ch">›</span> {pending ? "Envoi…" : "Envoyer"}
          </button>
        </>
      )}>
      <div className="sv2-ecr">
        <div className="seg sv2-modeles">
          {MODELES.map(([k, l]) => (
            <button key={k} type="button" className={modele === k ? "on" : undefined}
              onClick={() => { setModele(k); setChoix(destinatairesParDefaut(d, k)); setCorpsEcrit(null); }}>{l}</button>
          ))}
        </div>
        {modele === "notaires" && (
          <span className="mhint">
            Version complète : coordonnées de tous les clients, prix, honoraires et lien vers les pièces. Réservée aux notaires et aux clercs ;
            chaque client reçoit ensuite sa version courte.
          </span>
        )}

        <div className="sv2-dest">
          <span className="sv2-lbl">Destinataires</span>
          {avecEmail.map((p) => (
            <label key={p.email} className="sv2-d">
              <select className="min" value={choix[p.email!] ?? ""}
                onChange={(e) => setChoix({ ...choix, [p.email!]: e.target.value as "a" | "cc" | "" })}>
                <option value="">—</option>
                <option value="a">À</option>
                <option value="cc">Cc</option>
              </select>
              <Pastille ton={p.role.startsWith("notaire") || p.role.startsWith("clerc") ? "bleu" : "gris"}>{LIBELLE[p.role]}</Pastille>
              <b>{p.nom}</b>
              <i>{p.email}</i>
            </label>
          ))}
          {interdits.map(({ p, raison }) => (
            <span key={p.email} className="dif-avis">{p.nom} : {raison}.</span>
          ))}
          {sansEmail.length > 0 && (
            <span className="mhint">Sans adresse e-mail : {sansEmail.map((p) => p.nom).join(", ")}.</span>
          )}
        </div>

        <div className="sv2-lienc">
          <span className="sv2-lbl">Lien de pièces</span>
          <select className="min" value={lienId} onChange={(e) => setLienId(e.target.value)}>
            <option value="">Aucun lien dans ce message</option>
            {[...d.liens].reverse().map((l) => (
              <option key={l.id} value={l.id}>{jour(l.date)} · {l.pieces.length} pièce{l.pieces.length > 1 ? "s" : ""} · {l.url}</option>
            ))}
          </select>
          {!nouveauLien && <button type="button" className="fadd" onClick={() => setNouveauLien(true)}>+ Nouveau lien</button>}
        </div>
        {nouveauLien && (
          <NouveauLien immeubleId={immeubleId} onAnnuler={() => setNouveauLien(false)}
            onFait={(l) => { setNouveauLien(false); setLienId(l.id); onFait(); }} />
        )}

        <label className="sv2-champ">
          <span className="sv2-lbl">Objet</span>
          <input className="min" value={objet} onChange={(e) => setObjet(e.target.value)} />
        </label>
        <label className="sv2-champ">
          <span className="sv2-lbl">
            Message
            {corpsEcrit !== null && (
              <button type="button" className="fadd" onClick={() => setCorpsEcrit(null)}>Reprendre le modèle</button>
            )}
          </span>
          <textarea className="min sv2-corps-ecr" rows={18} value={corps} onChange={(e) => setCorpsEcrit(e.target.value)} />
        </label>
        <span className="mhint">
          Le message part de votre boîte e-mail, avec sa copie dans « Envoyés ». Relisez-le : rien ne part avant « Envoyer ».
        </span>
      </div>
    </Modale>
  );
}

/* ------------------------------------------------------------ Les échanges */

type FiltreEch = "tous" | "notaires" | "vendeurs" | "acquereurs";

function Echanges({ d, immeubleId, tour: tourVente, onEcrire }: {
  d: DonneesVente; immeubleId: string; tour: number; onEcrire: () => void;
}) {
  const [r, setR] = useState<Awaited<ReturnType<typeof chargerEchanges>> | null>(null);
  const [filtre, setFiltre] = useState<FiltreEch>("tous");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageComplet | { erreur: string } | null>(null);
  const [tour, setTour] = useState(0);
  const cles = d.parties.map((p) => p.email).filter(Boolean).join(",");
  useEffect(() => {
    let vivant = true;
    chargerEchanges(immeubleId)
      .then((x) => { if (vivant) setR(x); })
      .catch(() => { if (vivant) setR({ ok: false, erreur: "Le BO n'a pas répondu." }); });
    return () => { vivant = false; };
  }, [immeubleId, cles, tour, tourVente]);

  const liste = useMemo(() => {
    if (!r?.ok) return [];
    return r.echanges.filter((e) => filtre === "tous" || e.avec.some((a) =>
      filtre === "notaires" ? a.role.startsWith("notaire") || a.role.startsWith("clerc")
        : filtre === "vendeurs" ? a.role === "vendeur" : a.role === "acquereur"));
  }, [r, filtre]);

  const ouvrir = (e: Echange) => {
    const k = `${e.dossier}:${e.uid}`;
    if (ouvert === k) { setOuvert(null); return; }
    setOuvert(k); setMessage(null);
    ouvrirEchange(immeubleId, e.dossier, e.uid)
      .then((x) => setMessage(x.ok ? x.message : { erreur: x.erreur }))
      .catch(() => setMessage({ erreur: "Le BO n'a pas répondu." }));
  };

  const sansEmail = d.parties.filter((p) => !p.email);
  return (
    <section>
      <div className="sv2-eh">
        <h3 className="fsub">Les échanges</h3>
        <span className="sp" style={{ flex: 1 }} />
        <div className="seg">
          {([["tous", "Tous"], ["notaires", "Notaires"], ["vendeurs", "Vendeurs"], ["acquereurs", "Acquéreurs"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={filtre === k ? "on" : undefined} onClick={() => setFiltre(k)}>{l}</button>
          ))}
        </div>
        <button type="button" className="fadd" onClick={() => { setR(null); setTour((t) => t + 1); }}>Actualiser</button>
        <button type="button" className="vf-go sv2-ecrire" onClick={onEcrire}><span className="ch">›</span> Écrire</button>
      </div>
      <p className="mhint">
        Les e-mails reçus de ces adresses et ceux qui leur ont été envoyés, depuis la signature du mandat
        {r?.ok && r.boite ? <>, dans la boîte <b>{r.boite}</b></> : ""}.
        {sansEmail.length > 0 && ` ${sansEmail.map((p) => p.nom).join(", ")} : pas d'adresse, rien à chercher.`}
      </p>
      {!r ? <div className="fempty">Recherche dans la boîte e-mail…</div>
        : !r.ok ? <div className="dif-avis">{r.erreur}</div>
        : liste.length === 0 ? <div className="fempty">Aucun échange trouvé avec ces adresses.</div>
        : (
          <div className="sv2-ech">
            {liste.map((e) => {
              const k = `${e.dossier}:${e.uid}`;
              return (
                <div key={k} className={`sv2-m${ouvert === k ? " on" : ""}`}>
                  <button type="button" className="sv2-ml" onClick={() => ouvrir(e)}>
                    <span className={`sv2-dir ${e.dossier}`} title={e.dossier === "reception" ? "Reçu" : "Envoyé"}>
                      {e.dossier === "reception" ? "↙" : "↗"}
                    </span>
                    <span className="sv2-dt">{jour(e.date)}</span>
                    <span className="sv2-avec">
                      {e.avec.map((a) => <Pastille key={a.role + a.nom} ton={a.role.startsWith("notaire") || a.role.startsWith("clerc") ? "bleu" : "gris"}>{LIBELLE[a.role]}</Pastille>)}
                    </span>
                    <span className="sv2-obj"><b>{e.objet}</b><i>{e.extrait}</i></span>
                    {e.pj > 0 && <span className="sv2-pj" title={`${e.pj} pièce${e.pj > 1 ? "s" : ""} jointe${e.pj > 1 ? "s" : ""}`}>📎 {e.pj}</span>}
                  </button>
                  {ouvert === k && (
                    <div className="sv2-corps">
                      {!message ? <span className="mhint">Ouverture…</span>
                        : "erreur" in message ? <span className="dif-avis">{message.erreur}</span>
                        : (
                          <>
                            <span className="mhint">
                              De {message.deNom ? `${message.deNom} <${message.de}>` : message.de} · à {message.pour.join(", ")}
                            </span>
                            <pre>{message.corps}</pre>
                            {message.pieces.length > 0 && (
                              <span className="mhint">Pièces jointes : {message.pieces.map((p) => p.nom).join(", ")} — à ouvrir depuis Mails.</span>
                            )}
                          </>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </section>
  );
}
