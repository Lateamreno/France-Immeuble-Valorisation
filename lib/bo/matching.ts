import { memeVille } from "./villes";

// Moteur de matching acquéreurs — croise les caractéristiques d'un immeuble
// avec les recherches enregistrées par les acquéreurs, comme le fait le BO :
// critères bornés (prix, surface, occupation, rentabilité), géographie,
// destination et cible, puis filtres de campagne (grades, déjà proposés,
// agents, mandat obligatoire).
//
// Une recherche dont un critère n'est pas renseigné ne l'oppose pas : côté
// acquéreur, un champ vide veut dire « pas d'exigence », pas « zéro ».

export type CriteresBien = {
  immeubleId: string;
  prix?: number;
  surface?: number;
  occupation?: number;
  renta?: number;
  travaux?: number;
  ville?: string;
  departement?: string;
  /** TOUTES les destinations présentes dans l'immeuble, pas seulement la
   *  principale : un immeuble d'habitation avec un commerce au pied intéresse
   *  celui qui cherche du commerce, et gêne celui qui n'en veut pas (#332). */
  destinations?: string[];
  /** La région du bien, pour les exclusions géographiques (#332). */
  region?: string;
  cibles?: string[];
  /** Les loyers annuels POTENTIELS (un lot vide compte pour son loyer HC max)
   *  et les surfaces, destination par destination — la règle « pro » du
   *  02/11 en a besoin. Absents, la règle ne tranche que sur les logements. */
  repartition?: {
    revenus: Record<string, number>;
    surfaces: Record<string, number>;
    /** Un lot typé (hors caves, parkings, annexes) n'a ni loyer ni loyer
     *  max : les loyers ne disent pas la vraie répartition, on passe à la
     *  surface (MAV, 12/11). */
    loyersIncomplets?: boolean;
  };
};

/* Les destinations « pro » d'une recherche (MAV, 02/11). */
const PRO = ["commerce", "bureau", "logistique"];
const HABITATION = "logement";
/* Ni une typologie ni un revenu de typologie (MAV, 02/11 : « les parkings et
   caves ne comptent pas pour le calcul ») : ils sortent des 50 %, en haut
   comme en bas de la fraction. L'annexe suit le même sort. */
const HORS_CALCUL = ["cave", "parking", "annexe"];
/* Les seuils de MAV (12/11), en part des loyers potentiels :
   - une recherche qui coche le logement le reçoit par lui s'il fait au moins
     20 % de l'immeuble (40 % d'abord, ramené à 20 % le jour même) ;
   - une recherche « pro » seulement accepte au plus 20 % de logement (« à 21
     déjà c'est trop »), et ses types doivent faire ENSEMBLE au moins la
     moitié : « commerce + entrepôt » face à 40 % de commerce et 10 %
     d'entrepôt, c'est 50 %, ça passe.
   À 20 % pile, les deux publics le reçoivent. */
const SEUIL_LOGEMENT = 0.2;
const PLAFOND_LOGEMENT_PRO = 0.2;
const SEUIL_PRO = 0.5;
/* Un pourcentage affiché « 20 % » doit passer : on tolère l'arrondi. */
const EPS = 1e-9;

/** Les destinations présentes dans les lots (caves, parkings et annexes à part). */
export function destinationsDesLots(rep: CriteresBien["repartition"]): string[] {
  if (!rep) return [];
  return [...new Set([...Object.keys(rep.surfaces), ...Object.keys(rep.revenus)])]
    .filter((d) => d && !HORS_CALCUL.includes(d.toLowerCase()));
}

/**
 * Le type du bien, c'est son état locatif (MAV, 12/11 : « il n'y a pas de
 * case pour dire quel type d'immeuble c'est, donc c'est toujours déduit de
 * l'état locatif »). Un seul lot de commerce : immeuble commercial ; un lot
 * de bureau : bureaux. La liste `Destinations` de la fiche — un reste de
 * Bubble, figé à la création et différent des lots sur 23 biens actifs — ne
 * sert plus que pour un bien sans lot saisi.
 *
 * Origine : des acquéreurs sans commerce dans leurs critères ont reçu le
 * dossier du 43 bd de Sébastopol (un lot, du commerce), dont la fiche était
 * vide — le matching n'avait aucune contrainte de type.
 */
export function destinationsDu(bien: CriteresBien): string[] {
  const lots = destinationsDesLots(bien.repartition);
  return lots.length > 0 ? lots : (bien.destinations ?? []);
}

