/* Recoupement d'une société propriétaire — génération de leads, étape 1.
 *
 * Une SCI n'a ni site ni adresse e-mail. Son gérant, si : une fois sur deux il
 * dirige aussi une société commerciale (mesuré sur 133 SCI ciblées de Paris et
 * de la petite couronne, octobre 2026), et une fois sur trois une vraie
 * entreprise avec des salariés — qui a un site, donc un domaine, donc une
 * adresse qu'on peut trouver. C'est cette porte-là qu'on cherche ici.
 *
 * Méthode, gratuite et sans aucun envoi : l'annuaire des entreprises de l'État
 * donne les dirigeants de la SCI (nom, prénoms, année de naissance) ; on lui
 * redemande toutes les sociétés en activité dirigées par la même personne. Nom,
 * premier prénom et année de naissance écartent la plupart des homonymes, pas
 * tous : l'agent voit la correspondance et juge avant d'écrire.
 *
 * Partagé entre le BO (une fiche à la demande) et le script du pilote
 * (`scripts/recoupement.mts`, un département d'un coup).
 */

export type SocieteLiee = {
  siren: string;
  nom: string;
  /** SARL, SAS, SA, société civile… */
  forme: string;
  commerciale: boolean;
  /** Elle emploie du monde : site et adresse e-mail probables. */
  salaries: boolean;
  naf?: string;
  commune?: string;
};

export type LienDirigeant = {
  type: "personne" | "societe";
  nom: string;
  prenoms?: string;
  annee?: string;
  qualite?: string;
  /** Pour un dirigeant personne morale : son SIREN. */
  siren?: string;
  societes: SocieteLiee[];
};

/** Du plus au moins joignable. */
export type Joignable = "salaries" | "commerciale" | "holding" | "civile" | "aucun" | "institutionnel" | "introuvable";

export type Recoupe = { siren: string; dep?: string; joignable: Joignable; liens: LienDirigeant[]; maj?: string };

export const LIBELLE_JOIGNABLE: Record<Joignable, string> = {
  salaries: "Gérant dans une entreprise avec salariés",
  commerciale: "Gérant dans une société commerciale",
  holding: "Gérée par une société commerciale",
  civile: "Autres sociétés civiles seulement",
  aucun: "Aucune autre société",
  institutionnel: "Investisseur institutionnel",
  introuvable: "Introuvable à l'annuaire",
};

/* Natures juridiques de l'INSEE : 54 SARL, 55/56 SA, 57 SAS ; 65 sociétés civiles. */
const FORMES: Record<string, string> = { "54": "SARL", "55": "SA", "56": "SA", "57": "SAS", "65": "Société civile" };
const forme = (nj: unknown) => FORMES[String(nj ?? "").slice(0, 2)] ?? "Autre";
const commerciale = (nj: unknown) => /^(54|55|56|57)/.test(String(nj ?? ""));

