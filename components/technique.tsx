"use client";

// État technique — sous-onglets Composants · Travaux (réplique BO).
// Composants = cartes type/matériau/état ; travaux rattachés à des lots
// OU à des composants du bâti, groupés par urgence.
import { useState, useTransition } from "react";
import { useBaseSaisie } from "@/lib/base-saisie";
import type { BienData } from "@/lib/bubble/server";
import { Picto } from "@/components/pictos";
import { euros, S } from "@/lib/format";
import {
  addComposant, addTravaux, deleteComposant, deleteTravaux, joindreDevis,
  updateComposant, updateTechnique, updateTravaux,
} from "@/lib/bo/actions";
import { BarreEnregistrer } from "@/components/barre-enregistrer";
import { Modale, useQuestion } from "@/components/modale";

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
/** Les pièces jointes vivent dans le bucket privé : elles passent par le proxy. */
const proxyFichier = (u: string) =>
  u.startsWith("storage:") ? `/api/photo?s=${encodeURIComponent(u.slice("storage:".length))}` : u;

import {
  ajouterTypologie,
} from "@/lib/bo/actions";
import {
  ETATS_BATI, materiauxPour, RUBRIQUE_MATERIAU, TYPES_COMPOSANT,
} from "@/lib/referentiels";

const ETATS_COMPOSANT = ETATS_BATI;
const ETATS_GENERAL = ETATS_BATI;
const URGENCES = [
  ["Haute", "Travaux très urgents"],
  ["Moyenne", "Travaux moyennement urgents"],
  ["Basse", "Travaux peu urgents"],
] as const;

function lotLabel(l: Record<string, unknown>) {
  return [`Lot ${l.numero ?? "?"}`, l.Type_lot].filter(Boolean).join(" · ");
}

/* ---------- Composants ---------- */

/* Tous les immeubles ont une façade, une toiture, des fenêtres et un mode de
   chauffage : ces quatre-là sont toujours affichés, prêts à remplir, sans
   qu'il faille les créer (#91). Ils n'entrent en base qu'une fois renseignés. */
const COMPOSANTS_STANDARD = ["Chauffage", "Façade", "Fenêtres", "Toiture"] as const;

/**
 * Le pictogramme de chaque composant du bâti (retour #397).
 *
 * MAV : « fais-moi des pictos qui correspondent aux choses demandées : un
 * radiateur pour le chauffage, un toit pour la toiture, un immeuble pour la
 * façade, une fenêtre pour la fenêtre ». Les lignes portaient toutes le même
 * cube : on relisait le nom à chaque ligne, le picto ne servait à rien. Un
 * dessin par type de `TYPES_COMPOSANT`, trait 2 px sur 24 × 24 (le CSS #397
 * règle l'épaisseur), et le cube reste pour « Autre » et les types inconnus.
 */
