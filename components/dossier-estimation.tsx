// Dossier d'estimation — les 6 pages A4 envoyées au propriétaire, calquées
// sur le dossier du BO (exemple de référence : Drancy, 5 rue Marcelin
// Berthelot, 04/10/2024). Même découpage, mêmes tableaux, mêmes règles de
// couleur : un loyer au-dessus du secteur passe en rouge, la méthode de prix
// retenue passe en vert, la référence du secteur reste dorée.
//
// Tout vient de l'estimation figée (voir lib/bo/dossier.ts) : la page se
// contente de mettre en forme, elle ne recalcule rien.
import type { Dossier } from "@/lib/bo/dossier";
import { group } from "@/lib/format";
import {
  METHODOLOGIE, MENTIONS, SOCIETE, blocsCible, cibleGenitif, cibleLibelle, criteresEntete,
} from "@/lib/bo/textes-cible";

const fr1 = (x: number) => x.toFixed(1).replace(".", ",");
const m2 = (x: number) => `${group(x)} m²`;

/* --- Pictos du dossier, redessinés au trait comme ceux du BO --- */
const I = {
  pin: <><path d="M12 22s7-6.6 7-12a7 7 0 1 0-14 0c0 5.4 7 12 7 12z" /><circle cx="12" cy="10" r="2.6" /></>,
  bati: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>,
  cle: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M16 7l2 2M19 4l2 2" /></>,
  piece: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></>,
  cible: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  gens: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.6 14.2c2.4.2 4.2 1.6 4.6 4.3" /></>,
  reglages: <><path d="M4 8h10M18 8h2M4 16h4M12 16h8" /><circle cx="16" cy="8" r="2" /><circle cx="10" cy="16" r="2" /></>,
  courbe: <><path d="M4 18 10 11l4 4 6-8" /><path d="M20 7v5h-5" /></>,
  /* #164 — la ligne brisée du rendement était « moche » : trop maigre et trop
     anguleuse à côté des autres pictos. Un vrai signe pour cent, dessiné aux
     mêmes épaisseurs que le reste, dit la même chose plus proprement. */
  pourcent: <><circle cx="7.2" cy="7.2" r="3.2" /><circle cx="16.8" cy="16.8" r="3.2" /><path d="M18.5 5.5 5.5 18.5" /></>,
  etiquette: <><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="7.5" r="1.4" /></>,
  eclair: <><path d="M13 2 5 14h6l-1 8 8-12h-6z" /></>,
  ampoule: <><path d="M9.5 18h5M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" /></>,
  loupe: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 5 5" /></>,
  marteau: <><path d="m3 21 9-9" /><path d="M11 8.5 15.5 4l5 5L16 13.5z" /><path d="M13 6.5 18 11.5" /></>,
  euro: <><path d="M17 6.5A6.5 6.5 0 0 0 7.5 12 6.5 6.5 0 0 0 17 17.5" /><path d="M4 10.5h8M4 13.5h8" /></>,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .9-1 1.6" /><path d="M12 17h.01" /></>,
  mail: <><path d="M3 7.5 12 13l9-5.5" /><rect x="3" y="5" width="18" height="14" rx="2" /></>,
  tel: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 19h2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" /></>,
};

const Ic = ({ d, cls = "dos-ic" }: { d: React.ReactNode; cls?: string }) => (
  <svg className={cls} viewBox="0 0 24 24" aria-hidden>{d}</svg>
);

/* Le PDF est imprimé par un navigateur sans polices installées : tout
   caractère qui n'est pas dans la police du dossier sortirait en carré vide.
   Les symboles sont donc dessinés, jamais écrits. */
const ETOILE = "m12 2.6 2.75 5.9 6.35.85-4.65 4.45 1.15 6.35L12 17.05 6.4 20.15l1.15-6.35L2.9 9.35l6.35-.85z";

/** Note en étoiles pleines / vides, comme le dossier. */
const Etoiles = ({ n, taille = "" }: { n: number; taille?: string }) => (
  <span className={`dos-et ${taille}`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <svg key={i} className={i <= n ? "on" : ""} viewBox="0 0 24 24" aria-hidden>
        <path d={ETOILE} />
      </svg>
    ))}
  </span>
);

