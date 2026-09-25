"use client";

// Onglet Acheteurs de la fiche bien — réplique du BO :
// « + Rechercher de nouveaux acquéreurs » (3 sources, filtres de grade et
// toggles) → résultats en vues matchées / ajoutées / retirées / ciblées →
// « Commercialiser » qui enchaîne sur l'assistant d'envoi.
import { useEffect, useMemo, useState, useTransition } from "react";
import type { AcheteursData, BienData } from "@/lib/bubble/server";
import {
  carte, comptesParGrade, destinataires, FILTRES_MATCH_DEFAUT, matcher,
  type Acquereur, type CriteresBien, type FiltresMatch,
} from "@/lib/bo/matching";
import { CarteMatching, ComptesGrades, CriteresMatching, type ResumeMatching } from "@/components/carte-matching";
import { CIBLES, DESTINATIONS_BIEN } from "@/lib/pictos-recherche";
import { dmy, euros, libelleDossier, S } from "@/lib/format";
import { oublier, useMemoire } from "@/lib/memoire";
import { aggLocatif, pistesPrix, refsGlobales } from "@/lib/bo/marche";
import { CurseurPrix, TableauActuelPotentiel } from "@/components/prix-marche";
import { saveMatch } from "@/lib/bo/actions";
import { AssistantCommercialisation } from "@/components/commercialisation-assistant";
import { ModaleRechercheEdition, type DepartRecherche } from "@/components/recherche-modale";
import { Modale } from "@/components/modale";
import { Pastille } from "@/components/pastille";

const NOTES = ["A", "B", "C", "D"];
/** Un nombre à la française : la virgule décimale, et pas de zéro inutile. */
const fr = (n: number) => String(n).replace(".", ",");
const parse = (s: string) => {
  const v = parseFloat(s.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

type Source = "from_est" | "from_imm" | "from_doss";
type Vue = "matchees" | "ajoutees" | "retirees" | "ciblees";
type Tri = "oui" | "non" | "tous";

type Resultat = {
  matchId?: string;
  criteres: CriteresBien;
  filtres: FiltresMatch;
  source: Source;
  dossierId?: string;
  estimationId?: string;
  acquereurs: Acquereur[];
};

/** L'historique seul, chargé tout de suite (#420). */
export type HistoriqueAcheteurs = { matchs: Record<string, unknown>[]; commercialisations: Record<string, unknown>[] };

export function Acheteurs({ b, d, hist }: { b: BienData; d: AcheteursData | null; hist: HistoriqueAcheteurs }) {
  const [ouvrir, setOuvrir] = useState(false);
  /* Le drapeau posé par « + Commercialiser » de l'écran Commercialisations
     (#346). On l'efface en le lisant : il ne vaut que pour cette arrivée,
     sinon revenir sur l'onglet rouvrirait la fenêtre indéfiniment. */
  const [lancer, setLancer] = useMemoire<boolean>(`ach:${String(b.im._id)}:lancer`, false);
  if (lancer) { setLancer(false); setOuvrir(true); }
  /* Retour #329 — « j'ai commencé une commercialisation et quand je me suis
     baladé dans le BO elle avait disparue et je ne peux pas y revenir en
     cliquant simplement sur le matching. […] même un truc pas enregistré
     devrait rester en mémoire tant qu'on n'a pas cliqué sur annuler. »

     Le matching lancé vivait dans un `useState` : sortir de la fiche démontait
     l'écran et effaçait tout — les recherches ciblées, celles qu'on avait
     retirées à la main, l'assistant à moitié rempli. Il vit maintenant dans la
     mémoire d'écran (lib/memoire.ts), rangée par immeuble : revenir sur
     l'onglet Acheteurs le retrouve tel quel. Seul « Abandonner » l'efface. */
  const memo = `ach:${String(b.im._id)}`;
  const [resultat, setResultat] = useMemoire<Resultat | null>(`${memo}:resultat`, null);

  const abandonner = () => { oublier(`${memo}:`); setResultat(null); };

  /* Rouvrir un matching enregistré (#347).
     Tout ce qu'il faut est déjà chargé côté écran — les recherches et les
     contacts du vivier — donc on reconstitue les acquéreurs À PARTIR DES
     IDENTIFIANTS RETENUS (`RECHERCHEs_FINAL`) sans repasser par le réseau.
     C'est la sélection telle qu'elle a été arrêtée ce jour-là, pas un nouveau
     matching : rejouer les critères donnerait un autre résultat dès qu'une
     recherche a bougé depuis, et ferait disparaître les ajouts manuels. */
  const rouvrir = (m: Record<string, unknown>) => {
    if (!d) return;
    const ids = new Set(
      (Array.isArray(m.RECHERCHEs_FINAL) ? (m.RECHERCHEs_FINAL as unknown[]) : []).map(String),
    );
    const acquereurs = d.recherches
      .filter((x) => ids.has(String(x._id)))
      .map((x) => carte(x, d.contacts, true));
    oublier(`${memo}:`);
    setResultat({
      matchId: S(m._id),
      criteres: {
        immeubleId: String(b.im._id),
        prix: typeof m.in_prix === "number" ? (m.in_prix as number) : undefined,
        surface: typeof m.in_surface === "number" ? (m.in_surface as number) : undefined,
        occupation: typeof m.in_occup === "number" ? (m.in_occup as number) : undefined,
        renta: typeof m.in_renta === "number" ? (m.in_renta as number) : undefined,
        travaux: typeof m.in_travaux === "number" ? (m.in_travaux as number) : undefined,
        ville: S(m.in_ville) || undefined,
        departement: S(m.in_dpt) || undefined,
        cibles: Array.isArray(m.in_Cibles) ? (m.in_Cibles as string[]) : [],
        destinations: Array.isArray(m.in_Destinations) ? (m.in_Destinations as string[]) : [],
        /* La région n'est pas figée dans la ligne du matching — elle a été
           introduite après (#332). On la reprend des critères courants du
           bien : c'est la même, un immeuble ne déménage pas. */
        region: d.criteres.region,
      },
      filtres: {
        notes: Array.isArray(m.in_Notes) ? (m.in_Notes as string[]) : [],
        exclureDejaVus: m.in_proposed === true,
        exclureAgents: m.in_agents === true,
        mandatObligatoire: m.in_man_only === true,
      },
      source: (S(m.Source_mode) || "from_imm") as Source,
      dossierId: S(m.in_DOSSIER) || undefined,
      estimationId: S(m.in_ESTIMATION) || undefined,
      acquereurs,
    });
  };

  /* Retour #431 — « la commercialisation a été stoppée, je la vois mais je ne
     peux pas cliquer dessus pour y revenir ». On rouvre le matching dont elle
     est partie, puis on pose dans la mémoire d'écran ce que l'assistant lira
     en montant : l'identifiant de la commercialisation, l'étape des e-mails,
     ses textes. Rien n'est recréé : les propositions existent déjà. */
  const rouvrirComm = (c: Record<string, unknown>) => {
    const m = hist.matchs.find((x) => String(x._id) === String(c.MATCH ?? ""));
    if (!m || !d) return;
    rouvrir(m);
    const mid = String(m._id);
    const pose = (k: string, v: unknown) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* rien */ } };
    pose(`${memo}:matchId`, mid);
    pose(`${memo}:assistant`, true);
    pose(`com:${mid}:commId`, String(c._id));
    pose(`com:${mid}:etape`, c.prop_sent === true ? "SMS" : "E-mails");
    pose(`com:${mid}:creees`, Array.isArray(c.PROPOSITIONs) ? (c.PROPOSITIONs as unknown[]).length : 0);
    pose(`com:${mid}:mails`, c.prop_sent === true);
    pose(`com:${mid}:sms-envoyes`, c.prop_sms_sent === true);
    if (S(c.DOSSIER)) pose(`com:${mid}:dossier`, S(c.DOSSIER));
    if (S(c.MANDAT)) pose(`com:${mid}:mandat`, S(c.MANDAT));
    if (S(c.wetransfer_link)) pose(`com:${mid}:lien`, S(c.wetransfer_link));
    if (S(c.prop_mail_objet)) pose(`com:${mid}:objet`, S(c.prop_mail_objet));
    if (S(c.prop_mail_text)) pose(`com:${mid}:message`, S(c.prop_mail_text));
    if (S(c.prop_sms_text)) pose(`com:${mid}:sms`, S(c.prop_sms_text));
  };

  /* Retour #425 — le bouton « page précédente » du navigateur ne faisait
     rien de visible sur les résultats. La sélection vit dans la mémoire
     d'écran, pas dans l'adresse : revenir en arrière quittait la fiche.
     On pose une entrée d'historique en entrant dans les résultats ; le retour
     du navigateur les replie (la sélection reste, « Reprendre » la rouvre). */
  const [replie, setReplie] = useState(false);
  useEffect(() => {
    if (!resultat || replie) return;
    try { window.history.pushState({ ...(window.history.state ?? {}), achResultats: true }, ""); } catch { /* rien */ }
    const retour = () => setReplie(true);
    window.addEventListener("popstate", retour);
    return () => window.removeEventListener("popstate", retour);
  }, [resultat, replie]);

  if (resultat && d && !replie) {
    return (
      <Resultats
        b={b} d={d} r={resultat} memo={memo}
        onRelancer={() => { oublier(`${memo}:`); setResultat(null); setOuvrir(true); }}
        onFermer={abandonner}
      />
    );
  }

  return (
    <>
      <div className="mrow" style={{ marginBottom: 12 }}>
        {resultat && (
          <button className="kgo" type="button" onClick={() => setReplie(false)}>
            <span className="ch">›</span> Reprendre la sélection en cours ({resultat.acquereurs.length} recherches)
          </button>
        )}
        <button className="fadd" type="button" onClick={() => setOuvrir(true)}
          title={d ? undefined : "Le vivier d'acquéreurs se charge…"}>
          + Rechercher de nouveaux acquéreurs{d ? "" : " (vivier en cours de chargement…)"}
        </button>
      </div>

      <Historique hist={hist} d={d} onRouvrir={rouvrir} onRouvrirComm={rouvrirComm} />

      {ouvrir && d && (
        <ModaleMatching
          b={b} d={d}
          onFermer={() => setOuvrir(false)}
          onTrouve={(r) => { setOuvrir(false); setResultat(r); }}
        />
      )}
    </>
  );
}

