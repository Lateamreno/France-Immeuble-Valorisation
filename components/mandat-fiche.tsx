"use client";

// Écran mandat — cinq onglets, pleine largeur, dans la fiche immeuble.
//
// Ce n'est plus une modale (retour #100) : le rail de droite reste là, on peut
// aller vérifier l'état locatif ou les photos et revenir sans rien perdre.
// L'écran est monté par la page /bien/[id]/mandat/[mid], exactement comme
// l'estimation en cours.
//
// Les cinq onglets suivent la chaîne réelle : QUI signe (Mandants) → QUOI se
// vend (Objet, servi par l'état locatif) → À COMBIEN (Prix) → À QUELLES
// CONDITIONS (Conditions) → et enfin ON ENVOIE (Envoi), verrouillé tant que
// les pièces obligatoires manquent.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { getMandat } from "@/lib/bubble/server";
import { dmy, euros, group } from "@/lib/format";
import { baremeTexte, plafondTaux, type Tranche } from "@/lib/bareme";
import { IRREVOC_DEFAUT, regimeDe } from "@/lib/bo/mandat-doc";
import { CHARGES_HONOS, TYPES_EXCLU } from "@/lib/referentiels";
import { BarreEnregistrer } from "@/components/barre-enregistrer";
import { ContactPicker } from "@/components/contact-picker";
import { VignetteContact, type VignetteData } from "@/components/vignette-contact";
import {
  FONCTIONS_MANDANT, descriptifLegal, lireMandants, manques, mandantVide, modeVente,
  nomMandant, piecesMandant, publicationWeb, regimeHonoraires, resoudrePrix, synthese, verrou,
  venteDirecteLocataire, REMISE_LOCATAIRE,
  type ChampPrix, type Mandant, type Mode, type Prix, type Societe,
} from "@/lib/mandat";
import { AdresseInput } from "@/components/adresse-input";
import {
  proprietairesPm, type ProprietairePM, type ResultatProprietaires,
} from "@/lib/bo/proprio-actions";
import {
  cancelMandat, capitalDuSiren, chercherEntreprise, deposerPieceMandat, envoyerMandatSignature, genererMandat,
  majMandants, mandantDepuisContact, mandatInfosRecues, marquerMandatSigne, reporterCadastre,
  reserveMandatNumero,
  updateMandat, type EntrepriseTrouvee, type MandatPatch,
} from "@/lib/bo/actions";

type Data = NonNullable<Awaited<ReturnType<typeof getMandat>>>;

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => {
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
const dateInput = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : "");

const TABS = ["Mandants", "Objet", "Prix", "Conditions", "Envoi"] as const;
type Tab = (typeof TABS)[number];

/* Un picto par onglet (retour #206 : « des pictos à chaque titre »). Mêmes
   dessins que le rail de la fiche, pour que l'œil retrouve ses repères. */
const IC_TAB: Record<Tab, React.ReactNode> = {
  Mandants: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></>,
  Objet: <><path d="M5 2h11v19h3v2H4v-2h1z" /><path d="M8 6h2M8 10h2M8 14h2M12 6h1M12 10h1M12 14h1" /></>,
  Prix: <><path d="M15 6H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H8" /><path d="M12 3v18" /></>,
  Conditions: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 7l2.6 1.5M17.2 15.5 19.8 17M4.2 17l2.6-1.5M17.2 8.5 19.8 7" /></>,
  Envoi: <><path d="m3 11 18-7-7 18-2.5-7.5z" /><path d="m11.5 14.5 3-6" /></>,
};

/** Initiales d'un agent, comme les pastilles du BO : « Marc-Antoine VOCI » → MAV. */
const initiales = (nom?: string | null) =>
  (nom ?? "")
    .split(/[\s-]+/).filter(Boolean)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("").slice(0, 3);

/**
 * La durée à afficher à côté du type, en jours.
 *
 * L'exclusif tient son exclusivité sur toute la durée du mandat ; le
 * semi-exclusif porte la sienne dans `durée_exclu_jours`. Le simple n'en a
 * aucune — et n'affiche donc rien plutôt qu'un « (0 j) » trompeur.
 */
const dureeExclu = (m: Record<string, unknown>) => {
  const regime = regimeDe(m);
  if (regime === "simple") return 0;
  if (regime === "exclusif") return Math.round((num(m["durée_tot_month"]) ?? 12) * 30);
  return num(m["durée_exclu_jours"]) ?? 90;
};

