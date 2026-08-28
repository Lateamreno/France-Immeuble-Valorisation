// Socle métier du mandat — tout ce qui se déduit, rien qui s'affiche.
//
// Trois idées structurent ce fichier :
//   1. Les mandants sont des CONTACTS, pas des chaînes de caractères. Le modèle
//      plat du BO (prénom_m1/nom_m1, prénom_m2/nom_m2) plafonne à deux ; on le
//      garde alimenté pour Bubble mais la vérité est la liste `mandants`.
//   2. L'objet du mandat ne se saisit pas : il se lit dans l'état locatif.
//      Occupation, surface bâtie, nombre de lots, baux — tout est déjà là, et
//      le recopier à la main c'est se garantir un mandat qui ment.
//   3. Le prix a quatre cases et deux degrés de liberté. On résout selon les
//      deux dernières cases touchées (retour #104).

import { group } from "./format";
import { RATTACHE } from "./referentiels";
import { honorairesBareme, netVendeurDepuisHai, type Tranche } from "./bareme";

/* ---------------------------------------------------------------- Mandants */

export type Societe = {
  nom?: string;
  siren?: string;
  rcs?: string;
  capital?: number;
  siege?: string;
};

export type Mandant = {
  /** Identifiant local de la ligne (les contacts peuvent manquer). */
  uid: string;
  contactId?: string;
  qualite?: string;
  prenom?: string;
  nom?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  adresse?: string;
  email?: string;
  /** Personne physique, ou personne morale représentée par ce contact. */
  personne: "physique" | "morale";
  /** Sa qualité dans CE mandat : gérant, indivisaire, usufruitier… */
  fonction?: string;
  societe?: Societe;
  /** Pièces déposées : URL de lecture. */
  cni?: string;
  kbis?: string;
};

/**
 * Les qualités rencontrées, relevées sur les 253 mandats du BO — le champ
 * `qualité_m1` y porte « Gérant », « Président », « Directeur Général »… et
 * pas la civilité. La liste ci-dessous n'est qu'une aide à la saisie : le
 * champ reste libre, parce qu'un mandant peut aussi être « gérant dûment
 * habilité » ou « co-indivisaire ».
 */
export const FONCTIONS_MANDANT = [
  "Propriétaire",
  "Indivisaire",
  "Usufruitier",
  "Nu-propriétaire",
  "Gérant",
  "Gérante",
  "Cogérant",
  "Président",
  "Présidente",
  "Directeur Général",
  "Associé",
  "Mandataire",
  "Tuteur / curateur",
];

const uid = (i: number) => `m${i}-${Math.random().toString(36).slice(2, 8)}`;

const S = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Lit les mandants du document. Priorité à la liste moderne ; à défaut on
 * reconstitue depuis les champs plats, pour que les 253 mandats déjà en base
 * s'affichent sans migration.
 */
export function lireMandants(m: Record<string, unknown>): Mandant[] {
  const liste = m.mandants;
  if (Array.isArray(liste) && liste.length) {
    return (liste as Record<string, unknown>[]).map((x, i) => ({
      uid: S(x.uid) ?? uid(i),
      contactId: S(x.contactId),
      qualite: S(x.qualite),
      prenom: S(x.prenom),
      nom: S(x.nom),
      dateNaissance: S(x.dateNaissance),
      lieuNaissance: S(x.lieuNaissance),
      adresse: S(x.adresse),
      email: S(x.email),
      personne: x.personne === "morale" ? "morale" : "physique",
      fonction: S(x.fonction),
      societe: (x.societe as Societe | undefined) ?? undefined,
      cni: S(x.cni),
      kbis: S(x.kbis),
    }));
  }

  // Repli : modèle plat hérité de Bubble.
  const morale = String(m.Type_personne ?? "").toLowerCase().includes("moral");
  const societe: Societe | undefined = morale
    ? {
        nom: S(m.raison_sociale),
        siren: S(m.siren),
        rcs: S(m.rcs),
        capital: N(m.capital),
        siege: S(geoTexte(m.siege_geo)),
      }
    : undefined;
  const out: Mandant[] = [];
  const contacts = Array.isArray(m.MANDANTs) ? (m.MANDANTs as unknown[]).map(String) : [];
  if (S(m.nom_m1) || S(m["prénom_m1"]) || societe?.nom) {
    out.push({
      uid: "m1",
      contactId: contacts[0],
      // Piège du modèle Bubble : `qualité_m1` porte « Gérant », « Président »,
      // « Directeur Général »… c'est la QUALITÉ AU MANDAT, pas la civilité.
      // Le prendre pour une civilité produisait « représentée par Gerant Eric
      // BRIARD » dans le mandat généré.
      fonction: S(m["qualité_m1"]),
      prenom: S(m["prénom_m1"]),
      nom: S(m.nom_m1),
      dateNaissance: S(m.date_naissance_m1),
      lieuNaissance: geoTexte(m.lieu_naissance_geo_m1),
      adresse: geoTexte(m.adresse_m1_geo),
      personne: morale ? "morale" : "physique",
      societe,
      cni: S(m.cni_m1),
      kbis: S(m.kbis),
    });
  }
  if (S(m.nom_m2) || S(m["prénom_m2"])) {
    out.push({
      uid: "m2",
      contactId: contacts[1],
      prenom: S(m["prénom_m2"]),
      nom: S(m.nom_m2),
      dateNaissance: S(m.date_naissance_m2),
      lieuNaissance: geoTexte(m.lieu_naissance_geo_m2),
      adresse: geoTexte(m.adresse_m2_geo),
      personne: "physique",
      cni: S(m.cni_m2),
    });
  }
  return out;
}