/* ---------- Historique des matchings et commercialisations ---------- */

function Historique({ hist, d, onRouvrir, onRouvrirComm }: {
  hist: HistoriqueAcheteurs;
  d: AcheteursData | null;
  /* Retour #347 — « il faut que je puisse avoir accès au matching et que je
     puisse le modifier ». Les cartes de l'historique étaient inertes : le
     travail de tri fait un jour ne se reprenait jamais, il fallait relancer un
     matching et refaire les exclusions à la main. */
  onRouvrir: (m: Record<string, unknown>) => void;
  onRouvrirComm: (c: Record<string, unknown>) => void;
}) {
  if (hist.matchs.length === 0 && hist.commercialisations.length === 0) {
    return <div className="fempty">Aucun matching lancé sur cet immeuble.</div>;
  }
  /* Les comptes par grade demandent le vivier (les contacts) : ils
     apparaissent quand il est là, les totaux du matching sont là tout de
     suite. */
  const comptes = (m: Record<string, unknown>) => {
    if (!d) return undefined;
    const ids = new Set((Array.isArray(m.RECHERCHEs_FINAL) ? (m.RECHERCHEs_FINAL as unknown[]) : []).map(String));
    const acq = d.recherches.filter((x) => ids.has(String(x._id))).map((x) => carte(x, d.contacts, true));
    return comptesParGrade(acq).parGrade;
  };
  const commsDe = (m: Record<string, unknown>) => hist.commercialisations.filter((c) => String(c.MATCH ?? "") === String(m._id));

  return (
    <>
      {hist.matchs.map((m) => (
        <div key={S(m._id)} className="cm-groupe">
          <CarteMatching
            r={resumeDepuisMatch(m)}
            titre={<>Matching du {dmy(m["Created Date"])}<span className="mt-ouvrir">Rouvrir ↗</span></>}
            parGrade={comptes(m)}
            total={{ mails: Number(m.mails_count) || 0, tels: Number(m.tels_count) || 0 }}
            onOuvrir={d ? () => onRouvrir(m) : undefined}
          />
          {commsDe(m).map((c) => <CarteCommercialisation key={S(c._id)} c={c} onOuvrir={d ? () => onRouvrirComm(c) : undefined} />)}
        </div>
      ))}
      {/* Les commercialisations dont le matching n'est plus là. */}
      {hist.commercialisations
        .filter((c) => !hist.matchs.some((m) => String(m._id) === String(c.MATCH ?? "")))
        .map((c) => <CarteCommercialisation key={S(c._id)} c={c} />)}
    </>
  );
}

