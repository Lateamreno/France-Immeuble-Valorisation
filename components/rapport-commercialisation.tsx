"use client";

/* Le rapport de commercialisation, dans le Suivi de la vente (MAV, 19/11/26).
 *
 * Trois temps, dans une seule fenêtre :
 *   1. le CONTRÔLE — « as-tu bien noté tous les retours, toutes les visites ? »,
 *      avec ce que le BO a trouvé de douteux ;
 *   2. la RÉDACTION — le BO a tout rempli, l'IA propose l'analyse, l'agent
 *      corrige, retire des lignes et écrit son texte ;
 *   3. l'APERÇU — l'e-mail tel qu'il arrivera, sur téléphone et sur ordinateur,
 *      et le PDF joint. Rien ne part avant le clic sur « Envoyer ».
 *
 * Le calcul est dans lib/bo/rapport-commercialisation.ts, la mise en forme
 * dans lib/bo/rapport-html.ts : l'aperçu appelle les mêmes fonctions que
 * l'envoi, ce qu'on voit ici est ce qui part.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { Modale } from "@/components/modale";
import type { Controle } from "@/lib/bo/rapport-commercialisation";
import { htmlMail, type ContenuRapport, type Piste, type PointRetour } from "@/lib/bo/rapport-html";
import {
  envoyerRapport, listerRapports, pdfRapport, pdfRapportEnvoye, preparerRapport, proposerAnalyseRapport,
  type RapportEnvoye,
} from "@/lib/bo/rapport-actions";
import type { RapportPrepare } from "@/lib/bo/rapport-serveur";

type Pret = Extract<RapportPrepare, { ok: true }>;

const jourHeure = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

/* Les listes se corrigent comme du texte : une ligne par point. */
const pointsEnTexte = (l: PointRetour[]) => l.map((p) => (p.combien ? `${p.point} · ${p.combien}` : p.point)).join("\n");
const texteEnPoints = (t: string): PointRetour[] => t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
  const i = l.lastIndexOf(" · ");
  return i > 0 ? { point: l.slice(0, i).trim(), combien: l.slice(i + 3).trim() } : { point: l };
});
const reperesEnTexte = (l: { libelle: string; montant: number }[]) => l.map((r) => `${r.libelle} : ${r.montant}`).join("\n");
const texteEnReperes = (t: string) => t.split("\n").map((l) => {
  const i = l.lastIndexOf(":");
  if (i < 1) return null;
  const montant = Number(l.slice(i + 1).replace(/[^\d]/g, ""));
  return montant > 0 ? { libelle: l.slice(0, i).trim(), montant } : null;
}).filter((x): x is { libelle: string; montant: number } => !!x);

