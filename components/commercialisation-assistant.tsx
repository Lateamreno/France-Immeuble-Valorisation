"use client";

// Assistant de commercialisation — reprend l'enchaînement du BO :
// Dossier → Mandat → Acheteurs → E-mails → SMS.
//
// Doctrine §7.1, inchangée : l'outil PRÉPARE, l'agent ENVOIE. Les e-mails
// partent du client de messagerie de l'agent ; les SMS peuvent maintenant
// partir d'ici par MailingVox, mais seulement derrière un bouton et une
// confirmation qui rappelle le nombre de destinataires et de segments
// facturés.
//
// Une DATE peut être posée sur l'envoi SMS — MAV : « ce que je veux faire
// c'est une programmation ». Ce n'est pas un envoi automatique : le contenu,
// la liste ET l'heure sont validés dans le même geste ; la machine attend,
// elle ne décide de rien.
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { destinataires, paquets, type Acquereur } from "@/lib/bo/matching";
import { dmy, euros, libelleDossier, S } from "@/lib/format";
import {
  messageCommercialisation, objetCommercialisation, type BienMail,
} from "@/lib/bo/mail-commercialisation";
import { controlerEnvoi, domaineSuspect, peserPiecesJointes } from "@/lib/bo/controle-envoi";
import { oublier, useMemoire } from "@/lib/memoire";
import { createCommercialisation, envoyerMailsCommercialisation, envoyerSmsCommercialisation, etatEnvoiSms, etatMailsCommercialisation, genererEtatLocatifCsv, markCommercialisationSent } from "@/lib/bo/actions";
import { useQuestion } from "@/components/modale";

const ETAPES = ["Dossier", "Mandat", "Acheteurs", "E-mails", "SMS"] as const;
type Etape = (typeof ETAPES)[number];

