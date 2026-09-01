// Le mandat de vente en bloc — mise en page.
//
// Décalquée des maquettes validées (docs/mandats-reference/) : mêmes balises,
// mêmes classes, mêmes cotes. Le contenu vient de `lib/bo/mandat-doc.ts`, la
// feuille de `app/mandat-doc.css`. Rien ne doit diverger : le même rendu sert
// l'aperçu à l'écran et le PDF, il n'existe pas deux chaînes de rendu.
//
// La règle anti-débordement, elle, est structurelle : chaque page est une
// section de 297 mm à hauteur fixe, écrite pour tenir, jamais laissée au fil
// du texte. Le contrôle qui refuse de produire un PDF débordant vit dans
// `lib/bo/pdf.ts`.
import { Fragment } from "react";
import type { DocMandat, LigneCompo, LigneRegistre } from "@/lib/bo/mandat-doc";
import { MANDATAIRE, MEDIATEUR } from "@/lib/bo/mandat-doc";

/* Le logo est en SVG dans le document, jamais en image externe : un mandat
   doit se générer à l'identique sans réseau. */
function Logo() {
  return (
    <svg viewBox="0 0 680.31 121.89" xmlns="http://www.w3.org/2000/svg">
      <g className="lg-t">
        <path d="M130.46,10.27V23.76h38.16v8.13H130.46V53.58H119.67V2.07h50.18v8.2Z" />
        <path d="M216.55,34H197.36V53.58H186.57V2.07h34.25c15.27,0,19.69,8.34,19.69,15.74,0,5.73-3.11,12.56-12.38,14.88l14.34,20.89H230Zm-19.19-7.62H218.5c8.18,0,10.64-4.35,10.64-8.41S226.76,9.9,218.57,9.9H197.36Z" />
        <path d="M303.14,42.7H269.91L264.4,53.58H252.74L280.19,2.07h12.67L320.3,53.58H308.64Zm-3.91-7.62-6.66-13.2c-3.12-5.81-4.64-8.78-5.94-12.84h-.22c-1.3,4.06-2.82,7-5.93,12.84l-6.67,13.2Z" />
        <path d="M334.78,2.07h12.16l32.51,34.32a20.84,20.84,0,0,1,3.77,5.22h.22V2.07h9.77V53.58H382.13l-33.59-35a26.94,26.94,0,0,1-3.7-5.15h-.29c.08,2.1.08,4.28.08,6.38V53.58h-9.85Z" />
        <path d="M407,27.9C407,11.5,420.79.26,441,.26c16.51,0,27.95,7.11,31.35,19.44L461,21.37c-2.38-8.2-9.48-12.63-20.34-12.63-13.83,0-22.37,7.33-22.37,19.09,0,11.46,8.9,19,22.59,19,10.64,0,17.52-4,20.34-11.75l10.94,2.18c-4.35,11.68-15.43,18.14-31.79,18.14C420,55.4,407,44.58,407,27.9Z" />
        <path d="M538.08,45.53v8H487.4V2.07h50.17v8H498.18V23.47h38.16v7.69H498.18V45.53Z" />
        <path d="M119.67,120.33V68.82h10.79v51.51Z" />
        <path d="M151.45,68.82h16.29l17.31,36.06a26.84,26.84,0,0,1,1.66,4.71h.22a33.72,33.72,0,0,1,1.67-4.79l17.52-36H222.7v51.51h-9.92V83.18a46.85,46.85,0,0,1,.44-6.67h-.37c-.36,1-1.44,3.92-2.46,6.09l-18.68,37.73H181.5L163.18,82.6c-.94-2.17-1.66-4.5-2.17-6.09h-.36a42.15,42.15,0,0,1,.36,6.67v37.15h-9.56Z" />
        <path d="M243.69,68.82H260l17.3,36.06a27,27,0,0,1,1.67,4.71h.21a35,35,0,0,1,1.67-4.79l17.52-36h16.58v51.51H305V83.18a46.85,46.85,0,0,1,.44-6.67h-.37c-.36,1-1.44,3.92-2.46,6.09L284,120.33H273.74L255.42,82.6c-.94-2.17-1.66-4.5-2.17-6.09h-.36a42.15,42.15,0,0,1,.36,6.67v37.15h-9.56Z" />
        <path d="M386.62,112.28v8H335.94V68.82h50.17v8.05H346.72V90.22h38.16v7.69H346.72v14.37Z" />
        <path d="M414.06,68.82V96.1c0,9.72,6.73,17.34,18.68,17.34s18.68-7.62,18.68-17.34V68.82h10.86V96.9c0,14.8-10.57,25.24-29.54,25.24S403.2,111.62,403.2,96.82v-28Z" />
        <path d="M535.33,105.89c0,8-5.29,14.44-18.83,14.44H478.92V68.82h37.36c12.6,0,17.67,6.24,17.67,13.2,0,5.37-3.18,10.16-9.7,11.47C532,94.72,535.33,99.36,535.33,105.89ZM489.71,76.58V90.37h24.11c7.68,0,9-3.78,9-7.33,0-3-1.81-6.46-9-6.46Zm34.54,28.59c0-4.36-2.75-7.4-9.85-7.4H489.71v14.8H514.4C521.35,112.57,524.25,109.66,524.25,105.17Z" />
        <path d="M550.65,68.82h10.78v42.73h37.22v8.78h-48Z" />
        <path d="M661.28,112.28v8H610.59V68.82h50.18v8.05H621.38V90.22h38.16v7.69H621.38v14.37Z" />
      </g>
      <g className="lg-b">
        <path d="M57.16,1.5a60,60,0,0,0-54,34.05A49.4,49.4,0,0,1,43.85,14.08H96V1.5Z" />
        <path d="M1.38,66.17v54.46H14V66.17a27,27,0,0,1,7.79-19v73.43H34.32V39.94h0v-.84H96V26.48H41A39.7,39.7,0,0,0,1.38,66.17Z" />
        <polygon points="48.83 78.03 60.74 89.96 72.5 78.17 60.6 66.23 48.83 78.03" />
      </g>
    </svg>
  );
}

