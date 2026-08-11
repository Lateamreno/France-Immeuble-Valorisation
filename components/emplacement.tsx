"use client";

// Emplacement — sous-onglets Adresse · Parcelles et PLU · Prix du secteur
// (réplique BO). Les POI/data INSEE se saisissent à la main via les liens de
// recherche pré-construits ; les valeurs de secteur alimentent estimations
// et grilles (bo_prix_secteur).
import { useEffect, useRef, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { Picto as PictoOnglet } from "@/components/pictos";
import { euros } from "@/lib/format";
import {
  addParcelle, deleteParcelle, saveSecteurDest, updateEmplacement, type EmplacementPatch,
} from "@/lib/bo/actions";
import { CartesSituation } from "@/components/carte";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
const fr1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("fr-FR");

/* Pictogrammes des points d'intérêt, comme dans le BO (retour #15). */
const PICTOS: Record<string, React.ReactNode> = {
  gare: <><path d="M6 4h12v10H6z" /><path d="M6 14l-2 5M18 14l2 5M9 19h6" /><circle cx="9" cy="10" r="1" /><circle cx="15" cy="10" r="1" /></>,
  bus: <><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M4 10h16M7 20v-2M17 20v-2" /><circle cx="8" cy="14" r="1" /><circle cx="16" cy="14" r="1" /></>,
  route: <><path d="M8 3 5 21M16 3l3 18M12 4v3M12 11v3M12 18v3" /></>,
  school: <><path d="m12 4 9 4-9 4-9-4z" /><path d="M7 10v5c0 1.7 2.2 3 5 3s5-1.3 5-3v-5" /></>,
  com: <><path d="M4 8h16l-1 12H5z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  autre: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.6 2.6 0 1 1 3.3 2.5c-.6.2-.8.7-.8 1.3v.4M12 17v.2" /></>,
  population: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.6 14.2c2.4.2 4.2 1.6 4.6 4.3" /></>,
  revenus: <><circle cx="12" cy="12" r="8.5" /><path d="M15 9.2c-.7-.8-1.8-1.2-3-1.2-1.7 0-2.7.8-2.7 1.9 0 2.7 5.7 1.3 5.7 4.1 0 1.2-1.1 2-2.9 2-1.3 0-2.4-.4-3.1-1.2M12 6.2v11.6" /></>,
  tendue: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v6M12 16.4v.2" /></>,
  tension: <><path d="M15.5 4.5 18 2l.8 2.2 2.2.8-2.5 2.5" /><circle cx="10" cy="14" r="6.5" /></>,
};
const Picto = ({ k, gros }: { k: string; gros?: boolean }) => (
  <svg className={`pic${gros ? " gros" : ""}`} viewBox="0 0 24 24">{PICTOS[k]}</svg>
);

const POIS = [
  ["gare", "Gares"], ["bus", "Bus"], ["route", "Routes"], ["school", "Ecoles"],
  ["com", "Commerces"], ["autre", "Autre"],
] as const;
type CleP = (typeof POIS)[number][0];

/** Points d'intérêt proposés par /api/geo (l'agent garde la main). */
type Suggestion = { nom: string; sous?: string; distance: number; minutes: number; moyen: string };
type Enrichissement = {
  commune?: { nom: string; code: string; population: number } | null;
  revenus?: number;
  chomage?: number;
  delinquance?: number;
  zoneTendue?: boolean;
  poi?: Partial<Record<CleP, Suggestion[]>>;
};
const DEST_PREFIX: Record<string, string> = {
  Logement: "hab", Commerce: "com", Bureau: "bur", Parking: "parking", Cave: "cave",
};

function gLink(q: string, b: BienData) {
  const where = `${S(b.im.adresse_rue)} ${S(b.im.adresse_zipcode)} ${S(b.im.adresse_ville)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${q} ${where}`)}`;
}

/* ---------- Adresse ---------- */

function AdresseTab({ b }: { b: BienData }) {
  const im = b.im;
  const immeubleId = String(im._id);
  const [pending, start] = useTransition();
  const [poi, setPoi] = useState(
    Object.fromEntries(
      POIS.flatMap(([k]) => [
        [`${k}_name`, S(im[`emp_${k}_name`])],
        [`${k}_time`, S(num(im[`emp_${k}_time`]))],
        [`${k}_moyen`, S(im[`emp_${k}_moyen`]) || "à pied"],
      ]),
    ) as Record<string, string>,
  );
  const [pop, setPop] = useState(S(num(im.emp_population)));
  const [rev, setRev] = useState(S(num(im.emp_revenus)));
  const [zt, setZt] = useState(im.emp_zone_tendue === true);
  const [tension, setTension] = useState(S(im.emp_tension_locative));

  // Enrichissement automatique (retours #14 et #15).
  const geo = b.adr?.geo as { lat?: number; lng?: number } | undefined;
  const lat = num(geo?.lat);
  const lon = num(geo?.lng);
  const [sugg, setSugg] = useState<Enrichissement | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Photo des valeurs avant remplissage automatique, pour pouvoir l'annuler. */
  const [avant, setAvant] = useState<{ poi: Record<string, string>; pop: string; rev: string } | null>(null);

  const annulerAuto = () => {
    if (!avant) return;
    setPoi(avant.poi);
    setPop(avant.pop);
    setRev(avant.rev);
    setSugg(null);
    setAvant(null);
  };

  /* Les chiffres officiels (habitants, revenus, zone tendue) sont rafraîchis
     à chaque ouverture de la fiche : ils changent au fil des millésimes INSEE
     et une fiche ouverte des mois plus tard ne doit pas afficher une valeur
     périmée (retour #46). Ils deviennent alors non modifiables — c'est la
     source qui fait foi, pas la saisie. */
  const officiel = useRef<{ pop?: number; rev?: number; zt?: boolean }>({});
  const [verrou, setVerrou] = useState<{ pop: boolean; rev: boolean; zt: boolean }>({
    pop: false, rev: false, zt: false,
  });

  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    let vivant = true;
    fetch(`/api/geo?lat=${lat}&lon=${lon}&cp=${encodeURIComponent(S(im.adresse_zipcode))}&ville=${encodeURIComponent(S(im.adresse_ville))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Enrichissement | null) => {
        if (!vivant || !d) return;
        officiel.current = { pop: d.commune?.population, rev: d.revenus, zt: d.zoneTendue };
        if (d.commune?.population) { setPop(String(d.commune.population)); }
        if (d.revenus) { setRev(String(d.revenus)); }
        if (d.zoneTendue !== undefined) { setZt(d.zoneTendue); }
        setVerrou({
          pop: !!d.commune?.population,
          rev: d.revenus !== undefined,
          zt: d.zoneTendue !== undefined,
        });
      })
      .catch(() => undefined);
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  const remplirPoi = (k: CleP, p: Suggestion) =>
    setPoi((prev) => ({ ...prev, [`${k}_name`]: p.nom, [`${k}_time`]: String(p.minutes), [`${k}_moyen`]: p.moyen }));

  const enrichir = async () => {
    setChargement(true);
    setErreur(null);
    setAvant({ poi, pop, rev });
    try {
      const r = await fetch(
        `/api/geo?lat=${lat}&lon=${lon}&cp=${encodeURIComponent(S(im.adresse_zipcode))}&ville=${encodeURIComponent(S(im.adresse_ville))}`,
      );
      if (!r.ok) throw new Error(`Récupération impossible (${r.status})`);
      const d = (await r.json()) as Enrichissement;
      setSugg(d);
      // On pré-remplit uniquement ce qui est vide : jamais d'écrasement d'une
      // saisie de l'agent.
      if (d.commune?.population && !pop) setPop(String(d.commune.population));
      if (d.revenus && !rev) setRev(String(d.revenus));
      setPoi((prev) => {
        const next = { ...prev };
        for (const [k] of POIS) {
          const first = d.poi?.[k]?.[0];
          if (first && !next[`${k}_name`]) {
            next[`${k}_name`] = first.nom;
            next[`${k}_time`] = String(first.minutes);
            next[`${k}_moyen`] = first.moyen;
          }
        }
        return next;
      });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  };

  const save = () =>
    start(() => {
      const patch: Record<string, unknown> = {
        emp_population: parse(pop), emp_revenus: parse(rev),
        emp_zone_tendue: zt, emp_tension_locative: tension || undefined,
      };
      for (const [k] of POIS) {
        patch[`emp_${k}_name`] = poi[`${k}_name`] || undefined;
        patch[`emp_${k}_time`] = parse(poi[`${k}_time`]);
        patch[`emp_${k}_moyen`] = poi[`${k}_moyen`] || undefined;
      }
      return updateEmplacement(immeubleId, patch as EmplacementPatch);
    });

  const adresseComplete = `${[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}, ${S(im.adresse_zipcode)} ${S(im.adresse_ville)}`;
  const mapsLien = S(b.adr?.maps_url) || `https://www.google.com/maps/search/${encodeURIComponent(adresseComplete)}`;

  return (
    <>
      <div className="emp-cadre">
        <div className="emp-titre">
          <svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>
          Emplacement
        </div>
        <div className="emp-adr">
          <button type="button" className="emp-ic" title="Copier l'adresse"
            onClick={() => navigator.clipboard?.writeText(adresseComplete)}>
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="12" rx="1.5" /><path d="M5 15V4h11" /></svg>
          </button>
          <a className="emp-chip" href={mapsLien} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" className="gmaps"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>
            {[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}, <b>{S(im.adresse_zipcode)} {S(im.adresse_ville)}</b>
          </a>
          <a className="emp-ic" href={mapsLien} target="_blank" rel="noreferrer" title="Ouvrir dans Google Maps">
            <svg viewBox="0 0 24 24"><path d="M4 20l4-1L20 7l-3-3L5 16z" /></svg>
          </a>
        </div>
        {lat !== undefined && lon !== undefined ? (
          <CartesSituation lat={lat} lon={lon} adresse={adresseComplete} immeubleId={immeubleId}
            captures={b.photos.filter((p) => p.type === "Carte")} />
        ) : (
          <div className="fempty">Adresse non géocodée : les cartes de situation apparaîtront dès que la géolocalisation sera renseignée.</div>
        )}
      </div>

      <div className="emp-sect">
        <h3>A proximité</h3>
        <div className="emp-liens">
          {POIS.map(([k, label]) => (
            <a key={k} className="emp-lien" href={gLink(label, b)} target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-8 8" /><path d="M18 13v6H5V6h6" /></svg>
              Google - {label}
            </a>
          ))}
          {lat !== undefined && lon !== undefined && (
            <button type="button" className="emp-lien auto" disabled={chargement} onClick={enrichir}>
              {chargement ? "Recherche…" : "⟳ Remplir automatiquement"}
            </button>
          )}
          {avant && (
            <button type="button" className="emp-lien" onClick={annulerAuto}>↩ Annuler le remplissage</button>
          )}
        </div>
      </div>
      {erreur && <div className="warnbox" style={{ color: "var(--red)", borderColor: "var(--red)" }}>{erreur}</div>}

      <div className="poi-grid">
        {POIS.map(([k, label]) => (
          <PoiVignette
            key={k} cle={k} label={label}
            nom={poi[`${k}_name`]} minutes={poi[`${k}_time`]} moyen={poi[`${k}_moyen`]}
            suggestions={sugg?.poi?.[k] ?? []}
            onChange={(champ, v) => setPoi((prev) => ({ ...prev, [`${k}_${champ}`]: v }))}
            onChoisir={(s2) => remplirPoi(k, s2)}
          />
        ))}
      </div>

      <div className="emp-sect">
        <h3>Ville</h3>
        <div className="emp-liens">
          <a className="emp-lien" href={`https://www.insee.fr/fr/recherche?q=${encodeURIComponent(S(im.adresse_ville))}`} target="_blank" rel="noreferrer">INSEE - Population</a>
          <a className="emp-lien" href={`https://www.insee.fr/fr/recherche?q=${encodeURIComponent(`revenus ${S(im.adresse_ville)}`)}`} target="_blank" rel="noreferrer">INSEE - Revenus</a>
          <a className="emp-lien" href="https://www.service-public.fr/simulateur/calcul/zones-tendues" target="_blank" rel="noreferrer">Service Public - Zones tendues</a>
          <a className="emp-lien" href="https://www.locservice.fr/tensiometre/" target="_blank" rel="noreferrer">LOCservice - Tensiomètre</a>
        </div>
      </div>

      <div className="ville-card">
        <div className="ville-h">
          {sugg?.commune
            ? `${sugg.commune.nom} — INSEE ${sugg.commune.code}`
            : `${S(im.adresse_ville)} (${S(im.adresse_zipcode)})`}
        </div>
        <div className="ville-g">
          <div className="ville-c">
            <Picto k="population" gros />
            <div className="t">Habitants</div>
            <div className="s">INSEE</div>
            {verrou.pop
              ? <span className="v fige" title="Donnée INSEE, remise à jour à chaque ouverture">{Number(pop).toLocaleString("fr-FR")}</span>
              : <input className="v" value={pop} onChange={(e) => setPop(e.target.value)} placeholder="—" />}
          </div>
          <div className="ville-c">
            <Picto k="revenus" gros />
            <div className="t">Revenus médian</div>
            <div className="s">INSEE</div>
            <span className="v-wrap">
              {verrou.rev
                ? <span className="v fige" title="Donnée INSEE, remise à jour à chaque ouverture">{Number(rev).toLocaleString("fr-FR")}</span>
                : <input className="v" value={rev} onChange={(e) => setRev(e.target.value)} placeholder="—" />}
              <i>€/an</i>
            </span>
          </div>
          <div className="ville-c">
            <Picto k="tendue" gros />
            <div className="t">Zone tendue</div>
            <div className="s">Service Public</div>
            {verrou.zt
              ? <span className={`v fige${zt ? " oui" : ""}`} title="Zonage officiel de la taxe sur les logements vacants">{zt ? "Oui" : "Non"}</span>
              : <button type="button" className="v bt" onClick={() => setZt(!zt)}>{zt ? "Oui" : "Non"}</button>}
          </div>
          <div className="ville-c">
            <Picto k="tension" gros />
            <div className="t">Tension locative</div>
            <div className="s">LOCservice</div>
            <select className="v bt" value={tension} onChange={(e) => setTension(e.target.value)}>
              <option value="">—</option>
              <option>Faible</option><option>Modérée</option><option>Forte</option><option>Très forte</option>
            </select>
          </div>
        </div>
        {(sugg?.chomage !== undefined || sugg?.delinquance !== undefined) && (
          <div className="ville-f">
            {sugg?.chomage !== undefined && <span>Chômage {fr1(sugg.chomage)} %</span>}
            {sugg?.delinquance !== undefined && <span>Délinquance {fr1(sugg.delinquance)} ‰</span>}
          </div>
        )}
      </div>

      <div className="wnav">
        <span className="sp" style={{ flex: 1 }} />
        <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined} onClick={save}>
          <span className="ch">›</span> Enregistrer
        </button>
      </div>
    </>
  );
}

