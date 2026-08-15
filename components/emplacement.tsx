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
  addParcelle, deleteParcelle, saveAdresse, saveSecteurDest, supprimerPhotoParcelle,
  updateEmplacement, uploadPhotoParcelle, type EmplacementPatch,
} from "@/lib/bo/actions";
import { CartesSituation } from "@/components/carte";
import { Copier, copierTexte } from "@/components/copier";
import { BarreEnregistrer } from "@/components/barre-enregistrer";
import { AdresseInput } from "@/components/adresse-input";
import { urlSeloger } from "@/lib/seloger";
import { chercherPoi } from "@/lib/overpass";
import type { Reperes } from "@/lib/bo/reperes";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
const fr1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("fr-FR");
const fr2 = (x: number) => (Math.round(x * 100) / 100).toLocaleString("fr-FR");

/** Une image de fiche passe toujours par le proxy : les fichiers Bubble comme
 *  le bucket Supabase sont privés. */
const proxy = (u: string) =>
  !u ? undefined
    : u.startsWith("storage:")
      ? `/api/photo?s=${encodeURIComponent(u.slice("storage:".length))}`
      : `/api/photo?u=${encodeURIComponent(u.replace(/^\/\//, "https://"))}`;

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
  const [editionAdr, setEditionAdr] = useState(false);

  // Enrichissement automatique (retours #14 et #15).
  const geo = b.adr?.geo as { lat?: number; lng?: number } | undefined;
  const lat = num(geo?.lat);
  const lon = num(geo?.lng);
  const [sugg, setSugg] = useState<Enrichissement | null>(null);
  /* Code INSEE de la commune : il ouvre le tensiomètre LOCservice sur la
     bonne ville (#76). L'enrichissement le rapporte ; à défaut on le demande
     une fois, sans rien modifier de la fiche. */
  const [inseeSeul, setInseeSeul] = useState("");
  const insee = sugg?.commune?.code ?? inseeSeul;
  useEffect(() => {
    if (insee || !S(im.adresse_ville)) return;
    const q = new URLSearchParams({ ville: S(im.adresse_ville), cp: S(im.adresse_zipcode) });
    fetch(`/api/insee?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.code) setInseeSeul(String(d.code)); })
      .catch(() => {});
  }, [insee, im.adresse_ville, im.adresse_zipcode]);
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
      /* Deux sources en parallèle : la route serveur (chiffres de commune,
         annuaire des entreprises) et OpenStreetMap depuis le navigateur, qui
         connaît les gares, arrêts, écoles et commerces. */
      const [r, osm] = await Promise.all([
        fetch(`/api/geo?lat=${lat}&lon=${lon}&cp=${encodeURIComponent(S(im.adresse_zipcode))}&ville=${encodeURIComponent(S(im.adresse_ville))}`),
        chercherPoi(lat!, lon!).catch(() => ({})),
      ]);
      if (!r.ok) throw new Error(`Récupération impossible (${r.status})`);
      const d = (await r.json()) as Enrichissement;
      // OpenStreetMap passe devant quand il a trouvé ; les propositions du
      // serveur complètent la liste sans doublon de nom.
      d.poi = { ...d.poi };
      for (const [cle, liste] of Object.entries(osm) as [CleP, Suggestion[]][]) {
        if (!liste?.length) continue;
        const noms = new Set(liste.map((p) => p.nom));
        d.poi[cle] = [...liste, ...(d.poi[cle] ?? []).filter((p) => !noms.has(p.nom))].slice(0, 8);
      }
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

  /* Ce qui est en base au chargement : la barre d'enregistrement n'apparaît
     que si l'écran s'en écarte (retours #79 et #83). */
  const enBase = useRef<string>("");
  const courant = JSON.stringify({ poi, pop, rev, zt, tension });
  if (!enBase.current) enBase.current = courant;
  const modifie = courant !== enBase.current;

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
      enBase.current = courant;
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
          <Copier valeur={adresseComplete} titre="Copier l'adresse" cls="emp-ic" />
          <a className="emp-chip" href={mapsLien} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" className="gmaps"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>
            {[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}, <b>{S(im.adresse_zipcode)} {S(im.adresse_ville)}</b>
          </a>
          {/* Le crayon édite l'adresse — il n'ouvre plus Google Maps
              (retour #60) ; le lien Maps reste sur l'adresse elle-même. */}
          <button type="button" className="emp-ic" title="Modifier l'adresse" onClick={() => setEditionAdr(true)}>
            <svg viewBox="0 0 24 24"><path d="M4 20l4-1L20 7l-3-3L5 16z" /></svg>
          </button>
        </div>
        {editionAdr && (
          <div className="emp-adr-edit">
            <AdresseInput
              autoFocus
              valeur={adresseComplete}
              placeholder="Nouvelle adresse — les suggestions s'affichent en tapant"
              onChoisir={(a) =>
                start(async () => {
                  await saveAdresse(immeubleId, {
                    numero: a.numero, rue: a.rue, cp: a.cp, ville: a.ville,
                    lat: a.lat, lon: a.lon, label: a.label,
                  });
                  setEditionAdr(false);
                })
              }
            />
            <button type="button" className="fadd" onClick={() => setEditionAdr(false)}>Annuler</button>
          </div>
        )}
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
          {/* #76 — LOCservice range ses pages par code INSEE, pas par nom de
              ville : tensiometre-33063.html pour Bordeaux. On y va donc
              directement dès qu'on connaît le code de la commune ; sinon on
              ouvre la recherche en copiant le nom, à coller dans leur champ. */}
          <a className="emp-lien"
            href={insee ? `https://www.locservice.fr/tensiometre/tensiometre-${insee}.html`
              : "https://www.locservice.fr/tensiometre/"}
            target="_blank" rel="noreferrer"
            title={insee ? `Tension locative à ${S(im.adresse_ville)}`
              : `Ouvre le tensiomètre et copie « ${S(im.adresse_ville)} » — il ne reste qu'à coller`}
            onClick={insee ? undefined : () => { void copierTexte(S(im.adresse_ville)); }}>
            LOCservice - Tensiomètre
            {!insee && <span className="emp-lien-i">ville copiée</span>}
          </a>
        </div>
      </div>

      <div className="ville-card">
        <div className="ville-h">
          {sugg?.commune
            ? `${sugg.commune.nom} — INSEE ${sugg.commune.code}`
            : `${S(im.adresse_ville)} (${S(im.adresse_zipcode)})`}
        </div>
        <div className="ville-g">
          <div className={`ville-c${pop.trim() ? "" : " requis"}`}>
            <Picto k="population" gros />
            <div className="t">Habitants</div>
            <div className="s">INSEE</div>
            {verrou.pop
              ? <span className="v fige" title="Donnée INSEE, remise à jour à chaque ouverture">{Number(pop).toLocaleString("fr-FR")}</span>
              : <input className="v" value={pop} onChange={(e) => setPop(e.target.value)} placeholder="—" />}
          </div>
          <div className={`ville-c${rev.trim() ? "" : " requis"}`}>
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
          <div className={`ville-c${tension ? "" : " requis"}`}>
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

      <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={save} />
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

/** Parcelle proposée par le cadastre IGN sous le point d'adresse (#80). */
type ParcelleIGN = { ref: string; superficie?: number; idu?: string; commune?: string };

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

  /* Même règle que le bloc Ville : la barre n'apparaît qu'en cas d'écart
     avec ce qui est enregistré. */
  const pluEnBase = useRef<string>("");
  const pluCourant = JSON.stringify({ zone, typeZone, hauteur, emprise });
  if (!pluEnBase.current) pluEnBase.current = pluCourant;
  const pluModifie = pluCourant !== pluEnBase.current;

  const savePlu = () =>
    start(async () => {
      await updateEmplacement(immeubleId, {
        plu_zone: zone || undefined, plu_Type_zone: typeZone || undefined,
        plu_hauteur: parse(hauteur), plu_emprise: parse(emprise),
      });
      pluEnBase.current = pluCourant;
    });

  /* Encadré or : la surface et la façade du terrain, somme des parcelles.
     À défaut de parcelles chiffrées, on garde la valeur déjà en fiche. */
  const totalP = (cle: string) =>
    b.parcelles.reduce((s, p) => s + (num(p[cle]) ?? 0), 0);
  const surface = totalP("superficie") || num(im.ter_surface);
  const facade = totalP("facade") || num(im.ter_facade);

  /* Les trois liens ouvrent directement le bien : le point d'adresse est déjà
     géocodé, on s'en sert pour centrer le cadastre et le Géoportail (#80). */
  const geo = b.adr?.geo as { lat?: number; lng?: number } | undefined;
  const lat = num(geo?.lat);
  const lon = num(geo?.lng);
  const adresse = `${S(im.adresse_rue)} ${S(im.adresse_zipcode)} ${S(im.adresse_ville)}`.trim();
  const idu = b.parcelles.map((p) => S(p.idu)).find((x) => x);
  const lienCadastre =
    lat !== undefined && lon !== undefined
      ? `https://cadastre.data.gouv.fr/map?style=ortho${idu ? `&parcelleId=${idu}` : ""}#19/${lat}/${lon}`
      : "https://cadastre.data.gouv.fr/map";
  const lienGeoportail =
    lat !== undefined && lon !== undefined
      ? `https://www.geoportail.gouv.fr/carte?c=${lon},${lat}&z=19` +
        "&l0=CADASTRALPARCELS.PARCELLAIRE_EXPRESS::GEOPORTAIL:OGC:WMTS(1)&permalink=yes"
      : "https://www.geoportail.gouv.fr/carte";
  const lienGoogle = adresse
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`
    : gLink("cadastre parcelle", b);

  /* Le cadastre IGN sait quelle parcelle contient ce point : on propose, et
     c'est l'agent qui ajoute (même doctrine que les points d'intérêt). */
  const [proposees, setProposees] = useState<ParcelleIGN[] | null>(null);
  const [rechCadastre, setRechCadastre] = useState(false);
  const chercherParcelles = async () => {
    if (lat === undefined || lon === undefined) return;
    setRechCadastre(true);
    try {
      const r = await fetch(`/api/cadastre?lat=${lat}&lon=${lon}`);
      const d = (await r.json()) as { parcelles?: ParcelleIGN[] };
      setProposees(d.parcelles ?? []);
    } catch {
      setProposees([]);
    } finally {
      setRechCadastre(false);
    }
  };
  /* « 000 0H 17 » (forme IGN) et « H 17 » (forme saisie au BO) désignent la
     même parcelle : on compare sans espaces ni zéros de remplissage. */
  const cle = (r: string) => {
    const brut = r.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
    const m = brut.match(/^([A-Z]*)0*(\d+)$/);
    return m ? `${m[1]}${parseInt(m[2], 10)}` : brut;
  };
  const dejaLa = (r: string) => b.parcelles.some((p) => cle(S(p.ref_cadastre)) === cle(r));

  return (
    <>
      <div className="fsub">Parcelles</div>

      <div className="terr">
        <div className="terr-t">
          <svg viewBox="0 0 24 24"><path d="M3 20V8l9-4 9 4v12z" /><path d="M3 20h18M9 20v-6h6v6" /></svg>
          Terrain
        </div>
        <div className="terr-chips">
          <span className={`fchip${surface === undefined ? " off" : ""}`}>
            Surface <b>{surface !== undefined ? `${fr1(surface)} m²` : "—"}</b>
          </span>
          <span className={`fchip${facade === undefined ? " off" : ""}`}>
            Façade <b>{facade !== undefined ? `${fr1(facade)} m` : "—"}</b>
          </span>
          <span className={`fchip${b.parcelles.length === 0 ? " off" : ""}`}>
            {b.parcelles.length > 1 ? "Parcelles" : "Parcelle"} <b>{b.parcelles.length}</b>
          </span>
        </div>
      </div>

      <div className="mrow" style={{ marginBottom: 8 }}>
        <a className="mopt" href={lienCadastre} target="_blank" rel="noreferrer">Cadastre ↗</a>
        <a className="mopt" href={lienGeoportail} target="_blank" rel="noreferrer">Géoportail ↗</a>
        <a className="mopt" href={lienGoogle} target="_blank" rel="noreferrer">Google ↗</a>
        {lat !== undefined && lon !== undefined && (
          <button type="button" className="mopt" disabled={rechCadastre} onClick={chercherParcelles}>
            {rechCadastre ? "Recherche…" : "Retrouver les parcelles"}
          </button>
        )}
      </div>

      {proposees !== null && (
        <div className="terr-prop">
          {proposees.length === 0 ? (
            <p>Le cadastre ne rend aucune parcelle sous ce point : à saisir à la main.</p>
          ) : (
            <>
              <p>Parcelle{proposees.length > 1 ? "s" : ""} du cadastre sous l&apos;adresse — cliquez pour ajouter :</p>
              <div className="mrow">
                {proposees.map((p) => (
                  <button
                    key={p.idu ?? p.ref} type="button" className="mopt"
                    disabled={pending || dejaLa(p.ref)}
                    onClick={() =>
                      start(async () => {
                        await addParcelle(immeubleId, {
                          ref_cadastre: p.ref, superficie: p.superficie, idu: p.idu,
                        });
                      })
                    }
                  >
                    {dejaLa(p.ref) ? "✓ " : "+ "}{p.ref}
                    {p.superficie !== undefined && ` · ${p.superficie.toLocaleString("fr-FR")} m²`}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

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

      <PhotoParcelle immeubleId={immeubleId} source={S(im.ter_parcelle_img)} />

      <div className="fsub" style={{ marginTop: 18 }}>Plan Local d&apos;Urbanisme (PLU)</div>
      <div className="mrow" style={{ alignItems: "center" }}>
        <label style={{ fontSize: 12 }}>Zone <input className="min" style={{ width: 90 }} value={zone} onChange={(e) => setZone(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Type de zone <input className="min" style={{ width: 150 }} value={typeZone} onChange={(e) => setTypeZone(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Hauteur max (m) <input className="min" style={{ width: 70 }} value={hauteur} onChange={(e) => setHauteur(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Emprise max (%) <input className="min" style={{ width: 70 }} value={emprise} onChange={(e) => setEmprise(e.target.value)} /></label>
      </div>
      <BarreEnregistrer modifie={pluModifie} pending={pending} onEnregistrer={savePlu} />
    </>
  );
}

/** Plan de la parcelle entourée : dépôt puis affichage (champ BO
 *  `ter_parcelle_img`). La même image sert au dossier de vente. */
function PhotoParcelle({ immeubleId, source }: { immeubleId: string; source: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [url, setUrl] = useState(() => proxy(source));
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = (f?: File | null) => {
    if (!f) return;
    start(async () => {
      setErreur(null);
      try {
        const fd = new FormData();
        fd.set("file", f);
        setUrl(await uploadPhotoParcelle(immeubleId, fd));
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "envoi impossible");
      }
    });
  };

  return (
    <>
      <div className="fsub" style={{ marginTop: 18 }}>Plan de la parcelle</div>
      {erreur && <p className="carte-err">{erreur}</p>}
      {url ? (
        <div className="terr-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Plan de la parcelle" /></a>
          <div className="mrow">
            <button type="button" className="mopt" disabled={pending} onClick={() => input.current?.click()}>
              Remplacer
            </button>
            <button
              type="button" className="mopt" disabled={pending}
              onClick={() => {
                if (!confirm("Retirer le plan de la parcelle ?")) return;
                start(async () => { await supprimerPhotoParcelle(immeubleId); setUrl(undefined); });
              }}
            >Retirer</button>
          </div>
        </div>
      ) : (
        <div
          className="carte-drop terr-drop"
          onPaste={(e) => envoyer([...e.clipboardData.files][0])}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); envoyer(e.dataTransfer.files[0]); }}
          onClick={() => input.current?.click()}
          tabIndex={0}
          role="button"
        >
          {pending ? "Envoi…" : "Déposez le plan avec la parcelle entourée (cliquer, coller ou glisser)"}
        </div>
      )}
      <input ref={input} type="file" accept="image/*" hidden
        onChange={(e) => envoyer(e.target.files?.[0])} />
    </>
  );
}

/* ---------- Prix du secteur ---------- */

function SecteurTab({ b }: { b: BienData }) {
  const im = b.im;
  const sect = b.secteur ?? {};
  /* Le code INSEE de la commune ouvre SeLoger sur la bonne ville (#87) : son
     URL se construit à partir de ce code. Une seule demande pour l'onglet,
     partagée par les vignettes de destination. */
  const [commune, setCommune] = useState<{ code?: string; nom?: string }>({});
  useEffect(() => {
    if (!S(im.adresse_ville) && !S(im.adresse_zipcode)) return;
    const q = new URLSearchParams({ ville: S(im.adresse_ville), cp: S(im.adresse_zipcode) });
    fetch(`/api/insee?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.code) setCommune({ code: String(d.code), nom: String(d.nom ?? "") }); })
      .catch(() => {});
  }, [im.adresse_ville, im.adresse_zipcode]);
  const lots = b.lots;
  const carrez = lots.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
  const carrezOcc = lots.reduce((s, l) => s + ((num(l.loyer) ?? 0) > 0 ? num(l.surface_carrez) ?? 0 : 0), 0);
  const loyersAn = lots.reduce((s, l) => s + (num(l.loyer) ?? 0), 0) * 12;
  const loyersMaxAn = lots.reduce((s, l) => s + (num(l.loyer_max) ?? num(l.loyer) ?? 0), 0) * 12;

  const refLoyer = num(sect["0 - loyer_mois"]);
  const refPrix = num(sect["0 - prix"]);
  const refRenta = num(sect["0 - renta _%"]);

  const lm2Act = carrezOcc > 0 && loyersAn > 0 ? loyersAn / 12 / carrezOcc : undefined;
  const lm2Max = carrez > 0 && loyersMaxAn > 0 ? loyersMaxAn / 12 / carrez : undefined;

  /* Équivalents « si l'immeuble était au niveau du secteur » (retour #64). */
  const kAn = (v?: number) => (v !== undefined ? `${Math.round(v / 1000).toLocaleString("fr-FR")} k€/an` : undefined);
  const eur0 = (v?: number) => (v !== undefined ? `${Math.round(v).toLocaleString("fr-FR")} €` : undefined);
  const secteurLoyerAn = refLoyer !== undefined && carrez > 0 ? refLoyer * carrez * 12 : undefined;
  const secteurValeur = refPrix !== undefined && carrez > 0 ? refPrix * carrez : undefined;
  const secteurCapital = secteurLoyerAn !== undefined && refRenta ? secteurLoyerAn / (refRenta / 100) : undefined;
  const capActuel = loyersAn > 0 && refRenta ? loyersAn / (refRenta / 100) : undefined;
  const capMax = loyersMaxAn > 0 && refRenta ? loyersMaxAn / (refRenta / 100) : undefined;

  const ecart = (v?: number, ref?: number) =>
    v !== undefined && ref !== undefined && ref > 0 ? Math.round(((v - ref) / ref) * 100) : undefined;

  const dests = [...new Set(lots.map((l) => String(l.Destination ?? "")).filter((d) => d))];
  const poids = dests.map((d) => ({
    dest: d,
    carrez: lots.filter((l) => String(l.Destination ?? "") === d).reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0),
  }));

  const dateMaj = S(sect["0 - date"]).slice(0, 10).split("-").reverse().join("/");

  /* Une cellule du tableau sombre : écart %, valeur, équivalent en chip. */
  const Cell = ({ pct, val, chip }: { pct?: number; val?: string; chip?: string }) => (
    <td>
      {val || chip ? (
        <span className="sd-cell">
          {pct !== undefined && <em className={pct < 0 ? "neg" : "pos"}>{pct > 0 ? "+" : ""}{pct} %</em>}
          {val && <b>{val}</b>}
          {chip && <i>{chip}</i>}
        </span>
      ) : (
        <span className="sd-nc">n.c.</span>
      )}
    </td>
  );

  return (
    <>
      <div className="emp-cadre">
        <div className="emp-titre">
          <svg viewBox="0 0 24 24"><path d="M3 19h18" /><path d="M3 16.5 8.5 9l4 3.5L20 5v11.5z" /></svg>
          Prix du secteur
        </div>
        {dateMaj && <div className="emp-maj">Mis à jour le {dateMaj}</div>}
      </div>

      <div className="fsub">Immeuble entier</div>
      <div className="sect-dark">
        <table>
          <thead><tr><th /><th>Secteur</th><th>Actuel</th><th>Potentiel</th></tr></thead>
          <tbody>
            <tr>
              <td className="pic"><svg viewBox="0 0 24 24"><path d="M3 12h11M10 8l4 4-4 4" /><path d="M15 4h6v16h-6" /></svg></td>
              <Cell val={refLoyer !== undefined ? `${fr1(refLoyer)} €/m²/mois` : undefined} chip={kAn(secteurLoyerAn)} />
              <Cell pct={ecart(lm2Act, refLoyer)} val={lm2Act !== undefined ? `${fr1(lm2Act)} €/m²/mois` : undefined} chip={kAn(loyersAn > 0 ? loyersAn : undefined)} />
              <Cell pct={ecart(lm2Max, refLoyer)} val={lm2Max !== undefined ? `${fr1(lm2Max)} €/m²/mois` : undefined} chip={kAn(loyersMaxAn > 0 ? loyersMaxAn : undefined)} />
            </tr>
            <tr>
              <td className="pic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M15 9.2c-.7-.8-1.8-1.2-3-1.2-1.7 0-2.7.8-2.7 1.9 0 2.7 5.7 1.3 5.7 4.1 0 1.2-1.1 2-2.9 2-1.3 0-2.4-.4-3.1-1.2M12 6.2v11.6" /></svg></td>
              <Cell val={refPrix !== undefined ? `${Math.round(refPrix).toLocaleString("fr-FR")} €/m²` : undefined} chip={eur0(secteurValeur)} />
              <Cell chip={eur0(secteurValeur)} />
              <Cell chip={eur0(secteurValeur)} />
            </tr>
            <tr>
              <td className="pic"><svg viewBox="0 0 24 24"><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></svg></td>
              <Cell val={refRenta !== undefined ? `${fr1(refRenta)} %` : undefined} chip={eur0(secteurCapital)} />
              <Cell chip={eur0(capActuel)} />
              <Cell chip={eur0(capMax)} />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="sd-legende">
        Ligne 1 : loyer moyen au m² et loyer annuel équivalent · Ligne 2 : prix au m² et valeur de
        l&apos;immeuble à ce prix · Ligne 3 : rendement et valeur en capitalisant le loyer à ce rendement.
      </div>

      <div className="fsub" style={{ marginTop: 18 }}>Détail par destination</div>
      {dests.length === 0 && <div className="fempty">Saisissez d&apos;abord des lots pour ventiler le secteur par destination.</div>}
      <div className="sect-vgs">
        {dests.map((d) => {
          const prefix = DEST_PREFIX[d] ?? "autre";
          const surf = lots.filter((l) => String(l.Destination ?? "") === d).reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
          const loyer = num(sect[`${prefix}_loyer_retenu`]);
          const prix = num(sect[`${prefix}_prix_retenu`]);
          const renta = num(sect[`${prefix}_renta_retenu`]);
          const loyerAnD = loyer !== undefined && surf > 0 ? loyer * surf * 12 : undefined;
          return (
            <div key={d} className="sect-vg">
              <div className="sv-h">
                <b>{PLURIELS[d] ?? `${d}s`}</b>
                <span>{Math.round(surf).toLocaleString("fr-FR")} m² carrez</span>
              </div>
              <div className="sv-l">
                <svg viewBox="0 0 24 24"><path d="M3 12h11M10 8l4 4-4 4" /><path d="M15 4h6v16h-6" /></svg>
                {loyer !== undefined ? <b>{fr1(loyer)} <i>€/m²/mois</i></b> : <b className="nc">loyer n.c.</b>}
                {loyerAnD !== undefined && <span className="chip">{Math.round(loyerAnD / 1000).toLocaleString("fr-FR")} k€/an</span>}
              </div>
              <div className="sv-l">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M15 9.2c-.7-.8-1.8-1.2-3-1.2-1.7 0-2.7.8-2.7 1.9 0 2.7 5.7 1.3 5.7 4.1 0 1.2-1.1 2-2.9 2-1.3 0-2.4-.4-3.1-1.2M12 6.2v11.6" /></svg>
                {prix !== undefined ? <b>{Math.round(prix).toLocaleString("fr-FR")} <i>€/m²</i></b> : <b className="nc">prix n.c.</b>}
                {prix !== undefined && surf > 0 && <span className="chip">{Math.round(prix * surf).toLocaleString("fr-FR")} €</span>}
              </div>
              <div className="sv-l">
                <svg viewBox="0 0 24 24"><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></svg>
                {renta !== undefined ? <b>{fr1(renta)} <i>%</i></b> : <b className="nc">renta n.c.</b>}
                {renta !== undefined && loyerAnD !== undefined && renta > 0 && (
                  <span className="chip">{Math.round(loyerAnD / (renta / 100)).toLocaleString("fr-FR")} €</span>
                )}
              </div>
              <div className="sv-f"><EditSecteurBtn b={b} dest={d} poids={poids} commune={commune} /></div>
            </div>
          );
        })}
      </div>
    </>
  );
}

