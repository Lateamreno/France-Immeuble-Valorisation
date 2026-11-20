/**
 * Les pages qu'un bien en copropriété ajoute au dossier de présentation
 * (étape 1 du cadrage du 20/11/26, CLAUDE.md §7.11) : le bail, le locataire
 * et les chiffres, la copropriété.
 *
 * Trois règles tenues ici, pas dans la mise en page :
 *  - une ligne vide ne s'imprime pas (MAV : « je ne suis pas sûr d'avoir
 *    toutes les infos dès le début ») ; une page sans ligne non plus ;
 *  - le locataire n'est nommé — enseigne, société, chiffre d'affaires — que
 *    si l'agent l'a choisi en fabriquant le dossier ;
 *  - le dirigeant et la note interne ne sortent jamais du BO (§8.3).
 */
import {
  bailLocalDe, chargesAnnuelles, coproDe, emplacementCommerceDe, enCopropriete, estBailCommercial,
  etatLocatifDuLot, locataireLocalDe, reperesBail, tantiemesVendus, type Echeance,
} from "./lot-copro";

export type Ligne = [string, string];

export type PagesLot = {


  bail?: {
    frise?: { effet: string; echeances: Echeance[]; avancement: number };
    lignes: Ligne[];
    quiPaie: Ligne[];
    aSavoir: string[];
  };
  locataire?: { nomme: boolean; lignes: Ligne[]; chiffres: { valeur: string; libelle: string }[]; lecture: Ligne[] };
  copro?: {
    lignes: Ligne[];
    lot: Ligne[];
    travaux: { libelle: string; montant: string; part: string; appels: string; charge: string }[];
    assemblee?: string;
    resume?: string;
    aPrevoir?: string;
  };
  /** L'emplacement commercial : sur la page du locataire quand elle existe,
   *  sinon sur sa propre page — la page Copropriété, pleine, débordait. */
  emplacement?: Ligne[];
};

