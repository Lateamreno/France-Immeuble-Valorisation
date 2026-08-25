/* Relecture d'une estimation passée (tâche #55).
 *
 * Une estimation est figée à sa date. La consulter, c'est voir les chiffres du
 * jour où elle a été faite — pas ceux de la fiche aujourd'hui. Tout est donc
 * lu sur l'enregistrement `bo_estimation`, jamais sur l'immeuble : un lot
 * ajouté depuis, un loyer révisé, un prix du secteur remis à jour ne doivent
 * rien changer à ce qu'on a envoyé au propriétaire.
 */

import { SFX } from "@/lib/bo/dossier";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Une ligne de l'état locatif tel qu'il était. */
export type LigneLecture = {
  dest: string;
  lots?: number;
  surface?: number;
  surfaceOcc?: number;
  loyer?: number;
  loyerMax?: number;
  refLoyer?: number;
  refPrix?: number;
  refRenta?: number;
};

export type Champ = { label: string; valeur?: string; note?: string };
export type Bloc = { titre: string; champs: Champ[] };

export type EstimationLecture = {
  id: string;
  titre: string;
  date: string;
  statut?: string;
  envoyeeLe?: string;
  auteur?: string;
  adresse: string;
  photo?: string;
  /** Chemin du PDF au coffre, s'il y est. */
  lignes: LigneLecture[];
  blocs: Bloc[];
  prix: { hai?: number; honosPct?: number; nv?: number; m2?: number; renta?: number };
  scores: { emp?: number; bati?: number; lot?: number };
  cibles: string[];
  analyse?: string;
};

const eur = (v?: number) => (v === undefined ? undefined : `${Math.round(v).toLocaleString("fr-FR")} €`);
const m2 = (v?: number) => (v === undefined ? undefined : `${Math.round(v).toLocaleString("fr-FR")} m²`);
const pct = (v?: number) => (v === undefined ? undefined : `${v.toFixed(1).replace(".", ",")} %`);
const jjmmaa = (v: unknown) => {
  const s = txt(v);
  return s ? s.slice(0, 10).split("-").reverse().join("/") : undefined;
};

