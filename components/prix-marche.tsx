"use client";

/**
 * Le curseur de prix et le tableau « Actuel / Potentiel » (retours #324, #326).
 *
 * Ces deux briques sont nées dans l'écran d'estimation. MAV les a redemandées
 * dans la recherche d'acquéreurs — « le même tableau actuel/potentiel que
 * d'habitude » — et c'est bien la même chose qu'il faut, au pixel comme au
 * calcul : un rendement affiché différemment d'un écran à l'autre pour le même
 * immeuble ferait douter des deux. D'où l'extraction, plutôt qu'une copie.
 *
 * Les classes CSS (`pxbar`, `est-cmps`…) restent celles de l'estimation : le BO
 * n'a qu'une tenue.
 */

import { euros, group } from "@/lib/format";
import {
  type AggLocatif, type RefsMarche,
  ecartRef, loyerM2Actuel, loyerM2Potentiel,
} from "@/lib/bo/marche";

const fr1 = (x: number) => x.toFixed(1).replace(".", ",");
/** Un taux tel qu'on l'écrit : « 5 % », « 4,5 % » — pas « 5,0 % ». */
const taux = (x: number) => String(x).replace(".", ",");

/**
 * La règle de prix, avec ses repères de marché et le montant en gros dessous
 * (retours #162, #275, #284).
 */
export function CurseurPrix({
  bornes, pRendementMax, pM2, hai, onHai, honosPct,
}: {
  /** Les bornes de la règle ; `null` quand aucune méthode n'aboutit. */
  bornes: { min: number; max: number } | null;
  /** Repère « rendement du secteur », sur les loyers potentiels. */
  pRendementMax: number;
  /** Repère « prix au m² du secteur ». */
  pM2: number;
  hai: number;
  onHai: (v: number) => void;
  /** Taux d'honoraires, pour décomposer le montant sous la règle. */
  honosPct: number;
}) {
  if (!bornes) return null;
  const nv = honosPct >= 0 ? Math.round(hai / (1 + honosPct / 100)) : hai;
  const honos = hai - nv;
  const pos = (v: number) => `${((v - bornes.min) / (bornes.max - bornes.min)) * 100}%`;
  return (
    <div className="pxbar">
      <input type="range" min={bornes.min} max={bornes.max} step={1000} value={hai}
        onChange={(e) => onHai(Number(e.target.value))}
        style={{ ["--p" as string]: pos(hai) }} />
      <div className="pxbar-reps">
        {/* Deux repères, pas quatre : les « max » disaient la même chose
            décalée et on ne savait plus lequel viser (#162). Pour le rendement
            du secteur, c'est le potentiel — un acquéreur capitalise ce que
            l'immeuble rapportera une fois reloué (#275). */}
        {([["Rendement secteur", pRendementMax], ["Prix m² secteur", pM2]] as const)
          .filter(([, v]) => v > 0)
          .map(([l, v], i) => (
            <button key={l} type="button" className={`rep${i % 2 ? " bas" : ""}`}
              title={`Caler sur ${l} — ${euros(v)}`} style={{ left: pos(v) }}
              onClick={() => onHai(Math.round(v / 1000) * 1000)}>
              <i /><span>{l}</span>
            </button>
          ))}
      </div>
      <div className="pxbar-val">
        <b>{euros(hai) ?? "—"}</b>
        <span>HAI</span>
        <em>{group(nv)} € net vendeur · {group(honos)} € d&apos;honoraires ({taux(honosPct)} %)</em>
      </div>
    </div>
  );
}

/**
 * Les deux colonnes « Actuel » et « Potentiel » : loyer au m², prix au m²,
 * rendement brut, net et acte en main, chacun avec son écart au secteur.
 */
export function TableauActuelPotentiel({
  agg, refs, hai, travaux, chargesTot,
}: {
  agg: AggLocatif;
  refs: RefsMarche;
  hai: number;
  /** Travaux à prévoir : ils s'ajoutent au prix pour le calcul du potentiel. */
  travaux: number;
  /** Charges annuelles, pour le rendement net. */
  chargesTot: number;
}) {
  const lm2Act = loyerM2Actuel(agg);
  const lm2Max = loyerM2Potentiel(agg);
  return (
    <div className="est-cmps">
      {([
        ["Actuel", agg.loyersAn, lm2Act, hai],
        ["Potentiel", agg.loyersMaxAn, lm2Max, hai + travaux],
      ] as const).map(([titre, loyerAn, lm2, prix]) => {
        const eLoyer = ecartRef(lm2, refs.loyer);
        const pm2 = agg.carrez > 0 ? prix / agg.carrez : 0;
        const ePrix = ecartRef(pm2, refs.prix);
        const brut = prix > 0 ? (loyerAn / prix) * 100 : 0;
        const eBrut = ecartRef(brut, refs.renta);
        return (
          <div className="est-cmp" key={titre}>
            <div className="est-cmp-h">{titre}<i title="Comparaison au secteur">ⓘ</i></div>
            <div className={`l ${eLoyer >= 0 ? "v" : "r"}`}>
              <span>Loyer au m²</span><em>{eLoyer >= 0 ? "+" : ""}{eLoyer} %</em><b>{fr1(lm2)} €/m²/mois</b>
            </div>
            <div className={`l ${ePrix > 0 ? "r" : "v"}`}>
              <span>Prix au m²</span><em>{ePrix >= 0 ? "+" : ""}{ePrix} %</em><b>{group(pm2)} €/m²</b>
            </div>
            <div className={`l ${eBrut >= 0 ? "v" : "r"}`}>
              <span>Brut</span><em>{eBrut >= 0 ? "+" : ""}{eBrut} %</em><b>{fr1(brut)} %</b>
            </div>
            <div className="l n">
              <span>Net</span><b>{prix > 0 ? fr1(((loyerAn - chargesTot) / prix) * 100) : "—"} %</b>
            </div>
            <div className="l n">
              <span>Acte en main</span><b>{prix > 0 ? fr1(((loyerAn - chargesTot) / (prix * 1.075)) * 100) : "—"} %</b>
            </div>
          </div>
        );
      })}
    </div>
  );
}
