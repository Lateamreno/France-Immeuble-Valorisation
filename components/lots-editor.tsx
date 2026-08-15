"use client";

// Tableau des lots — réplique de l'onglet État locatif > Lots du BO.
// Retours MAV du 11/08 pris en compte : sélecteur de colonnes (gauche),
// sélecteur de destinations avec compteurs qui recalcule les totaux (droite),
// unités dans les cellules, écarts %/m², en-tête sur 2 lignes sticky avec
// séparateurs gras entre groupes, barre d'outils sticky avec libellés +
// import/export, typologies filtrées par destination.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import { addLot, ajouterTypologie, deleteLot, duplicateLot, setLotTravaux, updateLots, type LotPatch } from "@/lib/bo/actions";
import {
  DESTINATIONS, ETATS_LOT as ETATS, TYPES_BAIL, TYPES_DPE as DPES, TYPES_LOT,
} from "@/lib/referentiels";

/* Pictogrammes des pastilles de synthèse, comme dans le BO (retour #42). */
const IC = {
  maison: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>,
  cle: <><circle cx="8" cy="14" r="4" /><path d="M11 11 20 2M16 6l2.5 2.5M13 9l2 2" /></>,
  lots: <><rect x="8" y="3" width="12" height="14" rx="1.6" /><path d="M16 20H5a1 1 0 0 1-1-1V7" /></>,
  surface: <><path d="M4 9V4h5M20 15v5h-5M4 4l7 7M20 20l-7-7" /></>,
  entree: <><path d="M3 12h11M10 8l4 4-4 4" /><path d="M15 4h6v16h-6" /></>,
  travaux: <><path d="M13 3 4 12l3.5 3.5L14 9M11 12l6 6M14 15l4 4" /></>,
};

/* Pictogramme de destination affiché dans la colonne « Dest. » du BO. */
const IC_DEST: Record<string, React.ReactNode> = {
  Logement: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>,
  Commerce: <><path d="M4 8h16l-1 12H5z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  Bureau: <><rect x="3" y="7" width="18" height="12" rx="1.5" /><path d="M9 7V5h6v2" /></>,
  Logistique: <><path d="M3 20V9l9-5 9 5v11z" /><path d="M9 20v-6h6v6" /></>,
  Cave: <><path d="M4 20V8l8-4 8 4v12z" /><path d="M9 20v-7h6v7" /></>,
  Parking: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M10 16V9h3a2.5 2.5 0 0 1 0 5h-3" /></>,
  Annexe: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 12h6" /></>,
};

/* Typologies proposées selon la destination (un bureau n'est jamais un T2). */
const TYPES_PAR_DESTINATION: Record<string, string[]> = {
  Logement: TYPES_LOT.filter((t) =>
    /^(Studio|T[1-7]|Duplex|Loft|Maison|Chambre)/.test(t)),
  Commerce: [
    "Boutique", "Local commercial", "Grande enseigne", "Espace de vente", "Show-room",
    "Agence de voyages", "Agence immobiliere", "Assurance", "Banque", "Boucherie",
    "Boulangerie", "Café", "Charcuterie", "Concession", "Epicerie", "Fromagerie",
    "Magasin d'ameublement", "Magasin de vetements", "Pharmacie", "Pizzeria",
    "Poissonnerie", "Poste", "Restaurant", "Salon de coiffure", "Supermarche", "Association",
  ],
  Bureau: ["Bureaux", "Plateau", "Local d'activites", "Show-room"],
  Logistique: ["Atelier", "Espace de stockage", "Local d'activites", "Reserve", "Sous-sol"],
  Cave: ["Cave", "Sous-sol", "Reserve"],
  Parking: ["Parking", "Box"],
  Annexe: ["WC", "Chambre", "Cave", "Box", "Autre"],
};
const typesFor = (dest: string, current?: string, ajouts: { destination: string; label: string }[] = []) => {
  const base = TYPES_PAR_DESTINATION[dest] ?? TYPES_LOT;
  const perso = ajouts.filter((t) => t.destination === dest).map((t) => t.label);
  const list = [...base, ...perso.filter((t) => !base.includes(t)), "Autre"];
  return current && !list.includes(current) ? [current, ...list] : list;
};

/** Cellule Typologie : liste filtrée par destination, et saisie libre dès que
 *  l'agent choisit « Autre » — avec proposition d'enregistrer la nouvelle
 *  typologie, doublons contrôlés (retour MAV #22). */