const PLURIELS: Record<string, string> = {
  Logement: "Logements", Commerce: "Commerces", Bureau: "Bureaux",
  Logistique: "Entrepôts", Cave: "Caves", Parking: "Parkings", Annexe: "Annexes",
};

/* Marques des sites de référence (retour #87). Dessinées, pas importées :
   pas de fichier à héberger, et l'icône reste nette à toutes les tailles. */
const MARQUES: Record<string, React.ReactNode> = {
  seloger: <span className="mq sl">SL</span>,
  notaires: <span className="mq nt">N</span>,
  maps: (
    <svg className="mq-svg" viewBox="0 0 24 24">
      <path d="M12 22s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12z" fill="#ea4335" stroke="none" />
      <circle cx="12" cy="10" r="2.6" fill="#fff" stroke="none" />
    </svg>
  ),
  copie: (
    <svg className="mq-svg trait" viewBox="0 0 24 24">
      <rect x="8" y="3" width="12" height="15" rx="2" /><path d="M16 21H6a2 2 0 0 1-2-2V7" />
    </svg>
  ),
};

/** Saisie chiffrée du BO (retour #88) : que des chiffres, affichés par
 *  paquets de trois. La valeur reste un nombre exploitable par les calculs. */
const nbAffiche = (v: string) => {
  if (v === "") return "";
  const [ent, dec] = v.split(".");
  const groupe = ent.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dec === undefined ? groupe : `${groupe},${dec}`;
};
const nbSaisi = (t: string, decimales: number) => {
  let v = t.replace(/[^\d.,]/g, "").replace(/,/g, ".");
  const i = v.indexOf(".");
  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
  if (decimales === 0) return v.split(".")[0];
  const [ent, dec] = v.split(".");
  return dec === undefined ? ent : `${ent}.${dec.slice(0, decimales)}`;
};

