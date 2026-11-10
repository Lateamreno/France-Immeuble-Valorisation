// Le loyer HC du secteur pour UN lot (#608, MAV 10/11) : « quand je clique sur
// le loyer potentiel d'un lot, ressors-moi le loyer hors charges du secteur
// selon la typologie du bien, le secteur et les m², avec le détail du calcul
// au survol ».
//
// Le calcul part de la valeur RETENUE du secteur (`bo_prix_secteur`, saisie
// et vérifiée par l'agent, en loyer mensuel au m², hors charges comme tout le
// BO). Pour un logement, elle est ajustée à la typologie par le rapport que
// donne la Carte des loyers du ministère dans la commune : un T1-T2 se loue
// plus cher au m² qu'un T3, une maison moins cher qu'un appartement. Le
// rapport efface la différence charges comprises / hors charges du ministère :
// seule la valeur retenue donne le niveau.
//
// Module pur : rien n'est lu ici, l'action serveur fournit les données.

export type Typologie = "t12" | "t3" | "maison" | "tous";

export function typologieDuLot(typeLot: string): Typologie {
  const t = typeLot.toLowerCase();
  if (/maison|pavillon/.test(t)) return "maison";
  if (/studio|chambre|\bt1\b|\bt2\b|\bf1\b|\bf2\b/.test(t)) return "t12";
  if (/\bt[3-9]\b|\bf[3-9]\b/.test(t)) return "t3";
  return "tous";
}

export const LIBELLE_TYPOLOGIE: Record<Typologie, string> = {
  t12: "appartements de 1 ou 2 pièces", t3: "appartements de 3 pièces ou plus", maison: "maisons", tous: "tous appartements",
};

export type CarteLoyers = {
  commune: string; millesime: number;
  tous?: number; t12?: number; t3?: number; maison?: number;
};

export type LoyerSecteur =
  | { ok: true; loyer: number; detail: string[]; source: "retenu" | "ville" | "carte" }
  | { ok: false; raison: string };

const fr = (n: number, d = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** La clé de `bo_prix_secteur` de chaque destination. */
const PREFIXE: Record<string, string> = {
  Logement: "hab", Commerce: "com", Bureau: "bur", Logistique: "log", Parking: "parking", Cave: "cave",
};

export function calculerLoyerSecteur(entree: {
  destination: string; typeLot: string; surface?: number;
  secteur: Record<string, unknown> | null; carte?: CarteLoyers | null;
}): LoyerSecteur {
  const { destination, typeLot, surface, secteur, carte } = entree;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : typeof v === "string" && Number(v) > 0 ? Number(v) : undefined);
  const prefixe = PREFIXE[destination];
  if (!prefixe) return { ok: false, raison: "Choisissez d'abord la destination du lot." };

  /* Caves et parkings : un loyer par unité, pas au m². */
  if (destination === "Cave" || destination === "Parking") {
    const u = n(secteur?.[`${prefixe}_loyer_retenu`]) ?? n(secteur?.[`${prefixe}_loyer_moyen`]);
    if (!u) return { ok: false, raison: `Pas de loyer ${destination === "Cave" ? "de cave" : "de parking"} retenu pour le secteur (Emplacement › valeurs du secteur).` };
    return { ok: true, loyer: Math.round(u), source: "retenu", detail: [`Loyer retenu du secteur : ${fr(u)} € HC par ${destination === "Cave" ? "cave" : "place"} et par mois.`] };
  }

  if (!surface || surface <= 0) return { ok: false, raison: "Renseignez la surface du lot (Carrez, à défaut au sol)." };

  const retenu = n(secteur?.[`${prefixe}_loyer_retenu`]);
  const moyenVille = destination === "Logement" ? n(secteur?.hab_loyer_ville_moyen) : n(secteur?.[`${prefixe}_loyer_moyen`]);
  const annuel = destination !== "Logement";
  const parM2 = (v: number) => annuel ? `${fr(v * 12)} €/m²/an HC` : `${fr(v, 2)} €/m²/mois HC`;

  let base = retenu ?? moyenVille;
  const detail: string[] = [];
  let source: "retenu" | "ville" | "carte" = retenu ? "retenu" : "ville";
  if (base) {
    detail.push(`${retenu ? "Loyer retenu du secteur" : "Loyer moyen de la ville (pas de valeur retenue)"} : ${parM2(base)}.`);
  }

  if (destination === "Logement") {
    const typo = typologieDuLot(typeLot);
    const valTypo = carte ? carte[typo] ?? carte.tous : undefined;
    if (base && carte?.tous && valTypo && typo !== "tous") {
      const coef = valTypo / carte.tous;
      detail.push(`Typologie ${typeLot || "n.c."} : ${LIBELLE_TYPOLOGIE[typo]} à ${carte.commune}, ${fr(valTypo, 1)} €/m² contre ${fr(carte.tous, 1)} €/m² tous appartements (Carte des loyers ${carte.millesime}), soit × ${fr(coef, 2)}.`);
      base = base * coef;
      detail.push(`Loyer au m² du lot : ${parM2(base)}.`);
    } else if (base && typo === "tous") {
      detail.push(`Typologie ${typeLot || "non renseignée"} : pas de correctif (valeur tous appartements).`);
    } else if (!base && valTypo && carte) {
      base = valTypo;
      source = "carte";
      detail.push(`Pas de loyer retenu du secteur : loyer d'annonce des ${LIBELLE_TYPOLOGIE[typo === "tous" || !carte[typo] ? "tous" : typo]} à ${carte.commune} (Carte des loyers ${carte.millesime}), ${fr(valTypo, 2)} €/m²/mois — attention, CHARGES COMPRISES.`);
    }
  }

  if (!base) return { ok: false, raison: "Pas de loyer du secteur pour cette destination (Emplacement › valeurs du secteur)." };
  const loyer = Math.round(base * surface);
  detail.push(`× ${fr(surface, surface % 1 ? 1 : 0)} m² = ${fr(loyer)} € ${source === "carte" ? "CC" : "HC"} par mois.`);
  return { ok: true, loyer, detail, source };
}