/**
 * La part des types cochés dans l'immeuble : loyers potentiels d'abord, à
 * défaut la surface — et la surface d'abord quand un lot n'a pas de loyer
 * (MAV, 12/11). `undefined` quand on ne sait pas (rien de saisi) : on
 * n'écarte pas un bien faute de données.
 */
function partDes(types: string[], rep: CriteresBien["repartition"]): number | undefined {
  if (!rep) return undefined;
  const ordre = rep.loyersIncomplets ? [rep.surfaces, rep.revenus] : [rep.revenus, rep.surfaces];
  for (const m of ordre) {
    const lignes = Object.entries(m).filter(([d]) => !HORS_CALCUL.includes(d.toLowerCase()));
    const total = lignes.reduce((t, [, v]) => t + v, 0);
    if (total > 0) {
      const part = lignes.filter(([d]) => types.includes(d.toLowerCase())).reduce((t, [, v]) => t + v, 0);
      return part / total;
    }
  }
  return undefined;
}

/**
 * La règle des types (MAV, 02/11, seuils du 12/11), en part des loyers
 * potentiels, caves, parkings et annexes mis à part :
 * - une recherche qui coche le logement reçoit l'immeuble si le logement en
 *   fait au moins 20 % ;
 * - une recherche « pro » seulement (commerce, bureaux, logistique, sans
 *   logement) le reçoit si le logement fait au plus 20 % et si ses types
 *   font ensemble au moins la moitié ;
 * - une recherche qui coche le logement ET un type pro le reçoit par l'une
 *   des deux voies ; côté pro, un type en commun suffit (MAV, 12/11 : « sinon
 *   personne ne le reçoit »).
 * Une recherche sans type, ou un bien dont on ne connaît aucun type, ne
 * s'opposent pas.
 */
function typesOk(r: Record<string, unknown>, bien: CriteresBien): boolean {
  const voulues = arr(r.Destinations).map((d) => d.toLowerCase());
  const dests = destinationsDu(bien).map((d) => d.toLowerCase());
  if (voulues.length === 0 || dests.length === 0) return true;
  const communs = voulues.filter((d) => dests.includes(d));
  if (communs.length === 0) return false;
  const partLogement = dests.includes(HABITATION) ? partDes([HABITATION], bien.repartition) : 0;
  if (communs.includes(HABITATION) && (partLogement === undefined || partLogement >= SEUIL_LOGEMENT - EPS)) return true;
  const pro = communs.filter((d) => PRO.includes(d));
  if (pro.length === 0) return false;
  if (voulues.includes(HABITATION)) return true;
  /* Recherche pro seulement. Des logements dont on ne connaît pas la part
     (bien sans lot, fiche « Logement ») : on ne l'envoie pas. */
  if (partLogement === undefined || partLogement > PLAFOND_LOGEMENT_PRO + EPS) return false;
  const part = partDes(pro, bien.repartition);
  return part === undefined || part >= SEUIL_PRO - EPS;
}

/**
 * Ce qu'une recherche refuse (retour #332).
 *
 * Portée par `fi_recherche_exclusion` et jointe à la recherche avant le
 * matching. Absente, elle ne refuse rien.
 */
export type ExclusionsRecherche = {
  destinations: string[];
  villes: string[];
  departements: string[];
  regions: string[];
};

export type FiltresMatch = {
  /** Grades acquéreur retenus (A, B, C, D). Vide = tous. */
  notes: string[];
  /** Exclure les recherches à qui l'immeuble a déjà été proposé. */
  exclureDejaVus: boolean;
  /** Les contacts qui ont déjà une proposition pour l'immeuble, d'où qu'elle
   *  vienne : la marque `IMMEUBLEs_proposed` de la recherche ne suffit pas (une
   *  autre recherche du même acquéreur, une proposition faite à la main). */
  dejaRecus?: string[];
  /** Exclure les recherches créées par des agents (confrères). */
  exclureAgents: boolean;
  /** Ne garder que les acquéreurs ayant signé un mandat de recherche. */
  mandatObligatoire: boolean;
};

export const FILTRES_MATCH_DEFAUT: FiltresMatch = {
  notes: ["A", "B", "C", "D"],
  exclureDejaVus: true,
  exclureAgents: true,
  mandatObligatoire: false,
};

export type Acquereur = {
  rechercheId: string;
  contactId?: string;
  nom: string;
  note?: string;
  email?: string;
  telephone?: string;
  secteur: string;
  cible?: string;
  destinations: string[];
  criteres: string;
  commentaire?: string;
  aContact: boolean;
  aTelephone: boolean;
  aDetails: boolean;
  /** Retenue par les critères, par opposition à ajoutée à la main. */
  auto: boolean;
};

