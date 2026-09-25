"use client";

// Tableau des lots — réplique de l'onglet État locatif du BO.
// Retours MAV du 11/08 pris en compte : sélecteur de destinations avec
// compteurs qui recalcule les totaux (droite), unités dans les cellules,
// écarts %/m², en-tête sur 2 lignes sticky avec séparateurs gras entre
// groupes, barre d'outils sticky avec libellés + import/export, typologies
// filtrées par destination.
//
// Retour #379 (25/09) : les anciens onglets Baux et Locataires sont devenus
// des VUES du même tableau. Une ligne = un lot, avec son bail et son
// locataire ; la vue choisie dit seulement quelles colonnes on regarde, et
// une seule barre enregistre tout.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { euros, S } from "@/lib/format";
import {
  addLocataire, addLot, ajouterTypologie, bailDuLot, deleteLot, setLotTravaux, updateLocataire,
  updateLots, type LotPatch,
} from "@/lib/bo/actions";
import { dateMatrice, lireMatrice, matriceCsv, rempli } from "@/lib/bo/matrice";
import { ChampDate } from "@/components/champ-date";
import { PhotosDuLot } from "@/components/photos";
import { BadgeDpe } from "@/components/pictos";
import { LotPleinEcran, LotsCartes } from "@/components/lots-mobile";
import {
  compteAuLot, DESTINATIONS, ETATS_LOT as ETATS, INDICES_BAIL, RATTACHE, TYPES_BAIL, TYPES_DPE as DPES,
} from "@/lib/referentiels";
import { typesFor } from "@/lib/typologies";
import { ModaleDpe } from "@/components/dpe-modale";
import { Modale } from "@/components/modale";

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
  /* Une voûte, pas un toit : la cave et l'entrepôt portaient le même dessin à
     un détail près (retour #249). L'arc en berceau ne ressemble à rien
     d'autre dans la colonne. */
  Cave: <><path d="M4 20.5V12a8 8 0 0 1 16 0v8.5" /><path d="M8.5 20.5V12a3.5 3.5 0 0 1 7 0v8.5" /><path d="M2.5 20.5h19" /></>,
  Parking: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M10 16V9h3a2.5 2.5 0 0 1 0 5h-3" /></>,
  Annexe: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 12h6" /></>,
};

/** Les statuts d'un bail, dans l'ordre de la liste (ex-onglet Baux). */
const STATUTS_BAIL = [
  { key: "en_cours", label: "Bail en cours" },
  { key: "impayes", label: "Impayés" },
  { key: "preavis", label: "Préavis déposé" },
  { key: "expulsion", label: "Expulsion en cours" },
] as const;
type StatutBail = (typeof STATUTS_BAIL)[number]["key"];
const statutBail = (s: string): StatutBail =>
  STATUTS_BAIL.find((x) => x.key === s)?.key ?? "en_cours";

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
  /* Dédoublonnée : pour une annexe, « Autre » est à la fois dans la liste
     de la destination et ajouté en fin par `typesFor`, et React se
     plaignait de deux options sous la même clé. */
  const liste = [...new Set(typesFor(destination, valeur, ajouts))];
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

/** Le libellé court d'un lot, tel qu'on le désigne à l'oral : « lot 3 — 2P ». */
const libelleLot = (r: { numero: string; Type_lot: string; Destination: string }) =>
  [r.numero ? `Lot ${r.numero}` : "Lot", r.Type_lot || r.Destination].filter(Boolean).join(" — ");

/**
 * La cellule « type de bail », avec le rattachement à un autre lot (#171).
 *
 * MAV : « parfois on a un appart ou un parking rattaché à un lot avec un loyer
 * global pour les deux. Dans ce cas il y aurait une mention au dossier et dans
 * le bail on indique rattaché à un lot — et quand on choisit ça, une modale
 * pour dire à quel lot c'est rattaché. Dès qu'on change de type de bail ça
 * détache le bien du lot. »
 */
function CelluleBail({ r, lots, onBail, onLot }: {
  r: Row; lots: Row[];
  onBail: (v: string) => void;
  onLot: (v: string) => void;
}) {
  const [choix, setChoix] = useState(false);
  const rattache = r.Type_bail === RATTACHE;
  const cible = lots.find((x) => x.id === r.lot_rattache);

  return (
    <>
      <select
        className={`lcell${r.Type_bail === "Vide" ? " red" : ""}`}
        value={r.Type_bail}
        onChange={(e) => {
          onBail(e.target.value);
          /* Changer de bail détache ; choisir « rattaché » demande à quel lot. */
          if (e.target.value === RATTACHE) setChoix(true);
          else onLot("");
        }}
      >
        <option value="" />
        {[...new Set([r.Type_bail, ...TYPES_BAIL])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
      </select>
      {rattache && (
        <button type="button" className="lot-ratt" onClick={() => setChoix(true)}
          title="Changer le lot de rattachement">
          {cible ? libelleLot(cible) : "à quel lot ?"}
        </button>
      )}
      {choix && (
        <Modale titre="Rattaché à quel lot ?" onFermer={() => setChoix(false)} className="etroit">
          <p className="mhint">
            Le loyer est encaissé sur l&apos;autre lot : celui-ci reste occupé mais ne
            compte pas une deuxième fois dans les revenus.
          </p>
          <div className="ratt-liste">
            {lots.filter((x) => x.id !== r.id).map((x) => (
              <button
                key={x.id} type="button"
                className={`ratt-l${x.id === r.lot_rattache ? " on" : ""}`}
                onClick={() => { onLot(x.id); setChoix(false); }}
              >
                <b>{libelleLot(x)}</b>
                <span>{x.surface_carrez ? `${x.surface_carrez} m²` : ""}{x.loyer ? ` · ${x.loyer} €/mois` : ""}</span>
              </button>
            ))}
          </div>
        </Modale>
      )}
    </>
  );
}

/**
 * La fenêtre « combien ? » des boutons Dupliquer et Ajouter (retour #375).
 *
 * MAV : « pour dupliquer et ajouter je veux qu'on me demande combien j'en
 * veux avec une petite modale. Pour ajouter je veux que tu me demandes la
 * destination et le type et le nombre de lots à ajouter. » Un immeuble de
 * découpe a vingt caves et douze parkings identiques : les créer un par un,
 * c'est vingt clics puis vingt corrections de destination.
 *
 * Rien ne part en base ici : les lignes naissent à l'écran, et c'est la barre
 * Enregistrer qui les écrit, comme pour une ligne ajoutée à la main.
 */
function ModaleLots({ mode, nbSel, presentes, typologies, onFermer, onValider }: {
  mode: "dupliquer" | "ajouter";
  /** Lots cochés (mode dupliquer) : chacun reçoit le nombre de copies demandé. */
  nbSel: number;
  /** Les destinations déjà présentes dans le bien, proposées en premier. */
  presentes: string[];
  typologies: { destination: string; label: string }[];
  onFermer: () => void;
  onValider: (nombre: number, destination: string, type: string) => void;
}) {
  const [nombre, setNombre] = useState("1");
  const [dest, setDest] = useState(presentes[0] ?? "Logement");
  const [type, setType] = useState("");
  /* Deux cents lots d'un coup, c'est déjà une erreur de frappe. */
  const n = Math.max(0, Math.min(200, parseInt(nombre, 10) || 0));
  const total = mode === "dupliquer" ? n * nbSel : n;
  const types = typesFor(dest, undefined, typologies).filter((t) => t !== "Autre");
  const destinations = [...presentes, ...DESTINATIONS.filter((d) => !presentes.includes(d))];
  const valider = () => { if (total > 0) onValider(n, dest, type); };
  const pluriel = total > 1 ? "s" : "";

  return (
    <Modale
      titre={mode === "dupliquer" ? `Dupliquer ${nbSel > 1 ? `${nbSel} lots` : "le lot"}` : "Ajouter des lots"}
      onFermer={onFermer}
      className="etroit"
      pied={
        <button className="kgo" type="button" disabled={total === 0} onClick={valider}
          style={total === 0 ? { opacity: 0.5 } : undefined}>
          <span className="ch">›</span> {mode === "dupliquer" ? `Dupliquer ${total} lot${pluriel}` : `Ajouter ${total} lot${pluriel}`}
        </button>
      }
    >
      {mode === "ajouter" && (
        <>
          <span className="mlab">Destination</span>
          <select className="min" value={dest} onChange={(e) => { setDest(e.target.value); setType(""); }}>
            {destinations.map((d) => <option key={d}>{d}</option>)}
          </select>
          <span className="mlab">Type</span>
          <select className="min" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">— à préciser dans le tableau —</option>
            {types.map((t) => <option key={t}>{t}</option>)}
          </select>
        </>
      )}
      <span className="mlab">
        {mode === "dupliquer" ? `Combien de copies${nbSel > 1 ? " de chaque lot" : ""} ?` : "Nombre de lots"}
      </span>
      <input
        className="min" autoFocus inputMode="numeric" value={nombre}
        onChange={(e) => setNombre(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); valider(); } }}
      />
      <p className="mhint">
        {mode === "dupliquer"
          ? "Les copies reprennent le lot coché — sans son bail ni son locataire — et prennent les numéros suivants."
          : "Les lots prennent les numéros suivants ; tout se règle ensuite dans le tableau."}
        {" "}Rien n&apos;est écrit avant « Enregistrer ».
      </p>
    </Modale>
  );
}