export function AssistantCommercialisation({
  b, matchId, dossierId, cibles, onFermer,
}: {
  b: BienData;
  matchId: string;
  dossierId?: string;
  cibles: Acquereur[];
  onFermer: () => void;
}) {
  /* Retour #329 — « fais en sorte qu'on ne puisse pas perdre notre progression
     quand on se balade dans les autres onglets du BO. » Une commercialisation,
     c'est un e-mail rédigé, un SMS relu, un lien de partage collé : sortir de
     la fiche pour vérifier un chiffre suffisait à tout perdre. Toute la saisie
     de l'assistant passe donc par la mémoire d'écran, rangée sous le matching
     auquel elle appartient — deux commercialisations ne se mélangent pas. */
  const memo = `com:${matchId}`;
  const [etape, setEtape] = useMemoire<Etape>(`${memo}:etape`, "Dossier");
  const [pending, start] = useTransition();
  const { confirmer, question } = useQuestion();
  const [commId, setCommId] = useMemoire<string | undefined>(`${memo}:commId`, undefined);
  const [creees, setCreees] = useMemoire(`${memo}:creees`, 0);
  const [mailsEnvoyes, setMailsEnvoyes] = useMemoire(`${memo}:mails`, false);
  const [smsEnvoyes, setSmsEnvoyes] = useMemoire(`${memo}:sms-envoyes`, false);

  const dossiers = b.dossiers;
  const [dossier, setDossier] = useMemoire(`${memo}:dossier`, dossierId ?? S(dossiers[0]?._id));
  const mandats = b.mandats;
  const [mandat, setMandat] = useMemoire(`${memo}:mandat`, S(mandats[0]?._id));
  const [lien, setLien] = useMemoire(`${memo}:lien`, "");

  /* Sortir de l'assistant — « Fermer » comme « Terminer » — referme le
     dossier : la mémoire de CETTE commercialisation est jetée, sinon la
     suivante rouvrirait le message de la précédente. */
  const fermer = () => { oublier(`${memo}:`); onFermer(); };

  const prixHai = typeof b.im.prix_hai === "number" ? (b.im.prix_hai as number) : undefined;

  /* Ce que l'objet et le corps ont besoin de savoir du bien (#357, #358).
     Le rendement POTENTIEL n'est pas en base : on le déduit du rapport entre
     les loyers de marché des lots et les loyers encaissés, appliqué au
     rendement de la fiche. Passer par le rapport plutôt que par un nouveau
     calcul évite de refabriquer la base de prix — et donc d'annoncer un
     chiffre qui contredirait celui affiché sur la carte. */
  const bienMail: BienMail = useMemo(() => {
    const somme = (cle: string, repli?: string) => b.lots.reduce((t, l) => {
      const v = typeof l[cle] === "number" ? (l[cle] as number)
        : repli && typeof l[repli] === "number" ? (l[repli] as number) : 0;
      return t + v;
    }, 0);
    const loyers = somme("loyer");
    const loyersMax = somme("loyer_max", "loyer");
    const renta = typeof b.im.fin_renta_ba === "number" ? b.im.fin_renta_ba : undefined;
    return {
      ville: b.ville,
      codePostal: b.im.adresse_zipcode,
      surfaceCarrez: b.im.surface_carrez,
      prixHai,
      /* La fiche ne remonte pas toujours `prix_hai_m2` : à Lille il est absent
         et l'objet sortait sans prix au m². Le calcul de secours porte sur les
         mêmes deux nombres que Bubble utilise. */
      prixM2: typeof b.im.prix_hai_m2 === "number" ? b.im.prix_hai_m2
        : prixHai && typeof b.im.surface_carrez === "number" && b.im.surface_carrez > 0
          ? prixHai / b.im.surface_carrez
          : undefined,
      occupation: b.im.occupation_lots,
      renta,
      rentaPotentielle: renta !== undefined && loyers > 0
        ? Math.round((renta * loyersMax / loyers) * 10) / 10
        : undefined,
      destinations: b.lots.map((l) => String(l.Destination ?? "")).filter(Boolean),
      agentNom: b.agentNom,
      agentTel: b.agentTel,
    };
  }, [b, prixHai]);

  const [objet, setObjet] = useMemoire(`${memo}:objet`, objetCommercialisation(bienMail));
  const [message, setMessage] = useMemoire(`${memo}:message`, messageCommercialisation(bienMail, lien));
  const [sms, setSms] = useMemoire(`${memo}:sms`, smsParDefaut(b));
  /* Retour MAV : « ce que je veux faire c'est une programmation ». Vide =
     envoi immédiat. Le format est celui d'un `datetime-local`, donc lu dans
     le fuseau du navigateur — celui de l'agent, qui est celui qu'il a en tête. */
  const [quandSms, setQuandSms] = useMemoire(`${memo}:quand-sms`, "");

  /* Retour #359, option C : l'état locatif est GÉNÉRÉ depuis la fiche, et un
     fichier déposé à la main reste possible à côté. Les deux vivent dans la
     même case — on ne joint qu'un second document, c'est l'un ou l'autre. */
  const [pj2, setPj2] = useMemoire<{ nom: string; octets?: number; path?: string; source: "genere" | "depose" } | null>(
    `${memo}:pj2`, null,
  );
  const [pj2Erreur, setPj2Erreur] = useState<string | null>(null);
  /* Envoi des e-mails : date facultative, et compte rendu. */
  const [quandMail, setQuandMail] = useMemoire(`${memo}:quand-mail`, "");
  const [envoiMail, setEnvoiMail] = useState<string | null>(null);

  /* Retour #431 — l'envoi par lots, son compteur, et sa reprise.
     Vercel coupe une fonction à 60 s : cent cinquante-neuf e-mails à la suite
     n'y tenaient pas, et « la commercialisation a buggé ». L'écran demande
     maintenant douze adresses à la fois et recommence jusqu'au bout ; ce qui
     est parti est inscrit sur la commercialisation, d'où le compteur — et la
     reprise, si l'on ferme la page au milieu. Pendant ce temps, l'étape SMS
     reste ouverte : l'envoi tourne, l'agent avance. */
  const [progres, setProgres] = useMemoire<{ fait: number; total: number; echecs: number; enCours: boolean; message?: string } | null>(`${memo}:progres`, null);
  const [faits, setFaits] = useState<string[]>([]);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  useEffect(() => {
    if (!commId) return;
    let vivant = true;
    etatMailsCommercialisation(commId)
      .then((e) => {
        if (!vivant) return;
        setFaits(e.faits);
        if (e.termine) setMailsEnvoyes(true);
        if (e.smsEnvoyes) setSmsEnvoyes(true);
        if (e.faits.length > 0 && !e.termine) {
          setProgres((p) => p?.enCours ? p : { fait: e.faits.length, total: e.total ?? e.faits.length, echecs: e.echecs.length, enCours: false });
        }
      })
      .catch(() => undefined);
    return () => { vivant = false; };
    // Relu à l'arrivée sur une commercialisation : pas à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commId]);

  /* Le poids du dossier, mesuré par `PieceJointe`. Remonté ici pour que le
     plafond porte sur le TOTAL, comme MAV l'a demandé. */
  const [poidsDossier, setPoidsDossier] = useState<number | null | undefined>(undefined);

  const dest = useMemo(() => destinataires(cibles), [cibles]);
  const lots = paquets(dest.telephones, 50);

  /* Retour #360 — ce qu'il faut savoir avant d'appuyer : combien de personnes
     recevront vraiment, quels doublons ont été fondus, quelles adresses sont
     cassées et quelles fiches n'en ont aucune. Chaque ligne écartée porte
     l'identifiant de son contact : sans ça on sait qu'il y a un problème sans
     pouvoir le corriger. */
  const controle = useMemo(() => controlerEnvoi(cibles.map((a) => ({
    rechercheId: a.rechercheId, contactId: a.contactId, nom: a.nom, email: a.email,
  }))), [cibles]);
  /** Les adresses qu'il reste à servir (#431) : tout, moins ce qui est déjà parti. */
  const restantes = useMemo(() => controle.adresses.filter((a) => !faits.includes(a)), [controle.adresses, faits]);
  const douteux = useMemo(
    () => controle.adresses
      .map((v) => ({ valeur: v, propose: domaineSuspect(v) }))
      .filter((x): x is { valeur: string; propose: string } => !!x.propose),
    [controle.adresses],
  );

  // Alerte du BO : le prix du dossier peut avoir divergé de celui de la fiche.
  const doc = dossiers.find((x) => S(x._id) === dossier);
  /* Les pièces de la salve : LE DOSSIER choisi (il ne partait pas — « il n'y
     avait pas la PJ »), puis la seconde pièce s'il y en a une. Le PDF d'un
     dossier vit soit dans notre coffre (`storage:…`), soit chez Bubble (adresse
     complète) : le serveur sait lire les deux. */
  const piecesJointes = useMemo(() => {
    const out: { nom: string; path?: string; url?: string }[] = [];
    const u = doc ? [doc.pdf, doc.FILE].map(S).find((x) => x.length > 0) : "";
    if (doc && u) {
      const ville = S(b.ville).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const nom = `Dossier-${ville || "immeuble"}-V${S(doc.version) || "1"}.pdf`;
      if (u.startsWith("storage:")) out.push({ nom, path: u.slice("storage:".length) });
      else if (u.startsWith("/api/photo?s=")) out.push({ nom, path: decodeURIComponent(u.slice("/api/photo?s=".length)) });
      else out.push({ nom, url: u });
    }
    if (pj2?.path) out.push({ nom: pj2.nom, path: pj2.path });
    return out;
  }, [doc, pj2, b.ville]);

  const envoyerParLots = async (adresses: string[], quand?: string) => {
    if (!commId) return;
    const LOT = 12;
    const total = faits.length + adresses.length;
    const lotsMails = paquets(adresses, LOT);
    const etat = { fait: faits.length, rates: [] as { email: string; raison: string }[] };
    setEnvoiEnCours(true);
    setEnvoiMail(null);
    setProgres({ fait: etat.fait, total, echecs: 0, enCours: true });
    for (const lot of lotsMails) {
      const r = await envoyerMailsCommercialisation({
        immeubleId: String(b.im._id), commId, objet, message,
        destinataires: lot,
        pieces: piecesJointes,
        quand, agentId: String(b.im.AGENT ?? "") || undefined,
        total,
      }).catch((e) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }));
      if (!r.ok || !("fait" in r)) {
        setProgres({ fait: etat.fait, total, echecs: etat.rates.length, enCours: false, message: ("message" in r && r.message) || "L'envoi s'est interrompu — cliquez pour reprendre." });
        setEnvoiEnCours(false);
        return;
      }
      const echecsLot = r.echecs ?? [];
      etat.fait = r.fait;
      etat.rates = [...etat.rates, ...echecsLot];
      setFaits((f) => [...new Set([...f, ...lot.filter((a) => !echecsLot.some((x) => x.email === a))])]);
      setProgres({ fait: etat.fait, total: r.total || total, echecs: etat.rates.length, enCours: true });
    }
    setProgres({ fait: etat.fait, total, echecs: etat.rates.length, enCours: false });
    setEnvoiEnCours(false);
    setMailsEnvoyes(true);
    setEnvoiMail(
      (quand ? `${etat.fait} e-mails programmés pour le ${new Date(quand).toLocaleString("fr-FR")}` : `${etat.fait} e-mails envoyés`)
      + (piecesJointes.length ? ` avec ${piecesJointes.length} pièce${piecesJointes.length > 1 ? "s" : ""} jointe${piecesJointes.length > 1 ? "s" : ""}` : " sans pièce jointe")
      + "."
      + (etat.rates.length ? ` ${etat.rates.length} en échec : ${etat.rates.slice(0, 3).map((x) => `${x.email} — ${x.raison}`).join(" · ")}` : ""),
    );
  };

  /* Retour #427 — ce qui a bougé depuis le dernier dossier : le prix de la
     fiche, ou un lot / une charge modifié après sa création. */
  const dossierPerime = useMemo(() => {
    const dernier = dossiers[0];
    if (!dernier) return null;
    const cree = S(dernier["Created Date"]);
    const raisons: string[] = [];
    const pd = typeof dernier.prix_hai === "number" ? (dernier.prix_hai as number) : undefined;
    if (pd !== undefined && prixHai !== undefined && Math.round(pd) !== Math.round(prixHai)) raisons.push("le prix n'est plus le même");
    const apres = (rows: Record<string, unknown>[]) => rows.filter((r) => S(r["Modified Date"]) > cree).length;
    const nl = apres(b.lots); if (nl) raisons.push(`${nl} lot${nl > 1 ? "s" : ""} modifié${nl > 1 ? "s" : ""}`);
    const nc = apres(b.charges); if (nc) raisons.push(`${nc} charge${nc > 1 ? "s" : ""} modifiée${nc > 1 ? "s" : ""}`);
    return raisons.length ? raisons.join(", ") : null;
  }, [dossiers, prixHai, b.lots, b.charges]);
  const prixDossier = typeof doc?.prix_hai === "number" ? (doc.prix_hai as number) : undefined;
  /* Ne compter que les pièces qui EXISTENT : passer `undefined` pour une
     seconde pièce absente la faisait compter comme « un fichier de poids
     inconnu », et l'écran annonçait deux pièces quand il n'y en avait qu'une. */
  const pesee = peserPiecesJointes([
    ...(doc ? [poidsDossier ?? undefined] : []),
    ...(pj2 ? [pj2.octets] : []),
  ]);
  const man = mandats.find((x) => S(x._id) === mandat);
  const prixMandat = typeof man?.prix_hai === "number" ? (man.prix_hai as number) : undefined;
  const ecart =
    [prixHai, prixDossier, prixMandat].filter((v) => v !== undefined).length > 1 &&
    new Set([prixHai, prixDossier, prixMandat].filter((v) => v !== undefined)).size > 1;

  const creer = () =>
    start(async () => {
      const res = await createCommercialisation({
        immeubleId: String(b.im._id),
        agentId: String(b.im.AGENT ?? "") || undefined,
        matchId,
        dossierId: dossier || undefined,
        mandatId: mandat || undefined,
        lienPartage: lien || undefined,
        objet,
        message,
        smsTexte: sms,
        cibles: cibles.map((a) => ({
          rechercheId: a.rechercheId,
          contactId: a.contactId,
          email: a.email,
          telephone: a.telephone,
          /* Le grade décide de la colonne du dashboard après l'envoi : A/B
             seulement → « Commercialisés aux clients A et B », dès qu'un C, un
             D ou un sans-grade est dedans → « à tous les clients ». */
          note: a.note,
        })),
      });
      setCommId(res.commercialisationId);
      setCreees(res.propositions);
      setEtape("E-mails");
    });

  const copier = (txt: string) => navigator.clipboard?.writeText(txt);

  /* L'état du pont MailingVox, demandé à l'ouverture de l'étape SMS. On ne le
     devine pas côté navigateur : la clé ne descend jamais ici. */
  const [pont, setPont] = useState<{ configure: boolean; message: string; plafond: number; numeroStop: string } | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  useEffect(() => {
    if (etape !== "SMS" || pont) return;
    let vivant = true;
    etatEnvoiSms().then((e) => { if (vivant) setPont(e); }).catch(() => undefined);
    return () => { vivant = false; };
  }, [etape, pont]);

  /* Doctrine §7.1 : l'application prépare, l'agent envoie. D'où la
     confirmation qui rappelle le nombre exact de destinataires et de segments
     facturés — c'est le dernier moment où l'erreur de ciblage coûte zéro. */
  const envoyerLesSms = async () => {
    if (!commId) return;
    const nb = dest.telephones.length;
    const seg = Math.max(1, Math.ceil(sms.length / 160)) * nb;
    const quand = quandSms ? new Date(quandSms) : undefined;
    const differe = quand && !Number.isNaN(quand.getTime()) && quand.getTime() > Date.now();
    if (!(await confirmer(
      <>
        {differe
          ? `Programmer ce SMS pour le ${quand!.toLocaleString("fr-FR")}, à ${nb} numéro${nb > 1 ? "s" : ""} ?`
          : `Envoyer ce SMS à ${nb} numéro${nb > 1 ? "s" : ""} ?`}
        <br /><br />
        {`Environ ${seg} segment${seg > 1 ? "s" : ""} facturé${seg > 1 ? "s" : ""}. `}
        {differe
          ? "Une campagne programmée se modifie encore chez MailingVox, mais pas depuis ici."
          : "Un SMS parti ne se rattrape pas."}
      </>,
      { oui: differe ? "Programmer" : "Envoyer" },
    ))) return;
    start(async () => {
      const r = await envoyerSmsCommercialisation({
        immeubleId: String(b.im._id), commId, texte: sms, numeros: dest.telephones,
        quand: quandSms ? new Date(quandSms).toISOString() : undefined,
      });
      if (r.ok) {
        setSmsEnvoyes(true);
        const ecartes = r.ecartesStop
          ? ` ${r.ecartesStop} numéro${r.ecartesStop > 1 ? "s" : ""} écarté${r.ecartesStop > 1 ? "s" : ""} (désinscrits STOP).`
          : "";
        setEnvoi(
          (r.programmePour
            ? `${r.envoyes} SMS programmés pour le ${new Date(r.programmePour).toLocaleString("fr-FR")}`
            : `${r.envoyes} SMS envoyés`)
          + ` (${r.segments} segments).${ecartes}`
          + (r.campagne ? ` Campagne MailingVox n°${r.campagne}.` : "")
          + (r.echecs && r.echecs.length ? ` ${r.echecs.length} en échec : ${r.echecs.slice(0, 3).map((x) => `${x.numero} — ${x.raison}`).join(" · ")}` : ""));
      } else {
        setEnvoi(r.message ?? "L'envoi n'a pas abouti.");
      }
    });
  };

  return (
    <div className="asst">
      <div className="asst-h">
        <span className="asst-t">Nouvelle commercialisation</span>
        <span className="sp" style={{ flex: 1 }} />
        <button className="fadd" type="button" onClick={fermer}>Fermer</button>
      </div>

      {progres && (
        <div className={`asst-prog${progres.enCours ? " encours" : progres.fait >= progres.total && progres.total > 0 ? " ok" : ""}`}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M3 7.5 12 13l9-5.5" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
          <b>{progres.fait} / {progres.total}</b> e-mails envoyés
          {progres.enCours && <i className="asst-spin" aria-hidden />}
          {progres.echecs > 0 && <span className="rouge">· {progres.echecs} en échec</span>}
          {progres.message && <span className="rouge">· {progres.message}</span>}
          {!progres.enCours && progres.fait < progres.total && etape !== "E-mails" && (
            <button type="button" className="fadd" onClick={() => setEtape("E-mails")}>Reprendre l&apos;envoi</button>
          )}
        </div>
      )}
      <div className="asst-steps">
        {ETAPES.map((e, i) => (
          <button
            key={e} type="button"
            className={`${etape === e ? "on" : ""}${ETAPES.indexOf(etape) > i ? " ok" : ""}`}
            disabled={!commId && (e === "E-mails" || e === "SMS")}
            onClick={() => setEtape(e)}
          ><i>{i + 1}</i> {e}</button>
        ))}
      </div>

      {ecart && (
        <div className="asst-alerte">
          ⚠ Informations différentes entre l&apos;immeuble, le dossier et le mandat.
          <div className="asst-cmp">
            <span>Immeuble <b>{euros(prixHai) ?? "n.c."}</b></span>
            <span>Dossier <b>{euros(prixDossier) ?? "n.c."}</b></span>
            <span>Mandat <b>{euros(prixMandat) ?? "n.c."}</b></span>
          </div>
        </div>
      )}

      {etape === "Dossier" && (
        <div className="asst-b">
          <span className="mlab">Dossier de commercialisation</span>
          {/* Retour #427 : « je ne veux pas qu'on puisse choisir une version
              ancienne : soit le dossier actuel, soit créer une nouvelle version
              si et seulement si il y a une différence entre le dernier dossier
              et ce qu'il y a dans le BO ». */}
          {dossiers.length === 0 ? (
            <div className="fempty">Aucun dossier généré. Vous pouvez commercialiser sans dossier, mais l&apos;e-mail n&apos;aura rien à joindre.</div>
          ) : (
            <select className="min" value={dossier} onChange={(e) => setDossier(e.target.value)}>
              <option value="">Sans dossier</option>
              <option value={S(dossiers[0]._id)}>{libelleDossierChiffre(dossiers[0])} — dossier actuel</option>
            </select>
          )}
          {dossierPerime && (
            <div className="dif-simu">
              <b>La fiche a changé depuis le dossier V{S(dossiers[0]?.version)}</b> — {dossierPerime}.{" "}
              <Link className="dos-lien" href={`/bien/${String(b.im._id)}?ecran=dossiers`}>Créer une nouvelle version →</Link>
            </div>
          )}
          {/* Retour #355 — « à côté de la version et de la date tu mettras
              aussi le prix HAI, la renta et le prix au m², en rouge ou vert
              selon si c'est au-dessus ou en dessous du secteur ». Une liste
              déroulante ne sait pas porter de couleur : les chiffres du
              dossier RETENU se lisent donc juste en dessous, colorés. */}
          {doc && <ChiffresDossier d={doc} secteur={b.secteur} />}
          {/* Et la pièce jointe elle-même, « pour qu'on puisse le vérifier
              avant envoi ». Pas de bouton pour la retirer : elle se change à
              la ligne du dessus, c'est le même geste en plus clair. */}
          {doc && <PieceJointe d={doc} onPoids={setPoidsDossier} />}

          {/* Retour #359, option C — « on va sûrement générer automatiquement
              dans l'état locatif actuel mais qu'on pourra aussi peut-être faire
              de façon excel ». Les deux, donc, dans la même case : on ne joint
              qu'UNE seconde pièce. */}
          <span className="mlab">Seconde pièce jointe</span>
          {pj2 ? (
            <div className="asst-pj2">
              <span className="asst-pj2-n">
                {pj2.nom}
                {pj2.octets ? ` — ${(pj2.octets / 1_048_576).toFixed(1)} Mo` : ""}
                <i>{pj2.source === "genere" ? "généré depuis l'état locatif de la fiche" : "déposé à la main"}</i>
              </span>
              {pj2.path && (
                <a className="fadd" href={`/api/photo?s=${encodeURIComponent(pj2.path)}`} target="_blank" rel="noreferrer">Voir</a>
              )}
              <button className="fadd" type="button" onClick={() => { setPj2(null); setPj2Erreur(null); }}>Retirer</button>
            </div>
          ) : (
            <div className="mrow">
              <button className="fadd" type="button" disabled={pending}
                onClick={() => start(async () => {
                  setPj2Erreur(null);
                  /* Retour #426 : un tableur (CSV lisible par Excel), pas un PDF. */
                  const r = await genererEtatLocatifCsv(String(b.im._id));
                  if (r.ok) setPj2({ nom: r.nom, octets: r.octets, path: r.path, source: "genere" });
                  else setPj2Erreur(r.message);
                })}>
                {pending ? "Génération…" : "Générer l'état locatif (Excel / CSV)"}
              </button>
              <label className="fadd" style={{ cursor: "pointer" }}>
                Déposer un fichier
                <input type="file" style={{ display: "none" }}
                  accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,.odt,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setPj2Erreur(null);
                    setPj2({ nom: f.name, octets: f.size, source: "depose" });
                  }} />
              </label>
            </div>
          )}
          {pj2Erreur && <div className="dif-simu"><b>L&apos;état locatif n&apos;a pas pu être généré</b> — {pj2Erreur}</div>}

          {/* Le plafond porte sur le TOTAL, dossier compris (demande MAV). */}
          <div className={pesee.depasse ? "dif-simu" : "asst-note"}>
            {pesee.depasse && <b>Pièces jointes trop lourdes</b>} {pesee.message}
          </div>

          <span className="mlab">
            Lien de partage du dossier
            {/* Retour #354 — le grand encart transfer.it prenait le tiers de
                l'étape pour dire une chose qui tient en un mot. Il devient un
                picto à côté du titre. */}
            <a className="asst-tr-mini" href="https://transfer.it/start" target="_blank" rel="noreferrer"
              title="Déposer les pièces sur transfer.it et récupérer le lien">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 16V4M8 8l4-4 4 4" />
                <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
              Créer un lien transfer.it
            </a>
          </span>
          <input className="min" placeholder="https://… (dossier, photos, plans)" value={lien}
            onChange={(e) => { setLien(e.target.value); setMessage(messageCommercialisation(bienMail, e.target.value)); }} />
          <div className="asst-note">
            Le lien est inséré dans le corps de l&apos;e-mail. Préférez un lien expirant : il circulera
            auprès de {controle.personnes} destinataire{controle.personnes > 1 ? "s" : ""}. RGPD : caviardez les baux avant de les
            déposer — le nom, la profession et les coordonnées d&apos;un locataire n&apos;ont rien à
            faire dans un dossier d&apos;acquéreur.
          </div>
          <div className="wnav"><span className="sp" style={{ flex: 1 }} />
            <button className="kgo" type="button" onClick={() => setEtape("Mandat")}><span className="ch">›</span> Continuer</button>
          </div>
        </div>
      )}

      {etape === "Mandat" && (
        <div className="asst-b">
          <span className="mlab">Mandat rattaché</span>
          {mandats.length === 0 ? (
            <div className="fempty">Aucun mandat sur cet immeuble.</div>
          ) : (
            <select className="min" value={mandat} onChange={(e) => setMandat(e.target.value)}>
              <option value="">Sans mandat</option>
              {mandats.map((m) => (
                <option key={S(m._id)} value={S(m._id)}>{libelleMandat(m)}</option>
              ))}
            </select>
          )}
          <div className="wnav">
            <button className="fadd" type="button" onClick={() => setEtape("Dossier")}>← Retour</button>
            <span className="sp" style={{ flex: 1 }} />
            <button className="kgo" type="button" onClick={() => setEtape("Acheteurs")}><span className="ch">›</span> Continuer</button>
          </div>
        </div>
      )}

      {etape === "Acheteurs" && (
        <div className="asst-b">
          <div className="asst-rec">
            <span><b>{cibles.length}</b> acquéreurs ciblés</span>
            <span><b>{dest.emails.length}</b> e-mails</span>
            <span><b>{dest.telephones.length}</b> téléphones</span>
            <span className="off">{cibles.length - dest.joignables.length} injoignables</span>
          </div>
          <div className="asst-note">
            Une proposition sera créée pour chaque acquéreur ciblé, et l&apos;immeuble sera marqué
            « déjà proposé » sur sa recherche — il n&apos;apparaîtra plus dans les prochains matchings.
          </div>
          <span className="mlab">Objet de l&apos;e-mail</span>
          <input className="min" value={objet} onChange={(e) => setObjet(e.target.value)} />
          <span className="mlab">Message</span>
          <textarea className="min" rows={12} value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="mrow">
            <button className="fadd" type="button" onClick={() => { setObjet(objetCommercialisation(bienMail)); setMessage(messageCommercialisation(bienMail, lien)); }}>Régénérer l&apos;objet et le message</button>
            <button className="fadd" type="button" onClick={() => copier(message)}>Copier le message</button>
          </div>
          <div className="wnav">
            <button className="fadd" type="button" onClick={() => setEtape("Mandat")}>← Retour</button>
            <span className="sp" style={{ flex: 1 }} />
            <button
              className="kgo" type="button" disabled={pending || cibles.length === 0}
              style={pending ? { opacity: 0.5 } : undefined} onClick={creer}
            ><span className="ch">›</span> Créer {cibles.length} propositions</button>
          </div>
        </div>
      )}

      {etape === "E-mails" && (
        <div className="asst-b">
          <div className="asst-ok">✓ {creees} propositions créées.</div>

          {/* Retour #360 : le compte, et ce qui n'y est pas. */}
          <div className="asst-rec">
            <span>
              <b>{controle.personnes}</b>
              {` personne${controle.personnes > 1 ? "s" : ""} `}
              {controle.personnes > 1 ? "recevront" : "recevra"}
              {" l'e-mail"}
            </span>
            {controle.doublons.length > 0 && (
              <span className="off">{controle.doublons.length} doublon{controle.doublons.length > 1 ? "s" : ""} fondu{controle.doublons.length > 1 ? "s" : ""}</span>
            )}
            {controle.invalides.length > 0 && (
              <span className="rouge">{controle.invalides.length} adresse{controle.invalides.length > 1 ? "s" : ""} à corriger</span>
            )}
            {controle.sansAdresse.length > 0 && (
              <span className="off">{controle.sansAdresse.length} sans e-mail</span>
            )}
          </div>

          {controle.invalides.length > 0 && (
            <div className="asst-anos">
              <b>Ces adresses ne partiront pas</b>
              {controle.invalides.map((l, i) => (
                <div className="asst-ano" key={i}>
                  {l.contactId
                    ? <a href={`/contact/${l.contactId}`} target="_blank" rel="noreferrer">{l.nom} ↗</a>
                    : <span>{l.nom}</span>}
                  <code>{l.valeur}</code>
                  <i>{l.raison}</i>
                </div>
              ))}
            </div>
          )}

          {douteux.length > 0 && (
            <div className="asst-anos doute">
              <b>Domaines qui ressemblent à une faute de frappe</b>
              {douteux.map((d) => (
                <div className="asst-ano" key={d.valeur}>
                  <code>{d.valeur}</code>
                  <i>vouliez-vous dire « @{d.propose} » ?</i>
                </div>
              ))}
              <i className="asst-ano-n">
                Ces adresses PARTIRONT : elles sont valides, elles n&apos;existent peut-être
                simplement pas. À vérifier sur la fiche avant d&apos;envoyer.
              </i>
            </div>
          )}

          {controle.sansAdresse.length > 0 && (
            <div className="asst-anos">
              <b>Ciblés sans adresse e-mail</b>
              {controle.sansAdresse.map((l, i) => (
                <div className="asst-ano" key={i}>
                  {l.contactId
                    ? <a href={`/contact/${l.contactId}`} target="_blank" rel="noreferrer">{l.nom} ↗</a>
                    : <span>{l.nom}</span>}
                  <i>{l.raison}</i>
                </div>
              ))}
            </div>
          )}

          {controle.doublons.length > 0 && (
            <div className="asst-anos">
              <b>Une seule adresse pour plusieurs recherches</b>
              {controle.doublons.map((d) => (
                <div className="asst-ano" key={d.valeur}>
                  <code>{d.valeur}</code>
                  <i>{d.noms.join(" · ")} — un seul e-mail part</i>
                </div>
              ))}
            </div>
          )}

          <span className="mlab">Destinataires retenus ({controle.personnes})</span>
          <textarea className="min mono" rows={5} readOnly value={controle.adresses.join("; ")} />
          <div className="mrow">
            <button className="fadd" type="button" onClick={() => copier(controle.adresses.join("; "))}>{controle.personnes > 1 ? `Copier les ${controle.personnes} adresses` : "Copier l'adresse"}</button>
            <a className="fadd" href={`mailto:?bcc=${encodeURIComponent(controle.adresses.join(","))}&subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(message)}`}>
              Ouvrir dans le client mail
            </a>
          </div>
          <div className="asst-note">
            Les adresses sont dédoublonnées : un acquéreur ayant plusieurs recherches ne reçoit
            qu&apos;un e-mail. Le bouton d&apos;envoi ci-dessous passe par la route de masse :
            sous-domaine dédié, réponse renvoyée à l&apos;agent, désabonnement en un clic. La copie
            et le client mail restent là pour les cas particuliers — en copie cachée.
          </div>
          {/* Retour #360 — « tout doit pouvoir s'envoyer d'ici d'un seul
              bouton », et « qu'on puisse aussi programmer l'heure d'envoi et
              le jour ». Vide = tout de suite. */}
          <span className="mlab">Envoyer</span>
          <div className="asst-quand">
            <label>
              <input type="radio" name="quand-mail" checked={!quandMail}
                onChange={() => setQuandMail("")} />
              Tout de suite
            </label>
            <label>
              <input type="radio" name="quand-mail" checked={!!quandMail}
                onChange={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(8, 0, 0, 0);
                  const p = (n: number) => String(n).padStart(2, "0");
                  setQuandMail(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T08:00`);
                }} />
              À une date choisie
            </label>
            {quandMail && (
              <input className="min" type="datetime-local" value={quandMail}
                onChange={(e) => setQuandMail(e.target.value)} />
            )}
          </div>
          {quandMail && (
            <div className="asst-note">
              SendGrid ne retient un message que <b>72 heures</b>, et une salve déjà confiée ne
              s&apos;annule plus depuis ici.
            </div>
          )}
          {envoiMail && <div className="asst-ok">{envoiMail}</div>}

          <div className="wnav">
            <button
              className="fadd" type="button" disabled={pending || mailsEnvoyes}
              onClick={() => commId && start(async () => {
                await markCommercialisationSent(String(b.im._id), commId, "mail");
                setMailsEnvoyes(true);
                setEtape("SMS");
              })}
            >{mailsEnvoyes ? "E-mails marqués envoyés ✓" : "Marquer envoyés à la main"}</button>
            <span className="sp" style={{ flex: 1 }} />
            <button
              className="kgo" type="button"
              disabled={pending || envoiEnCours || mailsEnvoyes || restantes.length === 0 || pesee.depasse}
              onClick={async () => {
                if (!commId) return;
                const n = restantes.length;
                const d = quandMail ? new Date(quandMail) : undefined;
                const differe = d && !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
                if (!(await confirmer(
                  <>
                    {differe
                      ? `Programmer cet e-mail pour le ${d!.toLocaleString("fr-FR")}, à ${n} personne${n > 1 ? "s" : ""} ?`
                      : `Envoyer cet e-mail à ${n} personne${n > 1 ? "s" : ""} ?`}
                    <br /><br />
                    {pesee.message}
                    <br />
                    {differe
                      ? "Une salve confiée à SendGrid ne s'annule plus depuis ici."
                      : "Un e-mail parti ne se rattrape pas."}
                  </>,
                  { oui: differe ? "Programmer" : "Envoyer" },
                ))) return;
                void envoyerParLots(restantes, differe ? d!.toISOString() : undefined);
              }}
            >
              <span className="ch">›</span>{" "}
              {faits.length > 0 ? "Reprendre l'envoi : " : quandMail ? "Programmer" : "Envoyer"}{" "}
              {restantes.length > 1 ? `les ${restantes.length} e-mails` : "l'e-mail"}
            </button>
          </div>
        </div>
      )}

      {etape === "SMS" && (
        <div className="asst-b">
          <span className="mlab">Message SMS</span>
          <textarea className="min" rows={4} value={sms} onChange={(e) => setSms(e.target.value)} />
          <div className="asst-note">{sms.length} caractères — au-delà de 160, l&apos;opérateur facture plusieurs SMS.</div>

          <span className="mlab">Numéros ({dest.telephones.length}) — {lots.length} paquet{lots.length > 1 ? "s" : ""} de 50</span>
          {lots.length === 0 && <div className="fempty">Aucun numéro exploitable parmi les acquéreurs ciblés.</div>}
          {lots.map((lot, i) => (
            <div className="asst-lot" key={i}>
              <div className="asst-lot-h">
                Paquet {i + 1} — {lot.length} numéros
                <button className="fadd" type="button" onClick={() => copier(lot.join(","))}>Copier les numéros</button>
              </div>
              <textarea className="min mono" rows={3} readOnly value={lot.join(", ")} />
            </div>
          ))}
          <div className="asst-note">
            Numéros normalisés au format international et dédoublonnés. Les saisies inexploitables
            ont été écartées plutôt qu&apos;envoyées telles quelles. Les numéros déjà désinscrits
            chez MailingVox sont retirés au moment de l&apos;envoi.
          </div>

          {/* La mention de désinscription. MailingVox refuse la campagne sans
              elle (erreurs 24 et 38), et la CNIL l'impose. On le dit AVANT le
              clic plutôt que de récupérer un code d'erreur après. */}
          {!/\bstop\b/i.test(sms) && (
            <div className="dif-simu">
              <b>Mention « STOP » absente</b> — MailingVox refusera la campagne, et c&apos;est une
              obligation CNIL. Ajoutez « STOP au {pont?.numeroStop ?? "36200"} » à la fin du message.
            </div>
          )}
          {pont?.numeroStop && /\bstop au (\d{4,5})\b/i.test(sms)
            && !sms.toLowerCase().includes(`stop au ${pont.numeroStop}`) && (
            <div className="dif-simu">
              <b>Numéro de désinscription différent</b> — le message annonce «&nbsp;
              {/\bstop au (\d{4,5})\b/i.exec(sms)?.[1]}&nbsp;» alors que MailingVox route les STOP
              vers le {pont.numeroStop}. Une opposition envoyée au mauvais numéro ne leur revient
              pas, et on continue d&apos;écrire à quelqu&apos;un qui a dit non.
            </div>
          )}

          {/* La programmation (demande MAV). Vide = envoi immédiat. */}
          <span className="mlab">Envoyer</span>
          <div className="asst-quand">
            <label>
              <input type="radio" name="quand-sms" checked={!quandSms}
                onChange={() => setQuandSms("")} />
              Tout de suite
            </label>
            <label>
              <input type="radio" name="quand-sms" checked={!!quandSms}
                onChange={() => {
                  /* Par défaut, demain 8 h — l'heure que MAV a citée, et la
                     première du créneau légal (8 h – 22 h). */
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(8, 0, 0, 0);
                  const p = (n: number) => String(n).padStart(2, "0");
                  setQuandSms(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T08:00`);
                }} />
              À une date choisie
            </label>
            {quandSms && (
              <input className="min" type="datetime-local" value={quandSms}
                onChange={(e) => setQuandSms(e.target.value)} />
            )}
          </div>
          <div className="asst-note">
            Les SMS marketing ne sont autorisés que du <b>lundi au samedi, de 8 h à 22 h</b>, hors
            jours fériés. MailingVox reporte d&apos;office un envoi programmé hors de ces créneaux —
            il ne l&apos;annule pas, il le décale.
          </div>

          {/* L'envoi direct par MailingVox. Il ne remplace pas le marquage
              manuel : beaucoup d'envois se font encore depuis le téléphone de
              l'agent, et il faut pouvoir dire « c'est fait » sans passer par ici. */}
          {pont && (
            <div className={pont.configure ? "asst-note" : "dif-simu"}>
              {!pont.configure && <b>Envoi automatique indisponible</b>}
              {pont.message}
              {pont.configure && ` Plafond par envoi : ${pont.plafond} numéros.`}
            </div>
          )}
          {envoi && <div className="asst-ok">{envoi}</div>}
          <div className="wnav">
            <span className="sp" style={{ flex: 1 }} />
            <button
              className="fadd" type="button" disabled={pending || smsEnvoyes}
              onClick={() => commId && start(async () => {
                await markCommercialisationSent(String(b.im._id), commId, "sms");
                setSmsEnvoyes(true);
              })}
            >{smsEnvoyes ? "SMS marqués envoyés ✓" : "Marquer les SMS comme envoyés"}</button>
            {pont?.configure && (
              <button className="kgo" type="button"
                disabled={pending || smsEnvoyes || dest.telephones.length === 0}
                onClick={envoyerLesSms}>
                <span className="ch">›</span>{" "}
                {quandSms ? "Programmer" : "Envoyer"}{" "}
                {dest.telephones.length > 1 ? `les ${dest.telephones.length} SMS` : "le SMS"}
              </button>
            )}
            <button className="fadd" type="button" onClick={fermer}>Terminer</button>
          </div>
        </div>
      )}
      {question}
    </div>
  );
}

