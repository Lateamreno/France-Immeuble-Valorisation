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
import { DEPARTEMENTS, REGIONS, departementsDe } from "@/lib/geo-fr";
import {
  chargerExclusions, enregistrerRecherche, type SaisieRecherche,
} from "@/lib/bo/actions";

const num = (s: string) => {
  const v = parseFloat(s.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

/* Les pictos des sections (#341 : « ajoute de la structure, des pictos et de
   la couleur »). Dessinés au trait, comme le reste du rail : une modale n'a pas
   à introduire un deuxième vocabulaire graphique. */
const IC = {
  cible: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
  geo: <><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>,
  euro: <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 9.2a4.4 4.4 0 0 0-6.6 1.2M15.5 14.8a4.4 4.4 0 0 1-6.6-1.2M7.6 11h5M7.6 13.4h5" /></>,
  note: <><path d="M5 4h11l3 3v13H5z" /><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4" /></>,
  interdit: <><circle cx="12" cy="12" r="8.5" /><path d="M6.4 6.4 17.6 17.6" /></>,
};

/** L'en-tête d'une section de la modale : un picto, un titre, un filet. */
function Section({ titre, ic }: { titre: string; ic: React.ReactNode }) {
  return (
    <div className="rmod-sect">
      <span className="rmod-ic"><svg viewBox="0 0 24 24">{ic}</svg></span>
      {titre}
    </div>
  );
}

/** Les initiales d'un nom, pour la vignette du client. */
function initiales(nom: string) {
  return nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Une coordonnée du client, avec son bouton de copie (#342).
 *
 * L'écriture dans le presse-papiers peut être refusée : on ne dit « copié »
 * qu'une fois la promesse tenue, et un échec se dit plutôt que de passer pour
 * un succès.
 */
function Copiable({ valeur, vide }: { valeur?: string; vide: string }) {
  const [etat, setEtat] = useState<"" | "ok" | "ko">("");
  if (!valeur) return <span className="off">{vide}</span>;
  return (
    <span className="rmod-co">
      {valeur}
      <button type="button" title={etat === "ok" ? "Copié" : etat === "ko" ? "Copie refusée" : `Copier ${valeur}`}
        onClick={() => {
          navigator.clipboard.writeText(valeur).then(() => setEtat("ok")).catch(() => setEtat("ko"));
        }}>{etat === "ok" ? "✓" : etat === "ko" ? "!" : "⧉"}</button>
    </span>
  );
}


/**
 * Un choix multiple à liste déroulante, avec prédiction (#341).
 *
 * MAV : « une liste déroulante choix multiples […] si on peut taper les régions
 * et départements et qu'ils nous font la prédiction de la suite, c'est top ».
 *
 * Trois raisons de préférer ça aux cases à cocher qu'il y avait :
 *   • dix-huit régions et cent un départements en cases, c'est un mur qui
 *     occupe l'écran entier — la modale ne tenait plus à 100 % de zoom ;
 *   • un département se tape au code (« 93 ») bien plus vite qu'il ne se
 *     cherche dans une grille ;
 *   • la prédiction porte sur le CODE ET SUR LE NOM : celui qui tape
 *     « seine-saint » trouve le 93 sans le connaître par cœur.
 *
 * Ce qui est retenu reste affiché en étiquettes AU-DESSUS du champ : une
 * sélection qu'il faut rouvrir un menu pour relire n'existe pas.
 */
function ChoixMultiple({
  options, valeur, onChange, placeholder, libre,
}: {
  /** Le référentiel : `cle` est ce qu'on enregistre, `nom` ce qu'on lit. */
  options: { cle: string; nom: string }[];
  valeur: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  /** Autorise une valeur hors référentiel (les villes, qui n'ont pas de liste). */
  libre?: boolean;
}) {
  const [saisie, setSaisie] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const q = saisie.trim().toLowerCase();
  const propositions = options
    .filter((o) => !valeur.includes(o.cle))
    .filter((o) => !q || o.cle.toLowerCase().startsWith(q) || o.nom.toLowerCase().includes(q))
    .slice(0, 8);
  const nomDe = (c: string) => options.find((o) => o.cle === c)?.nom ?? c;

  const retenir = (cle: string) => {
    if (!valeur.includes(cle)) onChange([...valeur, cle]);
    setSaisie("");
    setOuvert(false);
  };
  /* Entrée valide la première proposition — c'est ce qu'on attend d'une
     prédiction. En saisie libre, à défaut de proposition, on prend le texte. */
  const valider = () => {
    if (propositions[0]) return retenir(propositions[0].cle);
    const v = saisie.trim();
    if (libre && v && !valeur.some((x) => x.toLowerCase() === v.toLowerCase())) retenir(v);
  };

  return (
    <div className="rmx">
      {valeur.length > 0 && (
        <div className="rmx-tags">
          {valeur.map((v) => (
            <span key={v} className="rm-mot" title={nomDe(v)}>
              {v === nomDe(v) ? v : `${v} — ${nomDe(v)}`}
              <button type="button" onClick={() => onChange(valeur.filter((x) => x !== v))}
                aria-label={`Retirer ${nomDe(v)}`}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="rmx-champ">
        <input
          className="min" placeholder={placeholder} value={saisie}
          onChange={(e) => { setSaisie(e.target.value); setOuvert(true); }}
          onFocus={() => setOuvert(true)}
          /* Le flou est différé : sans ça, le clic sur une proposition
             refermerait la liste avant que le clic n'aboutisse. */
          onBlur={() => setTimeout(() => setOuvert(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); valider(); }
            if (e.key === "Escape") setOuvert(false);
          }}
        />
        {ouvert && propositions.length > 0 && (
          <div className="rmx-liste">
            {propositions.map((o) => (
              <button key={o.cle} type="button" className="rmx-o"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => retenir(o.cle)}>
                {o.cle !== o.nom && <b>{o.cle}</b>}
                {o.nom}
              </button>
            ))}
          </div>
        )}
      </div>
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
  /* Les coordonnées vivent sur le contact — c'est déjà là que la carte de
     l'écran Recherches les range, donc une `RechercheCard` satisfait ce type
     sans rien ajouter. */
  contact?: { id: string; nom: string; tel?: string; email?: string };
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
  const [dpts, setDpts] = useState<string[]>(lieux.filter((l) => /^\d{2,3}[AB]?$/.test(l)));
  /* Les régions étaient absentes des critères positifs : seules les
     exclusions en avaient. Le secteur se saisit maintenant aux trois échelles
     (#341). Une entrée qui porte un nom de région est reconnue comme telle. */
  const [regions, setRegions] = useState<string[]>(
    lieux.filter((l) => (REGIONS as readonly string[]).includes(l)),
  );
  const [villes, setVilles] = useState<string[]>(
    lieux.filter((l) => !/^\d{2,3}[AB]?$/.test(l) && !(REGIONS as readonly string[]).includes(l)),
  );

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
        /* Une région retenue s'enregistre en DÉPARTEMENTS : le miroir Bubble
           n'a pas de champ région sur une recherche, et le moteur de matching
           raisonne au département. Créer une notion que rien ne sait comparer
           ensuite reviendrait à afficher un critère qui ne filtre rien. */
        departements: [...new Set([...dpts, ...regions.flatMap(departementsDe)])],
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

  const DEST_OPT = DESTINATIONS.map((d) => ({ cle: d.cle, nom: d.cle }));
  const DPT_OPT = DEPARTEMENTS.map((d) => ({ cle: d.code, nom: d.nom }));
  const REG_OPT = REGIONS.map((r) => ({ cle: r, nom: r }));

  return (
    <div className="modal-ov">
      {/* Retour #341 — « fais la modale un peu moins grande, je veux voir la
          totalité des infos à l'intérieur quand je suis en 100 % de zoom ».
          Le corps passe sur DEUX COLONNES : ce qui était une colonne de
          quatorze champs empilés tient maintenant en une hauteur d'écran. */}
      <div className="modal rmod" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          {creation ? "Nouvelle recherche" : "Modifier la recherche"}
          <button type="button" onClick={onFermer}>✕</button>
        </div>

        <div className="modal-b rmod-b">
          {/* --- La carte du client, comme sur le BO (#341) --------------- */}
          <div className="rmod-cli">
            {contact ? (
              <>
                <span className="rmod-av">{initiales(contact.nom)}</span>
                <div className="rmod-cli-c">
                  <a className="rmod-cli-n" href={`/contact/${contact.id}`} target="_blank" rel="noreferrer">
                    {contact.nom} ↗
                  </a>
                  <div className="rmod-cli-co">
                    <Copiable valeur={depart?.contact?.tel} vide="pas de téléphone" />
                    <Copiable valeur={depart?.contact?.email} vide="pas d'e-mail" />
                  </div>
                </div>
              </>
            ) : (
              <div className="rmod-cli-c">
                <b className="rmod-cli-n">Aucun contact rattaché</b>
                <span className="rm-avert">
                  Une recherche sans contact ne peut recevoir ni e-mail ni proposition.
                </span>
              </div>
            )}
            {!contactImpose && (
              <button type="button" className="fadd" onClick={() => setPicker(true)}>
                {contact ? "Changer" : "Rattacher"}
              </button>
            )}
          </div>

          <div className="rmod-cols">
            {/* --- Colonne de gauche : ce qu'il cherche ------------------- */}
            <div className="rmod-col">
              <Section titre="Ce qu'il cherche" ic={IC.cible} />
              <span className="mlab">Type d&apos;opération</span>
              <select className="min" value={cible} onChange={(e) => setCible(e.target.value)}>
                <option value="">Non précisé</option>
                {CIBLES.map((c) => <option key={c}>{c}</option>)}
              </select>

              <span className="mlab">Destinations recherchées</span>
              <ChoixMultiple options={DEST_OPT} valeur={destinations} onChange={setDestinations}
                placeholder="Logement, Commerce, Bureau…" />

              <Section titre="Secteur" ic={IC.geo} />
              <span className="mlab">Régions</span>
              <ChoixMultiple options={REG_OPT} valeur={regions} onChange={setRegions}
                placeholder="Île-de-France, Hauts-de-France…" />
              {regions.length > 0 && (
                <p className="rm-aide">
                  À l&apos;enregistrement, une région devient ses{" "}
                  <b>{new Set(regions.flatMap(departementsDe)).size} départements</b> — c&apos;est
                  ce que la base et le matching savent comparer. Vous les retrouverez donc
                  listés ci-dessous en rouvrant la recherche.
                </p>
              )}
              <span className="mlab">Départements</span>
              <ChoixMultiple options={DPT_OPT} valeur={dpts} onChange={setDpts}
                placeholder="93, seine-saint, 2A…" />
              <span className="mlab">Villes</span>
              <ChoixMultiple options={[]} valeur={villes} onChange={setVilles} libre
                placeholder="Taper une ville puis Entrée…" />
              <p className="rm-aide">
                Rien ici veut dire <b>France entière</b> : c&apos;est une recherche sans exigence
                de secteur, pas une recherche sans résultat.
              </p>
            </div>

            {/* --- Colonne de droite : à quelles conditions --------------- */}
            <div className="rmod-col">
              <Section titre="À quelles conditions" ic={IC.euro} />
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
                  elles sont la seule façon d'obtenir le bon résultat. Elles
                  prennent les mêmes listes déroulantes que les critères
                  positifs (#341) : le même geste des deux côtés. */}
              <button type="button" className="rmod-excl-b" onClick={() => setVoirExclusions(!voirExclusions)}>
                <span className="rmod-ic rouge"><svg viewBox="0 0 24 24">{IC.interdit}</svg></span>
                {voirExclusions ? "Masquer" : "Ajouter"} des exclusions
                {nbExclusions > 0 && <b className="rm-cpt">{nbExclusions}</b>}
                <span className="ch">{voirExclusions ? "▾" : "▸"}</span>
              </button>
              {voirExclusions && (
                <div className="rm-excl">
                  <p className="rm-aide">
                    Ce que cette recherche <b>refuse</b>, quoi qu&apos;elle demande par ailleurs.
                    Cocher « Logement » à gauche laisse passer les immeubles mixtes — c&apos;est
                    voulu. Exclure « Commerce » ici les écarte.
                  </p>
                  <span className="mlab">Destinations exclues</span>
                  <ChoixMultiple options={DEST_OPT} valeur={exDest} onChange={setExDest}
                    placeholder="Commerce, Bureau…" />
                  <span className="mlab">Régions exclues</span>
                  <ChoixMultiple options={REG_OPT} valeur={exRegions} onChange={setExRegions}
                    placeholder="Une région à écarter…" />
                  <span className="mlab">Départements exclus</span>
                  <ChoixMultiple options={DPT_OPT} valeur={exDpts} onChange={setExDpts}
                    placeholder="62, pas-de-calais…" />
                  <span className="mlab">Villes exclues</span>
                  <ChoixMultiple options={[]} valeur={exVilles} onChange={setExVilles} libre
                    placeholder="Taper une ville puis Entrée…" />
                </div>
              )}

              <Section titre="Ce qu'aucune case ne dit" ic={IC.note} />
              <textarea className="min" rows={4} value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Ce que l'acquéreur a dit et qu'aucune case ne dit…" />
            </div>
          </div>
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
