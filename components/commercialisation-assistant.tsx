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
import { destinataires, telAffiche, telE164, type Acquereur } from "@/lib/bo/matching";
import { dateLien, expirationParDefaut, lienDuDossier, lienPdfBo, urlPdfDossier } from "@/lib/bo/lien-dossier";
import { chiffresDossier, ecartsDossierMandat, type EcartMandat } from "@/lib/bo/chiffres-dossier";
import { TelephoneRcs, type CarteRcsVue } from "@/components/carte-rcs";
import { BoutonSupprimerCommercialisation } from "@/components/supprimer-commercialisation";
import { resumeDepuisDoc, smsEnvoiDossier } from "@/lib/bo/resume-immeuble";
import { dmy, euros, libelleDossier, S } from "@/lib/format";
import {
  avecLienDossier, insererLienDossier,
  messageCommercialisation, objetCommercialisation, rendementPotentiel, type BienMail,
} from "@/lib/bo/mail-commercialisation";
import { controlerEnvoi, domaineSuspect, peserPiecesJointes } from "@/lib/bo/controle-envoi";
import { horsCreneauLegal } from "@/lib/bo/creneau-legal";
import { introVersCarte, longueurRepli, refusRepli } from "@/lib/bo/rcs-texte";
import { oublier, useMemoire } from "@/lib/memoire";
import { annulerRcsProgrammeCommercialisation, apercuRcsCommercialisation, createCommercialisation, programmerRcsCommercialisation, envoyerRcsCommercialisation, envoyerRcsEssaiCommercialisation, etatEnvoiSms, majLienDossier, etatMailsCommercialisation, genererEtatLocatifCsv, markCommercialisationSent } from "@/lib/bo/actions";
import { useQuestion } from "@/components/modale";
import { useBudgetSalveLong, useSalveRelances } from "@/components/salve-relances";

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
  /* MAV (09/11) : les RCS se programment comme les e-mails. Vide = tout de
     suite. `rcsProg` : la programmation enregistrée, relue sur le serveur. */
  const [quandRcs, setQuandRcs] = useMemoire(`${memo}:quand-rcs`, "");
  /* MAV (09/11) : « j'ai une case pour programmer les RCS à la même date et
     même heure » que les e-mails, sur la page des e-mails. */
  const [rcsAvecMails, setRcsAvecMails] = useMemoire(`${memo}:rcs-avec-mails`, false);
  /* MAV (09/11) : l'accroche de la carte et le SMS de repli se retouchent ici.
     Vide = le texte fabriqué par le BO. */
  const [rcsIntro, setRcsIntro] = useMemoire(`${memo}:rcs-intro`, "");
  const [rcsRepli, setRcsRepli] = useMemoire(`${memo}:rcs-repli`, "");
  const textesRcs = { intro: rcsIntro.trim() || undefined, repli: rcsRepli.trim() || undefined };
  /* MAV (09/11) : « je veux que les propositions se créent que quand l'e-mail
     au moins a été envoyé ». L'étape Acheteurs ne crée plus rien : elle
     valide la liste, et c'est l'envoi (ou la programmation) des e-mails qui
     crée la commercialisation et ses propositions (`assurerCommercialisation`). */
  const [acheteursValides, setAcheteursValides] = useMemoire(`${memo}:acheteurs-valides`, false);
  const [rcsProg, setRcsProg] = useState<{ etat: string; quand: string; numeros: number; erreur?: string } | null>(null);

  const dossiers = b.dossiers;
  const [dossier, setDossier] = useMemoire(`${memo}:dossier`, dossierId ?? S(dossiers[0]?._id));
  const mandats = b.mandats;
  const [mandat, setMandat] = useMemoire(`${memo}:mandat`, S(mandats[0]?._id));
  /* Le lien part du DOSSIER choisi (MAV, 28/09) : celui qu'on y a posé, s'il
     est encore valable. La mémoire de session prime si l'agent l'a retouché. */
  const lienDossierChoisi = lienDuDossier(dossiers.find((d) => S(d._id) === dossier) ?? dossiers[0]);
  const [lien, setLien] = useMemoire(`${memo}:lien`, lienDossierChoisi && !lienDossierChoisi.aRemplacer ? lienDossierChoisi.url : "");
  /* Le lien transfer.it est OBLIGATOIRE (MAV, 28/09 : « de telle façon qu'on
     envoie toujours un lien avec les e-mails ou les SMS ») : vide, ou égal au
     lien périmé du dossier, rien ne part. */
  const lienManque = !lien.trim() || !!(lienDossierChoisi && lien.trim() === lienDossierChoisi.url && lienDossierChoisi.aRemplacer);

  /* Sortir de l'assistant — « Fermer » comme « Terminer » — referme le
     dossier : la mémoire de CETTE commercialisation est jetée, sinon la
     suivante rouvrirait le message de la précédente. */
  const fermer = () => { oublier(`${memo}:`); onFermer(); };

  const prixHai = typeof b.im.prix_hai === "number" ? (b.im.prix_hai as number) : undefined;

  /* Ce que l'objet et le corps ont besoin de savoir du bien (#357, #358).
     MAV (03/11) : « il faut que les rendements et prix au m² correspondent
     toujours au dossier que j'envoie ». Les chiffres viennent donc du DOSSIER
     choisi — ceux que son PDF imprime (lib/bo/chiffres-dossier.ts) ; la fiche
     ne sert qu'à défaut de dossier. */
  const docChoisi = dossiers.find((x) => S(x._id) === dossier);
  const construireBienMail = (d: Record<string, unknown> | undefined): BienMail => {
    const c = chiffresDossier(d);
    const somme = (cle: string, repli?: string) => b.lots.reduce((t, l) => {
      const v = typeof l[cle] === "number" ? (l[cle] as number)
        : repli && typeof l[repli] === "number" ? (l[repli] as number) : 0;
      return t + v;
    }, 0);
    const loyersMax = somme("loyer_max", "loyer");
    const renta = typeof b.im.fin_renta_ba === "number" ? b.im.fin_renta_ba : undefined;
    const travaux = typeof b.im.fin_travaux === "number" ? (b.im.fin_travaux as number) : 0;
    return {
      ville: b.ville,
      codePostal: b.im.adresse_zipcode,
      surfaceCarrez: c?.surface ?? b.im.surface_carrez,
      prixHai: c?.prixHai ?? prixHai,
      /* Le prix au m² ACTUEL : prix HAI ÷ surface, sans travaux. */
      prixM2: c?.prixM2 ?? (prixHai && typeof b.im.surface_carrez === "number" && b.im.surface_carrez > 0
        ? prixHai / b.im.surface_carrez
        : typeof b.im.prix_hai_m2 === "number" ? b.im.prix_hai_m2 : undefined),
      occupation: c?.occupation ?? b.im.occupation_lots,
      renta: c?.rentaActuelle ?? renta,
      /* Retour #594 : loyers potentiels annuels ÷ (prix HAI + travaux). */
      rentaPotentielle: c?.rentaPotentielle ?? rendementPotentiel(loyersMax * 12, prixHai, travaux),
      destinations: b.lots.map((l) => String(l.Destination ?? "")).filter(Boolean),
      agentNom: b.agentNom,
      agentTel: b.agentTel,
    };
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bienMail: BienMail = useMemo(() => construireBienMail(docChoisi), [b, prixHai, docChoisi]);
  /* « Tu dois me dire s'il y a une différence entre le dossier que j'envoie
     et le mandat » (MAV, 03/11) : prix HAI, net vendeur, honoraires. */
  const mandatChoisi = mandats.find((m) => S(m._id) === mandat);
  const ecartsMandat = ecartsDossierMandat(docChoisi, mandatChoisi);

  const [objet, setObjet] = useMemoire(`${memo}:objet`, objetCommercialisation(bienMail));
  const [message, setMessage] = useMemoire(`${memo}:message`, messageCommercialisation(bienMail, lien));
  const [sms, setSms] = useMemoire(`${memo}:sms`, smsParDefaut(b, lien, docChoisi));
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
  /* MAV, 29/09 : « mets aussi les e-mails de commercialisation sur la file ».
     L'envoi ne tourne plus dans cette page : il est inscrit sur la file du
     serveur (components/salve-relances.tsx), et la page ne fait qu'en lire
     l'avancement — fermée, l'automate continue. `faitsAvant` : ce qui était
     déjà parti quand la salve a été lancée, pour que le compteur reste
     celui de la commercialisation entière. */
  const { salve, lancerCommercialisation } = useSalveRelances();
  useBudgetSalveLong();
  const [faitsAvant, setFaitsAvant] = useMemoire<number>(`${memo}:faits-avant`, 0);
  const salveCom = salve && salve.genre === "commercialisation" && salve.commId === commId ? salve : null;
  const envoiEnCours = !!salveCom?.enCours;
  const progresAffiche = salveCom
    ? {
      fait: faitsAvant + salveCom.mails.fait, total: faitsAvant + salveCom.mails.total, echecs: salveCom.mails.echecs,
      enCours: salveCom.enCours, message: salveCom.message,
    }
    : progres;
  useEffect(() => {
    if (!commId) return;
    let vivant = true;
    etatMailsCommercialisation(commId)
      .then((e) => {
        if (!vivant) return;
        setFaits(e.faits);
        if (e.termine) setMailsEnvoyes(true);
        if (e.smsEnvoyes) setSmsEnvoyes(true);
        setRcsProg(e.rcsProgramme);
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

  /* MAV (03/11) : « le PDF je veux vraiment qu'il se mette en PJ et qu'il n'y
     ait pas de doute », et « il faut que je puisse voir le lien transfer.it ».
     Deux verrous de plus sur l'envoi : pas d'e-mail sans le PDF du dossier,
     pas d'e-mail dont le texte ne montre pas le lien. */
  const pdfDossier = piecesJointes.find((p) => /^Dossier-/.test(p.nom));
  const lienAbsent = !!lien.trim() && !message.includes(lien.trim());

  const envoyerParLots = async (commId: string, adresses: string[], quand?: string) => {
    const total = faits.length + adresses.length;
    const avant = faits.length;
    setFaitsAvant(avant);
    setEnvoiMail(null);
    setProgres({ fait: avant, total, echecs: 0, enCours: true });
    const r = await lancerCommercialisation({
      titre: `Commercialisation ${b.ville || "immeuble"}`,
      agentNom: b.agentNom,
      charge: {
        immeubleId: String(b.im._id), commId, objet, message,
        destinataires: adresses, pieces: piecesJointes,
        quand, agentId: String(b.im.AGENT ?? "") || undefined, total,
      },
      /* À la fin — même si cette page a été fermée entre-temps et rouverte,
         l'état se relit sur la commercialisation. */
      apres: async () => {
        const e = await etatMailsCommercialisation(commId).catch(() => null);
        if (!e) return;
        setFaits(e.faits);
        setProgres({ fait: e.faits.length, total: e.total ?? total, echecs: e.echecs.length, enCours: false });
        if (e.termine) setMailsEnvoyes(true);
        setEnvoiMail(
          (quand ? `${e.faits.length} e-mails programmés pour le ${new Date(quand).toLocaleString("fr-FR")}` : `${e.faits.length} e-mails envoyés`)
          + (piecesJointes.length ? ` avec ${piecesJointes.length} pièce${piecesJointes.length > 1 ? "s" : ""} jointe${piecesJointes.length > 1 ? "s" : ""}` : " sans pièce jointe")
          + "."
          + (e.echecs.length ? ` ${e.echecs.length} en échec : ${e.echecs.slice(0, 3).map((x) => `${x.email} — ${x.raison}`).join(" · ")}` : ""),
        );
      },
    });
    if (!r.ok) {
      setProgres({ fait: avant, total, echecs: 0, enCours: false, message: r.message ?? "La salve n'a pas pu être lancée." });
    }
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

  /* La commercialisation et ses propositions n'existent qu'au départ des
     e-mails (MAV, 09/11). Appelée par « Envoyer / Programmer », « Marquer
     envoyés à la main » et l'envoi RCS : rend l'identifiant, existant ou neuf.
     Ce qui est enregistré, c'est l'objet et le message tels qu'ils partent. */
  const assurerCommercialisation = async (): Promise<string> => {
    if (commId) return commId;
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
    /* Le lien tapé ici devient celui du dossier, valable 89 jours : les
       relances le retrouveront (MAV, 28/09). */
    if (dossier && lien.trim() && lien.trim() !== lienDossierChoisi?.url) {
      await majLienDossier(String(b.im._id), dossier, lien.trim(), expirationParDefaut()).catch(() => undefined);
    }
    setCommId(res.commercialisationId);
    setCreees(res.propositions);
    return res.commercialisationId;
  };

  const copier = (txt: string) => navigator.clipboard?.writeText(txt);

  /* L'état du pont MailingVox, demandé à l'ouverture de l'étape SMS. On ne le
     devine pas côté navigateur : la clé ne descend jamais ici. */
  const [pont, setPont] = useState<{ configure: boolean; message: string; plafond: number; numeroStop: string } | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  /* Le numéro d'essai : celui de l'agent de la fiche, modifiable (demande
     MAV, 25/09). Un essai n'est pas un envoi : rien n'est marqué. */
  const [numEssai, setNumEssai] = useState(() => {
    const n = telE164(b.agentTel);
    return n ? telAffiche(n) : "";
  });
  const [essai, setEssai] = useState<string | null>(null);
  useEffect(() => {
    if ((etape !== "SMS" && etape !== "E-mails") || pont) return;
    let vivant = true;
    etatEnvoiSms().then((e) => { if (vivant) setPont(e); }).catch(() => undefined);
    return () => { vivant = false; };
  }, [etape, pont]);

  /* Doctrine §7.1 : l'application prépare, l'agent envoie. D'où la
     confirmation qui rappelle le nombre exact de destinataires et de segments
     facturés — c'est le dernier moment où l'erreur de ciblage coûte zéro. */
  /* La carte RCS, préparée côté serveur à l'entrée de l'étape — exactement
     ce qui partira : dossier choisi, lien saisi, agent du bien. */
  const cleRcs = `${dossier}|${lien.trim()}`;
  const [rcs, setRcs] = useState<{ cle: string; carte?: CarteRcsVue; erreur?: string } | null>(null);
  useEffect(() => {
    if (etape !== "SMS" && !(etape === "E-mails" && rcsAvecMails)) return;
    let vivant = true;
    apercuRcsCommercialisation({ immeubleId: String(b.im._id), dossierId: dossier || undefined, lien })
      .then((r) => { if (vivant) setRcs(r.ok ? { cle: cleRcs, carte: r.carte } : { cle: cleRcs, erreur: r.message }); })
      .catch(() => { if (vivant) setRcs({ cle: cleRcs, erreur: "La carte n'a pas pu être préparée." }); });
    return () => { vivant = false; };
  }, [etape, dossier, lien, cleRcs, b.im._id, rcsAvecMails]);
  /* Une carte préparée pour un autre dossier ou un autre lien n'est pas
     montrée : on attend celle qui correspond à l'écran. */
  const carteBrute = rcs?.cle === cleRcs ? rcs.carte ?? null : null;
  /* La carte telle qu'elle partira, retouches comprises : l'accroche saisie
     prend la place de celle du BO, le repli saisi celle du repli fabriqué. */
  const carteRcs: CarteRcsVue | null = carteBrute
    ? {
      ...carteBrute,
      texte: carteBrute.suite !== undefined && rcsIntro.trim()
        ? [introVersCarte(rcsIntro), carteBrute.suite].filter(Boolean).join("<br><br>")
        : carteBrute.texte,
      repli: rcsRepli.trim() || carteBrute.repliAuto || carteBrute.repli,
    }
    : null;
  const refusRepliRcs = carteRcs ? refusRepli(carteRcs.repli) : null;
  const erreurRcs = rcs?.cle === cleRcs ? rcs.erreur ?? null : null;

  const envoyerLesRcs = async () => {
    const nb = dest.telephones.length;
    if (refusRepliRcs) { setEnvoi(`Rien n'est parti : ${refusRepliRcs}.`); return; }
    if (quandRcs) {
      const d = new Date(quandRcs);
      if (!Number.isFinite(d.getTime())) { setEnvoi("Date d'envoi illisible."); return; }
      if (!(await confirmer(
        <>
          {`Programmer la carte RCS pour le ${d.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}, à ${nb} numéro${nb > 1 ? "s" : ""} ?`}
          <br /><br />
          Elle partira seule à cette heure-là, telle qu&apos;elle est affichée. Vous pourrez l&apos;annuler d&apos;ici tant qu&apos;elle n&apos;est pas partie.
        </>,
        { oui: "Programmer" },
      ))) return;
      start(async () => {
        const commId = await assurerCommercialisation();
        const r = await programmerRcsCommercialisation({
          immeubleId: String(b.im._id), commId, dossierId: dossier || undefined, lien, numeros: dest.telephones,
          quand: d.toISOString(), ...textesRcs,
        });
        if (r.ok) {
          setRcsProg({ etat: "attente", quand: r.quand, numeros: r.numeros });
          setEnvoi(null);
        } else {
          setEnvoi(r.message);
        }
      });
      return;
    }
    if (!(await confirmer(
      <>
        {`Envoyer la carte RCS à ${nb} numéro${nb > 1 ? "s" : ""} ?`}
        <br /><br />
        Les téléphones sans RCS reçoivent le SMS de repli à la place. Un message parti ne se rattrape pas.
      </>,
      { oui: "Envoyer" },
    ))) return;
    start(async () => {
      const commId = await assurerCommercialisation();
      const r = await envoyerRcsCommercialisation({
        immeubleId: String(b.im._id), commId, dossierId: dossier || undefined, lien, numeros: dest.telephones, ...textesRcs,
      });
      if (r.ok) {
        setSmsEnvoyes(true);
        setEnvoi(`${r.envoyes} RCS envoyés`
          + (r.ecartesStop ? `, ${r.ecartesStop} numéro${r.ecartesStop > 1 ? "s" : ""} écarté${r.ecartesStop > 1 ? "s" : ""} (STOP)` : "")
          + (r.campagne ? `. Campagne MailingVox n°${r.campagne}.` : "."));
      } else {
        setEnvoi(r.message ?? "L'envoi n'a pas abouti.");
      }
    });
  };

  /* L'aperçu de la carte et ses deux textes retouchables : sur la page des
     e-mails (case « programmer aussi les RCS ») comme sur l'étape RCS. */
  const editeurRcs = carteRcs && (
    <div className="asst-rcs-ed">
      <TelephoneRcs carte={carteRcs} />
      <label className="asst-rcs-champ">
        <span className="mlab">Texte de la carte</span>
        <textarea className="min" rows={5} value={rcsIntro || carteRcs.intro || ""}
          onChange={(e) => setRcsIntro(e.target.value)} />
        {rcsIntro.trim() && (
          <button type="button" className="fadd" onClick={() => setRcsIntro("")}>Revenir au texte d&apos;origine</button>
        )}
      </label>
      <label className="asst-rcs-champ">
        <span className="mlab">SMS de repli (téléphones sans RCS)</span>
        <textarea className="min" rows={3} value={rcsRepli || carteRcs.repliAuto || carteRcs.repli}
          onChange={(e) => setRcsRepli(e.target.value)} />
        <span className={refusRepliRcs ? "asst-rcs-compte ko" : "asst-rcs-compte"}>
          {longueurRepli(carteRcs.repli)} / 145 caractères{refusRepliRcs ? ` — ${refusRepliRcs}` : ""}
        </span>
        {rcsRepli.trim() && (
          <button type="button" className="fadd" onClick={() => setRcsRepli("")}>Revenir au SMS fabriqué</button>
        )}
      </label>
      <div className="asst-note">
        La photo, le titre, les chiffres, votre signature et les boutons suivent le dossier : ils ne se
        modifient pas ici. Retouchez-les à la source (étape Dossier, photo principale).
      </div>
    </div>
  );

  return (
    <div className="asst">
      <div className="asst-h">
        <span className="asst-t">Nouvelle commercialisation</span>
        <span className="sp" style={{ flex: 1 }} />
        <button className="fadd" type="button" onClick={fermer}>Fermer</button>
      </div>

      {progresAffiche && (
        <div className={`asst-prog${progresAffiche.enCours ? " encours" : progresAffiche.fait >= progresAffiche.total && progresAffiche.total > 0 ? " ok" : ""}`}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M3 7.5 12 13l9-5.5" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
          <b>{progresAffiche.fait} / {progresAffiche.total}</b> e-mails envoyés
          {progresAffiche.enCours && <i className="asst-spin" aria-hidden />}
          {progresAffiche.echecs > 0 && <span className="rouge">· {progresAffiche.echecs} en échec</span>}
          {progresAffiche.message && <span className="rouge">· {progresAffiche.message}</span>}
          {progresAffiche.enCours && (
            <span className="salve-attente">L&apos;envoi tourne sur le serveur : vous pouvez fermer l&apos;assistant, la pastille en bas de l&apos;écran le suit.</span>
          )}
          <div className="salve-barre"><i style={{ width: `${progresAffiche.total > 0 ? Math.round((progresAffiche.fait / progresAffiche.total) * 100) : 0}%` }} /></div>
          {!progresAffiche.enCours && progresAffiche.fait < progresAffiche.total && etape !== "E-mails" && (
            <button type="button" className="fadd" onClick={() => setEtape("E-mails")}>Reprendre l&apos;envoi</button>
          )}
        </div>
      )}
      <div className="asst-steps">
        {ETAPES.map((e, i) => (
          <button
            key={e} type="button"
            className={`${etape === e ? "on" : ""}${ETAPES.indexOf(etape) > i ? " ok" : ""}`}
            disabled={(e === "E-mails" && !commId && !acheteursValides) || (e === "SMS" && !commId)}
            onClick={() => setEtape(e)}
          ><i>{i + 1}</i> {e === "SMS" ? "RCS" : e}</button>
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
            <select className="min" value={dossier} onChange={(e) => {
              const v = e.target.value;
              setDossier(v);
              /* Les chiffres du texte suivent le dossier joint (MAV, 03/11) :
                 changer de dossier refait l'objet, le message et le SMS. */
              const d = dossiers.find((x) => S(x._id) === v);
              const bm = construireBienMail(d);
              setObjet(objetCommercialisation(bm));
              setMessage(messageCommercialisation(bm, lien));
              setSms(smsParDefaut(b, lien, d));
            }}>
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
          {doc && <PieceJointe d={doc} nom={piecesJointes[0]?.nom} onPoids={setPoidsDossier} />}

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
            onChange={(e) => {
              const v = e.target.value;
              setLien(v);
              /* Retour #594 — « quand je modifie un titre ou un message, c'est
                 bien la version modifiée qui s'envoie ». Coller le lien
                 régénérait tout le message et effaçait les retouches : on ne
                 remplace plus que le lien, à sa place. */
              setMessage((m) => avecLienDossier(m, lien, v));
              /* Le SMS suit le lien tant qu'il n'a pas été retouché à la main. */
              if (sms === smsParDefaut(b, lien, docChoisi)) setSms(smsParDefaut(b, v, docChoisi));
            }} />
          {/* MAV (28/09) : « que tu puisses me dire attention tu fais un envoi
              d'un lien périmé, et me proposer de changer le lien ». */}
          {lienDossierChoisi && lien.trim() === lienDossierChoisi.url && lienDossierChoisi.perime && (
            <div className="dif-simu">
              <b>Attention, ce lien est périmé</b> — il a expiré le {dateLien(lienDossierChoisi.expireLe)}. Les destinataires
              tomberaient sur une page vide. Créez un nouvel envoi sur transfer.it et collez le nouveau lien ci-dessus :
              il remplacera l&apos;ancien sur le dossier, valable {89} jours.
            </div>
          )}
          {lienDossierChoisi && lien.trim() === lienDossierChoisi.url && !lienDossierChoisi.perime && lienDossierChoisi.bientot && (
            <div className="dif-simu">
              <b>Ce lien expire le {dateLien(lienDossierChoisi.expireLe)}</b> (dans {lienDossierChoisi.joursRestants} j, sous la réserve
              de cinq jours) : à remplacer avant d&apos;envoyer.
            </div>
          )}
          {!lien.trim() && (
            <div className="dif-simu">
              <b>Le lien transfer.it est obligatoire</b> — les e-mails et les SMS ne partent pas sans lui.
              Déposez le dossier, les photos et les plans sur transfer.it et collez le lien ici.
            </div>
          )}
          {lien.trim() && lien.trim() !== lienDossierChoisi?.url && dossier && (
            <div className="asst-note">
              Ce lien sera enregistré sur le dossier choisi, valable {89} jours ; les relances l&apos;utiliseront.
            </div>
          )}
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
          <EcartsMandat ecarts={ecartsMandat} mandat={mandatChoisi} dossier={docChoisi} />
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
            Rien n&apos;est créé à cette étape. C&apos;est au départ des e-mails (ou à leur programmation)
            qu&apos;une proposition est créée pour chaque acquéreur ciblé, et que l&apos;immeuble est marqué
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
              className="kgo" type="button" disabled={cibles.length === 0}
              onClick={() => { setAcheteursValides(true); setEtape("E-mails"); }}
            ><span className="ch">›</span> Continuer vers les e-mails</button>
          </div>
        </div>
      )}

      {etape === "E-mails" && (
        <div className="asst-b">
          {commId
            ? <div className="asst-ok">✓ {creees} propositions créées.</div>
            : (
              <div className="asst-note">
                {cibles.length > 1
                  ? <>Rien n&apos;est encore créé : les {cibles.length} propositions le seront au moment où les e-mails partent (ou sont programmés).</>
                  : <>Rien n&apos;est encore créé : la proposition le sera au moment où l&apos;e-mail part (ou est programmé).</>}
              </div>
            )}

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
          {quandMail && pont?.configure && !smsEnvoyes && !(rcsProg && (rcsProg.etat === "attente" || rcsProg.etat === "envoi")) && (
            <label className="asst-rcs-avec">
              <input type="checkbox" checked={rcsAvecMails} disabled={dest.telephones.length === 0}
                onChange={(e) => setRcsAvecMails(e.target.checked)} />
              <span>
                Programmer aussi <b>{dest.telephones.length > 1 ? `les ${dest.telephones.length} RCS` : "le RCS"}</b> à la même date et même heure
                {dest.telephones.length === 0 && " — aucun numéro exploitable"}
              </span>
            </label>
          )}
          {quandMail && rcsAvecMails && (() => {
            const d = new Date(quandMail);
            const hors = Number.isFinite(d.getTime()) ? horsCreneauLegal(d) : null;
            return (
              <>
                {hors && <div className="dif-simu">Cette heure tombe {hors} : les RCS ne partent que du lundi au samedi, de 8 h à 22 h, hors jours fériés.</div>}
                {!carteRcs && !erreurRcs && <div className="asst-note">Préparation de la carte RCS…</div>}
                {erreurRcs && <div className="dif-simu">{erreurRcs}</div>}
                {carteRcs && !carteRcs.photo && <div className="dif-simu">Le bien n&apos;a pas de photo principale : la carte RCS en exige une.</div>}
                {carteRcs?.photo && !hors && (
                  <div className="asst-note">Voici la carte qui partira seule à l&apos;heure dite. Elle s&apos;annule depuis l&apos;étape RCS tant qu&apos;elle n&apos;est pas partie.</div>
                )}
                {editeurRcs}
              </>
            );
          })()}
          {envoi && /^Les RCS n'ont pas/.test(envoi) && <div className="dif-simu">{envoi}</div>}
          {rcsProg?.etat === "attente" && (
            <div className="asst-ok">{`RCS programmés pour le ${new Date(rcsProg.quand).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}.`}</div>
          )}
          {envoiMail && <div className="asst-ok">{envoiMail}</div>}

          {/* Retour #594 — « assure-toi bien que quand je modifie un titre ou un
              message, c'est bien la version que j'ai modifiée qui s'envoie ».
              L'objet et le message sont ici, au-dessus du bouton : ce qui est
              dans ces deux cases est exactement ce qui part. */}
          <div className="asst-part">
            <span className="mlab">Ce qui part, mot pour mot</span>
            <input className="min" aria-label="Objet de l'e-mail" value={objet} onChange={(e) => setObjet(e.target.value)} />
            <textarea className="min" aria-label="Message" rows={12} value={message} onChange={(e) => setMessage(e.target.value)} />
            {/* MAV (03/11) : « le PDF je veux vraiment qu'il se mette en PJ et
                qu'il n'y ait pas de doute ». La pièce est montrée ici, juste
                au-dessus du bouton, et s'ouvre d'un clic. */}
            {pdfDossier && doc ? (
              <>
                <PieceJointe d={doc} nom={pdfDossier.nom} onPoids={setPoidsDossier} />
                {piecesJointes.length > 1 && (
                  <div className="asst-part-l ok">Seconde pièce jointe : <b>{piecesJointes[1].nom}</b>.</div>
                )}
              </>
            ) : (
              <div className="asst-part-l ko">
                Aucun PDF de dossier : l&apos;e-mail ne peut pas partir. Choisissez un dossier qui a son PDF (étape Dossier).
              </div>
            )}
            <div className={`asst-part-l${lienAbsent || lienManque ? " ko" : " ok"}`}>
              {lienManque
                ? <>Le lien transfer.it manque (étape Dossier).</>
                : lienAbsent
                  ? <>Le lien transfer.it n&apos;apparaît pas dans le message.{" "}
                    <button type="button" className="fadd" onClick={() => setMessage((m) => insererLienDossier(m, lien))}>Insérer le lien</button></>
                  : <>Lien transfer.it dans le message : <b>{lien.trim()}</b></>}
            </div>
            {docChoisi && mandatChoisi && (ecartsMandat.length > 0
              ? <EcartsMandat ecarts={ecartsMandat} mandat={mandatChoisi} dossier={docChoisi} />
              : <div className="asst-part-l ok">Dossier V{S(docChoisi.version)} et mandat {mandatChoisi.numero ? `n°${S(mandatChoisi.numero)}` : ""} concordants : prix HAI, net vendeur et honoraires.</div>)}
          </div>

          <div className="wnav">
            {/* MAV (03/11) : tant que les e-mails ne sont pas partis, la
                commercialisation s'annule et se supprime. */}
            {commId && (
              <BoutonSupprimerCommercialisation
                c={{ _id: commId, PROPOSITIONs: Array.from({ length: creees }), prop_sent: mailsEnvoyes, mails_envoyes: faits.length, prop_sms_sent: smsEnvoyes }}
                libelle="Annuler et supprimer"
                onFait={() => fermer()}
              />
            )}
            <button
              className="fadd" type="button" disabled={pending || mailsEnvoyes}
              onClick={() => start(async () => {
                const commId = await assurerCommercialisation();
                await markCommercialisationSent(String(b.im._id), commId, "mail");
                setMailsEnvoyes(true);
                setEtape("SMS");
              })}
            >{mailsEnvoyes ? "E-mails marqués envoyés ✓" : "Marquer envoyés à la main"}</button>
            <span className="sp" style={{ flex: 1 }} />
            <button
              className="kgo" type="button"
              disabled={pending || envoiEnCours || mailsEnvoyes || restantes.length === 0 || pesee.depasse || lienManque || lienAbsent || !pdfDossier}
              title={lienManque ? "Indiquez d'abord le lien transfer.it du dossier"
                : lienAbsent ? "Le lien transfer.it doit figurer dans le message"
                : !pdfDossier ? "Le PDF du dossier doit être joint" : undefined}
              onClick={async () => {
                const n = restantes.length;
                const d = quandMail ? new Date(quandMail) : undefined;
                const differe = d && !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
                /* La case RCS ne vaut que pour un envoi programmé. Tout est
                   vérifié AVANT de créer quoi que ce soit. */
                const avecRcs = !!differe && rcsAvecMails && !smsEnvoyes && dest.telephones.length > 0
                  && !(rcsProg && (rcsProg.etat === "attente" || rcsProg.etat === "envoi"));
                if (avecRcs) {
                  const hors = horsCreneauLegal(d!);
                  if (hors) { setEnvoiMail(`Cette heure tombe ${hors} : les RCS ne partent que du lundi au samedi, de 8 h à 22 h, hors jours fériés. Changez l'heure ou décochez la case RCS.`); return; }
                  if (!carteRcs?.photo) { setEnvoiMail("La carte RCS n'est pas prête (photo principale absente ou carte en préparation). Décochez la case RCS ou attendez la carte."); return; }
                  if (refusRepliRcs) { setEnvoiMail(`Rien n'est parti : ${refusRepliRcs}. Corrigez le SMS de repli ou décochez la case RCS.`); return; }
                }
                if (!(await confirmer(
                  <>
                    {differe
                      ? `Programmer cet e-mail pour le ${d!.toLocaleString("fr-FR")}, à ${n} personne${n > 1 ? "s" : ""}${avecRcs ? `, et la carte RCS à ${dest.telephones.length} numéro${dest.telephones.length > 1 ? "s" : ""} à la même heure` : ""} ?`
                      : `Envoyer cet e-mail à ${n} personne${n > 1 ? "s" : ""} ?`}
                    {!commId && <><br /><br />{`Les ${cibles.length} propositions sont créées à ce moment-là.`}</>}
                    <br /><br />
                    {pesee.message}
                    <br />
                    {ecartsMandat.length > 0 && (
                      <><b style={{ color: "var(--red)" }}>Le dossier diffère du mandat : {ecartsMandat.map((e) => `${e.quoi.toLowerCase()} ${e.dossier} au dossier, ${e.mandat} au mandat`).join(" ; ")}.</b><br /></>
                    )}
                    {lienDossierChoisi && lien.trim() === lienDossierChoisi.url && lienDossierChoisi.perime && (
                      <><b style={{ color: "var(--red)" }}>Attention : le lien transfer.it du message est périmé (expiré le {dateLien(lienDossierChoisi.expireLe)}).</b><br /></>
                    )}
                    {differe
                      ? "Une salve confiée à SendGrid ne s'annule plus depuis ici."
                      : "Un e-mail parti ne se rattrape pas."}
                  </>,
                  { oui: differe ? "Programmer" : "Envoyer" },
                ))) return;
                start(async () => {
                  let id: string;
                  try {
                    id = await assurerCommercialisation();
                  } catch (e) {
                    setEnvoiMail(e instanceof Error ? e.message : "La commercialisation n'a pas pu être créée.");
                    return;
                  }
                  if (avecRcs) {
                    const r = await programmerRcsCommercialisation({
                      immeubleId: String(b.im._id), commId: id, dossierId: dossier || undefined, lien,
                      numeros: dest.telephones, quand: d!.toISOString(), ...textesRcs,
                    });
                    if (r.ok) setRcsProg({ etat: "attente", quand: r.quand, numeros: r.numeros });
                    else setEnvoi(`Les RCS n'ont pas été programmés : ${r.message}`);
                  }
                  void envoyerParLots(id, restantes, differe ? d!.toISOString() : undefined);
                });
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
          {/* MAV (03/11) : « dans la commercialisation c'est des SMS et pas des
              RCS […] et que ça m'affiche la façon dont ça va les afficher au
              client ». La carte part signée par l'agent du bien, avec les
              chiffres du dossier joint et le lien transfer.it de l'étape
              Dossier ; un téléphone sans RCS reçoit le SMS de repli. */}
          <span className="mlab">Ce que reçoit chaque acquéreur</span>
          {!carteRcs && !erreurRcs && <div className="asst-note">Préparation de la carte…</div>}
          {erreurRcs && <div className="dif-simu">{erreurRcs}</div>}
          {carteRcs && (smsEnvoyes || rcsProg?.etat === "attente" || rcsProg?.etat === "envoi"
            ? <TelephoneRcs carte={carteRcs} />
            : editeurRcs)}
          {carteRcs && !carteRcs.lienDossier && (
            <div className="dif-simu">
              {carteRcs.lienPerime
                ? "Le lien transfer.it est périmé (ou expire sous cinq jours) : la carte partirait sans le bouton « Télécharger le dossier »."
                : "Aucun lien transfer.it : la carte partirait sans le bouton « Télécharger le dossier »."}
            </div>
          )}

          <span className="mlab">Numéros ({dest.telephones.length})</span>
          {dest.telephones.length === 0
            ? <div className="fempty">Aucun numéro exploitable parmi les acquéreurs ciblés.</div>
            : <textarea className="min mono" rows={3} readOnly value={dest.telephones.map(telAffiche).join(", ")} />}
          <div className="asst-note">
            Numéros vérifiés et dédoublonnés. Les numéros déjà désinscrits (STOP) chez MailingVox sont
            retirés au moment de l&apos;envoi. Les boutons touchés reviennent sur la proposition de
            chacun : « Pas intéressé » la refuse et coupe ses relances.
          </div>

          {pont && !pont.configure && (
            <div className="dif-simu"><b>Envoi automatique indisponible</b> {pont.message}</div>
          )}
          {pont?.configure && (
            <div className="asst-essai">
              <span className="mlab">Essai sur un numéro</span>
              <div className="asst-essai-l">
                <input className="min" type="tel" value={numEssai} placeholder="06 12 34 56 78"
                  onChange={(e) => setNumEssai(e.target.value)} />
                <button className="fadd" type="button"
                  disabled={pending || !telE164(numEssai) || !carteRcs?.photo}
                  onClick={() => start(async () => {
                    setEssai(null);
                    const r = await envoyerRcsEssaiCommercialisation({
                      immeubleId: String(b.im._id), dossierId: dossier || undefined, lien, numero: numEssai, ...textesRcs,
                    });
                    setEssai(r.ok
                      ? `Essai parti vers ${telAffiche(telE164(numEssai) ?? numEssai)}${r.campagne ? ` (campagne MailingVox n°${r.campagne})` : ""}. Ce que vous recevez est ce que recevront les acquéreurs.`
                      : r.message);
                  })}>
                  M&apos;envoyer la carte
                </button>
              </div>
              <div className="asst-note">
                La carte telle quelle, sur ce seul numéro, tout de suite. Rien n&apos;est marqué sur la
                commercialisation : l&apos;essai ne compte pas comme un envoi.
              </div>
              {essai && <div className={/^Essai parti/.test(essai) ? "asst-ok" : "dif-simu"}>{essai}</div>}
            </div>
          )}
          {pont?.configure && !smsEnvoyes && !(rcsProg && (rcsProg.etat === "attente" || rcsProg.etat === "envoi")) && (
            <>
              <span className="mlab">Envoyer</span>
              <div className="asst-quand">
                <label>
                  <input type="radio" name="quand-rcs" checked={!quandRcs} onChange={() => setQuandRcs("")} />
                  Tout de suite
                </label>
                <label>
                  <input type="radio" name="quand-rcs" checked={!!quandRcs}
                    onChange={() => {
                      /* Par défaut : l'heure choisie pour les e-mails, sinon demain 9 h 30. */
                      if (quandMail) { setQuandRcs(quandMail); return; }
                      const d = new Date();
                      d.setDate(d.getDate() + 1);
                      const p = (n: number) => String(n).padStart(2, "0");
                      setQuandRcs(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:30`);
                    }} />
                  À une date choisie
                </label>
                {quandRcs && (
                  <input className="min" type="datetime-local" value={quandRcs}
                    onChange={(e) => setQuandRcs(e.target.value)} />
                )}
              </div>
              {quandRcs && (
                <div className="asst-note">
                  Du lundi au samedi, de 8 h à 22 h, hors jours fériés. Le BO garde la carte et l&apos;envoie
                  lui-même à l&apos;heure dite, à la minute près ; les numéros passés en STOP d&apos;ici là
                  sont retirés au moment de l&apos;envoi.
                </div>
              )}
            </>
          )}
          {rcsProg && (rcsProg.etat === "attente" || rcsProg.etat === "envoi") && (
            <div className="asst-ok">
              {rcsProg.etat === "envoi"
                ? "Les RCS programmés sont en train de partir."
                : `${rcsProg.numeros} RCS programmé${rcsProg.numeros > 1 ? "s" : ""} pour le ${new Date(rcsProg.quand).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}.`}
              {rcsProg.etat === "attente" && commId && (
                <>
                  {" "}
                  <button className="fadd" type="button" disabled={pending}
                    onClick={() => start(async () => {
                      const r = await annulerRcsProgrammeCommercialisation(commId);
                      if (r.ok) setRcsProg(null);
                      else setEnvoi(r.message);
                    })}>Annuler la programmation</button>
                </>
              )}
            </div>
          )}
          {rcsProg?.etat === "echec" && (
            <div className="dif-simu">L&apos;envoi programmé n&apos;est pas parti : {rcsProg.erreur ?? "raison inconnue"}</div>
          )}
          {rcsProg?.etat === "parti" && !envoi && (
            <div className="asst-ok">{`${rcsProg.numeros} RCS partis comme programmé, le ${new Date(rcsProg.quand).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}.`}</div>
          )}
          {envoi && <div className={/^\d+ RCS/.test(envoi) ? "asst-ok" : "dif-simu"}>{envoi}</div>}
          <div className="wnav">
            <span className="sp" style={{ flex: 1 }} />
            <button
              className="fadd" type="button"
              disabled={pending || smsEnvoyes || rcsProg?.etat === "attente" || rcsProg?.etat === "envoi"}
              onClick={() => commId && start(async () => {
                await markCommercialisationSent(String(b.im._id), commId, "sms");
                setSmsEnvoyes(true);
              })}
            >{smsEnvoyes ? "Marqués envoyés ✓" : "Marquer comme envoyés"}</button>
            {pont?.configure && (
              <button className="kgo" type="button"
                disabled={pending || smsEnvoyes || dest.telephones.length === 0 || lienManque || !carteRcs?.photo
                  || rcsProg?.etat === "attente" || rcsProg?.etat === "envoi"}
                title={lienManque ? "Indiquez d'abord le lien transfer.it du dossier (étape Dossier)"
                  : !carteRcs?.photo ? "Le bien n'a pas de photo principale" : undefined}
                onClick={envoyerLesRcs}>
                <span className="ch">›</span>{" "}
                {quandRcs ? "Programmer" : "Envoyer"} {dest.telephones.length > 1 ? `les ${dest.telephones.length} RCS` : "le RCS"}
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
function PieceJointe({ d, nom, onPoids }: { d: Record<string, unknown>; nom?: string; onPoids?: (o: number | null) => void }) {
  /* MAV (03/11) : « j'ai essayé de cliquer dessus, ça ne marchait pas ». Le PDF
     d'un dossier du BO s'écrit « storage:… » : le lien pointait sur cette
     adresse brute, que le navigateur ne sait pas ouvrir (et le poids restait
     « non communiqué »). Il passe par le relais du BO, comme partout. */
  const url = lienPdfBo(urlPdfDossier(d), nom);
  const [poids, setPoids] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!url) return;
    let vivant = true;
    /* Le relais ne donne pas toujours la taille dans l'en-tête : on lit alors
       le fichier lui-même, une fois — c'est aussi la preuve qu'il s'ouvre. */
    fetch(url, { method: "HEAD" })
      .then(async (r) => {
        const l = Number(r.headers.get("content-length"));
        let v: number | null = Number.isFinite(l) && l > 0 ? l : null;
        if (v === null && r.ok) {
          const g = await fetch(url).catch(() => null);
          if (g?.ok) v = (await g.blob()).size || null;
        }
        if (vivant) { setPoids(v); onPoids?.(v); }
      })
      .catch(() => { if (vivant) { setPoids(null); onPoids?.(null); } });
    return () => { vivant = false; };
  }, [url, onPoids]);

  if (!url) {
    return <div className="asst-note">Ce dossier n&apos;a pas de PDF rattaché : l&apos;e-mail partira sans pièce jointe.</div>;
  }
  const abs = url;
  const mo = typeof poids === "number" ? poids / 1_048_576 : undefined;
  return (
    <a className={`asst-pj${mo !== undefined && mo > 3 ? " lourd" : ""}`} href={abs} target="_blank" rel="noreferrer">
      <span className="asst-pj-i" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></svg>
      </span>
      <span className="asst-pj-t">
        <b>{nom ?? libelleDossier(d)} — jointe à chaque e-mail · ouvrir</b>
        {/* Trois états, pas deux : « en cours », « connu », et « refusé ». Le
            serveur qui héberge le PDF peut très bien répondre sans autoriser
            la lecture de l'en-tête depuis le navigateur — laisser « en cours
            de lecture » pour toujours serait le pire des trois. */}
        {poids === undefined ? "Lecture du poids…"
          : poids === null ? "Poids non communiqué par l'hébergeur — ouvrez la pièce pour le vérifier."
          : mo! > 3 ? `${mo!.toFixed(1).replace(".", ",")} Mo — au-delà de 3 Mo, la délivrabilité chute.`
          : `${mo!.toFixed(1).replace(".", ",")} Mo`}
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
/** Ce qui diffère entre le dossier envoyé et le mandat (MAV, 03/11). */
function EcartsMandat({ ecarts, mandat, dossier }: {
  ecarts: EcartMandat[];
  mandat?: Record<string, unknown>;
  dossier?: Record<string, unknown>;
}) {
  if (!mandat || !dossier || ecarts.length === 0) return null;
  return (
    <div className="dif-simu">
      <b>Le dossier V{S(dossier.version)} diffère du mandat {mandat.numero ? `n°${S(mandat.numero)}` : ""}</b>
      <ul className="asst-ecarts">
        {ecarts.map((e) => <li key={e.quoi}>{e.quoi} : <b>{e.dossier}</b> au dossier, <b>{e.mandat}</b> au mandat</li>)}
      </ul>
      Le client lira les chiffres du dossier. Refaites le dossier, ou corrigez le mandat, avant d&apos;envoyer.
    </div>
  );
}

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


function smsParDefaut(b: BienData, lien: string, dossier?: Record<string, unknown>) {
  /* Texte validé par MAV le 28/09 (`smsEnvoiDossier`) : « France Immeuble »
     EN TÊTE — l'expéditeur est un numéro court, c'est le début du texte qui
     dit qui écrit, et c'est ce que l'aperçu de la liste de conversations
     affiche —, le résumé du bien, le lien transfer.it, Oui / Non, STOP. Le
     numéro STOP est celui que MailingVox route (`MAILINGVOX_STOP`) ; l'écran
     signale la divergence si ce littéral s'en écarte. */
  return smsEnvoiDossier(resumeDepuisDoc(b.im, { sms: true, dossier }), lien);
}
