"use client";

/* Écran Prospection — aller chercher l'offre au lieu de l'attendre.
 *
 * On cherche des IMMEUBLES DÉTENUS PAR UNE SOCIÉTÉ ET PAS EN COPROPRIÉTÉ : la
 * définition même d'une cible de découpe. Les critères sont ceux avec lesquels
 * on prospecte pour de vrai — un secteur, une rue, une taille d'immeuble, une
 * forme de société — pas ceux que la base sait faire.
 *
 * La sortie compte autant que la recherche : une liste qu'on ne peut pas
 * envoyer ne sert à rien. L'export ajoute le siège social de chaque société,
 * c'est-à-dire l'adresse à laquelle on écrit.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import {
  chercherCibles, chercherCommunes, exporterCibles,
  type Cible, type CritèresProspection,
} from "@/lib/bo/prospection-actions";

const FORMES = ["SCI", "SC", "SARL", "SAS", "SASU", "SNC", "SA", "SCPI"];

/* Les fourchettes qui correspondent à des affaires réelles.
 *
 * Le plafond compte autant que le plancher : au-dessus de cent locaux à une
 * seule adresse, on n'est plus sur un immeuble de rapport mais sur une
 * résidence de bailleur institutionnel ou une tour de bureaux — jamais une
 * découpe. C'est ce qui remontait en tête de liste sans lui. */
const TAILLES = [
  { label: "4 à 12 lots — petit immeuble", min: 4, max: 12 },
  { label: "6 à 30 lots — cœur de cible", min: 6, max: 30 },
  { label: "10 à 60 lots — gros immeuble", min: 10, max: 60 },
  { label: "4 lots et plus, sans plafond", min: 4, max: 0 },
];

