"use client";

/**
 * La modale d'une recherche acquéreur — création et modification
 * (retours #330, #332).
 *
 * MAV : « il faut qu'en cliquant sur une recherche on puisse la modifier avec
 * le popup qui s'ouvre » (#330) et « quand on clique sur créer une recherche
 * il faut la modale de recherche qui va créer la recherche pour le client »
 * (#332). C'est le même écran : une recherche avec un identifiant se modifie,
 * une recherche sans identifiant se crée. Deux modales auraient divergé au
 * premier champ ajouté.
 *
 * Elle porte aussi les EXCLUSIONS (#332), le seul concept vraiment neuf ici :
 * ce que l'acquéreur refuse, par opposition à ce qu'il cherche. Voir
 * lib/bo/exclusions.ts pour la raison — « il veut QUE de l'habitation, on
 * exclut le commerce ».
 *
 * Elle se termine, en création, en passant la main au panneau des biens à
 * proposer : « à la fin du processus de création on va dire s'il y a des biens
 * qui correspondent ». Le panneau vit dans components/a-proposer.tsx.
 */

import { useEffect, useState, useTransition } from "react";
import { ContactPicker } from "@/components/contact-picker";
import { DESTINATIONS } from "@/components/carte-recherche";
import { CIBLES } from "@/lib/referentiels";
import { DEPARTEMENTS, REGIONS } from "@/lib/geo-fr";
import {
  chargerExclusions, enregistrerRecherche, type SaisieRecherche,
} from "@/lib/bo/actions";

const num = (s: string) => {
  const v = parseFloat(s.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

/** Une liste de mots libres — les villes se tapent, elles ne se choisissent pas. */
function Mots({
  valeur, onChange, placeholder,
}: {
  valeur: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [saisie, setSaisie] = useState("");
  const ajouter = () => {
    const v = saisie.trim();
    if (!v) return;
    if (!valeur.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...valeur, v]);
    setSaisie("");
  };
  return (
    <div className="rm-mots">
      {valeur.map((v) => (
        <span key={v} className="rm-mot">
          {v}
          <button type="button" onClick={() => onChange(valeur.filter((x) => x !== v))}
            aria-label={`Retirer ${v}`}>✕</button>
        </span>
      ))}
      <input
        className="min" placeholder={placeholder} value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); ajouter(); } }}
        onBlur={ajouter}
      />
    </div>
  );
}

