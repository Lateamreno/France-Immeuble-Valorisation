"use client";

/**
 * L'étude de vente à la découpe, onglet de l'état locatif (MAV, 14-15/11/26,
 * option A « par typologie »).
 *
 * Les ventes DVF autour de l'immeuble donnent, typologie par typologie, un
 * prix au m² du quartier ; chaque vente se montre avec sa façade (Street View,
 * à l'écran seulement) et l'année de construction de son immeuble (BDNB),
 * pour écarter ce qui n'a pas notre standing. Le calcul se refait aussitôt et
 * les réglages restent sur la fiche.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { BienData } from "@/lib/bubble/server";
import {
  AJUSTEMENT_MAX, AJUSTEMENTS, calculerEtude, MINIMUM_REFS, REGLAGES_VIDES, TOLERANCE_SURFACE,
  type CleAjustement, type CleTypo, type EtatRef, type Forfait, type GroupeTypo, type LotEvalue, type ReglagesEtude,
} from "@/lib/bo/etude-decoupe";
import { etageDeLot } from "@/lib/bo/etages";
import type { DonneesEtude } from "@/lib/bo/etude-decoupe-serveur";
import { enregistrerReglagesEtude } from "@/lib/bo/etude-decoupe-actions";
import { updateBien } from "@/lib/bo/actions";

const fmt = (n?: number) => (n === undefined || !Number.isFinite(n) ? "—" : Math.round(n).toLocaleString("fr-FR").replace(/ /g, " "));
const eur = (n?: number) => (n === undefined || !Number.isFinite(n) || n === 0 ? "—" : `${fmt(n)} €`);
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const moisAnnee = (d: string) => `${MOIS[Number(d.slice(5, 7)) - 1] ?? ""} ${d.slice(0, 4)}`;
const jma = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const titre = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Du|Des|La|Le|Les|Et|D|L)\b/g, (m) => m.toLowerCase());
/** L'écart d'époque au-delà duquel un immeuble est dit « d'une autre époque ». */
const ECART_EPOQUE = 20;

type Donnees = Extract<DonneesEtude, { ok: true }>;

const LIBELLE_ETAT: Record<EtatRef, string> = {
  retenue: "retenue", exclue: "écartée", immeuble_exclu: "immeuble écarté", hors_marche: "hors marché",
};

