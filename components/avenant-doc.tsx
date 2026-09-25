// L'avenant de prix au mandat — mise en page.
//
// Deux pages A4, avec les briques du mandat (en-tête, pied, titres d'article,
// registre, vignettes de prix) et sa feuille `app/mandat-doc.css` : l'avenant
// doit ressembler au mandat qu'il modifie, jusque dans la marge, parce qu'il
// est lu et signé à côté de lui. Le contenu vient de `lib/bo/avenant-doc.ts`.
//
// Même règle anti-débordement que le mandat : chaque page est une section de
// 297 mm à hauteur fixe, écrite pour tenir.
import { Fragment } from "react";
import type { DocAvenant } from "@/lib/bo/avenant-doc";
import { MANDATAIRE } from "@/lib/bo/mandat-doc";
import { Entete, H2, Pied, Registre, T } from "@/components/mandat-doc";

export function AvenantDoc({ d, nu }: { d: DocAvenant; nu?: boolean }) {
  const P = 2;
  return (
    <div className={`mdoc${nu ? " nu" : ""}`}>

      {/* ---------------------------------- 1 · Les parties, l'objet, le prix */}
      <section className="page">
        <Entete refEntete={d.refEntete} />
        <div className="pc">
          <div className="hero">
            <div className="eyebrow">{d.eyebrow}</div>
            <h1>{d.titre}</h1>
            <div className="hero-sub">{d.sousTitre}</div>
            <div className="hero-meta">{d.heroMeta}</div>
          </div>

          <H2 n={1}>Les parties</H2>
          <article className="pty pty-a">
            <header className="pty-h">
              <span className="pty-k">Mandataire</span>
              <span className="pty-sep">—</span>
              <span className="pty-role">Titulaire de la carte professionnelle · Agent d’entremise</span>
            </header>
            <div className="pty-name">{MANDATAIRE.nom}</div>
            <dl className="kv tight">
              <dt>Raison sociale</dt><dd>{MANDATAIRE.raisonSociale} · {MANDATAIRE.siren}</dd>
              <dt>Carte pro.</dt><dd>{MANDATAIRE.carte}</dd>
              <dt>Contact</dt><dd>{d.contactNegociateur}</dd>
            </dl>
          </article>

          {/* Les mandants sont rappelés tels qu'ils figurent au mandat : c'est
              le même moteur qui les rédige, l'avenant ne les réécrit pas. */}
          <div className={`ptys${d.mandants.length > 1 ? " many" : ""}`}>
            {d.mandants.map((x) => (
              <article className="pty pty-m" key={x.rang}>
                <header className="pty-h">
                  <span className="pty-k">{x.rang}</span>
                  <span className="pty-sep">—</span>
                  <span className="pty-role">{x.role}</span>
                </header>
                <div className="pty-name">{x.nom}</div>
                <dl className="kv tight">
                  {x.lignes.map((l) => (
                    <Fragment key={l.k}><dt>{l.k}</dt><dd>{l.v}</dd></Fragment>
                  ))}
                </dl>
              </article>
            ))}
          </div>

          <h2 style={{ marginTop: "4mm" }}><span className="anum">2</span>Objet de l’avenant</h2>
          <div className="plain">
            {d.objet.map((p, i) => <p className="lead" key={i}><T t={p} /></p>)}
          </div>

          <h2 style={{ marginTop: "4mm" }}><span className="anum">3</span>Nouveau prix et honoraires</h2>
          <p><T t={d.prixParagraphe} /></p>
          <div className="pviz">
            <div className="pcard">
              <span className="plab">Prix net vendeur</span>
              <span className="pval">{d.prixVignettes.nv}</span>
              <span className="pnote">Revient au Mandant</span>
            </div>
            <div className="pop">+</div>
            <div className="pcard">
              <span className="plab">Honoraires</span>
              <span className="pval">{d.prixVignettes.honos}</span>
              <span className="pnote">{d.prixVignettes.noteHonos}</span>
            </div>
            <div className="pop">=</div>
            <div className="pcard pcard-hi">
              <span className="plab">Prix de vente HAI</span>
              <span className="pval">{d.prixVignettes.hai}</span>
              <span className="pnote">{d.prixVignettes.noteHai}</span>
            </div>
          </div>
        </div>
        <Pied n={1} total={P} />
      </section>

      {/* ------------------------------------ 2 · Avant / après · Signatures */}
      <section className="page">
        <Entete refEntete={d.refEntete} />
        <div className="pc">
          <h3 className="pill" style={{ marginTop: 0 }}>Comparaison avant / après</h3>
          <table className="tbl">
            <thead>
              <tr>
                <th>Élément du prix</th>
                <th className="num">Au mandat (avant)</th>
                <th className="num">Par le présent avenant</th>
              </tr>
            </thead>
            <tbody>
              {d.comparaison.map((l) => (
                <tr key={l.k}>
                  <td>{l.k}</td>
                  <td className="num">{l.avant}</td>
                  <td className="num"><b>{l.apres}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Registre lignes={d.prixRegistre} />

          <h2 style={{ marginTop: "5mm" }}><span className="anum">4</span>Autres stipulations</h2>
          <div className="plain">
            {d.suite.map((p, i) => <p className="lead" key={i}><T t={p} /></p>)}
          </div>

          <div className="mentions">
            <div className="ment">
              <h4>Registre des mandats et remise d’un exemplaire</h4>
              <p>{d.registreMention}</p>
            </div>
          </div>

          <h2 style={{ marginTop: "6mm" }}><span className="anum">5</span>Signatures</h2>
          <p className="intro">{d.signatureIntro}</p>
          <div className="sgs">
            {d.signataires.map((x, i) => (
              <div className="sg" key={x.role}>
                <span className="sg-r">{x.role}</span>
                <span className="sg-n">{x.nom}</span>
                <span className="sg-q">{x.qualite}</span>
                <div className="sg-z" data-ancre={i === 0 ? "signature-mandataire" : `signature-mandant-${i}`} />
                <span className="sg-l">Signature</span>
              </div>
            ))}
          </div>
        </div>
        <Pied n={2} total={P} />
      </section>
    </div>
  );
}
