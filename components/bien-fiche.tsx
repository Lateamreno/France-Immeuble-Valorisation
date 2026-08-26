"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import type { AcheteursData, BienData } from "@/lib/bubble/server";
import { dmy, euros, keur } from "@/lib/format";
import {
  chargerAcheteurs, ouvrirEstimation, reactiver, setApporteur, setPropositionStatut,
  supprimerEstimation, updateBien, updateContact,
} from "@/lib/bo/actions";
import { EstimationWizard, type RepriseEstimation } from "@/components/estimation-wizard";
import { EstimationEnLecture } from "@/components/estimation-lecture";
import type { EstimationLecture } from "@/lib/bo/estimation-lecture";
import { LocatifTabs, ONGLETS_LOCATIF } from "@/components/locatif";
import { SuiviModal } from "@/components/suivi-modal";
import { AddMandatButton } from "@/components/mandat-create";
import { SectionDiffusion } from "@/components/diffusion";
import { lireEtat } from "@/lib/diffusion";
import { EmplacementTabs, ONGLETS_EMPLACEMENT } from "@/components/emplacement";
import { TechniqueTabs, ONGLETS_TECHNIQUE } from "@/components/technique";
import { AddDossierButton } from "@/components/dossier-create";
import { AddOffreButton, AddVisiteButton, OffreActions, VisiteActions } from "@/components/commercialisation";
import { Acheteurs } from "@/components/acheteurs";
import { Avion, Corbeille, Picto } from "@/components/pictos";
import { MOTIFS_VENTE } from "@/lib/referentiels";
import { DocumentsCoffre } from "@/components/fichiers";
import { PhotosEcran } from "@/components/photos";
import { ContactPicker } from "@/components/contact-picker";
import { copierTexte } from "@/components/copier";
import { PrixEcran } from "@/components/prix";
import { PasserEnDecoupe, SectionDecoupe } from "@/components/decoupe-fiche";
import type { OperationDecoupe } from "@/lib/bubble/server";
import { PHASES, phase as phaseDe } from "@/lib/decoupe";



type SectionKey =
  | "suivi" | "proprietaire" | "emplacement" | "locatif" | "technique"
  | "prix" | "photos" | "estimations" | "mandats" | "dossiers" | "tous-docs" | "diffusion"
  | "acheteurs" | "notes" | "decoupe"
  /* Écran greffé sur la fiche (l'estimation, le mandat) : il reste monté
     pendant qu'on visite les autres sections, pour ne rien perdre de la
     saisie (#96, #125). */
  | "encours";

/**
 * L'estimation ouverte dans la fiche (retour #125).
 *
 * MAV, deux fois : « l'estimation en cours doit faire partie de la page […]
 * ça ne doit pas être une page à part, ça ne doit pas être une modale ni
 * rien. » Elle vit donc dans l'état de la fiche : passer d'un onglet du rail à
 * l'autre ne la démonte pas, et ouvrir une autre estimation ne fait pas
 * changer d'URL.
 */
export type EcranEstimation =
  /** Une estimation qu'on est en train de faire. */
  | { mode: "neuve" }
  /** Une estimation existante, rouverte pour l'envoyer (#98)… */
  | { mode: "reprise"; reprise: RepriseEstimation; lecture: EstimationLecture }
  /** …ou simplement relue, figée à sa date (#55). */
  | {
    mode: "lecture"; reprise: RepriseEstimation; lecture: EstimationLecture;
    /** Ce que la fiche dit aujourd'hui, là où ça diverge (retour #143). */
    ecarts?: Record<string, { alors: string; aujourdhui: string }>;
  };

const LIBELLE_EST: Record<EcranEstimation["mode"], string> = {
  neuve: "Estimation en cours",
  reprise: "Estimation à envoyer",
  lecture: "Estimation consultée",
};

const I = {
  suivi: <><path d="M4 9a8 8 0 1 1-1 5" /><path d="M4 4v5h5" /><path d="M12 8v4l3 2" /></>,
  user: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  signpost: <><path d="M12 3v3M12 13v8M8 21h8" /><path d="M5 6h12l2 2.5L17 11H5z" /></>,
  key: <><circle cx="8" cy="14" r="4" /><path d="M11 11 20 2M16 6l2.5 2.5M13 9l2 2" /></>,
  tech: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="4.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 10.5V17M12 7.2v.2" /></>,
  cam: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8 7l1.5-3h5L16 7" /><circle cx="12" cy="13" r="3.4" /></>,
  folder: <><path d="M3 6h6l2 2.5h10V20H3z" /></>,
  calc: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 12h.1M12 12h.1M15 12h.1M9 16h.1M12 16h.1M15 16h.1" /></>,
  brief: <><path d="M5 8h14v12H5z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  pdf: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.6 14.2c2.4.2 4.2 1.6 4.6 4.3" /></>,
  note: <><path d="M4 4h16v12l-4 4H4z" /><path d="M16 20v-4h4" /></>,
  phone: <><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 5 9-5" /></>,
  maps: <><path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6z" /><path d="M9 3v15M15 6v15" /></>,
  decoupe: <><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></>,
  sablier: <><path d="M7 3h10M7 21h10" /><path d="M8 3v3.5c0 2 4 3.3 4 5.5s-4 3.5-4 5.5V21M16 3v3.5c0 2-4 3.3-4 5.5s4 3.5 4 5.5V21" /></>,
  antenne: <><circle cx="12" cy="12" r="2.4" /><path d="M7.8 7.8a5.9 5.9 0 0 0 0 8.4M16.2 7.8a5.9 5.9 0 0 1 0 8.4M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 4.6a10.4 10.4 0 0 1 0 14.8" /></>,
};

/** Sous-onglets repris dans le rail (retour MAV #12) : cliquer sur une
 *  section ouvre directement ses sous-menus, sans perdre les onglets
 *  horizontaux du contenu. */
const SOUS_ONGLETS: Partial<Record<SectionKey, readonly { key: string; label: string }[]>> = {
  emplacement: ONGLETS_EMPLACEMENT,
  locatif: ONGLETS_LOCATIF,
  technique: ONGLETS_TECHNIQUE,
};