export function MandatFiche({ d, bareme }: { d: Data; bareme?: Tranche[] }) {
  const { m, im, lots, agent, vignettes } = d;
  const mandatId = String(m._id);
  const immeubleId = im ? String(im._id) : "";
  const [tab, setTab] = useState<Tab>("Mandants");
  /* Retour #229 : « quand j'enregistre, passe pas direct au menu suivant. »
     L'enchaînement automatique venait du #197 — la chaîne des onglets étant le
     déroulé du dossier, on gagnait un clic. À l'usage il dépossède : on
     enregistre souvent pour vérifier ce qu'on vient de saisir, pas pour
     partir. Changer d'onglet redevient un geste de l'agent. */
  const [pending, start] = useTransition();

  const statut = S(m.Statut);
  const numero = S(m.numero);
  /** Le propriétaire de la fiche — mandant par défaut de tout le mandat. */
  const proprietaireId = S(im?.PROPRIETAIRE) || undefined;
  const motifVerrou = verrou(m);
  const locked = motifVerrou !== null;
  /* Retour #211 : l'envoi à la signature annonçait « aucune adresse e-mail sur
     les mandants » alors que la fiche du contact rattaché en portait une. Un
     mandat créé depuis le propriétaire du bien n'a jamais recopié l'adresse —
     seul le rattachement manuel d'un contact le faisait. On la reprend donc de
     la fiche à la lecture : c'est elle qui fait foi, et l'écran cesse de
     réclamer ce qu'il a déjà sous la main. */
  const mandants = useMemo(
    () => lireMandants(m).map((x) => (
      x.email || !x.contactId ? x : { ...x, email: vignettes[x.contactId]?.email || undefined }
    )),
    [m, vignettes],
  );
  const trous = useMemo(
    () => manques(m, mandants, im, d.parcelles),
    [m, mandants, im, d.parcelles],
  );
  const trousPar = (t: Tab) => trous.filter((x) => x.onglet === t).length;

  const act = (fn: () => Promise<unknown>) => start(async () => { await fn(); });

  return (
    <div className="mdt">
      {/* --- Cartouche, repris du BO (retour #205) ---------------------------
          MAV, capture à l'appui : « le cartouche qui va de part en part avec le
          séparateur qui touche les deux sidebars, une première partie avec un
          picto mandat et les initiales de l'agent, une deuxième section avec le
          type de mandat et la durée de l'exclusivité, le badge attente d'infos
          si tout n'est pas rempli, la petite vignette sur le nom du client. »

          Le badge dit l'état réel du dossier et non le statut déclaré : tant
          qu'il manque une pièce ou une donnée de rédaction, « Attente infos » ;
          quand tout est là, « Infos obtenues ». C'est la même liste de manques
          qui alimente les onglets, donc les deux ne peuvent pas se contredire. */}
      <div className="mdt-head">
        {/* Les initiales et la couleur viennent de la table des agents : ce sont
            celles du BO, pas une reconstitution à partir du nom. */}
        <div className="mdt-agent" title={agent?.name ?? "Agent"}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="currentColor" stroke="none" />
            <path d="M14 3v4h4" fill="#fff" stroke="none" />
          </svg>
          <b style={agent?.color ? { background: agent.color } : undefined}>
            {agent?.initials || initiales(agent?.name) || "FI"}
          </b>
        </div>

        <div className="mdt-id">
          <span className="t">
            {S(m.Type) || "Vente"} {S(m.Type_exclu)}
            {dureeExclu(m) ? ` (${dureeExclu(m)} j)` : ""}
          </span>
          <span className={numero ? "n on" : "n"}>{numero ? `# ${numero}` : "Pas de numéro"}</span>
          {euros(m.honos_ttc) && <span className="h">◈ {euros(m.honos_ttc)}</span>}
        </div>

        <div className="mdt-meta">
          <span className={`badge-${trous.length === 0 ? "g" : ["Annulé", "Expiré"].includes(statut) ? "r" : "o"}`}>
            {["Annulé", "Expiré", "Vendu"].includes(statut)
              ? statut
              : trous.length === 0 ? "Infos obtenues" : "Attente infos"}
          </span>
          <span className="dts">{dmy(m.date_effet) ?? "…"} → {dmy(m.date_fin) ?? "…"}</span>
        </div>

        {/* Les deux lignes du BO : qui signe, et sur quoi. */}
        <div className="mdt-liens">
          {mandants.length > 0 && (
            <span className="mdt-l">
              <i>Mandant{mandants.length > 1 ? "s" : ""}</i>
              {/* À défaut de contact propre à la ligne, celui de la fiche :
                  c'est lui le mandant, par construction (retour #205). */}
              {mandants.map((x) => (
                <VignetteContact key={x.uid}
                  v={vignettes[x.contactId ?? proprietaireId ?? ""]}
                  nom={nomMandant(x)} />
              ))}
            </span>
          )}
          {im && (
            <span className="mdt-l">
              <i>Objet du mandat</i>
              <Link className="mdt-obj" href={`/bien/${immeubleId}`}>
                <svg viewBox="0 0 24 24" aria-hidden><path d="M5 2h11v19h3v2H4v-2h1z" /></svg>
                <b>{S(im.adresse_ville)}</b>
                <span>{[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}</span>
              </Link>
            </span>
          )}
        </div>

        <div className="mdt-act">
          {!numero && <ReserveBtn mandatId={mandatId} immeubleId={immeubleId} />}
          {statut === "Attente infos" && (
            <button className="mdt-go" type="button" disabled={pending || trous.length > 0}
              title={trous.length > 0
                ? `Il manque encore ${trous.length} information${trous.length > 1 ? "s" : ""} — voyez les onglets marqués ⚠`
                : undefined}
              onClick={() => act(() => mandatInfosRecues(mandatId, immeubleId))}>
              <span className="ch">›</span> Infos mandat reçues
            </button>
          )}
          {!["Annulé", "Vendu"].includes(statut) && <CancelBtn mandatId={mandatId} immeubleId={immeubleId} />}
        </div>
      </div>

      {motifVerrou && (
        <div className="mdt-lock">
          {motifVerrou}
          {S(m.pdf_signed) && <a href={S(m.pdf_signed)} target="_blank" rel="noreferrer">Ouvrir l&apos;exemplaire signé</a>}
        </div>
      )}
      {numero && !locked && (
        <div className="mdt-note">
          Numéro <b>{numero}</b> inscrit au registre — il ne peut plus être modifié, ni le mandat supprimé.
        </div>
      )}

      {/* Retour #206 — « pour la progression dans le mandat, tu le mets sur
          toute la largeur entre les deux sidebars, en responsive, avec des
          pictos à chaque titre et une notification quand il manque quelque
          chose à droite du titre ». Le compte de manques est celui des onglets
          eux-mêmes : la pastille dit combien, pas seulement qu'il en reste. */}
      <div className="mdt-tabs bord-a-bord">
        {TABS.map((t) => {
          const n = trousPar(t);
          const bloque = t === "Envoi" && trous.length > 0;
          return (
            <button
              key={t} type="button"
              className={`mdt-tab${tab === t ? " on" : ""}${n > 0 ? " ko" : ""}`}
              onClick={() => setTab(t)}
            >
              <span className="pic"><svg viewBox="0 0 24 24">{IC_TAB[t]}</svg></span>
              <span className="lb">{t}</span>
              {bloque
                ? <span className="lk" title={`${trous.length} information${trous.length > 1 ? "s" : ""} manquante${trous.length > 1 ? "s" : ""}`}>🔒</span>
                : n > 0
                  ? <span className="nb" title={`${n} information${n > 1 ? "s" : ""} à compléter`}>{n}</span>
                  : <span className="okv">✓</span>}
            </button>
          );
        })}
      </div>

      <div className="mdt-body">
        {tab === "Mandants" && (
          <OngletMandants
            mandatId={mandatId} immeubleId={immeubleId} mandants={mandants} locked={locked}
            adresseImmeuble={im
              ? [S(im.adresse_numero_rue), S(im.adresse_rue), S(im.adresse_zipcode), S(im.adresse_ville)]
                .filter(Boolean).join(" ")
              : undefined}
            vignettes={vignettes} proprietaireId={proprietaireId}
          />
        )}
        {tab === "Objet" && (
          <OngletObjet m={m} im={im} lots={lots} parcelles={d.parcelles}
            mandatId={mandatId} immeubleId={immeubleId} locked={locked} />
        )}
        {tab === "Prix" && (
          <OngletPrix m={m} lots={lots} mandatId={mandatId} immeubleId={immeubleId} locked={locked}
            bareme={bareme} />
        )}
        {tab === "Conditions" && (
          <OngletConditions m={m} mandatId={mandatId} immeubleId={immeubleId} locked={locked} />
        )}
        {tab === "Envoi" && (
          <OngletEnvoi m={m} mandants={mandants} trous={trous} agent={agent}
            mandatId={mandatId} immeubleId={immeubleId} onAller={setTab} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Barre bas */

/**
 * Suit ce qui a changé depuis le dernier enregistrement (retours #192/#196).
 *
 * Chaque onglet lui donne l'empreinte de sa saisie. Tant qu'elle correspond à
 * celle qui est en base, le bouton reste gris ; dès qu'elle en diffère il
 * passe au vert, et il y retourne une fois l'enregistrement passé.
 */
function useModifie(empreinte: string) {
  const enregistre = useRef(empreinte);
  // Un rechargement de la fiche (revalidation) rebat la référence.
  const [, forcer] = useState(0);
  const valider = () => { enregistre.current = empreinte; forcer((n) => n + 1); };
  return { modifie: empreinte !== enregistre.current, valider };
}

/* ------------------------------------------------- Onglet 1 · Mandants */

function OngletMandants({
  mandatId, immeubleId, mandants: init, locked, adresseImmeuble,
  vignettes, proprietaireId,
}: {
  mandatId: string; immeubleId: string; mandants: Mandant[]; locked: boolean;
  /** L'adresse de l'immeuble : c'est par elle qu'on retrouve le propriétaire. */
  adresseImmeuble?: string;
  /** Cartes de visite chargées avec le mandat (retour #205). */
  vignettes: Record<string, VignetteData>;
  /** Le propriétaire de la fiche : mandant par défaut, plutôt que « aucun ». */
  proprietaireId?: string;
}) {
  /* Retour #205 : « le contact c'est celui de la fiche du bien, c'est logique ».
     La première ligne adopte donc le propriétaire de la fiche quand elle n'a
     pas déjà le sien — pas seulement à l'affichage : le rattachement est réel,
     sans quoi les pièces déposées resteraient sur le mandat au lieu d'enrichir
     la fiche du client. Les lignes suivantes d'une indivision, elles, se
     désignent à la main : rien ne dit qui elles sont. */
  const depart = (init.length ? init : [mandantVide(0)]).map((x, i) =>
    i === 0 && !x.contactId && proprietaireId ? { ...x, contactId: proprietaireId } : x);
  const [rows, setRows] = useState<Mandant[]>(depart);
  const [pending, start] = useTransition();
  const { modifie, valider } = useModifie(JSON.stringify(rows));

  const maj = (uid: string, patch: Partial<Mandant>) =>
    setRows((r) => r.map((x) => (x.uid === uid ? { ...x, ...patch } : x)));
  const supprimer = (uid: string) => setRows((r) => r.filter((x) => x.uid !== uid));

  const save = () =>
    start(async () => {
      await majMandants(mandatId, immeubleId, rows);
      valider();
    });

  return (
    <>
      <Titre
        titre={rows.length > 1 ? "Les mandants" : "Le mandant"}
        aide="Le mandant est un contact de la base : le sélectionner évite de ressaisir son état civil. Ce qui est saisi ou corrigé ici — naissance, adresse, qualité, société, pièces — remonte sur sa fiche à l'enregistrement, et repartira de là au mandat suivant."
      />

      {/* La recherche DGFiP ne sert qu'à trouver un propriétaire qu'on n'a pas.
          Rattaché, la question ne se pose plus : l'encart s'efface (retour
          #205 — « pas besoin de ce bouton alors que c'est déjà le cas »). */}
      {!locked && adresseImmeuble && !rows.some((x) => x.contactId || x.societe?.nom) && (
        <QuiPossede
          adresse={adresseImmeuble}
          onRetenir={(p) => {
            /* On remplit la PREMIÈRE ligne encore vide de société, sinon on en
               ajoute une : deux propriétaires = deux mandants. */
            setRows((r) => {
              const i = r.findIndex((x) => !x.societe?.nom && !x.contactId);
              const garni = (m: Mandant): Mandant => ({
                ...m,
                personne: "morale",
                societe: { ...m.societe, nom: p.denomination, siren: p.siren ?? m.societe?.siren },
                fonction: m.fonction ?? (p.droit.toLowerCase().startsWith("propriétaire") ? undefined : p.droit),
              });
              if (i >= 0) return r.map((m, j) => (j === i ? garni(m) : m));
              return [...r, garni(mandantVide(r.length))];
            });
          }}
        />
      )}

      <div className="mdt-mandants">
        {rows.map((x, i) => (
          <CarteMandant
            key={x.uid} x={x} rang={i + 1} seul={rows.length === 1} locked={locked}
            mandatId={mandatId} immeubleId={immeubleId}
            vignettes={vignettes} proprietaireId={proprietaireId}
            onMaj={(p) => maj(x.uid, p)} onSupprimer={() => supprimer(x.uid)}
          />
        ))}
      </div>

      {!locked && (
        <button type="button" className="mdt-add" onClick={() => setRows((r) => [...r, mandantVide(r.length)])}>
          <svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="3.4" /><path d="M3.5 20c.7-4 3.2-5.6 6.5-5.6M17 12v6M14 15h6" /></svg>
          Ajouter un mandant
        </button>
      )}

      {!locked && (
        <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={save}
          onAnnuler={() => setRows(depart)}>
          {modifie
            ? `${rows.length} mandant${rows.length > 1 ? "s" : ""} — modifications non enregistrées`
            : "Indivision, usufruit et sociétés : autant de lignes que nécessaire"}
        </BarreEnregistrer>
      )}
    </>
  );
}

function CarteMandant({
  x, rang, seul, locked, mandatId, immeubleId, vignettes, proprietaireId, onMaj, onSupprimer,
}: {
  x: Mandant; rang: number; seul: boolean; locked: boolean;
  mandatId: string; immeubleId: string;
  /** Cartes de visite chargées avec le mandat (retour #205). */
  vignettes: Record<string, VignetteData>;
  /** Le propriétaire de la fiche : mandant par défaut de la ligne. */
  proprietaireId?: string;
  onMaj: (p: Partial<Mandant>) => void; onSupprimer: () => void;
}) {
  const [picker, setPicker] = useState(false);
  const [, start] = useTransition();
  const morale = x.personne === "morale";

  /* Les sociétés déjà enregistrées sur la fiche du contact (retour #200). On
     ne les demande qu'en personne morale, et seulement quand un contact est
     rattaché : ailleurs, il n'y a rien à proposer.

     Le cache retient POUR QUI il a été rempli, et la liste affichée s'en
     déduit : sans ça, il aurait fallu le vider depuis l'effet, ce qui déclenche
     un rendu en cascade — et, le temps d'un affichage, les sociétés du contact
     précédent se seraient montrées sous le nom du nouveau. */
  const [cache, setCache] = useState<{ id: string; liste: Societe[] } | null>(null);
  const societesConnues =
    morale && x.contactId && cache?.id === x.contactId ? cache.liste : [];
  useEffect(() => {
    if (!morale || !x.contactId) return;
    let vivant = true;
    mandantDepuisContact(x.contactId)
      .then((f) => { if (vivant) setCache({ id: x.contactId!, liste: f?.societes ?? [] }); })
      .catch(() => undefined);
    return () => { vivant = false; };
  }, [morale, x.contactId]);

  return (
    <div className="mdt-md">
      <div className="mdt-md-h">
        {/* Retour #205 : « fais peut-être une gélule autour de Mandant 1 pour
            que ça se voie mieux. » */}
        <span className="r gel">{seul ? "Mandant" : `Mandant ${rang}`}</span>
        <div className="seg">
          {(["physique", "morale"] as const).map((p) => (
            <button key={p} type="button" className={x.personne === p ? "on" : undefined}
              disabled={locked} onClick={() => onMaj({ personne: p })}>
              Personne {p}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {!locked && !seul && (
          <button type="button" className="xdel" title="Retirer ce mandant" onClick={onSupprimer}>✕</button>
        )}
      </div>

      {/* Le contact de la ligne (retour #205).
          MAV : « ce que je comprends pas c'est qu'il y a écrit "aucun contact
          rattaché" ; le contact c'est celui de la fiche du bien, c'est logique.
          Pas besoin de ce bouton alors que c'est déjà le cas. » À défaut de
          contact propre à la ligne, on affiche donc celui de la fiche — il est
          le mandant par défaut — et le bouton ne sert plus qu'à en désigner un
          autre, ce qui arrive en indivision. */}
      <div className="mdt-md-ct">
        <VignetteContact
          v={x.contactId ? vignettes[x.contactId] : undefined}
          nom={[x.prenom, x.nom].filter(Boolean).join(" ") || "À désigner"}
        />
        {x.contactId && x.contactId === proprietaireId && (
          <span className="mdt-md-dft">propriétaire de la fiche</span>
        )}
        {!locked && (
          <button type="button" className="mdt-lien" onClick={() => setPicker(true)}>
            {x.contactId ? "Changer" : "Sélectionner ou créer"}
          </button>
        )}
      </div>

      {picker && (
        <ContactPicker
          titre={morale ? "Sélectionner le représentant" : "Sélectionner le mandant"}
          libelleValider="Rattacher au mandat"
          valeurActuelle={[x.prenom, x.nom].filter(Boolean).join(" ") || undefined}
          onAnnuler={() => setPicker(false)}
          onValider={(c) => {
            const [p, ...r] = (c.nom ?? "").split(" ");
            onMaj({ contactId: c.id, prenom: p, nom: r.join(" ") || undefined, email: c.email });
            setPicker(false);
            /* Le contact sait déjà tout : civilité, naissance, adresse, société.
               On recopie, sans écraser ce qui a été saisi à la main sur cette
               ligne (retour #133). */
            start(async () => {
              const f = await mandantDepuisContact(c.id).catch(() => null);
              if (!f) return;
              const p2: Partial<Mandant> = {};
              if (!x.qualite && f.civilite) p2.qualite = f.civilite;
              if (f.prenom) p2.prenom = f.prenom;
              if (f.nom) p2.nom = f.nom;
              if (f.email) p2.email = f.email;
              if (!x.dateNaissance && f.dateNaissance) p2.dateNaissance = f.dateNaissance;
              if (!x.lieuNaissance && f.lieuNaissance) p2.lieuNaissance = f.lieuNaissance;
              if (!x.adresse && f.adresse) p2.adresse = f.adresse;
              if (!x.fonction && f.fonction) p2.fonction = f.fonction;
              const s = f.societe ?? {};
              const soc: Societe = { ...x.societe };
              let aSociete = false;
              for (const k of ["nom", "siren", "rcs", "siege"] as const) {
                if (!soc[k] && s[k]) { soc[k] = s[k]; aSociete = true; }
              }
              if (soc.capital === undefined && s.capital !== undefined) { soc.capital = s.capital; aSociete = true; }
              if (aSociete) p2.societe = soc;
              /* La fiche porte une société et rien n'a encore été choisi : le
                 mandant est vraisemblablement une personne morale. */
              if (aSociete && soc.nom && x.personne === "physique" && !x.societe?.nom) p2.personne = "morale";
              onMaj(p2);
            });
          }}
        />
      )}

      {/* Retour #205 : « c'est mieux quand c'est sur 3 lignes, tu peux reprendre
          la façon dont c'était affiché sur le BO. » Le BO tenait en identité /
          naissance / adresse ; on garde ce rythme en y logeant les deux cases
          qu'il n'avait pas — la civilité, qui va avec le nom, et la qualité au
          mandat, qui va avec l'état civil. L'adresse prend la ligne entière :
          c'est la plus longue, et la casser en deux la rendait illisible. */}
      <div className="mdt-grid trois">
        {/* Retours #226 et #227 — « quand je mets personne morale ça me propose
            de mettre le mandant, autant pas le mettre ici, on le met après » ;
            « pareil pour la personne physique, on met pas le nom ici, c'est
            après avec les contacts, c'est pas du champ libre ».
            L'identité appartient au contact, pas au mandat : la saisir ici,
            c'est créer un second état civil qui dérive du premier au premier
            mandat suivant. Rattaché, elle s'affiche et se corrige sur la fiche
            du contact ; sans contact, ces cases n'ont rien à montrer. */}
        <Champ label="Civilité">
          <input className="mi gris" value={x.qualite ?? ""} readOnly
            placeholder={x.contactId ? "—" : "à reprendre du contact"} />
        </Champ>
        <Champ label="Prénom">
          <input className="mi gris" value={x.prenom ?? ""} readOnly
            placeholder={x.contactId ? "—" : "à reprendre du contact"} />
        </Champ>
        <Champ label="Nom">
          <input className="mi maj gris" value={x.nom ?? ""} readOnly
            placeholder={x.contactId ? "—" : "à reprendre du contact"} />
          {x.contactId && !locked && (
            <Link className="mdt-lien" href={`/contact/${x.contactId}`} target="_blank">
              Corriger sur la fiche contact
            </Link>
          )}
        </Champ>

        <Champ label="Né(e) le">
          <input className="mi" type="date" value={(x.dateNaissance ?? "").slice(0, 10)} disabled={locked}
            onChange={(e) => onMaj({ dateNaissance: e.target.value || undefined })} />
        </Champ>
        <Champ label="Lieu de naissance">
          {/* Retour #207 : la commune se complète dès les premières lettres,
              sur la même base que l'adresse — gratuite et sans clé. La frappe
              reste libre : on naît aussi hors de France. */}
          <AdresseInput classe="mi" cible="commune" valeur={x.lieuNaissance ?? ""} disabled={locked}
            placeholder="Ville de naissance"
            onSaisie={(v) => onMaj({ lieuNaissance: v || undefined })}
            onChoisir={(a) => onMaj({ lieuNaissance: a.label })} />
        </Champ>
        <Champ label="Qualité au mandat">
          {/* Champ libre avec suggestions : le BO contient « Gérant dûment
              habilité », « Gérant - Associé »… qu'une liste fermée perdrait.
              L'identifiant de la liste porte l'uid du mandant (retour #230) :
              il était fixe, si bien qu'une indivision à deux posait deux
              éléments de même identifiant dans la page — les suggestions du
              second mandant venaient alors de la liste du premier. */}
          <input className="mi" list={`mdt-fonctions-${x.uid}`} value={x.fonction ?? ""} disabled={locked}
            placeholder={morale ? "Gérant, Président…" : "Propriétaire, Indivisaire…"}
            onChange={(e) => onMaj({ fonction: e.target.value || undefined })} />
          <datalist id={`mdt-fonctions-${x.uid}`}>
            {FONCTIONS_MANDANT.map((f) => <option key={f} value={f} />)}
          </datalist>
        </Champ>

        <Champ label="Adresse" pleine>
          {/* Adresse géolocalisée : on tape les premières lettres, la Base
              Adresse Nationale complète (retour #134). */}
          <AdresseInput classe="mi" valeur={x.adresse ?? ""} disabled={locked}
            placeholder="N°, rue, code postal, ville"
            onSaisie={(v) => onMaj({ adresse: v || undefined })}
            onChoisir={(a) => onMaj({ adresse: a.label })} />
        </Champ>
      </div>

      {morale && (
        <>
          <div className="mdt-sub">La société</div>
          {!locked && (
            <ChercheSociete
              onChoisir={(e) => {
                const soc: Societe = {
                  ...x.societe,
                  nom: e.nom,
                  siren: e.siren,
                  siege: e.siege ?? x.societe?.siege,
                  /* Retour #208 : le greffe se déduit du siège, l'annuaire des
                     entreprises ne le sert pas. Pré-remplissage seulement — on
                     n'écrase pas un greffe déjà saisi. */
                  rcs: x.societe?.rcs ?? e.rcs,
                };
                onMaj({ societe: soc });
                /* Le capital vient du registre national, qui demande un compte :
                   il arrive après coup, et seulement si la case est vide. Sans
                   identifiants configurés, rien ne remonte et le champ reste à
                   saisir — c'était le cas jusqu'ici. */
                if (soc.capital === undefined && e.siren) {
                  start(async () => {
                    const c = await capitalDuSiren(e.siren).catch(() => undefined);
                    if (c !== undefined) onMaj({ societe: { ...soc, capital: c } });
                  });
                }
              }}
            />
          )}
          {/* Retour #200 — « un propriétaire peut avoir plusieurs sociétés […]
              si le vendeur en a plusieurs, quand on crée un mandat il nous
              propose de sélectionner une des sociétés créées ». Le choix
              n'apparaît qu'à partir de deux : en proposer une seule serait un
              menu à une entrée. Les sociétés viennent de la fiche du contact,
              où chaque mandat dépose la sienne. */}
          {societesConnues.length > 1 && !locked && (
            <div className="mdt-socs">
              <span className="l">Sociétés de {[x.prenom, x.nom].filter(Boolean).join(" ") || "ce contact"}</span>
              {societesConnues.map((s) => {
                const active = (s.siren && s.siren === x.societe?.siren)
                  || (!!s.nom && s.nom === x.societe?.nom);
                return (
                  <button
                    key={`${s.siren ?? ""}-${s.nom ?? ""}`} type="button"
                    className={`mdt-soc-choix${active ? " on" : ""}`}
                    onClick={() => onMaj({ societe: { ...s } })}
                  >
                    <b>{s.nom}</b>
                    {s.siren && <i>SIREN {s.siren}</i>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mdt-grid">
            <Champ label="Raison sociale" large>
              <input className="mi maj" value={x.societe?.nom ?? ""} disabled={locked}
                onChange={(e) => onMaj({ societe: { ...x.societe, nom: e.target.value || undefined } })} />
            </Champ>
            <Champ label="SIREN">
              <input className="mi" value={x.societe?.siren ?? ""} disabled={locked} inputMode="numeric"
                onChange={(e) => onMaj({ societe: { ...x.societe, siren: e.target.value || undefined } })} />
            </Champ>
            <Champ label="RCS">
              <input className="mi" value={x.societe?.rcs ?? ""} disabled={locked}
                onChange={(e) => onMaj({ societe: { ...x.societe, rcs: e.target.value || undefined } })} />
            </Champ>
            <Champ label="Capital (€)">
              <input className="mi" value={x.societe?.capital ?? ""} disabled={locked} inputMode="numeric"
                onChange={(e) => onMaj({ societe: { ...x.societe, capital: parse(e.target.value) } })} />
            </Champ>
            <Champ label="Siège social" large>
              {/* Même champ que l'adresse du mandant (retour #136). */}
              <AdresseInput classe="mi" valeur={x.societe?.siege ?? ""} disabled={locked}
                placeholder="N°, rue, code postal, ville"
                onSaisie={(v) => onMaj({ societe: { ...x.societe, siege: v || undefined } })}
                onChoisir={(a) => onMaj({ societe: { ...x.societe, siege: a.label } })} />
            </Champ>
          </div>
        </>
      )}

      <div className="mdt-sub">Pièces justificatives</div>
      <div className="mdt-pieces">
        {piecesMandant(x).map((p) => (
          <Piece
            key={p.cle} label={p.label} url={p.url} locked={locked}
            mandatId={mandatId} immeubleId={immeubleId} cle={p.cle} contactId={x.contactId}
            mandantUid={x.uid}
            onDepose={(url) => onMaj({ [p.cle]: url } as Partial<Mandant>)}
          />
        ))}
      </div>
      {!x.contactId && (
        <div className="mdt-hint">
          Rattachez un contact avant de déposer les pièces : sans lui, elles restent sur ce mandat
          au lieu d&apos;enrichir la fiche du client.
        </div>
      )}
    </div>
  );
}

/**
 * « Qui possède cet immeuble ? » (retour #135)
 *
 * Quand le propriétaire est une personne morale, la DGFiP le publie : le
 * fichier des locaux des personnes morales donne, adresse par adresse, la
 * société détentrice, son SIREN et la nature de son droit. On part de
 * l'adresse de l'immeuble — elle est déjà dans la fiche — et on propose ce
 * qu'on trouve.
 *
 * Les personnes physiques n'y sont pas : un immeuble détenu par un particulier
 * ou une indivision familiale ne rend rien, et c'est normal. On le dit plutôt
 * que de laisser croire à une panne.
 */
function QuiPossede({ adresse, onRetenir }: {
  adresse: string;
  onRetenir: (p: ProprietairePM) => void;
}) {
  const [res, setRes] = useState<ResultatProprietaires | null>(null);
  const [pending, start] = useTransition();
  const [pris, setPris] = useState<string[]>([]);

  const chercher = () =>
    start(async () => {
      setPris([]);
      setRes(await proprietairesPm(adresse).catch(() => ({ ok: false as const, erreur: "Recherche impossible." })));
    });

  return (
    <div className="mdt-qp">
      <div className="mdt-qp-h">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M3 10.5 12 4l9 6.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" />
        </svg>
        <span>
          <b>Qui possède cet immeuble ?</b>
          <i>{adresse}</i>
        </span>
        <button type="button" className="fadd" disabled={pending} onClick={chercher}>
          {pending ? "Recherche…" : res ? "Relancer" : "Chercher le propriétaire"}
        </button>
      </div>

      {res && !res.ok && <div className="mdt-qp-v">{res.erreur}</div>}
      {res?.ok && res.liste.length === 0 && (
        <div className="mdt-qp-v">
          Aucune société propriétaire d&apos;immeuble à cette adresse — donc un particulier ou une
          indivision familiale, les seuls que le fichier public n&apos;a pas le droit de nommer.
          Les adresses où les sociétés ne détiennent qu&apos;un local (un studio, une boutique, une
          maison) sont écartées de la base : ce ne sont pas des immeubles.
        </div>
      )}
      {res?.ok && res.liste.length > 0 && res.lecture && (
        <div className="mdt-qp-lect">{res.lecture}</div>
      )}
      {res?.ok && res.liste.length > 0 && (
        <div className="mdt-qp-l">
          {res.liste.map((p) => {
            const cle = `${p.siren ?? p.denomination}|${p.droit}`;
            return (
              <div key={cle} className="mdt-qp-it">
                <b>{p.denomination}</b>
                <span>
                  {[
                    `${p.locaux} local${p.locaux > 1 ? "ux" : ""}`,
                    p.droit,
                    p.forme,
                    p.siren ? `SIREN ${p.siren}` : "sans SIREN au cadastre",
                    p.numero ? `n° ${p.numero}` : "",
                  ].filter(Boolean).join(" · ")}
                </span>
                <button type="button" className="fadd" disabled={pris.includes(cle)}
                  onClick={() => { onRetenir(p); setPris((v) => [...v, cle]); }}>
                  {pris.includes(cle) ? "✓ Repris" : "Le mettre en mandant"}
                </button>
              </div>
            );
          })}
          <span className="src">
            Fichier des locaux des personnes morales (DGFiP, millésime {res.millesime}) — les
            particuliers en sont exclus par construction, et un propriétaire a pu vendre depuis.
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Recherche de la société dans l'annuaire des entreprises (retour #135).
 *
 * MAV demandait à retrouver le propriétaire d'un immeuble par son adresse :
 * ça, l'open data ne le donne pas — le fichier des propriétaires est fiscal et
 * fermé. Ce qui est ouvert, c'est l'entreprise : on tape le nom ou le SIREN et
 * la raison sociale, le SIREN et le siège se remplissent seuls. Restent le
 * capital et le RCS, qui viennent du registre du commerce.
 */
function ChercheSociete({ onChoisir }: { onChoisir: (e: EntrepriseTrouvee) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<EntrepriseTrouvee[]>([]);
  const [cherche, setCherche] = useState(false);
  const [vide, setVide] = useState(false);

  useEffect(() => {
    const t = q.trim();
    const timer = setTimeout(() => {
      if (t.length < 3) { setRes([]); setVide(false); setCherche(false); return; }
      setCherche(true);
      chercherEntreprise(t)
        .then((r) => { setRes(r); setVide(r.length === 0); })
        .catch(() => setRes([]))
        .finally(() => setCherche(false));
    }, t.length < 3 ? 0 : 350);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="mdt-soc">
      <label className="mdt-soc-q">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher la société — raison sociale ou SIREN" />
        {cherche && <i>…</i>}
      </label>
      {res.length > 0 && (
        <div className="mdt-soc-l">
          {res.map((e) => (
            <button key={e.siren} type="button"
              onClick={() => { onChoisir(e); setQ(""); setRes([]); }}>
              <b>{e.nom}</b>
              <span>{[e.forme, `SIREN ${e.siren}`, e.siege].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          <span className="src">Annuaire des entreprises — données publiques INSEE / INPI</span>
        </div>
      )}
      {vide && q.trim().length >= 3 && !cherche && (
        <div className="mdt-soc-v">Aucune société trouvée — la saisie reste possible ci-dessous.</div>
      )}
    </div>
  );
}

function Champ({ label, children, large, pleine }: {
  label: string; children: React.ReactNode;
  /** Deux colonnes de large. */
  large?: boolean;
  /** Toute la ligne — pour l'adresse, qu'on ne coupe pas (retour #205). */
  pleine?: boolean;
}) {
  return (
    <label className={`mdt-ch${large ? " lg" : ""}${pleine ? " pleine" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Piece({
  label, url, locked, mandatId, immeubleId, cle, contactId, onDepose, mandantUid,
}: {
  label: string; url?: string; locked: boolean; mandatId: string; immeubleId: string;
  cle: "cni" | "kbis" | "titre"; contactId?: string; onDepose: (url: string) => void;
  /** Le mandant concerné : le serveur en a besoin pour ranger la pièce. */
  mandantUid?: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const choisir = (f: File | undefined) => {
    if (!f) return;
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.set("file", f);
      const r = await deposerPieceMandat(mandatId, immeubleId, cle, contactId, fd, mandantUid);
      if (r.ok) onDepose(r.url);
      else setErr(r.message);
    });
  };

  /* Retour #205 : « il faut qu'on puisse cliquer partout sur ce bouton et ça
     ouvre la fenêtre pour ajouter le document ». La ligne entière est donc un
     <label> : viser le petit « Déposer » n'était pas raisonnable. Le lien
     « Ouvrir » reste seul à faire autre chose — il sort du label pour que le
     clic dessus n'ouvre pas le sélecteur de fichiers. */
  const contenu = (
    <>
      <span className="ic">
        {url ? (
          <svg viewBox="0 0 24 24"><path d="m5 13 4 4L19 7" /></svg>
        ) : (
          <svg viewBox="0 0 24 24"><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" /><path d="M14 3v4h4" /></svg>
        )}
      </span>
      <span className="l">{label}</span>
      {!url && <span className="mq">manquante</span>}
    </>
  );

  return (
    <div className={`mdt-pc${url ? " ok" : ""}`}>
      {locked ? (
        <span className="mdt-pc-in">{contenu}</span>
      ) : (
        <label className={`mdt-pc-in cliquable${pending ? " off" : ""}`}>
          {contenu}
          <span className="mdt-up">{pending ? "Envoi…" : url ? "Remplacer" : "Déposer"}</span>
          <input type="file" accept="image/*,application/pdf" disabled={pending}
            onChange={(e) => choisir(e.target.files?.[0])} />
        </label>
      )}
      {url && <a className="mdt-lien" href={url} target="_blank" rel="noreferrer">Ouvrir</a>}
      {err && <span className="er">{err}</span>}
    </div>
  );
}

/* ---------------------------------------------------- Onglet 2 · Objet */

function OngletObjet({
  m, im, lots, parcelles, mandatId, immeubleId, locked,
}: {
  m: Record<string, unknown>; im: Record<string, unknown> | null; lots: Record<string, unknown>[];
  /** Parcelles déjà connues de l'onglet Emplacement (retour #202). */
  parcelles: Record<string, unknown>[];
  mandatId: string; immeubleId: string; locked: boolean;
}) {
  const [pending, start] = useTransition();
  const s = useMemo(() => synthese(lots), [lots]);

  /* Retour #202 — « si elles sont remplies dans Emplacement alors c'est bloqué
     ici ; si c'est vide dans Emplacement on peut remplir et ça remplit l'info
     dans Emplacement ». Une parcelle n'a qu'un seul propriétaire de la vérité,
     et c'est la fiche du bien. Le mandat la lit quand elle existe, la saisit
     quand elle manque, ne la contredit jamais. */
  const refsEmplacement = useMemo(
    () => parcelles.map((p) => S(p.ref_cadastre).trim()).filter(Boolean).join(", "),
    [parcelles],
  );
  const cadVerrouille = refsEmplacement !== "";

  /* Retour #209 — « il y a la surface du terrain qui est déjà rentrée dans le
     terrain dans Emplacement, donc elle devrait apparaître ». Même doctrine
     que la référence cadastrale (#202) : la fiche du bien fait foi. Emplacement
     la tient de la somme des superficies de parcelles, à défaut du champ de
     l'immeuble — on la lit dans cet ordre, sans quoi le mandat afficherait une
     surface que la fiche a déjà remplacée. */
  const surfaceEmplacement = useMemo(() => {
    const somme = parcelles.reduce((t, p) => t + (num(p.superficie) ?? 0), 0);
    return somme || num(im?.ter_surface) || undefined;
  }, [parcelles, im]);
  const terrainVerrouille = surfaceEmplacement !== undefined;

  const [cad, setCad] = useState(refsEmplacement || S(m.ref_cadastre));
  const [terrain, setTerrain] = useState(S(surfaceEmplacement ?? num(m.surface_terrain)));
  const auto = useMemo(
    () => descriptifLegal(im ?? {}, lots, cad || undefined, parse(terrain)),
    [im, lots, cad, terrain],
  );
  const dejaEcrit = S(m.description);
  const [libre, setLibre] = useState(!!dejaEcrit && dejaEcrit !== auto);
  const [desc, setDesc] = useState(dejaEcrit || auto);
  const texte = libre ? desc : auto;

  /* Retour #231 : « dans l'objet il y a une notif disant qu'il manque quelque
     chose, mais tout est rempli. » Le descriptif était le coupable : l'écran
     affichait le texte rédigé automatiquement, mais la base restait vide tant
     qu'on n'avait pas cliqué Enregistrer — l'agent voyait un onglet complet et
     un compteur qui disait le contraire. Le texte étant déterministe et de
     toute façon celui que le mandat portera, on l'inscrit dès qu'il manque :
     l'écran et la base disent enfin la même chose. */
  const [pose, setPose] = useState(false);
  useEffect(() => {
    if (pose || locked || dejaEcrit || !auto || !im) return;
    setPose(true);
    start(async () => { await updateMandat(mandatId, immeubleId, { description: auto }); });
  }, [pose, locked, dejaEcrit, auto, im, mandatId, immeubleId, start]);
  const { modifie, valider } = useModifie(JSON.stringify([cad, terrain, libre, desc]));
  const annuler = () => {
    setCad(refsEmplacement || S(m.ref_cadastre));
    setTerrain(S(surfaceEmplacement ?? num(m.surface_terrain)));
    setLibre(!!dejaEcrit && dejaEcrit !== auto);
    setDesc(dejaEcrit || auto);
  };

  const save = () =>
    start(async () => {
      /* #175 — la parcelle saisie ici appartient à l'immeuble : on la reporte
         sur sa fiche si elle n'y est pas encore. */
      await reporterCadastre(immeubleId, cad, parse(terrain));
      valider();
      await updateMandat(mandatId, immeubleId, {
        ref_cadastre: cad || undefined,
        surface_terrain: parse(terrain),
        // La surface bâtie et l'occupation ne se saisissent plus : elles sont
        // la somme des lots. Les recopier à la main, c'est signer un mandat
        // qui contredit l'état locatif (retours #102 et #103).
        surface_bati: s.surface || undefined,
        occuped_yn: s.occupation !== "libre",
        description: texte,
      });
    });

  return (
    <>
      <Titre
        titre="L'objet du mandat"
        aide="Occupation, surfaces et répartition des lots viennent de l'état locatif : ils ne se saisissent pas ici. Modifiez le tableau des lots et cet écran suit."
      />

      {/* Retour #209 — « je voulais garder le descriptif écrit qui reprend
          toutes les infos et enlever le cadre en début de page. » Le cadre du
          bien répétait ce que le descriptif légal, plus bas, dit déjà en toutes
          lettres : douze lots, tant de m², tant de loyer, vendu occupé.
          L'adresse, elle, figure déjà au cartouche du mandat, en tête d'écran —
          la redire ici n'apprenait rien. */}

      {/* Retour #206 — « l'occupation est déterminée par l'état locatif, donc tu
          peux enlever ce bouton, tu remplaces par le loyer actuel. Et tu mets la
          référence cadastrale et la surface de terrain sur la même ligne. »
          L'occupation reste dite, mais là où elle a du sens : dans le descriptif
          légal, qui l'écrit en toutes lettres. La répéter en case grisée
          occupait la place d'une information qui, elle, manque souvent. */}
      <div className="mdt-sub">Ce qui reste à saisir</div>
      <div className="mdt-grid deux">
        <Champ label="Références cadastrales">
          <input
            className={`mi${cadVerrouille ? " gris" : ""}`} value={cad}
            disabled={locked} readOnly={cadVerrouille} placeholder="ex. AB 0123"
            title={cadVerrouille
              ? "Renseignée sur l'onglet Emplacement du bien — c'est là qu'elle se modifie."
              : "Ce que vous saisissez ici est reporté sur l'onglet Emplacement du bien."}
            onChange={(e) => setCad(e.target.value)}
          />
          {cadVerrouille && immeubleId && (
            <Link className="mdt-lien" href={`/bien/${immeubleId}`}>Modifier dans Emplacement</Link>
          )}
        </Champ>
        <Champ label="Surface du terrain (m²)">
          <input
            className={`mi${terrainVerrouille ? " gris" : ""}`} value={terrain}
            disabled={locked} readOnly={terrainVerrouille} inputMode="numeric"
            title={terrainVerrouille
              ? "Renseignée sur l'onglet Emplacement du bien — c'est là qu'elle se modifie."
              : "Ce que vous saisissez ici est reporté sur l'onglet Emplacement du bien."}
            onChange={(e) => setTerrain(e.target.value)}
          />
          {terrainVerrouille && immeubleId && (
            <Link className="mdt-lien" href={`/bien/${immeubleId}`}>Modifier dans Emplacement</Link>
          )}
        </Champ>
      </div>
      <div className="mdt-grid deux">
        <Champ label="Surface bâtie (m²)">
          <input className="mi gris" value={s.surface ? group(s.surface) : ""} readOnly title="Somme des lots" />
        </Champ>
        <Champ label="Loyer actuel">
          <input
            className="mi gris"
            value={s.loyerMensuel ? `${group(s.loyerMensuel)} € / mois HC — ${group(s.loyerMensuel * 12)} € / an` : "—"}
            readOnly title="Somme des loyers en cours de l'état locatif"
          />
        </Champ>
      </div>

      <div className="mdt-sub">Titre de propriété</div>
      <div className="mdt-pieces">
        <Piece
          label="Titre de propriété" url={S(m.justif_propriete) || undefined} locked={locked}
          mandatId={mandatId} immeubleId={immeubleId} cle="titre" onDepose={() => undefined}
        />
      </div>

      <div className="mdt-sub">
        Descriptif porté au mandat
        <label className="mdt-tgl">
          <input type="checkbox" checked={libre} disabled={locked}
            onChange={(e) => { setLibre(e.target.checked); if (e.target.checked) setDesc(texte); }} />
          Rédiger à la main
        </label>
      </div>
      {libre ? (
        <>
          <textarea className="mi ta" rows={10} value={desc} disabled={locked}
            onChange={(e) => setDesc(e.target.value)} />
          {desc !== auto && !locked && (
            <button type="button" className="mdt-lien" style={{ marginTop: 8 }} onClick={() => setDesc(auto)}>
              Reprendre le texte rédigé depuis l&apos;état locatif
            </button>
          )}
        </>
      ) : (
        <div className="mdt-auto">
          {auto.split("\n\n").map((par, i) => <p key={i}>{par}</p>)}
          <span className="tag">Rédigé automatiquement depuis l&apos;état locatif</span>
        </div>
      )}

      {!locked && (
        <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={save} onAnnuler={annuler} />
      )}
    </>
  );
}

/* ----------------------------------------------------- Onglet 3 · Prix */

function OngletPrix({
  m, lots, mandatId, immeubleId, locked, bareme,
}: {
  m: Record<string, unknown>; lots: Record<string, unknown>[];
  mandatId: string; immeubleId: string; locked: boolean;
  /** Le barème des Réglages de l'agence ; celui du code à défaut. */
  bareme?: Tranche[];
}) {
  const [pending, start] = useTransition();
  const [p, setP] = useState<Prix>({
    nv: num(m.prix_nv), hai: num(m.prix_hai), taux: num(m.honos_taux), honos: num(m.honos_ttc),
  });
  /* Le prix HAI est l'ancre : c'est lui qu'on annonce, il ne bouge pas tout
     seul quand on ajuste les honoraires ou le net vendeur (retour #190). */
  const [pilotes, setPilotes] = useState<ChampPrix[]>(["hai"]);
  const [charge, setCharge] = useState(S(m.Charge_hono) || "Acheteur");
  const [mode, setMode] = useState<Mode>(modeVente(m));
  const { modifie, valider } = useModifie(JSON.stringify([p, charge, mode]));
  const annuler = () => {
    setP({ nv: num(m.prix_nv), hai: num(m.prix_hai), taux: num(m.honos_taux), honos: num(m.honos_ttc) });
    setCharge(S(m.Charge_hono) || "Acheteur");
    setMode(modeVente(m));
    setPilotes(["hai"]);
  };
  const s = useMemo(() => synthese(lots), [lots]);
  const regime = useMemo(() => regimeHonoraires(lots, mode, charge), [lots, mode, charge]);
  const remise = useMemo(() => venteDirecteLocataire(p), [p]);

  const saisir = (cle: ChampPrix) => (v: string) => {
    const suite = [...pilotes.filter((c) => c !== cle), cle];
    setPilotes(suite);
    setP(resoudrePrix({ ...p, [cle]: parse(v) }, suite, bareme));
  };

  const save = () =>
    start(async () => {
      await updateMandat(mandatId, immeubleId, {
        prix_nv: p.nv, prix_hai: p.hai, honos_taux: p.taux, honos_ttc: p.honos,
        Charge_hono: regime.charge,
        vente_mode: mode,
      } as MandatPatch);
      valider();
    });

  /* La case mise en avant est celle qu'on vient d'écrire ; le prix HAI reste
     toujours signalé, puisque c'est lui qui tient tout le reste. */
  const dernier = pilotes[pilotes.length - 1];
  const pilote = (c: ChampPrix) => c === dernier || c === "hai";
  /* Le barème est un plafond : au-delà, l'écran le dit. */
  const tropCher = p.nv && p.taux ? p.taux > plafondTaux(p.nv, bareme) + 0.005 : false;
  const rendement = p.hai && s.loyerMensuel ? ((s.loyerMensuel * 12) / p.hai) * 100 : undefined;

  return (
    <>
      <Titre
        titre="Le prix et les honoraires"
        aide="Saisissez le prix HAI : les honoraires se calculent au barème et le net vendeur s'en déduit. Ajuster les honoraires, le net vendeur ou le taux ne fait jamais bouger le prix HAI — c'est lui qui est annoncé au client."
      />
      <p className="mdt-bareme">
        Barème en vigueur — <b>{baremeTexte(bareme)}</b>. Depuis l'arrêté du 26 janvier 2022 c'est un
        maximum : le taux peut être inférieur, jamais supérieur.
      </p>

      <div className="mdt-prix">
        <CasePrix label="Prix HAI" unite="€" v={p.hai} pilote={pilote("hai")} locked={locked} onChange={saisir("hai")} fort />
        <span className="op sep">dont</span>
        <CasePrix label="Net vendeur" unite="€" v={p.nv} pilote={pilote("nv")} locked={locked} onChange={saisir("nv")} />
        <span className="op">+</span>
        <CasePrix label="Honoraires" unite="€" v={p.honos} pilote={pilote("honos")} locked={locked} onChange={saisir("honos")} />
        <span className="op sep">soit</span>
        <CasePrix label="Taux" unite="%" v={p.taux} pilote={pilote("taux")} locked={locked} onChange={saisir("taux")} decimal />
      </div>

      {tropCher && (
        <p className="mdt-alerte">
          Le taux saisi dépasse le barème affiché ({plafondTaux(p.nv!, bareme).toFixed(2).replace(".", ",")} % pour
          ce net vendeur). Depuis l'arrêté du 26 janvier 2022 le barème est un maximum opposable :
          au-delà, les honoraires sont contestables.
        </p>
      )}

      {/* La nature de la vente commande la charge des honoraires : c'est le
          droit de préemption du locataire qui décide, pas l'occupation. */}
      <div className="mdt-sub">Nature de la vente</div>
      <div className="seg lg">
        {([["bloc", "Vente en bloc"], ["decoupe", "Vente à la découpe"]] as const).map(([v, l]) => (
          <button key={v} type="button" className={mode === v ? "on" : undefined}
            disabled={locked} onClick={() => setMode(v)}>{l}</button>
        ))}
      </div>

      <div className="mdt-sub">Charge des honoraires</div>
      <div className="seg lg">
        {CHARGES_HONOS.map((c) => (
          <button key={c} type="button" className={regime.charge === c ? "on" : undefined}
            disabled={locked || regime.impose !== null} onClick={() => setCharge(c)}>
            Charge {c.toLowerCase()}
          </button>
        ))}
      </div>
      <div className={regime.impose ? "mdt-doctrine" : "mdt-doctrine libre"}>
        {regime.impose ? (
          <>
            <b>Charge vendeur imposée.</b> {regime.motif}{" "}
            L&apos;article 4.3 du mandat porte la réserve correspondante : la subrogation du préempteur
            reste acquise face à une commune, mais elle est expressément écartée face au locataire.
          </>
        ) : (
          <>
            <b>Charge libre.</b> {regime.motif}
          </>
        )}
      </div>

      {/* Ce que la vente au locataire change — et ce qu'elle ne change pas.
          Le prix est le même pour lui que pour n'importe qui ; c'est le
          mandant qui encaisse la remise. */}
      {regime.clauseLocataire && remise && (
        <div className="mdt-rend">
          Si le locataire achète en direct, la remise de{" "}
          {Math.round(REMISE_LOCATAIRE * 100)} % ramène les honoraires à{" "}
          <b>{String(remise.taux).replace(".", ",")} %</b>, soit {euros(remise.honos)}.
          Le locataire paie le même prix, {euros(p.hai)} ; le net vendeur passe à{" "}
          <b>{euros(remise.nv)}</b> — {euros(remise.gain)} de plus pour le mandant.
        </div>
      )}

      {rendement !== undefined && (
        <div className="mdt-rend">
          Au prix HAI de <b>{euros(p.hai)}</b>, avec {euros(s.loyerMensuel * 12)}{" "}
          de loyers annuels, le rendement affiché à l&apos;acquéreur sera de{" "}
          <b>{rendement.toFixed(2).replace(".", ",")} %</b>.
        </div>
      )}

      {!locked && (
        <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={save} onAnnuler={annuler} />
      )}
    </>
  );
}

function CasePrix({
  label, unite, v, pilote, locked, onChange, fort, decimal,
}: {
  label: string; unite: string; v?: number; pilote: boolean; locked: boolean;
  onChange: (s: string) => void; fort?: boolean; decimal?: boolean;
}) {
  const [brut, setBrut] = useState<string | null>(null);
  const affiche = brut ?? (v === undefined ? "" : decimal ? String(v).replace(".", ",") : group(v));
  return (
    <label className={`mdt-cp${pilote ? " pilote" : ""}${fort ? " fort" : ""}`}>
      <span className="l">{label}{pilote && <i title="Case saisie : elle pilote les autres">saisi</i>}</span>
      <span className="in">
        <input
          value={affiche} disabled={locked} inputMode="decimal"
          onChange={(e) => { setBrut(e.target.value); onChange(e.target.value); }}
          onBlur={() => setBrut(null)}
        />
        <i>{unite}</i>
      </span>
    </label>
  );
}

/* ----------------------------------------------- Onglet 4 · Conditions */

function OngletConditions({
  m, mandatId, immeubleId, locked,
}: {
  m: Record<string, unknown>; mandatId: string; immeubleId: string; locked: boolean;
}) {
  const [pending, start] = useTransition();
  /* Retour #193 : la prise d'effet part de la date du jour, et reste
     modifiable. Un mandat sans date d'effet n'a pas d'échéance. */
  const [debut, setDebut] = useState(dateInput(m.date_effet) || new Date().toISOString().slice(0, 10));
  const [duree, setDuree] = useState(S(num(m["durée_tot_month"]) ?? 12));
  const [exclu, setExclu] = useState(S(m.Type_exclu) || "Simple");
  const [dExclu, setDExclu] = useState(S(num(m["durée_exclu_jours"]) ?? 90));
  const [irrevoc, setIrrevoc] = useState(S(num(m["durée_irrevoc_days"]) ?? IRREVOC_DEFAUT[regimeDe(m.Type_exclu)]));
  const [revoc, setRevoc] = useState(dateInput(m.date_revoc_exclu));
  const [web, setWeb] = useState(publicationWeb(m));
  const { modifie, valider } = useModifie(JSON.stringify([debut, duree, exclu, dExclu, irrevoc, revoc, web]));
  const annuler = () => {
    setDebut(dateInput(m.date_effet) || new Date().toISOString().slice(0, 10));
    setDuree(S(num(m["durée_tot_month"]) ?? 12));
    setExclu(S(m.Type_exclu) || "Simple");
    setDExclu(S(num(m["durée_exclu_jours"]) ?? 90));
    setIrrevoc(S(num(m["durée_irrevoc_days"]) ?? IRREVOC_DEFAUT[regimeDe(m.Type_exclu)]));
    setRevoc(dateInput(m.date_revoc_exclu));
    setWeb(publicationWeb(m));
  };

  const fin = (() => {
    const d0 = parse(duree);
    if (!debut || !d0) return undefined;
    const d = new Date(debut);
    d.setMonth(d.getMonth() + d0);
    return d;
  })();

  const save = () =>
    start(async () => {
      await updateMandat(mandatId, immeubleId, {
        date_effet: debut ? new Date(debut).toISOString() : undefined,
        "durée_tot_month": parse(duree),
        Type_exclu: exclu,
        "durée_exclu_jours": exclu === "Semi-exclusif" ? parse(dExclu) : undefined,
        // La date de révocation de la seule exclusivité ne vaut qu'en exclusif.
        date_revoc_exclu: exclu === "Exclusif" && revoc ? new Date(revoc).toISOString() : undefined,
        "durée_irrevoc_days": parse(irrevoc),
        publication_web_yn: web,
      });
      valider();
    });

  return (
    <>
      <Titre
        titre="Les conditions"
        aide="Type de mandat, durées, et ce que le client accepte qu'on fasse du bien. Ces choix changent le texte du mandat généré."
      />

      <div className="mdt-sub">Type de mandat</div>
      <div className="mdt-types">
        {TYPES_EXCLU.map((t) => (
          <button key={t} type="button" className={`mdt-ty${exclu === t ? " on" : ""}`}
            disabled={locked} onClick={() => setExclu(t)}>
            <b>{t}</b>
            <span>
              {t === "Simple"
                ? "Le client peut confier le bien à d'autres et vendre lui-même. Le plus facile à faire signer."
                : t === "Semi-exclusif"
                ? "Nous seuls parmi les professionnels ; le client garde le droit de vendre lui-même sans honoraires."
                : "Nous seuls, y compris face à une vente directe du client."}
            </span>
          </button>
        ))}
      </div>

      <div className="mdt-sub">Durées</div>
      <div className="mdt-grid">
        <Champ label="Prise d'effet">
          <input className="mi" type="date" value={debut} disabled={locked} onChange={(e) => setDebut(e.target.value)} />
        </Champ>
        <Champ label="Durée totale (mois)">
          <input className="mi" value={duree} disabled={locked} inputMode="numeric" onChange={(e) => setDuree(e.target.value)} />
        </Champ>
        <Champ label="Irrévocabilité (jours)">
          <input className="mi" value={irrevoc} disabled={locked} inputMode="numeric" onChange={(e) => setIrrevoc(e.target.value)} />
        </Champ>
        {exclu === "Semi-exclusif" && (
          /* Retour #194 : ce champ porte la DURÉE D'EXCLUSIVITÉ, au terme de
             laquelle elle s'éteint d'elle-même et le mandat se poursuit en
             mandat simple. « Délai de présentation » désignait autre chose. */
          <Champ label="Durée de l'exclusivité (jours)">
            <input className="mi" value={dExclu} disabled={locked} inputMode="numeric" onChange={(e) => setDExclu(e.target.value)} />
          </Champ>
        )}
        {exclu === "Exclusif" && (
          /* Retour #195 : en exclusif l'exclusivité court sur toute la durée du
             mandat, mais le mandant peut la lever seule — par courriel ou
             recommandé — à compter de cette date, sans mettre fin au mandat,
             qui se poursuit alors en mandat simple. Trois mois par défaut,
             plafond légal de l'irrévocabilité. */
          <Champ label="Exclusivité révocable à compter du">
            <input className="mi" type="date" value={revoc} disabled={locked}
              onChange={(e) => setRevoc(e.target.value)} />
          </Champ>
        )}
        <Champ label="Fin du mandat">
          <input className="mi gris" readOnly value={fin ? fin.toLocaleDateString("fr-FR") : "—"} />
        </Champ>
      </div>

      <div className="mdt-sub">Publication en ligne</div>
      <button type="button" className={`mdt-web${web ? " on" : ""}`} disabled={locked} onClick={() => setWeb((v) => !v)}>
        <span className="sw"><i /></span>
        <span className="tx">
          <b>{web ? "Le bien sera diffusé en ligne" : "Diffusion en ligne retirée"}</b>
          <span>
            {web
              ? "Site France Immeuble, portails et fichier acquéreurs. L'annonce ne porte ni l'identité du mandant, ni celle des occupants."
              : "Commercialisation confidentielle : fichier acquéreurs uniquement, aucune annonce publiée. L'article 6.4 du mandat le stipule noir sur blanc."}
          </span>
        </span>
      </button>

      {!locked && (
        <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={save} onAnnuler={annuler}>
          {modifie
            ? "Ces réglages réécrivent les articles du mandat — modifications non enregistrées"
            : "Ces réglages réécrivent les articles du mandat"}
        </BarreEnregistrer>
      )}
    </>
  );
}

/* ---------------------------------------------------- Onglet 5 · Envoi */

function OngletEnvoi({
  m, mandants, trous, agent, mandatId, immeubleId, onAller,
}: {
  m: Record<string, unknown>;
  mandants: Mandant[];
  trous: { cle: string; label: string; onglet: string }[];
  agent: { name: string } | null;
  mandatId: string; immeubleId: string;
  onAller: (t: Tab) => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [pdf, setPdf] = useState(S(m.pdf_mandat) || "");
  const [dateSig, setDateSig] = useState(dateInput(m.date_signature) || new Date().toISOString().slice(0, 10));
  /* Retour #198 : le numéro de registre s'attribue AVANT la génération. Un
     mandat imprimé sans numéro ne peut pas être inscrit au registre après
     coup sans y faire un trou — et le registre sans trou est le premier point
     qu'un contrôle Hoguet regarde. */
  const sansNumero = !S(m.numero);
  const pret = trous.length === 0 && !sansNumero;
  const envoye = S(m.date_last_envoi);
  const signe = !!S(m.date_signature);
  const destinataires = mandants.map((x) => x.email).filter(Boolean) as string[];

  const generer = () =>
    start(async () => {
      setMsg(null);
      const r = await genererMandat(immeubleId, mandatId);
      if (r.ok) { setPdf(r.url); setMsg(`Mandat généré (${r.ko} Ko).`); }
      else setMsg(`Échec : ${r.message}`);
    });

  return (
    <>
      <Titre
        titre="Envoi et signature"
        aide="La dernière étape : on génère le mandat depuis les données saisies, on le relit, on l'envoie à signer, puis on classe l'exemplaire signé."
      />

      {/* --- Étape 0 : le contrôle des pièces --- */}
      <div className={`mdt-etape${pret ? " ok" : " ko"}`}>
        <span className="n">1</span>
        <div className="c">
          <b>{pret ? "Dossier complet" : `${trous.length} élément${trous.length > 1 ? "s" : ""} manquant${trous.length > 1 ? "s" : ""}`}</b>
          {pret ? (
            <span>Toutes les pièces obligatoires sont au dossier et les données de rédaction sont saisies.</span>
          ) : (
            <>
              <span>Le mandat ne peut pas être généré tant que ces éléments manquent :</span>
              <ul className="mdt-trous">
                {trous.map((t) => (
                  <li key={t.cle}>
                    {t.label}
                    <button type="button" onClick={() => onAller(t.onglet as Tab)}>→ {t.onglet}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* --- Étape 1 : génération --- */}
      <div className={`mdt-etape${pdf ? " ok" : pret ? "" : " off"}`}>
        <span className="n">2</span>
        <div className="c">
          <b>Générer le mandat</b>
          <span>
            Le document est rédigé à partir de tout ce qui précède : parties, désignation depuis l&apos;état
            locatif, prix, durées, publication en ligne. {S(m.numero) ? `Il portera le numéro ${S(m.numero)}.` : ""}
          </span>
          {sansNumero && (
            <span className="er">
              Attribuez d&apos;abord un numéro au registre des mandats — bouton « Attribuer un numéro »
              en haut de l&apos;écran. Le numéro est séquentiel et sans trou : il se réserve avant la
              génération, jamais après.
            </span>
          )}
          <div className="mdt-btns">
            <Link className="mdt-btn" href={`/bien/${immeubleId}/mandat/${mandatId}/imprimer`} target="_blank">
              Prévisualiser
            </Link>
            <button className="mdt-go" type="button" disabled={!pret || pending} onClick={generer}>
              <span className="ch">›</span> {pending ? "Génération…" : pdf ? "Regénérer le PDF" : "Générer le PDF"}
            </button>
            {pdf && <a className="mdt-btn" href={pdf} target="_blank" rel="noreferrer">Télécharger</a>}
          </div>
          {msg && <span className={msg.startsWith("Échec") ? "er" : "okmsg"}>{msg}</span>}
        </div>
      </div>

      {/* --- Étape 2 : signature --- */}
      <div className={`mdt-etape${envoye ? " ok" : pdf ? "" : " off"}`}>
        <span className="n">3</span>
        <div className="c">
          <b>Envoyer à la signature</b>
          <span>
            Signataires : {mandants.length > 1 ? "les mandants" : "le mandant"} ({mandants.map(nomMandant).join(", ") || "à renseigner"}),
            Marc-Antoine VOCI en qualité de président{agent?.name && agent.name !== "Marc-Antoine VOCI" ? `, et ${agent.name} pour la rédaction` : ""}.
          </span>
          {destinataires.length === 0 && (
            <span className="er">Aucune adresse e-mail sur les mandants — renseignez-les depuis leur fiche contact.</span>
          )}
          <div className="mdt-btns">
            <button className="mdt-go" type="button" disabled={!pdf || pending}
              onClick={() => start(async () => { await envoyerMandatSignature(mandatId, immeubleId, destinataires); setMsg("Envoi journalisé."); })}>
              <span className="ch">›</span> Envoyer par Docusign
            </button>
          </div>
          {envoye && <span className="okmsg">Dernier envoi le {dmy(m.date_last_envoi)}{destinataires.length ? ` à ${destinataires.join(", ")}` : ""}.</span>}
          <span className="mdt-hint">
            Le connecteur Docusign n&apos;est pas encore ouvert sur cet environnement : l&apos;app prépare le dossier
            et journalise l&apos;envoi, la mise à la signature se fait depuis Docusign. Le retour de signature se
            constate ci-dessous.
          </span>
        </div>
      </div>

      {/* --- Étape 3 : retour de signature --- */}
      <div className={`mdt-etape${signe ? " ok" : envoye ? "" : " off"}`}>
        <span className="n">4</span>
        <div className="c">
          <b>Retour de signature</b>
          {signe ? (
            <span>
              Mandat signé le {dmy(m.date_signature)}. Il est verrouillé : le numéro {S(m.numero)} est
              définitivement inscrit au registre.
            </span>
          ) : (
            <>
              <span>Dès l&apos;exemplaire signé reçu, déposez-le ici : le mandat passe « En cours » et se verrouille.</span>
              <div className="mdt-btns">
                <label className="mdt-ch">
                  <span>Date de signature</span>
                  <input className="mi" type="date" value={dateSig} onChange={(e) => setDateSig(e.target.value)} />
                </label>
                <label className="mdt-up gros">
                  Déposer l&apos;exemplaire signé
                  <input type="file" accept="application/pdf,image/*" disabled={pending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const fd = new FormData();
                      fd.set("file", f);
                      start(async () => {
                        const r = await marquerMandatSigne(mandatId, immeubleId, new Date(dateSig).toISOString(), fd);
                        if (!r.ok) setMsg(`Échec : ${r.message}`);
                      });
                    }} />
                </label>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- Communs */

function Titre({ titre, aide }: { titre: string; aide: string }) {
  return (
    <div className="mdt-titre">
      <h2>{titre}</h2>
      <p>{aide}</p>
    </div>
  );
}

function ReserveBtn({ mandatId, immeubleId }: { mandatId: string; immeubleId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="mdt-go" type="button" onClick={() => setOpen(true)}>
        <span className="ch">›</span> Attribuer un numéro
      </button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Réserver un numéro<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Une fois le numéro réservé, il ne sera <b>plus possible de supprimer le mandat</b> ni de
              modifier le numéro. Le prochain numéro du registre est attribué automatiquement — séquence
              sans trou, registre loi Hoguet.
            </div>
            <div className="modal-f">
              <button className="kgo" type="button" disabled={pending}
                onClick={() => start(async () => { await reserveMandatNumero(mandatId, immeubleId); setOpen(false); })}>
                <span className="ch">›</span> Réserver le numéro
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CancelBtn({ mandatId, immeubleId }: { mandatId: string; immeubleId: string }) {
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <button className="mdt-x" type="button" onClick={() => setOpen(true)}>✕ Annuler le mandat</button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Annuler le mandat<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Motif de l&apos;annulation</span>
              <input className="min" value={motif} onChange={(e) => setMotif(e.target.value)}
                placeholder="ex. Vendeur ne souhaite plus vendre" />
            </div>
            <div className="modal-f">
              <button className="kgo" type="button" disabled={pending || !motif.trim()}
                style={pending || !motif.trim() ? { opacity: 0.5 } : undefined}
                onClick={() => start(async () => { await cancelMandat(mandatId, immeubleId, motif); setOpen(false); })}>
                <span className="ch">›</span> Confirmer l&apos;annulation
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