/** Les textes portent du gras : ils sont composés, pas saisis par un tiers. */
const T = ({ t }: { t: string }) => <span dangerouslySetInnerHTML={{ __html: t }} />;

const Entete = ({ d }: { d: DocMandat }) => (
  <div className="doc-hd">
    <span className="logo"><Logo /></span>
    <div className="ref">{d.refEntete}</div>
  </div>
);

/** Pied des pages du corps : mentions, cinq zones de paraphe, pagination. */
const Pied = ({ n, total }: { n: number; total: number }) => (
  <div className="doc-ft">
    <div className="ft-l">{MANDATAIRE.pied}</div>
    <div className="par">
      <span className="par-l">Paraphes</span>
      {/* Cinq zones vides, sans trait : les tags Docusign viennent s'y poser. */}
      {[0, 1, 2, 3, 4].map((i) => <i key={i} data-ancre={`paraphe-p${n}-s${i + 1}`} />)}
    </div>
    <div className="pg">Page {n} / {total}</div>
  </div>
);

const H2 = ({ n, children }: { n: number | string; children: React.ReactNode }) => (
  <h2><span className="anum">{n}</span>{children}</h2>
);

/* `fort` : pointillés plus gros et plus foncés. Réservé au registre de la
   durée, pour qu'il se distingue des autres conducteurs du document. */
const Registre = ({ lignes, fort }: { lignes: LigneRegistre[]; fort?: boolean }) => (
  <div className={`ldg${fort ? " ldg-fort" : ""}`}>
    {lignes.map((l, i) => (
      <div key={i} className={`ld${i === lignes.length - 1 && l.k === "Prix de vente HAI" ? " ld-tot" : ""}`}>
        <span className="ld-k">{l.k}{l.note && <em>{l.note}</em>}</span>
        <i />
        <span className="ld-v">{l.v}</span>
      </div>
    ))}
  </div>
);