function CelluleTypologie({
  valeur, destination, ajouts, onChange,
}: {
  valeur: string;
  destination: string;
  ajouts: { destination: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const liste = typesFor(destination, valeur, ajouts);
  // Contrôle de doublon fait sur le référentiel seul : la valeur en cours de
  // saisie ne doit pas se déclarer elle-même en doublon.
  const reference = typesFor(destination, undefined, ajouts).filter((t) => t !== "Autre");
  const [libre, setLibre] = useState(false);
  const [texte, setTexte] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!libre) {
    return (
      <select className="lcell" value={valeur}
        onChange={(e) => {
          if (e.target.value === "Autre") { setLibre(true); setTexte(""); setMsg(null); }
          else onChange(e.target.value);
        }}>
        <option value="" />
        {liste.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }

  const enregistrer = () =>
    start(async () => {
      const r = await ajouterTypologie(destination, texte, reference);
      setMsg(r.message);
      if (r.ok) { onChange(texte.trim()); setLibre(false); }
    });

  return (
    <div className="tlibre">
      <input className="lcell" autoFocus value={texte} placeholder="Typologie…"
        onChange={(e) => { setTexte(e.target.value); setMsg(null); }}
        onBlur={() => { if (texte.trim()) onChange(texte.trim()); }}
        onKeyDown={(e) => { if (e.key === "Escape") setLibre(false); }} />
      <span className="tacts">
        <button type="button" title="Enregistrer cette typologie pour les prochains lots"
          disabled={pending || texte.trim().length < 2} onClick={enregistrer}>+</button>
        <button type="button" title="Revenir à la liste" onClick={() => setLibre(false)}>↺</button>
      </span>
      {msg && <span className="tmsg">{msg}</span>}
    </div>
  );
}

type Row = {
  id: string; isNew: boolean;
  /** Rang d'affichage choisi à la souris (#82) — il ne touche pas au numéro. */
  ordre: number;
  /** Travaux d'un lot pas encore enregistré (#84) : posés au moment du save. */
  travaux: string;
  batiment: string; etage: string; numero: string;
  Destination: string; Type_lot: string;
  surface_carrez: string; surface_sol: string;
  Type_bail: string; loyer: string; loyer_max: string;
  Etat: string; Type_dpe: string; renov_year: string;
  commentaire: string;
};

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const N = (s: string) => {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

function toRow(l: Record<string, unknown>, i: number, travaux = ""): Row {
  return {
    id: String(l._id), isNew: false,
    ordre: typeof l.ordre === "number" ? (l.ordre as number) : i,
    travaux,
    batiment: S(l.batiment), etage: S(l.etage), numero: S(l.numero),
    Destination: S(l.Destination), Type_lot: S(l.Type_lot),
    surface_carrez: S(l.surface_carrez), surface_sol: S(l.surface_sol),
    Type_bail: S(l.Type_bail), loyer: S(l.loyer), loyer_max: S(l.loyer_max),
    Etat: S(l.Etat), Type_dpe: S(l.Type_dpe), renov_year: S(l.renov_year),
    commentaire: S(l.commentaire),
  };
}

/** `avecOrdre` n'est vrai qu'après un glisser-déposer : sans cela, éditer un
 *  seul lot lui donnerait un rang que les autres n'ont pas. */
function toPatch(r: Row, avecOrdre = false): LotPatch {
  return {
    ...(avecOrdre ? { ordre: r.ordre } : null),
    batiment: r.batiment || undefined,
    etage: r.etage || undefined,
    numero: N(r.numero),
    Destination: r.Destination || undefined,
    Type_lot: r.Type_lot || undefined,
    surface_carrez: N(r.surface_carrez),
    surface_sol: N(r.surface_sol),
    Type_bail: r.Type_bail || undefined,
    loyer: N(r.loyer),
    loyer_max: N(r.loyer_max),
    Etat: r.Etat || undefined,
    Type_dpe: r.Type_dpe || undefined,
    renov_year: N(r.renov_year),
    commentaire: r.commentaire || undefined,
  };
}

/* Colonnes optionnelles, comme les bascules du BO. */
const OPTIONS = [
  { key: "batiment", label: "Batiment" },
  { key: "sol", label: "Surf. utile" },
  { key: "baux", label: "Baux" },
  { key: "m2", label: "Loyers/m²" },
  { key: "commentaire", label: "Commentaire" },
  { key: "photos", label: "Photos" },
] as const;
type OptKey = (typeof OPTIONS)[number]["key"];

/* Colonnes que le BO laisse tomber quand la fenêtre se resserre : il ne garde
   que l'étage, le numéro, la destination, le type, la surface Carrez, le type
   de bail, les loyers, l'état, le DPE et un bout de commentaire (retour #54). */
const OPTIONS_LARGES: OptKey[] = ["batiment", "sol", "baux", "m2", "photos"];
/** En dessous, les colonnes secondaires ne tiennent plus lisiblement. */
const SEUIL_COMPACT = 1000;

/* Largeurs relevées sur la capture du BO, en poids relatifs. Elles sont
   normalisées à 100 % sur les seules colonnes affichées : masquer une colonne
   ne doit pas faire grossir la case à cocher (retour #52). */
const POIDS: Record<string, number> = {
  bat: 2.1, etg: 2.0, num: 2.1, dest: 2.3, type: 6.8, carrez: 5.2, sol: 5.5,
  bail: 5.2, entree: 4.6, locataire: 8.8, hc: 4.9, hcm2: 3.8, hcmax: 4.9,
  hcmaxm2: 4.0, etat: 5.2, travaux: 6.1, dpe: 2.7, renov: 3.6,
  commentaire: 17.3, photos: 2.9,
};
/* En vue compacte il reste moins de colonnes : les repères (étage, numéro,
   destination) peuvent respirer, sinon ils tronquent leur contenu. */
const POIDS_COMPACT: Record<string, number> = { etg: 3.4, num: 3.4, dest: 3.2, renov: 4.2 };

const PLURIEL: Record<string, string> = {
  Logement: "Logements", Commerce: "Commerces", Bureau: "Bureaux",
  Logistique: "Entrepôts", Cave: "Caves", Parking: "Parkings", Annexe: "Annexes",
};

export function LotsEditor({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  /* Le montant des travaux du lot est une valeur de la ligne comme une autre :
     il attend le bouton Enregistrer, il ne part plus tout seul (#90). */
  const travauxDuLot = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of b.travaux) {
      if (!Array.isArray(t.LOTs)) continue;
      for (const id of t.LOTs as string[]) m.set(id, (m.get(id) ?? 0) + (typeof t.montant === "number" ? t.montant : 0));
    }
    return m;
  }, [b.travaux]);
  const initial = useMemo(
    () => b.lots.map((l, i) => toRow(l, i, String(travauxDuLot.get(String(l._id)) ?? ""))),
    [b.lots, travauxDuLot],
  );
  /* Point de retour de « Annuler » (#85) : la dernière version enregistrée. */
  const enregistre = useRef<Row[]>(initial);
  const [rows, setRows] = useState<Row[]>(initial);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  // Les colonnes de bail sont masquées par défaut : elles font doublon avec
  // l'onglet Baux et mangent la largeur utile (retour #52).
  const [opts, setOpts] = useState<Record<OptKey, boolean>>({
    batiment: true, sol: true, baux: false, m2: true, commentaire: true, photos: true,
  });
  const [destOff, setDestOff] = useState<Set<string>>(new Set());

  // Largeur réellement disponible : en dessous du seuil on bascule en vue
  // compacte plutôt que de comprimer vingt colonnes à 17 px.
  const wrap = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setCompact(e.contentRect.width < SEUIL_COMPACT));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const compacte = compact;
  const on = (k: OptKey) => opts[k] && !(compacte && OPTIONS_LARGES.includes(k));
  /* La bascule « Batiment » couvre bâtiment et étage. En fenêtre étroite le BO
     ne sacrifie que le bâtiment : l'étage reste, c'est un repère de terrain. */
  const colBat = opts.batiment && !compacte;
  const colEtg = opts.batiment;
  const toggleOpt = (k: OptKey) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  const toggleDest = (d: string) =>
    setDestOff((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });

  /* Destinations présentes + compteurs (les totaux suivent la sélection). */
  const parDest = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of DESTINATIONS) m.set(d, 0);
    for (const r of rows) m.set(r.Destination || "Annexe", (m.get(r.Destination || "Annexe") ?? 0) + 1);
    return m;
  }, [rows]);

  /* Le BO n'affiche que les types de lots réellement présents : les zéros ne
     prennent pas la place (retour #48). Un type décoché reste listé tant que
     l'écran est ouvert, sinon on ne pourrait plus le rétablir — et un type
     ajouté en cours de saisie apparaît dès le premier lot. */
  const destVisibles = useMemo(
    () => DESTINATIONS.filter((d) => (parDest.get(d) ?? 0) > 0 || destOff.has(d)),
    [parDest, destOff],
  );

  /* Colonnes réellement affichées, dans l'ordre du tableau. */
  const colonnes = useMemo(() => {
    const c: string[] = [];
    if (colBat) c.push("bat");
    if (colEtg) c.push("etg");
    c.push("num", "dest", "type", "carrez");
    if (on("sol")) c.push("sol");
    c.push("bail");
    if (on("baux")) c.push("entree", "locataire");
    c.push("hc");
    if (on("m2")) c.push("hcm2");
    c.push("hcmax");
    if (on("m2")) c.push("hcmaxm2");
    c.push("etat");
    if (!compacte) c.push("travaux");
    c.push("dpe", "renov");
    if (on("commentaire")) c.push("commentaire");
    if (on("photos")) c.push("photos");
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts, compacte, colBat, colEtg]);

  const poids = (c: string) => (compacte ? POIDS_COMPACT[c] : undefined) ?? POIDS[c] ?? 4;
  const totalPoids = colonnes.reduce((s2, c) => s2 + poids(c), 0);
  const largeur = (c: string) => (poids(c) / totalPoids) * 100;

  const visibles = rows.filter((r) => !destOff.has(r.Destination || "Annexe"));

  const totaux = useMemo(() => {
    const carrez = visibles.reduce((s, r) => s + (N(r.surface_carrez) ?? 0), 0);
    const occ = visibles.filter((r) => (N(r.loyer) ?? 0) > 0);
    const carrezOcc = occ.reduce((s, r) => s + (N(r.surface_carrez) ?? 0), 0);
    const loyersAn = visibles.reduce((s, r) => s + (N(r.loyer) ?? 0), 0) * 12;
    const maxAn = visibles.reduce((s, r) => s + (N(r.loyer_max) ?? N(r.loyer) ?? 0), 0) * 12;
    return {
      lots: visibles.length, carrez, loyersAn, maxAn,
      // Le « % » du bandeau du BO est l'occupation FINANCIÈRE :
      // loyers actuels / loyers potentiels (vérifié : 1 206 583 / 1 253 323 ≈ 97 %).
      occupation: maxAn > 0 ? Math.round((loyersAn / maxAn) * 100) : 0,
      m2mois: carrezOcc > 0 ? loyersAn / 12 / carrezOcc : 0,
    };
  }, [visibles]);

  /* La surface au sol vaut la surface Carrez et le loyer potentiel vaut le
     loyer actuel, sauf différence réelle : on les reporte à la saisie tant que
     l'agent n'y a pas touché, il ne corrige que l'exception (retour #55). */
  const REPORTS: Partial<Record<keyof Row, keyof Row>> = {
    surface_carrez: "surface_sol",
    loyer: "loyer_max",
  };

  const edit = (id: string, field: keyof Row, value: string) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const suite = REPORTS[field];
        // Le report ne s'applique que si la case cible suivait la case source :
        // une valeur saisie à la main n'est jamais écrasée.
        const suit = suite && (r[suite] === "" || r[suite] === r[field]);
        return { ...r, [field]: value, ...(suit ? { [suite!]: value } : null) };
      }),
    );
    setDirty((d) => new Set(d).add(id));
  };
  const toggleSel = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const nextNumero = () =>
    String(rows.reduce((m, r) => Math.max(m, parseInt(r.numero, 10) || 0), 0) + 1);

  const addRow = () => {
    const id = `new_${Date.now()}`;
    setRows((rs) => [...rs, {
      id, isNew: true, ordre: rs.length, travaux: "",
      batiment: "", etage: "", numero: nextNumero(),
      Destination: "Logement", Type_lot: "", surface_carrez: "", surface_sol: "",
      Type_bail: "Vide", loyer: "", loyer_max: "", Etat: "n.c.", Type_dpe: "n.c.",
      renov_year: "", commentaire: "",
    }]);
    setDirty((d) => new Set(d).add(id));
  };

  const save = () =>
    start(async () => {
      const rang = reordonne.current;
      const news = rows.filter((r) => r.isNew && dirty.has(r.id));
      const edits = rows.filter((r) => !r.isNew && dirty.has(r.id));
      for (const r of news) {
        const id = await addLot(immeubleId, toPatch(r, rang));
        // Le lot vient de naître : ses travaux ne pouvaient pas encore lui
        // être rattachés, on le fait maintenant (#84).
        const montant = parseFloat(r.travaux.replace(/[^\d.,]/g, "").replace(",", "."));
        if (Number.isFinite(montant) && montant > 0) {
          await setLotTravaux(immeubleId, id, `lot ${r.numero || r.Type_lot || ""}`.trim(), montant, null, 0);
        }
      }
      if (edits.length) await updateLots(immeubleId, edits.map((r) => ({ id: r.id, patch: toPatch(r, rang) })));
      // Travaux des lots existants : seulement ceux dont le montant a bougé.
      for (const r of edits) {
        const avant = travauxDuLot.get(r.id) ?? 0;
        const v = parseFloat(r.travaux.replace(/[^\d.,]/g, "").replace(",", "."));
        const cible = Number.isFinite(v) ? v : 0;
        if (cible === avant) continue;
        const lignes = b.travaux.filter((t) => Array.isArray(t.LOTs) && (t.LOTs as string[]).includes(r.id));
        const dediee = lignes.find((t) => Array.isArray(t.LOTs) && (t.LOTs as string[]).length === 1);
        const autres = avant - (typeof dediee?.montant === "number" ? (dediee.montant as number) : 0);
        await setLotTravaux(immeubleId, r.id, `lot ${r.numero || r.Type_lot || ""}`.trim(), cible, dediee ? String(dediee._id) : null, autres);
      }
      reordonne.current = false;
      enregistre.current = rows.map((r) => ({ ...r, isNew: false, travaux: "" }));
      setDirty(new Set());
    });

  /* Annuler (#85) : on revient à la dernière version enregistrée, les lots
     créés et pas encore validés disparaissent. */
  const annuler = () => {
    setRows(enregistre.current);
    setDirty(new Set());
    setSel(new Set());
    reordonne.current = false;
  };

  /* Glisser-déposer des lignes (#82). Le rang est un champ à part : les
     numéros de lot, eux, ne bougent pas — ils désignent la copropriété. */
  const reordonne = useRef(false);
  const [glisse, setGlisse] = useState<string | null>(null);
  const deposer = (cibleId: string) => {
    const src = glisse;
    setGlisse(null);
    if (!src || src === cibleId) return;
    setRows((rs) => {
      const de = rs.findIndex((r) => r.id === src);
      const vers = rs.findIndex((r) => r.id === cibleId);
      if (de < 0 || vers < 0) return rs;
      const copie = [...rs];
      copie.splice(vers, 0, ...copie.splice(de, 1));
      return copie.map((r, i) => ({ ...r, ordre: i }));
    });
    reordonne.current = true;
    setDirty(new Set(rows.map((r) => r.id)));
  };

  const duplicate = () =>
    start(async () => {
      let n = parseInt(nextNumero(), 10);
      for (const id of sel) {
        const src = b.lots.find((l) => String(l._id) === id);
        if (src) await duplicateLot(immeubleId, src, n++);
      }
      setSel(new Set());
    });

  /* Suppression (#86) : une vraie fenêtre qui récapitule les lots concernés,
     pas la boîte du navigateur. */
  const [aSupprimer, setASupprimer] = useState(false);
  const remove = () => {
    if (sel.size === 0) return;
    setASupprimer(false);
    start(async () => {
      for (const id of sel) {
        if (id.startsWith("new_")) setRows((rs) => rs.filter((r) => r.id !== id));
        else await deleteLot(immeubleId, id);
      }
      setSel(new Set());
    });
  };

  /* Export CSV (mêmes colonnes que l'import du BO). */
  const COLS_CSV = [
    "batiment", "etage", "numero", "Destination", "Type_lot", "surface_carrez",
    "surface_sol", "Type_bail", "loyer", "loyer_max", "Etat", "Type_dpe",
    "renov_year", "commentaire",
  ] as const;
  const exporter = () => {
    const lignes = [COLS_CSV.join(";")];
    for (const r of visibles) lignes.push(COLS_CSV.map((c) => String(r[c] ?? "").replace(/;/g, ",")).join(";"));
    const url = URL.createObjectURL(new Blob(["﻿" + lignes.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lots-${S(b.im.adresse_ville) || "immeuble"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importer = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result ?? "").replace(/^﻿/, "");
      const lignes = txt.split(/\r?\n/).filter((l) => l.trim());
      if (lignes.length < 2) return;
      const entetes = lignes[0].split(";").map((h) => h.trim());
      const nouveaux: Row[] = [];
      for (const l of lignes.slice(1, 201)) {
        const vals = l.split(";");
        const o = Object.fromEntries(entetes.map((h, i) => [h, (vals[i] ?? "").trim()]));
        const id = `new_${Date.now()}_${nouveaux.length}`;
        nouveaux.push({
          id, isNew: true, ordre: 0, travaux: o.travaux ?? "",
          batiment: o.batiment ?? "", etage: o.etage ?? "", numero: o.numero ?? "",
          Destination: o.Destination ?? "Logement", Type_lot: o.Type_lot ?? "",
          surface_carrez: o.surface_carrez ?? "", surface_sol: o.surface_sol ?? "",
          Type_bail: o.Type_bail ?? "Vide", loyer: o.loyer ?? "", loyer_max: o.loyer_max ?? "",
          Etat: o.Etat ?? "n.c.", Type_dpe: o.Type_dpe ?? "n.c.",
          renov_year: o.renov_year ?? "", commentaire: o.commentaire ?? "",
        });
      }
      setRows((rs) => [...rs, ...nouveaux]);
      setDirty((d) => { const n = new Set(d); nouveaux.forEach((r) => n.add(r.id)); return n; });
    };
    reader.readAsText(file, "utf-8");
  };

  /* €/m² et écart vs loyer de marché du secteur (comme le BO). */
  const refM2 = typeof b.secteur?.["0 - loyer_mois"] === "number" ? (b.secteur["0 - loyer_mois"] as number) : undefined;
  const m2 = (loyer: string, carrez: string) => {
    const l = N(loyer), c = N(carrez);
    return l && c && l > 0 && c > 0 ? l / c : undefined;
  };
  const ecart = (v?: number) => {
    if (v === undefined || !refM2) return null;
    const p = Math.round(((v - refM2) / refM2) * 100);
    return <span className={p >= 0 ? "pos" : "neg"}>{p >= 0 ? "+" : ""}{p} %</span>;
  };

  /** Cases à cocher + colonnes affichées. */
  const nbCols = 1 + colonnes.length;

  return (
    <div>
      {/* En-tête : bascules de colonnes · synthèse · bascules de destinations */}
      <div className="lhead">
        <div className="lopts">
          {OPTIONS.map((o) => (
            <button key={o.key} type="button"
              className={`ltog${on(o.key) ? " on" : ""}${compacte && OPTIONS_LARGES.includes(o.key) ? " bride" : ""}`}
              title={compacte && OPTIONS_LARGES.includes(o.key)
                ? "Fenêtre trop étroite pour cette colonne — élargissez la fenêtre"
                : undefined}
              onClick={() => toggleOpt(o.key)}>
              <span className="sw2" />{o.label}
            </button>
          ))}
        </div>

        {/* Synthèse : cadre doré, titre doré et pastilles à picto (retour #42). */}
        <div className="lsum">
          {totaux.m2mois > 0 && (
            <div className="lsum-top">
              <span className="fchip">
                <svg viewBox="0 0 24 24">{IC.maison}</svg>
                <b>{totaux.m2mois.toFixed(1).replace(".", ",")}</b> €/m²/mois
              </span>
            </div>
          )}
          <div className="lsum-titre">
            <svg viewBox="0 0 24 24">{IC.cle}</svg>
            Etat locatif
          </div>
          <div className="lsum-chips">
            <span className="fchip"><svg viewBox="0 0 24 24">{IC.lots}</svg><b>{totaux.lots}</b> lots</span>
            <span className="fchip"><svg viewBox="0 0 24 24">{IC.surface}</svg><b>{Math.round(totaux.carrez).toLocaleString("fr-FR")}</b> m²</span>
            <span className="fchip"><svg viewBox="0 0 24 24">{IC.entree}</svg><b>{euros(totaux.loyersAn) ?? "0 €"}</b>/an</span>
            <span className="fchip"><svg viewBox="0 0 24 24">{IC.cle}</svg><b>{totaux.occupation}</b> %</span>
            <span className="fchip gold"><svg viewBox="0 0 24 24">{IC.entree}</svg><b>{euros(totaux.maxAn) ?? "0 €"}</b>/an</span>
            <span className={`fchip${euros(b.im.fin_travaux) ? "" : " off"}`}>
              <svg viewBox="0 0 24 24">{IC.travaux}</svg>
              {euros(b.im.fin_travaux) ? <><b>{euros(b.im.fin_travaux)}</b> de travaux</> : "Pas de travaux"}
            </span>
          </div>
        </div>

        <div className="ldest">
          {destVisibles.map((d) => (
            <button key={d} type="button" className={`ltog${destOff.has(d) ? "" : " on"}`} onClick={() => toggleDest(d)}>
              <span className="sw2" />
              <b>{parDest.get(d) ?? 0}</b> {PLURIEL[d] ?? d}
            </button>
          ))}
        </div>
      </div>

      {/* Bord à bord : le tableau sort du gouttières de la fiche pour toucher
          les deux sidebars, comme dans le BO (retour #49). */}
      <div ref={wrap} className="ltable-wrap bord-a-bord" style={pending ? { opacity: 0.6 } : undefined}>
        <table className="ltable v2">
          {/* Largeurs relevées au pixel sur la capture du BO (retour #49),
              renormalisées sur les seules colonnes affichées (retour #52). */}
          <colgroup>
            <col style={{ width: 22 }} />
            {colonnes.map((c) => <col key={c} style={{ width: `${largeur(c)}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="grp brd" rowSpan={2} style={{ width: 26 }} />
              <th className="grp brd" colSpan={1 + (colBat ? 1 : 0) + (colEtg ? 1 : 0)}>Référence</th>
              <th className="grp brd" colSpan={2 + 1 + (on("sol") ? 1 : 0)}>Général</th>
              <th className="grp brd" colSpan={(on("baux") ? 3 : 1) + 2 + (on("m2") ? 2 : 0)}>Loyer</th>
              <th className="grp brd" colSpan={compacte ? 3 : 4}>Etat</th>
              {(on("commentaire") || on("photos")) && (
                <th className="grp" colSpan={(on("commentaire") ? 1 : 0) + (on("photos") ? 1 : 0)}>Autres</th>
              )}
            </tr>
            <tr>
              {colBat && <th className="brd">Bat.</th>}
              {colEtg && <th className={colBat ? "" : "brd"}>Etg</th>}
              <th className={colBat || colEtg ? "" : "brd"}>N°</th>
              <th className="brd">Dest.</th><th>Type</th>
              <th>Carrez</th>{on("sol") && <th>Au sol</th>}
              <th className="brd">Type bail</th>
              {on("baux") && <><th>Entrée</th><th>Locataire</th></>}
              <th>HC actuel</th>{on("m2") && <th>€/m²</th>}
              <th>HC max</th>{on("m2") && <th>€/m²</th>}
              <th className="brd">Etat</th>{!compacte && <th>Travaux</th>}<th>DPE</th><th>Rénov.</th>
              {on("commentaire") && <th className="brd">Commentaire</th>}
              {on("photos") && <th className={on("commentaire") ? "" : "brd"}>Photos</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => {
              const act = m2(r.loyer, r.surface_carrez);
              const max = m2(r.loyer_max || r.loyer, r.surface_carrez);
              const tvx = b.travaux
                .filter((t) => Array.isArray(t.LOTs) && (t.LOTs as string[]).includes(r.id))
                .reduce((s, t) => s + (typeof t.montant === "number" ? t.montant : 0), 0);
              const photos = b.photos.filter((p) => p.type === "Lot").length && r.isNew ? 0 : 0;
              return (
                <tr
                  key={r.id}
                  className={glisse === r.id ? "glisse" : undefined}
                  style={dirty.has(r.id) ? { background: "#fffbea" } : undefined}
                  onDragOver={(e) => { if (glisse) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); deposer(r.id); }}
                >
                  <td className="brd"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                  {colBat && (
                    <td className="brd"><input className="lcell" value={r.batiment} onChange={(e) => edit(r.id, "batiment", e.target.value)} /></td>
                  )}
                  {colEtg && (
                    <td className={colBat ? "" : "brd"}><input className="lcell" value={r.etage} onChange={(e) => edit(r.id, "etage", e.target.value)} /></td>
                  )}
                  {/* La poignée se glisse sous le numéro : ni colonne en plus,
                      ni ligne plus haute (#82). */}
                  <td className={`poi${colBat || colEtg ? "" : " brd"}`}>
                    <input className="lcell" value={r.numero} onChange={(e) => edit(r.id, "numero", e.target.value)} />
                    <span
                      className="grip" draggable title="Glisser pour déplacer la ligne"
                      onDragStart={() => setGlisse(r.id)}
                      onDragEnd={() => setGlisse(null)}
                    >
                      <svg viewBox="0 0 16 6"><circle cx="4" cy="3" r="1.1" /><circle cx="8" cy="3" r="1.1" /><circle cx="12" cy="3" r="1.1" /></svg>
                    </span>
                  </td>
                  <td className="brd dest" title={r.Destination}>
                    <span className="destic">
                      {r.Destination
                        ? <svg viewBox="0 0 24 24">{IC_DEST[r.Destination] ?? IC_DEST.Annexe}</svg>
                        : <i>—</i>}
                    </span>
                    <select className="lcell inv" value={r.Destination}
                      onChange={(e) => { edit(r.id, "Destination", e.target.value); edit(r.id, "Type_lot", ""); }}>
                      <option value="" />{DESTINATIONS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td>
                    <CelluleTypologie valeur={r.Type_lot} destination={r.Destination}
                      ajouts={b.typologies} onChange={(v) => edit(r.id, "Type_lot", v)} />
                  </td>
                  <td className="na"><input className="lcell num" value={r.surface_carrez} onChange={(e) => edit(r.id, "surface_carrez", e.target.value)} /><i>m²</i></td>
                  {on("sol") && <td className="na"><input className="lcell num" value={r.surface_sol} onChange={(e) => edit(r.id, "surface_sol", e.target.value)} /><i>m²</i></td>}
                  <td className="brd">
                    <select className={`lcell${r.Type_bail === "Vide" ? " red" : ""}`} value={r.Type_bail} onChange={(e) => edit(r.id, "Type_bail", e.target.value)}>
                      <option value="" />{[...new Set([r.Type_bail, ...TYPES_BAIL])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  {on("baux") && (
                    <>
                      <td className="na">{(() => {
                        const bail = b.baux.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(r.id));
                        return bail?.date_start ? new Date(String(bail.date_start)).toLocaleDateString("fr-FR") : <span className="plus">+</span>;
                      })()}</td>
                      <td className="na">{(() => {
                        const loc = b.locataires.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(r.id));
                        return loc ? String(loc.formatted_name ?? "") : <span className="plus">+</span>;
                      })()}</td>
                    </>
                  )}
                  <td className="na"><input className="lcell num" value={r.loyer} onChange={(e) => edit(r.id, "loyer", e.target.value)} /><i>€</i></td>
                  {on("m2") && <td className="na pc">{act ? ecart(act) ?? `${act.toFixed(1).replace(".", ",")} €` : <span className="nc">n.a.</span>}</td>}
                  <td className="na"><input className="lcell num" value={r.loyer_max} onChange={(e) => edit(r.id, "loyer_max", e.target.value)} /><i>€</i></td>
                  {on("m2") && <td className="na pc">{max ? ecart(max) ?? `${max.toFixed(1).replace(".", ",")} €` : <span className="nc">n.a.</span>}</td>}
                  <td className="brd">
                    <select className={`lcell${!r.Etat || r.Etat === "n.c." ? " vide" : ""}${r.Etat === "Travaux" ? " red" : ""}`} value={r.Etat} onChange={(e) => edit(r.id, "Etat", e.target.value)}>
                      <option value="" />{[...new Set([r.Etat, ...ETATS])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  {!compacte && (
                    <td className="na">
                      <span className={parseFloat(r.travaux) > 0 ? "tvx" : undefined}>
                        <input
                          className="lcell num" value={r.travaux} placeholder="0"
                          onChange={(e) => edit(r.id, "travaux", e.target.value)}
                        />
                        <i>€</i>
                      </span>
                    </td>
                  )}
                  <td>
                    {/* La lettre du DPE occupe toute la case : pas de réserve
                        de chevron, sinon elle disparaît dans une colonne
                        étroite (retour #56). */}
                    <select className={`lcell dpe${!r.Type_dpe || r.Type_dpe === "n.c." ? " vide" : ""}`} value={r.Type_dpe} onChange={(e) => edit(r.id, "Type_dpe", e.target.value)}>
                      <option value="" />{[...new Set([r.Type_dpe, ...DPES])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="na"><input className="lcell num" value={r.renov_year} onChange={(e) => edit(r.id, "renov_year", e.target.value)} /></td>
                  {on("commentaire") && <td className="brd"><input className="lcell" value={r.commentaire} onChange={(e) => edit(r.id, "commentaire", e.target.value)} /></td>}
                  {on("photos") && (
                    <td className={`na${on("commentaire") ? "" : " brd"}`}>
                      <span className="phc"><svg viewBox="0 0 24 24"><path d="M3 7h4l1.5-2h7L17 7h4v13H3z" /><circle cx="12" cy="13" r="3.4" /></svg>{photos}</span>
                    </td>
                  )}
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr><td colSpan={nbCols} className="fempty" style={{ padding: 22 }}>
                {rows.length === 0 ? "Aucun lot saisi — cliquez sur « + Ajouter »." : "Aucun lot pour les destinations sélectionnées."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barre d'outils sticky, libellés visibles, import/export */}
      <div className="ltools v2">
        <button className="ltb lbl" type="button" onClick={addRow}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg> Ajouter
        </button>
        <button className="ltb lbl" type="button" onClick={duplicate} disabled={sel.size === 0 || pending}>
          <svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg> Dupliquer
        </button>
        <button className="ltb lbl red" type="button" onClick={() => setASupprimer(true)} disabled={sel.size === 0 || pending}>
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg> Supprimer
        </button>
        <span className="sp" style={{ flex: 1 }} />
        {/* Import et export au centre, comme au BO : la place de droite est
            celle d'Annuler et d'Enregistrer (#85). */}
        <label className="ltb lbl gold">
          <svg viewBox="0 0 24 24"><path d="M12 16V4M8 8l4-4 4 4M4 20h16" /></svg> Importer
          <input type="file" accept=".csv,text/csv" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importer(f); e.target.value = ""; }} />
        </label>
        <button className="ltb lbl gold" type="button" onClick={exporter}>
          <svg viewBox="0 0 24 24"><path d="M12 4v12M8 12l4 4 4-4M4 20h16" /></svg> Télécharger
        </button>
        <span className="sp" style={{ flex: 1 }} />
        <button className="ltb annul" type="button" onClick={annuler} disabled={dirty.size === 0 || pending}>
          Annuler
        </button>
        <button className="kgo" type="button" onClick={save} disabled={dirty.size === 0 || pending}
          style={pending || dirty.size === 0 ? { opacity: 0.5 } : undefined}>
          <span className="ch">›</span> Enregistrer{dirty.size > 0 ? ` (${dirty.size})` : ""}
        </button>
      </div>

      {aSupprimer && (
        <div className="modal-ov" onClick={() => setASupprimer(false)}>
          <div className="modal sup-mod" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              Supprimer {sel.size > 1 ? `${sel.size} lots` : "un lot"}
              <button type="button" onClick={() => setASupprimer(false)}>✕</button>
            </div>
            <div className="modal-b">
              <table className="sup-t">
                <thead><tr><th>N°</th><th>Type</th><th>Surface</th><th>Loyer HC</th></tr></thead>
                <tbody>
                  {rows.filter((r) => sel.has(r.id)).map((r) => (
                    <tr key={r.id}>
                      <td>{r.numero || "—"}</td>
                      <td>{r.Type_lot || r.Destination || "—"}</td>
                      <td>{r.surface_carrez ? `${r.surface_carrez} m²` : "—"}</td>
                      <td>{r.loyer ? `${r.loyer} €` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="sup-n">
                Les lots enregistrés partent à la corbeille : ils restent récupérables.
              </p>
            </div>
            <div className="modal-f">
              <button type="button" className="ltb annul" onClick={() => setASupprimer(false)}>Annuler</button>
              <button type="button" className="sup-go" disabled={pending} onClick={remove}>
                Supprimer {sel.size > 1 ? `les ${sel.size} lots` : "le lot"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