/** Les critères d'un matching enregistré, dans la forme de la carte. */
export function resumeDepuisMatch(m: Record<string, unknown>): ResumeMatching {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const l = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
  return {
    date: dmy(m["Created Date"]),
    source: S(m.Source_mode) || "from_imm",
    dossierLabel: S(m.in_DOSSIER) ? "dossier joint" : undefined,
    notes: l(m.in_Notes),
    cibles: l(m.in_Cibles),
    destinations: l(m.in_Destinations),
    ville: S(m.in_ville) || undefined,
    departement: S(m.in_dpt) || undefined,
    surface: n(m.in_surface),
    occupation: n(m.in_occup),
    prix: n(m.in_prix),
    renta: n(m.in_renta),
    exclureDejaVus: m.in_proposed === true,
    exclureAgents: m.in_agents === true,
    mandatObligatoire: m.in_man_only === true,
  };
}

/**
 * La carte d'une commercialisation (#431) : ce qui est parti, en direct.
 * « j'ai un bouton pour bien voir ce qui a été envoyé en temps réel en termes
 * d'e-mails, je veux le même compteur » — envoyés / total, et les SMS.
 */
function CarteCommercialisation({ c, onOuvrir }: { c: Record<string, unknown>; onOuvrir?: () => void }) {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const props = Array.isArray(c.PROPOSITIONs) ? (c.PROPOSITIONs as unknown[]).length : 0;
  const total = n(c.mails_total) || props;
  const faits = n(c.mails_envoyes);
  const mailsOk = c.prop_sent === true;
  const smsOk = c.prop_sms_sent === true;
  const corps = (
    <>
      <span className="cm-ic"><svg viewBox="0 0 24 24" aria-hidden><path d="M3 10v4a1 1 0 0 0 1 1h3l8 4V5L7 9H4a1 1 0 0 0-1 1z" /><path d="M18 9.5a3.5 3.5 0 0 1 0 5" /><path d="M7 15v4.5" /></svg></span>
      <div className="cm-c">
        <div className="cm-t">
          Commercialisation du {dmy(c["Created Date"])}
          {!mailsOk && faits > 0 && <span className="cm-enc">interrompue — {total - faits} e-mails restants</span>}
          {onOuvrir && <span className="mt-ouvrir">{mailsOk && smsOk ? "Voir ↗" : "Reprendre ↗"}</span>}
        </div>
        <div className="cm-l">
          {S(c.DOSSIER) && <span className="cm-chip">Dossier joint</span>}
          {S(c.MANDAT) && <span className="cm-chip">Mandat</span>}
          {S(c.wetransfer_link) && <a className="cm-chip lien" href={S(c.wetransfer_link)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Lien du dossier ↗</a>}
          <span className="cm-chip"><b>{props}</b> propositions</span>
        </div>
      </div>
      <div className="cm-comptes">
        <span className={`cm-envoi${mailsOk ? " ok" : faits > 0 ? " encours" : ""}`}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M3 7.5 12 13l9-5.5" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
          <b>{faits}{total ? ` / ${total}` : ""}</b>
          <span>mails envoyés</span>
        </span>
        <span className={`cm-envoi${smsOk ? " ok" : ""}`}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M4 5h16v11H9l-5 4z" /></svg>
          <b>{smsOk ? (n(c.sms_envoyes) || "✓") : "—"}</b>
          <span>SMS envoyés</span>
        </span>
      </div>
    </>
  );
  return onOuvrir
    ? <button type="button" className="cm co ouvrable" onClick={onOuvrir}>{corps}</button>
    : <div className="cm co">{corps}</div>;
}

/* ---------- Modale de lancement ---------- */

function ModaleMatching({
  b, d, onFermer, onTrouve,
}: {
  b: BienData;
  d: AcheteursData;
  onFermer: () => void;
  onTrouve: (r: {
    criteres: CriteresBien; filtres: FiltresMatch; source: Source;
    dossierId?: string; estimationId?: string; acquereurs: Acquereur[];
  }) => void;
}) {
  const estimations = b.estimations.filter((e) => S(e.Statut).startsWith("3"));
  const dossiers = b.dossiers;
  const [source, setSource] = useState<Source>(dossiers.length > 0 ? "from_doss" : "from_imm");
  const [dossierId, setDossierId] = useState(S(dossiers[0]?._id));
  const [estimationId, setEstimationId] = useState(S(estimations[0]?._id));
  const [f, setF] = useState<FiltresMatch>(FILTRES_MATCH_DEFAUT);

  // Les critères par défaut viennent de l'immeuble ; la source choisie peut
  // les remplacer par ceux figés dans l'estimation ou le dossier.
  const base = d.criteres;
  const [prix, setPrix] = useState(String(base.prix ?? ""));
  const [surface, setSurface] = useState(String(base.surface ?? ""));
  const [occupation, setOccupation] = useState(String(base.occupation ?? ""));
  const [renta, setRenta] = useState(String(base.renta ?? ""));

  const choisirSource = (s: Source) => {
    setSource(s);
    const doc =
      s === "from_doss" ? dossiers.find((x) => S(x._id) === dossierId)
      : s === "from_est" ? estimations.find((x) => S(x._id) === estimationId)
      : undefined;
    if (!doc) return;
    const n = (v: unknown) => (typeof v === "number" ? String(v) : "");
    if (n(doc.prix_hai)) setPrix(n(doc.prix_hai));
    if (n(doc.surface_carrez)) setSurface(n(doc.surface_carrez));
    /* L'estimation ne porte pas `occupation` ni `renta` : son occupation est
       `imm_occupation`, et son rendement retenu `fin_best_renta` — le champ
       est marqué « [SUPPR] » dans Bubble mais c'est encore lui que le BO
       Bubble lit pour matcher (22/09 : 100 % et 10,1 % chez Bubble, 83 % et
       8,6 % ici, 31 acquéreurs de moins). Le dossier, lui, a ses propres
       champs, on les garde. */
    if (n(doc.occupation)) setOccupation(n(doc.occupation));
    else if (n(doc.imm_occupation)) setOccupation(n(doc.imm_occupation));
    if (n(doc.renta)) setRenta(n(doc.renta));
    else if (n(doc["[SUPPR] fin_best_renta"])) setRenta(n(doc["[SUPPR] fin_best_renta"]));
    else if (n(doc.fin_renta_best)) setRenta(n(doc.fin_renta_best));
  };

  const criteres: CriteresBien = {
    ...base,
    prix: parse(prix),
    surface: parse(surface),
    occupation: parse(occupation),
    renta: parse(renta),
  };

  // Aperçu recalculé à chaque changement : MAV voit le volume avant de lancer.
  const apercu = useMemo(() => matcher(d.recherches, d.contacts, criteres, f), [d, criteres, f]);
  const dest = destinataires(apercu);

  const toggleNote = (n: string) =>
    setF({ ...f, notes: f.notes.includes(n) ? f.notes.filter((x) => x !== n) : [...f.notes, n] });

  /* Retours #324/#326 — le prix ne se tape plus, il se tire, et on voit tout
     de suite ce qu'il donne face au marché : c'est le curseur et le tableau
     « Actuel / Potentiel » de l'estimation (components/prix-marche.tsx).
     Quand les critères viennent d'un dossier ou d'une estimation, le prix est
     celui du document — « c'est de toute façon le dossier qui fait le prix » —
     et le curseur disparaît : il ne reste que le tableau. */
  const agg = useMemo(() => aggLocatif(b.lots), [b.lots]);
  const refs = useMemo(() => refsGlobales(b.secteur ?? undefined, agg.parDest), [b.secteur, agg.parDest]);
  const travauxTot = typeof b.im.fin_travaux === "number" ? b.im.fin_travaux : 0;
  /* Le rendement net se calcule sur les charges NON récupérables : celles que
     le propriétaire garde à sa charge, pas celles qu'il refacture. */
  const chargesTot = b.charges.reduce(
    (s, c) => s + (typeof c.non_recup_an === "number" ? c.non_recup_an : 0), 0);
  const pistes = useMemo(() => pistesPrix(agg, refs, travauxTot), [agg, refs, travauxTot]);
  const prixN = parse(prix) ?? pistes.auto;
  const honosPct = typeof b.im.prix_Charge_honos === "number" ? b.im.prix_Charge_honos : 5;
  const [voirRegles, setVoirRegles] = useState(false);

  return (
    <Modale
      titre="Trouver des acquéreurs"
      onFermer={onFermer}
      className="lg"
      fermeDehors={false}
      pied={
        <>
          {/* Retour #324 : « tu mets le bouton trouver des acquéreurs à droite
              en vert aussi. » Il était centré dans le pied, à égalité visuelle
              avec rien — un pied de modale se lit par la droite. */}
          <span style={{ flex: 1 }} />
          <button
            className="kgo" type="button" disabled={apercu.length === 0}
            style={apercu.length === 0 ? { opacity: 0.5 } : undefined}
            onClick={() => onTrouve({
              criteres, filtres: f, source,
              dossierId: source === "from_doss" ? dossierId : undefined,
              estimationId: source === "from_est" ? estimationId : undefined,
              acquereurs: apercu,
            })}
          ><span className="ch">›</span> Trouver des acquéreurs</button>
        </>
      }
    >
      <span className="mlab">Source des critères</span>
      <div className="mrow">
        <button type="button" className={`mopt${source === "from_est" ? " on" : ""}`}
          disabled={estimations.length === 0} onClick={() => choisirSource("from_est")}>
          À partir d&apos;une estimation
        </button>
        <button type="button" className={`mopt${source === "from_imm" ? " on" : ""}`} onClick={() => choisirSource("from_imm")}>
          À partir d&apos;un prix
        </button>
        <button type="button" className={`mopt${source === "from_doss" ? " on" : ""}`}
          disabled={dossiers.length === 0} onClick={() => choisirSource("from_doss")}>
          À partir d&apos;un dossier
        </button>
      </div>

      {source === "from_est" && estimations.length > 0 && (
        <select className="min" value={estimationId} onChange={(e) => { setEstimationId(e.target.value); choisirSource("from_est"); }}>
          {estimations.map((e) => (
            <option key={S(e._id)} value={S(e._id)}>{S(e.titre) || "Estimation"} — {dmy(e["Created Date"])}</option>
          ))}
        </select>
      )}
      {source === "from_doss" && dossiers.length > 0 && (
        <select className="min" value={dossierId} onChange={(e) => { setDossierId(e.target.value); choisirSource("from_doss"); }}>
          {dossiers.map((x) => (
            <option key={S(x._id)} value={S(x._id)}>{libelleDossier(x)}</option>
          ))}
        </select>
      )}

      {/* Retour #324 — le prix se tirait à la main dans une case, sans rien
          qui dise s'il tenait la route. Il se règle à la barre, avec les
          repères du secteur, et le tableau juste dessous dit ce que ça
          donne en loyer au m², prix au m² et rendement, actuel comme
          potentiel. Retour #326 : quand la source est un dossier ou une
          estimation, le prix est celui du document — pas de curseur, on ne
          refait pas le prix ici. */}
      <span className="mlab">
        {source === "from_imm" ? "Prix de mise en marché" : "Prix figé par le document"}
      </span>
      {source === "from_imm" ? (
        <CurseurPrix bornes={pistes.bornes} pRendementMax={pistes.pRendementMax}
          pM2={pistes.pM2} hai={prixN} honosPct={honosPct}
          onHai={(v) => setPrix(String(v))} />
      ) : (
        <div className="mt-prixfige">
          <b>{euros(prixN) ?? "—"}</b> HAI
          <span>
            repris {source === "from_doss" ? "du dossier" : "de l'estimation"} — il se change
            là où il vit
          </span>
        </div>
      )}

      <TableauActuelPotentiel agg={agg} refs={refs} hai={prixN}
        travaux={travauxTot} chargesTot={chargesTot} />

      <span className="mlab">Autres critères</span>
      <div className="mrow" style={{ alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12 }}>Surface m² <input className="min" style={{ width: 80 }} value={surface} onChange={(e) => setSurface(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Occupation % <input className="min" style={{ width: 70 }} value={occupation} onChange={(e) => setOccupation(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Rentabilité % <input className="min" style={{ width: 70 }} value={renta} onChange={(e) => setRenta(e.target.value)} /></label>
      </div>
      <div className="mt-geo">
        Secteur : <b>{criteres.ville || "n.c."}</b>{criteres.departement ? ` (${criteres.departement})` : ""}
        {criteres.destinations && criteres.destinations.length > 0 ? ` · ${criteres.destinations.join(", ")}` : ""}
      </div>

      {/* Retour #326 — « en dessous je veux que tu me mettes les recherches
          que ça va matcher dans un menu déroulant ». Le compteur disait
          combien, jamais pourquoi : on ne pouvait ni faire confiance au
          résultat ni comprendre une absence. Voici la règle, en clair,
          appliquée à cet immeuble. */}
      <button type="button" className="mt-regles-b" onClick={() => setVoirRegles(!voirRegles)}>
        {voirRegles ? "Masquer" : "Voir"} les recherches que ça va toucher
        <span className="ch">{voirRegles ? "▾" : "▸"}</span>
      </button>
      {voirRegles && (
        <ul className="mt-regles">
          <li>
            <b>Destination</b> — les recherches qui visent{" "}
            {criteres.destinations && criteres.destinations.length > 0
              ? criteres.destinations.join(" ou ").toLowerCase()
              : "n'importe quelle destination"}, ou du mixte, ou qui n&apos;en précisent aucune.
            Celles qui excluent une de ces destinations sont écartées.
          </li>
          <li>
            <b>Budget</b> — celles dont la fourchette contient{" "}
            <b>{euros(prixN) ?? "le prix"}</b>, et celles sans budget déclaré.
          </li>
          <li>
            <b>Occupation</b> — celles qui n&apos;en font pas un critère, et celles dont
            la fourchette contient {criteres.occupation === undefined ? "?" : fr(criteres.occupation)} %.
          </li>
          <li>
            <b>Secteur</b> — celles sans secteur déclaré, et celles qui couvrent{" "}
            <b>{criteres.ville || "la ville"}</b>
            {criteres.departement ? `, le ${criteres.departement}` : ""} ou sa région.
          </li>
          <li>
            <b>Rentabilité</b> — celles qui n&apos;en exigent pas plus que{" "}
            {criteres.renta === undefined ? "?" : fr(criteres.renta)} %.
          </li>
          <li>
            <b>Classe</b> — {f.notes.length === 0
              ? "aucune classe retenue : rien ne sortira."
              : `les acquéreurs classés ${f.notes.join(", ")}.`}
          </li>
        </ul>
      )}

      <span className="mlab">Classes d&apos;acquéreurs</span>
      {/* Retour #324 — « les mêmes codes couleurs que ce qu'on a mis dans
          le BO pour les ABCD, et quand ils ne sont pas sélectionnés il faut
          qu'ils soient gris. » A, B, C et D sont une échelle de qualité
          d'acquéreur : quatre boutons identiques ne disaient pas laquelle
          on écartait. La pastille reprend donc la couleur qu'elle a partout
          ailleurs dans le BO, et se décolore quand la classe est exclue. */}
      <div className="mrow">
        {NOTES.map((n) => {
          const on = f.notes.includes(n);
          return (
            <button key={n} type="button" className={`mt-note${on ? " on" : ""}`}
              aria-pressed={on}
              title={on ? `Classe ${n} incluse — cliquez pour l'exclure` : `Classe ${n} exclue — cliquez pour l'inclure`}
              onClick={() => toggleNote(n)}>
              <span className={`note n${n}`}>{n}</span>
              Classe {n}
            </button>
          );
        })}
      </div>

      <div className="mrow" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" className={`mopt${f.exclureDejaVus ? " on" : ""}`} onClick={() => setF({ ...f, exclureDejaVus: !f.exclureDejaVus })}>
          Déjà vus exclus
        </button>
        <button type="button" className={`mopt${f.exclureAgents ? " on" : ""}`} onClick={() => setF({ ...f, exclureAgents: !f.exclureAgents })}>
          Agents exclus
        </button>
        <button type="button" className={`mopt${f.mandatObligatoire ? " on" : ""}`} onClick={() => setF({ ...f, mandatObligatoire: !f.mandatObligatoire })}>
          {f.mandatObligatoire ? "Mandat obligatoire" : "Mandat facultatif"}
        </button>
      </div>

      <div className="mt-apercu">
        <b>{apercu.length}</b> recherche{apercu.length > 1 ? "s" : ""} · <b>{dest.emails.length}</b> emails ·{" "}
        <b>{dest.telephones.length}</b> téléphones
      </div>
    </Modale>
  );
}

/* ---------- Résultats ---------- */

function Resultats({
  b, d, r, memo, onRelancer, onFermer,
}: {
  b: BienData;
  d: AcheteursData;
  r: Resultat;
  /** Espace de noms de la mémoire d'écran, propre à cet immeuble (#329). */
  memo: string;
  onRelancer: () => void;
  onFermer: () => void;
}) {
  const [vue, setVue] = useState<Vue>("matchees");
  /* Ce que l'agent a décidé — retirer une recherche, en ajouter une, ouvrir
     l'assistant — survit à la navigation (#329). Les filtres d'affichage et la
     recherche plein texte, eux, se refont d'un clic : les mémoriser
     n'apporterait rien et embrouillerait le retour. Un Set ne se sérialise
     pas : la mémoire garde un tableau. */
  const [retireesL, setRetireesL] = useMemoire<string[]>(`${memo}:retirees`, []);
  const retirees = useMemo(() => new Set(retireesL), [retireesL]);
  const [ajoutees, setAjoutees] = useMemoire<Acquereur[]>(`${memo}:ajoutees`, []);
  const [avecContact, setAvecContact] = useState<Tri>("tous");
  const [avecTel, setAvecTel] = useState<Tri>("tous");
  const [avecDetails, setAvecDetails] = useState<Tri>("tous");
  const [q, setQ] = useState("");
  /* Retour #423 : trier par grade, type de recherche, type de bien. */
  const [fNotes, setFNotes] = useState<string[]>([]);
  const [fCibles, setFCibles] = useState<string[]>([]);
  const [fDest, setFDest] = useState<string[]>([]);
  const bascule = (set: (f: (l: string[]) => string[]) => void, v: string) =>
    set((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]));
  const [pending, start] = useTransition();
  const [matchId, setMatchId] = useMemoire<string | undefined>(`${memo}:matchId`, r.matchId);
  /* La recherche qu'on est en train de corriger sans quitter le matching
     (#347). Volontairement HORS mémoire d'écran : une fenêtre ouverte n'est
     pas un travail à retrouver, contrairement au tri des acquéreurs. */
  const [rechercheOuverte, setRechercheOuverte] = useState<string | null>(null);
  /* La modale se préremplit de la ligne brute du miroir, déjà chargée dans le
     vivier : pas d'aller-retour serveur pour rouvrir une recherche. */
  const departRecherche = useMemo((): DepartRecherche | null => {
    if (!rechercheOuverte) return null;
    const x = d.recherches.find((r) => String(r._id) === rechercheOuverte);
    if (!x) return null;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    const liste = (k: string) => (Array.isArray(x[k]) ? (x[k] as unknown[]).map(String) : []);
    const c = d.contacts.get(String(x.ACHETEUR ?? ""));
    return {
      id: rechercheOuverte,
      destinations: liste("Destinations"),
      /* Villes et départements sont deux listes en base ; la modale les
         resépare sur la forme du code, comme l'écran Recherches. */
      lieux: [
        ...liste("villes").filter((v) => !/^\d{13}x\d+$/.test(v)),
        ...liste("dpts").filter((v) => /^\d{2,3}[AB]?$/.test(v)),
      ],
      commentaire: S(x.commentaire) || undefined,
      contact: c
        ? {
            id: String(c._id),
            nom: `${S(c["prénom"])} ${S(c.nom)}`.trim() || S(c.email) || "Contact",
            tel: S(c.portable) || S(c.fixe) || undefined,
            email: S(c.email) || undefined,
          }
        : undefined,
      brut: {
        cible: S(x.Cible) || undefined,
        prixMin: n(x.prix_min), prixMax: n(x.prix_max),
        surfaceMin: n(x.surface_min), surfaceMax: n(x.surface_max),
        occupMin: n(x.occup_min), occupMax: n(x.occup_max),
        renta: n(x.renta),
      },
    };
  }, [rechercheOuverte, d]);
  const [assistant, setAssistant] = useMemoire<boolean>(`${memo}:assistant`, false);
  const ciblees = useMemo(
    () => [...r.acquereurs, ...ajoutees].filter((a) => !retirees.has(a.rechercheId)),
    [r.acquereurs, ajoutees, retirees],
  );

  // Vivier des recherches ajoutables à la main : celles écartées par le match.
  const ecartees = useMemo(() => {
    const dans = new Set([...r.acquereurs, ...ajoutees].map((a) => a.rechercheId));
    return d.recherches
      .filter((x) => !dans.has(String(x._id)) && x.archived !== true)
      .map((x) => carte(x, d.contacts, false));
  }, [d, r.acquereurs, ajoutees]);

  const liste = useMemo(() => {
    const base =
      vue === "matchees" ? r.acquereurs
      : vue === "ajoutees" ? ecartees
      : vue === "retirees" ? [...r.acquereurs, ...ajoutees].filter((a) => retirees.has(a.rechercheId))
      : ciblees;
    const tri = (v: Tri, val: boolean) => v === "tous" || (v === "oui" ? val : !val);
    const qq = q.trim().toLowerCase();
    /* Retour #424 : la recherche lit aussi les détails de la recherche du
       client — « si un client avait dit hôtel, je cherche hôtel et je le vois ». */
    const texte = (a: Acquereur) =>
      `${a.nom} ${a.secteur} ${a.email ?? ""} ${a.telephone ?? ""} ${a.cible ?? ""} ${a.destinations.join(" ")} ${a.criteres} ${a.commentaire ?? ""}`.toLowerCase();
    return base.filter(
      (a) =>
        tri(avecContact, a.aContact) && tri(avecTel, a.aTelephone) && tri(avecDetails, a.aDetails) &&
        (fNotes.length === 0 || fNotes.includes(a.note ?? "")) &&
        (fCibles.length === 0 || fCibles.includes(a.cible ?? "")) &&
        (fDest.length === 0 || a.destinations.some((x) => fDest.includes(x))) &&
        (!qq || texte(a).includes(qq)),
    );
  }, [vue, r.acquereurs, ecartees, ajoutees, retirees, ciblees, avecContact, avecTel, avecDetails, q, fNotes, fCibles, fDest]);

  /* Retour #424 : « aller chercher des gens qui ne sont pas matchés
     automatiquement et les ajouter ». Quand la recherche tape dans les
     recherches hors matching, on le dit, et un clic y mène. */
  const horsMatching = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq || vue === "ajoutees") return 0;
    return ecartees.filter((a) =>
      `${a.nom} ${a.secteur} ${a.cible ?? ""} ${a.destinations.join(" ")} ${a.criteres} ${a.commentaire ?? ""}`.toLowerCase().includes(qq)).length;
  }, [q, vue, ecartees]);

  const comptes = useMemo(() => comptesParGrade(ciblees), [ciblees]);
  const resume: ResumeMatching = {
    source: r.source, dossierLabel: r.dossierId ? "dossier joint" : undefined,
    notes: r.filtres.notes, cibles: r.criteres.cibles ?? [], destinations: r.criteres.destinations ?? [],
    ville: r.criteres.ville, departement: r.criteres.departement,
    surface: r.criteres.surface, occupation: r.criteres.occupation, prix: r.criteres.prix, renta: r.criteres.renta,
    exclureDejaVus: r.filtres.exclureDejaVus, exclureAgents: r.filtres.exclureAgents, mandatObligatoire: r.filtres.mandatObligatoire,
    bien: { libelle: [b.ville, b.adresse].filter(Boolean).join(" — ") || "Immeuble", prix: r.criteres.prix },
  };

  const dest = destinataires(ciblees);

  const enregistrer = (apres: () => void) =>
    start(async () => {
      const id = await saveMatch({
        immeubleId: String(b.im._id),
        agentId: String(b.im.AGENT ?? "") || undefined,
        source: r.source,
        dossierId: r.dossierId,
        estimationId: r.estimationId,
        prix: r.criteres.prix, surface: r.criteres.surface,
        occupation: r.criteres.occupation, renta: r.criteres.renta, travaux: r.criteres.travaux,
        ville: r.criteres.ville, departement: r.criteres.departement,
        cibles: r.criteres.cibles, destinations: r.criteres.destinations,
        notes: r.filtres.notes,
        exclureDejaVus: r.filtres.exclureDejaVus,
        exclureAgents: r.filtres.exclureAgents,
        mandatObligatoire: r.filtres.mandatObligatoire,
        rechercheIds: ciblees.map((a) => a.rechercheId),
        contactIds: [...new Set(ciblees.map((a) => a.contactId).filter(Boolean) as string[])],
        emails: dest.emails,
        telephones: dest.telephones,
      });
      setMatchId(id);
      apres();
    });

  if (assistant && matchId) {
    return (
      <AssistantCommercialisation
        b={b} matchId={matchId} dossierId={r.dossierId}
        cibles={ciblees} onFermer={() => { setAssistant(false); onFermer(); }}
      />
    );
  }

  const vues: { k: Vue; l: string; n: number }[] = [
    { k: "matchees", l: "Recherches matchées", n: r.acquereurs.length },
    { k: "ajoutees", l: "Hors matching (à ajouter)", n: ajoutees.length },
    { k: "retirees", l: "Retirées", n: retirees.size },
    { k: "ciblees", l: "Ciblées", n: ciblees.length },
  ];

  return (
    <>
      {/* Retour #422 — « retrouver ce sticky où je voyais le nombre de A B C D
          choisis et le nombre d'e-mails et téléphones avec le total en
          dessous, et les infos sur la recherche ». Le bandeau reste collé en
          haut pendant qu'on trie la liste. */}
      <div className="cm ac-sticky">
        <span className="cm-ic"><svg viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="8" r="3.2" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M3.5 19c.5-3.4 2.8-5.2 5.5-5.2s5 1.8 5.5 5.2M14.5 18.5c.3-2.2 1.6-3.6 3.5-3.6 1.4 0 2.6.8 3 2.6" /></svg></span>
        <div className="cm-c">
          <div className="cm-t">
            Matching en cours
            <span className="cm-enc">{ciblees.length} ciblés</span>
            <span className="sp" style={{ flex: 1 }} />
            <button className="fadd" type="button" onClick={onFermer}
              title="Jeter cette sélection et repartir de zéro">Abandonner</button>
            <button className="fadd" type="button" onClick={onRelancer}>Relancer une recherche</button>
            <button
              className="kgo" type="button" disabled={pending || ciblees.length === 0}
              style={pending || ciblees.length === 0 ? { opacity: 0.5 } : undefined}
              onClick={() => enregistrer(() => setAssistant(true))}
            ><span className="ch">›</span> Commercialiser</button>
          </div>
          <CriteresMatching r={resume} />
        </div>
        <ComptesGrades parGrade={comptes.parGrade} total={comptes.total} compact />
      </div>

      <div className="ac-vues">
        {vues.map((v) => (
          <button key={v.k} type="button" className={vue === v.k ? "on" : ""} onClick={() => setVue(v.k)}>
            {v.l} <b>{v.n}</b>
          </button>
        ))}
      </div>

      <div className="ac-filtres">
        <div className="lst-search" style={{ maxWidth: 280 }}>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
          <input placeholder="Nom, e-mail, téléphone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Tribouton label="Avec contact" v={avecContact} set={setAvecContact} />
        <Tribouton label="Avec tél." v={avecTel} set={setAvecTel} />
        <Tribouton label="Avec détails" v={avecDetails} set={setAvecDetails} />
        <span className="sp" style={{ flex: 1 }} />
        <span className="ac-n">{liste.length} résultat{liste.length > 1 ? "s" : ""}</span>
      </div>
      {/* Retour #423 : les filtres — grade, type de recherche, type de bien. */}
      <div className="ac-filtres ac-f2">
        <span className="ac-fl">Grade</span>
        {NOTES.map((g) => (
          <button key={g} type="button" className={`note n${g}${fNotes.includes(g) ? "" : " off"}`}
            title={fNotes.includes(g) ? "Retirer ce grade du filtre" : "Ne voir que ce grade"}
            onClick={() => bascule(setFNotes, g)}>{g}</button>
        ))}
        <span className="ac-fl">Recherche</span>
        {CIBLES.map((c) => (
          <button key={c.cle} type="button" className={`ac-pic${fCibles.includes(c.cle) ? " on" : ""}`} title={c.titre}
            onClick={() => bascule(setFCibles, c.cle)}>
            <svg viewBox="0 0 24 24" aria-hidden>{c.d}</svg>
          </button>
        ))}
        <span className="ac-fl">Bien</span>
        {DESTINATIONS_BIEN.map((x) => (
          <button key={x.cle} type="button" className={`ac-pic${fDest.includes(x.cle) ? " on" : ""}`} title={x.titre}
            onClick={() => bascule(setFDest, x.cle)}>
            <svg viewBox="0 0 24 24" aria-hidden>{x.d}</svg>
          </button>
        ))}
        {(fNotes.length + fCibles.length + fDest.length > 0) && (
          <button type="button" className="ac-tri" onClick={() => { setFNotes([]); setFCibles([]); setFDest([]); }}>Tout afficher</button>
        )}
      </div>
      {horsMatching > 0 && (
        <div className="ac-hors">
          {horsMatching} recherche{horsMatching > 1 ? "s" : ""} hors matching correspond{horsMatching > 1 ? "ent" : ""} à « {q.trim()} » —{" "}
          <button type="button" onClick={() => setVue("ajoutees")}>les voir et les ajouter</button>
        </div>
      )}

      {liste.length === 0 && <div className="fempty">Aucun acquéreur dans cette vue.</div>}
      <div className="ac-grid">
        {liste.slice(0, 300).map((a) => (
          <CarteAcquereur
            key={a.rechercheId} a={a} vue={vue}
            retiree={retirees.has(a.rechercheId)}
            onRetirer={() => setRetireesL((l) => [...new Set([...l, a.rechercheId])])}
            onRemettre={() => setRetireesL((l) => l.filter((x) => x !== a.rechercheId))}
            onAjouter={() => setAjoutees([...ajoutees, { ...a, auto: false }])}
            onModifierRecherche={() => setRechercheOuverte(a.rechercheId)}
          />
        ))}
      </div>
      {rechercheOuverte && departRecherche && (
        <ModaleRechercheEdition
          depart={departRecherche}
          agentId={String(b.im.AGENT ?? "") || undefined}
          onFermer={() => setRechercheOuverte(null)}
          onEnregistre={() => setRechercheOuverte(null)}
        />
      )}
      {liste.length > 300 && (
        <div className="fempty">300 acquéreurs affichés sur {liste.length} — affinez les filtres pour voir les suivants.</div>
      )}
    </>
  );
}

function Tribouton({ label, v, set }: { label: string; v: Tri; set: (v: Tri) => void }) {
  const suivant: Record<Tri, Tri> = { tous: "oui", oui: "non", non: "tous" };
  return (
    <button type="button" className={`ac-tri${v !== "tous" ? " on" : ""}`} onClick={() => set(suivant[v])}>
      {label} : {v === "tous" ? "Tous" : v === "oui" ? "Oui" : "Non"}
    </button>
  );
}

/**
 * Une coordonnée et son bouton de copie (#342).
 *
 * L'écriture dans le presse-papiers peut être refusée — page non sécurisée,
 * permission retirée : on ne prétend donc pas avoir copié tant que la promesse
 * n'a pas abouti, et un échec se dit au lieu de passer pour un succès.
 */
function Coordonnee({ valeur, vide, quoi }: { valeur?: string; vide: string; quoi: string }) {
  const [etat, setEtat] = useState<"" | "ok" | "ko">("");
  if (!valeur) return <span className="off">{vide}</span>;
  return (
    <span className="ac-coord">
      {valeur}
      <button
        type="button" className="ac-copie"
        title={etat === "ok" ? `${quoi} est copié` : etat === "ko" ? "Copie refusée par le navigateur" : `Copier — ${valeur}`}
        onClick={() => {
          navigator.clipboard.writeText(valeur)
            .then(() => setEtat("ok"))
            .catch(() => setEtat("ko"));
        }}
      >{etat === "ok" ? "✓" : etat === "ko" ? "!" : "⧉"}</button>
    </span>
  );
}

function CarteAcquereur({
  a, vue, retiree, onRetirer, onRemettre, onAjouter, onModifierRecherche,
}: {
  a: Acquereur; vue: Vue; retiree: boolean;
  onRetirer: () => void; onRemettre: () => void; onAjouter: () => void;
  /** Ouvre la recherche pour la corriger sans quitter le matching (#347). */
  onModifierRecherche: () => void;
}) {
  const [details, setDetails] = useState(false);
  return (
    <div className={`ac-c${retiree ? " off" : ""}`}>
      <div className="ac-h">
        {a.note && <span className={`note n${a.note}`}>{a.note}</span>}
        {/* Retour #342 — « c'est vachement bien que sur les vignettes tu aies
            un lien pour la fiche, c'est beaucoup mieux que de cliquer n'importe
            où sur la vignette. Tu peux reproduire ce schéma partout où il y a
            la vignette. » Ici le nom porte le lien, et lui seul : le reste de
            la carte reste cliquable pour ses propres boutons. */}
        {a.contactId
          ? <a className="ac-nom lienfiche" href={`/contact/${a.contactId}`} target="_blank" rel="noreferrer">{a.nom} ↗</a>
          : <span className="ac-nom">{a.nom}</span>}
        {a.auto && <span className="ac-auto">Matchée automatiquement</span>}
        <span className="sp" />
        {/* Retour #347 — « tout en ayant accès à leur recherche ou leur contact
            pour pouvoir modifier à la volée ». Le crayon ouvre la recherche
            sans faire perdre le tri en cours. */}
        <button type="button" className="ac-crayon" title="Modifier cette recherche"
          onClick={onModifierRecherche}>✎</button>
      </div>
      <div className="ac-s">{a.secteur}</div>
      {a.cible && <div className="ac-s">{a.cible}{a.destinations.length > 0 ? ` · ${a.destinations.join(", ")}` : ""}</div>}
      <div className="ac-crit">{a.criteres || "Aucun critère borné"}</div>
      {/* Retour #342 — « fais en sorte de mettre le bouton de copie à côté du
          téléphone et du mail, c'est mieux ». Copier une adresse pour la
          coller dans un autre outil est le geste le plus fréquent de l'écran ;
          il ne devrait pas demander de sélectionner du texte à la souris. */}
      <div className="ac-canaux">
        <Coordonnee valeur={a.email} vide="pas d'e-mail" quoi="L'adresse" />
        <Coordonnee valeur={a.telephone} vide="pas de téléphone" quoi="Le numéro" />
      </div>
      {details && a.commentaire && <div className="ac-com">{a.commentaire}</div>}
      <div className="ac-f">
        {a.commentaire && (
          <button type="button" className="fadd" onClick={() => setDetails(!details)}>
            {details ? "Masquer" : "Voir les détails"}
          </button>
        )}
        {vue === "ajoutees" ? (
          <button type="button" className="fadd" onClick={onAjouter}>+ Ajouter</button>
        ) : retiree ? (
          <button type="button" className="fadd" onClick={onRemettre}>Remettre</button>
        ) : (
          <button type="button" className="fadd" style={{ color: "var(--red)", borderColor: "#e6b3b3" }} onClick={onRetirer}>
            Retirer
          </button>
        )}
      </div>
    </div>
  );
}
