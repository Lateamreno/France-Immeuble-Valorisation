"use client";

/* Fiche contact — reprise du BO (retour #119).
 *
 * Trois zones, dans cet ordre : un en-tête collé qui répond à « qui est-ce et
 * comment je le joins », une barre d'onglets chiffrée collée sous lui, puis le
 * contenu. Les onglets autres qu'Informations reprennent la carte de l'écran
 * correspondant : une recherche vue depuis la fiche est la même carte que sur
 * l'écran Recherches. */

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copier } from "@/components/copier";
import type { ContactData, FilMail, PropositionLigne, RechercheCard } from "@/lib/bubble/server";
import { dmy, jourIso } from "@/lib/format";
import { EchangesContact } from "@/components/mails";
import { CarteRecherche, ModaleRecherche } from "@/components/carte-recherche";
import { ModaleRechercheEdition, type DepartRecherche } from "@/components/recherche-modale";
import { ModaleOffre, ModaleProposition, ModaleVisite } from "@/components/actions-rapides";
import { ModaleApresRefus } from "@/components/proposition-refus";
import { VignetteContact, type VignetteData } from "@/components/vignette-contact";
import {
  archiverContact, noterProposition, retirerPieceContact, setPropositionStatut, updateContact,
} from "@/lib/bo/actions";
import {
  departRecherche, departRechercheDeProposition, envoyerRelances, marquerRelances, relanceEnvoiPossible,
} from "@/lib/bo/relances-actions";
import {
  JOURS_RELANCE, joursDepuis, messageRelance, objetRelance, type ClientRelance, type ImmeubleRelance,
} from "@/lib/bo/relances";
import { desactiverCompteClient, ouvrirCompteClient } from "@/lib/bo/comptes-bo";
import {
  CIVILITES, MOTIFS_ARCHIVAGE, NOTES_CONTACT, PROFILS_CONTACT, rangNote,
  SOURCES_CONTACT as SOURCES,
} from "@/lib/referentiels";

import type { CompteVu } from "@/lib/bo/comptes-bo";
import { useDepartUrl, useMemoireUrl } from "@/lib/etat-url";

/* Les onglets que l'adresse a le droit de rouvrir — dans l'ordre de la barre. */
const ONGLETS: readonly string[] = [
  "infos", "immeubles", "recherches", "mandats", "propositions",
  "questions", "visites", "offres", "suivis", "echanges",
];

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Une adresse Bubble est un objet `{address, lat, lng}` : la passer à String
 *  affichait « [object Object] » dans la case Adresse. */
const geo = (v: unknown) => {
  if (v && typeof v === "object" && "address" in v) return S((v as { address?: unknown }).address);
  return S(v);
};
/** On réécrit l'objet, pas une chaîne, pour ne pas casser la forme du champ. */
const versGeo = (t: string) => (t.trim() ? { address: t.trim() } : undefined);

/* --- Les sociétés du contact (retours #200 et #228) --- */

/* Une société de la fiche porte aussi, depuis le 21/09, la holding qui la
   représente et son Kbis : ce sont les mandats qui les y déposent, la fiche
   les montre et surtout ne les perd pas quand on la réenregistre. */
type Soc = {
  nom?: string; siren?: string; rcs?: string; capital?: number; siege?: string;
  representante?: { nom?: string; siren?: string; rcs?: string; capital?: number; siege?: string };
  kbis?: string; kbisLe?: string;
};

/** Le SIREN identifie une société ; à défaut son nom réduit à ses lettres et
 *  ses chiffres, « SCI DU PARC » et « S.C.I. du Parc » étant la même. */