/** Champ encadré de la modale du BO : picto à gauche, libellé posé sur le
 *  cadre, unité à droite. Rouge tant qu'il est vide. */
function ChampSecteur({
  icone, libelle, unite, valeur, onChange, decimales = 0, calcule, repere, aRemplacer,
}: {
  icone: React.ReactNode; libelle: string; unite?: string;
  valeur: string; onChange?: (v: string) => void;
  decimales?: number;
  /** Champ déduit des autres : affiché, jamais saisi. */
  calcule?: boolean;
  /** Ordre de grandeur du marché, rappelé sous le champ. */
  repere?: React.ReactNode;
  /** La valeur affichée vient du repère : elle attend d'être vérifiée. */
  aRemplacer?: boolean;
}) {
  const vide = valeur === "";
  return (
    <div className={`sf${calcule ? " calc" : vide ? " requis" : aRemplacer ? " repere" : ""}`}>
      <span className="sf-ic"><svg viewBox="0 0 24 24">{icone}</svg></span>
      <span className="sf-box">
        <span className="sf-lab">{libelle}{aRemplacer ? " — repère, à vérifier" : ""}</span>
        {calcule ? (
          <span className="sf-val">{vide ? "n.c." : nbAffiche(valeur)}</span>
        ) : (
          <input
            inputMode="decimal" value={nbAffiche(valeur)} placeholder={libelle}
            onChange={(e) => onChange?.(nbSaisi(e.target.value, decimales))}
          />
        )}
        {unite && <span className="sf-suf">{unite}</span>}
        {repere && <span className="sf-rep">{repere}</span>}
      </span>
    </div>
  );
}

