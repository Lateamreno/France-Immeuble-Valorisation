/* Ce qui manque avant de générer le dossier de vente (retours #182 et #204).
 *
 * MAV, #182 : « dans la page dossier ce serait bien qu'il dise aussi ce qui
 * semble incomplet comme dans le BO d'origine. Chaque bouton permet d'aller à
 * la page concernée, mais pour nous ce serait bien que ce soit des menus
 * déroulants qui permettent directement de remplir ce qu'on a oublié — et que
 * ça modifie dans les pages concernées du bien, bien entendu. »
 *
 * MAV, #204 : « à chaque fois il faut que tu mettes les liens qui permettent de
 * remplir, sinon on n'a pas forcément l'info. Laisse toujours une ligne par
 * chose à remplir et tu mets toujours l'info et le lien qui correspond. […] Ne
 * laisse pas l'agent générer le dossier tant que toutes les informations
 * contenues dans le dossier ne sont pas remplies. »
 *
 * D'où deux notions distinctes, qu'il ne faut pas confondre :
 *
 *   · BLOQUANT — le dossier ne part pas. Depuis #204 ce n'est plus seulement
 *     « le dossier serait faux » mais « le dossier serait troué » : chaque
 *     rubrique imprimée doit avoir sa donnée, quitte à ce que la donnée soit
 *     « non communiqué ». Un DPE vide et un DPE « n.c. » ne disent pas la même
 *     chose — le premier est un oubli, le second une information.
 *   · MANQUANT — le dossier sort quand même, mais moins bien. Les photos en
 *     sont l'exemple : « si on n'a pas au moins 8 photos à afficher ça
 *     n'empêche pas de générer le dossier mais c'est moins beau. »
 *
 * Chaque manque sait où il se remplit : soit sur place (`champs`), soit dans
 * une section de la fiche qu'on ouvre d'un clic. Et depuis #204, chaque champ
 * qui se cherche ailleurs porte le lien qui va le chercher.
 */

import { estFacadeRue } from "./facade";
import { MOTIFS_VENTE, PROFILS_CONTACT, TENSIONS_LOCATIVES } from "@/lib/referentiels";
import { MOYENS, POINTS, itineraireGoogle, libelleItineraire } from "@/lib/bo/itineraire";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Le nombre de photos en dessous duquel le dossier fait pauvre. */
export const PHOTOS_ATTENDUES = 8;

/** Le libellé de la ligne de charge qui porte la taxe foncière. */
export const LIGNE_TAXE_FONCIERE = "Taxe Foncière";

/**
 * Le lien qui permet d'aller CHERCHER l'information (retour #204).
 *
 * Une case vide sans mode d'emploi reste vide : l'agent ne sait pas forcément
 * combien de minutes le supermarché est à pied, ni sous quelle référence la
 * parcelle est cadastrée. Le lien répond à la question sans quitter l'écran.
 */
export type LienSource = {
  href: string;
  label: string;
  /** À copier au presse-papier avant d'ouvrir : le cadastre n'a pas de
   *  recherche par URL, il faut coller l'adresse dans son formulaire. */
  copier?: string;
};

/** Un champ qu'on peut remplir sans quitter la page. */
export type ChampManquant = {
  cle: string;
  label: string;
  /** Liste fermée : la saisie se fait au menu déroulant. */
  options?: string[];
  unite?: string;
  valeur?: string;
  /** Où trouver la réponse (retour #204). */
  lien?: LienSource;
};

export type Manque = {
  cle: string;
  /** Ce qui s'affiche en tête de ligne. */
  titre: string;
  bloquant: boolean;
  /** La section de la fiche où le sujet vit. */
  section: string;
  /** Ce qu'on peut remplir directement, sans bouger. */
  champs: ChampManquant[];
  /** Précision affichée sous le titre quand elle aide. */
  detail?: string;
  /** Lien commun à toute la rubrique, quand aucun champ ne se saisit ici. */
  lien?: LienSource;
};

export type SourceCompletude = {
  im: Record<string, unknown>;
  lots: Record<string, unknown>[];
  parcelles: Record<string, unknown>[];
  photos: { type?: string }[];
  secteur: Record<string, unknown> | null;
  estimations: Record<string, unknown>[];
  /* Ajoutés par #204 : le dossier imprime aussi les charges, l'état technique
     et le profil du vendeur. Optionnels — un appelant qui ne les fournit pas
     (un test, un écran partiel) obtient simplement moins de lignes, jamais une
     erreur. */
  charges?: Record<string, unknown>[];
  composants?: Record<string, unknown>[];
  proprietaire?: Record<string, unknown> | null;
  /* Le code INSEE de la commune (retour #216). La fiche ne le porte pas : il
     se résout par /api/insee, donc de façon asynchrone, donc hors de cette
     fonction qui doit rester pure. L'écran le cherche et le passe ici ; sans
     lui, le lien du tensiomètre retombe sur la recherche, comme avant. */
  insee?: string;
};

