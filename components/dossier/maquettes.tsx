"use client";

/* Quatre propositions graphiques pour le dossier d'estimation (tâche #54).
 *
 * Le déroulé est le même dans les quatre, et c'est le point important de la
 * demande : la MÉTHODE d'abord, le PRIX ensuite. Le propriétaire doit
 * comprendre comment on arrive au chiffre avant de le lire — un chiffre reçu
 * sans méthode se discute, un chiffre reçu après la méthode s'explique tout
 * seul, et l'agent a beaucoup moins à justifier.
 *
 *   A — Éditorial clair (crème, bronze, noir)
 *   B — Nocturne (noir, crème, bronze)
 *   C — Curseur de prix, clair
 *   D — Curseur de prix, nocturne
 *
 * A/B et C/D partagent le même corps : seule la peau change, et C/D ajoutent
 * le curseur. Une seule vérité par section, donc pas de risque qu'une
 * proposition dise autre chose qu'une autre.
 */

import { useMemo, useState } from "react";
import type { Dossier } from "@/lib/bo/dossier";
import {
  equilibre, fourchettePrix, positionner, prixM2, rendement,
} from "@/lib/estimation/financement";

export type Variante = "A" | "B" | "C" | "D";

export const VARIANTES: { cle: Variante; nom: string; note: string }[] = [
  { cle: "A", nom: "Éditorial clair", note: "Crème et bronze. Sobre, se lit comme une lettre." },
  { cle: "B", nom: "Nocturne", note: "Fond noir, accents bronze. Haut de gamme, marque forte." },
  { cle: "C", nom: "Curseur — clair", note: "Le propriétaire bouge le prix, tout se recalcule." },
  { cle: "D", nom: "Curseur — nocturne", note: "Le curseur, sur la peau sombre." },
];

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const eur0 = (n: number) => `${Math.round(n).toLocaleString("fr-FR")}`;
const pct = (n: number) => `${n.toFixed(1).replace(".", ",")} %`;