const nb = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const S = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
/** Les listes géo mélangent libellés et identifiants Bubble (« 1570…x62944… ») :
 *  ces derniers n'ont rien à faire ni dans un filtre ni à l'écran. */
const estLisible = (v: string) => !/^\d{13}x\d+$/.test(v);

/** Normalise un numéro français en E.164 (+33…). Renvoie undefined si le
 *  numéro est inexploitable — la base contient des saisies libres. */
export function telE164(brut: unknown): string | undefined {
  const s = S(brut).replace(/[^\d+]/g, "");
  if (!s) return undefined;
  if (s.startsWith("+")) return /^\+\d{8,15}$/.test(s) ? s : undefined;
  if (/^0[1-9]\d{8}$/.test(s)) return `+33${s.slice(1)}`;
  if (/^33[1-9]\d{8}$/.test(s)) return `+${s}`;
  if (/^00\d{8,15}$/.test(s)) return `+${s.slice(2)}`;
  return undefined;
}

/**
 * Le même numéro, tel qu'on l'écrit en France (retour #434) : « 0612345678 »
 * plutôt que « +33612345678 » — MAV : « remets juste les zéros ». L'envoi
 * garde l'E.164, c'est l'écran (et le presse-papiers) qui change ; un numéro
 * étranger reste en international, c'est ainsi qu'on le compose.
 */
export function telAffiche(e164: string): string {
  const m = /^\+33([1-9]\d{8})$/.exec(e164);
  return m ? `0${m[1]}` : e164;
}

const email = (v: unknown) => {
  const s = S(v).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : undefined;
};

/** Un critère borné de la recherche est respecté si la valeur du bien tombe
 *  dans la fourchette. Borne absente = pas d'exigence. */
const dansFourchette = (valeur: number | undefined, min: unknown, max: unknown) => {
  const vmin = nb(min);
  const vmax = nb(max);
  if (vmin === undefined && vmax === undefined) return true;
  if (valeur === undefined) return true;
  if (vmin !== undefined && valeur < vmin) return false;
  if (vmax !== undefined && valeur > vmax) return false;
  return true;
};

/** La géographie matche si la recherche ne cible rien, ou si la ville ou le
 *  département du bien figure dans ses listes. */
function geoOk(r: Record<string, unknown>, c: CriteresBien) {
  const villes = arr(r.villes).filter(estLisible);
  const dpts = arr(r.dpts).filter((d) => /^(?:\d{2,3}|2[AB])$/.test(d)).map((v) => v.replace(/^0/, ""));
  if (villes.length === 0 && dpts.length === 0) return true;
  const dpt = (c.departement ?? "").replace(/^0/, "");
  /* « Saint-Denis (93) » ne vaut que pour Saint-Denis du 93 (MAV, 13/11). */
  if (villes.some((v) => memeVille(v, c.ville, c.departement))) return true;
  if (dpt && dpts.includes(dpt)) return true;
  return false;
}

/** Décrit une recherche en une ligne, comme les cartes du BO. */
function libelleCriteres(r: Record<string, unknown>) {
  const eur = (v: unknown) => (nb(v) !== undefined ? `${Math.round(nb(v)!).toLocaleString("fr-FR")} €` : null);
  const bloc = (label: string, min: unknown, max: unknown, suffixe = "", fmt = (v: unknown) => String(nb(v) ?? "")) => {
    const a = nb(min), b = nb(max);
    if (a === undefined && b === undefined) return null;
    if (a !== undefined && b !== undefined) return `${label} ${fmt(a)} à ${fmt(b)}${suffixe}`;
    if (a !== undefined) return `${label} ≥ ${fmt(a)}${suffixe}`;
    return `${label} ≤ ${fmt(b)}${suffixe}`;
  };
  return [
    bloc("Prix", r.prix_min, r.prix_max, "", (v) => eur(v) ?? "")?.replace(/ €(?= à)/, ""),
    bloc("Surface", r.surface_min, r.surface_max, " m²"),
    bloc("Occupation", r.occup_min, r.occup_max, " %"),
    nb(r.renta) !== undefined ? `Rentabilité ≥ ${nb(r.renta)} %` : null,
  ].filter(Boolean).join(" · ");
}