export function lireEstimation(
  e: Record<string, unknown>,
  agent: Record<string, unknown> | null,
): EstimationLecture {
  const dests = Array.isArray(e.imm_Destinations) ? (e.imm_Destinations as unknown[]).map(String) : [];

  const lignes: LigneLecture[] = dests.map((d) => {
    const s = SFX[d] ?? "autre";
    return {
      dest: d,
      lots: num(e[`imm_nb_lots_${s}`]),
      surface: num(e[`imm_carrez_tot_${s}`]),
      surfaceOcc: num(e[`imm_carrez_occ_${s}`]),
      loyer: num(e[`imm_loyer_hc_${s}`]),
      loyerMax: num(e[`imm_loyer_hc_max_${s}`]),
      refLoyer: num(e[`ref_loyer_${s}`]),
      refPrix: num(e[`ref_prix_${s}`]),
      refRenta: num(e[`ref_renta_${s}`]),
    };
  });

  const hai = num(e.prix_hai);
  /* Le net vendeur a changé de nom côté Bubble : on accepte les deux, sinon
     les estimations d'avant le renommage s'afficheraient sans. */
  const nvEnregistre = num(e.prix_nv) ?? num(e["[SUPPR] prix_nv"]);
  /* Le taux d'honoraires n'est stocké que sur les estimations récentes. Quand
     il manque mais qu'on a le HAI et le net vendeur, il se déduit — afficher
     un tiret entre deux chiffres qui le donnent serait absurde. */
  const honosPct = num(e["honos_taux_%"])
    ?? (hai && nvEnregistre && nvEnregistre > 0 ? (hai / nvEnregistre - 1) * 100 : undefined);
  const nv = nvEnregistre
    ?? (hai && honosPct ? Math.round(hai / (1 + honosPct / 100)) : undefined);
  const carrez = num(e.imm_carrez_tot_tot);
  const loyers = num(e.imm_loyer_hc_tot);

  const blocs: Bloc[] = [
    {
      titre: "L'immeuble ce jour-là",
      champs: [
        { label: "Lots", valeur: num(e.imm_nb_lots_tot)?.toString() },
        { label: "Surface Carrez", valeur: m2(carrez) },
        { label: "Surface occupée", valeur: m2(num(e.imm_carrez_occ_tot)) },
        { label: "Taux d'occupation", valeur: pct(num(e.imm_occupation)) },
        { label: "Loyers HC annuels", valeur: eur(loyers) },
        { label: "Loyers HC potentiels", valeur: eur(num(e.imm_loyer_hc_max_tot)) },
      ],
    },
    {
      titre: "Emplacement",
      champs: [
        {
          label: "Gare la plus proche",
          valeur: txt(e.emp_gare_name),
          note: num(e["emp_gare_durée"]) ? `${num(e["emp_gare_durée"])} min` : undefined,
        },
        {
          label: "Commerces",
          valeur: txt(e.emp_com_name),
          note: num(e["emp_com_durée"]) ? `${num(e["emp_com_durée"])} min` : undefined,
        },
      ],
    },
    {
      titre: "Charges et travaux",
      champs: [
        { label: "Taxe foncière non récupérable", valeur: eur(num(e.charges_tf_non_recup)) },
        { label: "Autres charges non récupérables", valeur: eur(num(e.charges_autres_non_recup)) },
        { label: "Total charges non récupérables", valeur: eur(num(e.charges_tot_non_recup)) },
        { label: "Travaux sur le bâti", valeur: eur(num(e.travaux_bati)) },
        { label: "Travaux sur les lots", valeur: eur(num(e.travaux_lots)) },
        { label: "Total travaux", valeur: eur(num(e.travaux_tot)) },
      ],
    },
    {
      titre: "Le secteur retenu ce jour-là",
      champs: [
        { label: "Loyer moyen du secteur", valeur: num(e.ref_loyer_all) ? `${num(e.ref_loyer_all)!.toFixed(1).replace(".", ",")} €/m²/mois` : undefined },
        { label: "Prix moyen du secteur", valeur: num(e.ref_prix_all) ? `${Math.round(num(e.ref_prix_all)!).toLocaleString("fr-FR")} €/m²` : undefined },
        { label: "Rendement attendu", valeur: pct(num(e.ref_renta_all)) },
        { label: "Références mises à jour le", valeur: jjmmaa(e.date_maj_secteur) },
      ],
    },
  ];

  return {
    id: String(e._id),
    titre: txt(e.titre) ?? "Estimation",
    date: jjmmaa(e["Created Date"]) ?? "?",
    statut: txt(e.Statut),
    envoyeeLe: jjmmaa(e.date_envoi),
    auteur: agent ? `${txt(agent["prénom"]) ?? ""} ${txt(agent.nom) ?? ""}`.trim() || undefined : undefined,
    adresse: [
      [txt(e["adresse_numéro_rue"]), txt(e.adresse_rue)].filter(Boolean).join(" "),
      [txt(e.adresse_zipcode), txt(e.adresse_ville)].filter(Boolean).join(" "),
    ].filter(Boolean).join(", "),
    photo: txt(e.photo),
    lignes,
    blocs,
    prix: {
      hai, honosPct, nv,
      m2: hai && carrez ? hai / carrez : undefined,
      renta: hai && loyers ? (loyers / hai) * 100 : undefined,
    },
    scores: {
      emp: num(e.Score_emp) ?? (txt(e.Score_emp) ? Number(txt(e.Score_emp)) : undefined),
      bati: num(e.Score_bati) ?? (txt(e.Score_bati) ? Number(txt(e.Score_bati)) : undefined),
      lot: num(e.Score_lot) ?? (txt(e.Score_lot) ? Number(txt(e.Score_lot)) : undefined),
    },
    cibles: Array.isArray(e.Cibles) ? (e.Cibles as unknown[]).map(String) : [],
    analyse: txt(e.analyse),
  };
}