/* ---------- Ce que porte une ligne de dossier et de mandat ---------- */

const N = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
const pct = (v: unknown) =>
  N(v) === undefined ? undefined : `${N(v)!.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

/**
 * Le libellé d'un dossier dans la liste déroulante (retour #355).
 *
 * MAV : « à côté de la version et de la date tu mettras aussi le prix HAI, la
 * renta et le prix au m² ». Choisir entre « Dossier V1 » et « Dossier V2 »
 * sans voir sur quels chiffres ils reposent, c'est choisir à l'aveugle — et
 * c'est ce dossier-là qui part chez les acquéreurs.
 */
function libelleDossierChiffre(d: Record<string, unknown>): string {
  const m2 = N(d.prix_hai) && N(d.surface) ? Math.round(N(d.prix_hai)! / N(d.surface)!) : undefined;
  const bouts = [
    euros(d.prix_hai),
    pct(d.renta_actuelle),
    m2 ? `${m2.toLocaleString("fr-FR")} €/m²` : undefined,
  ].filter(Boolean);
  return bouts.length ? `${libelleDossier(d)} · ${bouts.join(" · ")}` : libelleDossier(d);
}

/**
 * Les chiffres du dossier retenu, colorés face au secteur (#355).
 *
 * Une `<option>` ne sait pas porter de couleur — aucun navigateur ne la
 * stylera de façon fiable. Les chiffres se relisent donc sous la liste, où
 * une pastille verte ou rouge veut dire quelque chose.
 *
 * Attention au sens, il n'est pas le même des deux côtés : sur le PRIX au m²,
 * le vert est EN DESSOUS du secteur ; sur le RENDEMENT, il est AU-DESSUS.
 * Les deux disent « bonne nouvelle pour qui achète », comme sur les cartes du
 * tableau de bord.
 */
function ChiffresDossier({ d, secteur }: { d: Record<string, unknown>; secteur: Record<string, unknown> | null }) {
  const prixM2 = N(d.prix_hai) && N(d.surface) ? N(d.prix_hai)! / N(d.surface)! : undefined;
  const refPrix = N(secteur?.["0 - prix"]);
  const renta = N(d.renta_actuelle);
  const refRenta = N(secteur?.["0 - renta _%"]);

  const couleur = (v?: number, ref?: number, vertEnDessous = true) => {
    if (v === undefined || ref === undefined) return "";
    const sous = v < ref;
    if (Math.abs(v / ref - 1) < 0.005) return "";
    return (vertEnDessous ? sous : !sous) ? " vert" : " rouge";
  };

  return (
    <div className="asst-chiffres">
      {euros(d.prix_hai) && <span className="ac-v">{euros(d.prix_hai)}</span>}
      {prixM2 !== undefined && (
        <span className={`ac-p${couleur(prixM2, refPrix, true)}`}
          title={refPrix ? `Secteur : ${Math.round(refPrix).toLocaleString("fr-FR")} €/m²` : "Pas de prix de secteur relevé"}>
          {Math.round(prixM2).toLocaleString("fr-FR")} €/m²
        </span>
      )}
      {renta !== undefined && (
        <span className={`ac-p${couleur(renta, refRenta, false)}`}
          title={refRenta ? `Secteur : ${refRenta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "Pas de rendement de secteur relevé"}>
          {pct(renta)} brut
        </span>
      )}
      {/* MAV : « renta max en général on met la renta potentielle ». Les
          chiffres lui donnent raison — sur 344 dossiers complets, 268 sont
          compatibles avec un calcul « loyers de marché », et 202 sur 344 ont
          un max au-dessus de l'actuel. Lille était l'exception.

          Restent 25 dossiers où le max est INFÉRIEUR à l'actuel, et ce sont
          de vraies anomalies de saisie (Amiens : loyers 84 000 € qui tombent
          à 60 000 € au « max »). On ne les cache pas derrière le mot
          « potentiel » : la pastille le dit. */}
      {N(d.renta_max) !== undefined && renta !== undefined && N(d.renta_max) !== renta && (
        N(d.renta_max)! > renta ? (
          <span className="ac-v off">{pct(d.renta_max)} au potentiel</span>
        ) : (
          <span className="ac-p rouge"
            title={`Le « potentiel » de ce dossier (${pct(d.renta_max)}) est SOUS le rendement actuel (${pct(renta)}) : `
              + "les loyers de marché saisis sont inférieurs aux loyers en place. À vérifier dans l'état locatif."}>
            {pct(d.renta_max)} « potentiel » — incohérent
          </span>
        )
      )}
    </div>
  );
}