export function Prospection() {
  const [commune, setCommune] = useState<{ insee: string; nom: string } | null>(null);
  const [qCommune, setQCommune] = useState("");
  const [suggestions, setSuggestions] = useState<{ insee: string; nom: string; dep: string }[]>([]);
  const [dep, setDep] = useState("");
  const [voie, setVoie] = useState("");
  const [taille, setTaille] = useState(1);
  const [formes, setFormes] = useState<string[]>([]);
  const [societe, setSociete] = useState("");

  const [lignes, setLignes] = useState<Cible[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [cherche, setCherche] = useState(false);
  const [lance, setLance] = useState(false);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [export_, setExport] = useState<string | null>(null);
  const zone = useRef<HTMLDivElement>(null);

  const criteres = (p = 0): CritèresProspection => ({
    commune: commune?.insee,
    departement: commune ? undefined : dep.trim() || undefined,
    voie: voie.trim() || undefined,
    min: TAILLES[taille].min || undefined,
    max: TAILLES[taille].max || undefined,
    formes: formes.length ? formes : undefined,
    societe: societe.trim() || undefined,
    page: p,
  });

  const lancer = (p = 0) => {
    setCherche(true);
    setLance(true);
    setErreur(null);
    chercherCibles(criteres(p))
      .then((r) => {
        if (!r.ok) { setErreur(r.erreur); setLignes([]); setTotal(0); return; }
        setLignes(r.lignes);
        setTotal(r.total);
        setPage(r.page);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => setCherche(false));
  };

  /* Suggestions de communes : on tape « Bordeaux », pas « 33063 ». */
  useEffect(() => {
    const t = qCommune.trim();
    const timer = setTimeout(() => {
      if (t.length < 2 || commune) { setSuggestions([]); return; }
      chercherCommunes(t).then(setSuggestions).catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [qCommune, commune]);

  useEffect(() => {
    const dehors = (e: MouseEvent) => {
      if (zone.current && !zone.current.contains(e.target as Node)) setSuggestions([]);
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, []);

  const exporter = (avecSiege: boolean) =>
    start(async () => {
      setExport(null);
      const r = await exporterCibles(criteres(0), avecSiege).catch(() => null);
      if (!r || !r.ok) { setExport(r?.erreur ?? "Export impossible."); return; }
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prospection-${commune?.nom ?? dep ?? "france"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      const s = r.lignes > 1 ? "s" : "";
      setExport(
        `${r.lignes} immeuble${s} exporté${s}`
        + (avecSiege
          ? ` — ${r.sieges} adresse${r.sieges > 1 ? "s" : ""} de siège social retrouvée${r.sieges > 1 ? "s" : ""}.`
          : ".")
        + (r.manquants > 0
          ? ` ${r.manquants} société${r.manquants > 1 ? "s n'ont" : " n'a"} pas pu être interrogée${r.manquants > 1 ? "s" : ""} cette fois : relancez l'export, celles déjà trouvées ne seront pas redemandées.`
          : ""),
      );
    });

  const basculer = (cle: string) =>
    setChoisis((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle); else n.add(cle);
      return n;
    });

  const pages = Math.ceil(total / 50);

  return (
    <div className="pro">
      {/* ------------------------------------------------ les critères --- */}
      <div className="pro-filtres" ref={zone}>
        {/* Volontairement un div, pas un label : un bouton dans un label
            renvoie le clic au champ qu'il étiquette, et la commune choisie
            était annulée dans la foulée par la croix qui venait d'apparaître. */}
        <div className="pro-ch lg">
          <span>Commune</span>
          {commune ? (
            <span className="pro-puce">
              {commune.nom}
              <button type="button" title="Changer de commune"
                onClick={() => { setCommune(null); setQCommune(""); }}>✕</button>
            </span>
          ) : (
            <input value={qCommune} onChange={(e) => setQCommune(e.target.value)}
              placeholder="Bordeaux, Nanterre, Paris 11e…" />
          )}
          {suggestions.length > 0 && !commune && (
            <div className="pro-sugg">
              {suggestions.map((c) => (
                <button key={c.insee} type="button"
                  onClick={() => { setCommune({ insee: c.insee, nom: c.nom }); setSuggestions([]); }}>
                  <b>{c.nom}</b><i>{c.dep}</i>
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="pro-ch">
          <span>ou département</span>
          <input value={dep} onChange={(e) => setDep(e.target.value)} disabled={!!commune}
            placeholder="33, 92, 75…" inputMode="numeric" maxLength={3} />
        </label>

        <label className="pro-ch lg">
          <span>Rue</span>
          <input value={voie} onChange={(e) => setVoie(e.target.value)}
            placeholder="Victor Hugo — sans « rue » ni « avenue »" />
        </label>

        <label className="pro-ch lg">
          <span>Taille de l&apos;immeuble</span>
          <select value={taille} onChange={(e) => setTaille(Number(e.target.value))}>
            {TAILLES.map((t, i) => <option key={t.label} value={i}>{t.label}</option>)}
          </select>
        </label>

        <label className="pro-ch lg">
          <span>Société (nom ou SIREN)</span>
          <input value={societe} onChange={(e) => setSociete(e.target.value)}
            placeholder="SCI DU MOULIN, 520382656…" />
        </label>

        <div className="pro-ch lg">
          <span>Forme juridique</span>
          <div className="pro-formes">
            {FORMES.map((f) => (
              <button key={f} type="button" className={formes.includes(f) ? "on" : ""}
                onClick={() => setFormes((v) => v.includes(f) ? v.filter((x) => x !== f) : [...v, f])}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="pro-go">
          <button type="button" className="savebar-go" disabled={cherche} onClick={() => lancer(0)}>
            <span className="ch">›</span> {cherche ? "Recherche…" : "Chercher"}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------- résultats --- */}
      {erreur && <div className="warnbox">{erreur}</div>}

      {lance && !erreur && (
        <div className="pro-barre">
          <b>{total.toLocaleString("fr-FR")}</b>
          <span>
            immeuble{total > 1 ? "s" : ""} détenu{total > 1 ? "s" : ""} par une société, hors copropriété
          </span>
          <span style={{ flex: 1 }} />
          {choisis.size > 0 && <span className="pro-sel">{choisis.size} sélectionné{choisis.size > 1 ? "s" : ""}</span>}
          <button type="button" className="fadd" disabled={pending || total === 0}
            onClick={() => exporter(false)}>
            {pending ? "Export en cours…" : "Exporter la liste"}
          </button>
          {/* Le publipostage : c'est le siège social qui fait la différence
              entre un tableau et une pile d'enveloppes. Il se paie en attente,
              d'où le second bouton. */}
          <button type="button" className="fadd" disabled={pending || total === 0}
            title="Ajoute l'adresse du siège de chaque société — plus long, mais prêt à poster"
            onClick={() => exporter(true)}>
            {pending ? "…" : "Exporter pour un courrier"}
          </button>
        </div>
      )}
      {export_ && <div className="pro-ok">{export_}</div>}

      {lignes.length > 0 && (
        <div className="pro-tab">
          <table>
            <thead>
              <tr>
                <th />
                <th>Immeuble</th>
                <th>Commune</th>
                <th className="n">Locaux</th>
                <th>Société propriétaire</th>
                <th>SIREN</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const cle = `${l.insee}|${l.adresse}|${l.siren}`;
                return (
                  <tr key={cle} className={choisis.has(cle) ? "on" : ""}>
                    <td>
                      <input type="checkbox" checked={choisis.has(cle)} onChange={() => basculer(cle)} />
                    </td>
                    <td><b>{l.adresse}</b></td>
                    <td>{l.commune ?? l.insee}</td>
                    <td className="n"><b>{l.locaux}</b></td>
                    <td>{l.nom}{l.forme ? <i> · {l.forme}</i> : null}</td>
                    <td className="mono">{l.siren}</td>
                    <td>
                      <a className="fadd" target="_blank" rel="noreferrer"
                        href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${l.siren}`}>
                        Fiche société
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="pro-pages">
              <button type="button" disabled={page === 0 || cherche} onClick={() => lancer(page - 1)}>← Précédent</button>
              <span>Page {page + 1} sur {pages.toLocaleString("fr-FR")}</span>
              <button type="button" disabled={page + 1 >= pages || cherche} onClick={() => lancer(page + 1)}>Suivant →</button>
            </div>
          )}
        </div>
      )}

      {lance && !cherche && !erreur && lignes.length === 0 && (
        <div className="pro-vide">
          Aucun immeuble sur ces critères. Élargissez le secteur, ou baissez la taille minimale —
          rappelez-vous que les immeubles détenus par des particuliers ne figurent pas au fichier
          public, et que les copropriétés sont volontairement écartées.
        </div>
      )}

      {!lance && (
        <div className="pro-vide">
          Choisissez un secteur et lancez la recherche. La base ne contient que des immeubles
          <b> détenus par une société</b> et <b>pas en copropriété</b> : un immeuble déjà divisé
          n&apos;est plus à diviser.
        </div>
      )}
    </div>
  );
}