/** « ≥ » et « ≤ » dessinés, pour la même raison. */
const Comp = ({ sup }: { sup?: boolean }) => (
  <svg className="dos-cmp" viewBox="0 0 24 24" aria-hidden>
    {sup
      ? <path d="M5 5.5 19 12 5 18.5M5 21.5h14" />
      : <path d="M19 5.5 5 12l14 6.5M5 21.5h14" />}
  </svg>
);

/** Les textes de cible portent leurs mots en gras entre astérisques. */
function Gras({ t }: { t: string }) {
  return (
    <>
      {t.split("*").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>))}
    </>
  );
}

/**
 * Une page A4 avec sa tranche dorée et son titre à la verticale.
 *
 * Le pied porte la marque ET le monogramme, sur toutes les pages : un dossier
 * qu'on feuillette doit se reconnaître à n'importe quelle page (retour #149).
 * `sansBande` sert au dos, qui n'a pas de tranche (retour #153).
 */
function Page({
  titre, sombre, children, sansPied, sansBande, picto,
}: {
  titre: string; sombre?: boolean; children: React.ReactNode;
  sansPied?: boolean; sansBande?: boolean;
  /** Picto posé en haut de la tranche, comme sur la couverture du BO. */
  picto?: React.ReactNode;
}) {
  return (
    <section className={`dos-page${sombre ? " noir" : ""}${sansBande ? " nue" : ""}`}>
      <div className="dos-in">{children}</div>
      {!sansBande && (
        <div className="dos-band">
          {picto && <Ic d={picto} cls="dos-band-ic" />}
          <span>{titre}</span>
          {/* #169 — le monogramme quitte le pied de page pour le bas de la
              tranche dorée, en blanc : « il faut qu'il soit sur la barre de
              couleur, et juste le F, pas le logo ». */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dos-band-f" src="/logos/fi-mono-blanc.svg" alt="" />
        </div>
      )}
      {!sansPied && (
        <div className="dos-pied">
          <span>FRANCE IMMEUBLE</span>
        </div>
      )}
    </section>
  );
}

export function DossierEstimation({ d, nu }: { d: Dossier; nu?: boolean }) {
  const crit = criteresEntete(d.cibles);
  const blocs = blocsCible(d.cibles);
  const lib = cibleLibelle(d.cibles);
  const lim = d.methodes.limitant;
  const parM2 = d.methodes.m2;
  const parRenta = d.methodes.renta;

  /* Couleur des chiffres du tableau « facteur limitant » : doré quand la
     valeur EST la référence du secteur, vert quand elle joue en faveur de
     l'acheteur, rouge quand elle joue contre. */
  const cM2 = (v: number) => (Math.abs(v - d.ref.prix) < 1 ? "or" : v < d.ref.prix ? "vert" : "rouge");
  const cRenta = (v: number) => (Math.abs(v - d.ref.renta) < 0.05 ? "or" : v > d.ref.renta ? "vert" : "rouge");

  const auM2 = d.lignes.filter((l) => !l.auLot);
  const verdictLoyers = d.ecartLoyers < -3 ? "Sous-évalués" : d.ecartLoyers > 3 ? "Sur-évalués" : "Dans le marché";

  return (
    <div className={`dos${nu ? " nu" : ""}`}>
      {/* ------------------------------------------------ 1. Couverture */}
      <Page titre="Dossier estimation" sombre sansPied picto={I.marteau}>
        <div className="dos-cv-h">
          <div className="dos-cv-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="dos-logo" src="/logos/fi-creme-bronze-fond-sombre.svg" alt="France Immeuble" />
            <p>{SOCIETE.tel}<br />{SOCIETE.email}<br />{SOCIETE.site}</p>
          </div>
          <div className="dos-cv-ag">
            {d.agent.photo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img className="dos-ag-ph" src={d.agent.photo} alt="" />
              : <span className="dos-ag-ph vide" />}
            <div className="dos-ag-t">Votre contact dédié</div>
            <div className="dos-ag-n">{d.agent.nom}</div>
            <div className="dos-ag-c">{d.agent.email}</div>
            <div className="dos-ag-c">{d.agent.tel}</div>
          </div>
        </div>

        <div className="dos-cv-photo">
          {d.photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={d.photo} alt={d.adresse} />
            : <span className="dos-cv-vide">Photo de l&apos;immeuble</span>}
        </div>

        <div className="dos-cv-box">
          <div className="dos-cv-titre">ESTIMATION</div>
          <div className="dos-cv-3">
            {([
              ["Surface", group(d.carrez), "m²"],
              ["Revenus annuels", group(d.loyers), "€ HC/an"],
              ["Occupation", String(Math.round(d.occupation)), "%"],
            ] as const).map(([l, v, u]) => (
              <div key={l}>
                <span className="l">{l}</span>
                <span className="p"><b>{v}</b> <i>{u}</i></span>
              </div>
            ))}
          </div>
          <div className="dos-cv-adr">{d.adresse}</div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="dos-sky" src="/dossier/skyline.png" alt="" />
      </Page>

      {/* --------------------------------------- 2. Analyse fondamentaux */}
      <Page titre="Analyse des fondamentaux">
        <div className="dos-hd">
          <div><Ic d={I.pin} cls="dos-ic gd" /><span>Emplacement</span><Etoiles n={d.scores.emp} /></div>
          <div><Ic d={I.bati} cls="dos-ic gd" /><span>Bâti</span><Etoiles n={d.scores.bati} /></div>
          <div><Ic d={I.cle} cls="dos-ic gd" /><span>Lots</span><Etoiles n={d.scores.lot} /></div>
          <div>
            <Ic d={I.piece} cls="dos-ic gd" /><span>Loyers</span>
            <b className="dos-hd-v">{verdictLoyers}<br />{d.ecartLoyers > 0 ? "+" : ""}{d.ecartLoyers} %</b>
          </div>
          <Ic d={I.loupe} cls="dos-hd-big" />
        </div>

        <h2 className="dos-h"><Ic d={I.pin} /> Qualité de l&apos;emplacement</h2>
        <div className="dos-card dos-3">
          <div><span>Transports</span><b>{d.gare.nom || "—"}</b><b>{d.gare.min ? `${d.gare.min} min` : "—"}</b></div>
          <div><span>Commerces</span><b>{d.com.nom || "—"}</b><b>{d.com.min ? `${d.com.min} min` : "—"}</b></div>
          <div className="or"><span>Qualité de l&apos;emplacement</span><Etoiles n={d.scores.emp} taille="gr" /></div>
        </div>

        <h2 className="dos-h"><Ic d={I.bati} /> Qualité du bâti</h2>
        <div className="dos-card dos-3">
          <div><span>Etat général</span><b>{d.etat.bati}</b></div>
          <div><span>Travaux à prévoir</span><b>{group(d.travauxBati)} €</b></div>
          <div className="or"><span>Qualité du bâti</span><Etoiles n={d.scores.bati} taille="gr" /></div>
        </div>

        <h2 className="dos-h"><Ic d={I.cle} /> Qualité des lots</h2>
        <div className="dos-card dos-3">
          <div><span>Etat général</span><b>{d.etat.lot}</b></div>
          <div><span>Travaux à prévoir</span><b>{group(d.travauxLots)} €</b></div>
          <div className="or"><span>Qualité des lots</span><Etoiles n={d.scores.lot} taille="gr" /></div>
        </div>

        <h2 className="dos-h"><Ic d={I.piece} /> Loyers actuels</h2>
        <table className="dos-tb">
          <thead>
            <tr>
              <th>Destination</th><th>Lots</th><th>Surface</th>
              <th>Dont louée</th><th>Revenus</th><th>Loyer au m²</th>
            </tr>
          </thead>
          <tbody>
            {d.lignes.map((l) => (
              <tr key={l.dest}>
                <td className="g">{l.label}</td>
                <td>{l.lots}</td>
                <td>{l.auLot ? "—" : m2(l.surface)}</td>
                <td>{l.auLot ? "—" : m2(l.surfaceOcc)}</td>
                <td>{group(l.revenus)} €/an</td>
                <td className={l.cher ? "rouge" : ""}>
                  {fr1(l.loyerM2)} €/{l.auLot ? "lot" : "m²"}
                </td>
              </tr>
            ))}
            <tr className="tot">
              {/* Une case vide en tête de ligne de total se lit comme un oubli
                  (retour #149) : elle porte son mot, dans la même graisse. */}
              <td className="g">Total</td>
              <td>{d.total.lots}</td>
              <td>{m2(d.total.surface)}</td>
              <td>{m2(d.total.surfaceOcc)}</td>
              <td>{group(d.total.revenus)} €/an</td>
              <td>{fr1(d.total.loyerM2)} €/m²</td>
            </tr>
          </tbody>
        </table>
        <p className="dos-note">
          <b>*Loyer au m² en rouge</b> : supérieur au loyer du secteur (voir «&nbsp;<i>analyse secteur</i>&nbsp;» p.4)
        </p>
      </Page>

      {/* ------------------------------------------ 3. Cible */}
      <Page titre="Détermination de la cible">
        <div className="dos-hd">
          <div>
            <Ic d={I.gens} cls="dos-ic gd" /><span>Cible</span>
            <b className="dos-hd-v">{lib.titre}{lib.suite && <><br /><i>{lib.suite}</i></>}</b>
          </div>
          <div>
            <Ic d={I.cible} cls="dos-ic gd" /><span>Critère principal</span>
            <b className="dos-hd-v">{crit.principal}</b>
          </div>
          <div>
            <Ic d={I.cible} cls="dos-ic gd" /><span>Critère secondaire</span>
            <b className="dos-hd-v">{crit.secondaire}</b>
          </div>
          <Ic d={I.gens} cls="dos-hd-big" />
        </div>

        <h2 className="dos-h"><Ic d={I.bati} /> Caractéristiques de votre bien</h2>
        <div className="dos-card dos-txt">
          <p>
            L&apos;immeuble est {d.phrase.emp}, {d.phrase.bati} et les lots sont {d.phrase.lot}.
          </p>
          <p>
            Actuellement occupé à {Math.round(d.occupation)} %, l&apos;immeuble génère {group(d.loyers)} € HC/an.{" "}
            {d.loyersMax > d.loyers &&
              `Entièrement loué il pourra générer un revenu de ${group(d.loyersMax)} € HC/an. `}
            {d.travaux > 0
              ? `Toutefois, ${group(d.travaux)} € de travaux sont à prévoir.`
              : "Aucun travaux n'est à prévoir."}
          </p>
          <p>Ce type de bien s&apos;adresse à une cible {cibleGenitif(d.cibles)}.</p>
        </div>

        <h2 className="dos-h"><Ic d={I.reglages} /> Critères de la cible</h2>
        <div className={`dos-card dos-txt${blocs.length > 1 ? " serre" : ""}`}>
          {blocs.map((b) => (
            <div className="dos-bloc" key={b.cle}>
              <p><Gras t={b.f.intro(b.liste)} /></p>
              <p>Les <b>critères des {b.liste}</b> sont généralement les suivants :</p>
              <ul className="dos-ul">
                {b.f.criteres.map((c) => <li key={c}><Gras t={c} /></li>)}
              </ul>
            </div>
          ))}
        </div>
      </Page>

      {/* ------------------------------------------ 4. Secteur */}
      <Page titre="Analyse du secteur">
        <div className="dos-hd">
          <div><Ic d={I.pourcent} cls="dos-ic gd" /><span>Rendement moyen</span><b className="dos-hd-v">{fr1(d.ref.renta)} %</b></div>
          <div><Ic d={I.etiquette} cls="dos-ic gd" /><span>Prix au m²</span><b className="dos-hd-v">{group(d.ref.prix)} €/m²</b></div>
          <div><Ic d={I.eclair} cls="dos-ic gd" /><span>Facteur limitant</span><b className="dos-hd-v">{lim === "renta" ? "Rendement" : "Prix au m²"}</b></div>
          <Ic d={I.reglages} cls="dos-hd-big" />
        </div>

        <div className="dos-meth">
          <div className="t"><Ic d={I.question} /> Méthodologie</div>
          {METHODOLOGIE.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        <h2 className="dos-h"><Ic d={I.piece} /> Loyers du secteur en € HC/m²/mois <i>(sources : Leboncoin, Seloger…)</i></h2>
        {/* Retour #277 : « on n'affiche pas les parkings et les caves ici, car
            ça ne rentre pas dans le calcul des prix au m² ou du rendement ».
            Six colonnes dont deux qui ne peuvent que dire « — » désignaient
            un manque là où il n'y en a pas. */}
        <TableSecteur
          lignes={auM2}
          valeur={(l) => (l.refLoyer ? `${fr1(l.refLoyer)} €/m²` : "—")}
          moyLabel="Loyer moyen"
          moy={`${fr1(d.ref.loyer)} €/m²/mois`}
        />

        <h2 className="dos-h"><Ic d={I.etiquette} /> Prix du secteur en €/m² <i>(source : notaires)</i></h2>
        <TableSecteur
          lignes={auM2}
          valeur={(l) => (l.refPrix ? `${group(l.refPrix)} €/m²` : "—")}
          moyLabel="Prix moyen"
          moy={`${group(d.ref.prix)} €/m²`}
        />

        <h2 className="dos-h"><Ic d={I.pourcent} /> Rendement du secteur <i>(sources : Loyers du secteur et prix du secteur)</i></h2>
        <TableSecteur
          lignes={auM2}
          valeur={(l) => (l.refLoyer && l.refPrix ? `${fr1((l.refLoyer * 12 * 100) / l.refPrix)} %` : "—")}
          moyLabel="Rendement"
          moySous="loyer moy / prix moy"
          moy={`${fr1(d.ref.renta)} %`}
        />

        <h2 className="dos-h"><Ic d={I.ampoule} /> Définition du facteur limitant</h2>
        <div className="dos-lim">
          <table className="dos-tb serre">
            <thead>
              <tr>
                <th>Prix selon</th><th>€/m² HAI</th><th>€/m² après travaux</th>
                <th>Rendement</th><th>Prix HAI</th>
              </tr>
            </thead>
            <tbody>
              {/* Retour #278 — l'or dit « c'est la référence de cette
                  méthode », le rouge et le vert disent « voilà où cette
                  méthode place l'immeuble par rapport au secteur ».

                  Sur la ligne Prix au m², c'est le prix APRÈS TRAVAUX qui vaut
                  le prix du secteur : lui et le prix de vente sont en or, et
                  c'est le rendement qui se compare. Sur la ligne Rendement,
                  l'inverse : le rendement et le prix sont en or, et ce sont
                  les deux prix au m² qui se comparent. */}
              <tr className={lim === "m2" ? "" : "off"}>
                <td className="g or">Prix au m²</td>
                <td>{group(parM2.m2)} €/m²</td>
                <td className="or">{group(parM2.m2Travaux)} €/m²</td>
                <td className={cRenta(parM2.renta)}>{fr1(parM2.renta)} %</td>
                <td className="p or">{group(parM2.prix)} €</td>
              </tr>
              <tr className={lim === "renta" ? "" : "off"}>
                <td className="g or">Rendement</td>
                <td className={cM2(parRenta.m2)}>{group(parRenta.m2)} €/m²</td>
                <td className={cM2(parRenta.m2Travaux)}>{group(parRenta.m2Travaux)} €/m²</td>
                <td className="or">{fr1(parRenta.renta)} %</td>
                <td className="p or">{group(parRenta.prix)} €</td>
              </tr>
            </tbody>
          </table>
          <div className="dos-lim-c">
            Le {lim === "renta" ? "rendement" : "prix au m²"} est le facteur limitant sur cet immeuble
          </div>
        </div>
      </Page>

      {/* ------------------------------------------ 5. Avis de valeur */}
      <Page titre="Avis de valeur">
        <div className="dos-res">
          <div className="dos-res-g">
            <div><span>Emplacement</span><Etoiles n={d.scores.emp} taille="gr" /></div>
            <div><span>Bâti</span><Etoiles n={d.scores.bati} taille="gr" /></div>
            <div><span>Lots</span><Etoiles n={d.scores.lot} taille="gr" /></div>
            <div><span>Loyers</span><b>{verdictLoyers}<br />{d.ecartLoyers > 0 ? "+" : ""}{d.ecartLoyers} %</b></div>
          </div>
          <div className="dos-res-b">
            <p>L&apos;immeuble est {d.phrase.emp}, {d.phrase.bati} et loué à {Math.round(d.occupation)} %.</p>
            <p>Il s&apos;adresse donc à une cible {cibleGenitif(d.cibles)}.</p>
          </div>
          <Ic d={I.marteau} cls="dos-hd-big" />
          <div className="dos-res-t">Résumé</div>
        </div>

        <div className="dos-ach">
          <div className="dos-ach-t">Les caractéristiques de recherche des acheteurs pour votre bien</div>
          <div className="dos-ach-g">
            <div className="dos-ach-l">
              <div className="l"><Ic d={I.pin} /><div><span>Emplacement</span><b>{d.etat.emp}</b></div></div>
              {/* L'occupation manquait, et c'est le premier chiffre qu'un
                  acheteur regarde (retour #152). */}
              <div className="l"><Ic d={I.gens} /><div><span>Occupation</span><b>{Math.round(d.occupation)} %</b></div></div>
              <div className="l"><Ic d={I.pourcent} /><div><span>Rendement</span><b><Comp sup /> {fr1(d.ref.renta)} %</b></div></div>
              <div className="l"><Ic d={I.euro} /><div><span>Prix au m²</span><b><Comp /> {group(d.ref.prix)} €/m²</b></div></div>
            </div>
            <div className="dos-ach-b">
              Les acheteurs pour ce type de bien recherchent un
              {" "}<b>prix inférieur à {group(d.ref.prix)} €/m²</b> et un{" "}
              <b>rendement supérieur à {fr1(d.ref.renta)} %</b>.
            </div>
          </div>
        </div>

        <h2 className="dos-h"><Ic d={I.ampoule} /> Notre analyse</h2>
        <div className={`dos-card dos-txt dos-analyse${
          d.analyse.length > 1200 ? " tres-long" : d.analyse.length > 600 ? " long" : ""}`}>
          {(d.analyse || "").split("\n").filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)}
        </div>

        <h2 className="dos-h"><Ic d={I.marteau} /> Prix de vente estimé</h2>
        <div className="dos-px">
          <div className="dos-px-b"><b>{group(d.prix.hai)}</b> <i>€ HAI*</i></div>
          {/* La présentation du back-office, en tenue de dossier : fond blanc,
              pas de barre de sélection, pas de lignes colorées — seul l'écart
              au secteur porte une couleur (retour #152). */}
          <div className={`dos-bil${d.bilan.identiques ? " seul" : ""}`}>
            <ColonneBilan titre={d.bilan.identiques ? "Au prix retenu" : "Actuel"}
              c={d.bilan.actuel} secteur={d.ref} />
            {!d.bilan.identiques && (
              <ColonneBilan titre="Potentiel*" c={d.bilan.potentiel} secteur={d.ref} />
            )}
          </div>
        </div>
        <p className="dos-note gris">
          *Honoraires d&apos;Agences Inclus soit {group(d.prix.nv)} € net vendeur.
        </p>
        {/* Retour #279 — dire en clair ce que « potentiel » suppose. Un
            propriétaire qui lit un rendement plus élevé que le sien a le droit
            de savoir sur quoi il repose : tous les lots loués, et les travaux
            comptés dans le prix. */}
        {!d.bilan.identiques && (
          <p className="dos-note gris">
            *Le potentiel suppose l&apos;immeuble loué en entier. Pour le rendement et
            le prix au m², on ajoute au prix de vente les travaux qui restent à
            faire : c&apos;est ce que l&apos;acquéreur dépensera en tout.
          </p>
        )}
      </Page>

      {/* ------------------------------------------ 6. Dos */}
      <Page titre="" sombre sansPied sansBande>
        <div className="dos-fin">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dos-logo gr" src="/logos/fi-creme-bronze-fond-sombre.svg" alt="France Immeuble" />
          <div className="dos-fin-c">
            <div><Ic d={I.mail} /><span>{SOCIETE.email}</span></div>
            <div><Ic d={I.tel} /><span>{SOCIETE.tel}</span></div>
            <div><Ic d={I.globe} /><span>{SOCIETE.site}</span></div>
          </div>
          <div className="dos-fin-m">
            {MENTIONS.map((m) => <p key={m}>{m}</p>)}
          </div>
        </div>
      </Page>
    </div>
  );
}

/** Une ligne du bilan : le poste, son écart au secteur s'il en a un, sa valeur. */
function LigneBilan({ l, v, e, bon }: { l: string; v: string; e?: number; bon?: boolean }) {
  return (
    <div className="dos-bil-l">
      <span>{l}</span>
      {e !== undefined && <i className={bon ? "v" : "r"}>{e > 0 ? "+" : ""}{e} %</i>}
      <b>{v}</b>
    </div>
  );
}

/**
 * Une colonne du bilan : ce que le prix retenu donne, ligne à ligne.
 *
 * Seuls les trois premiers postes se comparent au secteur, et le sens de la
 * couleur n'est pas le même pour tous : un loyer sous le marché est une
 * faiblesse (rouge), un prix au m² sous le marché est un argument (vert), un
 * rendement au-dessus du marché aussi.
 */
function ColonneBilan({ titre, c, secteur }: {
  titre: string;
  c: { loyerM2: number; prixM2: number; brut: number; net: number; aem: number };
  /* Surtout pas `ref` : React le confisque comme référence de composant. */
  secteur: { loyer: number; prix: number; renta: number };
}) {
  const ec = (v: number, r: number) => (r > 0 ? Math.round(((v - r) / r) * 100) : undefined);
  const eLoyer = ec(c.loyerM2, secteur.loyer);
  const ePrix = ec(c.prixM2, secteur.prix);
  const eRenta = ec(c.brut, secteur.renta);
  return (
    <div className="dos-bil-c">
      <div className="dos-bil-t">{titre}</div>
      <LigneBilan l="Loyer au m²" v={`${fr1(c.loyerM2)} €/m²/mois`} e={eLoyer} bon={(eLoyer ?? 0) >= 0} />
      <LigneBilan l="Prix au m²" v={`${group(c.prixM2)} €/m²`} e={ePrix} bon={(ePrix ?? 0) <= 0} />
      <LigneBilan l="Rendement brut" v={`${fr1(c.brut)} %`} e={eRenta} bon={(eRenta ?? 0) >= 0} />
      {/* #167 — le cadre débordait de la page. Le rendement net et le net acte
          en main disaient presque la même chose ; on garde celui qui compte
          pour l'acheteur, frais inclus. */}
      <LigneBilan l="Net acte en main" v={`${fr1(c.aem)} %`} />
    </div>
  );
}

/** Les trois tableaux du secteur : une colonne par destination + la moyenne. */
function TableSecteur({
  lignes, valeur, moyLabel, moy, moySous,
}: {
  lignes: { dest: string; label: string; auLot: boolean; refLoyer?: number; refPrix?: number }[];
  valeur: (l: { auLot: boolean; refLoyer?: number; refPrix?: number }) => string;
  moyLabel: string;
  moy: string;
  moySous?: string;
}) {
  return (
    <div className="dos-card dos-sect">
      {lignes.map((l) => (
        <div key={l.dest}>
          <span>{l.label.replace(/s$/, "")}</span>
          <b>{valeur(l)}</b>
        </div>
      ))}
      <div className="or">
        <span>{moyLabel}{moySous && <i>{moySous}</i>}</span>
        <b>{moy}</b>
      </div>
    </div>
  );
}