const IC_COMPOSANT: Record<string, React.ReactNode> = {
  /* Un radiateur : le corps et ses ailettes, les deux pieds. */
  Chauffage: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7.5 6v12M12 6v12M16.5 6v12M5.5 18v2.5M18.5 18v2.5" /></>,
  /* Un immeuble : trois étages de fenêtres, la porte. */
  Façade: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M8.5 7h2M13.5 7h2M8.5 11h2M13.5 11h2M8.5 15h2M13.5 15h2M10.5 21v-3.5h3V21" /></>,
  /* Une fenêtre à quatre carreaux. */
  Fenêtres: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M12 4v16M4 12h16" /></>,
  /* Un toit qui déborde des murs, avec sa cheminée. */
  Toiture: <><path d="M2.5 13.5 12 5l9.5 8.5" /><path d="M16.3 6.3h2.4v4.2" /><path d="M5.5 10.8V19.5h13v-8.7" /></>,
  /* Une cabine, la flèche qui monte et celle qui descend. */
  Ascenseur: <><rect x="4.5" y="3" width="15" height="18" rx="1.5" /><path d="M12 3v18" /><path d="m6.8 10.5 1.7-2.2 1.7 2.2M13.8 13.5l1.7 2.2 1.7-2.2" /></>,
  /* Une grille d'évacuation. */
  Assainissement: <><circle cx="12" cy="12" r="8.5" /><path d="M12 5.5v13M8.2 7.4v9.2M15.8 7.4v9.2" /></>,
  /* Une ferme de charpente : l'entrait, les arbalétriers, le poinçon. */
  Charpente: <><path d="M2.5 18 12 5l9.5 13z" /><path d="M12 5v13M7.25 11.5 12 18l4.75-6.5" /></>,
  /* Sous le toit, la lucarne. */
  Combles: <><path d="M3 15 12 5l9 10" /><path d="M6 15v5.5h12V15" /><rect x="10" y="10.5" width="4" height="4.5" /></>,
  /* Un éclair. */
  Electricité: <><path d="M13.5 2.5 5 13.5h6L10.5 21.5 19 10.5h-6z" /></>,
  /* Un coude de tuyau, avec ses deux brides. */
  Plomberie: <><path d="M2.5 8.5h8.5a3 3 0 0 1 3 3V21" /><path d="M2.5 12.5h8.5v8.5" /><path d="M2.5 7v7M9.5 21h7" /></>,
  /* Un escalier : les parties communes se montent. */
  "Parties communes": <><path d="M3 20v-4h4.5v-4H12V8h4.5V4H21" /><path d="M3 20h18" /></>,
  /* Un ventilateur, quatre pales. */
  Ventilation: <><circle cx="12" cy="12" r="2.2" /><path d="M12 9.8C12 6 10.5 4 8 4c1.5 2 2 4 4 5.8zM14.2 12C18 12 20 10.5 20 8c-2 1.5-4 2-5.8 4zM12 14.2C12 18 13.5 20 16 20c-1.5-2-2-4-4-5.8zM9.8 12C6 12 4 13.5 4 16c2-1.5 4-2 5.8-4z" /></>,
  /* Deux battants à lames. */
  Volets: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M12 3v18M6.5 7h3M6.5 10.5h3M6.5 14h3M6.5 17.5h3M14.5 7h3M14.5 10.5h3M14.5 14h3M14.5 17.5h3" /></>,
  /* Le cube d'avant, pour ce qui n'a pas de dessin à lui. */
  Autre: <><path d="M12 2.6 21 7v10l-9 4.4L3 17V7z" /><path d="m3 7 9 4.4L21 7M12 11.4V21.4" /></>,
};

const pictoComposant = (type: string) => IC_COMPOSANT[type] ?? IC_COMPOSANT.Autre;

/** Vignette « Année de construction » / « État général », rouge tant que vide. */
function VignetteBati({
  icone, libelle, enfants, vide,
}: {
  icone: React.ReactNode; libelle: string; enfants: React.ReactNode; vide: boolean;
}) {
  return (
    <div className={`vbat${vide ? " requis" : ""}`}>
      <span className="vbat-ic"><svg viewBox="0 0 24 24">{icone}</svg></span>
      <span className="vbat-c">
        <b>{libelle}</b>
        {enfants}
      </span>
    </div>
  );
}

/**
 * Le matériau d'un composant : la liste, et la saisie libre sur « Autre »
 * (retour #263).
 *
 * MAV : « quand le type est Autre je veux pouvoir l'écrire moi-même et qu'on
 * me propose si je veux l'ajouter à la liste ». Même geste que pour les
 * typologies de lot (#22) : on écrit, et un bouton propose d'enregistrer le
 * libellé pour les prochains immeubles. Sans ce bouton, la valeur reste sur ce
 * composant-là et il faudra la retaper au dossier suivant.
 */