/** Une liste à cocher, pour les référentiels fermés (destinations, régions). */
function Cases({
  options, valeur, onChange,
}: {
  options: string[];
  valeur: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="rm-cases">
      {options.map((o) => {
        const on = valeur.includes(o);
        return (
          <button key={o} type="button" className={`mopt${on ? " on" : ""}`}
            aria-pressed={on}
            onClick={() => onChange(on ? valeur.filter((x) => x !== o) : [...valeur, o])}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export type RetourModale = { id: string; creation: boolean };

/**
 * Ce dont la modale a besoin pour se préremplir — rien de plus.
 *
 * Une `RechercheCard` de l'écran Recherches satisfait ce type. L'écran
 * Acheteurs, lui, n'a que la ligne brute du miroir : il compose ce petit objet
 * plutôt que de rappeler le serveur pour reconstruire une carte complète, dont
 * il n'utiliserait que sept champs (#347).
 */
export type DepartRecherche = {
  id: string;
  destinations: string[];
  lieux: string[];
  commentaire?: string;
  contact?: { id: string; nom: string };
  brut: {
    cible?: string;
    prixMin?: number; prixMax?: number;
    surfaceMin?: number; surfaceMax?: number;
    occupMin?: number; occupMax?: number;
    renta?: number;
  };
};

export function ModaleRechercheEdition({
  depart, contactImpose, agentId, onFermer, onEnregistre,
}: {
  /** La recherche à modifier (#330) ; absente, on en crée une (#332). */
  depart?: DepartRecherche;
  /** Sur une fiche contact, l'acquéreur est déjà connu. */
  contactImpose?: { id: string; nom: string };
  agentId?: string;
  onFermer: () => void;
  onEnregistre: (r: RetourModale) => void;
}) {
  const creation = !depart;
  const [pending, start] = useTransition();
  const [picker, setPicker] = useState(false);
  const [contact, setContact] = useState<{ id: string; nom: string } | undefined>(
    contactImpose ?? (depart?.contact ? { id: depart.contact.id, nom: depart.contact.nom } : undefined),
  );

  /* La carte affiche « Investissement locatif » ; la base attend
     « Investisseur ». On repart donc de la valeur brute (#330). */
  const [cible, setCible] = useState(depart?.brut.cible ?? "");
  const [destinations, setDestinations] = useState<string[]>(depart?.destinations ?? []);
  /* La carte mélange villes et départements dans `lieux` ; on les resépare sur
     la forme du code — c'est ce que fait déjà le serveur pour les afficher. */
  const lieux = depart?.lieux.filter((l) => l !== "France entière") ?? [];
  const [villes, setVilles] = useState<string[]>(lieux.filter((l) => !/^\d{2,3}[AB]?$/.test(l)));
  const [dpts, setDpts] = useState<string[]>(lieux.filter((l) => /^\d{2,3}[AB]?$/.test(l)));

  /* Les fourchettes se remplissent avec les valeurs en base : une modale de
     modification qui présente des cases vides oblige à tout retaper, et la
     moindre distraction efface un critère (#330). */
  const dep = (v?: number) => (v === undefined ? "" : String(v));
  const [prixMin, setPrixMin] = useState(dep(depart?.brut.prixMin));
  const [prixMax, setPrixMax] = useState(dep(depart?.brut.prixMax));
  const [surfMin, setSurfMin] = useState(dep(depart?.brut.surfaceMin));
  const [surfMax, setSurfMax] = useState(dep(depart?.brut.surfaceMax));
  const [occMin, setOccMin] = useState(dep(depart?.brut.occupMin));
  const [occMax, setOccMax] = useState(dep(depart?.brut.occupMax));
  const [renta, setRenta] = useState(dep(depart?.brut.renta));
  const [commentaire, setCommentaire] = useState(depart?.commentaire ?? "");

  const [exDest, setExDest] = useState<string[]>([]);
  const [exVilles, setExVilles] = useState<string[]>([]);
  const [exDpts, setExDpts] = useState<string[]>([]);
  const [exRegions, setExRegions] = useState<string[]>([]);
  const [voirExclusions, setVoirExclusions] = useState(false);

  /* Les exclusions ne sont pas sur la carte : elles vivent dans une table à
     part et se chargent à l'ouverture. */
  useEffect(() => {
    if (!depart) return;
    let vivant = true;
    chargerExclusions(depart.id).then((e) => {
      if (!vivant) return;
      setExDest(e.destinations);
      setExVilles(e.villes);
      setExDpts(e.departements);
      setExRegions(e.regions);
      if (e.destinations.length || e.villes.length || e.departements.length || e.regions.length) {
        setVoirExclusions(true);
      }
    });
    return () => { vivant = false; };
  }, [depart]);

  const enregistrer = () =>
    start(async () => {
      const saisie: SaisieRecherche = {
        id: depart?.id,
        contactId: contact?.id,
        cible: cible || undefined,
        destinations,
        villes,
        departements: dpts,
        prixMin: num(prixMin), prixMax: num(prixMax),
        surfaceMin: num(surfMin), surfaceMax: num(surfMax),
        occupMin: num(occMin), occupMax: num(occMax),
        renta: num(renta),
        commentaire,
        exclusions: {
          destinations: exDest, villes: exVilles,
          departements: exDpts, regions: exRegions,
        },
      };
      const id = await enregistrerRecherche(saisie, agentId);
      onEnregistre({ id, creation });
    });

  const nbExclusions = exDest.length + exVilles.length + exDpts.length + exRegions.length;

  return (
    <div className="modal-ov">
      <div className="modal lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          {creation ? "Nouvelle recherche" : "Modifier la recherche"}
          <button type="button" onClick={onFermer}>✕</button>
        </div>

        <div className="modal-b">
          <span className="mlab">Acquéreur</span>
          <div className="mrow" style={{ alignItems: "center" }}>
            <b style={{ fontSize: 13 }}>{contact?.nom ?? "Aucun contact rattaché"}</b>
            {!contactImpose && (
              <button type="button" className="fadd" onClick={() => setPicker(true)}>
                {contact ? "Changer" : "Rattacher un contact"}
              </button>
            )}
          </div>
          {!contact && (
            <p className="rm-avert">
              Une recherche sans contact ne peut recevoir ni e-mail ni proposition :
              rattachez l&apos;acquéreur avant de l&apos;enregistrer.
            </p>
          )}

          <span className="mlab">Type d&apos;opération</span>
          <select className="min" value={cible} onChange={(e) => setCible(e.target.value)}>
            <option value="">Non précisé</option>
            {CIBLES.map((c) => <option key={c}>{c}</option>)}
          </select>

          <span className="mlab">Destinations recherchées</span>
          <Cases options={DESTINATIONS.map((d) => d.cle)} valeur={destinations} onChange={setDestinations} />

          <span className="mlab">Secteur — villes</span>
          <Mots valeur={villes} onChange={setVilles} placeholder="Ajouter une ville puis Entrée…" />
          <span className="mlab">Secteur — départements</span>
          <Mots valeur={dpts} onChange={setDpts} placeholder="59, 75, 2A…" />
          <p className="rm-aide">
            Rien ici veut dire <b>France entière</b> : c&apos;est une recherche sans exigence
            de secteur, pas une recherche sans résultat.
          </p>

          <span className="mlab">Critères</span>
          <div className="rm-grille">
            <label>Budget de <input className="min" value={prixMin} onChange={(e) => setPrixMin(e.target.value)} placeholder="€" /></label>
            <label>à <input className="min" value={prixMax} onChange={(e) => setPrixMax(e.target.value)} placeholder="€" /></label>
            <label>Surface de <input className="min" value={surfMin} onChange={(e) => setSurfMin(e.target.value)} placeholder="m²" /></label>
            <label>à <input className="min" value={surfMax} onChange={(e) => setSurfMax(e.target.value)} placeholder="m²" /></label>
            <label>Occupation de <input className="min" value={occMin} onChange={(e) => setOccMin(e.target.value)} placeholder="%" /></label>
            <label>à <input className="min" value={occMax} onChange={(e) => setOccMax(e.target.value)} placeholder="%" /></label>
            <label>Rendement ≥ <input className="min" value={renta} onChange={(e) => setRenta(e.target.value)} placeholder="%" /></label>
          </div>
          <p className="rm-aide">
            Une case laissée vide veut dire <b>pas d&apos;exigence</b> — pas « zéro » :
            l&apos;immeuble passe le critère quoi qu&apos;il vaille.
          </p>

          {/* Retour #332 — les exclusions. Repliées par défaut : elles ne
              servent qu'à une recherche sur dix, mais quand elles servent,
              elles sont la seule façon d'obtenir le bon résultat. */}
          <button type="button" className="mt-regles-b" onClick={() => setVoirExclusions(!voirExclusions)}>
            {voirExclusions ? "Masquer" : "Ajouter"} des exclusions
            {nbExclusions > 0 && <b className="rm-cpt">{nbExclusions}</b>}
            <span className="ch">{voirExclusions ? "▾" : "▸"}</span>
          </button>
          {voirExclusions && (
            <div className="rm-excl">
              <p className="rm-aide">
                Ce que cette recherche <b>refuse</b>, quoi qu&apos;elle demande par ailleurs.
                Cocher « Logement » ci-dessus laisse passer les immeubles mixtes — c&apos;est
                voulu. Exclure « Commerce » ici les écarte.
              </p>
              <span className="mlab">Destinations exclues</span>
              <Cases options={DESTINATIONS.map((d) => d.cle)} valeur={exDest} onChange={setExDest} />
              <span className="mlab">Régions exclues</span>
              <Cases options={REGIONS} valeur={exRegions} onChange={setExRegions} />
              <span className="mlab">Départements exclus</span>
              <Mots valeur={exDpts} onChange={setExDpts} placeholder="62, 93…" />
              <span className="mlab">Villes exclues</span>
              <Mots valeur={exVilles} onChange={setExVilles} placeholder="Ajouter une ville puis Entrée…" />
              <datalist id="rm-dpts">
                {DEPARTEMENTS.map((d) => <option key={d.code} value={d.code}>{d.nom}</option>)}
              </datalist>
            </div>
          )}

          <span className="mlab">Commentaire</span>
          <textarea className="min" rows={3} value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Ce que l'acquéreur a dit et qu'aucune case ne dit…" />
        </div>

        <div className="modal-f">
          <span style={{ flex: 1 }} />
          <button className="fadd" type="button" onClick={onFermer}>Annuler</button>
          <button className="kgo" type="button" disabled={pending} onClick={enregistrer}>
            <span className="ch">›</span>{" "}
            {pending ? "Enregistrement…" : creation ? "Créer la recherche" : "Enregistrer"}
          </button>
        </div>
      </div>

      {picker && (
        <ContactPicker
          titre="Rattacher un acquéreur"
          libelleValider="Rattacher"
          valeurActuelle={contact?.nom}
          onAnnuler={() => setPicker(false)}
          onValider={(c) => { setContact({ id: c.id, nom: c.nom }); setPicker(false); }}
        />
      )}
    </div>
  );
}