/** Ouvre un PDF reçu du serveur dans un nouvel onglet. */
function ouvrirPdf(base64: string, nom: string) {
  const octets = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([octets], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener"; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ------------------------------------------------- La section du suivi */

export function SectionRapport({ immeubleId }: { immeubleId: string }) {
  const [liste, setListe] = useState<RapportEnvoye[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [tour, setTour] = useState(0);
  const [pdfEnCours, setPdfEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    listerRapports(immeubleId).then((l) => { if (vivant) setListe(l); }).catch(() => { if (vivant) setListe([]); });
    return () => { vivant = false; };
  }, [immeubleId, tour]);

  const voirPdf = (id: string) => {
    setPdfEnCours(id); setErreur(null);
    pdfRapportEnvoye(id)
      .then((r) => { if (r.ok) ouvrirPdf(r.base64, r.nom); else setErreur(r.message); })
      .catch(() => setErreur("Le BO n'a pas répondu."))
      .finally(() => setPdfEnCours(null));
  };

  const dernier = liste?.[0];
  return (
    <section>
      <div className="sv2-eh">
        <h3 className="fsub">Rapport de commercialisation</h3>
        <span className="sp" style={{ flex: 1 }} />
        <button type="button" className="vf-go sv2-ecrire" onClick={() => setOuvert(true)}>
          <span className="ch">›</span> Rédiger un rapport
        </button>
      </div>
      <p className="mhint">
        Le point envoyé au propriétaire : ce qui a été fait, les retours, les visites, et ce qu&apos;on en conclut.
        {liste && (dernier
          ? <> Dernier rapport envoyé le <b>{jourHeure(dernier.envoyeLe)}</b>.</>
          : <> Aucun rapport n&apos;a encore été envoyé pour ce bien.</>)}
      </p>
      {erreur && <span className="dif-avis">{erreur}</span>}
      {liste && liste.length > 0 && (
        <ul className="rpc-envoyes">
          {liste.map((r) => (
            <li key={r.id}>
              <b>{jourHeure(r.envoyeLe)}</b>
              <span>{r.objet}</span>
              <i>{[r.agentNom, r.destinataires.join(", ")].filter(Boolean).join(" → ")}</i>
              <button type="button" className="fadd" disabled={pdfEnCours === r.id} onClick={() => voirPdf(r.id)}>
                {pdfEnCours === r.id ? "PDF…" : "Voir le PDF"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {ouvert && (
        <FenetreRapport immeubleId={immeubleId}
          onFermer={(envoye) => { setOuvert(false); if (envoye) setTour((t) => t + 1); }} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------ La fenêtre */

const OU_COMPLETER: Record<NonNullable<Controle["geste"]>, string> = {
  offre: "À saisir dans l'onglet Offres du bien.",
  reponses: "À traiter depuis la cloche « Réponses », en haut du menu.",
  visite: "À compléter dans l'onglet Visites du bien.",
  suite: "À noter sur la proposition, dans l'onglet Propositions du bien.",
};

type Etape = "controle" | "redaction" | "apercu";
/** Les blocs que l'IA peut rédiger, chacun avec sa case « relu ». */
type Bloc = "retient" | "plait" | "bloque" | "reperes" | "piste0" | "piste1" | "piste2" | "suite";
const NOM_BLOC: Record<Bloc, string> = {
  retient: "ce qu'on retient", plait: "ce qui plaît", bloque: "ce qui bloque", reperes: "les prix cités",
  piste0: "la piste 1", piste1: "la piste 2", piste2: "la piste 3", suite: "la suite",
};

function FenetreRapport({ immeubleId, onFermer }: { immeubleId: string; onFermer: (envoye: boolean) => void }) {
  const [p, setP] = useState<Pret | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etape, setEtape] = useState<Etape>("controle");
  const [c, setC] = useState<ContenuRapport | null>(null);
  /* Les lignes que l'agent retire du rapport : une note qui n'est pas pour le
     propriétaire, un retour sans intérêt. */
  const [sansRetours, setSansRetours] = useState<Set<number>>(new Set());
  const [sansVisites, setSansVisites] = useState<Set<number>>(new Set());
  const [avecBaro, setAvecBaro] = useState(true);
  /* Retour #625 : ces trois listes se saisissent comme du texte, et ne se
     découpent qu'au moment de partir. Les redécouper à chaque frappe retirait
     l'espace qu'on venait de taper. */
  const [plaitTxt, setPlaitTxt] = useState("");
  const [bloqueTxt, setBloqueTxt] = useState("");
  const [reperesTxt, setReperesTxt] = useState("");
  const [pistes, setPistes] = useState<Piste[]>(() => [0, 1, 2].map(() => ({ titre: "", texte: "", implique: "" })));
  /* MAV, 19/11 : « des cases à cocher pour tout ce qui est généré, pour pas
     envoyer un truc qu'on a pas lu ». Ce que l'IA rédige arrive DÉCOCHÉ : un
     bloc ne part que si l'agent le coche. */
  const [ecartes, setEcartes] = useState<Set<Bloc>>(new Set());
  const [dest, setDest] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [analyse, setAnalyse] = useState<string | null>(null);
  const [largeur, setLargeur] = useState<375 | 640>(375);
  const [pending, start] = useTransition();
  const [pendingIa, startIa] = useTransition();
  const [pendingPdf, startPdf] = useTransition();

  useEffect(() => {
    let vivant = true;
    preparerRapport(immeubleId).then((r) => {
      if (!vivant) return;
      if (!r.ok) { setErreur(r.message); return; }
      setP(r); setC(r.contenu); setDest(new Set(r.destinataires.map((d) => d.email)));
    }).catch(() => { if (vivant) setErreur("Le BO n'a pas répondu."); });
    return () => { vivant = false; };
  }, [immeubleId]);

  const set = <K extends keyof ContenuRapport>(k: K, v: ContenuRapport[K]) => setC((x) => (x ? { ...x, [k]: v } : x));

  /* Ce qui part vraiment : le contenu, moins les lignes retirées. */
  const final = useMemo<ContenuRapport | null>(() => (c ? {
    ...c,
    retient: ecartes.has("retient") ? "" : c.retient,
    plait: ecartes.has("plait") ? [] : texteEnPoints(plaitTxt),
    bloque: ecartes.has("bloque") ? [] : texteEnPoints(bloqueTxt),
    pistes: pistes.filter((x, i) => !ecartes.has(`piste${i}` as Bloc) && (x.titre.trim() || x.texte.trim())),
    suite: ecartes.has("suite") ? "" : c.suite,
    retours: c.retours.filter((_, i) => !sansRetours.has(i)),
    visites: c.visites.filter((_, i) => !sansVisites.has(i)),
    barometre: avecBaro && c.barometre
      ? { ...c.barometre, reperes: ecartes.has("reperes") ? [] : texteEnReperes(reperesTxt) } : undefined,
  } : null), [c, sansRetours, sansVisites, avecBaro, plaitTxt, bloqueTxt, reperesTxt, pistes, ecartes]);
  /* Les blocs décochés qui contiennent pourtant quelque chose : à signaler. */
  const nonRelus = c ? ([...ecartes] as Bloc[]).filter((k) =>
    k === "retient" ? c.retient.trim() : k === "suite" ? c.suite.trim()
      : k === "plait" ? plaitTxt.trim() : k === "bloque" ? bloqueTxt.trim() : k === "reperes" ? reperesTxt.trim()
        : pistes[Number(k.slice(5))]?.titre.trim() || pistes[Number(k.slice(5))]?.texte.trim()) : [];
  const cocher = (k: Bloc, oui: boolean) => setEcartes((e) => {
    const n = new Set(e); if (oui) n.delete(k); else n.add(k); return n;
  });
  const apercu = useMemo(() => (final ? htmlMail(final) : ""), [final]);

  const proposer = () => startIa(async () => {
    setAnalyse(null);
    const r = await proposerAnalyseRapport(immeubleId).catch(() => ({ ok: false as const, message: "Le BO n'a pas répondu." }));
    if (!r.ok) { setAnalyse(r.message); return; }
    const a = r.analyse;
    setC((x) => (x ? { ...x, retient: a.retient || x.retient, suite: a.suite || x.suite } : x));
    setPlaitTxt(pointsEnTexte(a.plait));
    setBloqueTxt(pointsEnTexte(a.bloque));
    setReperesTxt(reperesEnTexte(a.reperes));
    setPistes([0, 1, 2].map((i) => ({ titre: a.pistes[i]?.titre ?? "", texte: a.pistes[i]?.texte ?? "", implique: a.pistes[i]?.implique ?? "" })));
    /* Tout ce que l'IA vient d'écrire est décoché : il ne part que relu. */
    setEcartes(new Set<Bloc>([
      ...(a.retient ? ["retient" as const] : []), ...(a.plait.length ? ["plait" as const] : []),
      ...(a.bloque.length ? ["bloque" as const] : []), ...(a.reperes.length ? ["reperes" as const] : []),
      ...a.pistes.slice(0, 3).map((_, i) => `piste${i}` as Bloc), ...(a.suite ? ["suite" as const] : []),
    ]));
    setAnalyse("Analyse proposée, et décochée : relisez chaque bloc, corrigez-le, puis cochez-le pour qu'il parte.");
  });

  const voirPdf = () => startPdf(async () => {
    if (!final) return;
    setMsg(null);
    const r = await pdfRapport(final).catch(() => ({ ok: false as const, message: "Le BO n'a pas répondu." }));
    if (r.ok) ouvrirPdf(r.base64, r.nom); else setMsg({ ok: false, texte: r.message });
  });

  const envoyer = () => start(async () => {
    if (!final) return;
    setMsg(null);
    const r = await envoyerRapport(immeubleId, final, [...dest]).catch(() => ({ ok: false, message: "Le BO n'a pas répondu." }));
    setMsg({ ok: r.ok, texte: r.message });
    if (r.ok) setTimeout(() => onFermer(true), 1800);
  });

  const alertes = p?.rapport.controles.filter((x) => x.niveau === "alerte").length ?? 0;
  const setPiste = (i: number, k: keyof Piste, v: string) =>
    setPistes((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  /* L'intitulé d'un bloc, avec sa case : cochée, il part ; décochée, il reste ici. */
  const tete = (k: Bloc, titre: string, aide?: string) => (
    <span className="sv2-lbl rpc-tete">
      <label className="rpc-lu">
        <input type="checkbox" checked={!ecartes.has(k)} onChange={(e) => cocher(k, e.target.checked)} />
        {titre}
      </label>
      {aide && <i>{aide}</i>}
      {ecartes.has(k) && <em>décoché : ne partira pas</em>}
    </span>
  );

  const pied = (
    <>
      <button type="button" className="vf-annuler" onClick={() => onFermer(false)}>
        {etape === "controle" ? "Je complète d'abord" : "Fermer"}
      </button>
      <span style={{ flex: 1 }} />
      {msg && <span className={msg.ok ? "mhint" : "dif-avis"}>{msg.texte}</span>}
      {etape === "controle" && (
        <button type="button" className="vf-go" disabled={!c} onClick={() => setEtape("redaction")}>
          <span className="ch">›</span> {alertes ? "Rédiger quand même" : "Tout est à jour, rédiger"}
        </button>
      )}
      {etape === "redaction" && (
        <button type="button" className="vf-go" disabled={!c} onClick={() => setEtape("apercu")}>
          <span className="ch">›</span> Voir l&apos;aperçu
        </button>
      )}
      {etape === "apercu" && (
        <>
          <button type="button" className="fadd" disabled={pendingPdf || !final} onClick={voirPdf}>
            {pendingPdf ? "PDF en cours…" : "Voir le PDF joint"}
          </button>
          <button type="button" className="vf-go" disabled={pending || dest.size === 0 || !final?.objet.trim()} onClick={envoyer}>
            <span className="ch">›</span> {pending ? "Envoi…" : `Envoyer${dest.size > 1 ? ` aux ${dest.size} propriétaires` : " au propriétaire"}`}
          </button>
        </>
      )}
    </>
  );

  return (
    <Modale titre="Rapport de commercialisation" largeur={940} onFermer={() => onFermer(false)} fermeDehors={false} pied={pied}>
      <div className="rpc">
        <div className="seg rpc-etapes">
          {([["controle", "1 · Contrôle"], ["redaction", "2 · Rédaction"], ["apercu", "3 · Aperçu et envoi"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={etape === k ? "on" : undefined} disabled={!c} onClick={() => setEtape(k)}>{l}</button>
          ))}
        </div>
        {erreur && <span className="dif-avis">{erreur}</span>}
        {!p && !erreur && <div className="fempty">Lecture de la commercialisation…</div>}

        {p && c && etape === "controle" && (
          <div className="rpc-controle">
            <p className="mhint">
              Avant de rédiger : le rapport ne dit que ce qui est noté dans le BO. Voici ce qui semble manquer.
              {p.rapport.nouveau && <> Depuis le dernier rapport ({jourHeure(p.rapport.nouveau.depuis)}) : {p.rapport.nouveau.contactes} nouveaux acquéreurs contactés, {p.rapport.nouveau.reponses} réponses, {p.rapport.nouveau.visites} visites, {p.rapport.nouveau.offres} offres.</>}
            </p>
            {p.rapport.controles.map((x, i) => (
              <div key={i} className={`rpc-ligne ${x.niveau}`}>
                <span className="rpc-p" aria-hidden>{x.niveau === "alerte" ? "!" : "✓"}</span>
                <div>
                  <b>{x.titre}</b>
                  {x.detail && <span>{x.detail}</span>}
                  {x.niveau === "alerte" && x.geste && <i>{OU_COMPLETER[x.geste]}</i>}
                </div>
              </div>
            ))}
            <div className="rpc-chiffres">
              {c.chiffresDetail.map((x) => <div key={x.libelle}><b>{x.valeur}</b><span>{x.libelle}</span></div>)}
            </div>
          </div>
        )}

        {p && c && etape === "redaction" && (
          <div className="rpc-redac">
            <div className="rpc-bloc">
              <span className="sv2-lbl">Destinataires</span>
              {p.destinataires.length === 0 && <span className="dif-avis">Aucun propriétaire de ce bien n&apos;a d&apos;adresse e-mail : à renseigner sur sa fiche.</span>}
              {p.destinataires.map((d) => (
                <label key={d.email} className="rpc-case">
                  <input type="checkbox" checked={dest.has(d.email)} onChange={(e) => {
                    const n = new Set(dest); if (e.target.checked) n.add(d.email); else n.delete(d.email); setDest(n);
                  }} />
                  <span>{d.nom}</span><i>{d.email}</i>
                </label>
              ))}
            </div>

            <label className="sv2-champ"><span className="sv2-lbl">Objet</span>
              <input className="min" value={c.objet} onChange={(e) => set("objet", e.target.value)} /></label>

            <h4 className="rpc-t">L&apos;e-mail</h4>
            <div className="rpc-deux">
              <label className="sv2-champ"><span className="sv2-lbl">Formule d&apos;appel</span>
                <input className="min" value={c.salutation} onChange={(e) => set("salutation", e.target.value)} /></label>
              <label className="sv2-champ"><span className="sv2-lbl">Introduction</span>
                <input className="min" value={c.intro} onChange={(e) => set("intro", e.target.value)} /></label>
            </div>
            <label className="sv2-champ"><span className="sv2-lbl">Ce qui a été fait</span>
              <textarea className="min rpc-ta" rows={2} value={c.fait} onChange={(e) => set("fait", e.target.value)} /></label>

            <div className="rpc-ia">
              <button type="button" className="fadd" disabled={pendingIa || !p.iaDisponible || p.matiere.length === 0} onClick={proposer}>
                {pendingIa ? "Analyse en cours…" : "Proposer l'analyse"}
              </button>
              <span className="mhint">
                {!p.iaDisponible ? "L'analyse automatique n'est pas configurée : les champs ci-dessous se remplissent à la main."
                  : p.matiere.length === 0 ? "Aucun retour motivé à analyser pour l'instant."
                    : analyse ?? `Rédige « ce qu'on retient », ce qui plaît, ce qui bloque et des pistes, à partir des ${p.matiere.length} retours notés, sans aucun nom. Vous corrigez ensuite.`}
              </span>
            </div>
            <div className={`sv2-champ${ecartes.has("retient") ? " rpc-off" : ""}`}>{tete("retient", "Ce qu'on retient")}
              <textarea className="min rpc-ta" rows={3} aria-label="Ce qu'on retient" value={c.retient} onChange={(e) => set("retient", e.target.value)} /></div>
            <label className="sv2-champ"><span className="sv2-lbl">Votre texte libre</span>
              <textarea className="min rpc-ta" rows={5} value={c.libre} placeholder="Votre analyse, ce que vous proposez pour la suite…"
                onChange={(e) => set("libre", e.target.value)} /></label>
            <label className="sv2-champ"><span className="sv2-lbl">Signature</span>
              <textarea className="min rpc-ta" rows={4} value={c.signature} onChange={(e) => set("signature", e.target.value)} /></label>

            <h4 className="rpc-t">Le diagnostic <i>dans le PDF</i></h4>
            <div className="rpc-deux">
              <div className={`sv2-champ${ecartes.has("plait") ? " rpc-off" : ""}`}>{tete("plait", "Ce qui plaît", "un point par ligne")}
                <textarea className="min rpc-ta" rows={4} aria-label="Ce qui plaît" value={plaitTxt} placeholder="Le potentiel de transformation · 2 retours"
                  onChange={(e) => setPlaitTxt(e.target.value)} /></div>
              <div className={`sv2-champ${ecartes.has("bloque") ? " rpc-off" : ""}`}>{tete("bloque", "Ce qui bloque", "un point par ligne")}
                <textarea className="min rpc-ta" rows={4} aria-label="Ce qui bloque" value={bloqueTxt} placeholder="Le volume de travaux · 5 retours"
                  onChange={(e) => setBloqueTxt(e.target.value)} /></div>
            </div>
            {c.barometre && (
              <div className="rpc-bloc">
                <label className="rpc-case">
                  <input type="checkbox" checked={avecBaro} onChange={(e) => setAvecBaro(e.target.checked)} />
                  <span>Montrer le baromètre de prix</span>
                  <i>prix du mandat{c.barometre.offreHaute ? " et offre la plus haute" : ", aucune offre saisie"}</i>
                </label>
                {avecBaro && (
                  <div className="rpc-deux">
                    <div className={`sv2-champ${ecartes.has("reperes") ? " rpc-off" : ""}`}>{tete("reperes", "Autres prix cités", "libellé : montant")}
                      <textarea className="min rpc-ta" rows={2} aria-label="Autres prix cités" value={reperesTxt} placeholder="Refus même à : 645000"
                        onChange={(e) => setReperesTxt(e.target.value)} /></div>
                    <label className="sv2-champ"><span className="sv2-lbl">Ce que ça implique</span>
                      <textarea className="min rpc-ta" rows={2} value={c.barometre.commentaire}
                        onChange={(e) => set("barometre", { ...c.barometre!, commentaire: e.target.value })} /></label>
                  </div>
                )}
              </div>
            )}
            <span className="sv2-lbl">Les pistes pour vendre</span>
            <div className="rpc-pistes">
              {pistes.map((x, i) => (
                <div key={i} className={`rpc-piste${ecartes.has(`piste${i}` as Bloc) ? " rpc-off" : ""}`}>
                  {tete(`piste${i}` as Bloc, `Piste ${i + 1}`)}
                  <input className="min" value={x.titre} placeholder="Titre de la piste" aria-label={`Titre de la piste ${i + 1}`} onChange={(e) => setPiste(i, "titre", e.target.value)} />
                  <textarea className="min rpc-ta" rows={3} value={x.texte} placeholder="Ce qu'on propose" onChange={(e) => setPiste(i, "texte", e.target.value)} />
                  <input className="min" value={x.implique ?? ""} placeholder="Ce que ça implique" onChange={(e) => setPiste(i, "implique", e.target.value)} />
                </div>
              ))}
            </div>
            <div className={`sv2-champ${ecartes.has("suite") ? " rpc-off" : ""}`}>{tete("suite", "La suite", "ce qui reste à faire")}
              <textarea className="min rpc-ta" rows={2} aria-label="La suite" value={c.suite} onChange={(e) => set("suite", e.target.value)} /></div>

            <h4 className="rpc-t">Les retours et les visites <i>décochez ce qui n&apos;est pas pour le propriétaire</i></h4>
            {c.retours.length === 0 && c.visites.length === 0 && <span className="mhint">Aucun retour motivé ni visite à lister.</span>}
            {c.retours.map((r, i) => (
              <div key={`r${i}`} className={`rpc-retour${sansRetours.has(i) ? " off" : ""}`}>
                <input type="checkbox" checked={!sansRetours.has(i)} aria-label="Inclure ce retour" onChange={(e) => {
                  const n = new Set(sansRetours); if (e.target.checked) n.delete(i); else n.add(i); setSansRetours(n);
                }} />
                <span className="rpc-qui"><b>{p.rapport.retours[i]?.nom ?? r.qui}</b>{r.note ? <em>{r.note}</em> : null}
                  <i className="rpc-envoi">dans le rapport : {r.qui}</i></span>
                <textarea className="min rpc-ta" rows={2} value={r.texte}
                  onChange={(e) => set("retours", c.retours.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)))} />
              </div>
            ))}
            {c.visites.map((v, i) => (
              <div key={`v${i}`} className={`rpc-retour${sansVisites.has(i) ? " off" : ""}`}>
                <input type="checkbox" checked={!sansVisites.has(i)} aria-label="Inclure cette visite" onChange={(e) => {
                  const n = new Set(sansVisites); if (e.target.checked) n.delete(i); else n.add(i); setSansVisites(n);
                }} />
                <span className="rpc-qui">Visite du {v.date} · <b>{p.rapport.visites[i]?.nom ?? v.qui}</b>{v.note ? <em>{v.note}</em> : null}
                  <i className="rpc-envoi">dans le rapport : {v.qui}</i>
                  {p.rapport.visites[i]?.aRelire && <i className="rpc-relire">votre note interne : à relire</i>}</span>
                <textarea className="min rpc-ta" rows={2} value={v.texte}
                  onChange={(e) => set("visites", c.visites.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)))} />
              </div>
            ))}
            <label className="sv2-champ"><span className="sv2-lbl">Précision sous les retours</span>
              <input className="min" value={c.retoursNote ?? ""} onChange={(e) => set("retoursNote", e.target.value)} /></label>
            <label className="sv2-champ"><span className="sv2-lbl">Légende des notes A à D</span>
              <textarea className="min rpc-ta" rows={2} value={c.legende} onChange={(e) => set("legende", e.target.value)} /></label>
          </div>
        )}

        {p && c && etape === "apercu" && (
          <div className="rpc-apercu">
            <div className="rpc-apercu-h">
              <span className="mhint">
                L&apos;e-mail tel qu&apos;il arrivera, sans aucune image à charger. À {[...dest].join(", ") || "personne : choisissez un destinataire à l'étape 2"}.
              </span>
              <div className="seg">
                <button type="button" className={largeur === 375 ? "on" : undefined} onClick={() => setLargeur(375)}>Téléphone</button>
                <button type="button" className={largeur === 640 ? "on" : undefined} onClick={() => setLargeur(640)}>Ordinateur</button>
              </div>
            </div>
            {nonRelus.length > 0 && (
              <span className="dif-avis">
                {nonRelus.length > 1 ? `${nonRelus.length} blocs rédigés ne sont pas cochés et ne partiront pas` : "1 bloc rédigé n'est pas coché et ne partira pas"} :
                {" "}{nonRelus.map((k) => NOM_BLOC[k]).join(", ")}.
                {nonRelus.length > 1 ? " Relisez-les à l'étape 2 et cochez ceux que vous gardez." : " Relisez-le à l'étape 2 et cochez-le pour le garder."}
              </span>
            )}
            <div className="rpc-cadre">
              <iframe title="Aperçu de l'e-mail" sandbox="" srcDoc={apercu} style={{ width: largeur }} />
            </div>
            <span className="mhint">
              Le compte rendu complet et le diagnostic partent en PDF joint : « Voir le PDF joint » l&apos;ouvre tel qu&apos;il sera envoyé.
              Le message part de votre boîte, avec sa copie dans vos envoyés. Rien ne part avant « Envoyer ».
            </span>
          </div>
        )}
      </div>
    </Modale>
  );
}
