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
  destinations?: string[];
  cibles?: string[];
};

export type FiltresMatch = {
  /** Grades acquéreur retenus (A, B, C, D). Vide = tous. */
  notes: string[];
  /** Exclure les recherches à qui l'immeuble a déjà été proposé. */
  exclureDejaVus: boolean;
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
  const villes = arr(r.villes).filter(estLisible).map((v) => v.toLowerCase());
  const dpts = arr(r.dpts).filter((d) => /^\d{2,3}[AB]?$/.test(d)).map((v) => v.replace(/^0/, ""));
  if (villes.length === 0 && dpts.length === 0) return true;
  const ville = (c.ville ?? "").toLowerCase();
  const dpt = (c.departement ?? "").replace(/^0/, "");
  if (ville && villes.some((v) => v === ville || v.includes(ville) || ville.includes(v))) return true;
  if (dpt && dpts.includes(dpt)) return true;
  return false;
}

/** Une liste vide côté acquéreur vaut « tout accepté ». */
const listeOk = (attendues: string[], proposees: string[] | undefined) =>
  attendues.length === 0 || !proposees || proposees.length === 0 ||
  attendues.some((a) => proposees.some((p) => p.toLowerCase() === a.toLowerCase()));

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

/** Applique les critères et les filtres de campagne à un lot de recherches. */
export function matcher(
  recherches: Record<string, unknown>[],
  contacts: Map<string, Record<string, unknown>>,
  bien: CriteresBien,
  filtres: FiltresMatch,
): Acquereur[] {
  const retenues = recherches.filter((r) => {
    if (r.archived === true || r.standby === true) return false;

    // Filtres de campagne
    if (filtres.notes.length > 0 && filtres.notes.length < 4) {
      if (!filtres.notes.includes(S(r.Note))) return false;
    }
    if (filtres.exclureDejaVus && arr(r.IMMEUBLEs_proposed).includes(bien.immeubleId)) return false;
    if (arr(r.IMMEUBLES_hidden).includes(bien.immeubleId)) return false;
    if (filtres.exclureAgents && r.agent === true) return false;
    if (filtres.mandatObligatoire && arr(r.MANDATs).length === 0) return false;

    // Critères de la recherche
    if (!dansFourchette(bien.prix, r.prix_min, r.prix_max)) return false;
    if (!dansFourchette(bien.surface, r.surface_min, r.surface_max)) return false;
    if (!dansFourchette(bien.occupation, r.occup_min, r.occup_max)) return false;
    if (nb(r.renta) !== undefined && bien.renta !== undefined && bien.renta < nb(r.renta)!) return false;
    if (!geoOk(r, bien)) return false;
    if (!listeOk(bien.destinations ?? [], arr(r.Destinations))) return false;
    if (bien.cibles && bien.cibles.length > 0 && S(r.Cible) && !bien.cibles.includes(S(r.Cible))) return false;
    return true;
  });

  return retenues.map((r) => carte(r, contacts, true));
}

/** Construit la carte acquéreur affichée dans les résultats. */
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
  const dpts = arr(r.dpts).filter((d) => /^\d{2,3}[AB]?$/.test(d));
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