function EditSecteurBtn({ b, dest, poids, commune }: {
  b: BienData; dest: string; poids: { dest: string; carrez: number }[];
  /** Commune officielle (code INSEE + nom) pour l'URL SeLoger. */
  commune?: { code?: string; nom?: string };
}) {
  const immeubleId = String(b.im._id);
  const sect = b.secteur ?? {};
  const prefix = DEST_PREFIX[dest] ?? "autre";
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [loyer, setLoyer] = useState(S(num(sect[`${prefix}_loyer_retenu`])));
  const [prix, setPrix] = useState(S(num(sect[`${prefix}_prix_retenu`])));
  const [comment, setComment] = useState(S(sect[`${prefix}_commentaire`]));

  /* Repères de marché (loyers d'annonce du ministère, ventes DVF). Ils
     donnent l'ordre de grandeur avant la saisie vérifiée : ils préremplissent
     un champ vide, et restent affichés sous le champ pour se situer. Le
     chiffre retenu, lui, reste celui que l'agent tape. */
  const [reperes, setReperes] = useState<Reperes | null>(null);
  const prerempli = useRef({ loyer: false, prix: false });
  useEffect(() => {
    if (!open || !commune?.code || reperes) return;
    fetch(`/api/reperes?insee=${commune.code}&destination=${encodeURIComponent(dest)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Reperes | null) => {
        if (!d) return;
        setReperes(d);
        if (d.loyer) setLoyer((v) => { if (v) return v; prerempli.current.loyer = true; return String(Math.round(d.loyer!.valeur * 100) / 100); });
        if (d.prix) setPrix((v) => { if (v) return v; prerempli.current.prix = true; return String(d.prix!.valeur); });
      })
      .catch(() => {});
  }, [open, commune?.code, dest, reperes]);

  /* Le rendement n'est pas une saisie : c'est le loyer annuel rapporté au
     prix. Le laisser à la main, c'est laisser entrer une incohérence. */
  const renta =
    parse(loyer) && parse(prix) ? String(Math.round((parse(loyer)! * 12 * 1000) / parse(prix)!) / 10) : "";

  const ville = S(b.im.adresse_ville);
  const cp = S(b.im.adresse_zipcode);
  const adresse = `${S(b.im.adresse_numero_rue)} ${S(b.im.adresse_rue)} ${cp} ${ville}`.replace(/\s+/g, " ").trim();
  const dept = cp.startsWith("97") || cp.startsWith("98") ? cp.slice(0, 3) : cp.slice(0, 2);
  const idf = ["75", "77", "78", "91", "92", "93", "94", "95"].includes(dept);
  /* La fiche porte déjà le slug de la ville (`ville_url`) : seul le code
     INSEE demande un aller-retour, et son absence dégrade proprement vers la
     page du département. */
  const seloger = {
    insee: commune?.code, nom: commune?.nom || ville,
    slug: typeof b.adr?.ville_url === "string" ? (b.adr.ville_url as string) : undefined,
    cp,
  };

  const cible = (site: string, quoi: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${quoi} ${ville} ${cp}`)}`;
  /* Les liens du BO, dans l'ordre du BO. Pour le commerce, les deux sites
     spécialisés remplacent SeLoger, qui ne cote pas les baux commerciaux. */
  const liens: { cle: string; label: string; href: string }[] =
    dest === "Commerce"
      ? [
          { cle: "seloger", label: "LocalCommercial", href: cible("localcommercial.net", "local commercial") },
          { cle: "notaires", label: "Notaires", href: `https://www.immobilier.notaires.fr/fr/prix-immobilier?typeLocalisation=DEPARTEMENT&codeInsee=${dept}&neuf=A` },
        ]
      : [
          // Une page par champ à remplir : les loyers pour le premier, les
          // prix pour le second, tous deux sur la commune du bien.
          { cle: "seloger", label: "Loyers", href: urlSeloger({ ...seloger, type: "location" }) },
          { cle: "seloger", label: "Prix", href: urlSeloger({ ...seloger, type: "vente" }) },
          { cle: "notaires", label: "Notaires", href: `https://www.immobilier.notaires.fr/fr/prix-immobilier?typeLocalisation=DEPARTEMENT&codeInsee=${dept}&neuf=A` },
          ...(idf ? [{ cle: "notaires", label: "Notaires Paris", href: "https://paris.notaires.fr/fr/carte-des-prix" }] : []),
        ];

  /* Le BO n'enregistre que si les deux valeurs qui servent aux calculs sont
     là : sans elles, ni rendement ni estimation. */
  const complet = parse(loyer) !== undefined && parse(prix) !== undefined;

  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>Modifier</button>
      {open && (
        <div className="modal-ov" onClick={() => setOpen(false)}>
          <div className="modal sect-mod" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              Modifier les valeurs du secteur
              <button type="button" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="modal-b">
              <div className="sm-liens">
                <b>{PLURIELS[dest] ?? `${dest}s`}</b>
                <span className="sp" />
                {liens.map((l, i) => (
                  <a key={i} className="sm-lk" href={l.href} target="_blank" rel="noreferrer">
                    {MARQUES[l.cle]}{l.label}
                  </a>
                ))}
                <a
                  className="sm-lk"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`}
                  target="_blank" rel="noreferrer"
                >{MARQUES.maps}Maps</a>
                <button type="button" className="sm-lk" title="Copier l'adresse" onClick={() => copierTexte(adresse)}>
                  {MARQUES.copie}Adresse
                </button>
              </div>

              <ChampSecteur
                icone={<><path d="M3 12h11M10 8l4 4-4 4" /><path d="M15 4h6v16h-6" /></>}
                libelle="Loyer du secteur"
                unite={dest === "Commerce" ? "€/m²/mois (annuel ÷ 12)" : "€/m²/mois"}
                valeur={loyer}
                onChange={(v) => { prerempli.current.loyer = false; setLoyer(v); }}
                decimales={2}
                repere={reperes?.loyer && (
                  <>
                    <b>{fr2(reperes.loyer.valeur)} €/m²/mois</b> — loyers d&apos;annonce {reperes.loyer.millesime}
                    {reperes.loyer.commune ? "" : ", estimé sur les communes voisines"}
                    {reperes.loyer.bas !== undefined && ` · fourchette ${fr2(reperes.loyer.bas)} à ${fr2(reperes.loyer.haut!)} €`}
                  </>
                )}
                aRemplacer={prerempli.current.loyer}
              />
              <ChampSecteur
                icone={<><circle cx="12" cy="12" r="8.5" /><path d="M15 9.2c-.7-.8-1.8-1.2-3-1.2-1.7 0-2.7.8-2.7 1.9 0 2.7 5.7 1.3 5.7 4.1 0 1.2-1.1 2-2.9 2-1.3 0-2.4-.4-3.1-1.2M12 6.2v11.6" /></>}
                libelle="Prix du secteur" unite="€/m²"
                valeur={prix}
                onChange={(v) => { prerempli.current.prix = false; setPrix(v); }}
                repere={reperes?.prix && (
                  <>
                    <b>{reperes.prix.valeur.toLocaleString("fr-FR")} €/m²</b> — médiane des ventes DVF {reperes.prix.millesime},
                    {` sur ${reperes.prix.ventes.toLocaleString("fr-FR")} vente${reperes.prix.ventes > 1 ? "s" : ""} d'appartement`}
                  </>
                )}
                aRemplacer={prerempli.current.prix}
              />
              <ChampSecteur
                icone={<><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></>}
                libelle="Rendement du secteur" unite="%"
                valeur={renta} calcule
              />

              <span className="mlab">Commentaire</span>
              <textarea className="min" rows={2} placeholder="Commentaire" value={comment}
                onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="modal-f">
              <span className="sp" />
              <button
                className="savebar-go" type="button" disabled={pending || !complet}
                title={complet ? undefined : "Loyer et prix du secteur attendus"}
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
              >{pending ? "Enregistrement…" : "❯ Enregistrer"}</button>
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