export function EtudeDecoupe({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reglages, setReglages] = useState<ReglagesEtude>(REGLAGES_VIDES);
  const [ouvert, setOuvert] = useState<CleTypo | null>(null);
  const [vue, setVue] = useState<"liste" | "facades">("liste");
  const [annee, setAnnee] = useState<number | undefined>(typeof b.im.year_constru === "number" ? b.im.year_constru : undefined);
  const charge = useRef(false);

  useEffect(() => {
    let vivant = true;
    fetch(`/api/etude-decoupe?immeuble=${encodeURIComponent(immeubleId)}`)
      .then((r) => r.json() as Promise<DonneesEtude>)
      .then((d) => {
        if (!vivant) return;
        if (!d.ok) { setErreur(d.raison); return; }
        setDonnees(d);
        setReglages(d.reglages);
        charge.current = true;
      })
      .catch(() => { if (vivant) setErreur("Les ventes DVF n'ont pas pu être chargées. Réessayez dans un instant."); });
    return () => { vivant = false; };
  }, [immeubleId]);

  /* Les réglages s'enregistrent d'eux-mêmes, une seconde après le dernier geste. */
  const [enregistre, setEnregistre] = useState<"ok" | "en_cours" | "erreur">("ok");
  const premier = useRef(true);
  useEffect(() => {
    if (!charge.current) return;
    if (premier.current) { premier.current = false; return; }
    setEnregistre("en_cours");
    const t = setTimeout(() => {
      enregistrerReglagesEtude(immeubleId, reglages)
        .then((r) => setEnregistre(r.ok ? "ok" : "erreur"))
        .catch(() => setEnregistre("erreur"));
    }, 900);
    return () => clearTimeout(t);
  }, [reglages, immeubleId]);

  const etude = useMemo(
    () => (donnees ? calculerEtude(b.lots, donnees.ventes, donnees.finDonnees, reglages) : null),
    [donnees, b.lots, reglages],
  );

  if (erreur) return <div className="etd-vide">{erreur}</div>;
  if (!donnees || !etude) {
    return <div className="etd-vide">Recherche des ventes DVF autour de l&apos;immeuble… (la première fois sur une commune, quelques secondes)</div>;
  }

  const anneeBdnb = donnees.immeuble.annee;
  const anneeRef = annee ?? anneeBdnb;
  const prixBloc = typeof b.im.prix_hai === "number" ? (b.im.prix_hai as number) : undefined;

  const maj = (f: (r: ReglagesEtude) => ReglagesEtude) => setReglages((r) => f(r));
  const ecarterVente = (id: string, motif = "écartée") => maj((r) => ({ ...r, ventesExclues: { ...r.ventesExclues, [id]: motif }, reprises: r.reprises.filter((x) => x !== id) }));
  const ecarterImmeuble = (cle: string, motif = "standing") => maj((r) => ({ ...r, immeublesExclus: { ...r.immeublesExclus, [cle]: motif } }));
  const reprendre = (ref: { id: string; cleAdresse: string; etat: EtatRef }) => maj((r) => {
    const ventesExclues = { ...r.ventesExclues }; delete ventesExclues[ref.id];
    const immeublesExclus = { ...r.immeublesExclus };
    if (ref.etat === "immeuble_exclu") delete immeublesExclus[ref.cleAdresse];
    const reprises = ref.etat === "hors_marche" ? [...new Set([...r.reprises, ref.id])] : r.reprises;
    return { ...r, ventesExclues, immeublesExclus, reprises };
  });
  const setRendement = (cle: CleTypo, v: string) => maj((r) => {
    const n = Number(v.replace(",", "."));
    const rendements = { ...r.rendements };
    if (Number.isFinite(n) && n > 0) rendements[cle] = n; else delete rendements[cle];
    return { ...r, rendements };
  });
  const setForfait = (f: Forfait, v: string) => maj((r) => {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    const forfaits = { ...r.forfaits };
    if (Number.isFinite(n) && n > 0) forfaits[f] = n; else delete forfaits[f];
    return { ...r, forfaits };
  });

  const setAjustement = (id: string, cle: CleAjustement | "note", v: string) => maj((r) => {
    const lots = { ...(r.lots ?? {}) };
    const a = { ...(lots[id] ?? {}) };
    if (cle === "note") {
      if (v.trim()) a.note = v.trim().slice(0, 120); else delete a.note;
    } else {
      const n = Number(v.replace(/[−–]/g, "-").replace(/[\s%+]/g, "").replace(",", "."));
      if (Number.isFinite(n) && n !== 0) a[cle] = Math.max(-AJUSTEMENT_MAX, Math.min(AJUSTEMENT_MAX, n)); else delete a[cle];
    }
    if (Object.keys(a).length) lots[id] = a; else delete lots[id];
    return { ...r, lots };
  });

  /* Le prix que l'agent retient se saisit dans l'état locatif, vue Valeurs. */
  const prixRetenus = b.lots.reduce<{ n: number; total: number }>((t, l) => {
    const v = typeof l.prix_retenu === "number" ? l.prix_retenu : 0;
    return v > 0 ? { n: t.n + 1, total: t.total + v } : t;
  }, { n: 0, total: 0 });

  const ecart = prixBloc && etude.totalLibre ? Math.round(((etude.totalLibre - prixBloc) / prixBloc) * 100) : undefined;

  return (
    <div className="etd">
      <div className="etd-params">
        <span className="etd-chip">Rayon <b>300 m</b> au départ, 600 m au plus</span>
        <span className="etd-chip">Ventes des <b>6 derniers mois</b>, 12 au plus</span>
        <span className="etd-chip">Surface des lots <b>± {Math.round(TOLERANCE_SURFACE * 100)} %</b></span>
        <span className="etd-chip">Annexes vendues avec : <b>gardées, signalées</b></span>
        <span className="etd-aide">Ventes DVF publiées jusqu&apos;au {jma(donnees.finDonnees)}</span>
        <span className={`etd-sauve ${enregistre}`}>{enregistre === "en_cours" ? "Enregistrement…" : enregistre === "erreur" ? "Réglages non enregistrés" : "Réglages enregistrés"}</span>
      </div>

      <div className="etd-immeuble">
        <span>Cet immeuble : {anneeRef ? <>construit en <b>{anneeRef}</b>{annee ? " (fiche)" : " (BDNB)"}</> : "année de construction inconnue"}
          {annee && anneeBdnb && anneeBdnb !== annee ? <> · <b>{anneeBdnb}</b> selon la BDNB</> : null}
          {donnees.immeuble.logements ? <> · {donnees.immeuble.logements} logements selon la BDNB</> : null}</span>
        {!annee && anneeBdnb ? (
          <button type="button" className="fadd" onClick={() => { updateBien(immeubleId, { year_constru: anneeBdnb }).then(() => setAnnee(anneeBdnb)); }}>
            Reporter {anneeBdnb} sur la fiche
          </button>
        ) : null}
      </div>

      <div className="etd-tz">
        <table className="etd-t">
          <thead>
            <tr>
              <th>Typologie</th><th className="r">Lots</th><th className="r">Surface</th><th className="r">Réfs</th>
              <th className="r">Prix m² (médiane)</th><th>Q1 – Q3</th><th className="r">Valeur libre</th>
              <th className="r" title="Loyers en cours / valeur libre des lots loués">Rdt constaté</th>
              <th className="r" title="Rendement type d'un lot loué : valeur occupée = loyer annuel / rendement">Rdt type</th>
              <th className="r">Valeur occupée</th>
            </tr>
          </thead>
          <tbody>
            {etude.groupes.map((x) => (
              <Fragment key={x.cle}>
                <LigneTypo g={x} ouvert={ouvert === x.cle}
                  onOuvrir={() => setOuvert(ouvert === x.cle ? null : x.cle)}
                  onRendement={(v) => setRendement(x.cle, v)} />
                {ouvert === x.cle && (
                  <tr className="etd-sous"><td colSpan={10}>
                    <DetailTypo g={x} vue={vue} setVue={setVue} donnees={donnees} anneeRef={anneeRef}
                      onEcarterVente={ecarterVente} onEcarterImmeuble={ecarterImmeuble} onReprendre={reprendre}
                      onFermer={() => setOuvert(null)} />
                  </td></tr>
                )}
              </Fragment>
            ))}
            {etude.forfaits.map((f) => (
              <tr key={f.forfait} className="etd-forfait">
                <td><span className="etd-typo">{f.forfait === "Parking" ? "Parkings" : "Caves"}</span></td>
                <td className="r">{f.lots}</td><td className="r">—</td><td className="r">—</td>
                <td className="r" colSpan={2}>
                  <label className="etd-saisie">
                    <input inputMode="numeric" defaultValue={f.prixUnite ? String(f.prixUnite) : ""} placeholder="prix à l'unité"
                      onBlur={(e) => setForfait(f.forfait, e.target.value)} /> € l&apos;unité
                  </label>
                  <span className="etd-aide" title="DVF ne distingue pas les caves des parkings : le prix se saisit"> saisi</span>
                </td>
                <td className="r">{eur(f.valeur)}</td><td /><td /><td className="r">{eur(f.valeur)}</td>
              </tr>
            ))}
            <tr className="etd-tot">
              <td>Total</td>
              <td className="r">{etude.groupes.reduce((t, x) => t + x.lots.length, 0) + etude.forfaits.reduce((t, f) => t + f.lots, 0)}</td>
              <td className="r">{fmt(etude.groupes.reduce((t, x) => t + x.surfaceLots, 0))} m²</td>
              <td className="r">{etude.refsRetenues}</td><td /><td />
              <td className="r">{eur(etude.totalLibre)}</td><td /><td />
              <td className="r">{eur(etude.totalOccupe)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {etude.nonChiffres.length > 0 && (
        <p className="etd-aide">{etude.nonChiffres.length} lot{etude.nonChiffres.length > 1 ? "s" : ""} sans destination chiffrable (annexes, destination vide) : hors du calcul.</p>
      )}

      <EvaluationLots lots={etude.lots} onAjuster={setAjustement} />

      <div className="etd-resume">
        <div className="or"><span>Valeur découpe, libre</span><b>{eur(etude.totalLibre)}</b></div>
        <div><span>Valeur découpe, occupée</span><b>{eur(etude.totalOccupe)}</b></div>
        <div><span>Prix HAI retenus (état locatif, vue Valeurs)</span><b>{prixRetenus.n ? eur(prixRetenus.total) : "—"}</b>
          {prixRetenus.n ? <span>{prixRetenus.n} lot{prixRetenus.n > 1 ? "s" : ""} sur {b.lots.length}</span> : null}</div>
        <div><span>Prix du bloc (fiche, HAI)</span><b>{eur(prixBloc)}</b></div>
        <div><span>Écart découpe libre / bloc</span><b>{ecart === undefined ? "—" : `${ecart > 0 ? "+" : ""}${ecart} %`}</b></div>
        <div><span>Références écartées</span><b>{etude.refsEcartees} sur {etude.refsRetenues + etude.refsEcartees}</b></div>
      </div>

      <p className="etd-source">
        Sources : DVF géolocalisé (data.gouv.fr), ventes d&apos;un seul local · années de construction : BDNB ·
        façades : Street View, à l&apos;écran seulement (pas dans un dossier ni une annonce).
      </p>
    </div>
  );
}

function LigneTypo({ g, ouvert, onOuvrir, onRendement }: {
  g: GroupeTypo; ouvert: boolean; onOuvrir: () => void; onRendement: (v: string) => void;
}) {
  const elargi = g.palier.rayon > 300 || g.palier.mois > 6;
  const pos = (v?: number) => (v && g.q1 && g.q3 && g.q3 > g.q1 ? Math.max(0, Math.min(100, ((v - g.q1 * 0.85) / (g.q3 * 1.15 - g.q1 * 0.85)) * 100)) : 50);
  return (
    <tr className={`etd-ligne${ouvert ? " on" : ""}`} onClick={onOuvrir}>
      <td><span className="etd-chev">{ouvert ? "▾" : "▸"}</span><span className="etd-typo">{g.libelle}</span></td>
      <td className="r">{g.lots.length}</td>
      <td className="r">{fmt(g.surfaceLots)} m²</td>
      <td className="r">
        <b className={g.retenues < 3 ? "etd-peu" : undefined}>{g.retenues}</b>
        <span className="etd-aide" title={elargi ? "Élargi : pas assez de ventes plus près ou plus récentes" : undefined}> · {g.palier.rayon} m, {g.palier.mois} mois{elargi ? " ↗" : ""}</span>
      </td>
      <td className="r"><b>{eur(g.medianeM2)}</b></td>
      <td>{g.q1 ? <>{fmt(g.q1)} – {fmt(g.q3)} €<span className="etd-fourch"><i style={{ left: `${pos(g.q1)}%`, width: `${Math.max(2, pos(g.q3) - pos(g.q1))}%` }} /><b style={{ left: `${pos(g.medianeM2)}%` }} /></span></> : "—"}</td>
      <td className="r"><b>{eur(g.valeurLibre)}</b></td>
      <td className="r">{g.rendementConstate ? `${String(g.rendementConstate).replace(".", ",")} %` : "—"}</td>
      <td className="r" onClick={(e) => e.stopPropagation()}>
        <label className="etd-saisie petit">
          <input inputMode="decimal" defaultValue={g.rendementType ? String(g.rendementType).replace(".", ",") : ""}
            placeholder={g.rendementConstate ? String(g.rendementConstate).replace(".", ",") : "—"}
            onBlur={(e) => onRendement(e.target.value)} /> %
        </label>
      </td>
      <td className="r">{eur(g.valeurOccupee)}</td>
    </tr>
  );
}

function DetailTypo({ g, vue, setVue, donnees, anneeRef, onEcarterVente, onEcarterImmeuble, onReprendre, onFermer }: {
  g: GroupeTypo;
  vue: "liste" | "facades";
  setVue: (v: "liste" | "facades") => void;
  donnees: Donnees;
  anneeRef?: number;
  onEcarterVente: (id: string, motif?: string) => void;
  onEcarterImmeuble: (cle: string, motif?: string) => void;
  onReprendre: (r: { id: string; cleAdresse: string; etat: EtatRef }) => void;
  onFermer: () => void;
}) {
  const annee = (cle: string) => donnees.batiments[cle]?.annee;
  const autreEpoque = (cle: string) => {
    const a = annee(cle);
    return !!(anneeRef && a && Math.abs(a - anneeRef) > ECART_EPOQUE);
  };
  const aEcarterEpoque = [...new Set(g.refs.filter((r) => r.etat === "retenue" && r.cleAdresse && autreEpoque(r.cleAdresse)).map((r) => r.cleAdresse))];
  const facade = (lat: number, lon: number) => `/api/facade-dvf?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
  const elargi = g.palier.rayon > 300 || g.palier.mois > 6;
  const typeTxt = g.cle === "L" ? "locaux (commerce, bureau, activité)" : g.libelle;
  /* La vue « façades » regroupe les ventes par immeuble. */
  const parImmeuble = useMemo(() => {
    const m = new Map<string, typeof g.refs>();
    for (const r of g.refs) {
      const k = r.cleAdresse || `${r.numero} ${r.voie}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [g]);

  return (
    <section className="etd-detail" aria-label={`Références ${g.libelle}`}>
      <header>
        <h4>{g.libelle} · {g.refs.length} vente{g.refs.length > 1 ? "s" : ""}, {g.retenues} retenue{g.retenues > 1 ? "s" : ""}</h4>
        <span className="etd-aide">
          {typeTxt}, {g.surfaceMin} à {g.surfaceMax} m², à moins de {g.palier.rayon} m, sur {g.palier.mois} mois
          {elargi ? ` (élargi : moins de ${MINIMUM_REFS} ventes plus près ou plus récentes)` : ""}
        </span>
        <div className="etd-vues">
          <button type="button" className={vue === "liste" ? "on" : ""} onClick={() => setVue("liste")}>Liste</button>
          <button type="button" className={vue === "facades" ? "on" : ""} onClick={() => setVue("facades")}>Façades</button>
        </div>
        {aEcarterEpoque.length > 0 && (
          <button type="button" className="fadd" onClick={() => aEcarterEpoque.forEach((c) => onEcarterImmeuble(c, "époque"))}>
            Écarter les {aEcarterEpoque.length} immeuble{aEcarterEpoque.length > 1 ? "s" : ""} d&apos;une autre époque (± {ECART_EPOQUE} ans de {anneeRef})
          </button>
        )}
        <button type="button" className="etd-x" onClick={onFermer} aria-label="Fermer le détail">✕</button>
      </header>
      {g.retenues < 3 && <p className="etd-alerte">Peu de références : le prix au m² de cette typologie est à confirmer.</p>}

      {vue === "liste" ? (
        <div className="etd-tz">
          <table className="etd-t etd-refs">
            <thead><tr><th>Façade</th><th>Vente</th><th>Adresse</th><th>Époque</th><th className="r">Dist.</th><th className="r">Surface</th><th className="r">Prix</th><th className="r">€/m²</th><th>État</th><th /></tr></thead>
            <tbody>
              {g.refs.map((r) => {
                const a = annee(r.cleAdresse);
                const retenue = r.etat === "retenue";
                const meme = r.cleAdresse && r.cleAdresse === donnees.immeuble.cleAdresse;
                return (
                  <tr key={r.id} className={retenue ? "" : "etd-exclue"}>
                    <td><a href={facade(r.lat, r.lon)} target="_blank" rel="noreferrer" className="etd-ph"><Facade src={facade(r.lat, r.lon)} /></a></td>
                    <td>{moisAnnee(r.date)}</td>
                    <td>
                      {r.numero} {titre(r.voie)}
                      {r.insee !== donnees.communes[0] ? <span className="etd-aide"> · {r.commune}</span> : null}
                      {meme ? <span className="etd-badge or">même adresse</span> : null}
                      {r.annexes > 0 ? <span className="etd-badge orange" title="Le prix comprend des annexes vendues avec (cave, parking…)">+ {r.annexes} annexe{r.annexes > 1 ? "s" : ""}</span> : null}
                    </td>
                    <td>{a ? <span className={`etd-annee${autreEpoque(r.cleAdresse) ? " autre" : ""}`}>{a}</span> : <span className="etd-aide">inconnue</span>}</td>
                    <td className="r">{r.distance} m</td>
                    <td className="r">{fmt(r.surface)} m²{r.carrez ? <span className="etd-aide"> ({String(r.carrez).replace(".", ",")})</span> : null}</td>
                    <td className="r">{eur(r.prix)}</td>
                    <td className="r"><b>{fmt(r.prixM2)} €</b></td>
                    <td><span className={`etd-etat ${r.etat}`}>{LIBELLE_ETAT[r.etat]}{r.motif && r.motif !== "écartée" ? ` · ${r.motif}` : ""}</span></td>
                    <td className="etd-gestes">
                      {retenue ? (
                        <>
                          <button type="button" className="etd-bt rouge" onClick={() => onEcarterVente(r.id)}>Écarter</button>
                          {r.cleAdresse ? <button type="button" className="etd-bt" onClick={() => onEcarterImmeuble(r.cleAdresse)} title="Écarte toutes les ventes de cet immeuble">L&apos;immeuble</button> : null}
                        </>
                      ) : (
                        <button type="button" className="etd-bt vert" onClick={() => onReprendre(r)}>Reprendre</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="etd-galerie">
          {parImmeuble.map(([cle, refs]) => {
            const r0 = refs[0];
            const exclu = refs.every((r) => r.etat === "immeuble_exclu");
            const prix = refs.map((r) => r.prixM2);
            const a = annee(cle);
            return (
              <div key={cle} className={`etd-carte${exclu ? " exclue" : ""}`}>
                <a href={facade(r0.lat, r0.lon)} target="_blank" rel="noreferrer" className="etd-ph grand"><Facade src={facade(r0.lat, r0.lon)} /></a>
                <div className="c">
                  <b>{r0.numero} {titre(r0.voie)}</b>
                  <span className="etd-aide">
                    {r0.distance} m · {a ? <span className={autreEpoque(cle) ? "etd-annee autre" : "etd-annee"}>{a}</span> : "année inconnue"} ·{" "}
                    {refs.length} vente{refs.length > 1 ? "s" : ""} · {fmt(Math.min(...prix))}{prix.length > 1 ? `–${fmt(Math.max(...prix))}` : ""} €/m²
                  </span>
                  {exclu ? (
                    <button type="button" className="etd-bt vert" onClick={() => onReprendre({ id: r0.id, cleAdresse: cle, etat: "immeuble_exclu" })}>Reprendre l&apos;immeuble</button>
                  ) : cle.includes("_") ? (
                    <button type="button" className="etd-bt rouge" onClick={() => onEcarterImmeuble(cle)}>Écarter l&apos;immeuble</button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const ETAT_LOT: Record<string, string> = {
  Neuf: "Neuf", Renove: "Rénové", "Bon etat": "Bon état", "Etat d'usage": "État d'usage", Travaux: "À rénover",
};
const etageTxt = (v: unknown) => {
  const n = etageDeLot(v);
  if (n === undefined) return typeof v === "string" && v.trim() ? v.trim() : undefined;
  return n === 0 ? "RDC" : n === 1 ? "1er" : `${n}e`;
};
/** « 12 à 20, 31 » : des numéros de lots en plages. */
const plages = (nums: number[]) => {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i + 1 ? `${s[i]} à ${s[j]}` : j === i + 1 ? `${s[i]}, ${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(", ");
};
const pctTxt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${String(Math.abs(n)).replace(".", ",")} %`;

/**
 * Chaque lot évalué (MAV, 15/11) : la prédiction tirée de l'état locatif
 * (surface × prix au m² du secteur), que l'agent ajuste selon l'étage, l'état,
 * l'extérieur… Un local commercial loué s'évalue au rendement, comparé au prix
 * au m² du secteur.
 */
function EvaluationLots({ lots, onAjuster }: {
  lots: LotEvalue[];
  onAjuster: (id: string, cle: CleAjustement | "note", v: string) => void;
}) {
  const total = (f: (l: LotEvalue) => number) => lots.reduce((t, l) => t + f(l), 0);
  const prediction = total((l) => (l.methode === "m2" ? l.prediction : 0));
  const ajuste = total((l) => (l.methode === "m2" ? l.valeurLibre : 0));
  /* Les caves et les parkings tiennent sur une ligne chacun : un par lot noyait le tableau. */
  const forfaits = (["Parking", "Cave"] as const).map((forfait) => {
    const ls = lots.filter((l) => l.forfait === forfait);
    return { forfait, nums: ls.map((l) => Number(l.lot.numero)).filter(Number.isFinite), valeur: ls.reduce((t, l) => t + l.valeurLibre, 0), n: ls.length };
  }).filter((f) => f.n > 0);
  return (
    <section className="etd-lots" aria-label="Évaluation lot par lot">
      <header>
        <h4>Évaluation lot par lot</h4>
        <span className="etd-aide">
          Prédiction = surface × prix au m² du secteur (médiane de sa typologie). Ajustez chaque lot en % ;
          un local commercial loué s&apos;évalue au rendement saisi sur la ligne Locaux.
          Le prix que vous retenez se saisit dans l&apos;état locatif, vue « Valeurs ».
        </span>
        {ajuste !== prediction && (
          <span className="etd-chip">Ajustements : <b>{ajuste > prediction ? "+" : "−"}{eur(Math.abs(ajuste - prediction))}</b></span>
        )}
      </header>
      <div className="etd-tz">
        <table className="etd-t etd-lots-t">
          <thead>
            <tr>
              <th>Lot</th><th className="r">Surface</th><th className="r">€/m² secteur</th><th className="r">Prédiction</th>
              {AJUSTEMENTS.map((a) => <th key={a.cle} className="r" title={a.aide}>{a.libelle} %</th>)}
              <th>Note</th><th className="r">€/m² retenu</th><th className="r">Valeur libre</th><th className="r">Valeur occupée</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l, i) => {
              if (l.methode === "forfait") return null;
              const num = l.lot.numero ?? i + 1;
              const etage = etageTxt(l.lot.etage);
              const etat = ETAT_LOT[String(l.lot.Etat ?? "")];
              const type = String(l.lot.Type_lot ?? "") || l.libelle;
              return (
                <tr key={l.id} className={l.methode === "aucune" ? "etd-exclue" : undefined}>
                  <td className="etd-lot">
                    <b>Lot {String(num)}</b> <span>{type}</span>
                    <span className="etd-aide">{[etage, etat, l.loyerAnnuel > 0 ? "loué" : l.methode === "m2" || l.methode === "rendement" ? "libre" : null].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="r">{l.surface ? `${fmt(l.surface)} m²` : "—"}</td>
                  <td className="r">{l.prixM2Secteur ? `${fmt(l.prixM2Secteur)} €` : "—"}</td>
                  <td className="r">{eur(l.prediction)}</td>
                  {l.methode === "m2" ? (
                    <>
                      {AJUSTEMENTS.map((a) => {
                        const v = l.ajustements[a.cle];
                        return (
                          <td key={a.cle} className="r">
                            <label className={`etd-saisie pct${v ? (v > 0 ? " plus" : " moins") : ""}`} title={a.aide}>
                              <input key={String(v ?? "")} inputMode="decimal" defaultValue={v ? String(v).replace(".", ",") : ""} placeholder="0"
                                aria-label={`${a.libelle}, lot ${String(num)}, en %`}
                                onBlur={(e) => onAjuster(l.id, a.cle, e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                            </label>
                          </td>
                        );
                      })}
                      <td>
                        <input className="etd-note" key={l.ajustements.note ?? ""} defaultValue={l.ajustements.note ?? ""} placeholder="balcon, vue…"
                          aria-label={`Note, lot ${String(num)}`} onBlur={(e) => onAjuster(l.id, "note", e.target.value)} />
                      </td>
                    </>
                  ) : (
                    <td colSpan={AJUSTEMENTS.length + 1} className="etd-methode">
                      {l.methode === "rendement" ? (
                        <>Au rendement : {eur(l.loyerAnnuel)} de loyer par an à {String(l.rendement).replace(".", ",")} %
                          {l.ecartSecteur !== undefined ? <> · <b className={l.ecartSecteur < 0 ? "moins" : "plus"}>{pctTxt(l.ecartSecteur)}</b> sur le prix du secteur</> : null}</>
                      ) : l.cle ? "Pas de prix au m² pour cette typologie" : "Non chiffré (annexe, destination vide)"}
                    </td>
                  )}
                  <td className="r">
                    {l.prixM2Retenu ? `${fmt(l.prixM2Retenu)} €` : "—"}
                    {l.methode === "m2" && l.ajustementPct ? <span className={`etd-aide ${l.ajustementPct > 0 ? "plus" : "moins"}`}> {pctTxt(l.ajustementPct)}</span> : null}
                  </td>
                  <td className="r"><b>{eur(l.valeurLibre)}</b></td>
                  <td className="r" title={l.loyerAnnuel > 0 && l.methode === "m2" ? (l.rendement ? `Loyer ${fmt(l.loyerAnnuel)} €/an à ${l.rendement} %` : "Rendement type à saisir sur la ligne de la typologie") : undefined}>
                    {eur(l.valeurOccupee)}
                  </td>
                </tr>
              );
            })}
            {forfaits.map(({ forfait, nums, valeur }) => (
              <tr key={forfait}>
                <td className="etd-lot"><b>{nums.length} {forfait === "Parking" ? "parking" : "cave"}{nums.length > 1 ? "s" : ""}</b>
                  <span className="etd-aide">lot{nums.length > 1 ? "s" : ""} {plages(nums)}</span></td>
                <td className="r">—</td><td className="r">—</td><td className="r">—</td>
                <td colSpan={AJUSTEMENTS.length + 1} className="etd-methode">
                  Au forfait, à l&apos;unité{valeur ? "" : " (prix à saisir sur la ligne " + (forfait === "Parking" ? "Parkings" : "Caves") + " plus haut)"}
                </td>
                <td className="r">—</td><td className="r"><b>{eur(valeur)}</b></td><td className="r">{eur(valeur)}</td>
              </tr>
            ))}
            <tr className="etd-tot">
              <td>Total</td>
              <td className="r">{fmt(total((l) => (l.methode === "forfait" ? 0 : l.surface)))} m²</td>
              <td />
              <td className="r">{eur(total((l) => l.prediction))}</td>
              <td colSpan={AJUSTEMENTS.length + 1} />
              <td />
              <td className="r">{eur(total((l) => l.valeurLibre))}</td>
              <td className="r">{eur(total((l) => l.valeurOccupee))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** La façade, ou une case qui dit qu'il n'y en a pas. */
function Facade({ src }: { src: string }) {
  const [ko, setKo] = useState(false);
  if (ko) return <span className="etd-ph-vide">Pas de vue de rue</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Façade (Street View)" loading="lazy" onError={() => setKo(true)} />;
}