export function Maquette({ d, variante }: { d: Dossier; variante: Variante }) {
  const sombre = variante === "B" || variante === "D";
  const curseur = variante === "C" || variante === "D";

  const [prix, setPrix] = useState(d.prix.hai);
  const bornes = useMemo(() => fourchettePrix(d.prix.hai), [d.prix.hai]);
  /* Sans curseur, le dossier montre le prix estimé, un point c'est tout. */
  const prixCourant = curseur ? prix : d.prix.hai;

  const fin = useMemo(
    () => equilibre(prixCourant, d.loyers, d.charges),
    [prixCourant, d.loyers, d.charges],
  );
  const posPrix = positionner(prixM2(prixCourant, d.carrez), d.ref.prix, "Votre prix au m² est");
  const posLoyer = positionner(d.total.loyerM2, d.ref.loyer, "Vos loyers sont");
  const posRenta = positionner(rendement(prixCourant, d.loyers), d.ref.renta, "Votre rendement est");

  const ecartEstime = Math.round((prixCourant / d.prix.hai - 1) * 100);

  /* Les deux méthodes encadrent le bien ; le prix retenu se place entre elles.
     Sans repère, deux chiffres très écartés (ici du simple au double) laissent
     le propriétaire penser qu'on a choisi au hasard. */
  const fourchette = useMemo(() => {
    const a = d.methodes.m2.prix;
    const b = d.methodes.renta.prix;
    if (!(a > 0) || !(b > 0)) return undefined;
    const bas = Math.min(a, b);
    const haut = Math.max(a, b);
    if (haut === bas) return undefined;
    return {
      bas, haut,
      place: Math.min(100, Math.max(0, ((d.prix.hai - bas) / (haut - bas)) * 100)),
    };
  }, [d.methodes.m2.prix, d.methodes.renta.prix, d.prix.hai]);

  return (
    <article className={`dmq dmq-${variante}${sombre ? " sombre" : ""}`}>
      {/* ---------------------------------------------- Couverture */}
      <section className="dmq-cover">
        <img className="dmq-logo" alt="France Immeuble"
          src={sombre ? "/logos/fi-creme-bronze-fond-sombre.svg" : "/logos/fi-couleur-fond-clair.svg"} />
        <p className="dmq-sur">Avis de valeur</p>
        <h1>{d.adresse || d.ville}</h1>
        <p className="dmq-sous">
          {d.total.lots} lot{d.total.lots > 1 ? "s" : ""} · {eur0(d.carrez)} m² ·{" "}
          {d.occupation > 0 ? `${Math.round(d.occupation)} % occupé` : "libre"}
        </p>
        {d.photo && <img className="dmq-photo" src={d.photo} alt="" />}
        <p className="dmq-date">Établi le {d.date} par {d.agent.nom}</p>
      </section>

      {/* ------------------------------ 1. La méthode, AVANT le prix */}
      <section className="dmq-sec">
        <span className="dmq-num">1</span>
        <h2>Comment nous arrivons à un prix</h2>
        <p className="dmq-chapo">
          Un immeuble de rapport ne se compare pas à un appartement : il ne vaut pas ce que
          vaut le voisin, il vaut ce qu&apos;il rapporte. Nous mesurons donc les deux, et
          l&apos;écart entre les deux dessine la fourchette dans laquelle se trouve votre bien.
        </p>
        <div className="dmq-duo">
          <div className="dmq-carte">
            <span className="dmq-lab">Par la surface</span>
            <b>{eur(d.methodes.m2.prix)}</b>
            <span className="dmq-det">{eur0(d.ref.prix)} €/m² du secteur × {eur0(d.carrez)} m²</span>
          </div>
          <div className="dmq-carte">
            <span className="dmq-lab">Par le rendement</span>
            <b>{eur(d.methodes.renta.prix)}</b>
            <span className="dmq-det">{eur(d.loyers)} de loyers ÷ {pct(d.ref.renta)} attendus</span>
          </div>
        </div>

        {/* Où tombe le prix retenu entre les deux mesures. Le montrer évite la
            question « d'où sort ce chiffre ? », qui vient toujours sinon. */}
        {fourchette && (
          <div className="dmq-entre">
            <div className="dmq-entre-barre">
              <span className="dmq-entre-pt" style={{ left: `${fourchette.place}%` }} />
            </div>
            <div className="dmq-entre-f">
              <span>{eur(fourchette.bas)}</span>
              <b>{eur(d.prix.hai)} retenu</b>
              <span>{eur(fourchette.haut)}</span>
            </div>
          </div>
        )}

        <p className="dmq-verdict">
          {d.methodes.limitant === "renta"
            ? "Le rendement pèse le plus lourd ici : c'est lui qui décidera un investisseur, et c'est donc lui qui tire le prix vers le bas."
            : "La surface pèse le plus lourd ici : les loyers actuels justifieraient davantage, mais le marché du secteur pose une limite."}
          {" "}
          {fourchette && fourchette.place > 66
            ? "Le prix retenu se situe dans le haut de la fourchette : il faudra le défendre, et l'analyse ci-après explique pourquoi il se tient."
            : fourchette && fourchette.place < 33
              ? "Le prix retenu se situe dans le bas de la fourchette : c'est un prix qui se vend vite."
              : "Le prix retenu se situe au milieu des deux mesures."}
        </p>
      </section>

      {/* ------------------------------ 2. Le marché, en clair */}
      <section className="dmq-sec">
        <span className="dmq-num">2</span>
        <h2>Où se situe votre bien dans le marché</h2>
        <div className="dmq-axes">
          {[posLoyer, posPrix, posRenta].filter(Boolean).map((p, i) => (
            <div className="dmq-axe" key={i}>
              <div className="dmq-axe-h">
                <span>{["Loyers pratiqués", "Prix au m²", "Rendement"][i]}</span>
                <b className={`dmq-ton ${p!.ton}`}>{p!.verdict}</b>
              </div>
              <div className="dmq-barre">
                <span className="dmq-ref" style={{ left: "50%" }} />
                <span className="dmq-pt" style={{ left: `${p!.curseur}%` }} />
              </div>
              <div className="dmq-axe-f">
                <span>−30 %</span>
                <span>secteur : {i === 2 ? pct(p!.reference) : i === 0 ? `${p!.reference.toFixed(1).replace(".", ",")} €/m²` : `${eur0(p!.reference)} €/m²`}</span>
                <span>+30 %</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------ 3. Le prix */}
      <section className="dmq-sec dmq-prix">
        <span className="dmq-num">3</span>
        <h2>Le prix que nous vous recommandons</h2>

        {curseur ? (
          <>
            <div className="dmq-slider">
              <output>{eur(prixCourant)}</output>
              <input type="range" min={bornes.bas} max={bornes.haut} step={bornes.pas}
                value={prixCourant} onChange={(e) => setPrix(Number(e.target.value))} />
              <div className="dmq-slider-f">
                <span>{eur(bornes.bas)}</span>
                <span className={`dmq-ecart ${ecartEstime === 0 ? "" : ecartEstime > 0 ? "sur" : "sous"}`}>
                  {ecartEstime === 0
                    ? "Prix recommandé"
                    : `${ecartEstime > 0 ? "+" : ""}${ecartEstime} % par rapport à notre estimation`}
                </span>
                <span>{eur(bornes.haut)}</span>
              </div>
            </div>
            <p className="dmq-chapo">
              Déplacez le curseur : tout ce qui suit se recalcule. C&apos;est exactement ce que
              fera l&apos;acquéreur en face de vous.
            </p>
          </>
        ) : (
          <div className="dmq-grand">
            <b>{eur(d.prix.hai)}</b>
            <span>honoraires inclus · {eur(d.prix.nv)} net vendeur</span>
          </div>
        )}

        <div className="dmq-trio">
          <div><span>Prix au m²</span><b>{eur0(prixM2(prixCourant, d.carrez))} €</b></div>
          <div><span>Rendement brut</span><b>{pct(rendement(prixCourant, d.loyers))}</b></div>
          <div><span>Loyers annuels</span><b>{eur(d.loyers)}</b></div>
        </div>
      </section>

      {/* ------------------------------ 4. L'apport — l'argument oral */}
      <section className="dmq-sec dmq-fin">
        <span className="dmq-num">4</span>
        <h2>Ce que votre acquéreur devra sortir de sa poche</h2>
        <p className="dmq-chapo">
          C&apos;est la question que se pose tout investisseur devant votre immeuble.
          À ce prix, avec un crédit sur {fin.hypotheses.duree} ans, voici sa réponse.
        </p>

        <div className="dmq-fin-grand">
          <span>Apport nécessaire pour que les loyers couvrent la mensualité</span>
          <b>{eur(fin.apport)}</b>
          <i>soit {Math.round(fin.apportPct)} % du prix</i>
        </div>

        <table className="dmq-tab">
          <tbody>
            <tr><th>Prix</th><td>{eur(prixCourant)}</td></tr>
            <tr><th>Frais d&apos;acquisition ({fin.hypotheses.frais} %)</th><td>{eur(fin.frais)}</td></tr>
            <tr className="fort"><th>Coût total</th><td>{eur(fin.coutTotal)}</td></tr>
            <tr><th>Loyers nets de charges, par mois</th><td>{eur(fin.revenuMensuel)}</td></tr>
            <tr><th>Capital que ces loyers remboursent</th><td>{eur(fin.empruntable)}</td></tr>
            <tr className="fort"><th>Apport à l&apos;équilibre</th><td>{eur(fin.apport)}</td></tr>
          </tbody>
        </table>

        <p className="dmq-hyp">
          {/* Deux décimales sur l'assurance : à une seule, 0,34 % s'affiche
              0,3 % et l'hypothèse n'est plus celle du calcul. */}
          Hypothèses : crédit sur {fin.hypotheses.duree} ans à {pct(fin.hypotheses.taux)} hors
          assurance ({fin.hypotheses.assurance.toFixed(2).replace(".", ",")} % par an),
          frais d&apos;acquisition{" "}
          {fin.hypotheses.frais} %, charges non récupérables {eur(d.charges)} par an.
          {fin.effortSansApport > 0
            ? ` Sans apport, l'effort mensuel serait de ${eur(fin.effortSansApport)}.`
            : " Sans apport, l'opération s'autofinance déjà."}
        </p>
      </section>

      {/* ------------------------------ 5. Analyse + signature */}
      {d.analyse && (
        <section className="dmq-sec">
          <span className="dmq-num">5</span>
          <h2>Notre analyse</h2>
          <p className="dmq-analyse">{d.analyse}</p>
        </section>
      )}

      <section className="dmq-pied">
        {d.agent.photo && <img src={d.agent.photo} alt="" />}
        <div>
          <b>{d.agent.nom}</b>
          {d.agent.poste && <span>{d.agent.poste}</span>}
          {d.agent.tel && <span>{d.agent.tel}</span>}
          {d.agent.email && <span>{d.agent.email}</span>}
        </div>
        <span style={{ flex: 1 }} />
        <img className="dmq-logo-pied" alt=""
          src={sombre ? "/logos/fi-tout-blanc.svg" : "/logos/fi-tout-noir.svg"} />
      </section>
    </article>
  );
}

/** L'écran de choix : les quatre propositions, une bascule, le rendu réel. */
export function ChoixMaquettes({ d }: { d: Dossier }) {
  const [v, setV] = useState<Variante>("A");
  return (
    <div className="dmq-page">
      <header className="dmq-top">
        <div>
          <h1>Dossier d&apos;estimation — quatre propositions</h1>
          <p>
            Rendu avec une vraie estimation ({d.ville}, {d.date}) : les chiffres sont ceux
            du dossier, pas des exemples. Le déroulé est le même partout — la méthode
            d&apos;abord, le prix ensuite.
          </p>
        </div>
        <span style={{ flex: 1 }} />
        <div className="dmq-choix">
          {VARIANTES.map((x) => (
            <button key={x.cle} type="button" className={v === x.cle ? "on" : undefined}
              onClick={() => setV(x.cle)}>
              <b>{x.cle}</b>
              <span>{x.nom}</span>
            </button>
          ))}
        </div>
      </header>
      <p className="dmq-note">{VARIANTES.find((x) => x.cle === v)?.note}</p>
      <div className="dmq-scene">
        <Maquette d={d} variante={v} />
      </div>
    </div>
  );
}
