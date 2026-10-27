import Link from "next/link";
import { dmy, euros } from "@/lib/format";
import { listeVentes, type LigneVente } from "@/lib/bo/ventes-site";
import { Pastille } from "@/components/pastille";

export const dynamic = "force-dynamic";

/** L'adresse publique du site, pour les liens « Voir la page ». */
const SITE_PUBLIC = (process.env.SITE_FI_PUBLIC_URL ?? "https://france-immeuble-refonte-site.vercel.app").replace(/\/+$/, "");

/**
 * Les biens vendus, tels que le site les montre (contrat §4, lot 2). Deux
 * files : les ventes neuves qui attendent votre décision, et les ventes déjà
 * en ligne dont le récit reste à écrire ou à valider.
 */
export default async function VentesSitePage() {
  const { aPublier, passees, configuree } = await listeVentes().catch(() => ({ aPublier: [], passees: [], configuree: false }));
  const limite = Date.now() - 7 * 86_400_000;
  const avecRecit = passees.filter((v) => v.etat === "avec_recit").length;
  const brouillons = passees.filter((v) => v.etat !== "avec_recit" && v.brouillon).length;
  /* Les récits qu'un agent a soumis : la direction les relit avant la mise en ligne (MAV, 27/10). */
  const relectures = [...aPublier, ...passees].filter((v) => v.relecture).length;

  return (
    <div className="wrap vs">
      <div className="dif-parc-h">
        <span className="t">Biens vendus</span>
        <span className="s">Les ventes affichées sur le site France Immeuble. Rien n&apos;y part sans votre validation.</span>
      </div>
      {!configuree && <div className="vs-msg ko">Le site n&apos;est pas branché ici : lecture seule.</div>}
      {relectures > 0 && (
        <div className="vs-msg">
          {relectures} vente{relectures > 1 ? "s" : ""} à relire : un agent en a demandé la publication. Rien n&apos;est en ligne avant votre validation.
        </div>
      )}

      <div className="dif-tuiles">
        <div className="dif-tuile"><span className="k">À publier</span><b>{aPublier.length}</b></div>
        <div className="dif-tuile"><span className="k">En ligne</span><b>{passees.length}</b></div>
        <div className="dif-tuile"><span className="k">Récit à relire</span><b>{brouillons}</b></div>
        <div className="dif-tuile"><span className="k">Récit en ligne</span><b className="vert">{avecRecit}</b></div>
      </div>

      <h2 className="vs-h2">Ventes à publier</h2>
      {aPublier.length === 0 ? (
        <p className="vs-note">Aucune vente neuve en attente. Quand un bien passe au statut 11, il arrive ici.</p>
      ) : (
        <Table lignes={aPublier} limite={limite} />
      )}

      <h2 className="vs-h2">Ventes en ligne à enrichir</h2>
      <p className="vs-note">Du dossier le plus complet au plus pauvre. Une vente sans récit est en ligne mais pas indexée par Google.</p>
      <Table lignes={passees} limite={limite} />
    </div>
  );
}

function Table({ lignes, limite }: { lignes: LigneVente[]; limite: number }) {
  return (
    <div className="vs-table">
      <table>
        <thead>
          <tr><th>Commune</th><th>Acte</th><th className="n">Prix</th><th className="n">Faits</th><th>Récit</th><th /></tr>
        </thead>
        <tbody>
          {lignes.map((v) => {
            const retard = v.etat === "non_publiee" && v.attendDepuis && Date.parse(v.attendDepuis) < limite;
            return (
              <tr key={v.id} className={retard ? "retard" : undefined}>
                <td><b>{v.commune}</b> <span className="d">({v.dept})</span></td>
                <td>{dmy(v.date) ?? "—"}</td>
                <td className="n">{euros(v.prix) ?? "—"}</td>
                <td className={`n ${v.faits >= 6 ? "" : "pauvre"}`}>{v.faits ? `${v.faits}/13` : "—"}</td>
                <td>
                  {v.relecture ? <Pastille ton="orange" titre={`Demandée par ${v.relecture.par} le ${dmy(v.relecture.le) ?? "?"}`}>Relecture demandée</Pastille>
                    : v.etat === "retiree" ? <Pastille ton="gris" titre="Retirée du site depuis l'écran Diffusion">Retirée</Pastille>
                    : v.etat === "avec_recit" ? <Pastille ton="vert">En ligne</Pastille>
                    : v.brouillon ? <Pastille ton="bleu">À relire</Pastille>
                    : v.etat === "sans_recit" ? <Pastille ton="gris">Sans récit</Pastille>
                    : v.etat === "inconnu" ? <Pastille ton="gris" titre="La base du site n'a pas répondu">État inconnu</Pastille>
                    : <Pastille ton={retard ? "rouge" : "orange"}>{retard ? "En attente > 7 j" : "À décider"}</Pastille>}
                </td>
                <td className="a">
                  {v.slug && <a href={`${SITE_PUBLIC}/immeubles-vendus/${v.slug}/`} target="_blank" rel="noreferrer">Page</a>}
                  <Link href={`/ventes-site/${encodeURIComponent(v.id)}`} className="fadd">Ouvrir</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