const eur = (n?: number) => (n === undefined ? "" : `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} €`);
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const enLettres = (iso?: string) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const j = Number(iso.slice(8, 10));
  return `${j === 1 ? "1ᵉʳ" : j} ${MOIS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
};
const moisAnnee = (iso?: string) => (iso && /^\d{4}-\d{2}/.test(iso) ? `${MOIS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "");
const pct = (n: number, d: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: 2 })} %`;
const garder = (l: [string, string | undefined | false][]) => l.filter((x): x is Ligne => typeof x[1] === "string" && x[1].trim() !== "");
const anneesDepuis = (iso: string, auj: Date) => {
  const a = auj.getUTCFullYear() - Number(iso.slice(0, 4)) - (auj.toISOString().slice(5, 10) < iso.slice(5, 10) ? 1 : 0);
  return a >= 1 ? `plus de ${a} an${a > 1 ? "s" : ""}` : "moins d'un an";
};

export function pagesLot(
  b: { im: Record<string, unknown>; lots: Record<string, unknown>[]; baux: Record<string, unknown>[]; locataires: Record<string, unknown>[] },
  o: { prixHai?: number; nommerLocataire?: boolean; aujourdHui: Date },
): PagesLot | null {
  const im = b.im;
  if (!enCopropriete(im)) return null;
  const el = etatLocatifDuLot(b);
  const bail = bailLocalDe(im);
  const loc = locataireLocalDe(im);
  const copro = coproDe(im);
  const emp = emplacementCommerceDe(im);
  const commercial = estBailCommercial(el.typeBail);
  const r = reperesBail({
    loyerAnnuel: el.loyerAnnuel, prixHai: o.prixHai, surface: el.surface,
    effet: commercial || bail.fin ? el.effet : undefined, bail, locataire: loc, aujourdHui: o.aujourdHui,
  });
  const out: PagesLot = {};
  const loue = !!el.loyerAnnuel;

  /* --- Le bail : seulement si le local est loué --- */
  if (loue) {
    const aSavoir: string[] = [];
    if (commercial && r.prochaineEcheance && r.congeAvant) {
      aSavoir.push(`Le locataire peut donner congé pour le ${enLettres(r.prochaineEcheance)}, en prévenant au plus tard le ${enLettres(r.congeAvant)}.`);
    }
    if (bail.droit_preference) aSavoir.push("Le locataire dispose d'un droit de préférence : la vente lui est proposée en premier, au même prix.");
    if (bail.tva) aSavoir.push("Le loyer est soumis à la TVA.");
    out.bail = {
      frise: r.echeances.length && r.avancement !== undefined && el.effet ? { effet: el.effet, echeances: r.echeances, avancement: r.avancement } : undefined,
      lignes: garder([
        ["Type", commercial ? "Commercial 3/6/9" : el.typeBail && !["Vide", "n.c."].includes(el.typeBail) ? el.typeBail : ""],
        ["Signé le", enLettres(bail.signe_le)],
        ["Date d'effet", enLettres(el.effet)],
        ["Prochaine échéance", enLettres(r.prochaineEcheance)],
        ["Durée ferme restante", r.dureeFerme],
        ["Loyer annuel HT HC", eur(el.loyerAnnuel)],
        ["Loyer à la signature", el.loyerInitial ? eur(el.loyerInitial * 12) : ""],
        ["Indexation", [el.indice, r.prochaineRevision ? `prochaine révision le ${enLettres(r.prochaineRevision)}` : ""].filter(Boolean).join(", ")],
        ["Dépôt de garantie", eur(el.depot)],
        ["Autre garantie", bail.garantie],
        ["Destination", bail.destination],
        ["Cession, sous-location", bail.cession],
        ["Impayés, procédure", bail.impayes],
      ]),
      quiPaie: garder([
        ["Taxe foncière", bail.taxe_fonciere],
        ["Charges de copropriété", bail.charges_copro],
        ["Gros travaux", bail.gros_travaux],
      ]),
      aSavoir,
    };

    /* --- Le locataire et les chiffres --- */
    const nomme = o.nommerLocataire === true;
    const entree = loc.entree || el.effet;
    const profil = loc.etablissements === undefined ? "" : loc.etablissements <= 1 ? "Indépendant, 1 établissement" : `${loc.etablissements} établissements`;
    const lignes = nomme
      ? garder([
          ["Enseigne", loc.enseigne],
          ["Société", loc.societe],
          ["Activité", loc.activite],
          ["Créée en", loc.creee_le?.slice(0, 4)],
          ["Dans les lieux depuis", entree ? `${moisAnnee(entree)} · ${anneesDepuis(entree, o.aujourdHui)}` : ""],
          ["Profil", profil],
          [loc.ca && loc.ca_annee ? `Chiffre d'affaires ${loc.ca_annee}` : "Chiffre d'affaires", loc.ca ? `${eur(loc.ca)} (comptes publiés)` : ""],
          ["Taux d'effort", r.tauxEffort !== undefined ? `${pct(r.tauxEffort, 1)} du chiffre d'affaires` : ""],
        ])
      : garder([
          ["Activité", loc.activite],
          ["Exploitant", loc.creee_le ? `Société créée en ${loc.creee_le.slice(0, 4)}` : ""],
          ["Dans les lieux depuis", entree ? `${moisAnnee(entree)} · ${anneesDepuis(entree, o.aujourdHui)}` : ""],
          ["Profil", profil],
          ["Chiffre d'affaires", loc.ca || loc.ca_declare ? "Communiqué sur demande" : ""],
        ]);
    const chiffres = [
      r.rendement !== undefined ? { valeur: pct(r.rendement, 2), libelle: "rendement brut" } : null,
      r.loyerM2 !== undefined ? { valeur: `${r.loyerM2.toLocaleString("fr-FR").replace(/[  ]/g, " ")} €`, libelle: "loyer par m² et par an" } : null,
      r.prixM2 !== undefined ? { valeur: `${r.prixM2.toLocaleString("fr-FR").replace(/[  ]/g, " ")} €`, libelle: "prix par m²" } : null,
    ].filter((x): x is { valeur: string; libelle: string } => !!x);
    const reste = [bail.taxe_fonciere, bail.charges_copro, bail.gros_travaux].some(Boolean)
      ? ([["Taxe foncière", bail.taxe_fonciere], ["Charges de copropriété", bail.charges_copro], ["Gros travaux", bail.gros_travaux]] as const)
          .filter(([, q]) => q === "Le bailleur").map(([k]) => k.toLowerCase())
      : null;
    const lecture = garder([
      ["Prochaine révision", enLettres(r.prochaineRevision)],
      ["Reste à la charge du bailleur", reste === null ? "" : reste.length ? reste.join(", ") : "rien, hors vacance"],
    ]);
    if (lignes.length || chiffres.length) out.locataire = { nomme, lignes, chiffres, lecture };
  }

  /* --- La copropriété --- */
  const annee = chargesAnnuelles(copro);
  const lignesCopro = garder([
    ["Nombre de lots", copro.lots_total ? `${copro.lots_total}${copro.lots_principaux ? `, dont ${copro.lots_principaux} principaux` : ""}` : ""],
    ["Syndic", copro.syndic],
    ["Immatriculation", copro.immatriculation],
    ["Règlement", copro.reglement],
    ["Procédure en cours", copro.procedure],
    ["Chauffage, eau", copro.chauffage],
    ["Fonds de travaux", copro.fonds_travaux ? `${eur(copro.fonds_travaux)}${copro.fonds_travaux_au ? ` au ${enLettres(copro.fonds_travaux_au)}` : ""}` : ""],
  ]);
  /* Une ligne par lot de copropriété : deux lots sous un même bail gardent
     chacun leurs tantièmes (MAV, 20/11). */
  const nb = (n: number) => n.toLocaleString("fr-FR").replace(/\s/g, " ");
  const sur = (t: number) => `${nb(t)}${copro.tantiemes_base ? ` / ${nb(copro.tantiemes_base)}` : ""}`;
  const lotsCopro = (copro.lots ?? []).filter((l) => (l.numero ?? "").trim() || (l.designation ?? "").trim() || l.tantiemes);
  const vendus = tantiemesVendus(copro);
  const lotsVendus: [string, string][] = lotsCopro.map((l) => [
    [l.numero?.trim() ? `Lot n° ${l.numero.trim()}` : "Lot", l.designation?.trim()].filter(Boolean).join(" — "),
    lotsCopro.length > 1 && l.tantiemes ? `${sur(l.tantiemes)} tantièmes` : "compris dans la vente",
  ]);
  const lot = garder([
    ...lotsVendus,
    [lotsVendus.length > 1 ? "Tantièmes, ensemble" : "Tantièmes généraux", vendus ? sur(vendus) : ""],
    ["Charges", copro.charges_trimestre ? `${eur(copro.charges_trimestre)} par trimestre · ${eur(annee)} par an` : ""],
    ["dont récupérables", copro.charges_recuperables ? `${eur(copro.charges_recuperables)} par an` : ""],
    ["Fonds de travaux, part du lot", copro.fonds_travaux_lot ? `${eur(copro.fonds_travaux_lot)} par an` : ""],
    ["Usage permis", copro.usage],
  ]);
  const travaux = (copro.travaux ?? []).filter((t) => (t.libelle ?? "").trim()).map((t) => ({
    libelle: t.libelle.trim(), montant: eur(t.montant), part: eur(t.part), appels: t.appels ?? "", charge: t.charge ?? "",
  }));
  /* Les concurrents se notent pour l'agent : ils ne s'impriment pas. */
  const emplacement = garder([
    ["Qualité de l'emplacement", emp.qualite],
    ["La rue", emp.rue],
    ["Vitrine", emp.vitrine],
    ["Terrasse", emp.terrasse],
    ["Livraisons", emp.livraisons],
    ["Stationnement", emp.stationnement],
    ["Transports", emp.transports],
    ["Commerces voisins", emp.voisins],
    ["Locomotives", emp.locomotives],
    ["Projets du quartier", emp.projets],
  ]);
  if (emplacement.length) out.emplacement = emplacement;
  if (lignesCopro.length || lot.length || travaux.length || copro.resume || copro.a_prevoir) {
    out.copro = {
      lignes: lignesCopro, lot, travaux,
      assemblee: enLettres(copro.ag_date) || undefined,
      resume: copro.resume?.trim() || undefined,
      aPrevoir: copro.a_prevoir?.trim() || undefined,
    };
  }
  return out;
}