/**
 * La pièce jointe du dossier retenu (#355 : « qu'on puisse le vérifier avant
 * envoi », #359 : « on devrait voir la PJ qui va être envoyée avec le poids »).
 *
 * Le poids n'est pas en base. Il se demande au fichier lui-même, par une
 * requête `HEAD` : c'est une info que seul le serveur qui l'héberge connaît,
 * et elle décide de la délivrabilité de la salve.
 */
function PieceJointe({ d, onPoids }: { d: Record<string, unknown>; onPoids?: (o: number | null) => void }) {
  const url = [d.pdf, d.FILE].map(S).find((u) => u.length > 0);
  const [poids, setPoids] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!url) return;
    let vivant = true;
    const abs = url.startsWith("//") ? `https:${url}` : url;
    fetch(abs, { method: "HEAD" })
      .then((r) => {
        const l = Number(r.headers.get("content-length"));
        const v = Number.isFinite(l) && l > 0 ? l : null;
        if (vivant) { setPoids(v); onPoids?.(v); }
      })
      .catch(() => { if (vivant) { setPoids(null); onPoids?.(null); } });
    return () => { vivant = false; };
  }, [url, onPoids]);

  if (!url) {
    return <div className="asst-note">Ce dossier n&apos;a pas de PDF rattaché : l&apos;e-mail partira sans pièce jointe.</div>;
  }
  const abs = url.startsWith("//") ? `https:${url}` : url;
  const mo = typeof poids === "number" ? poids / 1_048_576 : undefined;
  return (
    <a className={`asst-pj${mo !== undefined && mo > 3 ? " lourd" : ""}`} href={abs} target="_blank" rel="noreferrer">
      <span className="asst-pj-i" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></svg>
      </span>
      <span className="asst-pj-t">
        <b>{libelleDossier(d)} — ouvrir la pièce jointe</b>
        {/* Trois états, pas deux : « en cours », « connu », et « refusé ». Le
            serveur qui héberge le PDF peut très bien répondre sans autoriser
            la lecture de l'en-tête depuis le navigateur — laisser « en cours
            de lecture » pour toujours serait le pire des trois. */}
        {poids === undefined ? "Lecture du poids…"
          : poids === null ? "Poids non communiqué par l'hébergeur — ouvrez la pièce pour le vérifier."
          : mo! > 3 ? `${mo!.toFixed(1)} Mo — au-delà de 3 Mo, la délivrabilité chute.`
          : `${mo!.toFixed(1)} Mo`}
      </span>
    </a>
  );
}