type Row = {
  id: string; isNew: boolean;
  /** Rang d'affichage choisi à la souris (#82) — il ne touche pas au numéro. */
  ordre: number;
  /** Travaux d'un lot pas encore enregistré (#84) : posés au moment du save. */
  travaux: string;
  /* Ce à quoi les travaux du lot correspondent (retour #254). Vide tant que
     l'agent n'a pas répondu ; on ne le lui demande qu'à la saisie d'un
     montant, pas à l'ouverture de l'écran. */
  travaux_objet: string;
  travaux_urgence: string;
  batiment: string; etage: string; numero: string;
  Destination: string; Type_lot: string;
  surface_carrez: string; surface_sol: string;
  Type_bail: string; loyer: string; loyer_max: string;
  /** #171 — l'autre lot avec lequel celui-ci est loué, sous un loyer unique. */
  lot_rattache: string;
  Etat: string; Type_dpe: string; renov_year: string;
  commentaire: string;
  /* Le bail du lot (ex-onglet Baux, #379). Une case vide reste vide : le bail
     n'est créé en base que si l'agent écrit quelque chose. */
  b_loyer: string; b_dg: string; b_entree: string;
  b_indice: string; b_i0: string; b_i1: string;
  b_statut: string; b_com: string;
  /* Le locataire du lot (ex-onglet Locataires, #379). `l_pm` vaut « oui »
     pour une société. */
  l_pm: string; l_civ: string; l_prenom: string; l_nom: string;
  l_phone: string; l_email: string; l_com: string;
};

/** Les champs du bail et du locataire, à comparer avant d'écrire. */
const CHAMPS_BAIL = ["b_loyer", "b_dg", "b_entree", "b_indice", "b_i0", "b_i1", "b_statut", "b_com"] as const;
const CHAMPS_LOC = ["l_pm", "l_civ", "l_prenom", "l_nom", "l_phone", "l_email", "l_com"] as const;
/** Ce que porte une ligne sans bail ni locataire. */
const VIDE_BAIL_LOC: Pick<Row, (typeof CHAMPS_BAIL)[number] | (typeof CHAMPS_LOC)[number]> = {
  b_loyer: "", b_dg: "", b_entree: "", b_indice: "", b_i0: "", b_i1: "", b_statut: "en_cours", b_com: "",
  l_pm: "", l_civ: "", l_prenom: "", l_nom: "", l_phone: "", l_email: "", l_com: "",
};
const differe = (avant: Row | undefined, r: Row, champs: readonly (keyof typeof VIDE_BAIL_LOC)[]) =>
  champs.some((c) => (avant?.[c] ?? VIDE_BAIL_LOC[c]) !== r[c]);