const cleSociete = (s: Soc) =>
  (s.siren ?? "").replace(/\D/g, "") || (s.nom ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Range une société dans la liste : elle complète celle qu'on connaît déjà,
 *  ou s'ajoute. Les valeurs fournies l'emportent — c'est la saisie du jour. */
const fusionnerSociete = (liste: Soc[], s: Soc): Soc[] => {
  const k = cleSociete(s);
  if (!s.nom || !k) return liste;
  const i = liste.findIndex((v) => cleSociete(v) === k);
  if (i < 0) return [...liste, s];
  const out = [...liste];
  out[i] = {
    ...out[i],
    nom: s.nom || out[i].nom,
    siren: s.siren || out[i].siren,
    rcs: s.rcs || out[i].rcs,
    capital: s.capital ?? out[i].capital,
    siege: s.siege || out[i].siege,
  };
  return out;
};

/**
 * L'adresse à laquelle on ouvre une pièce jointe.
 *
 * Retour #289 — « quand je clique pour voir la CNI et le Kbis je n'y arrive
 * pas, je tombe sur une page noire. » Le relais était appelé sur une valeur
 * qui était DÉJÀ une adresse de relais : les pièces déposées depuis le mandat
 * sont rangées au coffre et enregistrées sous la forme `/api/photo?s=…`, et on
 * les réempaquetait en `?u=/api/photo?s=…`. Le relais lisait alors un chemin
 * relatif là où il attend une adresse absolue, et répondait « bad url ».
 * Trois cas, donc : ce qui est déjà servi par nous s'ouvre tel quel, ce qui
 * désigne le coffre passe par `?s=`, le reste (les fichiers Bubble, privés)
 * par `?u=`.
 */
const fichier = (u: unknown) => {
  const s = S(u);
  if (!s) return undefined;
  if (s.startsWith("/")) return s;
  if (s.startsWith("storage:")) return `/api/photo?s=${encodeURIComponent(s.slice("storage:".length))}`;
  return `/api/photo?u=${encodeURIComponent(s)}`;
};
const nomFichier = (u: unknown) => {
  const s = S(u);
  if (!s) return "";
  try { return decodeURIComponent(s.split("/").pop() ?? ""); } catch { return s.split("/").pop() ?? ""; }
};

/* --- Pictos des onglets, dans l'ordre du BO --- */
const IC: Record<string, React.ReactNode> = {
  infos: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.6h.01" /></>,
  immeubles: <><path d="M5 20V5.6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V20M15 20v-8h3.4a1 1 0 0 1 1 1v7M8 8h1.5M11 8h1.5M8 11.4h1.5M11 11.4h1.5M8 14.8h1.5M11 14.8h1.5" /></>,
  recherches: <><circle cx="7" cy="14" r="3.6" /><circle cx="17" cy="14" r="3.6" /><path d="M7 10.4V6h3.4M17 10.4V6h-3.4M10.6 14h2.8" /></>,
  mandats: <><path d="M6 3.5h7.5L18 8v12.5H6z" /><path d="M13.4 3.6V8H18M8.6 12h6.8M8.6 15h6.8M8.6 18h4" /></>,
  propositions: <><path d="M21.6 3.2 2.9 10.4l4.7 1.7 11-7.3-8.6 8.4v4.8l2.3-3 4.4 3.2z" /></>,
  questions: <><path d="M9.4 9a2.7 2.7 0 1 1 3.5 2.6c-.6.2-.9.8-.9 1.4v.7M12 17.2h.01" /><circle cx="12" cy="12" r="9" /></>,
  visites: <><path d="M4 16.5V12l1.7-4.2A2 2 0 0 1 7.6 6.5h8.8a2 2 0 0 1 1.9 1.3L20 12v4.5M4 16.5h16M6.5 16.5v2H4.8v-2M19.2 16.5v2h-1.7v-2M7.4 13.4h1M15.6 13.4h1" /></>,
  offres: <><path d="M7 4.5 4.5 7l7.5 7.5M4.5 7l3.6-1M7 4.5l-1 3.6" /><path d="m12 14.5 4.6 4.6a2 2 0 0 0 2.8-2.8L14.8 11.7" /></>,
  suivis: <><path d="M12 3C6.8 3 2.6 6.3 2.6 10.4c0 2.3 1.3 4.4 3.4 5.7-.2 1.3-.9 2.5-1.9 3.4 1.9 0 3.7-.7 5-1.9.9.2 1.8.3 2.9.3 5.2 0 9.4-3.3 9.4-7.5S17.2 3 12 3z" /></>,
  echanges: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.6 7 8.4 6 8.4-6" /></>,
};

const Ic = ({ k }: { k: string }) => <span className="cfx-ic"><svg viewBox="0 0 24 24">{IC[k]}</svg></span>;

/**
 * L'espace client du contact (tâche #56).
 *
 * MAV : « il faut que ce soit un compte avec mot de passe où le gars voit ses
 * recherches et ses immeubles. Sinon il va pas revenir sur un lien où tout le
 * monde peut aller. »
 *
 * Le lien d'activation ne s'envoie pas tout seul : il s'affiche, l'agent le
 * copie et le colle dans son message. Même doctrine que partout ailleurs — le
 * BO prépare, l'agent envoie.
 */
function EspaceCompte({ contactId, email, compte }: {
  contactId: string; email: string; compte?: CompteVu | null;
}) {
  const [pending, start] = useTransition();
  const [lien, setLien] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [ferme, setFerme] = useState(false);

  const actif = !!compte?.actif && !ferme;
  const url = lien ? `${typeof window === "undefined" ? "" : window.location.origin}${lien}` : "";

  return (
    <div className="espv" style={{ marginBottom: 14 }}>
      <div className="espv-hd">
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
        </svg>
        <b>Espace client</b>
        <span className="sp" style={{ flex: 1 }} />
        <button type="button" className="espv-b go" disabled={pending || !email.includes("@")}
          onClick={() => start(async () => {
            setErreur(null);
            const r = await ouvrirCompteClient(contactId, email);
            if (r.ok) { setLien(r.lien); setFerme(false); } else setErreur(r.message);
          })}>
          {pending ? "…" : actif ? "Renvoyer un lien d'accès" : "Ouvrir l'espace client"}
        </button>
        {actif && (
          <button type="button" className="espv-b ko" disabled={pending}
            onClick={() => start(async () => { await desactiverCompteClient(contactId); setFerme(true); setLien(null); })}>
            Fermer l&apos;accès
          </button>
        )}
      </div>

      {erreur && <p className="espv-txt" style={{ color: "#a5341f" }}>{erreur}</p>}

      {!erreur && !lien && (
        <p className="espv-txt">
          {actif
            ? compte?.active_le
              ? `Espace actif depuis le ${new Date(compte.active_le).toLocaleDateString("fr-FR")}` +
                (compte.vu_le ? `, dernière visite le ${new Date(compte.vu_le).toLocaleDateString("fr-FR")} (${compte.connexions} connexions).` : ", jamais ouvert.")
              : "Espace ouvert, mot de passe pas encore choisi. Renvoyez-lui un lien d'accès."
            : "Un compte avec mot de passe, où le client retrouve ses immeubles, ses recherches et les biens qu'on lui propose."}
        </p>
      )}

      {lien && (
        <div className="espv-prix">
          <div>
            <span className="espv-lab">Lien d&apos;activation à lui envoyer — valable 7 jours, une seule fois</span>
            <code style={{ fontSize: 12, wordBreak: "break-all" }}>{url}</code>
          </div>
          <button type="button" className="espv-b" onClick={() => {
            navigator.clipboard?.writeText(url).then(() => {
              setCopie(true);
              setTimeout(() => setCopie(false), 2200);
            }).catch(() => undefined);
          }}>{copie ? "Copié ✓" : "Copier"}</button>
        </div>
      )}
    </div>
  );
}

export function ContactFiche({ d, echanges = [], compte }: {
  d: ContactData;
  /** E-mails échangés avec ce contact (module Mails). */
  echanges?: FilMail[];
  /** Son espace client, s'il en a un. */
  compte?: CompteVu | null;
}) {
  const c = d.c;
  const id = String(c._id);
  /* L'onglet ouvert vit dans l'adresse : c'est ce qui fait qu'on revient sur
     « Propositions » et pas sur « Informations » (voir lib/etat-url.ts). */
  const departTab = useDepartUrl("onglet", "infos", ONGLETS);
  const [tab, setTab] = useState(departTab);
  useMemoireUrl("onglet", tab, "infos");
  const [pending, start] = useTransition();
  const [detail, setDetail] = useState<RechercheCard | null>(null);
  /* Retour #336 : les mêmes modales que la barre d'actions rapides, ouvertes
     ici avec l'acquéreur déjà rempli. */
  const [ajout, setAjout] = useState<"recherche" | "proposition" | "visite" | "offre" | null>(null);
  const [suppression, setSuppression] = useState(false);

  /* --- Champs modifiables --- */
  const [prenom, setPrenom] = useState(S(c["prénom"]));
  const [nom, setNom] = useState(S(c.nom));
  /* Retour #307 — « je comprends pas pourquoi, ici j'ai mis Monsieur dans la
     fiche contact, et ça n'apparaît pas dans le mandat. »
     La case ne portait pas de valeur vide : elle AFFICHAIT « Monsieur » alors
     que la base n'avait rien. Il n'y avait donc rien à enregistrer — la barre
     restait grise — et le mandat, qui lit la base, ne trouvait rien. L'écran
     mentait par défaut. Il montre maintenant le vide quand la fiche est vide,
     en rouge comme les autres champs à renseigner : on voit qu'il faut le
     remplir, et le remplir déclenche l'enregistrement. */
  const [civ, setCiv] = useState(S(c["Civilité"]));
  const [email, setEmail] = useState(S(c.email));
  const [portable, setPortable] = useState(S(c.portable));
  const [fixe, setFixe] = useState(S(c.fixe));
  const [acheteur, setAcheteur] = useState(c.acheteur === true);
  const [vendeur, setVendeur] = useState(c.vendeur === true);
  const [interagence, setInteragence] = useState(c.interagence === true);
  const [types, setTypes] = useState<string[]>(Array.isArray(c.Types) ? (c.Types as string[]) : []);
  const [note, setNote] = useState(S(c.Note));
  const [naissance, setNaissance] = useState(jourIso(c.date_naissance) ?? "");
  const [lieuNaissance, setLieuNaissance] = useState(geo(c.lieu_naissance_geo));
  const [adresse, setAdresse] = useState(geo(c.adresse_geo));
  const [entreprise, setEntreprise] = useState(S(c.entreprise_nom));
  const [poste, setPoste] = useState(S(c.poste));
  const [capital, setCapital] = useState(S(c.entreprise_capital));
  const [siren, setSiren] = useState(S(c.entreprise_siren));
  const [rcs, setRcs] = useState(S(c.entreprise_rcs));
  const [siege, setSiege] = useState(geo(c.entreprise_siege_geo));
  /* Retour #228 — les mandats déposent ici les sociétés du contact (retour
     #200), mais la fiche n'en montrait qu'une : les autres n'existaient que
     dans l'écran de mandat, invisibles et non corrigeables là où on vient les
     chercher. Elles sont désormais listées, et un clic en met une au premier
     plan — celle qui était affichée reprend sa place dans la liste. */
  const [societes, setSocietes] = useState<Soc[]>(
    Array.isArray(c.societes) ? (c.societes as Soc[]) : [],
  );
  const societeCourante = (): Soc => ({
    nom: entreprise || undefined,
    siren: siren || undefined,
    rcs: rcs || undefined,
    capital: capital ? Number(capital.replace(/[^\d.]/g, "")) : undefined,
    siege: siege || undefined,
  });
  const autresSocietes = societes.filter(
    (s) => s.nom && cleSociete(s) && cleSociete(s) !== cleSociete(societeCourante()),
  );
  const mettreAuPremierPlan = (s: Soc) => {
    setSocietes(fusionnerSociete(societes, societeCourante()));
    setEntreprise(s.nom ?? "");
    setSiren(s.siren ?? "");
    setRcs(s.rcs ?? "");
    setCapital(s.capital === undefined ? "" : String(s.capital));
    setSiege(s.siege ?? "");
  };
  const [remarques, setRemarques] = useState(S(c.remarques));
  const [source, setSource] = useState(S(c.Source));
  const [notifSms, setNotifSms] = useState(c.notif_sms === true);
  const [notifMail, setNotifMail] = useState(c.notif_email === true);

  const civCourt = civ === "Monsieur" ? "M." : civ === "Madame" ? "Mme" : civ;
  const nomComplet = [civCourt, prenom, nom.toUpperCase()].filter(Boolean).join(" ")
    || entreprise || "Contact";
  const telBrut = (portable || fixe).replace(/[^\d+]/g, "");
  const telAffiche = S(c.portable_formatted) || portable || S(c.fixe_formatted) || fixe;

  const save = () =>
    start(() =>
      updateContact(id, {
        "Civilité": civ || undefined, "prénom": prenom || undefined, nom: nom || undefined,
        email: email || undefined, portable: portable || undefined, fixe: fixe || undefined,
        acheteur, vendeur, interagence, Types: types, Note: note || undefined,
        date_naissance: naissance || undefined,
        lieu_naissance_geo: versGeo(lieuNaissance),
        adresse_geo: versGeo(adresse),
        entreprise_nom: entreprise || undefined,
        poste: poste || undefined,
        entreprise_capital: capital ? Number(capital.replace(/[^\d.]/g, "")) : undefined,
        entreprise_siren: siren || undefined,
        entreprise_rcs: rcs || undefined,
        entreprise_siege_geo: versGeo(siege),
        /* La société affichée retourne dans la liste : sans ça, la corriger
           ici la laissait fausse pour le mandat suivant, qui lit `societes`. */
        societes: fusionnerSociete(societes, societeCourante()),
        remarques: remarques || undefined,
        Source: source || undefined,
        notif_sms: notifSms, notif_email: notifMail,
      }),
    );

  const onglets = [
    { key: "infos", label: "Informations" },
    { key: "immeubles", label: "Immeubles", n: d.immeubles.length },
    { key: "recherches", label: "Recherches", n: d.recherches.length },
    { key: "mandats", label: "Mandats", n: d.mandats.length },
    { key: "propositions", label: "Propositions", n: d.propositions.length },
    { key: "questions", label: "Questions", n: d.questions.length },
    { key: "visites", label: "Visites", n: d.visites.length },
    { key: "offres", label: "Offres", n: d.offres.length },
    { key: "suivis", label: "Suivis", n: d.suivis.length },
    { key: "echanges", label: "Échanges", n: echanges.length },
  ];

  return (
    <div className="cfx">
      {/* ---------- En-tête collé ---------- */}
      <div className="cfx-colle">
      <header className="cfx-top">
        <div className="cfx-ava">
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="11" />
            <circle cx="12" cy="9.4" r="3.6" />
            <path d="M5.2 19.8c1-3.7 3.7-5.4 6.8-5.4s5.8 1.7 6.8 5.4" />
          </svg>
          {d.agent && (
            <span className="cfx-vig" style={d.agent.couleur ? { background: d.agent.couleur } : undefined}
              title={`Suivi par ${d.agent.nom}`}>
              {d.agent.initiales}
            </span>
          )}
        </div>

        <div className="cfx-id">
          <div className="cfx-nom">
            {(note || d.promotion) && (
              <b className={`note n${d.promotion && !note ? d.promotion.note : note}`}
                title={`Classement acquéreur ${note || d.promotion?.note}`}>
                {note || d.promotion?.note}
              </b>
            )}
            <span>{nomComplet}</span>
            {entreprise && <i>(société {entreprise})</i>}
          </div>

          <div className="cfx-chips">
            <button type="button" className={`cfx-q vend${vendeur ? " on" : ""}`} onClick={() => setVendeur(!vendeur)}>
              <svg viewBox="0 0 24 24"><path d="M5 20V5.6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V20M15 20v-8h3.4a1 1 0 0 1 1 1v7" /></svg>
              VENDEUR
            </button>
            <button type="button" className={`cfx-q ach${acheteur ? " on" : ""}`} onClick={() => setAcheteur(!acheteur)}>
              <svg viewBox="0 0 24 24"><circle cx="7" cy="14" r="3.6" /><circle cx="17" cy="14" r="3.6" /><path d="M7 10.4V6h3.4M17 10.4V6h-3.4M10.6 14h2.8" /></svg>
              ACHETEUR
            </button>
            {types.map((t) => <span key={t} className="cfx-prof">{t}</span>)}
            {types.length === 0 && <span className="cfx-prof vide">Profil non renseigné</span>}
          </div>

          <div className="cfx-coord">
            {email && (
              <span className="cfx-cd">
                <svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.6 7 8.4 6 8.4-6" /></svg>
                {email}
                <Copier valeur={email} titre="Copier l'e-mail" petit />
              </span>
            )}
            {telAffiche && (
              <span className="cfx-cd">
                <svg viewBox="0 0 24 24"><rect x="7" y="2.6" width="10" height="18.8" rx="2" /><path d="M10.8 18.6h2.4" /></svg>
                {telAffiche}
                <Copier valeur={telAffiche} titre="Copier le téléphone" petit />
              </span>
            )}
          </div>
        </div>

        <div className="cfx-act">
          <a className={`cfx-b vert${telBrut ? "" : " off"}`} href={telBrut ? `tel:${telBrut}` : undefined}>
            <svg viewBox="0 0 24 24"><path d="M6.4 3.6 9 4.2l1 3.4-2 1.5a11 11 0 0 0 4.9 4.9l1.5-2 3.4 1 .6 2.6a1.6 1.6 0 0 1-1.6 2C10.2 17.2 6.8 13.8 4.4 5.2a1.6 1.6 0 0 1 2-1.6z" /></svg>
            Appeler
          </a>
          <a className={`cfx-b jaune${email ? "" : " off"}`} href={email ? `mailto:${email}` : undefined}>
            <svg viewBox="0 0 24 24"><path d="M21.6 3.2 2.9 10.4l4.7 1.7 11-7.3-8.6 8.4v4.8l2.3-3 4.4 3.2z" /></svg>
            Envoyer un e-mail
          </a>
          <button type="button" className="cfx-b rouge" onClick={() => setSuppression(true)}>
            <svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4.8h4V7M6.6 7l.8 12.2a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.4 7M10.4 10.6v6M13.6 10.6v6" /></svg>
            Supprimer ce contact
          </button>
        </div>
      </header>

      {/* ---------- Barre d'onglets collée, toute largeur ---------- */}
      <nav className="cfx-tabs">
        {onglets.map((t) => (
          <button key={t.key} type="button"
            className={`cfx-tab${tab === t.key ? " on" : ""}${t.n === 0 ? " vide" : ""}`}
            onClick={() => setTab(t.key)}>
            <Ic k={t.key} />
            {t.label}
            {t.n !== undefined && <span className="n">{t.n}</span>}
          </button>
        ))}
      </nav>
      </div>

      <div className="cfx-body">
        {tab === "infos" && (
          <div className="cfx-infos">
            <div className="cfx-form">
              <Bloc titre="Agent France Immeuble" picto="drapeau">
                <Ligne label="Suivi par">
                  <span className="cfx-agent">{d.agent?.nom ?? "Non attribué"}</span>
                </Ligne>
              </Bloc>

              <Bloc titre="Typologie" picto="profil">
                <Ligne label="Profil">
                  <details className="cfx-multi">
                    <summary>{types.join(", ") || "—"}</summary>
                    <div className="cfx-multi-l">
                      {PROFILS_CONTACT.map((p) => (
                        <label key={p}>
                          <input type="checkbox" checked={types.includes(p)}
                            onChange={() => setTypes(types.includes(p) ? types.filter((x) => x !== p) : [...types, p])} />
                          {p}
                        </label>
                      ))}
                    </div>
                  </details>
                </Ligne>
                <Ligne label="Projet">
                  <span className="cfx-cases">
                    <label><input type="checkbox" checked={acheteur} onChange={() => setAcheteur(!acheteur)} /> Acheter</label>
                    <label><input type="checkbox" checked={vendeur} onChange={() => setVendeur(!vendeur)} /> Vendre</label>
                    <label><input type="checkbox" checked={interagence} onChange={() => setInteragence(!interagence)} /> Interagence</label>
                  </span>
                </Ligne>
                <Ligne label="Note">
                  {/* La barre pleine largeur du BO : la couleur porte le classement. */}
                  <select className={`cfx-note${note ? ` n${note}` : ""}`} value={note}
                    onChange={(e) => setNote(e.target.value)}>
                    <option value="">Non classé</option>
                    {NOTES_CONTACT.map((n) => <option key={n.cle} value={n.cle}>{n.label}</option>)}
                  </select>
                  {/* Le classement monte avec les actes : on le propose plutôt
                      que de réécrire la fiche sans le dire. */}
                  {d.promotion && rangNote(d.promotion.note) < rangNote(note) && (
                    <button type="button" className="cfx-promo" onClick={() => setNote(d.promotion!.note)}>
                      ↑ Passer en <b className={`note n${d.promotion.note}`}>{d.promotion.note}</b>
                      <i>{d.promotion.motif}</i>
                    </button>
                  )}
                </Ligne>
              </Bloc>

              <Bloc titre="Coordonnées" picto="carte">
                <Ligne label="Portable" duo={{ label: "Fixe", noeud: <input value={fixe} onChange={(e) => setFixe(e.target.value)} /> }}>
                  <input value={portable} onChange={(e) => setPortable(e.target.value)} />
                </Ligne>
                <Ligne label="E-mail">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Ligne>
              </Bloc>

              {/* L'espace client (tâche #56) : c'est ici qu'on l'ouvre, parce
                  que c'est la personne qui a un espace, pas l'immeuble — elle
                  y retrouve ce qu'elle vend ET ce qu'elle cherche. */}
              <EspaceCompte contactId={id} email={email} compte={compte} />

              <Bloc titre="Informations" picto="info">
                <Ligne label="Civilité">
                  <select className={`court${civ ? "" : " requis"}`} value={civ}
                    onChange={(e) => setCiv(e.target.value)}>
                    <option value="">À renseigner</option>
                    {CIVILITES.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Ligne>
                <Ligne label="Prénom" duo={{ label: "Nom", noeud: <input value={nom} onChange={(e) => setNom(e.target.value)} /> }}>
                  <input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
                </Ligne>
                <Ligne label="Date de naissance"
                  duo={{ label: "Lieu de naissance", noeud: <input value={lieuNaissance} onChange={(e) => setLieuNaissance(e.target.value)} /> }}>
                  <input type="date" value={naissance} onChange={(e) => setNaissance(e.target.value)} />
                </Ligne>
                <Ligne label="Adresse">
                  <input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
                </Ligne>
                <Ligne label="Carte d'identité">
                  <PieceJointe url={c.cni} contactId={id} cle="cni" depose={c.cni_depose_le} />
                </Ligne>
              </Bloc>

              <Bloc titre="Société" picto="societe">
                <Ligne label="Raison sociale">
                  <input value={entreprise} onChange={(e) => setEntreprise(e.target.value)} />
                </Ligne>
                <Ligne label="Poste"
                  duo={{ label: "Capital Social", noeud: <input className="droite" value={capital} onChange={(e) => setCapital(e.target.value)} /> }}>
                  <input value={poste} onChange={(e) => setPoste(e.target.value)} />
                </Ligne>
                <Ligne label="SIREN" duo={{ label: "RCS", noeud: <input value={rcs} onChange={(e) => setRcs(e.target.value)} /> }}>
                  <input value={siren} onChange={(e) => setSiren(e.target.value)} />
                </Ligne>
                <Ligne label="Siège social">
                  <input value={siege} onChange={(e) => setSiege(e.target.value)} />
                </Ligne>
                <Ligne label="K-bis">
                  <PieceJointe url={c.entreprise_kbis} contactId={id} cle="kbis"
                    depose={c.entreprise_kbis_depose_le} />
                </Ligne>
                {autresSocietes.length > 0 && (
                  <Ligne label="Autres sociétés">
                    <div className="cfx-socs">
                      {autresSocietes.map((s) => (
                        <button key={cleSociete(s)} type="button" className="cfx-soc"
                          title="Afficher cette société ci-dessus"
                          onClick={() => mettreAuPremierPlan(s)}>
                          <b>{s.nom}</b>
                          {(s.siren || s.representante?.nom || s.kbis) && (
                            <i>
                              {[s.siren && `SIREN ${s.siren}`, s.representante?.nom && `via ${s.representante.nom}`,
                                s.kbis && `Kbis${s.kbisLe ? ` du ${dmy(s.kbisLe) ?? s.kbisLe}` : ""}`]
                                .filter(Boolean).join(" · ")}
                            </i>
                          )}
                        </button>
                      ))}
                    </div>
                  </Ligne>
                )}
              </Bloc>
            </div>

            <aside className="cfx-side">
              <div className="cfx-notes">
                <div className="cfx-notes-h">Notes et remarques</div>
                <textarea value={remarques} onChange={(e) => setRemarques(e.target.value)}
                  placeholder="Écrivez ici…" />
              </div>

              <div className="cfx-notif">
                <Radio label="Notifications SMS" valeur={notifSms} set={setNotifSms} />
                <Radio label="Notifications e-mail" valeur={notifMail} set={setNotifMail} />
              </div>

              <div className="cfx-src">
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">Source : —</option>
                  {[...new Set([source, ...SOURCES])].filter(Boolean).map((s) => (
                    <option key={s} value={s}>Source : {s}</option>
                  ))}
                </select>
                <p>
                  Création : {dmy(c["Created Date"]) ?? "?"}{d.anciennete ?? ""} par {d.createur ?? "France Immeuble"}
                </p>
              </div>
            </aside>
          </div>
        )}

        {tab === "immeubles" && (
          <Onglet ajout="+ Ajouter un immeuble" href="/immeubles" vide={d.immeubles.length === 0} quoi="immeuble"
            cartes={d.immeubles.map((im) => (
              <div className={`cfc${im.archive ? " arch" : ""}`} key={im.id}>
                <div className="cfc-g">
                  <span className="cfc-pic">
                    <svg viewBox="0 0 24 24">{IC.immeubles}</svg>
                  </span>
                  <span className="lav" style={im.agentCouleur ? { background: im.agentCouleur } : undefined}>{im.agent}</span>
                </div>
                <div className="cfc-c">
                  <div className="cfc-l1">
                    <Link className="cfc-t" href={`/bien/${im.id}`}>{im.libelle}</Link>
                  </div>
                  <div className="cfc-l2">
                    {im.statut && (
                      <span className={`cfc-st${im.rang >= 11 ? " vert" : im.rang >= 5 ? " bleu" : ""}`}>{im.statut}</span>
                    )}
                    <span className={`cfc-st${im.dossier ? " bleu" : " off"}`}>{im.dossier ?? "Pas de dossier"}</span>
                    <span className={`cfc-st${im.mandat ? "" : " off"}`}>{im.mandat ?? "Pas de mandat"}</span>
                    {im.archive && <span className="cfc-arch">{im.archive}</span>}
                  </div>
                  <div className="cfc-l3">
                    <Mesure titre="Surface Carrez" valeur={im.surface} d="M4.5 8V4.5H8M16 4.5h3.5V8M19.5 16v3.5H16M8 19.5H4.5V16" />
                    <Mesure titre="Taux d'occupation" valeur={im.occupation} d="M14.6 6.4a3.6 3.6 0 1 1-3.3 5L4 18.7v2.1h2.4v-1.9h1.9v-1.9h1.9l2-2a3.6 3.6 0 0 1 2.4-8.6zM15.6 9.9h.01" />
                    <Mesure titre="Loyers annuels HC" valeur={im.loyers} d="M14.5 7.4H10a2.6 2.6 0 0 0 0 5.2h3.4a2.6 2.6 0 0 1 0 5.2H9M12 5.4v13.2" />
                    <Mesure titre="Rendement" valeur={im.renta} d="M4 18 10 11l4 4 6-8M20 7v5h-5" />
                    <span style={{ flex: 1 }} />
                    <span className="cfc-prix">{im.prix ?? "– €"}</span>
                  </div>
                </div>
              </div>
            ))} />
        )}

        {tab === "recherches" && (
          <Onglet ajout="+ Ajouter une recherche" href="/recherches" vide={d.recherches.length === 0} quoi="recherche"
            onAjouter={() => setAjout("recherche")}
            cartes={d.recherches.map((r) => (
              <CarteRecherche key={r.id} r={r} onDetail={setDetail} sansContact
                mention={d.mandatRechercheActif ? "Mandat de recherche actif" : undefined} />
            ))} />
        )}

        {tab === "mandats" && (
          <Onglet ajout="+ Ajouter un mandat" href="/mandats" vide={d.mandats.length === 0} quoi="mandat"
            cartes={d.mandats.map((m) => (
              <div className="cfc" key={m.id}>
                <div className="cfc-g">
                  <span className="cfc-pic">
                    <svg viewBox="0 0 24 24">{m.recherche ? IC.recherches : IC.mandats}</svg>
                  </span>
                  <span className="lav" style={m.agentCouleur ? { background: m.agentCouleur } : undefined}>{m.agent}</span>
                </div>
                <div className="cfc-c">
                  <div className="cfc-l1">
                    <Link className="cfc-t" href={`/mandat/${m.id}`}>{m.titre}</Link>
                    {m.periode && <span className="cfc-date">{m.periode}</span>}
                  </div>
                  <div className="cfc-l2">
                    {m.statut && <span className={`cfc-st${["En cours", "Vendu"].includes(m.statut) ? " vert" : ["Annulé", "Expiré"].includes(m.statut) ? " off" : ""}`}>{m.statut}</span>}
                    {m.numero ? <span className="cfc-num">{m.numero}</span> : <span className="cfc-alerte">⚠ Pas de numéro</span>}
                    {m.pdf && <span className="cfc-doc">📎 {m.pdf}</span>}
                  </div>
                  <div className="cfc-l3">
                    {m.immeuble && (
                      <Link className="cfc-im" href={`/bien/${m.immeuble.id}`}>
                        <svg viewBox="0 0 24 24">{IC.immeubles}</svg>{m.immeuble.libelle}
                      </Link>
                    )}
                    <span style={{ flex: 1 }} />
                    {m.prix && <span className="cfc-prix">{m.prix}</span>}
                  </div>
                </div>
              </div>
            ))} />
        )}

        {tab === "propositions" && (
          <OngletPropositions
            d={d} contactId={id} nom={nomComplet} email={email.trim()}
            vignette={{
              id, nom: nomComplet, qualite: entreprise || types[0] || undefined,
              tel: telAffiche || undefined, email: email.trim() || undefined,
              immeubles: d.immeubles.length, recherches: d.recherches.length,
            }}
            note={note}
            onAjouter={() => setAjout("proposition")}
          />
        )}

        {tab === "questions" && (
          <Onglet ajout="+ Voir toutes les questions" href="/questions" vide={d.questions.length === 0} quoi="question"
            cartes={d.questions.map((q) => (
              <div className={`cfc${q.clos ? " pale" : ""}`} key={q.id}>
                <div className="cfc-g">
                  <span className="cfc-pic"><svg viewBox="0 0 24 24">{IC.suivis}</svg></span>
                  <span className="lav" style={q.agentCouleur ? { background: q.agentCouleur } : undefined}>{q.agent}</span>
                </div>
                <div className="cfc-c">
                  <div className="cfc-l1">
                    <span className="cfc-t">Question du {q.quand}</span>
                    <span className="cfc-date">{q.source}</span>
                    <span style={{ flex: 1 }} />
                    <span className={`cfc-st${q.clos ? " off" : " vert"}`}>{q.clos ? "Clôturée" : "En cours"}</span>
                  </div>
                  <div className="cfc-note">{q.message || <i>Sans message.</i>}</div>
                  {q.immeuble && (
                    <div className="cfc-l3">
                      <Link className="cfc-im" href={`/bien/${q.immeuble.id}`}>
                        <svg viewBox="0 0 24 24">{IC.immeubles}</svg>{q.immeuble.libelle}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ))} />
        )}

        {(tab === "visites" || tab === "offres") && (
          <Onglet
            key={tab}
            ajout={tab === "visites" ? "+ Ajouter une visite" : "+ Ajouter une offre"}
            href={tab === "visites" ? "/visites" : "/offres"}
            onAjouter={() => setAjout(tab === "visites" ? "visite" : "offre")}
            vide={(tab === "visites" ? d.visites : d.offres).length === 0}
            quoi={tab === "visites" ? "visite" : "offre"}
            cartes={(tab === "visites" ? d.visites : d.offres).map((a) => (
              <div className="cfc" key={a.id}>
                <div className="cfc-g">
                  <span className="cfc-pic"><svg viewBox="0 0 24 24">{IC[tab]}</svg></span>
                  <span className="lav" style={a.agentCouleur ? { background: a.agentCouleur } : undefined}>{a.agent}</span>
                </div>
                <div className="cfc-c">
                  <div className="cfc-l1">
                    <span className="cfc-t">{a.titre}</span>
                    {a.statut && <span className={`cfc-st ${a.ton === "green" ? "vert" : a.ton === "red" ? "rouge" : ""}`}>{a.statut}</span>}
                  </div>
                  {a.details.length > 0 && <div className="cfc-l2">{a.details.map((x, i) => <span key={i} className="cfc-num">{x}</span>)}</div>}
                  {a.commentaire && <div className="cfc-note">{a.commentaire}</div>}
                  {a.immeuble && (
                    <div className="cfc-l3">
                      <Link className="cfc-im" href={`/bien/${a.immeuble.id}`}>
                        <svg viewBox="0 0 24 24">{IC.immeubles}</svg>{a.immeuble.libelle}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ))} />
        )}

        {tab === "suivis" && (
          <Onglet ajout="+ Ajouter un suivi" href="/suivi" vide={d.suivis.length === 0} quoi="suivi"
            cartes={d.suivis.map((s) => (
              <div className="cfc" key={s.id}>
                <div className="cfc-g">
                  <span className="cfc-pic"><svg viewBox="0 0 24 24">{IC.suivis}</svg></span>
                  <span className="lav" style={s.agentCouleur ? { background: s.agentCouleur } : undefined}>{s.agent}</span>
                </div>
                <div className="cfc-c">
                  <div className="cfc-l1">
                    <span className="cfc-t">{s.quand}</span>
                    {s.type && <span className="cfc-date">{s.type}</span>}
                    {s.canal && <span className="cfc-num">{s.canal}</span>}
                    <span style={{ flex: 1 }} />
                    {s.statut && <span className={`cfc-st${s.statut === "Traité" ? " vert" : ""}`}>{s.statut}</span>}
                  </div>
                  <div className="cfc-note">{s.notes || <i>Sans note.</i>}</div>
                  <div className="cfc-l3">
                    {s.immeuble && (
                      <Link className="cfc-im" href={`/bien/${s.immeuble.id}`}>
                        <svg viewBox="0 0 24 24">{IC.immeubles}</svg>{s.immeuble.libelle}
                      </Link>
                    )}
                    <span style={{ flex: 1 }} />
                    {s.relance && <span className="cfc-date">Relance le {s.relance}</span>}
                  </div>
                </div>
              </div>
            ))} />
        )}

        {tab === "echanges" && (
          <div className="cfx-liste">
            <EchangesContact mails={echanges} />
          </div>
        )}
      </div>

      {/* La barre d'enregistrement ne concerne que l'onglet Informations : les
          autres onglets n'ont rien à sauvegarder. */}
      {tab === "infos" && (
        <div className="savebar plein">
          <span className="savebar-t">Fiche contact</span>
          <span className="sp" />
          <Link className="fadd" href="/contacts">✕ Retour aux contacts</Link>
          <button className="savebar-go" type="button" disabled={pending} onClick={save}>
            <span className="ch">›</span> Enregistrer
          </button>
        </div>
      )}

      {detail && (
        <ModaleRecherche
          detail={detail} onClose={() => setDetail(null)}
          onModifier={() => { setDetail(null); setAjout("recherche"); }}
        />
      )}

      {/* Retour #336 : la barre du bas et la fiche client montent les mêmes
          modales — ici, l'acquéreur est déjà connu, on ne le redemande pas. */}
      {ajout === "recherche" && (
        <ModaleRechercheEdition
          contactImpose={{ id, nom: nomComplet }}
          onFermer={() => setAjout(null)} onEnregistre={() => setAjout(null)}
        />
      )}
      {ajout === "proposition" && (
        <ModaleProposition contact={{ id, nom: nomComplet, email: email.trim() || undefined }}
          onFermer={() => setAjout(null)} />
      )}
      {ajout === "visite" && (
        <ModaleVisite contact={{ id, nom: nomComplet }} onFermer={() => setAjout(null)} />
      )}
      {ajout === "offre" && (
        <ModaleOffre contact={{ id, nom: nomComplet }} onFermer={() => setAjout(null)} />
      )}
      {suppression && (
        <Suppression id={id} nom={nomComplet} onClose={() => setSuppression(false)} />
      )}
    </div>
  );
}

/* ---------- Petites briques ---------- */

const PICTOS: Record<string, React.ReactNode> = {
  drapeau: <path d="M6 21V4M6 4h10l-2 3 2 3H6" />,
  profil: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="9.6" r="2.6" /><path d="M7 18c.6-2.6 2.6-3.8 5-3.8s4.4 1.2 5 3.8" /></>,
  carte: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M5.4 16c.5-1.7 1.7-2.5 3.1-2.5s2.6.8 3.1 2.5M14.5 10h4M14.5 13.4h4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.6h.01" /></>,
  societe: <><path d="M4 20V9.5l5-2.5V20M9 20V4.5l5 2v13.5M14 20v-8h6v8M4 20h17" /></>,
};

function Bloc({ titre, picto, children }: { titre: string; picto: string; children: React.ReactNode }) {
  return (
    <section className="cfx-bloc">
      <h2><span className="cfx-ic or"><svg viewBox="0 0 24 24">{PICTOS[picto]}</svg></span>{titre}</h2>
      {children}
    </section>
  );
}

/** Une ligne label + champ, éventuellement doublée (Prénom / Nom). */
function Ligne({ label, children, duo }: {
  label: string;
  children: React.ReactNode;
  duo?: { label: string; noeud: React.ReactNode };
}) {
  return (
    <div className={`cfx-r${duo ? " duo" : ""}`}>
      <label>{label}</label>
      <div className="cfx-v">{children}</div>
      {duo && (
        <>
          <label className="d2">{duo.label}</label>
          <div className="cfx-v">{duo.noeud}</div>
        </>
      )}
    </div>
  );
}

/** Oui / Non façon BO, avec de vrais boutons radio. */
function Radio({ label, valeur, set }: { label: string; valeur: boolean; set: (v: boolean) => void }) {
  return (
    <div className="cfx-radio">
      <span>{label}</span>
      <span style={{ flex: 1 }} />
      <label><input type="radio" checked={valeur} onChange={() => set(true)} /> Oui</label>
      <label><input type="radio" checked={!valeur} onChange={() => set(false)} /> Non</label>
    </div>
  );
}

/** Pièce jointe Bubble : un clic l'ouvre, elle passe par notre proxy. */
/**
 * Une pièce du dossier client (retour #289).
 *
 * MAV : « quand je clique pour voir la CNI et le Kbis je n'y arrive pas […] il
 * me faudrait également un bouton pour supprimer ou remplacer les documents en
 * question. Pour le Kbis ce serait bien d'écrire la date à laquelle on a
 * déposé le document aussi. »
 *
 * La date n'est pas un détail sur un Kbis : il vaut trois mois. Passé ce
 * délai, la ligne le dit — c'est ce qui évite de partir chez le notaire avec
 * une pièce refusée.
 */
function PieceJointe({ url, contactId, cle, depose }: {
  url: unknown;
  contactId?: string;
  cle?: "cni" | "kbis";
  /** Date de dépôt, telle qu'enregistrée. */
  depose?: unknown;
}) {
  const [pending, start] = useTransition();
  const href = fichier(url);
  const le = S(depose).slice(0, 10);
  const perime = cle === "kbis" && le
    ? Date.now() - new Date(le).getTime() > 92 * 86400000
    : false;

  if (!href) return <span className="cfx-pj vide">Aucun fichier</span>;
  return (
    <span className="cfx-pj-l">
      <a className="cfx-pj" href={href} target="_blank" rel="noreferrer">
        <svg viewBox="0 0 24 24"><path d="M20 11.5 12.6 19a4.5 4.5 0 0 1-6.4-6.4l7.6-7.6a3 3 0 0 1 4.3 4.3l-7.5 7.5a1.5 1.5 0 0 1-2.2-2.1l6.9-6.9" /></svg>
        {nomFichier(url)}
      </a>
      {le && (
        <i className={`cfx-pj-d${perime ? " ko" : ""}`}>
          déposé le {le.split("-").reverse().join("/")}
          {perime && " — plus de 3 mois, à renouveler"}
        </i>
      )}
      {contactId && cle && (
        <button type="button" className="cfx-pj-x" disabled={pending}
          title="Retirer cette pièce de la fiche"
          onClick={() => start(() => retirerPieceContact(contactId, cle))}>
          {pending ? "…" : "Retirer"}
        </button>
      )}
    </span>
  );
}

/** L'ossature commune des onglets : le bouton jaune, puis les cartes.
 *  Les listes longues (146 propositions pour un seul acquéreur) se déroulent
 *  par paquets, comme le défilement infini du BO : afficher tout d'un coup
 *  ferait une page de vingt écrans de haut. */
const PAQUET = 25;

function Onglet({ ajout, href, vide, quoi, entete, cartes, onAjouter }: {
  ajout: string; href: string; vide: boolean; quoi: string;
  entete?: React.ReactNode;
  cartes: React.ReactNode[];
  /* Retour #336 — « dans la fiche client il y a plein de menus et on peut à
     chaque fois ajouter un immeuble, une recherche, une proposition, une
     visite, une offre, un suivi, et bien il faudrait qu'à chaque fois ce soit
     les mêmes modales que celles de la sticky bar d'actions rapides. »
     Le lien renvoyait vers l'écran de liste, à charge pour l'agent de
     recommencer là-bas — en ayant perdu le contact d'où il partait. Quand une
     modale existe, elle s'ouvre ici, l'acquéreur déjà rempli. */
  onAjouter?: () => void;
}) {
  const [vues, setVues] = useState(PAQUET);
  const feminin = ["visite", "offre", "recherche", "proposition", "question"].includes(quoi);
  const reste = cartes.length - vues;
  return (
    <div className="cfx-liste">
      {onAjouter
        ? <button type="button" className="cfx-add" onClick={onAjouter}>{ajout}</button>
        : <Link className="cfx-add" href={href}>{ajout}</Link>}
      {entete}
      {vide
        ? <div className="fempty">Aucun{feminin ? "e" : ""} {quoi}.</div>
        : cartes.slice(0, vues)}
      {reste > 0 && (
        <button type="button" className="cfx-suite" onClick={() => setVues(vues + PAQUET)}>
          Afficher {Math.min(PAQUET, reste)} {quoi}{Math.min(PAQUET, reste) > 1 ? "s" : ""} de plus
          <i>{reste} restante{feminin ? "s" : ""}</i>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------ Onglet Propositions
 *
 * Retours #365 et #366 — la carte du BO, reprise trait pour trait : la ou les
 * recherches avec lesquelles le bien a été matché (un clic ouvre la recherche
 * en modification), le nom du client (un clic ouvre sa vignette), le dossier
 * envoyé et son PDF, la pastille « à relancer », le bouton Relancer, le bouton
 * Refuser qui ouvre une barre de texte pour dire pourquoi.
 *
 * Le bouton Relancer est SCINDÉ (demande MAV du 23/09) : le clic principal
 * envoie tout de suite le message habituel, sans fenêtre ; la flèche ouvre
 * la fenêtre pour changer le texte avant l'envoi. L'envoi est un geste de
 * l'agent — c'est le clic — et il n'est marqué relancé que si le message est
 * parti (doctrine §7.1).
 */

const STATUTS_CLOS_PROP = new Set(["Refusée (sans offre)", "Offre refusée", "Offre obtenue", "Offre acceptée", "Vendu"]);

function OngletPropositions({ d, contactId, nom, email, vignette, note, onAjouter }: {
  d: ContactData; contactId: string; nom: string; email: string;
  vignette: VignetteData; note: string; onAjouter: () => void;
}) {
  const router = useRouter();
  const [maintenant] = useState(() => Date.now());
  /* La fenêtre de relance : quelles propositions, et le texte à modifier. */
  const [relance, setRelance] = useState<{ ids: string[] } | null>(null);
  const [rapport, setRapport] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const agent = d.agent ? { id: d.agent.id, nom: d.agent.nom, tel: d.agent.tel } : undefined;

  /** Les propositions ouvertes, avec leur ancienneté. */
  const ouvertes = useMemo(
    () => d.propositions
      .filter((p) => !p.refusee && !p.stop && !STATUTS_CLOS_PROP.has(p.statut ?? "") && p.immeuble)
      .map((p) => ({ p, jours: joursDepuis(p.depuis, maintenant) })),
    [d.propositions, maintenant],
  );
  const aRelancer = ouvertes.filter((x) => x.jours === undefined || x.jours >= JOURS_RELANCE);

  /** Le message d'une relance : un e-mail pour toutes les propositions retenues. */
  const client = (ids: string[]): ClientRelance => {
    const immeubles: ImmeubleRelance[] = ouvertes
      .filter((x) => ids.includes(x.p.id))
      .map((x) => ({
        propositionId: x.p.id, immeubleId: x.p.immeuble!.id, libelle: x.p.immeuble!.libelle,
        prix: x.p.immeuble!.prix, jours: x.jours, autresIds: [], lien: x.p.dossier?.pdf,
      }));
    return { contactId, nom, email, immeubles, joursMax: Math.max(0, ...immeubles.map((i) => i.jours ?? 999)) };
  };

  /** Envoi direct, sans fenêtre : le message habituel, tel quel. */
  const envoyerDirect = (ids: string[]) =>
    start(async () => {
      setRapport(null);
      if (!email) { setRapport("Aucune adresse e-mail sur la fiche : la relance ne peut pas partir."); return; }
      const c = client(ids);
      if (c.immeubles.length === 0) return;
      try {
        const r = await envoyerRelances(
          [{ contactId, email, objet: objetRelance(c), corps: messageRelance(c, agent), propositionIds: ids }],
          agent?.id, undefined, [`/contact/${contactId}`],
        );
        setRapport(r.envoyes ? `Relance envoyée à ${email}.` : `Échec : ${r.journal[0] ?? "l'envoi n'est pas parti."}`);
        router.refresh();
      } catch (e) {
        setRapport(e instanceof Error ? e.message : "L'envoi a échoué.");
      }
    });

  return (
    <Onglet ajout="+ Ajouter une proposition" href="/propositions" vide={d.propositions.length === 0} quoi="proposition"
      onAjouter={onAjouter}
      entete={(
        <>
          {aRelancer.length > 0 && (
            <div className="cfx-relance">
              <b>⚠ {aRelancer.length} proposition{aRelancer.length > 1 ? "s" : ""} à relancer</b>
              <span style={{ flex: 1 }} />
              <BoutonScinde
                rouge pending={pending}
                onPrincipal={() => envoyerDirect(aRelancer.map((x) => x.p.id))}
                onFleche={() => setRelance({ ids: aRelancer.map((x) => x.p.id) })}
                titre="Envoyer la relance habituelle, un seul e-mail pour tous les dossiers"
              >
                Relancer
              </BoutonScinde>
            </div>
          )}
          {rapport && <div className={`cfx-rapport${rapport.startsWith("Échec") || rapport.startsWith("Aucune") ? " ko" : ""}`}>{rapport}</div>}
          {relance && (
            <ModaleRelanceContact
              ouvertes={ouvertes} ids={relance.ids} client={client} agent={agent} email={email}
              contactId={contactId}
              onFermer={() => setRelance(null)}
              onFait={(msg) => { setRelance(null); setRapport(msg); router.refresh(); }}
            />
          )}
        </>
      )}
      cartes={d.propositions.map((p) => (
        <CarteProposition
          key={p.id} p={p} contactId={contactId} vignette={vignette} note={note}
          jours={joursDepuis(p.depuis, maintenant)}
          onRelancer={() => envoyerDirect([p.id])}
          onRelancerModale={() => setRelance({ ids: [p.id] })}
          onRafraichir={() => router.refresh()}
        />
      ))}
    />
  );
}

/** Un bouton en deux parties : l'action habituelle à gauche, la flèche à
 *  droite ouvre les variantes. Le dessin que MAV a envoyé le 23/09. */
function BoutonScinde({ children, onPrincipal, onFleche, pending, rouge, titre }: {
  children: React.ReactNode; onPrincipal: () => void; onFleche: () => void;
  pending?: boolean; rouge?: boolean; titre?: string;
}) {
  return (
    <span className={`bsc${rouge ? " rouge" : ""}`}>
      <button type="button" className="bsc-m" disabled={pending} title={titre} onClick={onPrincipal}>
        {pending ? "…" : children}
      </button>
      <button type="button" className="bsc-c" disabled={pending} title="Modifier le message avant l'envoi"
        aria-label="Autres options" onClick={onFleche}>
        <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </span>
  );
}

function CarteProposition({ p, contactId, vignette, note, jours, onRelancer, onRelancerModale, onRafraichir }: {
  p: PropositionLigne; contactId: string; vignette: VignetteData; note: string; jours?: number;
  onRelancer: () => void; onRelancerModale: () => void; onRafraichir: () => void;
}) {
  const [pending, start] = useTransition();
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState("");
  const [apres, setApres] = useState<string | null>(null);
  const [recherche, setRecherche] = useState<DepartRecherche | null>(null);
  const [creerPour, setCreerPour] = useState<{ id: string; nom: string } | null>(null);
  const immeubleId = p.immeuble?.id ?? "";
  const ouverte = !p.refusee && !STATUTS_CLOS_PROP.has(p.statut ?? "");
  const aRelancer = ouverte && !p.stop && (jours === undefined || jours >= JOURS_RELANCE);

  const ouvrirRecherche = (rid: string) =>
    start(async () => {
      const r = await departRecherche(rid);
      if (r?.recherche) setRecherche(r.recherche);
    });

  return (
    <div className={`cfc${ouverte ? "" : " pale"}`}>
      <div className="cfc-g">
        <span className="cfc-pic"><svg viewBox="0 0 24 24">{IC.propositions}</svg></span>
      </div>
      <div className="cfc-c">
        <div className="cfc-l1">
          <span className="cfc-t">{p.quand}</span>
          {p.statut && <span className={`cfc-st${p.refusee ? " rouge" : p.statut === "Envoyée" ? "" : " off"}`}>{p.statut}</span>}
          <span style={{ flex: 1 }} />
          {/* #366 — les recherches matchées : un clic ouvre la recherche. */}
          {p.recherches.map((r) => (
            <button key={r.id} type="button" className="cfc-rch" disabled={pending}
              title="Ouvrir cette recherche pour la modifier" onClick={() => ouvrirRecherche(r.id)}>
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
              {r.libelle}
            </button>
          ))}
          {/* #366 — le nom du client, avec sa vignette. */}
          <span className="cfc-qui">
            <VignetteContact v={vignette} immeuble={p.immeuble?.libelle} />
            {note && <b className={`note n${note}`}>{note}</b>}
          </span>
        </div>
        <div className="cfc-l2">
          {p.motif && <span className="cfc-motif">✕ {p.motif}</span>}
          {p.relanceLe && <span className="cfc-num">Relancé le {p.relanceLe}</span>}
          {aRelancer && (
            <span className="cfc-past">
              À relancer{jours !== undefined ? ` · ${jours} j` : ""}
            </span>
          )}
          {p.stop && ouverte && <span className="cfc-num">Relances coupées</span>}
        </div>
        <NoteProposition propositionId={p.id} contactId={contactId} valeur={p.commentaire ?? ""} />
        <div className="cfc-l3">
          {p.immeuble && (
            <Link className="cfc-im" href={`/bien/${p.immeuble.id}`}>
              <svg viewBox="0 0 24 24">{IC.immeubles}</svg>{p.immeuble.libelle}
            </Link>
          )}
          {p.dossier && p.immeuble && (
            <Link className="cfc-doc" href={`/bien/${p.immeuble.id}?ecran=dossiers`}>Dossier <b>{p.dossier.version}</b></Link>
          )}
          {p.dossier?.pdf && (
            <a className="cfc-doc" href={p.dossier.pdf} target="_blank" rel="noreferrer">📎 PDF</a>
          )}
          <span style={{ flex: 1 }} />
          {ouverte ? (
            <span className="cfc-btns">
              <button className="fadd" type="button" disabled={pending} style={{ color: "var(--red)", borderColor: "#e6b3b3" }}
                onClick={() => setRefus((v) => !v)}>Refuser</button>
              <BoutonScinde pending={pending} onPrincipal={onRelancer} onFleche={onRelancerModale}
                titre={jours === undefined ? "Envoyer la relance habituelle" : jours === 0 ? "Envoyée aujourd'hui" : `Sans nouvelle depuis ${jours} jour${jours > 1 ? "s" : ""} — envoyer la relance habituelle`}>
                Relancer
              </BoutonScinde>
            </span>
          ) : (
            <button className="fadd" type="button" disabled={pending}
              onClick={() => start(async () => {
                await setPropositionStatut(immeubleId, p.id, "reactiver", undefined, undefined, contactId);
                onRafraichir();
              })}>
              ↻ Réactiver
            </button>
          )}
        </div>
        {/* #365 — le refus : une barre de texte pour dire pourquoi, sur la carte. */}
        {refus && ouverte && (
          <div className="cfc-refus">
            <input className="min" value={motif} autoFocus placeholder="Pourquoi il refuse — ex. : pas de résidentiel, trop cher, secteur"
              onChange={(e) => setMotif(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setRefus(false); }} />
            <button type="button" className="cfc-refus-x" onClick={() => setRefus(false)}>Annuler</button>
            <button type="button" className="cfc-refus-go" disabled={pending || !motif.trim()}
              onClick={() => start(async () => {
                await setPropositionStatut(immeubleId, p.id, "refuser", motif.trim(), undefined, contactId);
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

/**
 * La fenêtre derrière la flèche : le texte de la relance, modifiable, les
 * dossiers qu'elle cite (retirables), et l'envoi — ou « ouvrir dans le client
 * mail » quand aucune boîte n'est branchée.
 */
function ModaleRelanceContact({ ouvertes, ids, client, agent, email, contactId, onFermer, onFait }: {
  ouvertes: { p: PropositionLigne; jours?: number }[];
  ids: string[];
  client: (ids: string[]) => ClientRelance;
  agent?: { id?: string; nom?: string; tel?: string };
  email: string;
  contactId: string;
  onFermer: () => void;
  onFait: (message: string) => void;
}) {
  const [pending, start] = useTransition();
  const [retenus, setRetenus] = useState<string[]>(ids);
  const [texte, setTexte] = useState<string | null>(null);
  const [possible, setPossible] = useState<boolean | null>(null);
  const c = client(retenus);
  const corps = texte ?? messageRelance(c, agent);
  const objet = objetRelance(c);
  const agentId = agent?.id;
  useEffect(() => {
    let vivant = true;
    relanceEnvoiPossible(agentId)
      .then((p) => { if (vivant) setPossible(p); })
      .catch(() => { if (vivant) setPossible(false); });
    return () => { vivant = false; };
  }, [agentId]);

  const basculer = (id: string) =>
    setRetenus((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="modal-ov" onClick={onFermer}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Relancer {c.nom}<button type="button" onClick={onFermer}>✕</button></div>
        <div className="modal-b">
          <span className="mlab">Dossiers cités dans la relance</span>
          <div className="rlz-lignes" style={{ padding: 0, marginBottom: 12 }}>
            {ouvertes.map(({ p, jours }) => {
              const off = !retenus.includes(p.id);
              return (
                <div key={p.id} className={`rlz-l${off ? " off" : ""}`}>
                  <span>{p.immeuble?.libelle}</span>
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
          <textarea className="min" rows={12} value={corps} onChange={(e) => setTexte(e.target.value)} />
          <div className="asst-note">
            Part de la boîte de {agent?.nom ?? "l'agent"} vers <b>{email || "— aucune adresse sur la fiche —"}</b>.
            Le dossier est cité avec le lien de sa dernière version.
            {possible === false && " Aucune boîte d'envoi n'est branchée : ouvrez le message dans votre client mail."}
          </div>
        </div>
        <div className="modal-f">
          <button className="fadd" type="button" onClick={onFermer}>Fermer</button>
          <span className="sp" style={{ flex: 1 }} />
          <a className="fadd" href={`mailto:${email}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`}
            onClick={() => start(async () => {
              await marquerRelances(retenus, [`/contact/${contactId}`]);
            })}>
            Ouvrir dans le client mail
          </a>
          <button className="kgo" type="button" disabled={pending || !email || retenus.length === 0 || possible === false}
            onClick={() => start(async () => {
              try {
                const r = await envoyerRelances(
                  [{ contactId, email, objet, corps, propositionIds: retenus }],
                  agent?.id, undefined, [`/contact/${contactId}`],
                );
                onFait(r.envoyes ? `Relance envoyée à ${email}.` : `Échec : ${r.journal[0] ?? "l'envoi n'est pas parti."}`);
              } catch (e) {
                onFait(`Échec : ${e instanceof Error ? e.message : "l'envoi a échoué."}`);
              }
            })}>
            <span className="ch">›</span> Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

/** La note de suivi d'une proposition, écrite directement sur la carte comme
 *  dans le BO : on tape, on sort du champ, c'est enregistré. */
function NoteProposition({ propositionId, contactId, valeur }: {
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

/** Une mesure de la carte immeuble : picto + valeur, grisée si absente. */
function Mesure({ titre, valeur, d }: { titre: string; valeur?: string; d: string }) {
  return (
    <span className={`cfc-m${valeur ? " on" : ""}`} title={titre}>
      <svg viewBox="0 0 24 24"><path d={d} /></svg>
      {valeur ?? "—"}
    </span>
  );
}

/** « Supprimer ce contact » : la fiche est archivée avec son motif, jamais
 *  effacée — le miroir est réécrit chaque nuit depuis Bubble, un effacement
 *  reviendrait, et on perdrait l'historique au passage. */
function Suppression({ id, nom, onClose }: { id: string; nom: string; onClose: () => void }) {
  const [motif, setMotif] = useState(MOTIFS_ARCHIVAGE[0]);
  const [pending, start] = useTransition();
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><b>Supprimer {nom}</b><button type="button" onClick={onClose}>✕</button></div>
        <div className="modal-b">
          <p className="vit-note" style={{ marginTop: 0 }}>
            La fiche sort des listes et des recherches. Elle est conservée avec son motif :
            l&apos;historique des propositions et des mandats reste consultable.
          </p>
          <label className="vit-l">
            <span>Motif</span>
            <select value={motif} onChange={(e) => setMotif(e.target.value)}>
              {MOTIFS_ARCHIVAGE.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
        </div>
        <div className="modal-f">
          <span style={{ flex: 1 }} />
          <button type="button" className="cfx-b rouge" disabled={pending}
            onClick={() => start(async () => { await archiverContact(id, motif); onClose(); })}>
            Supprimer ce contact
          </button>
        </div>
      </div>
    </div>
  );
}