type Brut = {
  siren?: string; nom_complet?: string; nom_raison_sociale?: string; nature_juridique?: string;
  activite_principale?: string; tranche_effectif_salarie?: string | null;
  siege?: { libelle_commune?: string; code_postal?: string };
  dirigeants?: {
    type_dirigeant?: string; nom?: string; prenoms?: string; annee_de_naissance?: string;
    qualite?: string; siren?: string; denomination?: string;
  }[];
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** L'annuaire limite le débit : on attend et on réessaie plutôt que d'échouer. */
async function annuaire(q: string): Promise<Brut[] | null> {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${q}`, { cache: "no-store" }).catch(() => null);
    if (r?.status === 429) { await pause(1500 * (i + 1)); continue; }
    if (!r?.ok) return null;
    const d = (await r.json().catch(() => null)) as { results?: Brut[] } | null;
    return d?.results ?? [];
  }
  return null;
}

const enSociete = (s: Brut): SocieteLiee => ({
  siren: String(s.siren ?? ""),
  nom: (s.nom_raison_sociale || s.nom_complet || "").toUpperCase(),
  forme: forme(s.nature_juridique),
  commerciale: commerciale(s.nature_juridique),
  salaries: !!s.tranche_effectif_salarie && !["NN", "00"].includes(s.tranche_effectif_salarie),
  naf: s.activite_principale ?? undefined,
  commune: s.siege?.libelle_commune ?? undefined,
});

/** Interroge l'annuaire pour une société propriétaire. Trois à six appels. */
export async function recouper(siren: string, dep?: string): Promise<Recoupe> {
  const e = (await annuaire(`q=${siren}&per_page=1`))?.find((x) => x.siren === siren);
  if (!e) return { siren, dep, joignable: "introuvable", liens: [] };
  const dirs = e.dirigeants ?? [];
  const liens: LienDirigeant[] = [];

  /* Le gérant est une société : on regarde laquelle. */
  for (const m of dirs.filter((d) => d.type_dirigeant === "personne morale" && d.siren).slice(0, 2)) {
    const s = (await annuaire(`q=${m.siren}&per_page=1`))?.find((x) => x.siren === m.siren);
    liens.push({
      type: "societe", nom: (m.denomination ?? "").toUpperCase(), qualite: m.qualite, siren: m.siren,
      societes: s ? [enSociete(s)] : [],
    });
  }

  /* Les personnes : même nom, même premier prénom, même année de naissance. */
  for (const p of dirs.filter((d) => d.type_dirigeant === "personne physique" && d.nom && d.annee_de_naissance).slice(0, 3)) {
    const nom = p.nom!.replace(/\s*\(.*\)\s*/, " ").trim();
    const prenom = String(p.prenoms ?? "").split(/\s+/)[0];
    const an = String(p.annee_de_naissance).slice(0, 4);
    const q = new URLSearchParams({
      nom_personne: nom, prenoms_personne: prenom,
      date_naissance_personne_min: `${an}-01-01`, date_naissance_personne_max: `${an}-12-31`,
      type_personne: "dirigeant", etat_administratif: "A", per_page: "25",
    });
    const r = await annuaire(q.toString());
    liens.push({
      type: "personne", nom: nom.toUpperCase(), prenoms: p.prenoms, annee: an, qualite: p.qualite,
      societes: (r ?? []).filter((s) => s.siren && s.siren !== siren).map(enSociete),
    });
  }

  return { siren, dep, joignable: classer(liens), liens };
}

/* Banque (64.1), fonds (64.3), assurance (65), gestion de fonds (66.3) : le
   propriétaire est un investisseur institutionnel (SCPI, fonds, assureur). Ce
   n'est pas une cible de découpe, et son « gérant » ne se démarche pas par
   l'e-mail d'une PME. Les holdings (64.20) restent : la plupart sont
   familiales, et ce sont justement des cibles. */
const NAF_INSTITUTIONNEL = /^(64\.1|64\.3|65\.|66\.3)/;
const QUALITE_INSTITUTIONNELLE = /surveillance|directoire/i;

/** Par où la société se joint, d'après ses liens — sans rappeler l'annuaire. */
export function classer(liens: LienDirigeant[]): Joignable {
  const holding = liens.filter((l) => l.type === "societe").flatMap((l) => l.societes);
  if (liens.some((l) => QUALITE_INSTITUTIONNELLE.test(l.qualite ?? ""))
    || holding.some((s) => NAF_INSTITUTIONNEL.test(s.naf ?? ""))) return "institutionnel";
  const perso = liens.filter((l) => l.type === "personne").flatMap((l) => l.societes);
  return perso.some((s) => s.commerciale && s.salaries) ? "salaries"
    : perso.some((s) => s.commerciale) ? "commerciale"
      : holding.some((s) => s.commerciale) ? "holding"
        : perso.length + holding.length > 0 ? "civile"
          : "aucun";
}

/* ----------------------------------------------------------- en base --- */

const base = () => {
  const url = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente.");
  return { url, h: { apikey: key, Authorization: `Bearer ${key}` } };
};

export async function lireRecoupe(siren: string): Promise<Recoupe | null> {
  const { url, h } = base();
  const r = await fetch(`${url}/rest/v1/fi_pm_recoupe?siren=eq.${siren}&select=*`, { headers: h, cache: "no-store" });
  if (!r.ok) return null;
  return ((await r.json()) as Recoupe[])[0] ?? null;
}

export async function enregistrerRecoupes(lignes: Recoupe[]) {
  if (!lignes.length) return;
  const { url, h } = base();
  const r = await fetch(`${url}/rest/v1/fi_pm_recoupe?on_conflict=siren`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(lignes.map((l) => ({ ...l, maj: new Date().toISOString() }))),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Écriture du recoupement : ${r.status} ${(await r.text()).slice(0, 200)}`);
}
