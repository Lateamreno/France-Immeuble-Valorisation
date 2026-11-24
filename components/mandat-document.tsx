// Le mandat, rendu. Une seule mise en forme sert l'aperçu à l'écran, le PDF
// généré par le serveur et l'impression de secours — comme le dossier
// d'estimation. Le texte, lui, vient entièrement de lib/mandat-texte.ts.
import { PIED_MANDAT, type Article, type Bloc, type MandatRedige } from "@/lib/mandat-texte";

export function MandatDocument({ d, nu, lieu }: { d: MandatRedige; nu?: boolean; lieu?: string }) {
  return (
    <div className={`mdp${nu ? " nu" : ""}`}>
      {d.trous.length > 0 && (
        <div className="mdp-trous">
          <b>Ce document est incomplet — {d.trous.length} information{d.trous.length > 1 ? "s" : ""} manque{d.trous.length > 1 ? "nt" : ""} :</b>
          {d.trous.join(" · ")}. Les emplacements correspondants sont laissés en pointillés.
        </div>
      )}

      <div className="mdp-feuille">
        <header className="mdp-h">
          <div className="mdp-mq">FRANCE IMMEUBLE<i>Immeubles de rapport</i></div>
          <div className="num">
            Mandat n°
            <b>{d.numero ?? "—"}</b>
            Registre des mandats
          </div>
        </header>

        <h1 className="mdp-titre">{d.titre}</h1>
        <div className="mdp-stitre">
          Soumis aux dispositions de la loi n° 70-9 du 2 janvier 1970 et du décret n° 72-678 du 20 juillet 1972
        </div>

        <div className="mdp-gar">
          <b>Ce que vous gardez en signant</b>
          <ul>{d.garanties.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>

        {d.articles.map((a) => <ArticleRendu key={a.n} a={a} />)}

        <div className="mdp-sig">
          <div className="lieu">
            Fait à {lieu ?? "Paris"}, en autant d&apos;exemplaires que de parties, dont un remis à chaque
            mandant qui le reconnaît.
          </div>
          <div className="mdp-sig-grid">
            {d.signataires.map((s, i) => (
              <div key={i} className="mdp-sig-c">
                <b>{s.role}</b>
                <span>{s.nom}</span>
                <i>{s.mention}</i>
              </div>
            ))}
          </div>
        </div>

        <div className="mdp-pied">
          {PIED_MANDAT.map((l, i) => <div key={i}>{l}</div>)}
        </div>

        <div className="mdp-bord">
          <h3>{d.bordereau.titre}</h3>
          {d.bordereau.lignes.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      </div>
    </div>
  );
}

function ArticleRendu({ a }: { a: Article }) {
  return (
    <section className="mdp-art">
      <h3><i>Article {a.n}</i>{a.titre}</h3>
      {a.blocs.map((b, i) => <BlocRendu key={i} b={b} />)}
    </section>
  );
}

function BlocRendu({ b }: { b: Bloc }) {
  if (b.t === "p") return <p>{b.texte}</p>;
  if (b.t === "liste") return <ul>{b.items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  return (
    <div className="mdp-sous">
      <h4>{b.titre}</h4>
      {b.blocs.map((x, i) => <BlocRendu key={i} b={x} />)}
    </div>
  );
}
