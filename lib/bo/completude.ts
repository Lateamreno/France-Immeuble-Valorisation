/* Ce qui manque avant de générer le dossier de vente (retour #182).
 *
 * MAV : « dans la page dossier ce serait bien qu'il dise aussi ce qui semble
 * incomplet comme dans le BO d'origine. Chaque bouton permet d'aller à la page
 * concernée, mais pour nous ce serait bien que ce soit des menus déroulants
 * qui permettent directement de remplir ce qu'on a oublié — et que ça modifie
 * dans les pages concernées du bien, bien entendu. »
 *
 * D'où deux notions distinctes, qu'il ne faut pas confondre :
 *
 *   · BLOQUANT — sans ça, le dossier serait faux : pas de prix, pas de lots.
 *   · MANQUANT — le dossier sort quand même, mais moins bien. Les photos en
 *     sont l'exemple : « si on n'a pas au moins 8 photos à afficher ça
 *     n'empêche pas de générer le dossier mais c'est moins beau. »
 *
 * Chaque manque sait où il se remplit : soit sur place (`champs`), soit dans
 * une section de la fiche qu'on ouvre d'un clic.
 */

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Le nombre de photos en dessous duquel le dossier fait pauvre. */
export const PHOTOS_ATTENDUES = 8;

/** Un champ qu'on peut remplir sans quitter la page. */
export type ChampManquant = {
  cle: string;
  label: string;
  /** Liste fermée : la saisie se fait au menu déroulant. */
  options?: string[];
  unite?: string;
  valeur?: string;
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
};

export type SourceCompletude = {
  im: Record<string, unknown>;
  lots: Record<string, unknown>[];
  parcelles: Record<string, unknown>[];
  photos: { type?: string }[];
  secteur: Record<string, unknown> | null;
  estimations: Record<string, unknown>[];
};

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

  /* --- L'emplacement : adresse géocodée, gare, commerces, tension --- */
  const emp: ChampManquant[] = [];
  if (!S(im.emp_gare_name)) emp.push({ cle: "emp_gare_name", label: "Transports les plus proches" });
  if (N(im.emp_gare_time) === undefined) emp.push({ cle: "emp_gare_time", label: "Temps à pied", unite: "min" });
  if (!S(im.emp_com_name)) emp.push({ cle: "emp_com_name", label: "Commerces les plus proches" });
  if (N(im.emp_com_time) === undefined) emp.push({ cle: "emp_com_time", label: "Temps à pied", unite: "min" });
  if (!S(im.emp_tension_locative)) {
    emp.push({
      cle: "emp_tension_locative", label: "Tension locative",
      options: ["Faible", "Modérée", "Forte", "Très forte"],
    });
  }
  if (emp.length) {
    out.push({
      cle: "emplacement", titre: "L'emplacement semble incomplet", bloquant: false,
      section: "emplacement", champs: emp,
    });
  }

  /* --- Le terrain : parcelle et superficie --- */
  const terrain: ChampManquant[] = [];
  if (b.parcelles.length === 0) terrain.push({ cle: "ref_cadastre", label: "Référence cadastrale" });
  if (N(im.ter_surface) === undefined) terrain.push({ cle: "ter_surface", label: "Surface du terrain", unite: "m²" });
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
  const utiles = b.photos.filter((p) => !["Cadastre", "Carte"].includes(S(p.type))).length;
  if (utiles < PHOTOS_ATTENDUES) {
    out.push({
      cle: "photos", titre: "Les photos semblent insuffisantes", bloquant: false,
      section: "photos", champs: [],
      detail: `${utiles} photo${utiles > 1 ? "s" : ""} sur les ${PHOTOS_ATTENDUES} qui font un beau dossier.`,
    });
  }

  return out;
}