/** Les champs « adresse » de Bubble sont soit du texte, soit un objet geo. */
export function geoTexte(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return S(o.address) ?? S(o.adresse) ?? undefined;
  }
  return undefined;
}

export const mandantVide = (i: number): Mandant => ({ uid: uid(i), personne: "physique" });

/** « M. Jean DUPONT » ou « SCI DU MOULIN ». */
export function nomMandant(x: Mandant): string {
  if (x.personne === "morale") return x.societe?.nom ?? "Société à renseigner";
  return [x.qualite, x.prenom, x.nom].filter(Boolean).join(" ") || "Mandant à renseigner";
}

/** Les pièces d'identité obligatoires pour ce mandant. */
export function piecesMandant(x: Mandant): { cle: "cni" | "kbis"; label: string; url?: string }[] {
  const pieces: { cle: "cni" | "kbis"; label: string; url?: string }[] = [
    { cle: "cni", label: "Pièce d'identité", url: x.cni },
  ];
  if (x.personne === "morale") pieces.push({ cle: "kbis", label: "Kbis (moins de 3 mois)", url: x.kbis });
  return pieces;
}

/* -------------------------------------------------- Objet servi par les lots */

export type SyntheseLocative = {
  lots: number;
  occupes: number;
  libres: number;
  surface: number;
  loyerMensuel: number;
  /** Détail par destination, pour le descriptif légal. */
  parDestination: { destination: string; nb: number; surface: number }[];
  baux: string[];
  /** Un seul lot libre suffit à interdire « vendu occupé » sans réserve. */
  occupation: "occupe" | "libre" | "mixte";
};

const LIBRE = new Set(["Vide", "", "n.c."]);

/**
 * Un lot est-il occupé ? (retours #170 et #171)
 *
 * Le type de bail ne suffit pas : MAV avait saisi des loyers sur des lots
 * restés « Vide » faute d'avoir choisi le type, et le mandat annonçait un
 * immeuble « vendu libre de toute occupation » alors qu'il rapportait. Le
 * loyer en cours est le fait le plus sûr — un lot qui encaisse un loyer est
 * loué, quoi que dise la case d'à côté.
 *
 * L'inverse est vrai aussi : un loyer POTENTIEL seul ne rend pas le lot
 * occupé, c'est justement ce qu'il rapporterait s'il l'était.
 */
export function lotOccupe(l: Record<string, unknown>): boolean {
  if ((N(l.loyer) ?? 0) > 0) return true;
  return !LIBRE.has(String(l.Type_bail ?? ""));
}

