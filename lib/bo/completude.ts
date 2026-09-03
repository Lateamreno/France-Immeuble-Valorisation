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
import { compteAuLot, MOTIFS_VENTE, PROFILS_CONTACT, TENSIONS_LOCATIVES } from "@/lib/referentiels";
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
  /**
   * Une seconde case, à droite de la première (retour #304).
   *
   * MAV : « pour les distances tu n'as pas compris. Le premier, c'est le texte
   * qui correspond à la destination, avec le lien à côté pour aller vérifier.
   * Mais à droite c'est la durée, et à la place du lien tu mets juste le choix
   * déroulant comme dans Emplacement pour dire si c'est à pied, en voiture… et
   * ça remplit donc Emplacement comme si on avait rempli là-bas. »
   *
   * Une durée sans son moyen ne veut rien dire — sept minutes à pied et sept
   * minutes en voiture ne décrivent pas le même quartier. Les deux se
   * saisissent donc ensemble, sur la même ligne, et non sur deux lignes dont
   * l'une pouvait rester vide. Le lien d'itinéraire n'a rien à faire là : il
   * est déjà sur la ligne du nom, juste au-dessus, et il y répond une fois.
   */
  compagnon?: { cle: string; options: string[]; valeur?: string };
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

/** Le PLU : le Géoportail de l'urbanisme sert le règlement de la commune. */
const lienUrbanisme = (im: Record<string, unknown>): LienSource => ({
  href: "https://www.geoportail-urbanisme.gouv.fr/map/",
  label: "Géoportail de l'urbanisme",
  copier: adresseDe(im),
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

  /* --- Le descriptif : la page de présentation du bien (retour #225) -----
     « Que tu m'obliges à remplir le descriptif avant de m'autoriser à rédiger
     le dossier. » C'est le seul texte du document qui ne se déduit de rien : ni
     des lots, ni des charges, ni de l'estimation. Un dossier qui sort sans lui
     a une page blanche là où le lecteur cherche à comprendre le bien. Il ne se
     saisit pas ici — un descriptif ne tient pas dans une case d'une ligne. */
  if (!S(im.descriptif).trim()) {
    out.push({
      cle: "descriptif", titre: "Le descriptif du bien n'est pas rédigé", bloquant: true,
      section: "prix", champs: [],
      detail: "C'est le seul texte du dossier qui ne se déduit d'aucune autre saisie.",
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
    // « Autre » ne se réclame pas : voir lib/bo/itineraire.ts (#234).
    if ("facultatif" in p && p.facultatif) continue;
    const moyen = S(im[`emp_${p.cle}_moyen`]) || "à pied";
    const lien: LienSource = {
      href: itineraireGoogle(im, S(im[`emp_${p.cle}_name`]) || p.cherche, {
        geo: im[`emp_${p.cle}_geo`], moyen,
      }),
      label: libelleItineraire(moyen),
    };
    if (!S(im[`emp_${p.cle}_name`])) emp.push({ cle: `emp_${p.cle}_name`, label: `${p.court} — le plus proche`, lien });
    /* Retour #304 — la durée et le moyen tiennent sur une seule ligne, la
       seconde case remplaçant le lien. La ligne apparaît dès que l'un des deux
       manque : corriger un moyen sans pouvoir relire la durée qu'il qualifie
       n'aurait aucun sens. */
    if (N(im[`emp_${p.cle}_time`]) === undefined || !S(im[`emp_${p.cle}_moyen`])) {
      emp.push({
        cle: `emp_${p.cle}_time`, label: `${p.court} — durée`, unite: "min",
        valeur: S(N(im[`emp_${p.cle}_time`])),
        compagnon: {
          cle: `emp_${p.cle}_moyen`,
          options: [...MOYENS],
          valeur: S(im[`emp_${p.cle}_moyen`]),
        },
      });
    }
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

  /* --- Le terrain et l'urbanisme ------------------------------------------
     Retour #222 : « dans la partie dossier technique il manque quasiment
     toutes les infos sur le PLU, sur les parcelles, il manque la photo du
     cadastre. » Le dossier imprime un bloc en trois colonnes — terrain, plan,
     PLU — qui sortait rempli de « n.c. » parce que rien ne le réclamait. Il
     devient bloquant, comme les autres pages que le document imprime. */
  const terrain: ChampManquant[] = [];
  const cadastre = lienCadastre(im);
  const urba = lienUrbanisme(im);
  if (b.parcelles.length === 0) terrain.push({ cle: "ref_cadastre", label: "Référence cadastrale", lien: cadastre });
  if (N(im.ter_surface) === undefined) terrain.push({ cle: "ter_surface", label: "Surface du terrain", unite: "m²", lien: cadastre });
  /* Retour #241 : « avant de rédiger le dossier il faut aussi que tu m'obliges
     à mettre l'info sur la façade dans la partie parcelle et PLU — là c'est
     indiqué comme vide, c'est pas possible. » */
  if (N(im.ter_facade) === undefined) terrain.push({ cle: "ter_facade", label: "Façade sur rue", unite: "m", lien: cadastre });
  if (!S(im.plu_zone)) terrain.push({ cle: "plu_zone", label: "Zone du PLU", lien: urba });
  /* Retour #235 : « tu m'avais pas demandé le type de zone dans les champs
     obligatoires. » Le dossier l'imprime entre parenthèses après la zone. */
  if (!S(im.plu_Type_zone)) terrain.push({ cle: "plu_Type_zone", label: "Type de zone", lien: urba });
  if (N(im.plu_emprise) === undefined) terrain.push({ cle: "plu_emprise", label: "Emprise au sol max", unite: "%", lien: urba });
  if (N(im.plu_hauteur) === undefined) terrain.push({ cle: "plu_hauteur", label: "Hauteur max", unite: "m", lien: urba });
  if (terrain.length || !S(im.ter_parcelle_img)) {
    out.push({
      cle: "terrain", titre: "Le terrain et l'urbanisme sont incomplets", bloquant: true,
      /* Retour #236 : « quand on clique sur ouvrir la page on tombe sur les
         prix de secteur et pas sur la page parcelle et PLU. » La rubrique
         désigne maintenant son sous-onglet, pas seulement sa section. */
      section: "emplacement:parcelles", champs: terrain,
      /* Le plan de parcelle est une image : il se dépose sur l'onglet
         Parcelles et PLU, pas dans une case de cette liste — d'où le lien vers
         le cadastre, qui est l'endroit où on va le chercher (#236). */
      lien: S(im.ter_parcelle_img) ? undefined : cadastre,
      detail: S(im.ter_parcelle_img)
        ? "Le dossier imprime la parcelle, sa superficie et le PLU."
        : "Il manque aussi le plan de parcelle : ouvrez la page Parcelles et PLU pour le déposer.",
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
    /* Retour #305 — « ici tu indiques que l'état locatif est incomplet et
       qu'il manque des surfaces, mais ce sont des parkings et des caves qui
       n'ont du coup pas de surface. »
       Exact : une cave et une place se comptent au lot et non au m² (#250), et
       l'écran leur BARRE d'ailleurs la case Carrez. Les compter comme des
       manques revenait à réclamer une information que l'application elle-même
       refuse de saisir — une alerte qu'on ne peut pas éteindre est pire
       qu'aucune alerte : on apprend à ne plus les lire. */
    const sansSurface = b.lots.filter(
      (l) => !compteAuLot(S(l.Destination)) && N(l.surface_carrez) === undefined,
    ).length;
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
  /* Retour #238 : « t'as oublié de rendre obligatoire la saisie des éléments
     sur l'état constructif du bien. » La règle ne se déclenchait que si des
     composants existaient DÉJÀ : une fiche qui n'en avait aucun passait sans
     rien dire, et le dossier sortait avec « Aucun composant renseigné » en
     toutes lettres — le pire des deux mondes. */
  const composants = b.composants ?? [];
  const sansMateriau = composants.filter((c) => !S(c["Type_matériau"]).trim()).length;
  if (composants.length === 0) {
    out.push({
      cle: "materiaux", titre: "L'état constructif n'est pas renseigné", bloquant: true,
      section: "technique", champs: [],
      detail: "Le dossier décrit le bâti composant par composant : toiture, façade, menuiseries…",
    });
  } else if (sansMateriau > 0) {
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