/** Valeur copiable en un clic (retour MAV #11 : tel et e-mail séparés). */
function Copiable({ valeur, type }: { valeur: string; type: "tel" | "mail" }) {
  const [ok, setOk] = useState(false);
  return (
    <span className="cpv">
      <a href={`${type === "tel" ? "tel:" : "mailto:"}${valeur}`} className="v">
        <svg viewBox="0 0 24 24">{type === "tel" ? I.phone : I.mail}</svg>{valeur}
      </a>
      <button type="button" title={ok ? "Copié" : "Copier"} onClick={async (e) => {
        e.preventDefault();
        await copierTexte(valeur);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}>{ok ? "✓" : "⧉"}</button>
    </span>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="frow">{children}</div>;
}

export function BienFiche({
  b, contenu, contenuLabel, contenuIcone, operation, secteur, envoiActif, ouvrir, cleEcran,
}: {
  b: BienData;
  /** Opération de découpe ouverte sur cet immeuble, s'il y en a une. */
  operation?: OperationDecoupe | null;
  /** Contenu qui remplace les sections de la fiche (mandat en cours de
   *  rédaction) : le rail de droite reste affiché pour garder l'accès aux
   *  informations de l'immeuble pendant la saisie. */
  contenu?: React.ReactNode;
  /** Ce que le rail annonce pour cet écran. Défaut : l'estimation. */
  contenuLabel?: string;
  contenuIcone?: "estimation" | "mandat";
  /** Prix du secteur : le wizard d'estimation s'en sert, la fiche les porte
   *  donc en permanence pour pouvoir le monter sans changer de page (#125). */
  secteur?: Record<string, unknown> | null;
  /** Vrai quand la boîte d'envoi est configurée. */
  envoiActif?: boolean;
  /** Estimation à ouvrir d'emblée (accès direct par l'URL). */
  ouvrir?: EcranEstimation;
  /**
   * Ce que l'URL demande d'ouvrir — l'identifiant du mandat, de l'estimation.
   *
   * Il faut ça parce que Next réutilise le composant d'une adresse à l'autre
   * quand elles ont la même forme. Sans lui : on ouvre un mandat, on va voir
   * la liste des mandats, on clique sur un mandat — l'adresse change, mais
   * l'écran restait sur la liste. C'est exactement le « je n'arrive plus à
   * revenir dessus » de MAV (retour #137).
   */
  cleEcran?: string;
}) {
  /* L'estimation ouverte, s'il y en a une : elle vit ici, pas dans une route. */
  const [est, setEst] = useState<EcranEstimation | null>(ouvrir ?? null);
  const [chargement, setChargement] = useState<string | null>(null);
  const [erreurEst, setErreurEst] = useState<string | null>(null);
  const [sect, setSect] = useState<SectionKey>(contenu || ouvrir ? "encours" : "suivi");

  /* Nouvelle demande d'ouverture : on montre l'écran demandé. Ajuster l'état
     pendant le rendu est la façon prévue de réagir à un changement de props ;
     un effet ferait clignoter la liste avant de basculer. */
  const [cleVue, setCleVue] = useState(cleEcran);
  if (cleEcran !== cleVue) {
    setCleVue(cleEcran);
    if (cleEcran) {
      setSect("encours");
      if (ouvrir) setEst(ouvrir);
    } else if (cleVue) {
      /* On vient de quitter l'écran greffé (mandat envoyé, estimation marquée
         envoyée…) : sans ça, la fiche restait sur un panneau vide. */
      setEst(null);
      setSect(cleVue.startsWith("mandat") ? "mandats" : "estimations");
    }
  }

  /**
   * Ouvre une estimation dans la page. Rien n'est démonté : ce qui est en
   * cours de saisie ailleurs reste en place, et l'URL ne bouge pas.
   */
  const ouvrirEst = (mode: "reprise" | "lecture", eid: string) => {
    setChargement(eid);
    setErreurEst(null);
    /* On ne bascule qu'une fois les données là : basculer d'abord laisserait
       l'écran vide en cas d'échec, sans rien pour revenir en arrière. */
    ouvrirEstimation(eid)
      .then((r) => {
        if (!r) { setErreurEst("Estimation introuvable."); return; }
        setEst({ mode, reprise: r.reprise, lecture: r.lecture, ecarts: r.ecarts });
        setSect("encours");
      })
      .catch((e) => setErreurEst(e instanceof Error ? e.message : String(e)))
      .finally(() => setChargement(null));
  };
  const [sous, setSous] = useState<Partial<Record<SectionKey, string>>>({});
  /** Sections dont les sous-menus sont repliés (retour #62 : recliquer plie). */
  const [plies, setPlies] = useState<Set<SectionKey>>(new Set());
  const basculer = (k: SectionKey) => {
    if (sect === k && SOUS_ONGLETS[k]) {
      setPlies((p) => {
        const n = new Set(p);
        if (n.has(k)) n.delete(k);
        else n.add(k);
        return n;
      });
    } else {
      setSect(k);
      setPlies((p) => { const n = new Set(p); n.delete(k); return n; });
    }
  };
  const majSous = (k: SectionKey) => (t: string) => setSous((p) => ({ ...p, [k]: t }));
  const im = b.im;
  const ok = (k: string) => im[k] === true;

  const sections: {
    key: SectionKey; label: string; icon: React.ReactNode;
    indicator?: React.ReactNode; sub?: boolean;
  }[] = [
    { key: "suivi", label: "Suivi", icon: I.suivi, indicator: <span className="ncount">{b.suivis.length}</span> },
    { key: "proprietaire", label: "Propriétaire", icon: I.user, indicator: ok("ok_proprio") ? <span className="okv">✓</span> : <span className="warn3" /> },
    { key: "emplacement", label: "Emplacement", icon: I.signpost, indicator: ok("ok_emplacement") ? <span className="okv">✓</span> : <span className="warn3" /> },
    { key: "locatif", label: "Etat locatif", icon: I.key, indicator: ok("ok_locatif") ? <span className="okv">✓</span> : <span className="warn3" /> },
    { key: "technique", label: "Etat technique", icon: I.tech, indicator: ok("ok_composants") ? <span className="okv">✓</span> : <span className="warn3" /> },
    { key: "prix", label: "Description et prix", icon: I.info, indicator: ok("ok_prix") && ok("ok_descriptif") ? <span className="okv">✓</span> : <span className="warn3" /> },
    { key: "photos", label: "Photos", icon: I.cam, indicator: ok("ok_photos") ? <span className="okv">✓</span> : <span className="ncount">{b.photos.length}</span> },
  ];

  const docSub: typeof sections = [
    { key: "estimations", label: "Estimations", icon: I.calc, sub: true, indicator: <span className="right"><span className="nmoney">{euros(im.prix_hai_estim as number | undefined) ?? ""}</span><span className="ncount">{b.estimations.length}</span></span> },
    { key: "mandats", label: "Mandats", icon: I.brief, sub: true, indicator: <span className="ncount">{b.mandats.length}</span> },
    { key: "dossiers", label: "Dossiers", icon: I.pdf, sub: true, indicator: <span className="ncount">{b.dossiers.length}</span> },
    { key: "tous-docs", label: "Tous les documents", icon: I.folder, sub: true, indicator: <span className="ncount">{b.estimations.length + b.dossiers.length + b.mandats.length}</span> },
  ];

  return (
    <div className="fiche">
      <div className="fiche-main">
        <div className={`fiche-inner${sect === "locatif" || sect === "encours" || est ? " wide" : ""}`}>
          {/* L'écran en cours n'est jamais démonté, seulement masqué : c'est ce
              qui permet d'aller voir l'état locatif ou les photos et de
              revenir à l'estimation sans avoir rien perdu (#96).
              #159 — et il ne se masque plus tout seul : « tant que je ne l'ai
              pas fermée ou annulée, la page reste en place même quand je
              change d'onglet dans la sidebar de droite ». Le clic sur le rail
              choisit donc la section qu'on trouvera en refermant. */}
          {contenu && <div hidden={sect !== "encours"}>{contenu}</div>}
          {est && (
            <div>
              {est.mode === "lecture" ? (
                <EstimationEnLecture
                  key={est.reprise.id}
                  e={est.lecture}
                  immeubleId={String(b.im._id)}
                  pdfUrl={est.reprise.pdfUrl}
                  ecarts={est.ecarts}
                  onEnvoyer={() => setEst({ ...est, mode: "reprise" })}
                />
              ) : (
                /* La clé change avec l'estimation : rouvrir une autre fiche ne
                   doit pas réutiliser la saisie de la précédente. */
                <EstimationWizard
                  key={est.mode === "neuve" ? "neuve" : est.reprise.id}
                  b={b}
                  secteur={secteur ?? null}
                  envoiActif={envoiActif}
                  reprise={est.mode === "neuve" ? undefined : est.reprise}
                  onFermer={() => { setEst(null); if (sect === "encours") setSect("estimations"); }}
                />
              )}
            </div>
          )}
          {sect === "encours" && !contenu && !est && (
            <div className="fempty">
              {chargement ? "Ouverture de l'estimation…" : "Aucune estimation ouverte."}
            </div>
          )}
          {/* Tant qu'une estimation est ouverte, elle occupe l'écran : les
              sections de la fiche attendent qu'on la referme (#159). */}
          {!est && (
            <>
              {sect === "suivi" && <SuiviSection b={b} />}
              {sect === "proprietaire" && <ProprioSection b={b} />}
              {sect === "emplacement" && <EmplacementSection b={b} tab={sous.emplacement} onTab={majSous("emplacement")} />}
              {sect === "locatif" && <LocatifSection b={b} tab={sous.locatif} onTab={majSous("locatif")} />}
              {sect === "technique" && <TechniqueSection b={b} tab={sous.technique} onTab={majSous("technique")} />}
              {sect === "prix" && <PrixSection b={b} />}
              {sect === "photos" && <PhotosSection b={b} />}
              {sect === "estimations" && (
                <EstimationsSection
                  b={b}
                  onNeuve={() => { setEst({ mode: "neuve" }); setSect("encours"); }}
                  onOuvrir={ouvrirEst}
                  enCours={chargement}
                  erreur={erreurEst}
                />
              )}
              {sect === "mandats" && <MandatsSection b={b} />}
              {sect === "diffusion" && (
                <SectionDiffusion immeubleId={String(b.im._id)} etat={lireEtat(b.im)} />
              )}
              {sect === "dossiers" && <DossiersSection b={b} />}
              {sect === "tous-docs" && (
                <>
                  <SectTitle icon={I.folder} title="Tous les documents" chips={<span className="fchip">{b.documents.length} documents</span>} />
                  <DocumentsCoffre b={b} />
                </>
              )}
              {sect === "decoupe" && operation && (
                <SectionDecoupe o={operation} immeubleId={String(b.im._id)} />
              )}
              {sect === "acheteurs" && <AcheteursSection b={b} />}
              {sect === "notes" && <NotesSection b={b} />}
            </>
          )}
        </div>
      </div>

      <aside className="brail">
        <div className="brail-head">
          <div className="bthumb">
            {b.photoUrl && <Image src={b.photoUrl} alt="" width={128} height={128} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            <span className="rv">{b.agentInitials}</span>
          </div>
          <div className="bh">
            <div className="bt">{b.ville}</div>
            <div><span className="bst">{b.statut}</span></div>
            {b.prix && <div className="bp">{b.prix}</div>}
          </div>
        </div>
        {b.standby && b.standby !== "Traité" && <BandeauAttente b={b} />}
        <nav>
          {contenu && (
            <button
              type="button"
              className={`srow2 encours${sect === "encours" ? " on" : ""}`}
              onClick={() => setSect("encours")}
            >
              <span className="sic2">
                <svg viewBox="0 0 24 24">{contenuIcone === "mandat" ? I.brief : I.calc}</svg>
              </span>
              {contenuLabel ?? "Estimation en cours"}
              <span className="right"><span className="pastille" /></span>
            </button>
          )}
          {/* L'estimation ouverte : une entrée du rail comme les autres. On
              passe à l'état locatif et on revient, rien n'a bougé (#125). */}
          {est && !contenu && (
            <div className={`srow2 encours ouvert${sect === "encours" ? " on" : ""}`}>
              <button type="button" className="srow2-in" onClick={() => setSect("encours")}>
                <span className="sic2"><svg viewBox="0 0 24 24">{I.calc}</svg></span>
                {LIBELLE_EST[est.mode]}
                <span className="right"><span className="pastille" /></span>
              </button>
              <button
                type="button" className="srow2-x" title="Fermer l'estimation"
                onClick={() => { setEst(null); setSect("estimations"); }}
              >✕</button>
            </div>
          )}
          {sections.map((s) => (
            <div key={s.key}>
              <button type="button" className={`srow2${sect === s.key ? " on" : ""}`} onClick={() => basculer(s.key)}>
                <span className="sic2"><svg viewBox="0 0 24 24">{s.icon}</svg></span>
                {s.label}
                {s.key === "emplacement" && <MapsBtn b={b} />}
                <span className="right">{s.indicator}</span>
              </button>
              {sect === s.key && !plies.has(s.key) && SOUS_ONGLETS[s.key]?.map((o) => (
                <button key={o.key} type="button"
                  className={`srow2 sub${(sous[s.key] ?? SOUS_ONGLETS[s.key]![0].key) === o.key ? " on" : ""}`}
                  onClick={() => setSous((p) => ({ ...p, [s.key]: o.key }))}>
                  <Picto nom={o.key} />
                  {o.label}
                </button>
              ))}
            </div>
          ))}
          {operation && (
            <button
              type="button"
              className={`srow2 sdecoupe${sect === "decoupe" ? " on" : ""}`}
              onClick={() => setSect("decoupe")}
            >
              <span className="sic2"><svg viewBox="0 0 24 24">{I.decoupe}</svg></span>
              Découpe
              <span className="right">
                <span className="pill-dec">{phaseDe(operation.phase).n}/{PHASES.length}</span>
              </span>
            </button>
          )}
          <div className="srow2" style={{ cursor: "default" }}>
            <span className="sic2"><svg viewBox="0 0 24 24">{I.folder}</svg></span>
            Documents
          </div>
          {docSub.map((s) => (
            <button key={s.key} type="button" className={`srow2 sub${sect === s.key ? " on" : ""}`} onClick={() => setSect(s.key)}>
              <span className="sic2"><svg viewBox="0 0 24 24">{s.icon}</svg></span>
              {s.label}
              <span className="right">{s.indicator}</span>
            </button>
          ))}
          {/* Diffusion : le bien vu de l'extérieur. Placée juste avant les
              acheteurs, parce que c'est elle qui les amène. */}
          <button type="button" className={`srow2${sect === "diffusion" ? " on" : ""}`} onClick={() => setSect("diffusion")}>
            <span className="sic2"><svg viewBox="0 0 24 24">{I.antenne}</svg></span>
            Diffusion
            <span className="right">
              {typeof im.pb_listing_id === "string" && im.pb_listing_id ? (
                im.pb_a_resynchroniser === true
                  ? <span className="pill-dec">à republier</span>
                  : <span className="okv">✓</span>
              ) : (
                <span className="ncount">—</span>
              )}
            </span>
          </button>
          <button type="button" className={`srow2${sect === "acheteurs" ? " on" : ""}`} onClick={() => setSect("acheteurs")}>
            <span className="sic2"><svg viewBox="0 0 24 24">{I.users}</svg></span>
            Acheteurs
            <span className="right"><span className="ncount">{b.propositions.total}</span></span>
          </button>
          <button type="button" className={`srow2${sect === "notes" ? " on" : ""}`} onClick={() => setSect("notes")}>
            <span className="sic2"><svg viewBox="0 0 24 24">{I.note}</svg></span>
            Notes
          </button>
          {/* Tant qu'aucune opération n'est ouverte, l'entrée « Découpe »
              n'existe pas : c'est ce bouton qui la fait naître. */}
          {!operation && (
            <div className="brail-act">
              <PasserEnDecoupe
                immeubleId={String(im._id)}
                valeurBloc={typeof im.prix_hai === "number" ? (im.prix_hai as number) : undefined}
              />
            </div>
          )}
        </nav>
        <div className="brail-foot">
          <button className="kbtn" type="button" aria-label="Autres actions">
            <svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></svg>
          </button>
          <span className="sp" />
          <ReactiverBtn immeubleId={String(im._id)} />
        </div>
      </aside>
    </div>
  );
}

/** Bandeau « en attente » du rail (retour #73).
 *
 *  Le bandeau disait seulement pourquoi le bien dormait ; il ne disait pas
 *  jusqu'à quand. On tient les trois informations sur la même ligne, à
 *  hauteur inchangée : le motif, l'échéance, et le temps qui reste. La barre
 *  d'avancement est posée sur le bord bas du bandeau, elle ne coûte donc
 *  aucun pixel de hauteur, et vire au rouge dès que la date est passée. */
function BandeauAttente({ b }: { b: BienData }) {
  const attente = b.suivis.find((s) => s.relance) ?? b.suivis[0];
  const motif = attente?.motif ?? b.standby ?? "En attente";
  // Les dates de la fiche sont formatées en jj/mm/aa (parfois jj/mm/aaaa).
  const jour = (s?: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{2}(?:\d{2})?)$/.exec(s ?? "");
    if (!m) return undefined;
    const an = +m[3];
    return new Date(an < 100 ? 2000 + an : an, +m[2] - 1, +m[1]);
  };
  const fin = jour(attente?.relance);
  const debut = jour(attente?.date);

  if (!fin) {
    return (
      <div className="brail-prog" title={motif}>
        <span className="ic"><svg viewBox="0 0 24 24">{I.sablier}</svg></span>
        <span className="pill">{motif}</span>
        <span className="sansfin">sans échéance</span>
      </div>
    );
  }

  const jourMs = 86400000;
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const restants = Math.round((fin.getTime() - aujourdhui.getTime()) / jourMs);
  const retard = restants < 0;
  const total = debut ? Math.max(1, Math.round((fin.getTime() - debut.getTime()) / jourMs)) : 0;
  const avance = total ? Math.min(100, Math.max(0, ((total - restants) / total) * 100)) : retard ? 100 : 0;
  const fr = fin.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

  return (
    <div
      className={`brail-prog${retard ? " retard" : ""}`}
      title={
        `${motif} — ${debut ? `du ${attente?.date} au ` : "jusqu'au "}${attente?.relance}` +
        ` (${retard ? `en retard de ${-restants} j` : restants === 0 ? "échéance aujourd'hui" : `${restants} j restants`})`
      }
    >
      <span className="ic"><svg viewBox="0 0 24 24">{I.sablier}</svg></span>
      <span className="pill">{motif}</span>
      <span className="fin">{fr}</span>
      <span className="jr">{retard ? `+${-restants} j` : `J-${restants}`}</span>
      <span className="jauge"><i style={{ width: `${avance}%` }} /></span>
    </div>
  );
}

/** Icône Google Maps du rail (retour MAV #12) : ouvre l'immeuble dans une
 *  fenêtre, sans quitter la page en cours. */
function MapsBtn({ b }: { b: BienData }) {
  const [ouvert, setOuvert] = useState(false);
  const geo = b.adr?.geo as { lat?: number; lng?: number } | undefined;
  const adresse = `${b.adresse} ${String(b.im.adresse_zipcode ?? "")} ${String(b.im.adresse_ville ?? "")}`.trim();
  const q = geo?.lat !== undefined && geo?.lng !== undefined ? `${geo.lat},${geo.lng}` : adresse;
  const lien = String(b.adr?.maps_url ?? "") || `https://www.google.com/maps/search/${encodeURIComponent(adresse)}`;
  const [mode, setMode] = useState<"plan" | "rue">("plan");
  // Avec une clé Google, on utilise l'API Embed officielle, qui sait afficher
  // la façade en Street View ; sans clé, l'embed public affiche le plan.
  const cle = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const src = cle
    ? mode === "rue"
      ? `https://www.google.com/maps/embed/v1/streetview?key=${cle}&location=${encodeURIComponent(q)}&fov=80`
      : `https://www.google.com/maps/embed/v1/place?key=${cle}&q=${encodeURIComponent(q)}&zoom=18`
    : `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=18&output=embed`;

  return (
    <>
      <span className="smaps" title="Voir l'immeuble sur Google Maps" role="button" tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setOuvert(true); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setOuvert(true); } }}>
        <svg viewBox="0 0 24 24">{I.maps}</svg>
      </span>
      {ouvert && createPortal(
        <div className="modal-ov">
          <div className="modal lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              {adresse || b.ville}
              <button type="button" onClick={() => setOuvert(false)}>✕</button>
            </div>
            <iframe className="mapsframe" title="Google Maps" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={src} />
            <div className="modal-f">
              {cle && (
                <span className="mrow" style={{ marginRight: 8 }}>
                  <button type="button" className={`mopt${mode === "plan" ? " on" : ""}`} onClick={() => setMode("plan")}>Plan</button>
                  <button type="button" className={`mopt${mode === "rue" ? " on" : ""}`} onClick={() => setMode("rue")}>Street View</button>
                </span>
              )}
              <a className="mopt" href={lien} target="_blank" rel="noreferrer">Ouvrir dans Google Maps ↗</a>
              <a className="mopt" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer">Street View ↗</a>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function SectTitle({ icon, title, chips }: { icon: React.ReactNode; title: string; chips?: React.ReactNode }) {
  return (
    <div className="sect-title">
      <div className="t"><svg viewBox="0 0 24 24">{icon}</svg>{title}</div>
      {chips && <div className="chips">{chips}</div>}
    </div>
  );
}

function SuiviSection({ b }: { b: BienData }) {
  const [tousSuivis, setTousSuivis] = useState(false);
  const im = b.im;
  return (
    <>
      <SectTitle icon={I.suivi} title="Suivi" />
      <div className="fcards">
        <div className="fcard">
          <span className="fic"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg></span>
          <div><div className="k">Création</div><div className="v">{dmy(im["Created Date"])}</div></div>
        </div>
        <div className="fcard">
          <span className="fic"><svg viewBox="0 0 24 24">{I.user}</svg></span>
          <div><div className="k">Suivi</div><div className="v">{b.agentInitials}</div></div>
        </div>
        <div className="fcard">
          <span className="fic"><svg viewBox="0 0 24 24"><path d="M4 20l4-1L20 7l-3-3L5 16z" /></svg></span>
          <div><div className="k">Dernière modification</div><div className="v">{dmy(im["Modified Date"])}</div></div>
        </div>
      </div>

      <div className="fh2">Source de l&apos;immeuble</div>
      <div className="fcards" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="fcard">
          <span className="fic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" /></svg></span>
          <div><div className="k">Source</div><div className="v">{String(im.source ?? "—")}</div></div>
        </div>
        <ApporteurCard b={b} />
      </div>

      <div className="fh2">Historique des échanges ({b.suivis.length})</div>
      <AddSuiviButton b={b} />
      {(tousSuivis ? b.suivis : b.suivis.slice(0, 3)).map((s, i) => (
        <div className="hitem" key={i}>
          <div className="hav">
            <span className="ava">{b.agentInitials}</span>
            {s.canal && (
              <span className={`canal${s.canal === "E-mail" ? " mail" : ""}`}>
                <svg viewBox="0 0 24 24">{s.canal === "E-mail" ? I.mail : I.phone}</svg>
              </span>
            )}
          </div>
          <div className="hb">
            {s.motif && s.relance ? (
              <div className="hfrise">
                <span className="d">{s.date}</span>
                <span className="mid"><span className="lbl">{s.motif}</span></span>
                <span className="d">{s.relance}</span>
                <span className="warn-ic">ⓘ</span>
              </div>
            ) : (
              <div className="hd">{s.date}</div>
            )}
            {s.notes && <div className="htext">{s.notes}</div>}
          </div>
        </div>
      ))}
      {b.suivis.length > 3 && (
        <button className="fadd" type="button" style={{ margin: "6px auto 0", display: "block" }}
          onClick={() => setTousSuivis((v) => !v)}>
          {tousSuivis ? "Réduire l'historique" : `Voir les ${b.suivis.length - 3} échanges précédents`}
        </button>
      )}
      {b.suivis.length === 0 && <div className="fempty">Aucun échange enregistré.</div>}
    </>
  );
}

/** Apporteur d'affaire — cliquable pour le renseigner (retour MAV #7). */
/** Apporteur d'affaire : sélection ou création d'un contact (retour #31). */
function ApporteurCard({ b }: { b: BienData }) {
  const [pending, start] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const nom = typeof b.im.apporteur_nom === "string" ? (b.im.apporteur_nom as string) : "";
  return (
    <>
      <button
        type="button"
        className={`fcard${nom ? "" : " off"}`}
        style={{ textAlign: "left", font: "inherit", cursor: "pointer" }}
        disabled={pending}
        onClick={() => setOuvert(true)}
      >
        <span className="fic"><svg viewBox="0 0 24 24">{I.user}</svg></span>
        <div><div className="k">Apporteur</div><div className="v">{nom || "Non"}</div></div>
      </button>
      {ouvert && (
        <ContactPicker
          titre="Sélectionner un apporteur"
          libelleValider="Modifier l'apporteur"
          valeurActuelle={nom || undefined}
          onAnnuler={() => setOuvert(false)}
          onValider={(c) => {
            setOuvert(false);
            start(() => setApporteur(String(b.im._id), c.nom, c.id));
          }}
        />
      )}
    </>
  );
}

/** Propriétaire — mise en page reprise du BO (retour MAV #34) : cadre doré
 *  avec le nom en pastille, vignettes Profil / Motif de la vente, puis
 *  l'identité (entreprise, téléphone, e-mail) en cases copiables. */
function ProprioSection({ b }: { b: BienData }) {
  const c = b.proprietaire;
  const S2 = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const nomComplet = c ? `${S2(c["prénom"]) ?? ""} ${S2(c.nom) ?? ""}`.trim() : "";
  const profil = c && Array.isArray(c.Types) ? (c.Types as string[]).join(" · ") : undefined;
  const motif = S2(b.im.Motif_vente);
  /* Profil et motif se saisissent depuis la fiche, et se signalent en rouge
     tant qu'ils manquent (#71). Le profil est un texte libre porté par le
     contact, le motif un choix du référentiel porté par l'immeuble. */
  const profil0 = c ? S2(c.profil) ?? "" : "";
  const [profilTxt, setProfilTxt] = useState(profil0);
  const [motifSel, setMotifSel] = useState(motif ?? "");
  const [, start] = useTransition();
  const entreprise = c ? S2(c.entreprise_nom) : undefined;
  const tel = c ? S2(c.portable_formatted) ?? S2(c.portable) ?? S2(c.fixe_formatted) : undefined;
  const mail = c ? S2(c.email) : undefined;

  return (
    <>
      <div className="pr-cadre">
        <div className="pr-titre">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" /><circle cx="12" cy="9.6" r="2.9" /><path d="M6.6 18.6c.9-2.6 2.9-3.8 5.4-3.8s4.5 1.2 5.4 3.8" /></svg>
          Propriétaire
        </div>
        {c ? (
          <Link className="pr-chip" href={`/contact/${String(c._id)}`}>
            <svg viewBox="0 0 24 24">{I.user}</svg>
            {(nomComplet || "—").toUpperCase()}
          </Link>
        ) : (
          <span className="pr-chip off">Aucun propriétaire lié</span>
        )}
      </div>

      <div className="pr-duo">
        <div className={`pr-case${profilTxt.trim() ? "" : " vide-req"}`}>
          <span className="pr-ic">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
          </span>
          <div>
            <div className="k">Profil</div>
            <input className="pr-in" value={profilTxt} placeholder={profil ?? "À renseigner"}
              onChange={(e) => setProfilTxt(e.target.value)}
              onBlur={() => profilTxt !== profil0 && start(() =>
                updateContact(String(c?._id ?? ""), { profil: profilTxt || undefined }))} />
          </div>
        </div>
        <div className={`pr-case${motifSel ? "" : " vide-req"}`}>
          <span className="pr-ic">
            <svg viewBox="0 0 24 24"><path d="M12 3a5 5 0 0 1 3 9v2H9v-2a5 5 0 0 1 3-9zM10 18h4" /></svg>
          </span>
          <div>
            <div className="k">Motif de la vente</div>
            <select className="pr-in" value={motifSel}
              onChange={(e) => {
                setMotifSel(e.target.value);
                start(() => updateBien(String(b.im._id), { Motif_vente: e.target.value || undefined }));
              }}>
              <option value="">À renseigner</option>
              {MOTIFS_VENTE.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {c && (
        <>
          <div className="pr-nom">{(nomComplet || "—").toUpperCase()}</div>
          {entreprise && (
            <div className="pr-case large">
              <span className="pr-ic">
                <svg viewBox="0 0 24 24"><path d="M3 20V9l6 3V9l6 3V4h6v16z" /></svg>
              </span>
              <div><div className="k">Entreprise</div><div className="v">{entreprise}</div></div>
            </div>
          )}
          <div className="pr-duo">
            {tel ? <Copiable valeur={tel} type="tel" /> : <span className="pr-case vide">Pas de téléphone</span>}
            {mail ? <Copiable valeur={mail} type="mail" /> : <span className="pr-case vide">Pas d&apos;e-mail</span>}
          </div>
        </>
      )}

      <div className="fh2">Immeubles appartenant au même propriétaire</div>
      {b.autresBiens.length === 0 && <div className="fempty">Aucun autre immeuble.</div>}
      {b.autresBiens.map((a) => (
        <a href={`/bien/${a.id}`} key={a.id}>
          <Row>
            <div className="grow"><div className="t">{a.label}</div></div>
            <span className="badge-o">{a.statut}</span>
          </Row>
        </a>
      ))}
    </>
  );
}

type PropsOnglet = { b: BienData; tab?: string; onTab?: (t: string) => void };

function EmplacementSection({ b, tab, onTab }: PropsOnglet) {
  return (
    <>
      {/* Le titre de section fait partie du cadre doré de l'onglet Adresse
          (comme dans le BO) : pas de bandeau séparé ici. */}
      <EmplacementTabs key={String(b.im.app_modified ?? "")} b={b} tab={tab} onTab={onTab} />
    </>
  );
}

function LocatifSection({ b, tab, onTab }: PropsOnglet) {
  const im = b.im;
  const lots = b.lots;
  const pct = (a?: unknown, m?: unknown) =>
    typeof a === "number" && typeof m === "number" && a > 0 && m > a
      ? `+${Math.round(((m - a) / a) * 100)} %`
      : undefined;
  return (
    <>
      <LocatifTabs key={`${String(im.app_modified ?? "")}-${lots.length}-${b.baux.length}-${b.locataires.length}-${b.charges.length}`} b={b} tab={tab} onTab={onTab} />
    </>
  );
}

function TechniqueSection({ b, tab, onTab }: PropsOnglet) {
  return (
    <>
      <SectTitle
        icon={I.tech}
        title="Etat technique"
        chips={
          <>
            <span className="fchip">Construit en {String(b.im.year_constru ?? "n.c.")}</span>
            {euros(b.im.fin_travaux) && <span className="fchip">{euros(b.im.fin_travaux)} de travaux</span>}
          </>
        }
      />
      <TechniqueTabs key={`${String(b.im.app_modified ?? "")}-${b.composants.length}-${b.travaux.length}`} b={b} tab={tab} onTab={onTab} />
    </>
  );
}

function PrixSection({ b }: { b: BienData }) {
  return (
    <>
      <SectTitle icon={I.info} title="Description et prix" />
      <PrixEcran b={b} />
      <div className="fh2" style={{ marginTop: 20 }}>Descriptif</div>
      <DescriptifForm b={b} />
    </>
  );
}

function ReactiverBtn({ immeubleId }: { immeubleId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="kgo green"
      type="button"
      disabled={pending}
      style={pending ? { opacity: 0.5 } : undefined}
      onClick={() => start(async () => { await reactiver(immeubleId); })}
    >
      <svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 1 1-1 5" /><path d="M4 4v5h5" /></svg>
      Réactiver
    </button>
  );
}

function AddSuiviButton({ b }: { b: BienData }) {
  const [open, setOpen] = useState(false);
  const c = b.proprietaire;
  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>+ Ajouter un suivi</button>
      {open && (
        <SuiviModal
          immeubleId={String(b.im._id)}
          agentId={String(b.im.AGENT ?? "")}
          objet={`${b.ville} - ${b.adresse}`}
          contactNom={c ? `${c["prénom"] ?? ""} ${c.nom ?? ""}`.trim() : undefined}
          contactId={c ? String(c._id) : undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PrixForm({ b }: { b: BienData }) {
  const [pending, start] = useTransition();
  const [nv, setNv] = useState(typeof b.im.prix_nv === "number" ? String(b.im.prix_nv) : "");
  const [honos, setHonos] = useState(typeof b.im.prix_honos_ttc === "number" ? String(b.im.prix_honos_ttc) : "");
  const hai = (parseFloat(nv) || 0) + (parseFloat(honos) || 0);
  return (
    <div className="frow" style={{ gap: 10, flexWrap: "wrap" }}>
      <label style={{ fontSize: 12.5 }}>Net vendeur<br />
        <input className="min" type="number" style={{ width: 140 }} value={nv} onChange={(e) => setNv(e.target.value)} />
      </label>
      <label style={{ fontSize: 12.5 }}>Honoraires TTC<br />
        <input className="min" type="number" style={{ width: 130 }} value={honos} onChange={(e) => setHonos(e.target.value)} />
      </label>
      <div style={{ fontSize: 12.5 }}>Prix HAI<br /><b style={{ fontSize: 15 }}>{hai > 0 ? `${Math.round(hai).toLocaleString("fr-FR")} €` : "—"}</b></div>
      <span className="sp" style={{ flex: 1 }} />
      <button
        className="kgo"
        type="button"
        disabled={pending || hai <= 0}
        style={pending ? { opacity: 0.5 } : undefined}
        onClick={() =>
          start(async () => {
            await updateBien(String(b.im._id), {
              prix_nv: parseFloat(nv) || undefined,
              prix_honos_ttc: parseFloat(honos) || undefined,
            });
          })
        }
      >
        <span className="ch">›</span> Enregistrer
      </button>
    </div>
  );
}

function DescriptifForm({ b }: { b: BienData }) {
  const [pending, start] = useTransition();
  const [txt, setTxt] = useState(typeof b.im.descriptif === "string" ? (b.im.descriptif as string) : "");
  return (
    <div className="frow" style={{ display: "block" }}>
      <textarea
        className="min"
        rows={6}
        style={{ width: "100%", fontSize: 13 }}
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        placeholder="Descriptif de l'immeuble…"
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button
          className="kgo"
          type="button"
          disabled={pending}
          style={pending ? { opacity: 0.5 } : undefined}
          onClick={() => start(async () => { await updateBien(String(b.im._id), { descriptif: txt }); })}
        >
          <span className="ch">›</span> Enregistrer
        </button>
      </div>
    </div>
  );
}

function PhotosSection({ b }: { b: BienData }) {
  const compte = (t: string) => b.photos.filter((p) => p.type === t).length;
  return (
    <>
      <SectTitle
        icon={I.cam}
        title="Photos"
        chips={
          <>
            <span className="fchip">{b.photos.length} photos</span>
            <span className="fchip">{b.photos.filter((p) => p.dossier).length} au dossier</span>
            <span className="fchip">{compte("Extérieur")} extérieure{compte("Extérieur") > 1 ? "s" : ""}</span>
            <span className="fchip">{compte("Parties communes")} des PC</span>
            <span className="fchip">{compte("Lot")} des lots</span>
          </>
        }
      />
      <PhotosEcran b={b} />
    </>
  );
}

function EstimationsSection({ b, onNeuve, onOuvrir, enCours, erreur }: {
  b: BienData;
  onNeuve: () => void;
  onOuvrir: (mode: "reprise" | "lecture", eid: string) => void;
  /** Identifiant de l'estimation en train de s'ouvrir, le cas échéant. */
  enCours: string | null;
  /** Ce qui a empêché la dernière ouverture, s'il y a lieu. */
  erreur: string | null;
}) {
  const immeubleId = String(b.im._id);
  const [aSupprimer, setASupprimer] = useState<Record<string, unknown> | null>(null);
  return (
    <>
      <SectTitle icon={I.calc} title="Estimations" chips={<span className="fchip gold">{euros(b.im.prix_hai_estim) ?? euros(b.im.prix_hai)} HAI</span>} />
      <MenuEstimer b={b} onNeuve={onNeuve} onOuvrir={onOuvrir} />
      {erreur && <div className="dif-avis"><b>Ouverture impossible.</b>{erreur}</div>}
      {b.estimations.map((e) => {
        const st = String(e.Statut ?? "").replace(/^\d+ - /, "");
        const isApp = String(e._id).startsWith("app_");
        const eid = String(e._id);
        return (
          <Row key={eid}>
            <div className="grow">
              {/* Cliquer sur le titre ouvre l'estimation telle qu'elle était,
                  en lecture seule : c'est ce que fait le BO. Le bouton de
                  droite, lui, sert à la renvoyer (retour #98). */}
              <div className="t">
                <button type="button" className="lienclair" onClick={() => onOuvrir("lecture", eid)}>
                  {String(e.titre ?? "Estimation")} · {euros(e.prix_hai) ?? ""}
                </button>
              </div>
              <div className="s">
                {dmy(e["Created Date"])}
                {" · "}
                <button type="button" className="lienclair sous" onClick={() => onOuvrir("lecture", eid)}>
                  consulter
                </button>
                {isApp && (
                  <> · <Link href={`/bien/${immeubleId}/estimation/${eid}/imprimer`} target="_blank">version imprimable</Link></>
                )}
                {enCours === eid && " · ouverture…"}
              </div>
            </div>
            {/* Le statut est une information — il n'a ni bordure ni picto.
                L'action, elle, porte l'avion : les deux ne se confondent plus
                même quand elles disent le même mot (retour #126). */}
            <span className={st === "Envoyée" ? "badge-g" : st === "PDF manquant" ? "badge-r" : "badge-o"}>{st}</span>
            <button type="button" className="fbtn avec-picto" onClick={() => onOuvrir("reprise", eid)}>
              <Avion /> {st === "Envoyée" ? "Renvoyer" : "Envoyer"}
            </button>
            <button
              type="button" className="fbtn danger icone" title="Supprimer l'estimation"
              onClick={() => setASupprimer(e)}
            ><Corbeille /></button>
          </Row>
        );
      })}
      {b.estimations.length === 0 && <div className="fempty">Aucune estimation.</div>}
      {aSupprimer && (
        <SupprimerEstimation
          immeubleId={immeubleId}
          e={aSupprimer}
          onFermer={() => setASupprimer(null)}
        />
      )}
    </>
  );
}

/**
 * Confirmation de suppression d'une estimation (retour #126).
 *
 * Une estimation jamais envoyée ne coûte rien à jeter — c'est le cas que MAV
 * visait. Une estimation déjà partie chez le propriétaire est autre chose :
 * c'est une pièce du dossier, et l'écran le dit avant de laisser faire.
 */
function SupprimerEstimation({ immeubleId, e, onFermer }: {
  immeubleId: string;
  e: Record<string, unknown>;
  onFermer: () => void;
}) {
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const envoyee = String(e.Statut ?? "").includes("Envoyée");
  return createPortal(
    <div className="modal-ov" onClick={onFermer}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="modal-h">
          Supprimer cette estimation ?
          <button type="button" onClick={onFermer}>✕</button>
        </div>
        <div className="modal-b">
          <p style={{ margin: "0 0 10px" }}>
            <b>{String(e.titre ?? "Estimation")}</b>
            {euros(e.prix_hai) ? ` · ${euros(e.prix_hai)}` : ""} — créée le {dmy(e["Created Date"])}.
          </p>
          {envoyee ? (
            <div className="dif-avis">
              <b>Cette estimation a été envoyée au propriétaire.</b>
              La supprimer efface du dossier le chiffre qu&apos;il a reçu, et le PDF
              qui l&apos;accompagnait.
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--gray-txt)", fontSize: 13 }}>
              Elle n&apos;a jamais été envoyée : rien ne part du dossier. Le dossier PDF
              généré, s&apos;il y en a un, est retiré du coffre avec elle.
            </p>
          )}
          {erreur && <div className="dif-avis" style={{ marginTop: 10 }}>{erreur}</div>}
        </div>
        <div className="modal-f">
          <button type="button" className="fadd" onClick={onFermer}>Annuler</button>
          <span style={{ flex: 1 }} />
          <button
            type="button" className="fbtn danger avec-picto" disabled={pending}
            onClick={() => start(async () => {
              try {
                await supprimerEstimation(immeubleId, String(e._id));
                onFermer();
              } catch (err) {
                setErreur(err instanceof Error ? err.message : String(err));
              }
            })}
          >
            <Corbeille /> {pending ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * « Estimer » ouvre un menu au lieu de partir droit sur une page blanche
 * (retour #99) : neuf fois sur dix ce qu'on veut, c'est renvoyer celle qui
 * existe déjà, pas en refaire une.
 */
function MenuEstimer({ b, onNeuve, onOuvrir }: {
  b: BienData;
  onNeuve: () => void;
  onOuvrir: (mode: "reprise" | "lecture", eid: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const recentes = b.estimations.slice(0, 5);

  return (
    <div className="estm">
      <button type="button" className="fbtn" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}>
        + Estimer <span className="chev">{ouvert ? "˄" : "˅"}</span>
      </button>
      {ouvert && (
        <>
          <button type="button" className="estm-fond" aria-label="Fermer" onClick={() => setOuvert(false)} />
          <div className="estm-menu">
            {/* Boutons et non liens : l'estimation s'ouvre DANS la page, on ne
                quitte pas la fiche (retour #125). */}
            <button type="button" className="estm-it neuf"
              onClick={() => { setOuvert(false); onNeuve(); }}>
              <b>Nouvelle estimation</b>
              <span>Repartir des données de la fiche et refaire le calcul.</span>
            </button>
            {recentes.length > 0 && <div className="estm-sep">Renvoyer une estimation existante</div>}
            {recentes.map((e) => (
              <button key={String(e._id)} type="button" className="estm-it"
                onClick={() => { setOuvert(false); onOuvrir("reprise", String(e._id)); }}>
                <b>{String(e.titre ?? "Estimation")} · {euros(e.prix_hai) ?? "—"}</b>
                <span>
                  {dmy(e["Created Date"])} · {String(e.Statut ?? "").replace(/^\d+ - /, "")}{" "}
                  — rien n&apos;est recalculé.
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MandatsSection({ b }: { b: BienData }) {
  return (
    <>
      <SectTitle icon={I.brief} title="Mandats" />
      <AddMandatButton b={b} />
      {b.mandats.map((m) => {
        const st = String(m.Statut ?? "");
        return (
          <Row key={m._id as string}>
            <div className="grow">
              <div className="t">
                <Link href={`/bien/${String(b.im._id)}/mandat/${String(m._id)}`} style={{ color: "inherit" }}>
                  {String(m.Type ?? "Vente")} {String(m.Type_exclu ?? "")} {m.numero ? `· #${m.numero}` : "· Pas de numéro"}
                </Link>
              </div>
              <div className="s">{dmy(m.date_effet)} → {dmy(m.date_fin)} · honos {euros(m.honos_ttc) ?? "n.c."}</div>
            </div>
            <span className={st === "En cours" ? "badge-g" : ["Expiré", "Annulé"].includes(st) ? "badge-r" : "badge-o"}>{st}</span>
            {typeof m.pdf_signed === "string" && m.pdf_signed && (
              <a className="fbtn" href={(m.pdf_signed as string).replace(/^\/\//, "https://")} target="_blank" rel="noreferrer">PDF</a>
            )}
          </Row>
        );
      })}
      {b.mandats.length === 0 && <div className="fempty">Aucun mandat.</div>}
    </>
  );
}

function DossiersSection({ b }: { b: BienData }) {
  return (
    <>
      <SectTitle icon={I.pdf} title="Dossiers" />
      <AddDossierButton b={b} />
      {b.dossiers.map((d, i) => (
        <Row key={d._id as string}>
          <div className="grow">
            <div className="t">Dossier V{String(d.version ?? "?")} {i === 0 && <span className="badge-g">Dernière version</span>}</div>
            <div className="s">
              {dmy(d["Created Date"])} · {euros(d.prix_hai)} HAI · {d.public ? "Public" : "Privé"}
              {typeof d.surface === "number" && <> · {Math.round(d.surface as number)} m² · {String(d.occupation ?? "?")} % · {String(d.renta_actuelle ?? "?")} %</>}
              {String(d._id).startsWith("app_") && (
                <> · <Link href={`/bien/${String(b.im._id)}/dossier/${String(d._id)}/imprimer`} target="_blank">version imprimable</Link></>
              )}
            </div>
          </div>
          {typeof d.pdf === "string" && d.pdf && (
            <a className="fbtn" href={(d.pdf as string).replace(/^\/\//, "https://")} target="_blank" rel="noreferrer">PDF</a>
          )}
        </Row>
      ))}
      {b.dossiers.length === 0 && <div className="fempty">Aucun dossier.</div>}
    </>
  );
}

function NotesSection({ b }: { b: BienData }) {
  const [notes, setNotes] = useState(String(b.im.notes ?? ""));
  const [pending, start] = useTransition();
  const dirty = notes !== String(b.im.notes ?? "");
  return (
    <>
      <SectTitle icon={I.note} title="Notes" />
      <div style={{ fontSize: 12, color: "var(--gray-lt)", marginBottom: 8 }}>
        Mémos internes : contacts, historique, références comparables (vente, date, surface, €/m², adresse)…
      </div>
      <textarea
        className="min"
        rows={16}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={"ex.\nVente\n880 000 €\n24/06/2019\n253 m²\nsoit 3 478 €/m²\n7 Avenue DE PARIS 94800 VILLEJUIF"}
        style={{ fontFamily: "var(--font-body)", lineHeight: 1.55 }}
      />
      <div style={{ display: "flex", marginTop: 10 }}>
        <span style={{ flex: 1 }} />
        <button
          className="kgo"
          type="button"
          disabled={!dirty || pending}
          style={!dirty || pending ? { opacity: 0.5 } : undefined}
          onClick={() => start(() => updateBien(String(b.im._id), { notes }))}
        >
          <span className="ch">›</span> Enregistrer
        </button>
      </div>
    </>
  );
}

function AcheteursSection({ b }: { b: BienData }) {
  // Sous-onglets du BO : le matching et les campagnes vivent à côté du
  // pipeline (propositions, visites, offres).
  const [onglet, setOnglet] = useState<"acquereurs" | "pipeline">("acquereurs");
  const [ach, setAch] = useState<AcheteursData | null>(null);
  const [chargement, setChargement] = useState(false);

  const charger = () => {
    if (ach || chargement) return;
    setChargement(true);
    chargerAcheteurs(String(b.im._id)).then((d) => { setAch(d); setChargement(false); });
  };

  return (
    <>
      <SectTitle icon={I.users} title="Acheteurs" chips={<><span className="fchip">{b.propositions.total} propositions</span><span className="fchip">{b.visites.length} visites</span><span className="fchip">{b.offres.length} offres</span></>} />

      <div className="fsub-nav">
        <button type="button" className={onglet === "acquereurs" ? "on" : ""}
          onClick={() => { setOnglet("acquereurs"); charger(); }}>Matching et commercialisation</button>
        <button type="button" className={onglet === "pipeline" ? "on" : ""} onClick={() => setOnglet("pipeline")}>
          Propositions, visites et offres
        </button>
      </div>

      {onglet === "acquereurs" && (
        <>
          {!ach && !chargement && (
            <div className="fempty">
              <button className="fadd" type="button" onClick={charger}>Charger le vivier acquéreurs</button>
            </div>
          )}
          {chargement && <div className="fempty">Chargement du vivier acquéreurs…</div>}
          {ach && <Acheteurs b={b} d={ach} />}
        </>
      )}

      {onglet === "pipeline" && <Pipeline b={b} />}
    </>
  );
}

/** Relance, refus motivé et réactivation d'une proposition. */
function PropositionActions({ b, p }: { b: BienData; p: Record<string, unknown> }) {
  const [pending, start] = useTransition();
  const immeubleId = String(b.im._id);
  const id = String(p._id);
  const refusee = String(p.Statut ?? "").startsWith("Refus");
  return (
    <span className="mrow" style={{ gap: 4 }}>
      {refusee ? (
        <button className="fadd" type="button" disabled={pending}
          onClick={() => start(() => setPropositionStatut(immeubleId, id, "reactiver"))}>Réactiver</button>
      ) : (
        <>
          <button className="fadd" type="button" disabled={pending}
            onClick={() => start(() => setPropositionStatut(immeubleId, id, "relancer"))}>Relancer</button>
          <button className="fadd" type="button" disabled={pending} style={{ color: "var(--red)", borderColor: "#e6b3b3" }}
            onClick={() => {
              const motif = prompt("Motif du refus ?");
              if (motif === null) return;
              start(() => setPropositionStatut(immeubleId, id, "refuser", motif || undefined));
            }}>Refuser</button>
        </>
      )}
    </span>
  );
}

function Pipeline({ b }: { b: BienData }) {
  return (
    <>
      <div className="fh2">Dernières propositions</div>
      {b.propositions.rows.map((p) => (
        <Row key={p._id as string}>
          <div className="grow">
            <div className="t">{String(p.mail_adresse ?? "Proposition")}</div>
            <div className="s">Envoyée le {dmy(p.date_envoi)} · {String(p.Source_proposition ?? "")}{p.motif_refus ? ` · refus : ${String(p.motif_refus)}` : ""}</div>
          </div>
          <PropositionActions b={b} p={p} />
          <span className={String(p.Statut ?? "").startsWith("Refus") ? "badge-r" : "badge-o"}>{String(p.Statut ?? "")}</span>
        </Row>
      ))}
      {b.propositions.rows.length === 0 && <div className="fempty">Aucune proposition.</div>}
      <div className="fh2" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        Visites <span style={{ flex: 1 }} /> <AddVisiteButton b={b} />
      </div>
      {b.visites.map((v) => (
        <Row key={v._id as string}>
          <div className="grow">
            <div className="t">Visite du {dmy(v.date)}{v.visiteur_nom ? ` — ${String(v.visiteur_nom)}` : ""}</div>
            <div className="s">{String(v.rex_fi ?? v.commentaire_interne ?? "")}</div>
          </div>
          <VisiteActions b={b} v={v} />
          <span className={String(v.Statut) === "Effectuée" ? "badge-g" : String(v.Statut) === "Annulée" ? "badge-r" : "badge-o"}>{String(v.Statut ?? "")}</span>
        </Row>
      ))}
      {b.visites.length === 0 && <div className="fempty">Aucune visite.</div>}
      <div className="fh2" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        Offres <span style={{ flex: 1 }} /> <AddOffreButton b={b} />
      </div>
      {b.offres.map((o) => (
        <Row key={o._id as string}>
          <div className="grow">
            <div className="t">Offre du {dmy(o.date)}{o.acheteur_nom ? ` — ${String(o.acheteur_nom)}` : ""}</div>
            <div className="s">{euros(o.prix_nv)} + {keur(o.honos_ttc)} honos = {euros(o.prix_hai)} HAI{o.motif_refus ? ` · refusée : ${String(o.motif_refus)}` : ""}</div>
          </div>
          <OffreActions b={b} o={o} />
          <span className={["Acceptée", "Vendu", "Compromis signé"].includes(String(o.Statut)) ? "badge-g" : String(o.Statut) === "Refusée" ? "badge-r" : "badge-o"}>{String(o.Statut ?? "")}</span>
        </Row>
      ))}
      {b.offres.length === 0 && <div className="fempty">Aucune offre.</div>}
    </>
  );
}