/** Ce que l'état locatif dit du bien — la seule source de l'onglet Objet. */
export function synthese(lots: Record<string, unknown>[]): SyntheseLocative {
  let occupes = 0;
  let surface = 0;
  let loyerMensuel = 0;
  const parDest = new Map<string, { nb: number; surface: number }>();
  const baux = new Set<string>();

  for (const l of lots) {
    const bail = String(l.Type_bail ?? "");
    const occupe = lotOccupe(l);
    if (occupe) {
      occupes++;
      /* Un lot loué dont le type de bail n'a pas encore été choisi ne doit pas
         faire écrire « (Vide) » dans le descriptif du mandat. */
      if (bail && !LIBRE.has(bail)) baux.add(bail);
      loyerMensuel += N(l.loyer) ?? 0;
    }
    const s = N(l.surface_carrez) ?? N(l.surface_sol) ?? 0;
    surface += s;
    const d = String(l.Destination ?? "Autre");
    const acc = parDest.get(d) ?? { nb: 0, surface: 0 };
    parDest.set(d, { nb: acc.nb + 1, surface: acc.surface + s });
  }

  return {
    lots: lots.length,
    occupes,
    libres: lots.length - occupes,
    surface: Math.round(surface),
    loyerMensuel: Math.round(loyerMensuel),
    parDestination: [...parDest.entries()]
      .map(([destination, v]) => ({ destination, ...v, surface: Math.round(v.surface) }))
      .sort((a, b) => b.nb - a.nb),
    baux: [...baux].sort(),
    occupation: occupes === 0 ? "libre" : occupes === lots.length ? "occupe" : "mixte",
  };
}

const pluriel = (n: number, un: string, plusieurs = `${un}s`) => `${n} ${n > 1 ? plusieurs : un}`;

/**
 * Le descriptif que la loi attend dans un mandat : désignation du bien,
 * consistance, situation locative. Rédigé depuis l'état locatif, modifiable à
 * la main si l'agent veut le préciser (retour #103).
 */
export function descriptifLegal(
  im: Record<string, unknown>,
  lots: Record<string, unknown>[],
  refCadastre?: string,
  surfaceTerrain?: number,
): string {
  const s = synthese(lots);
  const adresse = adresseImmeuble(im);
  const phrases: string[] = [];

  phrases.push(
    `Un immeuble de rapport situé ${adresse}` +
      (refCadastre ? `, cadastré ${refCadastre}` : "") +
      (surfaceTerrain ? `, sur un terrain de ${group(surfaceTerrain)} m²` : "") +
      ".",
  );

  if (s.lots > 0) {
    const detail = s.parDestination
      .map((d) => `${pluriel(d.nb, "lot")} à destination ${d.destination.toLowerCase()}${d.surface ? ` (${group(d.surface)} m²)` : ""}`)
      .join(", ");
    phrases.push(
      `L'immeuble comporte ${pluriel(s.lots, "lot")} pour une surface habitable et utile totale de ${group(s.surface)} m² : ${detail}.`,
    );
  }

  /* #171 — les lots loués avec un autre sous un loyer unique. Sans cette
     phrase, le lecteur du mandat compte un lot occupé sans loyer et croit à
     une erreur. */
  const rattaches = lots.filter((l) => String(l.Type_bail ?? "") === RATTACHE);
  if (rattaches.length > 0) {
    const num = (l: Record<string, unknown>) => (l.numero ? `n° ${String(l.numero)}` : "sans numéro");
    const paires = rattaches.map((l) => {
      const cible = lots.find((x) => String(x._id) === String(l.lot_rattache ?? ""));
      return cible ? `le lot ${num(l)} avec le lot ${num(cible)}` : `le lot ${num(l)} avec un autre lot`;
    });
    phrases.push(
      `${paires.length > 1 ? "Certains lots sont loués ensemble" : "Un lot est loué avec un autre"} sous un loyer global unique : ${paires.join(", ")}.`,
    );
  }

  if (s.occupation === "libre") {
    phrases.push("L'immeuble est vendu libre de toute occupation.");
  } else {
    const bail = s.baux.length ? ` (${s.baux.join(", ")})` : "";
    const loyer = s.loyerMensuel
      ? ` Le montant total des loyers en cours s'élève à ${group(s.loyerMensuel)} € hors charges par mois, soit ${group(s.loyerMensuel * 12)} € par an.`
      : "";
    phrases.push(
      s.occupation === "occupe"
        ? `L'immeuble est vendu occupé : l'ensemble des lots est loué${bail}.${loyer}`
        : `L'immeuble est vendu partiellement occupé : ${pluriel(s.occupes, "lot")} ${s.occupes > 1 ? "sont loués" : "est loué"}${bail} et ${pluriel(s.libres, "lot")} ${s.libres > 1 ? "sont libres" : "est libre"} de toute occupation.${loyer}`,
    );
    phrases.push(
      "Le mandant déclare que les baux en cours seront transmis à l'acquéreur et qu'aucun congé, ni aucune procédure, n'est en cours à la date des présentes, sauf mention contraire portée ci-dessus.",
    );
  }

  return phrases.join("\n\n");
}

