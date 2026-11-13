// Le prix d'une délégation de mandat (MAV, 10/11) : « les honos c'est en
// pourcentage du prix net vendeur et c'est exprimé en TTC […] il faut aussi
// pouvoir mettre le prix comme on le fait dans les mandats ».
//
// Mêmes quatre cases que l'onglet Prix d'un mandat (HAI, net vendeur,
// honoraires, taux), même règle : le dernier MONTANT tapé (net vendeur ou HAI)
// est l'ancre, et le taux ou les honoraires tapés en dernier tiennent. Une
// différence, voulue : le barème de France Immeuble ne s'applique pas. Les
// honoraires d'une délégation sont ceux du mandat de l'agence délégante ; les
// borner à notre barème réécrirait un chiffre signé ailleurs.
//
// Module pur : l'écran calcule, le serveur recalcule pour vérifier.

export type PrixDelegation = { nv?: number; hai?: number; taux?: number; honos?: number };
export type CaseDelegation = keyof PrixDelegation;

const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Le montant qui tient : le dernier net vendeur ou HAI tapé ; le net vendeur à défaut. */
export function ancreDelegation(pilotes: CaseDelegation[]): "nv" | "hai" {
  for (let i = pilotes.length - 1; i >= 0; i--) {
    if (pilotes[i] === "nv" || pilotes[i] === "hai") return pilotes[i] as "nv" | "hai";
  }
  return "nv";
}

/** Le dernier tapé entre taux et honoraires : celui qui tient. Le taux à défaut. */
function rapportDelegation(pilotes: CaseDelegation[]): "taux" | "honos" {
  for (let i = pilotes.length - 1; i >= 0; i--) {
    if (pilotes[i] === "taux" || pilotes[i] === "honos") return pilotes[i] as "taux" | "honos";
  }
  return "taux";
}

/**
 * Les quatre cases à partir de ce qui a été tapé. Le taux est un pourcentage
 * du NET VENDEUR : honoraires TTC = net vendeur × taux ; HAI = net + honoraires.
 */
export function resoudreDelegation(p: PrixDelegation, pilotes: CaseDelegation[]): PrixDelegation {
  const ancre = ancreDelegation(pilotes);
  const rapport = rapportDelegation(pilotes);
  const nv = pos(p.nv), hai = pos(p.hai), taux = pos(p.taux), honos = pos(p.honos);

  if (ancre === "nv") {
    if (!nv) return { nv: undefined, hai, taux, honos };
    if (rapport === "honos" && honos !== undefined) return { nv: r0(nv), honos: r0(honos), taux: r2((honos / nv) * 100), hai: r0(nv + honos) };
    if (taux !== undefined) { const h = r0((nv * taux) / 100); return { nv: r0(nv), taux: r2(taux), honos: h, hai: r0(nv) + h }; }
    return { nv: r0(nv), hai: undefined, taux: undefined, honos: undefined };
  }
  if (!hai) return { nv, hai: undefined, taux, honos };
  if (rapport === "honos" && honos !== undefined && honos < hai) {
    const n = hai - honos;
    return { hai: r0(hai), honos: r0(honos), nv: r0(n), taux: r2((honos / n) * 100) };
  }
  if (taux !== undefined) {
    const n = r0(hai / (1 + taux / 100));
    return { hai: r0(hai), taux: r2(taux), nv: n, honos: r0(hai) - n };
  }
  return { hai: r0(hai), nv: undefined, taux: undefined, honos: undefined };
}

/** Pourquoi ce prix ne peut pas être enregistré, ou null. */
export function refusPrixDelegation(p: PrixDelegation): string | null {
  if (!pos(p.nv)) return "Indiquez le prix (net vendeur ou HAI).";
  if (!pos(p.taux) || !pos(p.honos)) return "Indiquez les honoraires (taux du net vendeur, ou montant TTC).";
  if (!pos(p.hai)) return "Le prix HAI n'a pas pu être calculé.";
  if (Math.abs(p.nv! + p.honos! - p.hai!) > 2) return "Le prix HAI doit être le net vendeur plus les honoraires.";
  return null;
}