/**
 * Les critères d'une recherche sont-ils satisfaits par un bien ?
 *
 * Extrait de `matcher` pour servir dans les deux sens : d'un bien vers ses
 * acquéreurs (campagne), et d'une recherche vers les biens qu'on pourrait lui
 * proposer (écran Recherches). Les filtres de campagne restent chez
 * `matcher` : ils décrivent un envoi, pas une correspondance.
 */
/**
 * Les exclusions rejettent-elles ce bien ? (retour #332)
 *
 * Elles s'appliquent APRÈS les critères et tranchent en dernier : c'est tout
 * leur intérêt. Une destination exclue suffit à écarter le bien même si une
 * autre de ses destinations était recherchée — « il veut QUE de l'habitation,
 * on exclut le commerce ».
 */
function exclu(bien: CriteresBien, e: ExclusionsRecherche | undefined): boolean {
  if (!e) return false;
  const bas = (v: string) => v.trim().toLowerCase();
  if (e.destinations.length > 0) {
    const dests = destinationsDu(bien).map(bas);
    if (e.destinations.map(bas).some((x) => dests.includes(x))) return true;
  }
  if (e.villes.length > 0 && bien.ville) {
    if (e.villes.some((x) => memeVille(x, bien.ville, bien.departement))) return true;
  }
  if (e.departements.length > 0 && bien.departement) {
    const d = bien.departement.replace(/^0/, "");
    if (e.departements.map((x) => x.replace(/^0/, "")).includes(d)) return true;
  }
  if (e.regions.length > 0 && bien.region) {
    const g = bas(bien.region);
    if (e.regions.map(bas).includes(g)) return true;
  }
  return false;
}

export function correspond(
  r: Record<string, unknown>,
  bien: CriteresBien,
  exclusions?: ExclusionsRecherche,
): boolean {
  if (!dansFourchette(bien.prix, r.prix_min, r.prix_max)) return false;
  if (!dansFourchette(bien.surface, r.surface_min, r.surface_max)) return false;
  if (!dansFourchette(bien.occupation, r.occup_min, r.occup_max)) return false;
  if (nb(r.renta) !== undefined && bien.renta !== undefined && bien.renta < nb(r.renta)!) return false;
  if (!geoOk(r, bien)) return false;
  if (!typesOk(r, bien)) return false;
  if (bien.cibles && bien.cibles.length > 0 && S(r.Cible) && !bien.cibles.includes(S(r.Cible))) return false;
  if (exclu(bien, exclusions)) return false;
  return true;
}

/** Applique les critères et les filtres de campagne à un lot de recherches. */
export function matcher(
  recherches: Record<string, unknown>[],
  contacts: Map<string, Record<string, unknown>>,
  bien: CriteresBien,
  filtres: FiltresMatch,
  /** Les exclusions par recherche (retour #332), quand l'appelant les a chargées. */
  exclusions?: Map<string, ExclusionsRecherche>,
): Acquereur[] {
  const dejaRecus = new Set(filtres.dejaRecus ?? []);
  const retenues = recherches.filter((r) => {
    if (r.archived === true || r.standby === true) return false;

    /* Filtres de campagne. Les classes cochées sont les seules retenues —
       y compris quand les quatre le sont : une recherche SANS classe n'en
       fait pas partie, comme chez Bubble (22/09). Elle passait ici dès que
       tout était coché, ce qui ajoutait des acquéreurs jamais qualifiés. */
    if (filtres.notes.length > 0) {
      if (!filtres.notes.includes(S(r.Note))) return false;
    }
    if (filtres.exclureDejaVus && arr(r.IMMEUBLEs_proposed).includes(bien.immeubleId)) return false;
    if (filtres.exclureDejaVus && dejaRecus.has(S(r.ACHETEUR))) return false;
    if (arr(r.IMMEUBLES_hidden).includes(bien.immeubleId)) return false;
    /* Un confrère est reconnu par le drapeau de sa recherche OU par sa fiche
       (booléen `agent`, profil « Agent immobilier ») : il ne reçoit les
       dossiers que si l'agent l'a décidé pour cette campagne (24/09). */
    if (filtres.exclureAgents && (r.agent === true || contactEstAgent(contacts.get(S(r.ACHETEUR))))) return false;
    if (filtres.mandatObligatoire && arr(r.MANDATs).length === 0) return false;

    return correspond(r, bien, exclusions?.get(String(r._id)));
  });

  return retenues.map((r) => carte(r, contacts, true));
}