export function adresseImmeuble(im: Record<string, unknown>): string {
  const rue = [S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ");
  const ville = [S(im.adresse_zipcode), S(im.adresse_ville)].filter(Boolean).join(" ");
  return [rue, ville].filter(Boolean).join(", ") || "adresse à renseigner";
}

/* ------------------------------------------------------------------- Prix */

export type Prix = { nv?: number; hai?: number; taux?: number; honos?: number };
export type ChampPrix = keyof Prix;

const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * Résolution du prix — le prix HAI est l'ancre (retour MAV #190).
 *
 * C'est le prix HAI que l'agent annonce, affiche et négocie : c'est donc lui
 * qu'il saisit, et c'est lui qui ne doit JAMAIS bouger tout seul. Les trois
 * autres cases s'ajustent entre elles sous cette contrainte :
 *
 *   · on saisit le HAI      → honoraires au barème, net vendeur déduit ;
 *   · on saisit les honos   → net vendeur = HAI − honoraires, taux recalculé ;
 *   · on saisit le net vend.→ honoraires = HAI − net vendeur, taux recalculé ;
 *   · on saisit le taux     → net vendeur = HAI ÷ (1 + taux), honos déduits.
 *
 * La règle précédente — « les deux dernières cases touchées pilotent les deux
 * autres » — faisait bouger le prix de vente quand l'agent ajustait ses
 * honoraires, ce qui n'a pas de sens : le client, lui, paie le HAI convenu.
 */
export function resoudrePrix(p: Prix, pilotes: ChampPrix[], bareme?: Tranche[]): Prix {
  const dernier = pilotes[pilotes.length - 1] ?? "hai";
  const v = (k: ChampPrix) => (typeof p[k] === "number" && p[k]! > 0 ? p[k]! : undefined);
  const nv = v("nv"), hai = v("hai"), taux = v("taux"), honos = v("honos");

  const out = (r: Prix): Prix => ({
    nv: r.nv !== undefined ? Math.round(r.nv) : undefined,
    hai: r.hai !== undefined ? Math.round(r.hai) : undefined,
    honos: r.honos !== undefined ? Math.round(r.honos) : undefined,
    taux: r.taux !== undefined ? arrondi(r.taux) : undefined,
  });

  /* Le HAI vient d'être saisi, ou il est seul renseigné : le barème donne les
     honoraires, et le net vendeur s'en déduit. */
  if (dernier === "hai" || (hai && !nv && !honos && !taux)) {
    if (!hai) return out({ nv, hai, taux, honos });
    const r = netVendeurDepuisHai(hai, bareme);
    return out({ hai, nv: r.nv, honos: r.honos, taux: r.taux });
  }

  /* Sans prix HAI on ne peut rien ancrer : on le fabrique depuis ce qu'on a,
     c'est le seul cas où il se calcule. */
  if (!hai) {
    if (nv && taux) { const h = nv * (taux / 100); return out({ nv, taux, honos: h, hai: nv + h }); }
    if (nv && honos) return out({ nv, honos, taux: (honos / nv) * 100, hai: nv + honos });
    if (nv) { const r = honorairesBareme(nv, bareme); return out({ nv, honos: r.honos, taux: r.taux, hai: nv + r.honos }); }
    return out({ nv, hai, taux, honos });
  }

  if (dernier === "honos" && honos !== undefined) {
    const n = hai - honos;
    return out({ hai, honos, nv: n, taux: n > 0 ? (honos / n) * 100 : undefined });
  }
  if (dernier === "nv" && nv !== undefined) {
    const h = hai - nv;
    return out({ hai, nv, honos: h, taux: nv > 0 ? (h / nv) * 100 : undefined });
  }
  if (dernier === "taux" && taux !== undefined) {
    const n = hai / (1 + taux / 100);
    return out({ hai, taux, nv: n, honos: hai - n });
  }
  return out({ nv, hai, taux, honos });
}

/* ------------------------------------------- Doctrine « charge des honoraires »

   Règle maison, dictée par le droit de préemption du locataire — et par rien
   d'autre. Le réflexe « lot occupé donc charge vendeur » est FAUX : sur les
   253 mandats du BO, 243 sont en charge acquéreur, et ce sont des immeubles
   de rapport loués. Vendre un immeuble multi-locataires EN BLOC n'ouvre aucun
   droit de préemption individuel : les honoraires restent charge acquéreur.

   Deux cas, et deux seulement, imposent la charge vendeur :

     • la vente À LA DÉCOUPE — chaque locataire est titulaire d'un droit de
       préemption sur son lot (loi du 31 décembre 1975, baux commerciaux) ;
     • l'immeuble MONO-LOCATAIRE vendu en bloc — le locataire unique préempte
       sur l'ensemble, c'est le cas où l'on se ferait avoir.

   Dans ces deux cas le prix notifié au locataire doit être le net vendeur non
   majoré : d'où la charge vendeur, qui laisse les honoraires dans le prix. */

export type Mode = "bloc" | "decoupe";

export const modeVente = (m: Record<string, unknown>): Mode =>
  m.vente_mode === "decoupe" ? "decoupe" : "bloc";

export type RegimeHonoraires = {
  /** Charge imposée par la doctrine, ou `null` si l'agent reste libre. */
  impose: "Vendeur" | null;
  /** Charge à appliquer, imposée ou choisie. */
  charge: "Vendeur" | "Acheteur";
  motif: string;
  /** Le mandat porte-t-il la clause préemption locataire (art. 4.3) ? */
  clauseLocataire: boolean;
};

export function regimeHonoraires(
  lots: Record<string, unknown>[],
  mode: Mode,
  choix: string | undefined,
): RegimeHonoraires {
  const s = synthese(lots);
  if (mode === "decoupe") {
    return {
      impose: "Vendeur",
      charge: "Vendeur",
      clauseLocataire: true,
      motif:
        "Vente à la découpe : chaque locataire est titulaire d'un droit de préemption sur son lot. Le prix qui lui est notifié doit être le net vendeur non majoré — d'où la charge vendeur.",
    };
  }
  if (s.occupes === 1) {
    return {
      impose: "Vendeur",
      charge: "Vendeur",
      clauseLocataire: true,
      motif:
        "Immeuble mono-locataire vendu en bloc : le locataire unique préempte sur l'ensemble. Charge acquéreur, la notification tombe et les honoraires avec.",
    };
  }
  return {
    impose: null,
    charge: choix === "Vendeur" ? "Vendeur" : "Acheteur",
    clauseLocataire: false,
    motif:
      s.occupes > 1
        ? `Vente en bloc, ${s.occupes} locataires : aucun droit de préemption individuel, honoraires charge acquéreur comme d'usage. À vérifier tout de même — si l'acquéreur ne s'engage pas à proroger les baux d'habitation six ans, l'article 10-1 de la loi du 31 décembre 1975 rouvre un droit de préemption d'ensemble.`
        : "Immeuble libre de toute occupation : aucun droit de préemption, la charge se négocie librement.",
  };
}

/* ------------------------------------------- Vente directe au locataire

   Règle maison, dictée par MAV : « une réduction sur les honoraires concédée
   au vendeur, sans modification du prix de vente pour l'acquéreur. Si c'est
   300 k€ HAI dans le mandat avec 5 % d'honos TTC calculés sur le net vendeur
   à la charge vendeur, alors le locataire recevra une offre à 300 k€ et les
   propriétaires n'auront à verser que 4 % d'honos si on arrive à faire la
   vente avec eux directement. »

   Deux conséquences, et il faut les tenir toutes les deux :

     • le PRIX NE BOUGE PAS. C'est un point de droit autant que de commerce :
       sur un lot préemptable, le prix notifié au locataire est le net vendeur
       non majoré (§8.2 de la doctrine) ; le faire varier selon l'acheteur
       ouvrirait une discussion qu'on n'a pas envie d'avoir ;
     • la remise porte sur le TAUX, pas sur le montant. 5 % moins un cinquième
       font 4 %, appliqués au net vendeur recalculé à prix HAI constant. D'où
       un net vendeur qui MONTE : c'est bien le mandant qui empoche la remise.

   Sur l'exemple de MAV : 300 000 € HAI, 5 % → net 285 714 € et 14 286 € de
   commission ; à 4 % → net 288 462 € et 11 538 €. Le mandant gagne 2 748 €,
   l'acquéreur paie le même prix. */

/** La part d'honoraires abandonnée quand le locataire achète en direct. */
export const REMISE_LOCATAIRE = 0.2;

export type PrixRemise = {
  /** Taux réduit, en %. */
  taux: number;
  /** Honoraires TTC correspondants. */
  honos: number;
  /** Net vendeur, mécaniquement plus élevé — le prix HAI ne bouge pas. */
  nv: number;
  /** Ce que la remise rapporte au mandant. */
  gain: number;
};

/**
 * Le prix, si le locataire en place achète en direct.
 *
 * Rend `null` tant qu'on n'a pas de quoi calculer : sans prix HAI ni taux, il
 * n'y a rien à écrire dans le mandat — mieux vaut taire la clause que
 * l'imprimer avec des trous.
 */
export function venteDirecteLocataire(p: Prix): PrixRemise | null {
  const hai = p.hai && p.hai > 0 ? p.hai : undefined;
  const taux =
    p.taux && p.taux > 0
      ? p.taux
      : p.honos && p.nv && p.nv > 0
        ? (p.honos / p.nv) * 100
        : undefined;
  if (!hai || !taux) return null;

  const reduit = taux * (1 - REMISE_LOCATAIRE);
  const nv = hai / (1 + reduit / 100);
  const honos = hai - nv;
  const nvPlein = hai / (1 + taux / 100);
  return {
    taux: arrondi(reduit),
    honos: Math.round(honos),
    nv: Math.round(nv),
    gain: Math.round(nv - nvPlein),
  };
}

/* -------------------------------------------------------- Pièces & blocages */

export type Manque = { cle: string; label: string; onglet: string };

/**
 * Ce qui empêche de générer le mandat (retour #105). On ne bloque QUE sur ce
 * qui rend le document faux ou incomplet : identité des parties, pièces
 * justificatives, objet, prix, durée. Le reste est facultatif.
 */
export function manques(
  m: Record<string, unknown>,
  mandants: Mandant[],
  im: Record<string, unknown> | null,
): Manque[] {
  const out: Manque[] = [];
  const push = (cle: string, label: string, onglet: string) => out.push({ cle, label, onglet });

  if (mandants.length === 0) push("mandants", "Aucun mandant renseigné", "Mandants");
  mandants.forEach((x, i) => {
    const qui = nomMandant(x);
    const rang = mandants.length > 1 ? ` (mandant ${i + 1})` : "";
    if (x.personne === "physique" && !(x.prenom && x.nom)) push(`m${i}-nom`, `Nom et prénom manquants${rang}`, "Mandants");
    if (x.personne === "morale" && !x.societe?.nom) push(`m${i}-rs`, `Raison sociale manquante${rang}`, "Mandants");
    if (!x.adresse) push(`m${i}-adr`, `Adresse de ${qui}`, "Mandants");
    if (!x.cni) push(`m${i}-cni`, `Pièce d'identité de ${qui}`, "Mandants");
    if (x.personne === "morale" && !x.kbis) push(`m${i}-kbis`, `Kbis de ${x.societe?.nom ?? qui}`, "Mandants");
  });

  if (!im) push("immeuble", "Aucun immeuble rattaché", "Objet");
  if (!S(m.justif_propriete)) push("titre", "Titre de propriété", "Objet");
  if (!S(m.description)) push("descriptif", "Descriptif du bien", "Objet");
  if (!N(m.prix_nv)) push("prix", "Prix net vendeur", "Prix");
  if (!N(m.honos_ttc)) push("honos", "Montant des honoraires", "Prix");
  if (!S(m.date_effet)) push("date", "Date de prise d'effet", "Conditions");
  if (!N(m["durée_tot_month"])) push("duree", "Durée du mandat", "Conditions");

  return out;
}

/**
 * Le mandat est-il figé, et pourquoi ?
 *
 * Attention au champ `locked` hérité de Bubble : il est posé sur presque tous
 * les mandats anciens, y compris un qui est encore « A rédiger ». S'y fier
 * seul verrouillait des mandats en cours de saisie. La vérité, c'est la
 * signature d'abord, le statut ensuite ; `locked` ne sert que de renfort sur
 * les statuts déjà terminaux.
 */
export function verrou(m: Record<string, unknown>): string | null {
  const statut = String(m.Statut ?? "");
  const enRedaction = statut === "Attente infos" || statut === "A rédiger";
  if (S(m.date_signature) || S(m.pdf_signed)) {
    const d = S(m.date_signature);
    return `Mandat signé${d ? ` le ${new Date(d).toLocaleDateString("fr-FR")}` : ""} — il n'est plus modifiable.`;
  }
  if (statut === "Annulé") return "Mandat annulé — il reste consultable, mais n'est plus modifiable.";
  if (statut === "Expiré") return "Mandat expiré — il n'est plus modifiable.";
  if (statut === "Vendu") return "Le bien est vendu sous ce mandat — il n'est plus modifiable.";
  if (m.locked === true && !enRedaction) return "Mandat verrouillé — il n'est plus modifiable.";
  return null;
}

/** Publication en ligne : oui par défaut, le vendeur peut la retirer. */
export const publicationWeb = (m: Record<string, unknown>) => m.publication_web_yn !== false;