/* --- Les liens, fabriqués depuis l'adresse du bien ------------------------ */

const adresseDe = (im: Record<string, unknown>) =>
  [S(im.adresse_numero_rue), S(im.adresse_rue), S(im.adresse_zipcode), S(im.adresse_ville)]
    .filter(Boolean).join(" ").trim();

/* L'itinéraire lui-même vit dans lib/bo/itineraire.ts (retour #215) : l'onglet
   Emplacement pose la même question et doit ouvrir exactement le même lien. */

/* Le tensiomètre LOCservice range ses pages par code INSEE
   (tensiometre-33063.html pour Bordeaux). Retour #216 : « le lien du
   tensiomètre n'est pas dirigé comme celui dans emplacement, il faudrait qu'il
   dirige vers la ville du bien ». Il le fait maintenant dès que l'écran a
   résolu le code ; sans code, on retombe sur la recherche en copiant le nom de
   la commune, à coller dans leur champ. */
const lienTension = (im: Record<string, unknown>, insee?: string): LienSource => (
  insee
    ? {
      href: `https://www.locservice.fr/tensiometre/tensiometre-${insee}.html`,
      label: "Tensiomètre LOCservice",
    }
    : {
      href: "https://www.locservice.fr/tensiometre/",
      label: "Tensiomètre LOCservice",
      copier: S(im.adresse_ville) || undefined,
    }
);

/** Le cadastre : pas de recherche par URL, on colle l'adresse dans son écran. */
const lienCadastre = (im: Record<string, unknown>): LienSource => ({
  href: "https://www.cadastre.gouv.fr/scpc/rechercherPlan.do",
  label: "cadastre.gouv",
  copier: adresseDe(im),
});

/** Le DPE d'un bien existant se retrouve dans l'observatoire de l'ADEME. */
const lienDpe = (im: Record<string, unknown>): LienSource => ({
  href: "https://observatoire-dpe-audit.ademe.fr/pub/recherche",
  label: "Observatoire DPE (ADEME)",
  copier: adresseDe(im),
});

/** L'avis de taxe foncière du vendeur, à défaut la simulation. */
const lienTaxe = (im: Record<string, unknown>): LienSource => ({
  href: `https://www.google.com/search?q=${encodeURIComponent(`taxe foncière ${S(im.adresse_ville)} taux`)}`,
  label: "Chercher le taux de la commune",
});

/** L'année de construction : le cadastre la porte, Géoportail l'affiche. */
const lienAnnee = (im: Record<string, unknown>): LienSource => ({
  href: `https://www.geoportail.gouv.fr/carte?c=&l=CADASTRALPARCELS.PARCELLAIRE_EXPRESS`,
  label: "Géoportail — parcelles",
  copier: adresseDe(im),
});

/**
 * Le relevé des manques, dans l'ordre où on les corrige.
 *
 * On ne signale que ce qui est VRAIMENT absent : un immeuble complet ne doit
 * afficher aucune ligne, sinon la liste devient un décor qu'on n'ouvre plus.
 */
