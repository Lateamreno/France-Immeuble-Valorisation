"use client";

// Onglet Acheteurs de la fiche bien — réplique du BO :
// « + Rechercher de nouveaux acquéreurs » (3 sources, filtres de grade et
// toggles) → résultats en vues matchées / ajoutées / retirées / ciblées →
// « Commercialiser » qui enchaîne sur l'assistant d'envoi.
import { useMemo, useState, useTransition } from "react";
import type { AcheteursData, BienData } from "@/lib/bubble/server";
import {
  carte, destinataires, FILTRES_MATCH_DEFAUT, matcher,
  type Acquereur, type CriteresBien, type FiltresMatch,
} from "@/lib/bo/matching";
import { dmy, euros, libelleDossier } from "@/lib/format";
import { aggLocatif, pistesPrix, refsGlobales } from "@/lib/bo/marche";
import { CurseurPrix, TableauActuelPotentiel } from "@/components/prix-marche";
import { saveMatch } from "@/lib/bo/actions";
import { AssistantCommercialisation } from "@/components/commercialisation-assistant";

const NOTES = ["A", "B", "C", "D"];
/** Un nombre à la française : la virgule décimale, et pas de zéro inutile. */
const fr = (n: number) => String(n).replace(".", ",");
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const parse = (s: string) => {
  const v = parseFloat(s.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

type Source = "from_est" | "from_imm" | "from_doss";
type Vue = "matchees" | "ajoutees" | "retirees" | "ciblees";
type Tri = "oui" | "non" | "tous";

export function Acheteurs({ b, d }: { b: BienData; d: AcheteursData }) {
  const [ouvrir, setOuvrir] = useState(false);
  const [resultat, setResultat] = useState<{
    matchId?: string;
    criteres: CriteresBien;
    filtres: FiltresMatch;
    source: Source;
    dossierId?: string;
    estimationId?: string;
    acquereurs: Acquereur[];
  } | null>(null);

  if (resultat) {
    return (
      <Resultats
        b={b} d={d} r={resultat}
        onRelancer={() => { setResultat(null); setOuvrir(true); }}
        onFermer={() => setResultat(null)}
      />
    );
  }

  return (
    <>
      <div className="mrow" style={{ marginBottom: 12 }}>
        <button className="fadd" type="button" onClick={() => setOuvrir(true)}>
          + Rechercher de nouveaux acquéreurs
        </button>
      </div>

      <Historique d={d} />

      {ouvrir && (
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

function Historique({ d }: { d: AcheteursData }) {
  if (d.matchs.length === 0 && d.commercialisations.length === 0) {
    return <div className="fempty">Aucun matching lancé sur cet immeuble.</div>;
  }
  const src = (m: Record<string, unknown>) =>
    ({ from_est: "estimation", from_imm: "prix", from_doss: "dossier" })[S(m.Source_mode)] ?? "critères";
  return (
    <>
      {d.matchs.map((m) => (
        <div key={S(m._id)} className="mt-h">
          <div className="mt-h-t">
            Matching du {dmy(m["Created Date"])}
            <span className="mt-src">à partir d&apos;un{src(m) === "estimation" ? "e" : ""} {src(m)}</span>
          </div>
          <div className="mt-crit">
            {[
              typeof m.in_surface === "number" ? `${Math.round(m.in_surface as number)} m²` : "",
              typeof m.in_occup === "number" ? `${Math.round(m.in_occup as number)} %` : "",
              euros(m.in_prix) ?? "",
              typeof m.in_renta === "number" ? `${m.in_renta} %` : "",
            ].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-tags">
            {m.in_proposed === true && <span>Déjà vus exclus</span>}
            {m.in_agents === true && <span>Agents exclus</span>}
            <span>{m.in_man_only === true ? "Mandat obligatoire" : "Mandat facultatif"}</span>
            {Array.isArray(m.in_Notes) && (m.in_Notes as string[]).length > 0 && (
              <span>Grades {(m.in_Notes as string[]).join(" ")}</span>
            )}
          </div>
          <div className="mt-res">
            <b>{S(m.mails_count) || 0}</b> emails · <b>{S(m.tels_count) || 0}</b> téléphones
            <span className="mt-n">{S(m.recherches_count) || 0} recherches retenues</span>
          </div>
        </div>
      ))}

      {d.commercialisations.map((c) => (
        <div key={S(c._id)} className="mt-h co">
          <div className="mt-h-t">
            Commercialisation du {dmy(c["Created Date"])}
            {c.prop_sent === true ? <span className="badge-g">E-mails envoyés</span> : <span className="badge-o">E-mails à envoyer</span>}
            {c.prop_sms_sent === true ? <span className="badge-g">SMS envoyés</span> : <span className="badge-o">SMS à envoyer</span>}
          </div>
          <div className="mt-res">
            <b>{Array.isArray(c.PROPOSITIONs) ? (c.PROPOSITIONs as string[]).length : 0}</b> propositions créées
            {S(c.wetransfer_link) && <a className="mt-lien" href={S(c.wetransfer_link)} target="_blank" rel="noreferrer">Lien du dossier</a>}
          </div>
        </div>
      ))}
    </>
  );
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
    if (n(doc.occupation)) setOccupation(n(doc.occupation));
    if (n(doc.renta)) setRenta(n(doc.renta));
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
    <div className="modal-ov">
      <div className="modal lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">Trouver des acquéreurs<button type="button" onClick={onFermer}>✕</button></div>
        <div className="modal-b">
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
        </div>
        <div className="modal-f">
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
        </div>
      </div>
    </div>
  );
}

/* ---------- Résultats ---------- */

function Resultats({
  b, d, r, onRelancer, onFermer,
}: {
  b: BienData;
  d: AcheteursData;
  r: {
    matchId?: string; criteres: CriteresBien; filtres: FiltresMatch; source: Source;
    dossierId?: string; estimationId?: string; acquereurs: Acquereur[];
  };
  onRelancer: () => void;
  onFermer: () => void;
}) {
  const [vue, setVue] = useState<Vue>("matchees");
  const [retirees, setRetirees] = useState<Set<string>>(new Set());
  const [ajoutees, setAjoutees] = useState<Acquereur[]>([]);
  const [avecContact, setAvecContact] = useState<Tri>("tous");
  const [avecTel, setAvecTel] = useState<Tri>("tous");
  const [avecDetails, setAvecDetails] = useState<Tri>("tous");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [matchId, setMatchId] = useState(r.matchId);
  const [assistant, setAssistant] = useState(false);

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
    return base.filter(
      (a) =>
        tri(avecContact, a.aContact) && tri(avecTel, a.aTelephone) && tri(avecDetails, a.aDetails) &&
        (!qq || `${a.nom} ${a.secteur} ${a.email ?? ""} ${a.telephone ?? ""}`.toLowerCase().includes(qq)),
    );
  }, [vue, r.acquereurs, ecartees, ajoutees, retirees, ciblees, avecContact, avecTel, avecDetails, q]);

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
    { k: "ajoutees", l: "Ajoutées", n: ajoutees.length },
    { k: "retirees", l: "Retirées", n: retirees.size },
    { k: "ciblees", l: "Ciblées", n: ciblees.length },
  ];

  return (
    <>
      <div className="mrow" style={{ marginBottom: 10, alignItems: "center" }}>
        <button className="fadd" type="button" onClick={onFermer}>← Retour</button>
        <button className="fadd" type="button" onClick={onRelancer}>Relancer une recherche</button>
        <span className="sp" style={{ flex: 1 }} />
        <span className="mt-apercu" style={{ margin: 0 }}>
          <b>{ciblees.length}</b> ciblés · <b>{dest.emails.length}</b> emails · <b>{dest.telephones.length}</b> téléphones
        </span>
        <button
          className="kgo" type="button" disabled={pending || ciblees.length === 0}
          style={pending || ciblees.length === 0 ? { opacity: 0.5 } : undefined}
          onClick={() => enregistrer(() => setAssistant(true))}
        ><span className="ch">›</span> Commercialiser</button>
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

      {liste.length === 0 && <div className="fempty">Aucun acquéreur dans cette vue.</div>}
      <div className="ac-grid">
        {liste.slice(0, 300).map((a) => (
          <CarteAcquereur
            key={a.rechercheId} a={a} vue={vue}
            retiree={retirees.has(a.rechercheId)}
            onRetirer={() => setRetirees(new Set([...retirees, a.rechercheId]))}
            onRemettre={() => {
              const n = new Set(retirees); n.delete(a.rechercheId); setRetirees(n);
            }}
            onAjouter={() => setAjoutees([...ajoutees, { ...a, auto: false }])}
          />
        ))}
      </div>
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

function CarteAcquereur({
  a, vue, retiree, onRetirer, onRemettre, onAjouter,
}: {
  a: Acquereur; vue: Vue; retiree: boolean;
  onRetirer: () => void; onRemettre: () => void; onAjouter: () => void;
}) {
  const [details, setDetails] = useState(false);
  return (
    <div className={`ac-c${retiree ? " off" : ""}`}>
      <div className="ac-h">
        {a.note && <span className={`note n${a.note}`}>{a.note}</span>}
        <span className="ac-nom">{a.nom}</span>
        {a.auto && <span className="ac-auto">Matchée automatiquement</span>}
      </div>
      <div className="ac-s">{a.secteur}</div>
      {a.cible && <div className="ac-s">{a.cible}{a.destinations.length > 0 ? ` · ${a.destinations.join(", ")}` : ""}</div>}
      <div className="ac-crit">{a.criteres || "Aucun critère borné"}</div>
      <div className="ac-canaux">
        <span className={a.email ? "" : "off"}>{a.email ?? "pas d'e-mail"}</span>
        <span className={a.telephone ? "" : "off"}>{a.telephone ?? "pas de téléphone"}</span>
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
