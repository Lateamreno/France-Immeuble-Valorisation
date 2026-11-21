// Les chiffres d'un dossier de vente, tels que le client les lit.
//
// MAV (03/11) : « il faut que les rendements et prix au m² correspondent
// toujours au dossier que j'envoie, et tu dois me dire s'il y a une
// différence entre le dossier que j'envoie et le mandat ».
//
// L'e-mail, le SMS et la carte RCS prenaient leurs chiffres sur la FICHE du
// bien, qui bouge (un loyer retouché, des travaux ajoutés), alors que le PDF
// joint est figé au jour de sa fabrication. Ils les prennent désormais sur le
// DOSSIER choisi :
//   1. `chiffres_pdf`, posé au moment où le PDF est fabriqué, depuis le calcul
//      même qui l'imprime (lib/bo/dossier-vente.ts) ;
//   2. à défaut (dossiers plus anciens, ceux de l'ancien BO compris), les
//      chiffres que le dossier a gardés à sa création.
// Sans module serveur : l'assistant (navigateur) et les envois (serveur) en
// ont besoin tous les deux.

const N = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v)
      : undefined;

export type ChiffresDossier = {
  prixHai?: number;
  prixNv?: number;
  /** Taux d'honoraires en % du net vendeur (5 pour 5 %). */
  honosPct?: number;
  surface?: number;
  /** Prix HAI ÷ surface : le prix au m² ACTUEL, avant travaux. */
  prixM2?: number;
  /** Occupation en % de la surface. */
  occupation?: number;
  /** Rendement brut actuel, en %. */
  rentaActuelle?: number;
  /** Rendement brut potentiel : loyers potentiels ÷ (prix HAI + travaux), en %. */
  rentaPotentielle?: number;
  travaux?: number;
  /** D'où viennent les chiffres : le PDF lui-même, ou la création du dossier. */
  source: "pdf" | "dossier";
};

/** Les chiffres que porte le dossier — ceux du PDF quand ils sont connus. */
export function chiffresDossier(d: Record<string, unknown> | null | undefined): ChiffresDossier | null {
  if (!d) return null;
  const p = d.chiffres_pdf;
  if (p && typeof p === "object") {
    const c = p as Record<string, unknown>;
    if (N(c.prix_hai)) {
      return {
        prixHai: N(c.prix_hai), prixNv: N(c.prix_nv), honosPct: N(c.honos_pct),
        surface: N(c.surface), prixM2: N(c.prix_m2), occupation: N(c.occupation),
        rentaActuelle: N(c.renta_actuelle), rentaPotentielle: N(c.renta_potentielle),
        travaux: N(c.travaux), source: "pdf",
      };
    }
  }
  const hai = N(d.prix_hai);
  if (!hai) return null;
  const surface = N(d.surface);
  const travaux = N(d.travaux) ?? 0;
  const lmax = N(d.loyer_hc_an_max);
  /* « honos_taux_x,xx » est une fraction (0,05) ; « honos_taux_% » un taux. */
  const taux = N(d["honos_taux_%"]) ?? (N(d["honos_taux_x,xx"]) !== undefined ? Math.round(N(d["honos_taux_x,xx"])! * 10000) / 100 : undefined);
  return {
    prixHai: hai,
    prixNv: N(d.prix_nv),
    honosPct: taux,
    surface,
    prixM2: surface && surface > 0 ? Math.round(hai / surface) : undefined,
    occupation: N(d.occupation),
    rentaActuelle: N(d.renta_actuelle),
    rentaPotentielle: N(d.renta_max) ?? (lmax && lmax > 0 ? Math.round((lmax / (hai + travaux)) * 1000) / 10 : undefined),
    travaux,
    source: "dossier",
  };
}

const eur = (x: number) => `${Math.round(x).toLocaleString("fr-FR").replace(/ | /g, " ")} €`;
const pct = (x: number) => `${String(Math.round(x * 100) / 100).replace(".", ",")} %`;

export type EcartMandat = { quoi: string; dossier: string; mandat: string };

/**
 * Ce qui diffère entre le dossier envoyé et le mandat : prix HAI, net vendeur,
 * taux d'honoraires. Une liste vide veut dire « concordants » — ou qu'il n'y
 * a rien à comparer (pas de mandat, pas de prix dans le dossier).
 */
export function ecartsDossierMandat(
  d: Record<string, unknown> | null | undefined,
  m: Record<string, unknown> | null | undefined,
): EcartMandat[] {
  const c = chiffresDossier(d);
  if (!c || !m) return [];
  const out: EcartMandat[] = [];
  const mHai = N(m.prix_hai), mNv = N(m.prix_nv), mTaux = N(m.honos_taux);
  /* Un euro d'écart est un arrondi, pas une différence. */
  if (c.prixHai !== undefined && mHai !== undefined && Math.abs(c.prixHai - mHai) > 1) {
    out.push({ quoi: "Prix HAI", dossier: eur(c.prixHai), mandat: eur(mHai) });
  }
  if (c.prixNv !== undefined && mNv !== undefined && Math.abs(c.prixNv - mNv) > 1) {
    out.push({ quoi: "Net vendeur", dossier: eur(c.prixNv), mandat: eur(mNv) });
  }
  if (c.honosPct !== undefined && mTaux !== undefined && Math.abs(c.honosPct - mTaux) > 0.01) {
    out.push({ quoi: "Honoraires", dossier: pct(c.honosPct), mandat: pct(mTaux) });
  }
  return out;
}

/**
 * Le mandat auquel comparer un dossier, quand l'écran n'en a pas choisi :
 * le dernier mandat de vente qui n'est ni annulé ni terminé, signé d'abord.
 */
export function mandatDeReference(mandats: Record<string, unknown>[]): Record<string, unknown> | undefined {
  const vivants = mandats.filter((m) => !/annul|termin|expir|résili|resili/i.test(String(m.Statut ?? "")));
  const date = (m: Record<string, unknown>) => String(m.date_signature ?? m.date_effet ?? m["Created Date"] ?? "");
  const tri = (a: Record<string, unknown>, b: Record<string, unknown>) => date(b).localeCompare(date(a));
  const signes = vivants.filter((m) => m.date_signature || m.pdf_signed).sort(tri);
  return signes[0] ?? vivants.sort(tri)[0];
}