export function manquesDossier(b: SourceCompletude): Manque[] {
  const im = b.im;
  const out: Manque[] = [];

  /* --- L'estimation : c'est elle qui porte le prix et l'analyse --- */
  const estimee = b.estimations.length > 0 || N(im.prix_hai) !== undefined;
  if (!estimee) {
    out.push({
      cle: "estimation", titre: "L'estimation n'est pas faite", bloquant: true,
      section: "estimations", champs: [],
      detail: "Le dossier reprend le prix et l'analyse de l'estimation.",
    });
  }

  /* --- Le vendeur : son profil et sa raison de vendre (retour #204) -------
     Deux cases que le dossier imprime en page 7 et que « souvent on ne remplit
     pas ». Elles ne se devinent pas : elles se demandent au vendeur. Elles
     bloquent donc, comme MAV le demande. Le profil vit sur la fiche du
     propriétaire, le motif sur celle de l'immeuble — on les présente ensemble
     parce que c'est la même conversation. */
  const vendeur: ChampManquant[] = [];
  const profil = S(b.proprietaire?.profil) || S(im.profil_vendeur);
  if (!profil) {
    /* Champ libre, comme sur la fiche du propriétaire : le BO contient des
       profils que nulle liste fermée ne prévoit (« retraité qui arbitre »,
       « indivision successorale »). Les valeurs courantes servent d'exemple. */
    vendeur.push({
      cle: "profil_vendeur", label: "Profil du vendeur",
      valeur: PROFILS_CONTACT.slice(0, 3).join(", ") + "…",
    });
  }
  if (!S(im.Motif_vente)) {
    vendeur.push({ cle: "Motif_vente", label: "Raison de la vente", options: [...MOTIFS_VENTE] });
  }
  if (vendeur.length) {
    out.push({
      cle: "vendeur", titre: "Le vendeur n'est pas qualifié", bloquant: true,
      section: "proprietaire", champs: vendeur,
      detail: "Le dossier les imprime en conditions de vente : elles se demandent au vendeur.",
    });
  }

  /* --- L'emplacement : gare, commerces, tension -------------------------
     Retour #214 : « tu demandes le commerce le plus proche mais il faut mettre
     le nom et la distance en min, et dire si c'est à pied ou en voiture ». Le
     moyen de locomotion existait déjà sur la fiche (`emp_*_moyen`, saisi dans
     l'onglet Emplacement) mais cette liste ne le réclamait pas : le dossier
     imprimait « 8 min » sans dire de quoi. Trois cases par point d'intérêt,
     donc, et le lien d'itinéraire les remplit toutes les trois d'un coup. */
  /* Retour #218 : « il manquait les infos sur les distances avec les points
     d'intérêt (bus, axes routiers et autres), ce qui n'aurait pas dû être
     possible avant de générer le dossier ». Seuls les trains et les commerces
     étaient réclamés, alors que le dossier imprime les six lignes — les quatre
     autres sortaient vides. La rubrique devient donc bloquante, comme les
     autres pages que le document imprime en toutes lettres. */
  const emp: ChampManquant[] = [];
  for (const p of POINTS) {
    const moyen = S(im[`emp_${p.cle}_moyen`]) || "à pied";
    const lien: LienSource = {
      href: itineraireGoogle(im, S(im[`emp_${p.cle}_name`]) || p.cherche, {
        geo: im[`emp_${p.cle}_geo`], moyen,
      }),
      label: libelleItineraire(moyen),
    };
    if (!S(im[`emp_${p.cle}_name`])) emp.push({ cle: `emp_${p.cle}_name`, label: `${p.court} — le plus proche`, lien });
    if (N(im[`emp_${p.cle}_time`]) === undefined) emp.push({ cle: `emp_${p.cle}_time`, label: `${p.court} — durée`, unite: "min", lien });
    if (!S(im[`emp_${p.cle}_moyen`])) emp.push({ cle: `emp_${p.cle}_moyen`, label: `${p.court} — à pied ou en voiture`, options: [...MOYENS] });
  }
  if (!S(im.emp_tension_locative)) {
    emp.push({
      cle: "emp_tension_locative", label: "Tension locative",
      options: [...TENSIONS_LOCATIVES], lien: lienTension(im, b.insee),
    });
  }
  if (emp.length) {
    out.push({
      cle: "emplacement", titre: "L'emplacement semble incomplet", bloquant: true,
      section: "emplacement", champs: emp,
      detail: "Le dossier imprime les six points d'intérêt : une ligne vide se lit comme un oubli.",
    });
  }

  /* --- Le terrain : parcelle et superficie --- */
  const terrain: ChampManquant[] = [];
  const cadastre = lienCadastre(im);
  if (b.parcelles.length === 0) terrain.push({ cle: "ref_cadastre", label: "Référence cadastrale", lien: cadastre });
  if (N(im.ter_surface) === undefined) terrain.push({ cle: "ter_surface", label: "Surface du terrain", unite: "m²", lien: cadastre });
  if (terrain.length) {
    out.push({
      cle: "terrain", titre: "Le terrain semble incomplet", bloquant: false,
      section: "emplacement", champs: terrain,
      detail: "La référence saisie ici s'ajoute aux parcelles de la fiche.",
    });
  }

  /* --- L'état locatif : ça ne se remplit pas en trois cases --- */
  if (b.lots.length === 0) {
    out.push({
      cle: "lots", titre: "L'état locatif est vide", bloquant: true,
      section: "locatif", champs: [],
      detail: "Le dossier décrit les lots un par un : sans eux, il n'a rien à dire.",
    });
  } else {
    const sansSurface = b.lots.filter((l) => N(l.surface_carrez) === undefined).length;
    if (sansSurface > 0) {
      out.push({
        cle: "surfaces", titre: "L'état locatif semble incomplet", bloquant: false,
        section: "locatif", champs: [],
        detail: `${sansSurface} lot${sansSurface > 1 ? "s sont" : " est"} sans surface Carrez.`,
      });
    }

    /* Le DPE (retour #204) : « il faut qu'on écrive au moins non communiqué ».
       Une lettre vide laisse un trou dans le tableau du dossier ; « n.c. » est
       une réponse, et elle suffit. On bloque donc sur le vide, jamais sur
       « n.c. ». Le tableau des lots est le seul endroit où ça se saisit. */
    const sansDpe = b.lots.filter((l) => !S(l.Type_dpe).trim()).length;
    if (sansDpe > 0) {
      out.push({
        cle: "dpe", titre: "Des lots n'ont pas de DPE", bloquant: true,
        section: "locatif", champs: [], lien: lienDpe(im),
        detail: `${sansDpe} lot${sansDpe > 1 ? "s" : ""} sans lettre. Si le diagnostic n'existe pas, choisissez « n.c. » : c'est une réponse, le vide n'en est pas une.`,
      });
    }
  }

  /* --- Les charges : la taxe foncière (retour #204) ---------------------- */
  const tf = (b.charges ?? []).find((c) => S(c.Type_charge) === LIGNE_TAXE_FONCIERE);
  if (N(tf?.total_an) === undefined) {
    out.push({
      cle: "taxe", titre: "La taxe foncière n'est pas renseignée", bloquant: true,
      section: "locatif", champs: [
        { cle: "taxe_fonciere", label: "Taxe foncière", unite: "€/an", lien: lienTaxe(im) },
      ],
      detail: "Le dossier la porte au bilan de charges : sans elle, la rentabilité nette est fausse.",
    });
  }

  /* --- L'état technique : année et matériaux (retour #204) --------------- */
  if (N(im.year_constru) === undefined) {
    out.push({
      cle: "annee", titre: "L'année de construction manque", bloquant: true,
      section: "technique", champs: [
        { cle: "year_constru", label: "Année de construction", lien: lienAnnee(im) },
      ],
    });
  }
  const composants = b.composants ?? [];
  const sansMateriau = composants.filter((c) => !S(c["Type_matériau"]).trim()).length;
  if (composants.length > 0 && sansMateriau > 0) {
    out.push({
      cle: "materiaux", titre: "Des composants n'ont pas de matériau", bloquant: true,
      section: "technique", champs: [],
      detail: `${sansMateriau} composant${sansMateriau > 1 ? "s" : ""} sur ${composants.length}. Le dossier décrit le bâti composant par composant.`,
    });
  }

  /* --- Les prix du secteur : le dossier les compare au bien --- */
  const sect = b.secteur ?? {};
  if (N(sect["0 - prix"]) === undefined && N(sect["0 - loyer_mois"]) === undefined) {
    out.push({
      cle: "secteur", titre: "Les prix du secteur ne sont pas renseignés", bloquant: false,
      section: "emplacement", champs: [],
      detail: "Sans eux, le dossier ne peut pas situer le bien dans son marché.",
    });
  }

  /* --- Les photos : jamais bloquantes, souvent décisives --- */
  /* La façade Street View ne compte pas : c'est un repère provisoire, elle ne
     part pas dans le dossier et doit être remplacée par une vraie photo. */
  if (estFacadeRue(im.photo_main_compressed)) {
    out.push({
      cle: "facade-rue", titre: "La photo du bien est une façade Google", bloquant: false,
      section: "photos", champs: [],
      detail: "Elle sert de repère dans l'outil mais ne part pas dans le dossier : déposez une vraie photo.",
    });
  }
  const utiles = b.photos
    .filter((p) => !["Cadastre", "Carte", "Vue de rue"].includes(S(p.type))).length;
  if (utiles < PHOTOS_ATTENDUES) {
    out.push({
      cle: "photos", titre: "Les photos semblent insuffisantes", bloquant: false,
      section: "photos", champs: [],
      detail: `${utiles} photo${utiles > 1 ? "s" : ""} sur les ${PHOTOS_ATTENDUES} qui font un beau dossier.`,
    });
  }

  return out;
}

/** Ce qui interdit de générer : la liste, vide quand tout va bien. */
export const bloquants = (m: Manque[]) => m.filter((x) => x.bloquant);