/** Vignette d'un point d'intérêt : affichage du BO (picto, nom, moyen, durée)
 *  et édition au clic, avec les propositions automatiques dessous. */
function PoiVignette({
  cle, label, nom, minutes, moyen, suggestions, onChange, onChoisir,
}: {
  cle: string; label: string;
  nom: string; minutes: string; moyen: string;
  suggestions: Suggestion[];
  onChange: (champ: "name" | "time" | "moyen", v: string) => void;
  onChoisir: (s: Suggestion) => void;
}) {
  const [edition, setEdition] = useState(false);
  return (
    <div className={`poi${edition ? " edit" : ""}`}>
      <div className="poi-l" role="button" tabIndex={0}
        title="Modifier"
        onClick={() => setEdition((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter") setEdition((v) => !v); }}>
        <Picto k={cle} gros />
        <div className="poi-txt">
          {/* Le titre est le nom du point d'intérêt, saisi par l'agent : il
              s'édite d'un clic dessus, sans passer par le panneau de détail
              (retour #47). Le libellé de catégorie n'est qu'un repère. */}
          <input
            className="poi-nom" value={nom} placeholder={label}
            aria-label={`Nom du point d'intérêt (${label.toLowerCase()})`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => onChange("name", e.target.value)}
          />
          <i>{moyen || "à pied"}</i>
        </div>
        <span className="poi-min">{minutes ? `${minutes} min` : "—"}</span>
      </div>
      {edition && (
        <div className="poi-edit">
          <input className="min" style={{ width: 60 }} placeholder="min" value={minutes}
            onChange={(e) => onChange("time", e.target.value)} />
          <select className="min" style={{ width: 105 }} value={moyen || "à pied"}
            onChange={(e) => onChange("moyen", e.target.value)}>
            <option>à pied</option><option>en voiture</option>
          </select>
          {suggestions.length > 0 && (
            <div className="vgts">
              {suggestions.map((s2) => (
                <button key={s2.nom} type="button" title={`${s2.distance} m`}
                  className={`vgt${nom === s2.nom ? " on" : ""}`} onClick={() => onChoisir(s2)}>
                  <b>{s2.nom}</b>
                  <i>{[s2.sous, `${s2.minutes} min ${s2.moyen}`].filter(Boolean).join(" · ")}</i>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Parcelles & PLU ---------- */

function ParcellesTab({ b }: { b: BienData }) {
  const im = b.im;
  const immeubleId = String(im._id);
  const [pending, start] = useTransition();
  const [ref, setRef] = useState("");
  const [sup, setSup] = useState("");
  const [fac, setFac] = useState("");
  const [zone, setZone] = useState(S(im.plu_zone));
  const [typeZone, setTypeZone] = useState(S(im.plu_Type_zone));
  const [hauteur, setHauteur] = useState(S(num(im.plu_hauteur)));
  const [emprise, setEmprise] = useState(S(num(im.plu_emprise)));

  return (
    <>
      <div className="fsub">Parcelles</div>
      <div className="mrow" style={{ marginBottom: 8 }}>
        <a className="mopt" href={`https://cadastre.gouv.fr/scpc/rechercherPlan.do`} target="_blank" rel="noreferrer">Cadastre ↗</a>
        <a className="mopt" href={`https://www.geoportail.gouv.fr/carte`} target="_blank" rel="noreferrer">Géoportail ↗</a>
        <a className="mopt" href={gLink("cadastre parcelle", b)} target="_blank" rel="noreferrer">Google ↗</a>
      </div>
      {b.parcelles.map((p) => (
        <div key={String(p._id)} className="chrow">
          <span className="t">Parcelle {S(p.ref_cadastre)}</span>
          {num(p.superficie) !== undefined && <span className="c">{p.superficie as number} m²</span>}
          {num(p.facade) !== undefined && <span className="c">façade {p.facade as number} m</span>}
          <span className="sp" style={{ flex: 1 }} />
          <button className="xdel" type="button" title="Retirer la parcelle"
            onClick={() => {
              if (!confirm("Retirer cette parcelle ?")) return;
              start(() => deleteParcelle(immeubleId, String(p._id)));
            }}>✕</button>
        </div>
      ))}
      <div className="mrow" style={{ alignItems: "center", marginTop: 6 }}>
        <input className="min" style={{ width: 110 }} placeholder="Réf. (ex. H25)" value={ref} onChange={(e) => setRef(e.target.value)} />
        <input className="min" style={{ width: 100 }} placeholder="Superficie m²" value={sup} onChange={(e) => setSup(e.target.value)} />
        <input className="min" style={{ width: 90 }} placeholder="Façade m" value={fac} onChange={(e) => setFac(e.target.value)} />
        <button
          className="fadd" type="button" disabled={pending || !ref.trim()}
          onClick={() =>
            start(async () => {
              await addParcelle(immeubleId, { ref_cadastre: ref.trim(), superficie: parse(sup), facade: parse(fac) });
              setRef(""); setSup(""); setFac("");
            })
          }
        >+ Ajouter une parcelle</button>
      </div>

      <div className="fsub" style={{ marginTop: 18 }}>Plan Local d&apos;Urbanisme (PLU)</div>
      <div className="mrow" style={{ alignItems: "center" }}>
        <label style={{ fontSize: 12 }}>Zone <input className="min" style={{ width: 90 }} value={zone} onChange={(e) => setZone(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Type de zone <input className="min" style={{ width: 150 }} value={typeZone} onChange={(e) => setTypeZone(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Hauteur max (m) <input className="min" style={{ width: 70 }} value={hauteur} onChange={(e) => setHauteur(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Emprise max (%) <input className="min" style={{ width: 70 }} value={emprise} onChange={(e) => setEmprise(e.target.value)} /></label>
      </div>
      <div className="wnav">
        <span className="sp" style={{ flex: 1 }} />
        <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined}
          onClick={() =>
            start(() =>
              updateEmplacement(immeubleId, {
                plu_zone: zone || undefined, plu_Type_zone: typeZone || undefined,
                plu_hauteur: parse(hauteur), plu_emprise: parse(emprise),
              }),
            )
          }
        ><span className="ch">›</span> Enregistrer</button>
      </div>
    </>
  );
}

/* ---------- Prix du secteur ---------- */

function SecteurTab({ b }: { b: BienData }) {
  const im = b.im;
  const sect = b.secteur ?? {};
  const lots = b.lots;
  const carrez = lots.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
  const carrezOcc = lots.reduce((s, l) => s + ((num(l.loyer) ?? 0) > 0 ? num(l.surface_carrez) ?? 0 : 0), 0);
  const loyersAn = lots.reduce((s, l) => s + (num(l.loyer) ?? 0), 0) * 12;
  const loyersMaxAn = lots.reduce((s, l) => s + (num(l.loyer_max) ?? num(l.loyer) ?? 0), 0) * 12;
  const travaux = num(im.fin_travaux) ?? 0;
  const hai = num(im.prix_hai) ?? 0;

  const refLoyer = num(sect["0 - loyer_mois"]);
  const refPrix = num(sect["0 - prix"]);
  const refRenta = num(sect["0 - renta _%"]);

  const gap = (v?: number, ref?: number) =>
    v !== undefined && ref !== undefined && ref > 0
      ? ` (${v >= ref ? "+" : "−"}${Math.abs(Math.round(((v - ref) / ref) * 100))} %)`
      : "";

  const dests = [...new Set(lots.map((l) => String(l.Destination ?? "")).filter((d) => d))];
  const poids = dests.map((d) => ({
    dest: d,
    carrez: lots.filter((l) => String(l.Destination ?? "") === d).reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0),
  }));

  const lm2Act = carrezOcc > 0 ? loyersAn / 12 / carrezOcc : undefined;
  const lm2Max = carrez > 0 ? loyersMaxAn / 12 / carrez : undefined;
  const pm2Act = carrez > 0 && hai > 0 ? hai / carrez : undefined;
  const pm2Max = carrez > 0 && hai > 0 ? (hai + travaux) / carrez : undefined;

  return (
    <>
      {S(sect["0 - date"]) && (
        <div style={{ fontSize: 12, color: "var(--gray-txt)", marginBottom: 8 }}>
          Mis à jour le {S(sect["0 - date"]).slice(0, 10).split("-").reverse().join("/")}
        </div>
      )}
      <div className="fsub">Immeuble entier</div>
      <div className="ltable-wrap">
        <table className="ltable">
          <thead><tr><th /><th>Secteur</th><th>Actuel</th><th>Potentiel</th></tr></thead>
          <tbody>
            <tr>
              <td><b>Loyer (€/m²/mois)</b></td>
              <td>{refLoyer !== undefined ? fr1(refLoyer) : "n.c."}</td>
              <td>{lm2Act !== undefined ? fr1(lm2Act) + gap(lm2Act, refLoyer) : "—"}</td>
              <td>{lm2Max !== undefined ? fr1(lm2Max) + gap(lm2Max, refLoyer) : "—"}</td>
            </tr>
            <tr>
              <td><b>Loyer annuel</b></td>
              <td>{refLoyer !== undefined && carrez > 0 ? `${Math.round((refLoyer * carrez * 12) / 1000)} k€/an` : "n.c."}</td>
              <td>{loyersAn > 0 ? `${Math.round(loyersAn / 1000)} k€/an` : "—"}</td>
              <td>{loyersMaxAn > 0 ? `${Math.round(loyersMaxAn / 1000)} k€/an` : "—"}</td>
            </tr>
            <tr>
              <td><b>Prix (€/m²)</b></td>
              <td>{refPrix !== undefined ? Math.round(refPrix).toLocaleString("fr-FR") : "n.c."}</td>
              <td>{pm2Act !== undefined ? Math.round(pm2Act).toLocaleString("fr-FR") + gap(pm2Act, refPrix) : "—"}</td>
              <td>{pm2Max !== undefined ? Math.round(pm2Max).toLocaleString("fr-FR") : "—"}</td>
            </tr>
            <tr>
              <td><b>Rendement</b></td>
              <td>{refRenta !== undefined ? `${fr1(refRenta)} %` : "n.c."}</td>
              <td>{hai > 0 && loyersAn > 0 ? `${fr1((loyersAn / hai) * 100)} %` : "—"}</td>
              <td>{hai > 0 && loyersMaxAn > 0 ? `${fr1((loyersMaxAn / (hai + travaux)) * 100)} %` : "—"}</td>
            </tr>
            <tr>
              <td><b>Valeur</b></td>
              <td>{refPrix !== undefined && carrez > 0 ? euros(Math.round(refPrix * carrez)) : "n.c."}</td>
              <td>{hai > 0 ? euros(hai) : "—"}</td>
              <td>{hai > 0 ? euros(hai + travaux) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="fsub" style={{ marginTop: 16 }}>Détail par destination</div>
      {dests.length === 0 && <div className="fempty">Saisissez d&apos;abord des lots pour ventiler le secteur par destination.</div>}
      {dests.map((d) => {
        const prefix = DEST_PREFIX[d] ?? "autre";
        const ls = lots.filter((l) => String(l.Destination ?? "") === d);
        const surf = ls.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
        return (
          <div key={d} className="chrow">
            <span className="t">{d}s</span>
            <span className="c">{Math.round(surf)} m² carrez</span>
            <span className="c">
              {num(sect[`${prefix}_loyer_retenu`]) !== undefined ? `${fr1(num(sect[`${prefix}_loyer_retenu`])!)} €/m²/mois` : "loyer n.c."}
              {" · "}
              {num(sect[`${prefix}_prix_retenu`]) !== undefined ? `${Math.round(num(sect[`${prefix}_prix_retenu`])!).toLocaleString("fr-FR")} €/m²` : "prix n.c."}
              {" · "}
              {num(sect[`${prefix}_renta_retenu`]) !== undefined ? `${fr1(num(sect[`${prefix}_renta_retenu`])!)} %` : "renta n.c."}
            </span>
            <span className="sp" style={{ flex: 1 }} />
            <EditSecteurBtn b={b} dest={d} poids={poids} />
          </div>
        );
      })}
    </>
  );
}

function EditSecteurBtn({ b, dest, poids }: { b: BienData; dest: string; poids: { dest: string; carrez: number }[] }) {
  const immeubleId = String(b.im._id);
  const sect = b.secteur ?? {};
  const prefix = DEST_PREFIX[dest] ?? "autre";
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [loyer, setLoyer] = useState(S(num(sect[`${prefix}_loyer_retenu`])));
  const [prix, setPrix] = useState(S(num(sect[`${prefix}_prix_retenu`])));
  const [renta, setRenta] = useState(S(num(sect[`${prefix}_renta_retenu`])));
  const [comment, setComment] = useState(S(sect[`${prefix}_commentaire`]));
  const links: [string, string][] = dest === "Commerce"
    ? [["LocalCommercial.net", "https://www.localcommercial.net"], ["UnEmplacement", "https://www.unemplacement.com"]]
    : [["Seloger", `https://www.seloger.com/prix-de-l-immo/vente/${S(b.im.adresse_zipcode)}.htm`], ["Notaires", "https://www.immobilier.notaires.fr/fr/prix-immobilier"]];

  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>Modifier</button>
      {open && (
        <div className="modal-ov" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Modifier les valeurs du secteur — {dest}s<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <div className="mrow" style={{ marginBottom: 8 }}>
                {links.map(([l, href]) => <a key={l} className="mopt" href={href} target="_blank" rel="noreferrer">{l} ↗</a>)}
              </div>
              <span className="mlab">Loyer du secteur ({dest === "Commerce" ? "€/m²/an ÷ 12 → saisir en €/m²/mois" : "€/m²/mois"})</span>
              <input className="min" value={loyer} onChange={(e) => setLoyer(e.target.value)} />
              <span className="mlab">Prix du secteur (€/m²)</span>
              <input className="min" value={prix} onChange={(e) => setPrix(e.target.value)} />
              <span className="mlab">Rendement du secteur (%)</span>
              <input className="min" value={renta} onChange={(e) => setRenta(e.target.value)} />
              <span className="mlab">Commentaire</span>
              <textarea className="min" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="modal-f">
              <button
                className="kgo" type="button" disabled={pending}
                style={pending ? { opacity: 0.5 } : undefined}
                onClick={() =>
                  start(async () => {
                    await saveSecteurDest(
                      immeubleId,
                      b.secteur ? String(b.secteur._id ?? "") || null : null,
                      dest,
                      { loyer: parse(loyer), prix: parse(prix), renta: parse(renta), commentaire: comment || undefined },
                      poids,
                    );
                    setOpen(false);
                  })
                }
              ><span className="ch">›</span> Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Conteneur ---------- */

export const ONGLETS_EMPLACEMENT = [
  { key: "adresse", label: "Adresse" },
  { key: "parcelles", label: "Parcelles et PLU" },
  { key: "secteur", label: "Prix du secteur" },
] as const;

export function EmplacementTabs({ b, tab: pilote, onTab }: {
  b: BienData;
  /** Onglet piloté depuis le rail (retour #12) ; sinon état interne. */
  tab?: string;
  onTab?: (t: string) => void;
}) {
  const [interne, setInterne] = useState("adresse");
  const tab = pilote ?? interne;
  const setTab = (t: string) => { setInterne(t); onTab?.(t); };
  return (
    <>
      <div className="ftabs">
        {ONGLETS_EMPLACEMENT.map(({ key: k, label: l }) => (
          <button key={k} type="button" className={`ftab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
            <PictoOnglet nom={k} className="ftab-ic" />{l}
          </button>
        ))}
      </div>
      {tab === "adresse" && <AdresseTab b={b} />}
      {tab === "parcelles" && <ParcellesTab b={b} />}
      {tab === "secteur" && <SecteurTab b={b} />}
    </>
  );
}
