"use client";

// Emplacement — sous-onglets Adresse · Parcelles et PLU · Prix du secteur
// (réplique BO). Les POI/data INSEE se saisissent à la main via les liens de
// recherche pré-construits ; les valeurs de secteur alimentent estimations
// et grilles (bo_prix_secteur).
import { useEffect, useRef, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { Picto as PictoOnglet } from "@/components/pictos";
import { euros, S } from "@/lib/format";
import {
  addParcelle, deleteParcelle, saveAdresse, saveSecteurDest, supprimerPhotoParcelle,
  tensionLocservice, updateEmplacement, updateParcelle, uploadPhotoParcelle, type EmplacementPatch,
} from "@/lib/bo/actions";
import { oublier, useMemoire, useMemoireServie } from "@/lib/memoire";
import { CartesSituation } from "@/components/carte";
import { Copier, copierTexte } from "@/components/copier";
import { BarreEnregistrer } from "@/components/barre-enregistrer";
import { Modale, useQuestion } from "@/components/modale";
import { AdresseInput } from "@/components/adresse-input";
import { urlSeloger } from "@/lib/seloger";
import { annoncesLot, loyerAffiche, loyerStocke, uniteSecteur } from "@/lib/bo/secteur-unites";
import { slugVille, urlUnemplacement, type ValeurUE } from "@/lib/unemplacement";
import { chercherPoi } from "@/lib/overpass";
import type { Reperes } from "@/lib/bo/reperes";
import { itineraireGoogle as itineraireBrut } from "@/lib/bo/itineraire";

/* Retour #388 — la liste propose « en bus », que lib/bo/itineraire.ts ne
   connaît pas (il retomberait sur la marche). Pour Google, un bus est un
   transport en commun : on traduit ici, sans toucher au calcul partagé. */
const itineraireGoogle: typeof itineraireBrut = (im, vers, opts = {}) =>
  itineraireBrut(im, vers, { ...opts, moyen: opts.moyen === "en bus" ? "en transport" : opts.moyen });
import { TENSIONS_LOCATIVES } from "@/lib/referentiels";

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

/* Retour #386 — « reprends l'ordre du BO : à gauche de haut en bas gare, bus,
   route ; à droite école, commerce, autre ». Une grille qui remplit ligne par
   ligne mettait l'école à côté de la gare : les deux colonnes sont donc
   explicites. */
const POIS_GAUCHE: readonly CleP[] = ["gare", "bus", "route"];
const POIS_DROITE: readonly CleP[] = ["school", "com", "autre"];

/** Le type d'un point, tel qu'il se lit dans la liste déroulante (#388). */
const TYPES_POI: Record<CleP, string> = {
  gare: "Gare", bus: "Bus", route: "Route", school: "École", com: "Commerce", autre: "Autre",
};

/** Point d'intérêt ajouté par l'agent (#387) — même dessin que les six du BO,
 *  avec en plus son type et une croix pour le retirer. Rangé dans `emp_points`. */
type PointLibre = { type: CleP; name: string; time: string; moyen: string; geo: string };
const estClePoi = (v: unknown): v is CleP => POIS.some(([k]) => k === v);
const lirePoints = (im: Record<string, unknown>): PointLibre[] =>
  Array.isArray(im.emp_points)
    ? (im.emp_points as Record<string, unknown>[]).filter((p) => p && typeof p === "object").map((p) => ({
        type: estClePoi(p.type) ? p.type : "autre",
        name: S(p.name), time: S(num(p.time)), moyen: S(p.moyen) || "à pied", geo: S(p.geo),
      }))
    : [];

/* Ce qu'on cherche quand le point n'est pas encore nommé (retour #215). Le
   libellé de la vignette ne fait pas l'affaire tel quel : Google comprend
   « gare » et « supermarché », pas « Gares » ni « Commerces ». */
const CHERCHE: Record<CleP, string> = {
  gare: "gare", bus: "arrêt de bus", route: "accès autoroute",
  school: "école", com: "supermarché", autre: "commerces",
};

/** Points d'intérêt proposés par /api/geo (l'agent garde la main). */
type Suggestion = { nom: string; sous?: string; distance: number; minutes: number; moyen: string; lat?: number; lon?: number };
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
  const { confirmer, question } = useQuestion();
  /* Retour #388 — la saisie s'enregistre au blur et à Entrée, comme dans le
     BO. Chaque enregistrement rafraîchit la fiche, et l'onglet — dont la clé
     est la date de modification — se remonte : une valeur tapée pendant que
     l'enregistrement précédent est en route partirait avec (le piège du
     #294). La mémoire d'écran la garde, et son témoin distingue « la fiche a
     bougé » de « l'agent a tapé ». */
  const cleMem = `emp:${immeubleId}:`;
  const [poi, setPoi] = useMemoireServie<Record<string, string>>(
    `${cleMem}poi`,
    Object.fromEntries(
      POIS.flatMap(([k]) => [
        [`${k}_name`, S(im[`emp_${k}_name`])],
        [`${k}_time`, S(num(im[`emp_${k}_time`]))],
        [`${k}_moyen`, S(im[`emp_${k}_moyen`]) || "à pied"],
        [`${k}_geo`, S(im[`emp_${k}_geo`])],
      ]),
    ),
  );
  const [pts, setPts] = useMemoireServie<PointLibre[]>(`${cleMem}pts`, lirePoints(im));
  const [pop, setPop] = useState(S(num(im.emp_population)));
  const [rev, setRev] = useState(S(num(im.emp_revenus)));
  const [zt, setZt] = useState(im.emp_zone_tendue === true);
  const [tension, setTension] = useMemoireServie(`${cleMem}tension`, S(im.emp_tension_locative));
  /** Vrai quand la tension affichée vient de LOCservice et non de la fiche (#389). */
  const [tensionProposee, setTensionProposee] = useState(false);
  const [editionAdr, setEditionAdr] = useState(false);

  // Enrichissement automatique (retours #14 et #15).
  const geo = b.adr?.geo as { lat?: number; lng?: number } | undefined;
  const lat = num(geo?.lat);
  const lon = num(geo?.lng);
  /* Les propositions survivent au remontage de l'onglet (voir `cleMem`) :
     sans ça, choisir une gare — donc enregistrer — effaçait les propositions
     des cinq autres cases. Préfixe distinct : `oublier(cleMem)` ne doit pas
     les emporter avec la saisie. */
  const [sugg, setSugg] = useMemoire<Enrichissement | null>(`empsugg:${immeubleId}`, null);
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

  /* Retour #389 — la tension locative se propose toute seule, depuis le
     tensiomètre LOCservice de la commune (la source que la vignette affiche).
     Uniquement quand la case est vide : une valeur choisie par l'agent ne se
     réécrit jamais. Elle reste une proposition — c'est le bouton Enregistrer
     qui la fait entrer dans la fiche, comme les autres valeurs de l'écran. */
  const tensionVideEnBase = !S(im.emp_tension_locative);
  const tensionRef = useRef(tension);
  useEffect(() => { tensionRef.current = tension; }, [tension]);
  /* Une seule lecture par commune : le `set` de la mémoire d'écran change à
     chaque rendu, l'effet se relance donc plus souvent qu'il ne le faudrait. */
  const tensionDemandee = useRef("");
  useEffect(() => {
    if (!insee || !tensionVideEnBase || tensionDemandee.current === insee) return;
    tensionDemandee.current = insee;
    tensionLocservice(insee)
      .then(async (t) => {
        // L'agent a pu choisir entre-temps : sa valeur prime.
        if (!t || tensionRef.current) return;
        setTension(t);
        setTensionProposee(true);
        /* MAV, 25/09 : « Bubble a directement la bonne mention enregistrée
           sans intervention de ma part ». Donc on l'inscrit dans la fiche
           tout de suite, sans attendre Enregistrer — seulement quand la case
           était vide, jamais par-dessus une valeur choisie. */
        await updateEmplacement(immeubleId, { emp_tension_locative: t } as EmplacementPatch).catch(() => undefined);
      })
      .catch(() => undefined);
  }, [insee, tensionVideEnBase, setTension]);
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

  /* Les coordonnées du point choisi sont retenues avec son nom (#186) : c'est
     elles, et non le nom, qui serviront à tracer l'itinéraire. */
  const remplirPoi = (k: CleP, p: Suggestion) =>
    setPoi((prev) => ({
      ...prev,
      [`${k}_name`]: p.nom,
      [`${k}_time`]: String(p.minutes),
      [`${k}_moyen`]: p.moyen,
      [`${k}_geo`]: p.lat !== undefined && p.lon !== undefined ? `${p.lat},${p.lon}` : "",
    }));

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
            next[`${k}_geo`] = first.lat !== undefined && first.lon !== undefined
              ? `${first.lat},${first.lon}` : "";
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
  const courant = JSON.stringify({ poi, pts, pop, rev, zt, tension });
  if (!enBase.current) enBase.current = courant;
  const modifie = courant !== enBase.current;

  const save = () =>
    start(async () => {
      const patch: Record<string, unknown> = {
        emp_population: parse(pop), emp_revenus: parse(rev),
        emp_zone_tendue: zt, emp_tension_locative: tension || undefined,
        emp_points: pts
          .filter((p) => p.name.trim() || p.time.trim())
          .map((p) => ({ type: p.type, name: p.name.trim(), time: parse(p.time), moyen: p.moyen || "à pied", geo: p.geo || undefined })),
      };
      for (const [k] of POIS) {
        patch[`emp_${k}_name`] = poi[`${k}_name`] || undefined;
        // « lat,lon » du point choisi : l'itinéraire s'y rend sans interpréter.
        // `null` plutôt qu'`undefined` quand c'est vide : il faut que
        // l'effacement passe, sinon d'anciennes coordonnées survivent au nom.
        patch[`emp_${k}_geo`] = poi[`${k}_geo`] || null;
        patch[`emp_${k}_time`] = parse(poi[`${k}_time`]);
        patch[`emp_${k}_moyen`] = poi[`${k}_moyen`] || undefined;
      }
      enBase.current = courant;
      setTensionProposee(false);
      await updateEmplacement(immeubleId, patch as EmplacementPatch);
      // Enregistré : la fiche redevient la seule source (même geste qu'au PLU).
      oublier(cleMem);
    });

  /* Retour #388 — « on remplit et c'est pris » : un blur ou Entrée dans une
     case, un choix dans une liste, et l'enregistrement part par le même chemin
     que le bouton de la barre. On ne peut pas appeler `save` dans le même
     geste que le changement (il lirait l'état d'avant) : la demande est notée,
     et honorée au rendu suivant, quand `modifie` dit vrai. */
  const validerRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    validerRef.current = () => { if (modifie && !pending) save(); };
  });
  const [demande, setDemande] = useState(0);
  useEffect(() => { if (demande) validerRef.current(); }, [demande]);
  const valider = () => setDemande((n) => n + 1);

  /* Retour #387 — un point de plus, vide, à remplir sur place. */
  const ajouterPoint = () =>
    setPts((prev) => [...prev, { type: "autre", name: "", time: "", moyen: "à pied", geo: "" }]);
  const majPoint = (i: number, champ: keyof PointLibre, v: string) =>
    setPts((prev) => prev.map((p, j) => (j !== i ? p : {
      ...p, [champ]: v,
      // Retaper le nom désigne un autre lieu : ses coordonnées ne valent plus (#186).
      ...(champ === "name" ? { geo: "" } : null),
    })));
  const supprimerPoint = async (i: number) => {
    const p = pts[i];
    const vide = !p.name.trim() && !p.time.trim();
    if (!vide && !(await confirmer(`Supprimer le point d'intérêt « ${p.name.trim() || TYPES_POI[p.type]} » ?`, { danger: true, oui: "Supprimer" }))) return;
    setPts((prev) => prev.filter((_, j) => j !== i));
    valider();
  };

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
        {/* Retour #233 : plus de capture déposée à la main, seulement les
            aperçus Google. */}
        {lat !== undefined && lon !== undefined ? (
          <CartesSituation lat={lat} lon={lon} adresse={adresseComplete} />
        ) : (
          <div className="fempty">Adresse non géocodée : les cartes de situation apparaîtront dès que la géolocalisation sera renseignée.</div>
        )}
      </div>

      <div className="emp-sect">
        <h3>A proximité</h3>
        <div className="emp-liens">
          {/* Retour #215 : un ITINÉRAIRE depuis l'immeuble, plus une recherche
              Google. La page de résultats obligeait à retrouver le lieu, lancer
              l'itinéraire, revenir ; l'itinéraire direct donne le nom et la
              durée d'un coup — les deux cases que la vignette réclame. Il part
              du point déjà retenu s'il y en a un, du type cherché sinon, et
              respecte le moyen de locomotion choisi sur la vignette. */}
          {POIS.map(([k, label]) => (
            <a
              key={k} className="emp-lien" target="_blank" rel="noreferrer"
              href={itineraireGoogle(im, poi[`${k}_name`] || CHERCHE[k], {
                geo: poi[`${k}_geo`], moyen: poi[`${k}_moyen`],
              })}
              title={`Itinéraire ${poi[`${k}_moyen`] || "à pied"} jusqu'${k === "route" ? "à l'accès" : `aux ${label.toLowerCase()}`}`}
            >
              <svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-8 8" /><path d="M18 13v6H5V6h6" /></svg>
              Itinéraire - {label}
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

      {/* Retour #386 : deux colonnes, dans l'ordre du BO. Les points ajoutés
          (#387) se rangent à la suite, en alternant gauche et droite. */}
      <div className="poi-grid">
        {[POIS_GAUCHE, POIS_DROITE].map((colonne, c) => (
          <div className="poi-col" key={c}>
            {colonne.map((k) => {
              const label = POIS.find(([cle]) => cle === k)![1];
              return (
                <PoiVignette
                  key={k} cle={k} label={label}
                  nom={poi[`${k}_name`]} minutes={poi[`${k}_time`]} moyen={poi[`${k}_moyen`]}
                  itineraire={itineraireGoogle(im, poi[`${k}_name`] || CHERCHE[k], {
                    geo: poi[`${k}_geo`], moyen: poi[`${k}_moyen`],
                  })}
                  suggestions={sugg?.poi?.[k] ?? []}
                  /* Retaper le nom à la main désigne un autre lieu que celui retenu :
                     ses coordonnées ne valent plus rien, on les oublie (#186). */
                  onChange={(champ, v) => setPoi((prev) => ({
                    ...prev,
                    [`${k}_${champ}`]: v,
                    ...(champ === "name" ? { [`${k}_geo`]: "" } : null),
                  }))}
                  onChoisir={(s2) => remplirPoi(k, s2)}
                  onValider={valider}
                />
              );
            })}
            {pts.map((p, i) => (i % 2 === c ? (
              <PoiVignette
                key={`libre-${i}`} cle={p.type} label={TYPES_POI[p.type]}
                nom={p.name} minutes={p.time} moyen={p.moyen}
                itineraire={itineraireGoogle(im, p.name || CHERCHE[p.type], { geo: p.geo, moyen: p.moyen })}
                suggestions={sugg?.poi?.[p.type] ?? []}
                onChange={(champ, v) => majPoint(i, champ === "name" ? "name" : champ === "time" ? "time" : "moyen", v)}
                onType={(t) => majPoint(i, "type", t)}
                onChoisir={(s2) => setPts((prev) => prev.map((q, j) => (j !== i ? q : {
                  ...q, name: s2.nom, time: String(s2.minutes), moyen: s2.moyen,
                  geo: s2.lat !== undefined && s2.lon !== undefined ? `${s2.lat},${s2.lon}` : "",
                })))}
                onValider={valider}
                onSupprimer={() => { void supprimerPoint(i); }}
              />
            ) : null))}
          </div>
        ))}
      </div>
      <div className="poi-add">
        <button type="button" className="fadd" onClick={ajouterPoint}>+ Ajouter un point d&apos;intérêt</button>
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
            {/* #177 — un tiret se lit comme « rien à dire ». Une liste vide,
                elle, se lit comme « à renseigner » : on garde donc l'aspect
                d'un sélecteur, chevron compris, tant que rien n'est choisi. */}
            {/* Retour #216 — « il faudrait vraiment que ce qu'on voit ici pour
                remplir soit une copie conforme de ce qu'on doit remplir ».
                Cette liste était codée en dur à quatre valeurs quand celle du
                bloc « ce qui reste à saisir » en propose six : une tension
                enregistrée là-bas en « Très faible » ou « n.c. » ne trouvait
                pas son option ici et s'affichait « À renseigner ». Les deux
                écrans lisent désormais le même référentiel. */}
            {/* #389 — proposée par LOCservice : cadre ambre, comme un repère
                de secteur, jusqu'à l'enregistrement ou à un autre choix. */}
            <select className={`v bt sel${tension ? "" : " vide"}${tensionProposee ? " propose" : ""}`} value={tension}
              title={tensionProposee ? "Lue sur le tensiomètre LOCservice de la commune — à enregistrer" : undefined}
              onChange={(e) => { setTensionProposee(false); setTension(e.target.value); }}>
              <option value="">À renseigner</option>
              {TENSIONS_LOCATIVES.map((t) => <option key={t}>{t}</option>)}
            </select>
            {tensionProposee && <span className="ville-note">proposée par LOCservice</span>}
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
      {question}
    </>
  );
}

/* Les moyens de locomotion proposés sur la vignette (#388) : ceux du BO
   (`MOYENS` de lib/bo/itineraire.ts) plus « en bus », que le BO Bubble propose.
   Une ancienne valeur hors liste reste choisie. */
const MOYENS_POI = ["à pied", "en bus", "en voiture", "en transport", "à vélo"] as const;

/**
 * Vignette d'un point d'intérêt, qui se remplit SUR PLACE (retour #388).
 *
 * MAV : « à droite c'est le temps, quand on survole ça montre que c'est une
 * case à remplir et on remplit ; pareil pour le moyen de transport et pour le
 * type de point d'intérêt. Là aujourd'hui ça ouvre une sorte de modale, c'est
 * nul. » Plus de panneau : le nom est une case, la durée une case qui jaunit
 * au survol, le moyen et le type des listes déroulantes. Tout s'enregistre au
 * blur, à Entrée ou au choix dans une liste (`onValider`). Les propositions
 * automatiques se montrent sous la vignette pendant qu'on est dans le nom.
 */
function PoiVignette({
  cle, label, nom, minutes, moyen, itineraire, suggestions, onChange, onType, onChoisir, onValider, onSupprimer,
}: {
  cle: CleP; label: string;
  nom: string; minutes: string; moyen: string;
  /** L'itinéraire Google vers ce point, calculé par l'écran (retour #215). */
  itineraire: string;
  suggestions: Suggestion[];
  onChange: (champ: "name" | "time" | "moyen", v: string) => void;
  /** Point ajouté (#387) : son type se choisit, les six du BO ont le leur. */
  onType?: (t: CleP) => void;
  onChoisir: (s: Suggestion) => void;
  /** Enregistrer ce qui vient d'être saisi. */
  onValider: () => void;
  /** Point ajouté (#387) : la croix qui le retire. */
  onSupprimer?: () => void;
}) {
  const [dansLeNom, setDansLeNom] = useState(false);
  const entree = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };
  const moyens = MOYENS_POI.includes(moyen as (typeof MOYENS_POI)[number]) || !moyen
    ? [...MOYENS_POI] : [moyen, ...MOYENS_POI];
  return (
    <div className={`poi place${dansLeNom ? " actif" : ""}`}>
      <div className="poi-l">
        <Picto k={cle} gros />
        <div className="poi-txt">
          {/* Le titre est le nom du point d'intérêt, saisi par l'agent (#47). */}
          <input
            className="poi-nom" value={nom} placeholder={label}
            aria-label={`Nom du point d'intérêt (${label.toLowerCase()})`}
            onFocus={() => setDansLeNom(true)}
            onBlur={() => { setDansLeNom(false); onValider(); }}
            onKeyDown={entree}
            onChange={(e) => onChange("name", e.target.value)}
          />
          <span className="poi-sub">
            <select className="poi-sel" value={moyen || "à pied"} aria-label="Moyen de transport"
              onChange={(e) => { onChange("moyen", e.target.value); onValider(); }}>
              {moyens.map((x) => <option key={x}>{x}</option>)}
            </select>
            {onType && (
              <select className="poi-sel" value={cle} aria-label="Type de point d'intérêt"
                onChange={(e) => { onType(e.target.value as CleP); onValider(); }}>
                {POIS.map(([k]) => <option key={k} value={k}>{TYPES_POI[k]}</option>)}
              </select>
            )}
          </span>
        </div>
        <label className="poi-min">
          <input className="poi-min-in" value={minutes} placeholder="—" inputMode="numeric"
            aria-label="Durée du trajet en minutes"
            onChange={(e) => onChange("time", e.target.value.replace(/[^\d]/g, ""))}
            onBlur={onValider} onKeyDown={entree} />
          <i>min</i>
        </label>
        {/* Le lien qui donne la réponse aux cases d'à côté (#215), désormais
            sur la vignette elle-même puisqu'il n'y a plus de panneau. */}
        <a className="poi-go" href={itineraire} target="_blank" rel="noreferrer"
          title={`Itinéraire ${moyen || "à pied"} — Google Maps`}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M10 14 20 4M15 4h5v5" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
        {onSupprimer && (
          <button type="button" className="xdel poi-x" title="Supprimer ce point d'intérêt" onClick={onSupprimer}>✕</button>
        )}
      </div>
      {dansLeNom && suggestions.length > 0 && (
        <div className="vgts poi-sugg">
          {suggestions.map((s2) => (
            /* `onMouseDown` empêché : sinon le nom perd le focus avant le
               clic, la liste disparaît et le clic tombe dans le vide. */
            <button key={s2.nom} type="button" title={`${s2.distance} m`}
              className={`vgt${nom === s2.nom ? " on" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChoisir(s2); onValider(); }}>
              <b>{s2.nom}</b>
              <i>{[s2.sous, `${s2.minutes} min ${s2.moyen}`].filter(Boolean).join(" · ")}</i>
            </button>
          ))}
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
  /* Retour #294 — « quand j'ai ajouté la photo alors que je n'avais pas encore
     enregistré les zone, type de zone, hauteur et emprise, ça m'a retiré ce
     que j'avais mis ; il ne faut pas. »
     Le dépôt du plan écrit sur l'immeuble, la fiche se rafraîchit, et l'onglet
     — qui porte une clé calculée sur la date de modification — se remonte
     complètement : la saisie en cours partait avec. La mémoire d'écran survit
     à ce remontage, et le témoin de `useMemoireServie` fait la part des
     choses : tant que personne n'a touché à une case, c'est la fiche qui la
     remplit ; dès qu'on écrit dedans, c'est la saisie qui prime. */
  const cleMem = `plu:${immeubleId}:`;
  const [zone, setZone] = useMemoireServie(`${cleMem}zone`, S(im.plu_zone));
  const [typeZone, setTypeZone] = useMemoireServie(`${cleMem}type`, S(im.plu_Type_zone));
  const [hauteur, setHauteur] = useMemoireServie(`${cleMem}hauteur`, S(num(im.plu_hauteur)));
  const [emprise, setEmprise] = useMemoireServie(`${cleMem}emprise`, S(num(im.plu_emprise)));

  const pluServi = JSON.stringify([
    S(im.plu_zone), S(im.plu_Type_zone), S(num(im.plu_hauteur)), S(num(im.plu_emprise)),
  ]);
  const pluCourant = JSON.stringify([zone, typeZone, hauteur, emprise]);
  const pluModifie = pluCourant !== pluServi;

  const savePlu = () =>
    start(async () => {
      await updateEmplacement(immeubleId, {
        plu_zone: zone || undefined, plu_Type_zone: typeZone || undefined,
        plu_hauteur: parse(hauteur), plu_emprise: parse(emprise),
      });
      /* La mémoire d'écran a fait son office : une fois enregistré, on la
         vide pour que la fiche redevienne la seule source. */
      for (const k of ["zone", "type", "hauteur", "emprise"]) oublier(`${cleMem}${k}`);
    });

  /* Encadré or : la surface et la façade du terrain, somme des parcelles.
     À défaut de parcelles chiffrées, on garde la valeur déjà en fiche. */
  const totalP = (cle: string) =>
    b.parcelles.reduce((s, p) => s + (num(p[cle]) ?? 0), 0);
  const surface = totalP("superficie") || num(im.ter_surface);
  const facade = totalP("facade") || num(im.ter_facade);

  /* Les liens ouvrent directement le bien : le point d'adresse est déjà
     géocodé, on s'en sert pour centrer le cadastre et le Géoportail (#80). */
  const geo = b.adr?.geo as { lat?: number; lng?: number } | undefined;
  const lat = num(geo?.lat);
  const lon = num(geo?.lng);
  /* Retour #293 — « dans le presse-papier j'ai que la rue et la ville, j'ai
     pas le numéro avec, c'est relou ». Le numéro manquait bel et bien ici,
     alors que le reste de l'écran le colle. Sans lui, le cadastre et le
     Géoportail rendent toute la rue : il faut retrouver le bâtiment à l'œil. */
  const adresse = [
    [S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" "),
    S(im.adresse_zipcode), S(im.adresse_ville),
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
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
  /* Retour #295 — « si t'as un lien vers le simulateur du cadastre qui me mène
     directement vers la page où on peut mesurer les façades et prendre les
     captures c'est top aussi ; mais c'est des fenêtres qui s'autoferment. »
     C'est exactement ça : l'adresse qu'il a relevée porte un `CSRF_TOKEN` lié à
     sa session du moment. Recopiée telle quelle, elle ne rouvre rien — le site
     renvoie sur son accueil. Les deux points d'entrée qui, eux, marchent
     toujours sont la recherche par adresse et la recherche par parcelle ;
     l'adresse et la référence partent au presse-papiers en même temps. */
  const lienCadastreParcelle = "https://www.cadastre.gouv.fr/scpc/rechercherParRefFiscale.do";
  /* Le PLU d'une commune, servi par le Géoportail de l'urbanisme. Il n'existe
     pas d'adresse qui rende la zone en clair : on ouvre la carte au bon
     endroit, la zone se lit dessus. */
  const lienGpu =
    lat !== undefined && lon !== undefined
      ? `https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=${lon}&lat=${lat}&zoom=18`
      : "https://www.geoportail-urbanisme.gouv.fr/map/";

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

  const sansParcelle = b.parcelles.length === 0;

  return (
    <>
      {/* Retour #295 — « reprends donc exactement la présentation du BO (en
          laissant les 3 liens d'accès rapide que t'as mis en haut, c'est top).
          Donc l'encadré TERRAIN que t'as déjà mis est bien. Ensuite un encadré
          parcelle avec le titre au-dessus, qui est rouge tant qu'on n'a pas
          rempli […] À droite de l'encadré parcelle y'a l'encadré plan de
          parcelle qui reste rouge tant qu'il n'y a pas ce qu'il faut de
          rempli. »
          Le titre porte donc ses liens à droite, l'encadré parcelle et le plan
          se répondent sur une même ligne, et chacun rougit tant qu'il manque —
          ce sont les deux pièces qui bloquent le dossier. */}
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
          <span className={`fchip${sansParcelle ? " off" : ""}`}>
            {b.parcelles.length > 1 ? "Parcelles" : "Parcelle"} <b>{b.parcelles.length}</b>
          </span>
        </div>
      </div>

      <div className="fsub-l">
        <span className="fsub">Parcelles</span>
        <span className="sp" style={{ flex: 1 }} />
        {/* #175 — chacun de ces sites demande l'adresse dans son propre champ
            de recherche : on la met au presse-papiers en partant. */}
        <a className="mopt" href={lienCadastre} target="_blank" rel="noreferrer"
          onClick={() => copierTexte(adresse)}>Cadastre ↗</a>
        {/* #176 — le cadastre officiel, celui dont MAV a l'habitude. Son
            formulaire ne se pilote pas par l'URL (c'est une vieille appli en
            POST) : le lien ouvre la recherche, l'adresse est déjà copiée. */}
        <a className="mopt" href="https://www.cadastre.gouv.fr/scpc/rechercherPlan.do"
          target="_blank" rel="noreferrer" onClick={() => copierTexte(adresse)}>cadastre.gouv ↗</a>
        <a className="mopt" href={lienCadastreParcelle} target="_blank" rel="noreferrer"
          title="Recherche par référence cadastrale — la référence part au presse-papiers"
          onClick={() => copierTexte(b.parcelles.map((p) => S(p.ref_cadastre)).find((x) => x) || adresse)}>
          par parcelle ↗
        </a>
      </div>

      {/* Retour #295 — « écris plutôt Remplir automatiquement les parcelles, et
          mets le bouton en évidence pour qu'on soit tenté de cliquer direct. »
          Il fait gagner la saisie entière : il mérite mieux qu'une option
          grise au bout d'une rangée de liens. */}
      {lat !== undefined && lon !== undefined && (
        <button type="button" className="terr-auto" disabled={rechCadastre}
          onClick={chercherParcelles}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
            <circle cx="12" cy="12" r="3.4" />
          </svg>
          {rechCadastre ? "Recherche au cadastre…" : "Remplir automatiquement les parcelles"}
        </button>
      )}

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
              <p className="terr-prop-n">
                Le cadastre ne publie pas la longueur de façade : elle se mesure sur le plan et
                se saisit ci-dessous, parcelle par parcelle.
              </p>
            </>
          )}
        </div>
      )}

      <div className="terr-duo">
        <div className={`terr-box${sansParcelle ? " manque" : ""}`}>
          {b.parcelles.map((p) => (
            <LigneParcelle key={String(p._id)} immeubleId={immeubleId} p={p} />
          ))}
          {/* Le cadre de saisie reste ouvert en permanence : c'est lui que MAV
              décrit (« la possibilité d'ajouter une parcelle qui rouvre le même
              cadre quand il y en a plusieurs »). */}
          <div className="terr-saisie">
            <span className="ic">
              <svg viewBox="0 0 24 24"><path d="M4 5h7v7H4zM13 12h7v7h-7zM4 12h7v7H4z" /></svg>
            </span>
            <div className="ch">
              <label>Parcelle
                <input className="min" value={ref} placeholder="ex. 000 SX 148"
                  onChange={(e) => setRef(e.target.value)} />
              </label>
              <label>Façade
                <input className="min" value={fac} placeholder="m" inputMode="decimal"
                  onChange={(e) => setFac(e.target.value)} />
              </label>
              <label>Superficie
                <input className="min" value={sup} placeholder="m²" inputMode="decimal"
                  onChange={(e) => setSup(e.target.value)} />
              </label>
            </div>
          </div>
          <button
            className="terr-add" type="button" disabled={pending || !ref.trim()}
            onClick={() =>
              start(async () => {
                await addParcelle(immeubleId, {
                  ref_cadastre: ref.trim(), superficie: parse(sup), facade: parse(fac),
                });
                setRef(""); setSup(""); setFac("");
              })
            }
          >+ Ajouter une parcelle</button>
        </div>

        {/* Un seul enfant de grille : `PhotoParcelle` rend un fragment, et ses
            deux éléments — le titre puis l'image — seraient tombés dans deux
            cases distinctes, le titre à droite et l'image sous la parcelle. */}
        <div className="terr-col">
          <PhotoParcelle immeubleId={immeubleId} source={S(im.ter_parcelle_img)} />
        </div>
      </div>

      <div className="fsub-l" style={{ marginTop: 18 }}>
        <span className="fsub">Plan Local d&apos;Urbanisme (PLU)</span>
        <span className="sp" style={{ flex: 1 }} />
        {/* Retour #295 — « pour le plan d'urbanisme je veux aussi que tu fasses
            le petit encadré avec le titre au-dessus et les liens qui permettent
            d'aller sur Géoportail pré-rempli. Après pareil, si t'as un site qui
            extrait le PLU selon une adresse, c'est top. »
            Le Géoportail de l'urbanisme est le service officiel : il centre sur
            le point et affiche le zonage de la commune. Aucun service ne rend
            la zone, la hauteur et l'emprise en texte — ces trois valeurs sortent
            du règlement, qui est un PDF par commune. On ouvre donc la carte à
            la bonne parcelle, et les quatre cases restent à recopier. */}
        <a className="mopt" href={lienGpu} target="_blank" rel="noreferrer"
          onClick={() => copierTexte(adresse)}>Géoportail Urbanisme ↗</a>
        <a className="mopt" href={lienGeoportail} target="_blank" rel="noreferrer"
          onClick={() => copierTexte(adresse)}>Géoportail ↗</a>
        <a className="mopt" href={lienGoogle} target="_blank" rel="noreferrer"
          onClick={() => copierTexte(adresse)}>Google ↗</a>
      </div>

      <div className="terr-box plu">
        <label className={zone ? "" : "manque"}>
          <span className="k">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6" /><circle cx="12" cy="12" r="3" /></svg>
            Zone
          </span>
          <input className="min" value={zone} onChange={(e) => setZone(e.target.value)} />
        </label>
        <label className={typeZone ? "" : "manque"}>
          <span className="k">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6" /><path d="M12 11v5.5M12 8h.01" /></svg>
            Type de zone
          </span>
          <input className="min" value={typeZone} onChange={(e) => setTypeZone(e.target.value)} />
        </label>
        <label className={hauteur ? "" : "manque"}>
          <span className="k">
            <svg viewBox="0 0 24 24"><path d="M12 20V4M8 8l4-4 4 4M8 16l4 4 4-4" /></svg>
            Hauteur max
          </span>
          <input className="min" value={hauteur} inputMode="decimal"
            onChange={(e) => setHauteur(e.target.value)} />
          <i>m</i>
        </label>
        <label className={emprise ? "" : "manque"}>
          <span className="k">
            <svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" /></svg>
            Emprise max
          </span>
          <input className="min" value={emprise} inputMode="decimal"
            onChange={(e) => setEmprise(e.target.value)} />
          <i>%</i>
        </label>
      </div>
      <BarreEnregistrer modifie={pluModifie} pending={pending} onEnregistrer={savePlu} />
    </>
  );
}

/**
 * Une parcelle déjà au dossier, corrigeable sur place (retour #295).
 *
 * MAV : « quand je clique sur ajouter les parcelles trouvées, il faut quand
 * même que je puisse ajouter la longueur de façade. » Le cadastre donne la
 * référence et la superficie, jamais la façade : elle se mesure sur le plan.
 * La ligne était en lecture seule — il fallait supprimer la parcelle et la
 * ressaisir, en perdant au passage la superficie officielle.
 */
function LigneParcelle({ immeubleId, p }: {
  immeubleId: string; p: Record<string, unknown>;
}) {
  const id = String(p._id);
  const [pending, start] = useTransition();
  const { confirmer, question } = useQuestion();
  const [refP, setRefP] = useState(S(p.ref_cadastre));
  const [supP, setSupP] = useState(S(num(p.superficie)));
  const [facP, setFacP] = useState(S(num(p.facade)));

  /* Les valeurs suivent la fiche tant que personne ne tape par-dessus : c'est
     ce qui fait qu'une superficie corrigée ailleurs arrive ici. */
  const servi = JSON.stringify([S(p.ref_cadastre), S(num(p.superficie)), S(num(p.facade))]);
  const [vu, setVu] = useState(servi);
  if (vu !== servi) {
    setVu(servi);
    setRefP(S(p.ref_cadastre)); setSupP(S(num(p.superficie))); setFacP(S(num(p.facade)));
  }

  const enregistrer = () => {
    if (JSON.stringify([refP, supP, facP]) === servi) return;
    start(() => updateParcelle(immeubleId, id, {
      ref_cadastre: refP.trim() || undefined,
      superficie: parse(supP) ?? null,
      facade: parse(facP) ?? null,
    }));
  };

  return (
    <div className={`terr-saisie${pending ? " off" : ""}`}>
      <span className="ic">
        <svg viewBox="0 0 24 24"><path d="M4 5h7v7H4zM13 12h7v7h-7zM4 12h7v7H4z" /></svg>
      </span>
      <div className="ch">
        <label>Parcelle
          <input className="min" value={refP} onChange={(e) => setRefP(e.target.value)} onBlur={enregistrer} />
        </label>
        <label>Façade
          <input className="min" value={facP} placeholder="m" inputMode="decimal"
            onChange={(e) => setFacP(e.target.value)} onBlur={enregistrer} />
        </label>
        <label>Superficie
          <input className="min" value={supP} placeholder="m²" inputMode="decimal"
            onChange={(e) => setSupP(e.target.value)} onBlur={enregistrer} />
        </label>
      </div>
      <button className="xdel" type="button" title="Retirer la parcelle"
        onClick={async () => {
          if (!(await confirmer("Retirer cette parcelle ?", { danger: true, oui: "Retirer" }))) return;
          start(() => deleteParcelle(immeubleId, id));
        }}>✕</button>
      {question}
    </div>
  );
}

/** Plan de la parcelle entourée : dépôt puis affichage (champ BO
 *  `ter_parcelle_img`). La même image sert au dossier de vente. */
function PhotoParcelle({ immeubleId, source }: { immeubleId: string; source: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const { confirmer, question } = useQuestion();
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
      <div className="fsub">Plan de la parcelle</div>
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
              onClick={async () => {
                if (!(await confirmer("Retirer le plan de la parcelle ?", { danger: true, oui: "Retirer" }))) return;
                start(async () => { await supprimerPhotoParcelle(immeubleId); setUrl(undefined); });
              }}
            >Retirer</button>
          </div>
        </div>
      ) : (
        /* Retour #237 : « le plan de parcelle, quand il manque, j'aimerais que
           tu mettes le cadre en rouge et un gros picto qui brille au survol
           pour dire de déposer une copie ici. » Il bloque la génération du
           dossier : il doit se voir comme tel, pas comme une ligne de texte
           grise parmi d'autres. */
        <div
          className="carte-drop terr-drop manque"
          onPaste={(e) => envoyer([...e.clipboardData.files][0])}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); envoyer(e.dataTransfer.files[0]); }}
          onClick={() => input.current?.click()}
          tabIndex={0}
          role="button"
        >
          <svg className="terr-ic" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 16V4M8 8l4-4 4 4" />
            <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
          </svg>
          <b>{pending ? "Envoi…" : "Déposez le plan avec la parcelle entourée"}</b>
          <span>Cliquez, collez une capture, ou glissez le fichier ici</span>
        </div>
      )}
      <input ref={input} type="file" accept="image/*" hidden
        onChange={(e) => envoyer(e.target.files?.[0])} />
      {question}
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
        {dests.map((d) => (
          <VignetteSecteur key={d} b={b} dest={d} poids={poids} commune={commune} />
        ))}
      </div>
    </>
  );
}

/** Les repères de marché d'une destination, tels que la modale les lit. */
type RepDest = {
  reperes: Reperes | null;
  ue: { loyer: ValeurUE | null; prix: ValeurUE | null } | null;
};

/**
 * Lit les repères d'une destination — loyers d'annonce et DVF pour les
 * logements, unemplacement.com pour les bureaux, commerces et entrepôts.
 *
 * Retour #391 : « pour les prix du secteur en automatique, comme ça va les
 * chercher directement, j'aimerais que ça se mette en automatique, pas juste
 * quand je clique sur la vignette. » La lecture vivait dans la modale, donc
 * n'avait lieu qu'à son ouverture. Elle est ici, partagée : la vignette la
 * lance à l'ouverture de l'onglet et la passe à la modale, qui ne relit rien.
 * `actif` à faux tant qu'on n'en a pas besoin (la modale de l'estimation).
 */
function useReperesSecteur(
  dest: string, commune: { code?: string; nom?: string } | undefined, b: BienData, actif: boolean,
): RepDest {
  const [reperes, setReperes] = useState<Reperes | null>(null);
  const [ue, setUe] = useState<RepDest["ue"]>(null);
  const cp = S(b.im.adresse_zipcode);
  const ville = S(b.im.adresse_ville);
  const ueLoyer = urlUnemplacement(dest, { cp, ville, insee: commune?.code }, "loyer");

  useEffect(() => {
    if (!actif || !commune?.code || reperes) return;
    fetch(`/api/reperes?insee=${commune.code}&destination=${encodeURIComponent(dest)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Reperes | null) => { if (d) setReperes(d); })
      .catch(() => {});
  }, [actif, commune?.code, dest, reperes]);

  useEffect(() => {
    if (!actif || !ueLoyer || ue) return;
    const q = new URLSearchParams({ dest, cp, ville, insee: commune?.code ?? "" });
    fetch(`/api/unemplacement?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RepDest["ue"]) => { if (d) setUe(d); })
      .catch(() => {});
  }, [actif, ueLoyer, ue, dest, cp, ville, commune?.code]);

  return { reperes, ue };
}

/** Ce qu'une destination affiche : la valeur retenue, sinon le repère. Le
 *  loyer est dans l'unité de l'écran (`loyerAffiche`), comme dans la modale. */
function valeursSecteur(sect: Record<string, unknown>, dest: string, rep: RepDest) {
  const prefix = DEST_PREFIX[dest] ?? "autre";
  const loyerRetenu = num(sect[`${prefix}_loyer_retenu`]);
  const prixRetenu = num(sect[`${prefix}_prix_retenu`]);
  const rentaRetenue = num(sect[`${prefix}_renta_retenu`]);
  const loyerRep = rep.ue?.loyer ? rep.ue.loyer.valeur
    : rep.reperes?.loyer ? Math.round(rep.reperes.loyer.valeur * 100) / 100 : undefined;
  const prixRep = rep.ue?.prix ? Math.round(rep.ue.prix.valeur) : rep.reperes?.prix?.valeur;
  const loyer = loyerRetenu !== undefined ? loyerAffiche(loyerRetenu, dest) : loyerRep;
  const prix = prixRetenu ?? prixRep;
  const loyerMensuel = loyerStocke(loyer, dest);
  const renta = rentaRetenue ?? (loyerMensuel && prix ? Math.round((loyerMensuel * 12 * 1000) / prix) / 10 : undefined);
  /* Retour #391 : confirmée destination par destination ; à défaut, le
     drapeau global que Bubble posait sur tout le relevé fait foi, pour que
     les relevés vérifiés avant nous ne rougissent pas d'un coup. */
  const drapeau = sect[`${prefix}_check_ok`];
  const confirme = drapeau === true || (drapeau === undefined && sect["0 - check_ok"] === true);
  return {
    loyer, prix, renta, confirme,
    /** Au moins un chiffre affiché vient d'un repère, pas de la fiche. */
    auto: (loyerRetenu === undefined && loyer !== undefined) || (prixRetenu === undefined && prix !== undefined),
    quoi: rep.ue?.loyer || rep.ue?.prix ? "unemplacement.com"
      : rep.reperes?.prix ? `DVF ${rep.reperes.prix.millesime}` : "",
  };
}

/**
 * La vignette d'une destination (retours #390 et #391).
 *
 * #390 : « sur le BO actuel on n'a pas de bouton Modifier, on clique sur la
 * vignette et ça marche. » La vignette entière ouvre la modale.
 * #391 : les repères se posent d'eux-mêmes à l'ouverture ; la vignette reste
 * rouge tant qu'un agent n'a pas confirmé ou modifié — « Confirmer » l'inscrit
 * en base avec les chiffres affichés, et elle passe au vert.
 */
function VignetteSecteur({ b, dest, poids, commune }: {
  b: BienData; dest: string; poids: { dest: string; carrez: number }[];
  commune: { code?: string; nom?: string };
}) {
  const sect = b.secteur ?? {};
  const lots = b.lots;
  const [pending, start] = useTransition();
  const rep = useReperesSecteur(dest, commune, b, true);
  const v = valeursSecteur(sect, dest, rep);
  const duType = lots.filter((l) => String(l.Destination ?? "") === dest);
  const surf = duType.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
  /* Retours #269 et #270 : la vignette parle l'unité du marché. Une cave ou
     une place se compte à l'unité — c'est le NOMBRE de lots qui multiplie,
     pas une surface qu'ils n'ont pas ; un commerce se cote au m² par an. Le
     stock, lui, reste mensuel. */
  const u = uniteSecteur(dest);
  const quantite = u.parLot ? duType.length : surf;
  const loyerMensuel = loyerStocke(v.loyer, dest);
  const loyerAnD = loyerMensuel !== undefined && quantite > 0 ? loyerMensuel * quantite * 12 : undefined;
  const complet = v.loyer !== undefined && v.prix !== undefined;

  const confirmerValeurs = () =>
    start(() =>
      saveSecteurDest(
        String(b.im._id),
        b.secteur ? String(b.secteur._id ?? "") || null : null,
        dest,
        { loyer: loyerMensuel, prix: v.prix, renta: v.renta, check_ok: true },
        poids,
      ));

  /* Un chiffre de la vignette : ambre quand il vient d'un repère. */
  const val = (x: string | undefined, unite: string, nc: string) =>
    x !== undefined
      ? <b className={v.auto ? "repere" : ""}>{x} <i>{unite}</i></b>
      : <b className="nc">{nc}</b>;

  return (
    <EditSecteurBtn
      b={b} dest={dest} poids={poids} commune={commune} rep={rep}
      declencheur={(ouvrir) => (
        <div
          className={`sect-vg cliquable${v.confirme ? " ok" : " manque"}`}
          role="button" tabIndex={0} title="Modifier les valeurs du secteur"
          onClick={ouvrir}
          onKeyDown={(e) => { if (e.key === "Enter") ouvrir(); }}
        >
          <div className="sv-h">
            <b>{PLURIELS[dest] ?? `${dest}s`}</b>
            <span>
              {u.parLot
                ? `${duType.length} ${duType.length > 1 ? `${u.lot}s` : u.lot}`
                : `${Math.round(surf).toLocaleString("fr-FR")} m² carrez`}
            </span>
          </div>
          <div className="sv-l">
            <svg viewBox="0 0 24 24"><path d="M3 12h11M10 8l4 4-4 4" /><path d="M15 4h6v16h-6" /></svg>
            {val(v.loyer !== undefined ? fr1(v.loyer) : undefined, u.loyerUnite, "loyer n.c.")}
            {loyerAnD !== undefined && <span className="chip">{Math.round(loyerAnD / 1000).toLocaleString("fr-FR")} k€/an</span>}
          </div>
          <div className="sv-l">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M15 9.2c-.7-.8-1.8-1.2-3-1.2-1.7 0-2.7.8-2.7 1.9 0 2.7 5.7 1.3 5.7 4.1 0 1.2-1.1 2-2.9 2-1.3 0-2.4-.4-3.1-1.2M12 6.2v11.6" /></svg>
            {val(v.prix !== undefined ? Math.round(v.prix).toLocaleString("fr-FR") : undefined, u.prixUnite, "prix n.c.")}
            {v.prix !== undefined && quantite > 0 && <span className="chip">{Math.round(v.prix * quantite).toLocaleString("fr-FR")} €</span>}
          </div>
          <div className="sv-l">
            <svg viewBox="0 0 24 24"><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></svg>
            {val(v.renta !== undefined ? fr1(v.renta) : undefined, "%", "renta n.c.")}
            {v.renta !== undefined && loyerAnD !== undefined && v.renta > 0 && (
              <span className="chip">{Math.round(loyerAnD / (v.renta / 100)).toLocaleString("fr-FR")} €</span>
            )}
          </div>
          <div className="sv-f">
            {v.confirme ? (
              <span className="sv-etat">✓ Vérifié</span>
            ) : (
              <>
                {/* MAV, 25/09 : « pas de bouton Confirmer sur la vignette,
                    c'est seulement quand on ouvre — ça permet de vérifier sur
                    les sites avant de confirmer ». La vignette dit l'état, la
                    fenêtre porte la confirmation. */}
                <span className="sv-etat">
                  {v.auto ? `Repères ${v.quoi} — à vérifier` : complet ? "À vérifier" : "À renseigner"}
                </span>
                <span className="sv-ouvrir">ouvrir pour confirmer ›</span>
              </>
            )}
          </div>
        </div>
      )}
    />
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
  /* #156 — c'était la pastille SeLoger qui s'affichait sur le lien
     LocalCommercial. Chaque site a désormais la sienne. */
  localcommercial: <span className="mq lc">LC</span>,
  unemplacement: <span className="mq ue">UE</span>,
  /* Le marché des caves et des places ne se lit que dans les annonces
     (retour #270) : leboncoin en publie le plus gros volume. */
  leboncoin: <span className="mq lbc">lbc</span>,
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
  icone, libelle, unite, aide, valeur, onChange, decimales = 0, calcule, repere, aRemplacer, lien,
}: {
  icone: React.ReactNode; libelle: string; unite?: string;
  /** Pourquoi cette unité-là (retours #269, #270) : la convention du métier
   *  se rappelle sous le champ, sinon on saisit un loyer annuel au mois. */
  aide?: string;
  valeur: string; onChange?: (v: string) => void;
  decimales?: number;
  /** Champ déduit des autres : affiché, jamais saisi. */
  calcule?: boolean;
  /** Ordre de grandeur du marché, rappelé sous le champ. */
  repere?: React.ReactNode;
  /** La valeur affichée vient du repère : elle attend d'être vérifiée. */
  aRemplacer?: boolean;
  /** La page qui donne CE chiffre-là, ouverte depuis le champ (#157). */
  lien?: { href: string; titre: string; marque: React.ReactNode; onClick?: () => void };
}) {
  const vide = valeur === "";
  return (
    <div className={`sf${calcule ? " calc" : vide ? " requis" : aRemplacer ? " repere" : ""}`}>
      {lien ? (
        <a className="sf-ic sf-lien" href={lien.href} target="_blank" rel="noreferrer"
          title={lien.titre} onClick={lien.onClick}>{lien.marque}</a>
      ) : (
        <span className="sf-ic"><svg viewBox="0 0 24 24">{icone}</svg></span>
      )}
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
        {aide && <span className="sf-aide">{aide}</span>}
        {repere && <span className="sf-rep">{repere}</span>}
      </span>
    </div>
  );
}

/**
 * La modale « valeurs du secteur », et son bouton.
 *
 * Exportée parce que l'estimation s'en sert aussi (#161) : « si on n'a pas
 * encore rempli on devrait pouvoir le faire depuis ici avec les mêmes options,
 * donc on clique sur le picto de destination et on a la même modale que dans
 * les prix sur emplacement, et ça modifie aussi là-bas. » Une seule modale,
 * un seul enregistrement, deux endroits d'où l'ouvrir — d'où `declencheur`,
 * qui remplace le bouton « Modifier » par ce que l'appelant veut.
 */
export function EditSecteurBtn({ b, dest, poids, commune, declencheur, rep }: {
  b: BienData; dest: string; poids: { dest: string; carrez: number }[];
  /** Commune officielle (code INSEE + nom) pour l'URL SeLoger. */
  commune?: { code?: string; nom?: string };
  /** Bouton d'ouverture sur mesure. Par défaut, le « Modifier » du BO. */
  declencheur?: (ouvrir: () => void) => React.ReactNode;
  /** Repères déjà lus par la vignette (#391) ; sinon la modale les lit à l'ouverture. */
  rep?: RepDest;
}) {
  const immeubleId = String(b.im._id);
  const sect = b.secteur ?? {};
  const prefix = DEST_PREFIX[dest] ?? "autre";
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  /* Retours #269 et #270 : chaque destination se cote dans SON unité. La base
     garde un loyer mensuel ; on ne convertit qu'à l'entrée et à la sortie de
     l'écran, pour que rien d'autre ne change en aval. */
  const unite = uniteSecteur(dest);
  const [loyer, setLoyer] = useState(S(loyerAffiche(num(sect[`${prefix}_loyer_retenu`]), dest)));
  const [prix, setPrix] = useState(S(num(sect[`${prefix}_prix_retenu`])));
  const [comment, setComment] = useState(S(sect[`${prefix}_commentaire`]));

  /* Repères de marché (loyers d'annonce du ministère, ventes DVF). Ils
     donnent l'ordre de grandeur avant la saisie vérifiée : ils préremplissent
     un champ vide, et restent affichés sous le champ pour se situer. Le
     chiffre retenu, lui, reste celui que l'agent tape. */
  /* Bureaux, commerces, entrepôts : ni les loyers d'annonce du ministère ni
     DVF ne les cotent. unemplacement.com les publie commune par commune, on
     va les y chercher (#157). La lecture est dans `useReperesSecteur` : quand
     la vignette l'a déjà faite (#391), la modale reprend son résultat. */
  const lus = useReperesSecteur(dest, commune, b, open && !rep);
  const { reperes, ue } = rep ?? lus;
  const prerempli = useRef({ loyer: false, prix: false });

  /* Les repères préremplissent un champ vide, et seulement lui — le chiffre
     retenu reste celui que l'agent tape. Le site spécialisé passe devant les
     sources générales, comme avant. */
  useEffect(() => {
    const loyerRep = ue?.loyer ? String(ue.loyer.valeur)
      : reperes?.loyer ? String(Math.round(reperes.loyer.valeur * 100) / 100) : undefined;
    const prixRep = ue?.prix ? String(Math.round(ue.prix.valeur))
      : reperes?.prix ? String(reperes.prix.valeur) : undefined;
    if (loyerRep) setLoyer((v) => { if (v) return v; prerempli.current.loyer = true; return loyerRep; });
    if (prixRep) setPrix((v) => { if (v) return v; prerempli.current.prix = true; return prixRep; });
  }, [reperes, ue]);

  /* Le rendement n'est pas une saisie : c'est le loyer annuel rapporté au
     prix. Le laisser à la main, c'est laisser entrer une incohérence. */
  const loyerMensuel = loyerStocke(parse(loyer), dest);
  const renta =
    loyerMensuel && parse(prix) ? String(Math.round((loyerMensuel * 12 * 1000) / parse(prix)!) / 10) : "";

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

  /* #155 — la page des notaires existait au département, alors que leur outil
     descend à la commune : « l'url ne mène que pour la Gironde alors que
     l'immeuble est à Bordeaux ». Leur application lit `typeLocalisation` et
     `codeInsee` dans l'URL et accepte COMMUNE comme ARRONDISSEMENT ; c'est ce
     dernier qu'il faut pour Paris, Lyon et Marseille, dont le code INSEE que
     nous portons est déjà celui de l'arrondissement. Sans code INSEE, on
     retombe proprement sur le département. */
  const arrondissement = /^(?:751|6938|132)\d\d$/.test(commune?.code ?? "");
  const lienNotaires = commune?.code
    ? `https://www.immobilier.notaires.fr/fr/prix-immobilier?typeLocalisation=${
        arrondissement ? "ARRONDISSEMENT" : "COMMUNE"
      }&codeInsee=${commune.code}&neuf=A`
    : `https://www.immobilier.notaires.fr/fr/prix-immobilier?typeLocalisation=DEPARTEMENT&codeInsee=${dept}&neuf=A`;

  /* #156 — LocalCommercial range ses estimations de loyer par code postal et
     nom de ville. On passait par une recherche Google, qui tombait sur Google.
     MAV : « https://www.localcommercial.net/estimation-loyer-ville/33000/
     bordeaux ». */
  const lienLocalCommercial = cp && ville
    ? `https://www.localcommercial.net/estimation-loyer-ville/${cp}/${slugVille(ville)}`
    : "https://www.localcommercial.net/estimation-loyer-ville";

  /* #157/#158 — bureaux, commerces et entrepôts : unemplacement.com. Un lien
     par champ, posé en face du champ qu'il remplit (plus bas), et celui-ci en
     tête reste LocalCommercial, « qui me sert moins souvent ». */
  const ueLoyer = urlUnemplacement(dest, { cp, ville, insee: commune?.code }, "loyer");
  const uePrix = urlUnemplacement(dest, { cp, ville, insee: commune?.code }, "prix");

  const liens: { cle: string; label: string; href: string }[] =
    unite.parLot
    ? [
        // Les annonces de la commune, achat puis location : c'est le seul
        // marché publié pour une cave ou une place (retour #270).
        { ...annoncesLot(dest, { ville, cp }, "vente")[0], label: "leboncoin — ventes" },
        { ...annoncesLot(dest, { ville, cp }, "location")[0], label: "leboncoin — locations" },
        { ...annoncesLot(dest, { ville, cp }, "vente")[1], label: "SeLoger" },
      ].filter((l) => l.href)
    : ueLoyer
      ? [
          /* Retour #268 : « mets le logo Un emplacement en haut à côté des
             autres liens, mais laisse à côté des trucs à rentrer ». Les deux
             ne servent pas au même moment — celui du haut ouvre le site avant
             de saisir, celui d'à côté du champ répond à CE chiffre-là. */
          { cle: "unemplacement", label: "Un emplacement", href: ueLoyer },
          { cle: "localcommercial", label: "LocalCommercial", href: lienLocalCommercial },
          { cle: "notaires", label: "Notaires", href: lienNotaires },
        ]
      : [
          // Une page par champ à remplir : les loyers pour le premier, les
          // prix pour le second, tous deux sur la commune du bien.
          { cle: "seloger", label: "Loyers", href: urlSeloger({ ...seloger, type: "location" }) },
          { cle: "seloger", label: "Prix", href: urlSeloger({ ...seloger, type: "vente" }) },
          { cle: "notaires", label: "Notaires", href: lienNotaires },
          ...(idf ? [{ cle: "notaires", label: "Notaires Paris", href: "https://paris.notaires.fr/fr/carte-des-prix" }] : []),
        ];

  /* Le BO n'enregistre que si les deux valeurs qui servent aux calculs sont
     là : sans elles, ni rendement ni estimation. */
  const complet = parse(loyer) !== undefined && parse(prix) !== undefined;

  return (
    <>
      {declencheur
        ? declencheur(() => setOpen(true))
        : <button className="fadd" type="button" onClick={() => setOpen(true)}>Modifier</button>}
      {open && (
        <Modale
          titre="Modifier les valeurs du secteur" onFermer={() => setOpen(false)} className="sect-mod"
          pied={
            <>
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
                      {
                        loyer: loyerStocke(parse(loyer), dest), prix: parse(prix), renta: parse(renta),
                        commentaire: comment || undefined,
                        // Enregistrer depuis la modale, c'est avoir vérifié (#391).
                        check_ok: true,
                      },
                      poids,
                    );
                    setOpen(false);
                  })
                }
              >{pending ? "Enregistrement…" : "❯ Enregistrer"}</button>
            </>
          }
        >
          <div className="sm-liens">
            <b>{PLURIELS[dest] ?? `${dest}s`}</b>
            <span className="sp" />
            {/* #175 — ouvrir un site extérieur met l'adresse au presse-
                papiers : sur toutes ces pages, le premier geste est de la
                coller dans leur champ de recherche. */}
            {liens.map((l, i) => (
              <a key={i} className="sm-lk" href={l.href} target="_blank" rel="noreferrer"
                onClick={() => copierTexte(adresse)}>
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
            unite={unite.loyerUnite}
            aide={unite.loyerAide}
            valeur={loyer}
            onChange={(v) => { prerempli.current.loyer = false; setLoyer(v); }}
            decimales={2}
            lien={ueLoyer ? {
              href: ueLoyer, titre: "Loyers du secteur sur unemplacement.com",
              marque: MARQUES.unemplacement, onClick: () => copierTexte(adresse),
            } : undefined}
            repere={ue?.loyer ? (
              <>
                <b>{fr2(ue.loyer.valeur)} €/m²/mois</b> — unemplacement.com
                {ue.loyer.au ? `, au ${ue.loyer.au}` : ""}
                {ue.loyer.bas !== undefined && ` · fourchette ${fr2(ue.loyer.bas)} à ${fr2(ue.loyer.haut!)} €`}
              </>
            ) : reperes?.loyer && (
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
            libelle="Prix du secteur" unite={unite.prixUnite}
            valeur={prix}
            onChange={(v) => { prerempli.current.prix = false; setPrix(v); }}
            lien={uePrix ? {
              href: uePrix, titre: "Prix de vente du secteur sur unemplacement.com",
              marque: MARQUES.unemplacement, onClick: () => copierTexte(adresse),
            } : undefined}
            repere={ue?.prix ? (
              <>
                <b>{Math.round(ue.prix.valeur).toLocaleString("fr-FR")} €/m²</b> — unemplacement.com
                {ue.prix.au ? `, au ${ue.prix.au}` : ""}
                {ue.prix.bas !== undefined && ` · fourchette ${Math.round(ue.prix.bas).toLocaleString("fr-FR")} à ${Math.round(ue.prix.haut!).toLocaleString("fr-FR")} €`}
              </>
            ) : reperes?.prix && (
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
        </Modale>
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