const N = (s: string) => {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

/* Les types de bail qui veulent dire « personne dedans ». */
const BAIL_VIDE = new Set(["", "Vide", "n.c."]);

/**
 * Le type de bail se déduit du loyer (retour #171).
 *
 * MAV : « dès que je mets un loyer actuel il passe automatiquement au moins
 * en n.c. — ce qui veut dire qu'on n'a pas encore mis l'info mais que c'est
 * loué. À l'inverse si je mets qu'un loyer potentiel alors le bien est
 * considéré comme vide, puisqu'il n'y a pas de loyer actuel. »
 *
 * On ne touche jamais à un type de bail CHOISI : passer de « Habitation » à
 * « n.c. » parce qu'un loyer a bougé serait une perte d'information. On ne
 * remplit que ce qui était vide, et on ne vide que ce qu'on avait rempli.
 */
function bailDeduit(r: Row, champ: keyof Row, valeur: string): Partial<Row> | null {
  if (champ !== "loyer") return null;
  const loue = (N(valeur) ?? 0) > 0;
  if (loue && BAIL_VIDE.has(r.Type_bail)) return { Type_bail: "n.c." };
  if (!loue && r.Type_bail === "n.c.") return { Type_bail: "Vide" };
  return null;
}

const num = (v: unknown) => (typeof v === "number" ? v : undefined);

function toRow(
  l: Record<string, unknown>, i: number, travaux = "",
  bail?: Record<string, unknown>, loc?: Record<string, unknown>,
): Row {
  return {
    id: String(l._id), isNew: false,
    ordre: typeof l.ordre === "number" ? (l.ordre as number) : i,
    travaux,
    travaux_objet: "", travaux_urgence: "",
    batiment: S(l.batiment), etage: S(l.etage), numero: S(l.numero),
    Destination: S(l.Destination), Type_lot: S(l.Type_lot),
    surface_carrez: S(l.surface_carrez), surface_sol: S(l.surface_sol),
    /* Même déduction que sur la saisie (#171) : un lot qui encaisse un loyer
       n'est pas « Vide », même si personne n'a encore choisi le type de bail.
       Les lignes déjà en base s'affichent donc juste, et la valeur déduite
       part en base au prochain enregistrement de la ligne. */
    Type_bail: (N(S(l.loyer)) ?? 0) > 0 && BAIL_VIDE.has(S(l.Type_bail)) ? "n.c." : S(l.Type_bail),
    loyer: S(l.loyer), loyer_max: S(l.loyer_max),
    lot_rattache: S(l.lot_rattache),
    Etat: S(l.Etat), Type_dpe: S(l.Type_dpe), renov_year: S(l.renov_year),
    commentaire: S(l.commentaire),
    b_loyer: S(num(bail?.loyer_init)),
    b_dg: S(num(bail?.depot_garantie)),
    b_entree: typeof bail?.date_start === "string" ? (bail.date_start as string).slice(0, 10) : "",
    b_indice: S(bail?.indice_type),
    b_i0: S(num(bail?.indice_init)),
    b_i1: S(num(bail?.indice_actuel)),
    b_statut: bail?.expulsion === true ? "expulsion"
      : bail?.impayes === true ? "impayes"
      : bail?.preavis === true ? "preavis" : "en_cours",
    b_com: S(bail?.commentaire),
    l_pm: loc?.pm === true ? "oui" : "",
    l_civ: S(loc?.["pp_civilité"]),
    l_prenom: S(loc?.["pp_prénom"]),
    l_nom: loc?.pm === true ? S(loc?.pm_nom) : S(loc?.pp_nom),
    l_phone: S(loc?.phone),
    l_email: S(loc?.email),
    l_com: S(loc?.commentaire),
  };
}

/**
 * Effacer une case doit effacer la donnée (retour #255).
 *
 * MAV : « quand je supprime une surface et que j'enregistre, ça me remet
 * l'ancienne surface que j'avais renseignée ». Le patch écartait les chaînes
 * vides — ce qui est juste à la création, où une case vide n'a rien à dire,
 * mais faux à la modification : le champ ne partait plus du tout et la base
 * gardait sa valeur d'avant. On envoie donc `null`, qui traverse le nettoyage
 * et écrase pour de bon.
 *
 * Une saisie illisible (« abc » dans une case de nombre) reste écartée : elle
 * ne dit ni une valeur ni un effacement, mieux vaut ne rien toucher.
 */
const txt = (s: string) => (s.trim() === "" ? null : s);
const nb = (s: string) => (s.trim() === "" ? null : N(s));

/** Ce que la fenêtre du retour #254 a recueilli, prêt pour `setLotTravaux`. */
const objetTravaux = (r: Row) => ({
  description: r.travaux_objet.trim() || undefined,
  urgence: (["Haute", "Moyenne", "Basse"] as const).find((u) => u === r.travaux_urgence),
});

/** `avecOrdre` n'est vrai qu'après un glisser-déposer : sans cela, éditer un
 *  seul lot lui donnerait un rang que les autres n'ont pas. */
function toPatch(r: Row, avecOrdre = false): LotPatch {
  return {
    ...(avecOrdre ? { ordre: r.ordre } : null),
    batiment: txt(r.batiment),
    etage: txt(r.etage),
    numero: nb(r.numero),
    Destination: txt(r.Destination),
    Type_lot: txt(r.Type_lot),
    surface_carrez: nb(r.surface_carrez),
    surface_sol: nb(r.surface_sol),
    Type_bail: txt(r.Type_bail),
    /* Le rattachement ne survit pas au type de bail : « dès qu'on change de
       type de bail ça détache le bien du lot » (#171). */
    lot_rattache: r.Type_bail === RATTACHE ? txt(r.lot_rattache) : null,
    loyer: nb(r.loyer),
    loyer_max: nb(r.loyer_max),
    Etat: txt(r.Etat),
    Type_dpe: txt(r.Type_dpe),
    renov_year: nb(r.renov_year),
    commentaire: txt(r.commentaire),
  };
}

/* ---------- Les colonnes et les vues du tableau (retour #379) ---------- */

/**
 * MAV : « pour les 4 menus en haut on va les fusionner (sauf les charges) et
 * on va faire en sorte que ce soit juste des boutons à actionner et que ça
 * change les entrées de l'état locatif. En gros je clique sur Baux, ça enlève
 * les colonnes état, travaux, DPE, date de réno, HC max, €/m² max et ça me
 * met les colonnes indispensables du bail. Pareil pour les locataires. […]
 * Limite je devrais pouvoir sélectionner dans un menu déroulant avec des
 * cases à cocher les colonnes que je veux afficher. Néanmoins je veux
 * toujours avoir l'option de base. »
 *
 * D'où : UNE liste de colonnes, trois vues toutes faites, une vue à soi.
 */
export type ColKey =
  | "bat" | "etg" | "num" | "dest" | "type" | "carrez" | "sol"
  | "bail" | "hc" | "hcm2" | "hcmax" | "hcmaxm2"
  | "etat" | "travaux" | "dpe" | "renov"
  | "b_loyer" | "b_dg" | "b_entree" | "b_indice" | "b_i0" | "b_i1" | "b_revise" | "b_statut" | "b_com"
  | "l_pm" | "l_civ" | "l_prenom" | "l_nom" | "l_phone" | "l_email" | "l_com"
  | "commentaire" | "photos";

type Colonne = {
  /** L'en-tête, court : la colonne est étroite. */
  label: string;
  /** Le libellé du menu « Colonnes », quand l'en-tête seul ne suffit pas. */
  menu?: string;
  /* Largeurs relevées sur la capture du BO, en poids relatifs. Elles sont
     normalisées à 100 % sur les seules colonnes affichées : masquer une
     colonne ne doit pas faire grossir la case à cocher (retour #52). */
  poids: number;
  /* En vue compacte il reste moins de colonnes : les repères (étage, numéro,
     destination) peuvent respirer, sinon ils tronquent leur contenu. */
  poidsCompact?: number;
  /* Colonnes que le BO laisse tomber quand la fenêtre se resserre (retour
     #54) : il ne garde que ce qui se lit à 1 000 px. */
  large?: boolean;
};

export const COLONNES: Record<ColKey, Colonne> = {
  bat: { label: "Bat.", menu: "Bâtiment", poids: 2.1, large: true },
  etg: { label: "Etg", menu: "Étage", poids: 2.0, poidsCompact: 3.4 },
  num: { label: "N°", menu: "Numéro", poids: 2.1, poidsCompact: 3.4 },
  dest: { label: "Dest.", menu: "Destination", poids: 2.3, poidsCompact: 3.2 },
  type: { label: "Type", poids: 6.8 },
  carrez: { label: "Carrez", menu: "Surface Carrez", poids: 5.2 },
  sol: { label: "Au sol", menu: "Surface au sol", poids: 5.5, large: true },
  bail: { label: "Type bail", menu: "Type de bail", poids: 5.2 },
  hc: { label: "HC actuel", menu: "Loyer HC actuel", poids: 4.9 },
  hcm2: { label: "€/m²", menu: "€/m² actuel", poids: 3.8, large: true },
  hcmax: { label: "HC max", menu: "Loyer HC max", poids: 4.9 },
  hcmaxm2: { label: "€/m²", menu: "€/m² max", poids: 4.0, large: true },
  etat: { label: "Etat", menu: "État du lot", poids: 5.2 },
  travaux: { label: "Travaux", poids: 6.1, large: true },
  dpe: { label: "DPE", poids: 2.7 },
  /* « Date réno. » ne tenait pas dans 3.6 : l'en-tête se coupait et l'année
     saisie débordait de sa case (retour #251). */
  renov: { label: "Date réno.", menu: "Date de rénovation", poids: 5.4, poidsCompact: 6.0 },
  /* En-têtes courts : à seize colonnes, « Loyer initial » se coupait en
     « Loyer ini… » ; le libellé entier reste dans le menu Colonnes. */
  b_loyer: { label: "Loyer init.", menu: "Loyer initial", poids: 5.0 },
  b_dg: { label: "Dépôt", menu: "Dépôt de garantie", poids: 5.0 },
  b_entree: { label: "Entrée", menu: "Date d'entrée", poids: 7.0 },
  b_indice: { label: "Indice", poids: 4.0 },
  b_i0: { label: "Ind. sign.", menu: "Indice à la signature", poids: 4.8 },
  b_i1: { label: "Ind. actuel", menu: "Indice actuel", poids: 4.8 },
  b_revise: { label: "Révisé", menu: "Loyer révisé", poids: 4.8 },
  b_statut: { label: "Statut bail", menu: "Statut du bail", poids: 6.5 },
  b_com: { label: "Comm. bail", menu: "Commentaire du bail", poids: 10, large: true },
  l_pm: { label: "Personne", menu: "Physique / morale", poids: 7.0 },
  l_civ: { label: "Civ.", menu: "Civilité", poids: 3.2 },
  l_prenom: { label: "Prénom", poids: 6.5 },
  l_nom: { label: "Nom", menu: "Nom / raison sociale", poids: 8.0 },
  l_phone: { label: "Téléphone", poids: 6.5 },
  l_email: { label: "E-mail", poids: 9.0 },
  l_com: { label: "Comm. locataire", menu: "Commentaire du locataire", poids: 10, large: true },
  commentaire: { label: "Commentaire", menu: "Commentaire du lot", poids: 17.3 },
  photos: { label: "Photos", poids: 2.9, large: true },
};

/** Les groupes de l'en-tête, dans l'ordre du tableau. */
export const GROUPES: { label: string; cols: ColKey[] }[] = [
  { label: "Référence", cols: ["bat", "etg", "num"] },
  { label: "Général", cols: ["dest", "type", "carrez", "sol"] },
  { label: "Loyer", cols: ["bail", "hc", "hcm2", "hcmax", "hcmaxm2"] },
  { label: "Etat", cols: ["etat", "travaux", "dpe", "renov"] },
  { label: "Bail", cols: ["b_loyer", "b_dg", "b_entree", "b_indice", "b_i0", "b_i1", "b_revise", "b_statut", "b_com"] },
  { label: "Locataire", cols: ["l_pm", "l_civ", "l_prenom", "l_nom", "l_phone", "l_email", "l_com"] },
  { label: "Autres", cols: ["commentaire", "photos"] },
];
const ORDRE: ColKey[] = GROUPES.flatMap((g) => g.cols);
/** Sans numéro, destination et type, une ligne ne dit plus de quel lot elle parle. */
export const FIXES = new Set<ColKey>(["num", "dest", "type"]);

export type Vue = "base" | "baux" | "locataires" | "perso";
export const VUES: Record<Exclude<Vue, "perso">, ColKey[]> = {
  /* L'état locatif « de base » : ce que l'écran montrait jusqu'ici. */
  base: ["bat", "etg", "num", "dest", "type", "carrez", "sol", "bail", "hc", "hcm2", "hcmax", "hcmaxm2",
    "etat", "travaux", "dpe", "renov", "commentaire", "photos"],
  /* Le bail : on garde de quoi reconnaître le lot et son loyer, on ôte
     l'état, les travaux, le DPE, la date de réno et le potentiel. */
  baux: ["etg", "num", "dest", "type", "carrez", "bail", "hc",
    "b_loyer", "b_dg", "b_entree", "b_indice", "b_i0", "b_i1", "b_revise", "b_statut", "b_com"],
  /* Le locataire : qui, comment le joindre, depuis quand, et où en est
     son bail (préavis, impayés). */
  locataires: ["etg", "num", "dest", "type", "carrez", "bail", "hc", "b_entree", "b_statut",
    "l_pm", "l_civ", "l_prenom", "l_nom", "l_phone", "l_email", "l_com"],
};
export const VUES_LISTE = [
  { key: "base", label: "État locatif", picto: "lots" },
  { key: "baux", label: "Baux", picto: "baux" },
  { key: "locataires", label: "Locataires", picto: "locataires" },
] as const;

const CLE_VUE = "bo.locatif.vue";

/* Le stockage local est une source EXTERNE à React : on s'y abonne plutôt
   que de le recopier dans un état après coup. Si le navigateur le refuse
   (navigation privée), la mémoire du module prend le relais le temps de la
   page. */
const ECOUTEURS = new Set<() => void>();
let memoireVue: string | null = null;
const lireVue = () => {
  try { return localStorage.getItem(CLE_VUE) ?? memoireVue; } catch { return memoireVue; }
};
const ecrireVue = (v: Vue, p: ColKey[]) => {
  memoireVue = JSON.stringify({ vue: v, perso: p });
  try { localStorage.setItem(CLE_VUE, memoireVue); } catch { /* on garde la mémoire du module */ }
  ECOUTEURS.forEach((f) => f());
};
const abonnerVue = (f: () => void) => {
  ECOUTEURS.add(f);
  window.addEventListener("storage", f);
  return () => { ECOUTEURS.delete(f); window.removeEventListener("storage", f); };
};
/** Relit ce qui est mémorisé, en ne gardant que ce qui existe encore. */
const decoderVue = (brut: string | null): { vue: Vue; perso: ColKey[] } => {
  try {
    const m = JSON.parse(brut ?? "null") as { vue?: unknown; perso?: unknown } | null;
    if (!m || typeof m !== "object") return { vue: "base", perso: VUES.base };
    const vue: Vue = m.vue === "perso" || (typeof m.vue === "string" && m.vue in VUES) ? (m.vue as Vue) : "base";
    const perso = Array.isArray(m.perso)
      ? ORDRE.filter((c) => (m.perso as unknown[]).includes(c) || FIXES.has(c))
      : VUES.base;
    return { vue, perso };
  } catch { return { vue: "base", perso: VUES.base }; }
};

/**
 * La vue choisie, mémorisée par navigateur (localStorage, pas en base) :
 * c'est une préférence d'écran, pas une donnée de l'immeuble. Le rendu
 * serveur ne connaît pas le stockage : il rend la vue de base, et le
 * navigateur applique la sienne aussitôt monté.
 */
export function useVueLocatif() {
  const brut = useSyncExternalStore(abonnerVue, lireVue, () => null);
  const { vue, perso } = useMemo(() => decoderVue(brut), [brut]);
  const colonnes = vue === "perso" ? perso : VUES[vue];
  const setVue = (v: Vue) => ecrireVue(v, perso);
  /* Cocher ou décocher une colonne, c'est composer SA vue : on part de ce
     qui est affiché, quelle que soit la vue d'origine. */
  const basculer = (c: ColKey) => {
    if (FIXES.has(c)) return;
    const n = colonnes.includes(c) ? colonnes.filter((x) => x !== c) : ORDRE.filter((x) => x === c || colonnes.includes(x));
    ecrireVue("perso", n);
  };
  return { vue, colonnes, setVue, basculer };
}

/** Le bouton « Colonnes ▾ » et sa liste de cases à cocher (retour #379). */
export function MenuColonnes({ colonnes, actif, onBasculer }: {
  colonnes: ColKey[];
  /** Vrai quand la vue affichée est celle composée ici. */
  actif: boolean;
  onBasculer: (c: ColKey) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOuvert(false); };
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("mousedown", dehors); document.removeEventListener("keydown", echap); };
  }, [ouvert]);
  return (
    <div className="lcol" ref={ref}>
      <button type="button" className={`ftab${actif ? " on" : ""}`} aria-expanded={ouvert}
        title="Choisir les colonnes affichées" onClick={() => setOuvert((o) => !o)}>
        Colonnes <span className="chev">▾</span>
      </button>
      {ouvert && (
        <div className="lcol-menu" role="menu">
          {GROUPES.map((g) => (
            <div key={g.label} className="lcol-g">
              <b>{g.label}</b>
              {g.cols.map((c) => (
                <label key={c} className={FIXES.has(c) ? "fixe" : undefined}>
                  <input type="checkbox" checked={colonnes.includes(c)} disabled={FIXES.has(c)}
                    onChange={() => onBasculer(c)} />
                  {COLONNES[c].menu ?? COLONNES[c].label}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** En dessous, les colonnes secondaires ne tiennent plus lisiblement. */
const SEUIL_COMPACT = 1000;
/** En dessous, aucun tableau ne tient : on passe aux cartes (téléphone). */
const SEUIL_MOBILE = 640;

const PLURIEL: Record<string, string> = {
  Logement: "Logements", Commerce: "Commerces", Bureau: "Bureaux",
  Logistique: "Entrepôts", Cave: "Caves", Parking: "Parkings", Annexe: "Annexes",
};

export function LotsEditor({ b, colonnes: choisies = VUES.base }: {
  b: BienData;
  /** Les colonnes de la vue en cours (#379) ; la vue de base à défaut. */
  colonnes?: ColKey[];
}) {
  const immeubleId = String(b.im._id);
  /* Le recensement ADEME (#DPE) : une fenêtre de consultation, hors de la
     mémoire d'écran — une fenêtre ouverte n'est pas un travail à retrouver. */
  const [dpe, setDpe] = useState(false);
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
  /* Le bail et le locataire de chaque lot, tels qu'ils sont en base (#379). */
  const bailDe = (lotId: string) =>
    b.baux.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(lotId));
  const locDe = (lotId: string) =>
    b.locataires.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(lotId));
  const initial = useMemo(
    () => b.lots.map((l, i) => {
      const id = String(l._id);
      const bail = b.baux.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(id));
      const loc = b.locataires.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(id));
      return toRow(l, i, String(travauxDuLot.get(id) ?? ""), bail, loc);
    }),
    [b.lots, b.baux, b.locataires, travauxDuLot],
  );
  /* Point de retour de « Annuler » (#85) : la dernière version enregistrée. */
  const enregistre = useRef<Row[]>(initial);
  const [rows, setRows] = useState<Row[]>(initial);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [destOff, setDestOff] = useState<Set<string>>(new Set());

  // Largeur réellement disponible : en dessous du seuil on bascule en vue
  // compacte plutôt que de comprimer vingt colonnes à 17 px.
  const wrap = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      setCompact(e.contentRect.width < SEUIL_COMPACT);
      setMobile(e.contentRect.width < SEUIL_MOBILE);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /** Lot ouvert en plein écran sur téléphone (null = la liste de cartes). */
  const [lotOuvert, setLotOuvert] = useState<string | null>(null);

  const compacte = compact;
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

  /* Colonnes réellement affichées, dans l'ordre du tableau : la vue choisie,
     moins ce que la fenêtre étroite ne peut pas montrer (#54). */
  const colonnes = ORDRE.filter((c) => choisies.includes(c) && !(compacte && COLONNES[c].large));
  /* Les groupes de l'en-tête qui ont encore au moins une colonne, et la
     première colonne de chacun, qui porte le séparateur gras. */
  const groupes = GROUPES
    .map((g) => ({ label: g.label, cols: g.cols.filter((c) => colonnes.includes(c)) }))
    .filter((g) => g.cols.length > 0);
  const brd = new Set(groupes.map((g) => g.cols[0]));
  const cls = (c: ColKey, ...extra: (string | false | undefined)[]) =>
    [brd.has(c) ? "brd" : "", ...extra].filter(Boolean).join(" ") || undefined;

  const poids = (c: ColKey) => (compacte ? COLONNES[c].poidsCompact : undefined) ?? COLONNES[c].poids;
  const totalPoids = colonnes.reduce((s2, c) => s2 + poids(c), 0);
  const largeur = (c: ColKey) => (poids(c) / totalPoids) * 100;

  const visibles = rows.filter((r) => !destOff.has(r.Destination || "Annexe"));

  const totaux = useMemo(() => {
    /* Caves et parkings comptent en lots, pas en m² (retour #250) : les
       additionner gonflerait la surface de l'immeuble et écraserait le loyer
       au m², qu'on lit juste en dessous. */
    const surfaces = visibles.filter((r) => !compteAuLot(r.Destination));
    const carrez = surfaces.reduce((s, r) => s + (N(r.surface_carrez) ?? 0), 0);
    const occ = surfaces.filter((r) => (N(r.loyer) ?? 0) > 0);
    const carrezOcc = occ.reduce((s, r) => s + (N(r.surface_carrez) ?? 0), 0);
    /* Les revenus, eux, comptent tout : un loyer de cave est un loyer. Seul le
       ratio au m² se limite aux lots qui ont une surface — sinon il rapporte
       des loyers de parkings à une surface qui ne les contient pas. */
    const loyersAn = visibles.reduce((s, r) => s + (N(r.loyer) ?? 0), 0) * 12;
    const maxAn = visibles.reduce((s, r) => s + (N(r.loyer_max) ?? N(r.loyer) ?? 0), 0) * 12;
    const loyersSurfaces = occ.reduce((s, r) => s + (N(r.loyer) ?? 0), 0);
    return {
      lots: visibles.length, carrez, loyersAn, maxAn,
      // Le « % » du bandeau du BO est l'occupation FINANCIÈRE :
      // loyers actuels / loyers potentiels (vérifié : 1 206 583 / 1 253 323 ≈ 97 %).
      occupation: maxAn > 0 ? Math.round((loyersAn / maxAn) * 100) : 0,
      m2mois: carrezOcc > 0 ? loyersSurfaces / carrezOcc : 0,
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
        return { ...r, [field]: value, ...(suit ? { [suite!]: value } : null), ...bailDeduit(r, field, value) };
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

  const nextNumero = (rs: Row[]) =>
    rs.reduce((m, r) => Math.max(m, parseInt(r.numero, 10) || 0), 0) + 1;

  /** Une ligne neuve, prête à être remplie. */
  const ligneNeuve = (id: string, ordre: number, numero: number, dest = "Logement", type = ""): Row => ({
    id, isNew: true, ordre, travaux: "", travaux_objet: "", travaux_urgence: "",
    batiment: "", etage: "", numero: String(numero),
    Destination: dest, Type_lot: type, surface_carrez: "", surface_sol: "",
    Type_bail: "Vide", loyer: "", loyer_max: "", lot_rattache: "", Etat: "n.c.", Type_dpe: "n.c.",
    renov_year: "", commentaire: "",
    ...VIDE_BAIL_LOC,
  });

  /**
   * Ajoute N lots d'une destination et d'un type (retour #375). Les
   * numéros suivent le plus grand numéro du tableau, saisie en cours comprise.
   */
  const ajouterLots = (nombre: number, dest = "Logement", type = "") => {
    const base = Date.now();
    const ids: string[] = [];
    setRows((rs) => {
      let numero = nextNumero(rs);
      const neuves: Row[] = [];
      for (let k = 0; k < nombre; k++) {
        const id = `new_${base}_${k}`;
        ids.push(id);
        neuves.push(ligneNeuve(id, rs.length + k, numero++, dest, type));
      }
      return [...rs, ...neuves];
    });
    setDirty((d) => { const n = new Set(d); ids.forEach((id) => n.add(id)); return n; });
  };

  /**
   * Duplique chaque lot coché en N copies (retour #375). Les copies sont des
   * lignes neuves du tableau — pas des lots en base : rien ne part avant
   * « Enregistrer », et « Annuler » les fait disparaître. Le bail et le
   * locataire ne se copient pas : une cave dupliquée n'a pas déjà son
   * locataire.
   */
  const dupliquerLots = (copies: number) => {
    const base = Date.now();
    const ids: string[] = [];
    setRows((rs) => {
      let numero = nextNumero(rs);
      const neuves: Row[] = [];
      for (const src of rs.filter((r) => sel.has(r.id))) {
        for (let k = 0; k < copies; k++) {
          const id = `new_${base}_${neuves.length}`;
          ids.push(id);
          neuves.push({
            ...src, id, isNew: true, ordre: rs.length + neuves.length, numero: String(numero++),
            travaux: "", travaux_objet: "", travaux_urgence: "", lot_rattache: "",
            ...VIDE_BAIL_LOC,
          });
        }
      }
      return [...rs, ...neuves];
    });
    setDirty((d) => { const n = new Set(d); ids.forEach((id) => n.add(id)); return n; });
    setSel(new Set());
  };

  /** La fenêtre « combien ? » ouverte, s'il y en a une (#375). */
  const [fenetreLots, setFenetreLots] = useState<"dupliquer" | "ajouter" | null>(null);

  /** Écrit le bail et le locataire d'un lot s'ils ont bougé (#379). */
  const enregistrerBailLoc = async (r: Row, id: string, avant: Row | undefined) => {
    const bailExiste = !!bailDe(r.id);
    /* Le type de bail est une colonne du lot ; s'il change et qu'un bail
       existe, le bail suit — l'ancien onglet Baux le tenait à jour aussi. */
    if (differe(avant, r, CHAMPS_BAIL) || (bailExiste && avant?.Type_bail !== r.Type_bail)) {
      await bailDuLot(immeubleId, id, {
        Type_bail: r.Type_bail && !BAIL_VIDE.has(r.Type_bail) ? r.Type_bail : null,
        loyer_init: nb(r.b_loyer),
        depot_garantie: nb(r.b_dg),
        date_start: r.b_entree || null,
        indice_type: r.b_indice || null,
        indice_init: nb(r.b_i0),
        indice_actuel: nb(r.b_i1),
        statut: statutBail(r.b_statut),
        commentaire: r.b_com || null,
      });
    }
    if (differe(avant, r, CHAMPS_LOC)) {
      const lc = locDe(r.id);
      const pm = r.l_pm === "oui";
      if (lc) {
        await updateLocataire(immeubleId, String(lc._id), {
          pm,
          pm_nom: pm ? (r.l_nom || null) : null,
          pp_civilite: pm ? null : (r.l_civ || null),
          pp_prenom: pm ? null : (r.l_prenom || null),
          pp_nom: pm ? null : (r.l_nom || null),
          phone: r.l_phone || null,
          email: r.l_email || null,
          commentaire: r.l_com || null,
        });
      } else if (r.l_nom.trim()) {
        /* Tant qu'il n'a pas de nom, le locataire n'existe pas : une fiche
           sans nom ne servirait à personne. */
        await addLocataire(immeubleId, {
          pm,
          pm_nom: pm ? r.l_nom : undefined,
          pp_civilite: pm ? undefined : r.l_civ || undefined,
          pp_prenom: pm ? undefined : r.l_prenom || undefined,
          pp_nom: pm ? undefined : r.l_nom,
          phone: r.l_phone || undefined,
          email: r.l_email || undefined,
          lotIds: [id],
          commentaire: r.l_com || undefined,
        });
      }
    }
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
          await setLotTravaux(immeubleId, id, `lot ${r.numero || r.Type_lot || ""}`.trim(), montant, null, 0, objetTravaux(r));
        }
        /* Le bail et le locataire saisis sur la ligne — ou venus de la
           matrice (#261) : maintenant que le lot a une identité, ils peuvent
           s'y rattacher. */
        await enregistrerBailLoc(r, id, undefined);
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
        await setLotTravaux(immeubleId, r.id, `lot ${r.numero || r.Type_lot || ""}`.trim(), cible, dediee ? String(dediee._id) : null, autres, objetTravaux(r));
      }
      /* Bail et locataire des lots existants (#379) : seulement ce qui a
         bougé depuis la dernière version enregistrée. */
      for (const r of edits) {
        await enregistrerBailLoc(r, r.id, enregistre.current.find((x) => x.id === r.id));
      }
      reordonne.current = false;
      enregistre.current = rows.map((r) => ({
        ...r, isNew: false, travaux: "", travaux_objet: "", travaux_urgence: "",
      }));
      setImporte(null);
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

  /** Le lot dont on demande l'objet des travaux (retour #254). */
  const [objetDe, setObjetDe] = useState<string | null>(null);

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

  /* La matrice vierge à remplir dans Excel (retour #261). Elle porte les mêmes
     colonnes que l'import, plus celles du bail et du locataire : un immeuble de
     cinquante lots se remplit au tableur, pas case par case à l'écran. */
  const matrice = () => {
    const url = URL.createObjectURL(new Blob([matriceCsv()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `matrice-etat-locatif-${S(b.im.adresse_ville) || "immeuble"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Ce que l'import vient de créer, à annoncer avant que l'agent enregistre. */
  const [importe, setImporte] = useState<{ lots: number; baux: number; locataires: number } | null>(null);

  const importer = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const lues = lireMatrice(String(reader.result ?? ""));
      if (lues.length === 0) {
        setImporte({ lots: 0, baux: 0, locataires: 0 });
        return;
      }
      const nouveaux: Row[] = [];
      let baux = 0, locataires = 0;
      for (const { lot: o, bail, locataire } of lues) {
        const id = `new_${Date.now()}_${nouveaux.length}`;
        if (rempli(bail)) baux++;
        if (locataire.nom.trim()) locataires++;
        /* Le bail et le locataire de la matrice prennent leurs colonnes dans
           la ligne (#379) : ils se relisent dans les vues Baux et Locataires
           avant d'être enregistrés, comme le reste. */
        nouveaux.push({
          id, isNew: true, ordre: 0, travaux: "", travaux_objet: "", travaux_urgence: "",
          batiment: o.batiment, etage: o.etage, numero: o.numero,
          Destination: o.Destination || "Logement", Type_lot: o.Type_lot,
          surface_carrez: o.surface_carrez, surface_sol: o.surface_sol,
          Type_bail: o.Type_bail || "Vide", loyer: o.loyer, loyer_max: o.loyer_max,
          lot_rattache: "",
          Etat: o.Etat || "n.c.", Type_dpe: o.Type_dpe || "n.c.",
          renov_year: o.renov_year, commentaire: o.commentaire,
          b_loyer: bail.loyer_initial ?? "", b_dg: bail.depot_garantie ?? "",
          b_entree: dateMatrice(bail.date_entree ?? ""), b_indice: bail.indice ?? "",
          b_i0: bail.indice_signature ?? "", b_i1: bail.indice_actuel ?? "",
          b_statut: statutBail(bail.statut ?? ""), b_com: bail.commentaire ?? "",
          l_pm: /^(oui|o|x|vrai|true|1)$/i.test((locataire.societe ?? "").trim()) ? "oui" : "",
          l_civ: locataire.civilite ?? "", l_prenom: locataire.prenom ?? "", l_nom: locataire.nom ?? "",
          l_phone: locataire.telephone ?? "", l_email: locataire.email ?? "", l_com: locataire.commentaire ?? "",
        });
      }
      setRows((rs) => [...rs, ...nouveaux]);
      setDirty((d) => { const n = new Set(d); nouveaux.forEach((r) => n.add(r.id)); return n; });
      setImporte({ lots: nouveaux.length, baux, locataires });
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

  /** Une case de saisie texte, sur toute la largeur de sa colonne. */
  const texte = (c: ColKey, r: Row, champ: keyof Row, placeholder?: string) => (
    <td key={c} className={cls(c)}>
      <input className="lcell" value={r[champ] as string} placeholder={placeholder}
        onChange={(e) => edit(r.id, champ, e.target.value)} />
    </td>
  );
  /** Une case de nombre, avec son unité à droite. */
  const nombre = (c: ColKey, r: Row, champ: keyof Row, unite?: string) => (
    <td key={c} className={cls(c, "na")}>
      <input className="lcell num" value={r[champ] as string} onChange={(e) => edit(r.id, champ, e.target.value)} />
      {unite && <i>{unite}</i>}
    </td>
  );

  /** La cellule d'une colonne pour une ligne. */
  const cellule = (c: ColKey, r: Row) => {
    switch (c) {
      case "bat": return texte(c, r, "batiment");
      case "etg": return texte(c, r, "etage");
      case "num":
        /* La poignée se glisse sous le numéro : ni colonne en plus, ni ligne
           plus haute (#82). */
        return (
          <td key={c} className={cls(c, "poi")}>
            <input className="lcell" value={r.numero} onChange={(e) => edit(r.id, "numero", e.target.value)} />
            <span
              className="grip" draggable title="Glisser pour déplacer la ligne"
              onDragStart={() => setGlisse(r.id)}
              onDragEnd={() => setGlisse(null)}
            >
              <svg viewBox="0 0 16 6"><circle cx="4" cy="3" r="1.1" /><circle cx="8" cy="3" r="1.1" /><circle cx="12" cy="3" r="1.1" /></svg>
            </span>
          </td>
        );
      case "dest":
        return (
          <td key={c} className={cls(c, "dest")} title={r.Destination}>
            <span className="destic">
              {r.Destination
                ? <svg viewBox="0 0 24 24">{IC_DEST[r.Destination] ?? IC_DEST.Annexe}</svg>
                : <i>—</i>}
            </span>
            <select className="lcell inv" value={r.Destination}
              onChange={(e) => {
                edit(r.id, "Destination", e.target.value);
                edit(r.id, "Type_lot", "");
                /* Devenu cave ou parking, le lot n'a plus de Carrez : la case
                   disparaît, sa valeur doit disparaître avec elle, sinon elle
                   continue de peser dans le total sans que personne puisse la
                   voir (retour #250). */
                if (compteAuLot(e.target.value)) edit(r.id, "surface_carrez", "");
              }}>
              <option value="" />{DESTINATIONS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </td>
        );
      case "type":
        return (
          <td key={c} className={cls(c)}>
            <CelluleTypologie valeur={r.Type_lot} destination={r.Destination}
              ajouts={b.typologies} onChange={(v) => edit(r.id, "Type_lot", v)} />
          </td>
        );
      case "carrez":
        /* Caves et parkings : pas de Carrez (retour #250). La case est barrée
           plutôt que masquée — une colonne qui disparaît d'une ligne sur
           l'autre désaligne la lecture. La surface au sol, elle, reste
           saisissable : elle renseigne sans entrer dans le total de
           l'immeuble. Retour #305 — « à la place de zéro sur ces types de
           lots on devrait pouvoir choisir NC » : « n.c. » est une réponse,
           un tiret se lit comme un oubli. */
        return compteAuLot(r.Destination)
          ? <td key={c} className={cls(c, "na", "sansm2")} title="Une cave ou un parking se compte au lot, pas au m² — surface Carrez sans objet">n.c.</td>
          : nombre(c, r, "surface_carrez", "m²");
      case "sol": return nombre(c, r, "surface_sol", "m²");
      case "bail":
        return (
          <td key={c} className={cls(c)}>
            <CelluleBail
              r={r} lots={rows}
              onBail={(v) => edit(r.id, "Type_bail", v)}
              onLot={(v) => edit(r.id, "lot_rattache", v)}
            />
          </td>
        );
      case "hc": return nombre(c, r, "loyer", "€");
      case "hcm2": {
        const act = m2(r.loyer, r.surface_carrez);
        return <td key={c} className={cls(c, "na", "pc")}>{act ? ecart(act) ?? `${act.toFixed(1).replace(".", ",")} €` : <span className="nc">n.a.</span>}</td>;
      }
      case "hcmax": return nombre(c, r, "loyer_max", "€");
      case "hcmaxm2": {
        const max = m2(r.loyer_max || r.loyer, r.surface_carrez);
        return <td key={c} className={cls(c, "na", "pc")}>{max ? ecart(max) ?? `${max.toFixed(1).replace(".", ",")} €` : <span className="nc">n.a.</span>}</td>;
      }
      case "etat":
        return (
          <td key={c} className={cls(c)}>
            <select className={`lcell${!r.Etat || r.Etat === "n.c." ? " vide" : ""}${r.Etat === "Travaux" ? " red" : ""}`} value={r.Etat} onChange={(e) => edit(r.id, "Etat", e.target.value)}>
              <option value="" />{[...new Set([r.Etat, ...ETATS])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
            </select>
          </td>
        );
      case "travaux":
        return (
          <td key={c} className={cls(c, "na")}>
            <span className={parseFloat(r.travaux) > 0 ? "tvx" : undefined}>
              {/* Retour #254 : « quand on rentre des travaux ici je veux
                  qu'on ait une modale qui s'ouvre rapidement pour demander à
                  quoi ça correspond ». Elle s'ouvre en quittant la case, pas à
                  chaque frappe, et seulement si le montant a bougé vers du
                  positif. */}
              <input
                className="lcell num" value={r.travaux} placeholder="0"
                onChange={(e) => edit(r.id, "travaux", e.target.value)}
                onBlur={() => {
                  const v = parseFloat(r.travaux.replace(/[^\d.,]/g, "").replace(",", "."));
                  const avant = travauxDuLot.get(r.id) ?? 0;
                  if (Number.isFinite(v) && v > 0 && v !== avant) setObjetDe(r.id);
                }}
              />
              <i>€</i>
            </span>
          </td>
        );
      case "dpe":
        return (
          <td key={c} className={cls(c)}>
            {/* La lettre du DPE occupe toute la case : pas de réserve de
                chevron, sinon elle disparaît dans une colonne étroite (#56).
                #173 — l'étiquette de Plein Bail sert de visage à la liste : le
                select passe dessus, transparent, et garde le clic. Rien de
                saisi : la case reste vide, avec la seule flèche de la liste
                (retour #252). */}
            <span className={`dpe-cell${r.Type_dpe ? "" : " nu"}`}>
              <BadgeDpe lettre={r.Type_dpe} />
              <select value={r.Type_dpe} aria-label="DPE"
                onChange={(e) => edit(r.id, "Type_dpe", e.target.value)}>
                {/* La liste garde l'ordre du référentiel (retour #253). Une
                    valeur héritée qu'on ne connaît pas s'ajoute à la fin. */}
                <option value="" />
                {DPES.map((o) => <option key={o}>{o}</option>)}
                {r.Type_dpe && !DPES.includes(r.Type_dpe) && <option>{r.Type_dpe}</option>}
              </select>
            </span>
          </td>
        );
      case "renov":
        return (
          <td key={c} className={cls(c, "na")}>
            <input className="lcell num" value={r.renov_year} inputMode="numeric" maxLength={4} placeholder="AAAA"
              onChange={(e) => edit(r.id, "renov_year", e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </td>
        );
      case "b_loyer": return nombre(c, r, "b_loyer", "€");
      case "b_dg": return nombre(c, r, "b_dg", "€");
      case "b_entree":
        return (
          <td key={c} className={cls(c)}>
            <ChampDate classe="lcell" valeur={r.b_entree} onChange={(d) => edit(r.id, "b_entree", d)} />
          </td>
        );
      case "b_indice":
        return (
          <td key={c} className={cls(c)}>
            <select className="lcell" value={r.b_indice} onChange={(e) => edit(r.id, "b_indice", e.target.value)}>
              <option value="" />
              {INDICES_BAIL.map((i) => <option key={i}>{i}</option>)}
            </select>
          </td>
        );
      case "b_i0": return nombre(c, r, "b_i0");
      case "b_i1": return nombre(c, r, "b_i1");
      case "b_revise": {
        /* Déduit du loyer initial et des deux indices : le laisser saisir,
           c'est laisser entrer une incohérence. */
        const li = N(r.b_loyer), i0 = N(r.b_i0), i1 = N(r.b_i1);
        const revise = li && i0 && i1 && i0 > 0 ? Math.round((li * i1) / i0) : undefined;
        return <td key={c} className={cls(c, "na")}>{revise !== undefined ? euros(revise) : <span className="nc">—</span>}</td>;
      }
      case "b_statut":
        return (
          <td key={c} className={cls(c)}>
            <select className="lcell" value={r.b_statut} onChange={(e) => edit(r.id, "b_statut", e.target.value)}>
              {STATUTS_BAIL.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </td>
        );
      case "b_com": return texte(c, r, "b_com");
      case "l_pm":
        return (
          <td key={c} className={cls(c)}>
            <select className="lcell" value={r.l_pm ? "morale" : "physique"}
              onChange={(e) => edit(r.id, "l_pm", e.target.value === "morale" ? "oui" : "")}>
              {/* « Physique » / « Morale » : « Personne physique » ne tenait
                  pas dans la colonne, on ne lisait que « Personne ». */}
              <option value="physique">Physique</option>
              <option value="morale">Morale</option>
            </select>
          </td>
        );
      case "l_civ":
        /* Une société n'a pas de civilité : la case se tait plutôt que
           d'attendre une réponse qui n'existe pas. */
        return r.l_pm ? <td key={c} className={cls(c)}><span className="nc">—</span></td> : (
          <td key={c} className={cls(c)}>
            <select className="lcell" value={r.l_civ} onChange={(e) => edit(r.id, "l_civ", e.target.value)}>
              <option value="" /><option>M.</option><option>Mme</option>
            </select>
          </td>
        );
      case "l_prenom":
        return r.l_pm ? <td key={c} className={cls(c)}><span className="nc">—</span></td> : texte(c, r, "l_prenom");
      case "l_nom": return texte(c, r, "l_nom", r.l_pm ? "Raison sociale" : "NOM");
      case "l_phone": return texte(c, r, "l_phone");
      case "l_email": return texte(c, r, "l_email");
      case "l_com": return texte(c, r, "l_com");
      case "commentaire": return texte(c, r, "commentaire");
      case "photos":
        /* Les photos associées au lot dans l'écran Photos (#95). */
        return <td key={c} className={cls(c, "na")}><PhotosDuLot b={b} lotId={r.id} /></td>;
    }
  };

  /* Les destinations déjà dans le bien, la plus fréquente d'abord : c'est
     ce que la fenêtre « Ajouter » propose en premier (#375). */
  const destPresentes = destVisibles
    .filter((d) => (parDest.get(d) ?? 0) > 0)
    .sort((x, y) => (parDest.get(y) ?? 0) - (parDest.get(x) ?? 0));

  return (
    <div>
      {/* En-tête : synthèse · bascules de destinations. Les bascules de
          colonnes ont rejoint le menu « Colonnes » de la barre du haut (#379). */}
      <div className="lhead v3">
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

        {/* Les interrupteurs de destination, au dessin du BO (retour #376). */}
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
        {/* Sur téléphone, le tableau laisse la place aux cartes : une grille
            sert à comparer des lignes, or en visite on ne compare rien — on
            remplit un lot puis le suivant. */}
        {mobile ? (
          <>
            <LotsCartes
              lignes={visibles} b={b} dirty={dirty}
              onChange={edit}
              onOuvrir={setLotOuvert}
              onAjouter={() => ajouterLots(1)}
            />
            {lotOuvert && visibles.some((r) => r.id === lotOuvert) && (
              <LotPleinEcran
                lignes={visibles}
                index={visibles.findIndex((r) => r.id === lotOuvert)}
                b={b} dirty={dirty} enregistrement={pending}
                onChange={edit}
                onFermer={() => setLotOuvert(null)}
                onNaviguer={(d) => {
                  const i = visibles.findIndex((r) => r.id === lotOuvert) + d;
                  if (i >= 0 && i < visibles.length) setLotOuvert(visibles[i].id);
                }}
                onEnregistrer={save}
              />
            )}
          </>
        ) : (
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
              {groupes.map((g) => (
                <th key={g.label} className="grp brd" colSpan={g.cols.length}>{g.label}</th>
              ))}
            </tr>
            <tr>
              {colonnes.map((c) => <th key={c} className={cls(c)}>{COLONNES[c].label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr
                key={r.id}
                className={glisse === r.id ? "glisse" : undefined}
                style={dirty.has(r.id) ? { background: "#fffbea" } : undefined}
                onDragOver={(e) => { if (glisse) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); deposer(r.id); }}
              >
                <td className="brd"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                {colonnes.map((c) => cellule(c, r))}
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={nbCols} className="fempty" style={{ padding: 22 }}>
                {rows.length === 0 ? "Aucun lot saisi — cliquez sur « + Ajouter »." : "Aucun lot pour les destinations sélectionnées."}
              </td></tr>
            )}
          </tbody>
        </table>
        )}
      </div>

      {/* Ce que l'import a lu (#261). Un import muet est le pire des deux
          mondes : ou bien il n'a rien lu et l'agent le découvre en cherchant
          ses lots, ou bien il en a lu quinze de trop et il faut les défaire.
          Le compte s'affiche AVANT l'enregistrement — rien n'est encore
          écrit, « Annuler » suffit à tout reprendre. */}
      {importe && (
        <div className={`imp-avis${importe.lots === 0 ? " ko" : ""}`}>
          {importe.lots === 0 ? (
            <>Aucune ligne lue. Vérifiez que le fichier vient bien du bouton « Matrice » — une ligne
            sans numéro de lot, sans surface et sans loyer est ignorée.</>
          ) : (
            <><b>{importe.lots}</b> lot{importe.lots > 1 ? "s" : ""} lu{importe.lots > 1 ? "s" : ""}
            {importe.baux > 0 && <>, dont <b>{importe.baux}</b> avec un bail</>}
            {importe.locataires > 0 && <> et <b>{importe.locataires}</b> avec un locataire</>}.
            Relisez le tableau, puis enregistrez.</>
          )}
          <button type="button" onClick={() => setImporte(null)} aria-label="Fermer">✕</button>
        </div>
      )}

      {/* Barre d'outils sticky, libellés visibles, import/export */}
      <div className="ltools v2">
        {/* Ajouter et Dupliquer demandent d'abord « combien ? » (#375). */}
        <button className="ltb lbl" type="button" onClick={() => setFenetreLots("ajouter")}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg> Ajouter
        </button>
        <button className="ltb lbl" type="button" onClick={() => setFenetreLots("dupliquer")} disabled={sel.size === 0 || pending}>
          <svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg> Dupliquer
        </button>
        <button className="ltb lbl red" type="button" onClick={() => setASupprimer(true)} disabled={sel.size === 0 || pending}>
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg> Supprimer
        </button>
        <span className="sp" style={{ flex: 1 }} />
        {/* Import et export au centre, comme au BO : la place de droite est
            celle d'Annuler et d'Enregistrer (#85). */}
        {/* Retour #261 — la matrice se télécharge à côté d'Importer, parce que
            c'est là qu'on la cherche : on vient pour importer, on découvre
            qu'il faut un fichier au bon format. */}
        <button className="ltb lbl gold" type="button" onClick={matrice}
          title="Télécharger le tableau vierge à remplir (lots, baux et locataires)">
          <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M9 9v11" /></svg> Matrice
        </button>
        <label className="ltb lbl gold">
          <svg viewBox="0 0 24 24"><path d="M12 16V4M8 8l4-4 4 4M4 20h16" /></svg> Importer
          <input type="file" accept=".csv,text/csv" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importer(f); e.target.value = ""; }} />
        </label>
        <button className="ltb lbl gold" type="button" onClick={exporter}>
          <svg viewBox="0 0 24 24"><path d="M12 4v12M8 12l4 4 4-4M4 20h16" /></svg> Télécharger
        </button>
        {/* Le recensement des DPE publiés par l'ADEME à cette adresse. Il vit
            ici, à côté du tableau des lots, parce que c'est là qu'on se pose la
            question — et il n'écrit rien dans la colonne DPE : c'est une
            fenêtre de consultation, l'agent rattache s'il veut. */}
        <button className="ltb lbl gold" type="button" onClick={() => setDpe(true)}
          title="Recenser les DPE publiés par l'ADEME à cette adresse">
          <svg viewBox="0 0 24 24"><path d="M4 20h16M7 20V9l5-5 5 5v11M10 20v-5h4v5" /></svg> DPE ADEME
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

      {fenetreLots && (
        <ModaleLots
          mode={fenetreLots}
          nbSel={sel.size}
          presentes={destPresentes}
          typologies={b.typologies}
          onFermer={() => setFenetreLots(null)}
          onValider={(n, dest, type) => {
            if (fenetreLots === "dupliquer") dupliquerLots(n);
            else ajouterLots(n, dest, type);
            setFenetreLots(null);
          }}
        />
      )}

      {dpe && (
        <ModaleDpe
          immeubleId={immeubleId}
          adresse={[
            [S(b.im.adresse_numero_rue), S(b.im.adresse_rue)].filter(Boolean).join(" "),
            [S(b.im.adresse_zipcode), S(b.im.adresse_ville)].filter(Boolean).join(" "),
          ].filter(Boolean).join(", ")}
          agent={b.agentNom}
          /* Les lots tels qu'ils sont À L'ÉCRAN, saisie en cours comprise : si
             l'agent vient de corriger une surface, c'est celle-là qui doit
             servir au rapprochement, pas celle d'avant. */
          lots={rows.map((r) => ({
            id: r.id,
            libelle: libelleLot(r),
            etage: r.etage === "" ? undefined : Number(r.etage),
            surface: r.surface_carrez === "" ? undefined
              : Number(String(r.surface_carrez).replace(",", ".")) || undefined,
          }))}
          onFermer={() => setDpe(false)}
        />
      )}

      {/* Retour #254 — le détail des travaux du lot, demandé au moment où on
          saisit le montant : c'est le seul moment où l'agent l'a en tête. */}
      {objetDe && (() => {
        const r = rows.find((x) => x.id === objetDe);
        if (!r) return null;
        const fermer = () => setObjetDe(null);
        return (
          <Modale
            titre={<>Travaux du {libelleLot(r).toLowerCase()}</>}
            onFermer={fermer}
            className="etroit"
            pied={
              <button className="kgo" type="button" onClick={fermer}>
                <span className="ch">›</span> C&apos;est noté
              </button>
            }
          >
            <p className="mhint">
              {euros(parseFloat(r.travaux.replace(",", "."))) ?? "Montant à préciser"}{" — à quoi"}
              correspondent-ils ? Ce que vous écrivez ici s&apos;affiche dans l&apos;onglet Travaux
              et sur le dossier, à la place de « Travaux lot {r.numero || "?"} ».
            </p>
            <span className="mlab">Objet des travaux</span>
            <input
              className="min" autoFocus value={r.travaux_objet}
              placeholder="Réfection de la salle de bains, remise aux normes électriques…"
              onChange={(e) => edit(r.id, "travaux_objet", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") fermer(); }}
            />
            <span className="mlab">Urgence</span>
            <div className="mrow">
              {["Haute", "Moyenne", "Basse"].map((u) => (
                <button
                  key={u} type="button"
                  className={`mopt${r.travaux_urgence === u ? " on" : ""}`}
                  onClick={() => edit(r.id, "travaux_urgence", r.travaux_urgence === u ? "" : u)}
                >{u}</button>
              ))}
            </div>
          </Modale>
        );
      })()}

      {aSupprimer && (
        <Modale
          titre={<>Supprimer {sel.size > 1 ? `${sel.size} lots` : "un lot"}</>}
          onFermer={() => setASupprimer(false)}
          className="sup-mod"
          pied={
            <>
              <button type="button" className="ltb annul" onClick={() => setASupprimer(false)}>Annuler</button>
              <button type="button" className="sup-go" disabled={pending} onClick={remove}>
                Supprimer {sel.size > 1 ? `les ${sel.size} lots` : "le lot"}
              </button>
            </>
          }
        >
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
        </Modale>
      )}
    </div>
  );
}
