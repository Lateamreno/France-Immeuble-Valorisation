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

import { useEffect, useRef, useState } from "react";
import { euros, group } from "@/lib/format";
import { ventilerHai } from "@/lib/bareme";
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
  bornes, pRendementMax, pM2, hai, onHai, honosPct, libre,
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
  /**
   * Retour #590 — « on devrait pouvoir sélectionner un prix moins cher, donc
   * changer le prix à la main en le rentrant dans la case de prix et avec la
   * molette ». Le montant devient une case, la molette le règle par 1 000 €
   * (10 000 € avec Maj), et la règle s'élargit jusqu'au prix tapé au lieu de
   * le ramener dans ses bornes. Réservé à la recherche d'acquéreurs :
   * l'estimation a déjà sa case « Prix HAI » juste au-dessus.
   */
  libre?: boolean;
}) {
  const [saisie, setSaisie] = useState<string | null>(null);
  const regle = useRef<HTMLInputElement>(null);
  const caseMontant = useRef<HTMLInputElement>(null);
  /* Les écouteurs de molette sont posés une fois : ils lisent le prix et la
     fonction du moment par ces références. */
  const courant = useRef({ hai, onHai });
  courant.current = { hai, onHai };

  useEffect(() => {
    if (!libre) return;
    /* `passive: false` : sans lui, la molette fait aussi défiler la fenêtre. */
    const molette = (e: WheelEvent) => {
      e.preventDefault();
      const pas = e.shiftKey ? 10_000 : 1_000;
      const { hai: h, onHai: maj } = courant.current;
      const base = Math.round(h / 1_000) * 1_000;
      maj(Math.max(1_000, base + (e.deltaY < 0 ? pas : -pas)));
    };
    const els = [regle.current, caseMontant.current].filter((x): x is HTMLInputElement => !!x);
    els.forEach((el) => el.addEventListener("wheel", molette, { passive: false }));
    return () => els.forEach((el) => el.removeEventListener("wheel", molette));
  }, [libre, bornes]);

  if (!bornes) return null;
  /* En mode libre, la règle descend 30 % sous le plus bas du prix et de ses
     bornes : on doit pouvoir glisser vers un prix moins cher, pas seulement
     le taper (vu sur Paris 18 : le prix du bien était déjà au bout de la
     règle, rien ne permettait d'aller en dessous). */
  const min = libre && hai > 0
    ? Math.max(1_000, Math.floor((Math.min(bornes.min, hai) * 0.7) / 10_000) * 10_000)
    : bornes.min;
  const max = libre ? Math.max(bornes.max, Math.ceil(hai / 1_000) * 1_000) : bornes.max;
  /* Le barème toujours, minimum compris (MAV, 03/11). */
  const ventil = ventilerHai(hai, honosPct >= 0 ? honosPct : undefined);
  const nv = ventil.nv;
  const honos = ventil.honos;
  const pos = (v: number) => `${((v - min) / (max - min || 1)) * 100}%`;
  return (
    <div className="pxbar">
      <input ref={regle} type="range" min={min} max={max} step={1000} value={hai}
        aria-label="Prix HAI"
        onChange={(e) => onHai(Number(e.target.value))}
        style={{ ["--p" as string]: pos(hai) }} />
      <div className="pxbar-reps">
        {/* Deux repères, pas quatre : les « max » disaient la même chose
            décalée et on ne savait plus lequel viser (#162). Pour le rendement
            du secteur, c'est le potentiel — un acquéreur capitalise ce que
            l'immeuble rapportera une fois reloué (#275). */}
        {([["Rendement secteur", pRendementMax], ["Prix m² secteur", pM2]] as const)
          .filter(([, v]) => v > 0 && v >= min && v <= max)
          .map(([l, v], i) => (
            <button key={l} type="button" className={`rep${i % 2 ? " bas" : ""}`}
              title={`Caler sur ${l} — ${euros(v)}`} style={{ left: pos(v) }}
              onClick={() => onHai(Math.round(v / 1000) * 1000)}>
              <i /><span>{l}</span>
            </button>
          ))}
      </div>
      <div className="pxbar-val">
        {libre ? (
          <label className="pxbar-case" title="Tapez le prix, ou réglez-le à la molette (Maj : par 10 000 €)">
            <input ref={caseMontant} inputMode="numeric" aria-label="Prix HAI en euros"
              value={saisie ?? group(hai)}
              size={Math.max(7, (saisie ?? group(hai)).length)}
              onFocus={(e) => { setSaisie(String(hai)); requestAnimationFrame(() => e.target.select()); }}
              onChange={(e) => {
                const chiffres = e.target.value.replace(/\D/g, "").slice(0, 10);
                setSaisie(chiffres);
                if (chiffres) onHai(Number(chiffres));
              }}
              onBlur={() => setSaisie(null)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            <b aria-hidden>€</b>
          </label>
        ) : (
          <b>{euros(hai) ?? "—"}</b>
        )}
        <span>HAI</span>
        <em>
          {group(nv)} € net vendeur · {group(honos)} € d&apos;honoraires ({taux(ventil.taux)} %
          {ventil.auMinimum ? ", minimum du barème" : ""})
        </em>
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