/**
 * Le libellé d'un mandat dans la liste (retour #356).
 *
 * MAV : « à côté du numéro de mandat et du statut tu mettras le prix hai, le
 * montant des honos en % et la date de signature ». La date retenue est
 * `date_effet` — le miroir Bubble n'a pas de champ « signé le », et c'est
 * elle que le mandat porte comme point de départ.
 */
function libelleMandat(m: Record<string, unknown>): string {
  const tete = `${S(m.Type) || "Mandat"} ${m.numero ? `n°${S(m.numero)}` : "sans numéro"} — ${S(m.Statut)}`;
  const bouts = [
    euros(m.prix_hai),
    N(m.honos_taux) !== undefined ? `${pct(m.honos_taux)} d'honoraires` : undefined,
    dmy(m.date_effet) ? `effet ${dmy(m.date_effet)}` : undefined,
  ].filter(Boolean);
  return bouts.length ? `${tete} · ${bouts.join(" · ")}` : tete;
}

/* ---------- Messages par défaut, fusionnés depuis la fiche ---------- */


function smsParDefaut(b: BienData) {
  const im = b.im;
  /* « France Immeuble » EN TÊTE (demande MAV) : l'expéditeur est un numéro
     court à cinq chiffres — choisi, pour que le client puisse répondre — donc
     c'est le début du texte qui dit qui écrit. Et c'est précisément ce que la
     liste de conversations affiche en aperçu. */
  const bits = [
    `France Immeuble — immeuble à vendre ${b.ville || ""}`.trim(),
    typeof im.surface_carrez === "number" ? `${Math.round(im.surface_carrez as number)} m²` : "",
    typeof im.fin_renta_ba === "number" ? `${im.fin_renta_ba} % brut` : "",
    euros(im.prix_hai) ?? "",
  ].filter(Boolean);
  /* Le numéro de désinscription : celui que MailingVox route. Il est
     réglable côté serveur (`MAILINGVOX_STOP`) et l'écran signale la
     divergence si ce littéral s'en écarte. */
  return `${bits.join(" · ")} — dossier sur demande. STOP au 36200`;
}