function ChoixMateriau({ composant, valeur, ajouts, onChange }: {
  composant: string;
  valeur: string;
  ajouts: { destination: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const liste = materiauxPour(composant, valeur, ajouts);
  const connus = materiauxPour(composant, undefined, ajouts).filter((m) => m !== "Autre");
  const [libre, setLibre] = useState(false);
  const [texte, setTexte] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!libre) {
    return (
      <select className={`min${valeur ? "" : " requis"}`} value={valeur}
        onChange={(e) => {
          if (e.target.value === "Autre") { setLibre(true); setTexte(""); setMsg(null); }
          else onChange(e.target.value);
        }}>
        <option value="">Matériau à préciser</option>
        {liste.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }

  const enregistrer = () =>
    start(async () => {
      /* Retour #314 — « quand j'ai essayé d'ajouter un matériau qui n'existait
         pas, ça m'a fait bugger la page complète. »
         La cause était en base (voir la migration
         `bo_refuser_reinsertion_cast_texte`), mais elle a révélé un défaut de
         forme ici : une action qui rend déjà un message d'échec ne doit pas,
         par ailleurs, laisser filer une exception. Un ajout refusé se dit dans
         la ligne ; il ne fait pas tomber l'écran et vingt minutes de saisie
         avec lui. Le matériau reste alors utilisé pour CE composant, même s'il
         n'a pas rejoint le référentiel. */
      try {
        const r = await ajouterTypologie(RUBRIQUE_MATERIAU(composant), texte, connus);
        setMsg(r.ok ? `« ${texte.trim()} » ajouté aux matériaux ${composant}.` : r.message);
        if (r.ok) { onChange(texte.trim()); setLibre(false); }
      } catch {
        setMsg("Enregistrement au référentiel impossible — le matériau reste saisi sur ce composant.");
        onChange(texte.trim());
      }
    });

  return (
    <span className="tlibre">
      <input className="min" autoFocus value={texte} placeholder="Matériau…"
        onChange={(e) => { setTexte(e.target.value); setMsg(null); }}
        onBlur={() => { if (texte.trim()) onChange(texte.trim()); }}
        onKeyDown={(e) => { if (e.key === "Escape") setLibre(false); }} />
      {/* Retour #396 — « rends les boutons un peu plus gros et plus précis,
          on les comprend pas, notamment le refresh qui a une forme bizarre ».
          Le « + » et le « ↺ » étaient des caractères dans des cases de 16 px :
          la flèche dépendait de la police, et rien ne disait ce qu'elle faisait
          avant de survoler. Deux pictos SVG nets, une case de 28 px, et un
          `title` en clair — la taille et le dessin sont dans le CSS (#396). */}
      <span className="tacts">
        <button type="button" title="Ajouter ce matériau à la liste, pour les prochains immeubles"
          aria-label="Ajouter ce matériau à la liste"
          disabled={pending || texte.trim().length < 2} onClick={enregistrer}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12h14M12 5v14" /></svg>
        </button>
        <button type="button" title="Abandonner la saisie libre et revenir à la liste des matériaux"
          aria-label="Revenir à la liste des matériaux" onClick={() => setLibre(false)}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
        </button>
      </span>
      {msg && <span className="tmsg">{msg}</span>}
    </span>
  );
}

/**
 * Une ligne de composant : matériau et état saisis sur place.
 *
 * Elle ne s'enregistre pas elle-même (retours #264 et #265). Chaque ligne
 * portait sa propre barre d'enregistrement, et cette barre est collée en bas
 * de l'écran : les cinq se superposaient au même endroit, seule la dernière du
 * document — la Toiture — était visible et cliquable. D'où les deux symptômes
 * signalés : on remplissait quatre composants, seul le dernier partait en
 * base ; et modifier la Façade laissait la barre visible sur « Tout est
 * enregistré », bouton gris, donc plus moyen d'enregistrer du tout.
 *
 * La saisie remonte donc à l'onglet, qui n'a qu'une barre et enregistre tout
 * ce qui a bougé d'un seul geste — la règle de tous les autres écrans.
 */
function LigneComposant({
  b, type, composant, valeur, onChange,
}: {
  b: BienData; type: string; composant?: Record<string, unknown>;
  valeur: Ligne;
  onChange: (v: Ligne) => void;
}) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const { confirmer, question } = useQuestion();
  const { materiau, etat } = valeur;
  const setMateriau = (v: string) => onChange({ ...valeur, materiau: v });
  const setEtat = (v: string) => onChange({ ...valeur, etat: v });

  const tvx = b.travaux
    .filter((t) => composant && Array.isArray(t.COMPOSANTs) && (t.COMPOSANTs as string[]).includes(String(composant._id)))
    .reduce((s, t) => s + (num(t.montant) ?? 0), 0);

  const standard = (COMPOSANTS_STANDARD as readonly string[]).includes(type);

  return (
    <>
      <div className={`cmp${pending ? " att" : ""}`}>
        <span className="cmp-ic"><svg viewBox="0 0 24 24">{pictoComposant(type)}</svg></span>
        {/* Retour #314 — « j'aimerais que le dropdown de sélection d'état soit
            plus proche de la sélection de matériaux, pour faciliter la
            complétion de la chose. L'idéal serait que le début du dropdown
            soit aligné au début du dropdown d'état général. »
            L'état était rejeté à l'autre bout de la ligne, et les menus de
            matériau démarraient chacun à une abscisse différente puisqu'ils
            suivaient le nom du composant — « Façade » et « Menuiseries
            extérieures » ne font pas la même longueur. Le nom, le matériau et
            l'état ont donc chacun leur colonne de largeur fixe : les cinq
            lignes s'alignent, et les deux menus qu'on remplit d'affilée sont
            côte à côte. */}
        <span className="cmp-c">
          <b className="cmp-l">
            <span className="cmp-n">{type}</span>
            <span className="tiret">—</span>
            <span className="cmp-m">
              <ChoixMateriau composant={type} valeur={materiau} ajouts={b.typologies} onChange={setMateriau} />
            </span>
            <select className={`min etat${etat ? "" : " requis"}`} value={etat} onChange={(e) => setEtat(e.target.value)}>
              <option value="">Etat à préciser</option>
              {[...new Set([etat, ...ETATS_COMPOSANT])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
            </select>
          </b>
          <span className={`cmp-tvx${tvx > 0 ? " on" : ""}`}>
            <svg viewBox="0 0 24 24"><path d="M13 3 4 12l3.5 3.5L14 9M11 12l6 6M14 15l4 4" /></svg>
            {tvx > 0 ? `${euros(tvx)} de travaux` : "Pas de travaux"}
          </span>
        </span>
        {standard ? (
          <span className="chg-lock" title="Composant permanent : il se remplit, il ne se supprime pas">
            <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </span>
        ) : (
          <button
            className="chg-x" type="button" title="Supprimer le composant"
            onClick={async () => {
              if (!composant) return;
              if (!(await confirmer("Supprimer ce composant ? (récupérable dans la corbeille)", { danger: true, oui: "Supprimer" }))) return;
              start(() => deleteComposant(immeubleId, String(composant._id)));
            }}
          >
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
          </button>
        )}
      </div>
      {question}
    </>
  );
}

/** L'état d'une ligne de composant pendant la saisie. */
type Ligne = { materiau: string; etat: string };

function ComposantsTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const [annee, setAnnee] = useState(S(num(b.im.year_constru)));
  const [etat, setEtat] = useState(S(b.im.Etat));

  const parType = (t: string) => b.composants.find((c) => String(c.Type_composant ?? "") === t);
  const enPlus = b.composants.filter(
    (c) => !(COMPOSANTS_STANDARD as readonly string[]).includes(String(c.Type_composant ?? "")),
  );

  /* Les lignes affichées, dans l'ordre de l'écran. Les quatre composants
     permanents d'abord — ils existent à l'écran avant d'exister en base — puis
     ceux qu'on a ajoutés. La clé distingue un composant enregistré (son id)
     d'un permanent encore vide (`std:Toiture`), qui reste à créer. */
  const affichees = [
    ...COMPOSANTS_STANDARD.map((t) => ({ cle: parType(t) ? String(parType(t)!._id) : `std:${t}`, type: t, composant: parType(t) })),
    ...enPlus.map((c) => ({ cle: String(c._id), type: S(c.Type_composant), composant: c })),
  ];

  const depart = () =>
    Object.fromEntries(affichees.map(({ cle, composant }) => [
      cle,
      { materiau: S(composant?.["Type_matériau"]), etat: S(composant?.Etat) } as Ligne,
    ]));

  const [lignes, setLignes] = useState<Record<string, Ligne>>(depart);
  const majLigne = (cle: string, v: Ligne) => setLignes((l) => ({ ...l, [cle]: v }));

  const { avant: enBase, modifie, poser } = useBaseSaisie({ annee, etat, lignes });

  /* Un seul enregistrement pour tout l'onglet : le bâti et toutes les lignes
     qui ont bougé (retours #264, #265). Les lignes intactes ne sont pas
     réécrites — inutile de faire dater un composant qu'on n'a pas touché. */
  const enregistrer = () =>
    start(async () => {
      const avant = enBase();
      await updateTechnique(immeubleId, { year_constru: parse(annee), Etat: etat || undefined });
      for (const { cle, type, composant } of affichees) {
        const v = lignes[cle];
        const a = avant.lignes?.[cle];
        if (!v || (a && a.materiau === v.materiau && a.etat === v.etat)) continue;
        const patch = { Type_materiau: v.materiau || undefined, Etat: v.etat || undefined };
        if (composant) await updateComposant(immeubleId, String(composant._id), patch);
        else if (v.materiau || v.etat) await addComposant(immeubleId, { Type_composant: type, ...patch });
      }
      poser({ annee, etat, lignes });
    });

  const annuler = () => {
    const a = enBase();
    setAnnee(a.annee);
    setEtat(a.etat);
    setLignes(a.lignes);
  };

  return (
    <div style={pending ? { opacity: 0.6 } : undefined}>
      <div className="blor">
        <div className="blor-t">
          <svg viewBox="0 0 24 24"><path d="M12 2.6 21 7v10l-9 4.4L3 17V7z" /><path d="m3 7 9 4.4L21 7M12 11.4V21.4" /></svg>
          Composants
        </div>
      </div>
      <div className="blor-add"><AddComposantButton b={b} /></div>

      <div className="vbat-row">
        <VignetteBati
          icone={<><path d="M4 20h16M6 20v-9l6-4 6 4v9" /><path d="M9 20v-5h6v5M8 6.5V4M12 5V3M16 6.5V4" /></>}
          libelle="Année de construction" vide={!annee}
          /* Retour #262 : quatre chiffres, et rien que des chiffres. La case
             acceptait « 19bb5000 », qui n'est pas une année et que le reste de
             l'application lit ensuite comme un nombre. */
          enfants={<input className={`min${annee ? "" : " requis"}`} value={annee}
            inputMode="numeric" maxLength={4} placeholder="AAAA"
            onChange={(e) => setAnnee(e.target.value.replace(/\D/g, "").slice(0, 4))} />}
        />
        <VignetteBati
          icone={<><path d="M3 12h4l2-5 3 10 2.5-7 1.5 2h5" /></>}
          libelle="Etat général" vide={!etat}
          enfants={
            <select className={`min${etat ? "" : " requis"}`} value={etat} onChange={(e) => setEtat(e.target.value)}>
              <option value="" />{[...new Set([etat, ...ETATS_GENERAL])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
            </select>
          }
        />
      </div>

      {affichees.map(({ cle, type, composant }) => (
        <LigneComposant
          key={cle} b={b} type={type} composant={composant}
          valeur={lignes[cle] ?? { materiau: "", etat: "" }}
          onChange={(v) => majLigne(cle, v)}
        />
      ))}

      <BarreEnregistrer
        modifie={modifie} pending={pending}
        onEnregistrer={enregistrer} onAnnuler={annuler}
      />
    </div>
  );
}

function AddComposantButton({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [type, setType] = useState("Façade");
  const [typeAutre, setTypeAutre] = useState("");
  const [mat, setMat] = useState("");
  const [matAutre, setMatAutre] = useState("");
  const [etat, setEtat] = useState("n.c.");
  const [renov, setRenov] = useState("");
  const [desc, setDesc] = useState("");
  /* La fenêtre de création propose les mêmes matériaux que la ligne, ajouts
     des agents compris (retour #263). */
  const mats = materiauxPour(type, mat, b.typologies);

  const submit = () =>
    start(async () => {
      await addComposant(immeubleId, {
        Type_composant: type,
        type_composant_autre: type === "Autre" ? typeAutre || undefined : undefined,
        Type_materiau: mat || undefined,
        type_materiau_autre: mat === "Autre" ? matAutre || undefined : undefined,
        Etat: etat || undefined,
        renov_year: parse(renov),
        renov_txt: desc || undefined,
      });
      setOpen(false);
    });

  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>+ Ajouter un composant</button>
      {open && (
        <Modale
          titre="Nouveau composant" onFermer={() => setOpen(false)} fermeDehors={false}
          pied={
            <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined} onClick={submit}>
              <span className="ch">›</span> Créer le composant
            </button>
          }
        >
          <span className="mlab">Type</span>
          <div className="mrow">
            {TYPES_COMPOSANT.map((t) => (
              <button key={t} type="button" className={`mopt${type === t ? " on" : ""}`} onClick={() => { setType(t); setMat(""); }}>{t}</button>
            ))}
          </div>
          {type === "Autre" && <input className="min" style={{ marginTop: 6 }} placeholder="Précisez le type" value={typeAutre} onChange={(e) => setTypeAutre(e.target.value)} />}
          <span className="mlab">Matériau</span>
          <div className="mrow">
            {mats.map((m) => (
              <button key={m} type="button" className={`mopt${mat === m ? " on" : ""}`} onClick={() => setMat(mat === m ? "" : m)}>{m}</button>
            ))}
          </div>
          {mat === "Autre" && <input className="min" style={{ marginTop: 6 }} placeholder="Précisez le matériau" value={matAutre} onChange={(e) => setMatAutre(e.target.value)} />}
          <span className="mlab">État</span>
          <div className="mrow">
            {ETATS_COMPOSANT.map((s) => (
              <button key={s} type="button" className={`mopt${etat === s ? " on" : ""}`} onClick={() => setEtat(s)}>{s}</button>
            ))}
          </div>
          <div className="mrow" style={{ marginTop: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12 }}>Année rénov. <input className="min" style={{ width: 70 }} value={renov} onChange={(e) => setRenov(e.target.value)} /></label>
            <input className="min" style={{ flex: 1 }} placeholder="Description de la rénovation" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </Modale>
      )}
    </>
  );
}

/* ---------- Travaux ---------- */

/* Une vignette par chantier, cliquable : elle ouvre la fenêtre du BO où l'on
   règle l'objet, le montant, le commentaire et le devis (#92). */
function VignetteTravaux({
  t, objet, onOuvrir, onSupprimer,
}: {
  t: Record<string, unknown>; objet: string;
  onOuvrir: () => void; onSupprimer: () => void;
}) {
  const fichiers = Array.isArray(t.FILEs) ? (t.FILEs as string[]) : [];
  return (
    <div className="tvg" role="button" tabIndex={0}
      onClick={onOuvrir}
      onKeyDown={(e) => { if (e.key === "Enter") onOuvrir(); }}>
      <span className="tvg-ic"><svg viewBox="0 0 24 24"><path d="M13 3 4 12l3.5 3.5L14 9M11 12l6 6M14 15l4 4" /></svg></span>
      <span className="tvg-c">
        <b>{S(t.description) || "Travaux sans description"}</b>
        <span className="tvg-chips">
          <span className={`tvg-chip${objet ? " on" : ""}`}>{objet || "Pas de lot"}</span>
          <span className={`tvg-chip${fichiers.length ? " on" : ""}`}>
            {fichiers.length ? `${fichiers.length} pièce${fichiers.length > 1 ? "s" : ""} jointe${fichiers.length > 1 ? "s" : ""}` : "Pas de devis"}
          </span>
        </span>
        {S(t.commentaire) && <i className="tvg-com">{S(t.commentaire)}</i>}
      </span>
      <span className="tvg-v">{euros(t.montant) ?? "n.c."}</span>
      <button
        className="chg-x" type="button" title="Supprimer les travaux"
        onClick={(e) => { e.stopPropagation(); onSupprimer(); }}
      >
        <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
      </button>
    </div>
  );
}

/** Fenêtre « travaux » du BO, la même pour créer et pour modifier. */
function ModaleTravaux({
  b, travaux, onFermer,
}: {
  b: BienData;
  /** Absent = création. */
  travaux?: Record<string, unknown>;
  onFermer: () => void;
}) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const { confirmer, question } = useQuestion();
  const id = travaux ? String(travaux._id) : "";
  const [lotIds, setLotIds] = useState<string[]>(Array.isArray(travaux?.LOTs) ? (travaux!.LOTs as string[]) : []);
  const [compIds, setCompIds] = useState<string[]>(Array.isArray(travaux?.COMPOSANTs) ? (travaux!.COMPOSANTs as string[]) : []);
  const [desc, setDesc] = useState(S(travaux?.description));
  const [montant, setMontant] = useState(S(num(travaux?.montant)));
  const [urgence, setUrgence] = useState<"Haute" | "Moyenne" | "Basse">(
    (["Haute", "Moyenne", "Basse"] as const).find((u) => u === S(travaux?.Urgence)) ?? "Moyenne",
  );
  const [devis, setDevis] = useState(travaux?.YN_devis === true);
  const [comment, setComment] = useState(S(travaux?.commentaire));
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const joints = Array.isArray(travaux?.FILEs) ? (travaux!.FILEs as string[]) : [];

  const toggle = (arr: string[], set: (v: string[]) => void, x: string) =>
    set(arr.includes(x) ? arr.filter((v) => v !== x) : [...arr, x]);

  const complet = desc.trim().length > 0 && (lotIds.length > 0 || compIds.length > 0);

  const enregistrer = () =>
    start(async () => {
      setErreur(null);
      try {
        const commun = {
          description: desc || undefined,
          commentaire: comment || undefined,
          montant: parse(montant),
          urgence,
          devis: devis || !!fichier,
        };
        const cible = travaux
          ? (await updateTravaux(immeubleId, id, {
              description: commun.description, commentaire: commun.commentaire,
              montant: commun.montant, Urgence: urgence, YN_devis: commun.devis,
              LOTs: lotIds, COMPOSANTs: compIds,
            }), id)
          : await addTravaux(immeubleId, { lotIds, composantIds: compIds, ...commun });
        if (fichier && cible) {
          const fd = new FormData();
          fd.set("file", fichier);
          await joindreDevis(immeubleId, String(cible), fd);
        }
        onFermer();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "enregistrement impossible");
      }
    });

  return (
    <>
      <Modale
        titre={travaux ? "Modifier les travaux" : "Nouveaux travaux"} onFermer={onFermer} className="sect-mod"
        pied={
          <>
            {travaux ? (
              <button type="button" className="sup-go" disabled={pending}
                onClick={async () => {
                  if (!(await confirmer("Supprimer ces travaux ? (récupérable dans la corbeille)", { danger: true, oui: "Supprimer" }))) return;
                  start(async () => { await deleteTravaux(immeubleId, id); onFermer(); });
                }}>Supprimer les travaux</button>
            ) : <span />}
            <button className="savebar-go" type="button" disabled={pending || !complet}
              title={complet ? undefined : "Une description et au moins un lot ou un composant sont attendus"}
              onClick={enregistrer}>
              {pending ? "Enregistrement…" : "❯ Enregistrer"}
            </button>
          </>
        }
      >
        <div className="fsub">Objet des travaux</div>
        <span className="mlab">Lots concernés</span>
        <div className="mrow">
          {b.lots.length === 0 && <span className="tvg-vide">Aucun lot.</span>}
          {b.lots.map((l) => (
            <button key={String(l._id)} type="button"
              className={`mopt${lotIds.includes(String(l._id)) ? " on" : ""}`}
              onClick={() => toggle(lotIds, setLotIds, String(l._id))}>{lotLabel(l)}</button>
          ))}
        </div>
        <span className="mlab">— ou composants du bâti</span>
        <div className="mrow">
          {b.composants.length === 0 && <span className="tvg-vide">Aucun composant.</span>}
          {b.composants.map((c) => (
            <button key={String(c._id)} type="button"
              className={`mopt${compIds.includes(String(c._id)) ? " on" : ""}`}
              onClick={() => toggle(compIds, setCompIds, String(c._id))}>{S(c.Type_composant)}</button>
          ))}
        </div>

        <div className="fsub" style={{ marginTop: 16 }}>Détails des travaux</div>
        <div className="mrow" style={{ alignItems: "center" }}>
          <input className={`min${desc.trim() ? "" : " requis"}`} style={{ flex: 1 }} placeholder="Description"
            value={desc} onChange={(e) => setDesc(e.target.value)} />
          <select className="min" style={{ width: 120 }} value={urgence}
            onChange={(e) => setUrgence(e.target.value as "Haute" | "Moyenne" | "Basse")}>
            {(["Haute", "Moyenne", "Basse"] as const).map((u) => <option key={u}>{u}</option>)}
          </select>
          <select className="min" style={{ width: 90 }} value={devis ? "Oui" : "Non"} onChange={(e) => setDevis(e.target.value === "Oui")}>
            <option>Non</option><option>Oui</option>
          </select>
          <input className="min" style={{ width: 110 }} placeholder="Montant €" value={montant}
            onChange={(e) => setMontant(e.target.value)} />
        </div>

        <div className="fsub" style={{ marginTop: 16 }}>Documents</div>
        {joints.map((f, i) => (
          <a key={i} className="mopt" href={proxyFichier(f)} target="_blank" rel="noreferrer">Pièce jointe {i + 1} ↗</a>
        ))}
        <label className="tvg-fic">
          <input type="file" hidden onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
          {fichier ? `📎 ${fichier.name}` : "📎 Joindre un devis"}
        </label>

        <div className="fsub" style={{ marginTop: 16 }}>Commentaire</div>
        <textarea className="min" rows={3} placeholder="Commentaire" value={comment}
          onChange={(e) => setComment(e.target.value)} />
        {erreur && <p className="carte-err" style={{ marginTop: 8 }}>{erreur}</p>}
      </Modale>
      {question}
    </>
  );
}

function TravauxTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const { confirmer, question } = useQuestion();
  const [modale, setModale] = useState<{ t?: Record<string, unknown> } | null>(null);
  const isLots = (t: Record<string, unknown>) => Array.isArray(t.LOTs) && (t.LOTs as unknown[]).length > 0;
  const totalLots = b.travaux.filter(isLots).reduce((s, t) => s + (num(t.montant) ?? 0), 0);
  const totalBati = b.travaux.filter((t) => !isLots(t)).reduce((s, t) => s + (num(t.montant) ?? 0), 0);

  const objet = (t: Record<string, unknown>) => {
    if (isLots(t)) {
      return (t.LOTs as string[])
        .map((id) => b.lots.find((l) => l._id === id))
        .filter(Boolean)
        .map((l) => `Lot ${l!.numero ?? "?"}`)
        .join(", ");
    }
    if (Array.isArray(t.COMPOSANTs)) {
      return (t.COMPOSANTs as string[])
        .map((id) => b.composants.find((c) => c._id === id))
        .filter(Boolean)
        .map((c) => S(c!.Type_composant))
        .join(", ");
    }
    return "";
  };

  const supprimer = async (t: Record<string, unknown>) => {
    if (!(await confirmer("Supprimer ces travaux ? (récupérable dans la corbeille)", { danger: true, oui: "Supprimer" }))) return;
    start(() => deleteTravaux(immeubleId, String(t._id)));
  };

  const groupe = (rows: Record<string, unknown>[]) =>
    rows.map((t) => (
      <VignetteTravaux key={String(t._id)} t={t} objet={objet(t)}
        onOuvrir={() => setModale({ t })} onSupprimer={() => supprimer(t)} />
    ));

  const sansUrgence = b.travaux.filter((t) => !URGENCES.some(([c]) => c === S(t.Urgence)));

  return (
    <div style={pending ? { opacity: 0.6 } : undefined}>
      <div className="blor">
        <div className="blor-t">
          <svg viewBox="0 0 24 24"><path d="M13 3 4 12l3.5 3.5L14 9M11 12l6 6M14 15l4 4" /></svg>
          Travaux
        </div>
        <div className="blor-chips">
          <span className={`fchip${totalLots ? "" : " off"}`}><b>{euros(totalLots) ?? "0 €"}</b> sur les lots</span>
          <span className={`fchip${totalBati ? "" : " off"}`}><b>{euros(totalBati) ?? "0 €"}</b> sur le bâti</span>
        </div>
      </div>
      <div className="blor-add">
        <button className="fadd" type="button" onClick={() => setModale({})}>+ Ajouter des travaux</button>
      </div>

      {b.travaux.length === 0 && <div className="fempty">Aucuns travaux saisis.</div>}
      {URGENCES.map(([code, label]) => {
        const rows = b.travaux.filter((t) => S(t.Urgence) === code);
        if (rows.length === 0) return null;
        return (
          <div key={code}>
            <div className="fsub" style={{ color: code === "Haute" ? "var(--red)" : undefined }}>{label}</div>
            {groupe(rows)}
          </div>
        );
      })}
      {sansUrgence.length > 0 && (
        <div>
          <div className="fsub">Sans urgence renseignée</div>
          {groupe(sansUrgence)}
        </div>
      )}

      {modale && <ModaleTravaux b={b} travaux={modale.t} onFermer={() => setModale(null)} />}
      {question}
    </div>
  );
}

export const ONGLETS_TECHNIQUE = [
  { key: "composants", label: "Composants" },
  { key: "travaux", label: "Travaux" },
] as const;

export function TechniqueTabs({ b, tab: pilote, onTab }: {
  b: BienData;
  /** Onglet piloté depuis le rail (retour #12) ; sinon état interne. */
  tab?: string;
  onTab?: (t: string) => void;
}) {
  const [interne, setInterne] = useState("composants");
  const tab = pilote ?? interne;
  const setTab = (t: string) => { setInterne(t); onTab?.(t); };
  return (
    <>
      <div className="ftabs">
        <button type="button" className={`ftab${tab === "composants" ? " on" : ""}`} onClick={() => setTab("composants")}>
          <Picto nom="composants" className="ftab-ic" />Composants{b.composants.length > 0 && <span className="n">{b.composants.length}</span>}
        </button>
        <button type="button" className={`ftab${tab === "travaux" ? " on" : ""}`} onClick={() => setTab("travaux")}>
          <Picto nom="travaux" className="ftab-ic" />Travaux{b.travaux.length > 0 && <span className="n">{b.travaux.length}</span>}
        </button>
      </div>
      {tab === "composants" && <ComposantsTab b={b} />}
      {tab === "travaux" && <TravauxTab b={b} />}
    </>
  );
}