const LigneCompoRendu = ({ l, avecLoyer }: { l: LigneCompo; avecLoyer: boolean }) => (
  <tr>
    <td>{l.nature}</td>
    <td className="num">{l.nb}</td>
    <td className="num">{l.surface}</td>
    <td>{l.occupation}</td>
    {avecLoyer && <td className="num">{l.loyer ?? "—"}</td>}
  </tr>
);

export function MandatDoc({ d, nu }: { d: DocMandat; nu?: boolean }) {
  const P = d.pagesCorps;
  return (
    <div className={`mdoc${nu ? " nu" : ""}`}>

      {/* ---------------------------------------------- 1 · Les parties */}
      <section className="page">
        <Entete d={d} />
        <div className="pc">
          <div className="hero">
            <div className="eyebrow">{d.eyebrow}</div>
            <h1>{d.titre}</h1>
            <div className="hero-sub">{d.sousTitre}</div>
            <div className="hero-meta">{d.heroMeta}</div>
          </div>
          <H2 n={d.art.parties}>Les parties</H2>

          <article className="pty pty-a">
            <header className="pty-h">
              <span className="pty-k">Mandataire</span>
              <span className="pty-sep">—</span>
              <span className="pty-role">Titulaire de la carte professionnelle · Agent d’entremise</span>
            </header>
            <div className="pty-name">{MANDATAIRE.nom}</div>
            <dl className="kv">
              <dt>Raison sociale</dt><dd>{MANDATAIRE.raisonSociale}</dd>
              <dt>SIREN / RCS</dt><dd>{MANDATAIRE.siren}</dd>
              <dt>Siège social</dt><dd>{MANDATAIRE.siege}</dd>
              <dt>Carte professionnelle</dt><dd>{MANDATAIRE.carte}</dd>
              <dt>Garantie et assurance</dt><dd>{MANDATAIRE.garantie}</dd>
              <dt>Représenté par</dt><dd>{MANDATAIRE.representant}</dd>
              <dt>Contact</dt><dd>{d.contactNegociateur}</dd>
            </dl>
            <p className="pty-foot">Le Mandataire ne reçoit aucun fonds, effet ou valeur au titre des présentes.</p>
          </article>

          <p className="intro" style={{ fontSize: "7.4pt", margin: "2mm 0 2.5mm" }}>{d.introMandants}</p>

          {/* Un mandant seul occupe toute la largeur ; à partir de deux, deux
              colonnes à hauteurs égalisées. */}
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
        </div>
        <Pied n={1} total={P} />
      </section>

      {/* ------------------------------------------ 2 · Le bien et le prix */}
      <section className="page">
        <Entete d={d} />
        <div className="pc">
          <H2 n={d.art.bien}>Le bien et le prix</H2>
          <h3 className="pill" style={{ marginTop: 0 }}>Désignation</h3>
          {d.designation.map((p, i) => <p className="legal" key={i}><T t={p} /></p>)}

          <h3>{d.avecLoyer ? "Composition et état locatif" : "Composition"}</h3>
          <table className="tbl">
            <thead>
              <tr>
                <th>Nature des locaux</th>
                <th className="num">Nombre</th>
                <th className="num">Surface</th>
                <th>Occupation</th>
                {d.avecLoyer && <th className="num">Loyer annuel HC</th>}
              </tr>
            </thead>
            <tbody>
              {d.compo.map((l) => <LigneCompoRendu key={l.nature} l={l} avecLoyer={d.avecLoyer} />)}
            </tbody>
            <tfoot>
              <LigneCompoRendu l={d.compoTotal} avecLoyer={d.avecLoyer} />
            </tfoot>
          </table>

          <h3 className="pill">Prix et honoraires</h3>
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

          <Registre lignes={d.prixRegistre} />
          <p>{d.prixNote}</p>
        </div>
        <Pied n={2} total={P} />
      </section>

      {/* --------------------------- 3 · Durée · 4 · Exclusivité (si régime) */}
      <section className="page">
        <Entete d={d} />
        <div className="pc">
          <H2 n={d.art.duree}>Durée, irrévocabilité et dénonciation</H2>
          <Registre lignes={d.registre} fort />
          <div className="plain">
            {d.dureeParagraphes.map((p, i) => <p className="lead" key={i}><T t={p} /></p>)}
            {/* Article 78 du décret du 20 juillet 1972 : cette faculté doit
                figurer « en caractères très apparents ». Son absence est
                sanctionnée par la nullité absolue du mandat entier — c'est la
                seule règle du document dont le non-respect l'annule. */}
            <p className="lead legal-apparent"><T t={d.apparent} /></p>
            <p className="fine">{d.dureeFine}</p>
          </div>

          <p className="viz-lead">{d.friseLead}</p>
          <div className="gantt">
            <div className="gt gt-h"><span className="gt-l" /><div className="gt-t gt-hd" /><span className="gt-e">Échéance</span></div>
            {d.frise.map((b) => (
              <div className="gt" key={b.label}>
                <span className="gt-l">{b.label}</span>
                <div className="gt-t">
                  <i className={b.classe} style={{ width: `${b.largeur}%` }}>
                    {!b.dehors && <em>{b.duree}</em>}
                  </i>
                  {b.dehors && <span className="gt-out" style={{ left: `calc(${b.largeur}% + 2mm)` }}>{b.duree}</span>}
                </div>
                <span className="gt-e">{b.echeance}</span>
              </div>
            ))}
          </div>

          {d.exclusivite && (
            <>
              <h2 style={{ marginTop: "5mm" }}><span className="anum">{d.art.exclusivite}</span>Exclusivité</h2>
              <div className="plain">
                {d.exclusivite.paragraphes.map((p, i) => <p className="lead" key={i}><T t={p} /></p>)}
                <p className="fine">{d.exclusivite.fine}</p>
              </div>
            </>
          )}
        </div>
        <Pied n={3} total={P} />
      </section>

      {/* ------------------------- 5 · Clause pénale · 6 · Obligations */}
      <section className="page">
        <Entete d={d} />
        <div className="pc">
          <H2 n={d.art.penale}>Clause pénale</H2>
          <div className="plain">
            {d.penale.map((p, i) => <p className="lead" key={i}><T t={p} /></p>)}
            <p className="fine"><T t={d.penaleFine} /></p>
          </div>

          <h2 style={{ marginTop: "5mm" }}><span className="anum">{d.art.obligations}</span>Obligations des parties</h2>
          <div className="duo">
            <div>
              <h3 style={{ marginTop: 0 }}>Le Mandant s’engage à</h3>
              <ul className="lst">
                <li>Remettre au Mandataire, sous huitaine, les actes et pièces justifiant sa propriété ainsi que les diagnostics obligatoires, sans lesquels aucune publicité ne peut être engagée.</li>
                <li>Garantir l’exactitude des informations transmises et signaler sans délai toute modification juridique ou matérielle affectant le bien, tout congé, toute vacance ou tout impayé.</li>
                <li>Assurer au Mandataire les moyens de visiter et de faire visiter le bien, dans le respect des droits des occupants.</li>
                <li>Signer toute promesse ou tout compromis de vente avec un acquéreur présenté par le Mandataire et acceptant les prix, charges et conditions des présentes.</li>
                <li>Ne pas mettre le Mandataire en situation de concurrence déloyale, notamment sur le prix.</li>
              </ul>
            </div>
            <div>
              <h3 style={{ marginTop: 0 }}>Le Mandataire s’engage à</h3>
              <ul className="lst">
                <li>Mettre en œuvre les moyens nécessaires à la commercialisation du bien et rendre compte régulièrement de son activité.</li>
                <li>Négocier, si nécessaire, avec tout titulaire d’un droit de préemption, le Mandant restant libre d’accepter ou de refuser un prix inférieur.</li>
                <li>Notifier au Mandant la réalisation du contrat de vente dans les huit jours suivant la signature de l’acquéreur ou la fin du délai de rétractation.</li>
                {/* Rétablie à la demande de MAV : elle avait sauté des dernières
                    versions de la maquette et elle est utile. */}
                <li>Informer le Mandant de l’arrivée à terme du mandat et de sa faculté d’accepter ou de refuser une reconduction.</li>
                <li>Informer le Mandant de tout lien capitalistique ou juridique avec une banque ou un établissement financier. Il déclare n’en avoir aucun à ce jour.</li>
              </ul>
              <h3>Pouvoirs conférés</h3>
              <ul className="lst">
                <li>Présenter, visiter, faire visiter et proposer le bien à toute personne de son choix.</li>
                <li>Engager toute publicité sur tout support à sa convenance, les frais restant à sa charge.</li>
                <li>Requérir tout confrère, groupement ou réseau autorisé par la loi à présenter des opérations immobilières.</li>
                <li>Recevoir toute offre d’achat, assortie ou non d’une condition suspensive de financement, et la transmettre sans délai au Mandant.</li>
                <li>En cas d’offre acceptée par le Mandant, solliciter et recueillir pour son compte, auprès de toute administration, syndic, notaire ou tiers, les documents nécessaires à la vente. Les pièces dont l’obtention est payante ne sont commandées qu’avec l’accord préalable du Mandant, à qui elles sont facturées.</li>
              </ul>
            </div>
          </div>
        </div>
        <Pied n={4} total={P} />
      </section>

      {/* --------------------- 7 · Mentions légales · 8 · Signatures */}
      <section className="page">
        <Entete d={d} />
        <div className="pc">
          <H2 n={d.art.mentions}>Mentions légales</H2>
          <div className="mentions two">
            <div className="ment">
              <h4>Information des parties</h4>
              <p>Chaque partie ayant des informations dont l’importance est déterminante pour le consentement de l’autre devra les lui communiquer, conformément à l’article 1112-1 du Code civil.</p>
            </div>
            <div className="ment">
              <h4>Élection de domicile</h4>
              <p>Les parties font élection de domicile à leur adresse respective stipulée à l’article {d.art.parties}, exception faite pour la notification de rétractation de l’acquéreur, adressée au siège du Mandataire.</p>
            </div>
            <div className="ment">
              <h4>Données à caractère personnel</h4>
              <p>Données traitées aux seules fins d’exécution du présent mandat, conformément au Règlement (UE) 2016/679 et à la loi n° 78-17 du 6 janvier 1978 modifiée. Droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité auprès de France Immeuble, {MANDATAIRE.siege}, ou à {MANDATAIRE.email}.</p>
            </div>
            <div className="ment">
              <h4>Règlement extrajudiciaire des litiges</h4>
              <p>{MEDIATEUR}</p>
            </div>
            <div className="ment">
              <h4>Registre des mandats et remise d’un exemplaire</h4>
              <p>{d.registreMention}</p>
            </div>
          </div>

          <h2 style={{ marginTop: "7mm" }}><span className="anum">{d.art.signatures}</span>Signatures</h2>
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
        <Pied n={5} total={P} />
      </section>

      {/* -------------------------------------------------------- Annexe */}
      {/* Toujours générée, quel que soit le mode de signature : le mandat est
          conclu à distance, le délai de quatorze jours de l'article L.221-18
          s'applique, et l'absence de bordereau détachable expose à la nullité
          et à la perte de la commission. L'annexe ne porte aucun tag de
          signature et ne compte pas dans le total des pages. */}
      <section className="page">
        <Entete d={d} />
        <div className="pc">
          <H2 n="A">Annexe — Formulaire de rétractation</H2>
          {d.annexeIntro.map((p, i) => <p className="intro" key={i}>{p}</p>)}
          <div className="coupon">
            <div className="coupon-t">Formulaire de rétractation</div>
            <p>À l’attention de {MANDATAIRE.nom}, {MANDATAIRE.siege} — {MANDATAIRE.email}</p>
            <p>{d.annexeCoupon}</p>
            <div className="clines">
              {["Nom du Mandant", "Adresse", "Date", "Signature"].map((l) => (
                <div key={l}><span>{l}</span><i /></div>
              ))}
            </div>
          </div>
        </div>
        <div className="doc-ft">
          <div className="ft-l">{MANDATAIRE.pied}</div>
          <div className="pg">Annexe au mandat n° {d.numero} — document détachable</div>
        </div>
      </section>
    </div>
  );
}
