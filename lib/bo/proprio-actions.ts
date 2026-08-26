"use server";

/* Qui possède cet immeuble ? (retour #135)
 *
 * MAV avait raison : quand le propriétaire est une PERSONNE MORALE, l'info est
 * publique. La DGFiP publie en open data le « fichier des locaux des personnes
 * morales » — extrait de MAJIC, le cadastre fiscal : pour chaque local bâti,
 * l'adresse, la parcelle, et la société qui le détient avec son SIREN, sa forme
 * juridique et la nature de son droit (propriétaire, usufruitier, nu-
 * propriétaire, gestionnaire…). C'est la source dont vivent Pappers Immobilier
 * et les autres.
 *
 * Ce que ça ne donne pas, et il faut le savoir en le lisant : les personnes
 * physiques. Elles sont exclues du fichier par construction (protection des
 * données). Une adresse sans résultat n'est donc pas une adresse sans
 * propriétaire — c'est très probablement un particulier.
 *
 * Chemin : adresse libre → Base Adresse Nationale (code INSEE + n° + voie
 * normalisés) → fichier des personnes morales.
 */

/** Un détenteur de droit à l'adresse cherchée. */
export type ProprietairePM = {
  denomination: string;
  /** Absent quand le fichier ne porte qu'un identifiant interne (préfixé U). */
  siren?: string;
  forme?: string;
  /** Propriétaire, usufruitier, nu-propriétaire, gestionnaire, syndic… */
  droit: string;
  parcelle?: string;
  /** Millésime du fichier : un propriétaire a pu vendre depuis. */
  annee?: string;
};

export type ResultatProprietaires =
  | { ok: true; adresse: string; insee: string; numero: string; liste: ProprietairePM[] }
  | { ok: false; erreur: string };

const JEU = "buildingref-france-majic-locaux-millesime";
const ODS = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/${JEU}/records`;

/* Le fichier écrit la voie sans son type et sans accents : « DU TONDU », là où
   la BAN dit « Rue du Tondu ». On compare donc des noyaux, pas des libellés. */
const TYPES_VOIE =
  /^(RUE|AVENUE|AV|BOULEVARD|BD|IMPASSE|ALLEE|ALLEES|PLACE|COURS|QUAI|CHEMIN|ROUTE|SQUARE|PASSAGE|VILLA|CITE|ESPLANADE|PROMENADE|RESIDENCE|VOIE|SENTE|SENTIER|ROND POINT|GRANDE RUE|FAUBOURG|PARVIS|MAIL|PONT|PORT|RAMPE|TRAVERSE)\s+/;

function noyauVoie(v: string): string {
  const t = (v ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return t.replace(TYPES_VOIE, "").trim();
}

/** Les droits qui intéressent un mandat, dans l'ordre où on veut les lire. */
const RANG_DROIT = (d: string) => {
  const t = d.toLowerCase();
  if (t.startsWith("propriétaire")) return 0;
  if (t.includes("usufruit")) return 1;
  if (t.includes("nu-propriétaire")) return 2;
  if (t.includes("bailleur") || t.includes("preneur")) return 3;
  return 9; // gestionnaires, syndics : utiles, mais pas les propriétaires
};

type Ligne = {
  denomination_proprietaire?: string;
  siren_proprietaire?: string;
  abrev_forme_juridique_proprietaire?: string;
  label_code_droit?: string;
  nom_voie_local?: string;
  num_voirie_local?: string;
  section?: string;
  num_plan?: string;
  year?: string;
};

/** Géocodage : la BAN donne le code INSEE, le numéro et la voie propres. */
async function situer(adresse: string) {
  const q = encodeURIComponent(adresse.trim());
  const sources = [
    `https://data.geopf.fr/geocodage/search?q=${q}&limit=1&index=address`,
    `https://api-adresse.data.gouv.fr/search/?q=${q}&limit=1`,
  ];
  for (const url of sources) {
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) continue;
    const d = (await r.json().catch(() => null)) as {
      features?: { properties?: { citycode?: string; housenumber?: string; street?: string; city?: string; label?: string } }[];
    } | null;
    const p = d?.features?.[0]?.properties;
    if (p?.citycode) return p;
  }
  return null;
}

/**
 * Les personnes morales détenant un droit à cette adresse.
 *
 * On interroge sur commune + numéro + mots de la voie, puis on ne garde que
 * les lignes dont le noyau de voie correspond vraiment : « TONDU » ne doit pas
 * ramener « DU TONDU PROLONGEE ».
 */
export async function proprietairesPm(adresse: string): Promise<ResultatProprietaires> {
  if (!adresse?.trim()) return { ok: false, erreur: "Adresse vide." };
  const p = await situer(adresse);
  if (!p?.citycode) return { ok: false, erreur: "Adresse introuvable dans la Base Adresse Nationale." };
  if (!p.housenumber) {
    return { ok: false, erreur: "Il manque le numéro dans la rue : sans lui, le fichier ne peut pas trancher." };
  }

  const noyau = noyauVoie(p.street ?? "");
  const mots = noyau.split(" ").filter((m) => m.length > 2).slice(0, 3);
  if (!mots.length) return { ok: false, erreur: "Nom de voie inexploitable." };
  const numero = String(p.housenumber).replace(/\D/g, "").padStart(4, "0");

  const where = `com_arm_code='${p.citycode}' and num_voirie_local='${numero}' and search(nom_voie_local,'${mots.join(" ").replace(/'/g, "")}')`;
  const url = `${ODS}?where=${encodeURIComponent(where)}&limit=100&order_by=${encodeURIComponent("year desc")}`;
  const r = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!r?.ok) return { ok: false, erreur: "Le fichier des personnes morales n'a pas répondu." };
  const d = (await r.json().catch(() => null)) as { results?: Ligne[] } | null;

  /* Une même société revient autant de fois qu'elle a de locaux dans
     l'immeuble : c'est un propriétaire, pas vingt lignes. */
  const par = new Map<string, ProprietairePM>();
  for (const l of d?.results ?? []) {
    if (noyauVoie(l.nom_voie_local ?? "") !== noyau) continue;
    const nom = (l.denomination_proprietaire ?? "").trim();
    if (!nom) continue;
    const droit = (l.label_code_droit ?? "Droit non précisé").trim();
    const cle = `${l.siren_proprietaire ?? nom}|${droit}`;
    if (par.has(cle)) continue;
    const siren = (l.siren_proprietaire ?? "").trim();
    par.set(cle, {
      denomination: nom,
      // Un identifiant commençant par U est un numéro interne au cadastre,
      // pas un SIREN : le donner ferait échouer toute recherche d'entreprise.
      siren: /^\d{9}$/.test(siren) ? siren : undefined,
      forme: l.abrev_forme_juridique_proprietaire ?? undefined,
      droit,
      parcelle: l.section && l.num_plan ? `${l.section}${l.num_plan}` : undefined,
      annee: l.year?.slice(0, 4),
    });
  }

  const liste = [...par.values()].sort(
    (a, b) => RANG_DROIT(a.droit) - RANG_DROIT(b.droit) || a.denomination.localeCompare(b.denomination),
  );
  return { ok: true, adresse: p.label ?? adresse, insee: p.citycode, numero: String(p.housenumber), liste };
}