/** Construit la carte acquéreur affichée dans les résultats. */
/** Le contact est-il un agent immobilier ? Même règle que côté serveur. */
export function contactEstAgent(c: Record<string, unknown> | undefined): boolean {
  if (!c) return false;
  return c.agent === true || (Array.isArray(c.Types) && (c.Types as string[]).includes("Agent immobilier"));
}

export function carte(
  r: Record<string, unknown>,
  contacts: Map<string, Record<string, unknown>>,
  auto: boolean,
): Acquereur {
  const c = contacts.get(S(r.ACHETEUR));
  const mail = email(r.email) ?? email(c?.email);
  const tel = telE164(r.phone) ?? telE164(c?.portable) ?? telE164(c?.fixe);
  // Le BO contient des fiches « Inconnu » : l'adresse est alors plus parlante.
  const nomFiche = c ? [S(c["prénom"]), S(c.nom).toUpperCase()].filter(Boolean).join(" ") : "";
  const nom =
    (/^inconnu/i.test(nomFiche) ? "" : nomFiche) ||
    S(c?.entreprise_nom) || mail || S(r.email) || "Acquéreur sans contact";
  const villes = arr(r.villes).filter(estLisible);
  const dpts = arr(r.dpts).filter((d) => /^(?:\d{2,3}|2[AB])$/.test(d));
  return {
    rechercheId: S(r._id),
    contactId: S(r.ACHETEUR) || undefined,
    nom,
    note: S(r.Note) || undefined,
    email: mail,
    telephone: tel,
    secteur: [villes.slice(0, 3).join(", "), dpts.length ? `dpt ${dpts.slice(0, 5).join(", ")}` : ""]
      .filter(Boolean).join(" · ") || "France entière",
    cible: S(r.Cible) || undefined,
    destinations: arr(r.Destinations),
    criteres: libelleCriteres(r),
    commentaire: S(r.commentaire) || undefined,
    aContact: !!c,
    aTelephone: !!tel,
    aDetails: !!S(r.commentaire),
    auto,
  };
}

/** Destinataires dédoublonnés d'une campagne : une adresse et un numéro ne
 *  doivent jamais partir deux fois, même si l'acquéreur a plusieurs
 *  recherches qui matchent. */
export function destinataires(acquereurs: Acquereur[]) {
  const emails = new Map<string, Acquereur>();
  const tels = new Map<string, Acquereur>();
  for (const a of acquereurs) {
    if (a.email && !emails.has(a.email)) emails.set(a.email, a);
    if (a.telephone && !tels.has(a.telephone)) tels.set(a.telephone, a);
  }
  return {
    emails: [...emails.keys()],
    telephones: [...tels.keys()],
    /** Un acquéreur joignable par au moins un canal. */
    joignables: [...new Set([...emails.values(), ...tels.values()])],
  };
}

/** Découpe les numéros en paquets copiables (le BO envoie par 50). */
export function paquets<T>(items: T[], taille = 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += taille) out.push(items.slice(i, i + taille));
  return out;
}

/**
 * Les comptes par grade d'une sélection (retours #422 et #431) : combien
 * d'acquéreurs, d'e-mails et de téléphones distincts derrière chaque lettre —
 * la présentation du BO, à droite du matching.
 */
export type ComptesGrade = { n: number; mails: number; tels: number };
export function comptesParGrade(acquereurs: Acquereur[]): { parGrade: Record<string, ComptesGrade>; total: ComptesGrade } {
  const vide = (): ComptesGrade => ({ n: 0, mails: 0, tels: 0 });
  const parGrade: Record<string, ComptesGrade> = { A: vide(), B: vide(), C: vide(), D: vide(), "": vide() };
  const mails: Record<string, Set<string>> = {};
  const tels: Record<string, Set<string>> = {};
  const tousMails = new Set<string>();
  const tousTels = new Set<string>();
  for (const a of acquereurs) {
    const g = a.note && parGrade[a.note] ? a.note : "";
    parGrade[g].n += 1;
    const m = (a.email ?? "").trim().toLowerCase();
    const t = (a.telephone ?? "").replace(/\s/g, "");
    if (m) { (mails[g] ??= new Set()).add(m); tousMails.add(m); }
    if (t) { (tels[g] ??= new Set()).add(t); tousTels.add(t); }
  }
  for (const g of Object.keys(parGrade)) {
    parGrade[g].mails = mails[g]?.size ?? 0;
    parGrade[g].tels = tels[g]?.size ?? 0;
  }
  return { parGrade, total: { n: acquereurs.length, mails: tousMails.size, tels: tousTels.size } };
}
