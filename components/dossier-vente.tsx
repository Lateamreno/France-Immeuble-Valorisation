// Le dossier complet de vente — les 8 pages A4, calquées sur le PDF que
// France Immeuble envoie aujourd'hui (référence : Drancy, 5 rue Marcelin
// Berthelot, v3 du 24/03/25).
//
// Fond sombre, tranche dorée à droite, silhouette de ville en pied : c'est la
// tenue de la maison. Tout vient de `lib/bo/dossier-vente.ts` ; cette page ne
// calcule rien, elle met en forme.
import type { DossierVente } from "@/lib/bo/dossier-vente";
import { group } from "@/lib/format";
import { MENTIONS } from "@/lib/bo/textes-cible";
import { PhotoDossier } from "@/components/photo-dossier";

const fr1 = (x?: number) => (x === undefined ? "n.c." : x.toFixed(1).replace(".", ","));
const eur = (x?: number) => (x === undefined ? "n.c." : `${group(x)} €`);
const nc = (s?: string) => (s && s.trim() ? s : "n.c.");

/* --- Pictos, au trait, comme le reste de la maison --- */
const I = {
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></>,
  photo: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8 7l1.5-3h5L16 7" /><circle cx="12" cy="13.5" r="3.4" /></>,
  pin: <><path d="M12 22s7-6.6 7-12a7 7 0 1 0-14 0c0 5.4 7 12 7 12z" /><circle cx="12" cy="10" r="2.6" /></>,
  pouls: <><path d="M3 12h4l2.5-6 4 12L16 12h5" /></>,
  cle: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M16 7l2 2M19 4l2 2" /></>,
  /* Retour #222 : « le picto travaux à prévoir, si tu peux mettre une clé à
     molette c'est mieux. » `cle` est déjà prise par l'état locatif — ce sont
     les clés d'un bail, pas un outil. */
  molette: <><path d="M20.4 5.1a4.7 4.7 0 0 1-6.1 6.1l-7.4 7.4a2.35 2.35 0 1 1-3.3-3.3l7.4-7.4a4.7 4.7 0 0 1 6.1-6.1l-3 3 .6 3.3 3.3.6z" /></>,
  euro: <><path d="M17 6.5A6.5 6.5 0 0 0 7.5 12 6.5 6.5 0 0 0 17 17.5" /><path d="M4 10.5h8M4 13.5h8" /></>,
  ampoule: <><path d="M9.5 18h5M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" /></>,
  maison: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>,
  boutique: <><path d="M4 8h16l-1 12H5z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  parking: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M10 16V9h3a2.5 2.5 0 0 1 0 5h-3" /></>,
  bureau: <><rect x="3" y="7" width="18" height="12" rx="1.5" /><path d="M9 7V5h6v2" /></>,
  train: <><rect x="6" y="4" width="12" height="10" rx="1.5" /><path d="M6 14l-2 5M18 14l2 5M9 19h6" /><circle cx="9" cy="10" r="1" /><circle cx="15" cy="10" r="1" /></>,
  bus: <><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M4 10h16" /><path d="M7 20v-2M17 20v-2" /><circle cx="8" cy="13.5" r="1" /><circle cx="16" cy="13.5" r="1" /></>,
  voiture: <><path d="M4 15h16v-3l-2-4H6l-2 4z" /><circle cx="7.5" cy="17" r="1.6" /><circle cx="16.5" cy="17" r="1.6" /></>,
  ecole: <><path d="M3 9l9-4 9 4-9 4z" /><path d="M7 11v5c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5v-5" /></>,
  drapeau: <><path d="M6 21V4" /><path d="M6 5h12l-2.5 4L18 13H6" /></>,
  gens: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.6 14.2c2.4.2 4.2 1.6 4.6 4.3" /></>,
  billet: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /></>,
  tension: <><path d="M15.5 4.5 18 2l.8 2.2 2.2.8-2.5 2.5" /><circle cx="10" cy="14" r="6.5" /></>,
  /* Retour #242 : la baguette magique ne disait rien d'une tension locative.
     Un thermomètre, si — c'est le mot même de « tensiomètre ». */
  thermo: <><path d="M14.5 13.4V5.5a2.5 2.5 0 0 0-5 0v7.9a4.5 4.5 0 1 0 5 0z" /><path d="M12 9v5.6" /></>,
  courbe: <><path d="M3 19h18" /><path d="M3 16.5 8.5 9l4 3.5L20 5v11.5z" /></>,
  outil: <><path d="m14.5 5.5 4 4-8.5 8.5H6v-4z" /><path d="M13 7 17 11" /><path d="M3 21h18" /></>,
  fleche: <><path d="M3 12h11M10 8l4 4-4 4" /><path d="M15 4h6v16h-6" /></>,
  carte: <><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7z" /><path d="M9 4v13M15 7v12.5" /></>,
  camembert: <><path d="M12 3a9 9 0 1 0 9 9h-9z" /><path d="M14.5 2.5A9 9 0 0 1 21.5 9.5h-7z" /></>,
  brique: <><path d="M3 8h18M3 12h18M3 16h18" /><path d="M3 8v8M21 8v8" /><path d="M9 8v4M15 12v4" /></>,
  coche: <><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="m8 12 3 3 5-6" /></>,
  perso: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c.7-4.3 3.9-6 7.5-6s6.8 1.7 7.5 6" /></>,
  cal: <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  mail: <><path d="M3 7.5 12 13l9-5.5" /><rect x="3" y="5" width="18" height="14" rx="2" /></>,
  tel: <><path d="M6 3h4l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2.2 2C10.6 19.3 4.7 13.4 4 5.2A2 2 0 0 1 6 3z" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" /></>,
};

const Ic = ({ d, cls = "dv-ic" }: { d: React.ReactNode; cls?: string }) => (
  <svg className={cls} viewBox="0 0 24 24" aria-hidden>{d}</svg>
);

/** Le picto de destination d'une ligne de lot. */
const IC_DEST: Record<string, React.ReactNode> = {
  Logement: I.maison, Commerce: I.boutique, Bureau: I.bureau,
  Parking: I.parking, Cave: I.parking, Logistique: I.bureau, Annexe: I.parking,
};

/** Le picto de chaque point d'intérêt de la page Emplacement. */
const IC_POI: Record<string, React.ReactNode> = {
  gare: I.train, bus: I.bus, route: I.voiture, school: I.ecole, com: I.boutique, autre: I.drapeau,
};

/**
 * Une page A4 du dossier : tranche dorée titrée, pied de page.
 *
 * La couverture n'a ni titre ni pied ; le dos n'a rien du tout.
 *
 * Retour #222 : « le bandeau or sur le côté de toutes les pages est énorme et
 * ne contient plus le titre de la page, ce qu'il faudrait ajouter en gardant
 * les pictos. » Le titre vivait dans un second bandeau, horizontal, en haut de
 * page : 22 mm de hauteur qui répétaient ce que la tranche aurait dû dire.
 * Elle le dit maintenant, elle a maigri, et la page y gagne la place qu'il
 * fallait pour grossir les polices (#223, #224, #225).
 */
function Page({ titre, picto, pied, enfants, nu, compact }: {
  titre?: string; picto?: React.ReactNode; pied?: string;
  enfants: React.ReactNode; nu?: boolean;
  /** Page très chargée : interlignes et titres resserrés (état financier). */
  compact?: boolean;
}) {
  return (
    <section className={`dv-page${nu ? " nue" : ""}${compact ? " serre" : ""}`}>
      <div className="dv-in">
        {enfants}
        {pied && (
          <div className="dv-pied">
            <span>{pied}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/fi-creme-bronze-fond-sombre.svg" alt="" />
          </div>
        )}
      </div>
      {/* Retour #222 : la tranche porte enfin le titre de la page et son picto.
          Elle était vide sur les pages intérieures — 30 mm de doré pour rien,
          pendant que le titre occupait un second bandeau en haut. */}
      {!nu && (
        <div className="dv-tranche">
          {titre && <span className="dv-tr-t">{titre}</span>}
          {picto && <Ic d={picto} cls="dv-tr-ic" />}
        </div>
      )}
    </section>
  );
}

export function DossierVente({ d, nu }: { d: DossierVente; nu?: boolean }) {
  const pied = `${d.cp} ${d.ville} — ${d.adresse.split(",")[0]} (v${d.version} - ${d.date} ${d.heure})`;

  return (
    <div className={`dv${nu ? " nu" : ""}`}>
      {/* ------------------------------------------------ 1. Couverture */}
      <section className="dv-page dv-cv">
        <div className="dv-tranche">
          <span className="dv-tr-t">Dossier complet</span>
          <Ic d={I.doc} cls="dv-tr-ic" />
        </div>

        {/* Le contenu s'arrête au bord de la tranche, comme les autres pages. */}
        <div className="dv-in">
        <div className="dv-cv-h">
          <div className="dv-cv-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="dv-logo" src="/logos/fi-creme-bronze-fond-sombre.svg" alt="France Immeuble" />
            <b>{d.agence.nom}</b>
            <p>{d.agence.tel}<br />{d.agence.email}<br />{d.agence.site}</p>
          </div>
          <div className="dv-cv-ag">
            {d.agent.photo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img className="dv-ag-ph" src={d.agent.photo} alt="" />
              : <span className="dv-ag-ph vide" />}
            <b>{d.agent.nom}</b>
            <p>{d.agent.tel}<br />{d.agent.email}</p>
          </div>
        </div>

        <div className="dv-cv-photo">
          {d.photoPrincipale
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={d.photoPrincipale} alt="" />
            : <span className="dv-vide">Photo principale à ajouter</span>}
        </div>

        <div className="dv-cv-g">
          <Case label="Surface carrez" valeur={d.surface > 0 ? group(d.surface) : "n.c."} unite="m²" />
          <div className="dv-case large">
            <b className="dv-cible">{d.cibles.length ? d.cibles.join(", ") : "Investissement locatif"}</b>
            {/* Retour #244 : deux par ligne au-delà de deux, et des cotes
                resserrées à partir de quatre — le cadre, lui, ne grandit pas. */}
            <div className={`dv-chips${d.compo.length > 2 ? " deux" : ""}${d.compo.length > 3 ? " serree" : ""}`}>
              {d.compo.map((c) => (
                <span key={c.dest} className="dv-chip">
                  <Ic d={IC_DEST[c.dest] ?? I.maison} cls="dv-chip-ic" />{c.texte}
                </span>
              ))}
            </div>
          </div>
          <Case label="Occupation carrez" valeur={String(d.occupation)} unite="%" />

          <Case label="Prix au m²" valeur={d.prix.m2 > 0 ? group(d.prix.m2) : "n.c."} unite="€/m²" />
          <div className="dv-case large">
            <span className="dv-lab">Prix honoraires inclus</span>
            <b className="dv-prix">{group(d.prix.hai)} <i>€</i></b>
            <span className="dv-tvx">
              <Ic d={I.molette} cls="dv-ic pt" />
              {d.prix.travaux > 0 ? `${group(d.prix.travaux)} € de travaux à prévoir` : "Pas de travaux à prévoir"}
            </span>
          </div>
          <div className="dv-case">
            <span className="dv-lab">Rendement brut</span>
            <b className="dv-deux">
              {fr1(d.rendement.actuel.brut)} <i>%</i>
              <em>–</em>
              <span className="or">{fr1(d.rendement.potentiel.brut)} <i>%</i></span>
            </b>
          </div>
        </div>

        <div className="dv-cv-adr">{d.adresse}</div>
        </div>
      </section>

      {/* ---------------------------------------------------- 2. Photos */}
      {/* Retour #312 — « dans le dossier, quand aucune photo n'est dans le
          bien, tu ne mets pas la page photo, tu passes immédiatement à celle
          d'après. »
          Une page qui annonce « aucune photo » ne renseigne personne : elle
          dit au lecteur que le dossier est incomplet, sur le document même
          qu'on lui envoie pour le convaincre. Mieux vaut ne pas l'imprimer —
          la liste des manques, côté BO, dit déjà ce qu'il faut déposer. */}
      {d.photos.length > 0 && (
        <Page titre="Photos" picto={I.photo} pied={pied} enfants={
          <div className="dv-ph-grid">
            {/* Huit photos par planche : au-delà, une seconde page. */}
            {d.photos.slice(0, 8).map((u, i) => <PhotoDossier key={i} src={u} />)}
          </div>
        } />
      )}
      {d.photos.length > 8 && (
        <Page titre="Photos" picto={I.photo} pied={pied} enfants={
          <div className="dv-ph-grid">
            {d.photos.slice(8, 16).map((u, i) => <PhotoDossier key={i} src={u} />)}
          </div>
        } />
      )}

      {/* ----------------------------------------------- 3. Emplacement */}
      <Page titre="Emplacement" picto={I.pin} pied={pied} enfants={<>
        {/* Retours #221 et #233 : les deux cartes viennent de Google, en
            direct, et de nulle part ailleurs. */}
        <div className={`dv-carte${d.cartes ? " duo" : ""}`}>
          {d.cartes ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.cartes.region} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.cartes.quartier} alt="" />
            </>
          ) : (
            <span className="dv-vide">Adresse non géocodée : la carte apparaîtra dès que la géolocalisation sera renseignée.</span>
          )}
        </div>
        <div className="dv-adr-bar"><Ic d={I.pin} /> {d.adresse}</div>

        <table className="dv-poi">
          <tbody>
            {d.poi.map((p) => (
              <tr key={p.cle}>
                <td className="ic"><Ic d={IC_POI[p.cle] ?? I.drapeau} /></td>
                <td className="l">{p.label}</td>
                <td className="n">{nc(p.nom)}</td>
                <td className="t">{p.minutes !== undefined ? `${p.minutes} min ${p.moyen}` : "n.c."}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="dv-ville">
          <div className="dv-ville-t">{d.ville}</div>
          <div className="dv-ville-g">
            <Stat picto={I.gens} label="Habitants" source="INSEE"
              valeur={d.ville_stats.habitants !== undefined ? group(d.ville_stats.habitants) : "n.c."} />
            <Stat picto={I.billet} label="Revenus médian" source="INSEE"
              valeur={d.ville_stats.revenus !== undefined ? String(Math.round(d.ville_stats.revenus / 1000)) : "n.c."}
              unite="k€/habitant/an" />
            <Stat picto={I.thermo} label="Tension locative" source="LOCservice"
              valeur={nc(d.ville_stats.tension)} />
            <Stat picto={I.courbe} label="Prix des logements" source="Notaires"
              valeur={d.ville_stats.prix !== undefined ? group(d.ville_stats.prix) : "n.c."} unite="€/m²" />
          </div>
        </div>
      </>} />

      {/* -------------------------------------------- 4. État technique */}
      <Page titre="Etat technique" picto={I.pouls} pied={pied} enfants={<>
        <h2 className="dv-h"><Ic d={I.brique} /> Construit en <b>{d.annee ?? "n.c."}</b></h2>

        <h2 className="dv-h"><Ic d={I.pouls} /> Etat des matériaux</h2>
        <table className="dv-tab">
          <thead>
            <tr><th>Type</th><th>Matériau</th><th>Derniers travaux</th><th className="r">Etat</th></tr>
          </thead>
          <tbody>
            {d.composants.map((c, i) => (
              <tr key={i}>
                <td>{nc(c.type)}</td>
                <td className="c">{nc(c.materiau)}</td>
                <td className="c gris">{c.annee ?? "n.c."}</td>
                <td className={`r${/rénov|renov|neuf/i.test(c.etat) ? " vert" : ""}`}>{nc(c.etat)}</td>
              </tr>
            ))}
            {d.composants.length === 0 && (
              <tr><td colSpan={4} className="gris">Aucun composant renseigné.</td></tr>
            )}
          </tbody>
          {d.etatGeneral && (
            <tfoot><tr><td colSpan={3} /><td className="r">{d.etatGeneral}</td></tr></tfoot>
          )}
        </table>

        {/* Retour #222 : la clé à molette plutôt que l'outil générique. */}
        <h2 className="dv-h"><Ic d={I.molette} /> Travaux à prévoir</h2>
        {d.travauxListe.length === 0 ? (
          <div className="dv-plat">Aucun travaux à prévoir</div>
        ) : (
          <table className="dv-tab">
            <thead>
              <tr>
                <th>Objet des travaux</th><th>Description</th>
                <th className="c">Urgence</th><th className="r">Montant</th>
              </tr>
            </thead>
            <tbody>
              {d.travauxListe.map((t, i) => (
                <tr key={i}>
                  <td>{t.objet}</td>
                  <td className="gris">{nc(t.description)}</td>
                  <td className={`c${/urgent|imm[ée]diat/i.test(t.urgence) ? " rouge" : ""}`}>{nc(t.urgence)}</td>
                  <td className="r">{eur(t.montant)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}>Total</td><td className="r">{eur(d.prix.travaux)}</td></tr>
            </tfoot>
          </table>
        )}

        <div className="dv-terrain">
          <div className="dv-t-col">
            <div className="dv-t-h"><Ic d={I.carte} /> Terrain</div>
            <span>Parcelle</span><b>{nc(d.terrain.parcelle)}</b>
            <span>Superficie</span><b>{d.terrain.superficie !== undefined ? `${group(d.terrain.superficie)} m²` : "n.c."}</b>
            <span>Façade</span><b>{d.terrain.facade !== undefined ? `${group(d.terrain.facade)} m` : "n.c."}</b>
          </div>
          <div className="dv-t-img">
            {d.terrain.image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={d.terrain.image} alt="" />
              : <span className="dv-vide">Plan de parcelle</span>}
          </div>
          <div className="dv-t-col">
            <div className="dv-t-h"><Ic d={I.doc} /> PLU</div>
            <span>Zone</span><b>{nc(d.plu.zone)}</b>
            <span>Emprise max</span><b>{d.plu.emprise !== undefined ? `${d.plu.emprise} %` : "n.c."}</b>
            <span>Hauteur max</span><b>{d.plu.hauteur !== undefined ? `${d.plu.hauteur} m` : "n.c."}</b>
          </div>
        </div>
      </>} />

      {/* ---------------------------------------------- 5. État locatif */}
      <Page titre="Etat locatif" picto={I.cle} pied={pied} enfants={<>
        {/* Retour #318 — « quand on n'a pas les dates d'entrée ni le type de
            bail, le mieux c'est de ne pas mettre la ou les colonnes. »
            Une colonne de « n.c. » sur toute sa hauteur ne dit rien du bien :
            elle dit que le dossier est incomplet, et elle prend la place que
            les colonnes chiffrées réclament. Chacune ne s'imprime donc que si
            au moins un lot la renseigne. */}
        {(() => {
          const colBail = d.lots.some((l) => nc(l.bail) !== "n.c.");
          const colEntree = d.lots.some((l) => !!l.entree);
          const nbCols = 8 + (colBail ? 1 : 0) + (colEntree ? 1 : 0);
          return (
        <table className="dv-tab lots">
          <thead>
            <tr>
              <th>n°</th><th>Type de lot</th><th className="c">Carrez</th><th className="c">Au sol</th>
              <th className="c">DPE</th><th className="c">Etat</th>
              {colBail && <th className="c">Bail</th>}
              {colEntree && <th className="c">Entrée</th>}
              <th className="r">HC/mois</th><th className="r">Potentiel*</th>
            </tr>
          </thead>
          <tbody>
            {d.lots.map((l, i) => (
              <tr key={i}>
                <td className="gris">{l.n}</td>
                {/* Retour #240 : le picto reste sur la ligne du type de lot.
                    Il tombait dessous dès que le libellé remplissait la
                    cellule — une image en ligne se replie comme un mot. */}
                <td><span className="dv-lot"><Ic d={IC_DEST[l.dest] ?? I.maison} cls="dv-ic mini" />{l.type}</span></td>
                <td className="c">{l.carrez !== undefined ? <>{group(l.carrez)} <i>m²</i></> : "n.a."}</td>
                <td className="c">{l.sol !== undefined ? <>{group(l.sol)} <i>m²</i></> : "n.a."}</td>
                {/* Le DPE du dossier reste une lettre en gris. Les pastilles
                    de l'état locatif, essayées au #317, ont été écartées à la
                    relecture (#337) : à l'écran elles guident l'œil, mais sur
                    une page imprimée où douze lignes se suivent, douze aplats
                    de couleur tirent le regard avant le prix et la surface. */}
                <td className="c gris">{nc(l.dpe)}</td>
                <td className={`c${/rénov|renov|neuf/i.test(l.etat) ? " vert" : ""}`}>{nc(l.etat)}</td>
                {colBail && (
                  <td className={`c${/^vide$/i.test(l.bail) ? " rouge" : ""}`}>{nc(l.bail)}</td>
                )}
                {colEntree && <td className="c gris">{l.entree || "n.c."}</td>}
                <td className="r">{l.loyer !== undefined ? `${group(l.loyer)} €` : "0 €"}</td>
                <td className="r or">{group(l.potentiel)} <i>€/an</i></td>
              </tr>
            ))}
            {d.lots.length === 0 && (
              <tr><td colSpan={nbCols} className="gris">L&apos;état locatif est vide.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} />
              <td className="c">{group(d.total.carrez)} <i>m²</i></td>
              <td className="c">{group(d.total.sol)} <i>m²</i></td>
              <td colSpan={2 + (colBail ? 1 : 0) + (colEntree ? 1 : 0)} />
              <td className="r">{group(d.total.loyerMois)} €</td>
              <td className="r or">{group(d.total.potentiel)} <i>€/an</i></td>
            </tr>
          </tfoot>
        </table>
          );
        })()}
        <p className="dv-note">
          * Potentiel calculé à partir des loyers du secteur, de l&apos;encadrement des loyers et
          des indices de révision.
        </p>
      </>} />

      {/* -------------------------------------------- 6. État financier */}
      <Page titre="Etat financier" picto={I.euro} pied={pied} compact enfants={<>
        <h2 className="dv-h"><Ic d={I.camembert} /> Coût d&apos;acquisition</h2>
        <table className="dv-tab fin">
          <thead>
            <tr><th>Type de coût</th><th className="c">Montant</th><th className="c">Type de prix</th><th className="r">Prix</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Net vendeur</td><td className="c">{eur(d.prix.nv)}</td>
              <td className="c">= Prix net vendeur</td><td className="r">{eur(d.prix.nv)}</td>
            </tr>
            <tr>
              <td>+ Honoraires TTC <i>({fr1(d.prix.taux)} %)</i></td><td className="c">{eur(d.prix.honos)}</td>
              <td className="c">= Prix honoraires inclus</td><td className="r">{eur(d.prix.hai)}</td>
            </tr>
            <tr>
              <td>+ Frais de notaire <i>(7,5 %)</i></td><td className="c">{eur(d.prix.notaire)}</td>
              <td className="c">= Prix acte en main</td><td className="r">{eur(d.prix.hai + d.prix.notaire)}</td>
            </tr>
            <tr>
              <td>+ Travaux à prévoir</td><td className="c">{eur(d.prix.travaux)}</td>
              <td className="c">= Coût total après travaux</td>
              <td className="r">{eur(d.prix.hai + d.prix.notaire + d.prix.travaux)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><td colSpan={3} /><td className="r">{eur(d.prix.hai + d.prix.notaire + d.prix.travaux)}</td></tr>
          </tfoot>
        </table>

        <h2 className="dv-h"><Ic d={I.fleche} /> Revenus hors charges</h2>
        <table className="dv-tab fin">
          <thead>
            <tr><th>Type de lot</th><th className="c">Revenus actuels</th><th className="c">Occupation</th><th className="r">Revenus potentiels</th></tr>
          </thead>
          <tbody>
            {d.revenus.map((r) => (
              <tr key={r.dest}>
                {/* Retour #239 : même chose sur les revenus hors charges. */}
                <td>
                  <span className="dv-lot">
                    <Ic d={IC_DEST[r.dest] ?? I.maison} cls="dv-ic mini" />
                    {r.label[0].toUpperCase()}{r.label.slice(1)}
                  </span>
                </td>
                <td className="c">{group(r.actuel)} €/an</td>
                <td className="c">{r.occupation} %</td>
                <td className="r">{group(r.potentiel)} €/an</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td className="c">{group(d.revenusTot.actuel)} €/an</td>
              <td className="c">{d.revenusTot.occupation} %</td>
              <td className="r or">{group(d.revenusTot.potentiel)} €/an</td>
            </tr>
          </tfoot>
        </table>

        <h2 className="dv-h"><Ic d={I.billet} /> Charges</h2>
        <table className="dv-tab fin">
          <thead>
            <tr><th>Type de charge</th><th className="c">Montant</th><th className="c">Récupérable</th><th className="r">Non récupérable</th></tr>
          </thead>
          <tbody>
            {d.charges.map((c, i) => (
              <tr key={i}>
                <td>{c.type}</td>
                <td className="c">{c.total !== undefined ? `${group(c.total)} €/an` : "n.c."}</td>
                <td className="c">{c.recup !== undefined ? `${group(c.recup)} €/an` : "n.c."}</td>
                <td className="r">{c.nonRecup !== undefined ? `${group(c.nonRecup)} €/an` : "n.c."}</td>
              </tr>
            ))}
            {d.charges.length === 0 && <tr><td colSpan={4} className="gris">Aucune charge renseignée.</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td className="c">{group(d.chargesTot.total)} €/an</td>
              <td className="c">{group(d.chargesTot.recup)} €/an</td>
              <td className="r or">{group(d.chargesTot.nonRecup)} €/an</td>
            </tr>
          </tfoot>
        </table>

        <h2 className="dv-h"><Ic d={I.courbe} /> Rendement</h2>
        <table className="dv-tab fin">
          <thead>
            <tr><th>Type de rendement</th><th className="c">Actuel</th><th className="c" /><th className="r">Potentiel</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Rendement brut</td><td className="c">{fr1(d.rendement.actuel.brut)} %</td>
              <td className="c gris">-&gt;</td><td className="r or">{fr1(d.rendement.potentiel.brut)} %</td>
            </tr>
            <tr>
              <td>Rendement net</td><td className="c">{fr1(d.rendement.actuel.net)} %</td>
              <td className="c gris">-&gt;</td><td className="r or">{fr1(d.rendement.potentiel.net)} %</td>
            </tr>
            <tr>
              <td>Rendement acte en main</td><td className="c">{fr1(d.rendement.actuel.acteEnMain)} %</td>
              <td className="c gris">-&gt;</td><td className="r or">{fr1(d.rendement.potentiel.acteEnMain)} %</td>
            </tr>
          </tbody>
        </table>

        {/* Retour #319 — « je pense que c'est un peu long, les descriptions,
            et ça peut faire bugger le truc. Est-ce qu'on ne ferait pas tout
            tenir sur une à trois lignes max ? Genre revenu brut = Loyer
            HC / Prix HAI, Net = Revenu brut - Charges non récup sur Prix HAI,
            Net AEM = Revenu brut - Charges sur prix HAI + notaire. Le
            potentiel reprend la même base de calcul mais considère les revenus
            de l'immeuble loués à 100 % et le montant des travaux à prévoir. »
            Six lignes pour trois rendements disaient deux fois la même chose :
            la seule différence entre actuel et potentiel est la base, et elle
            se dit une fois pour les trois. Ses formules, dans ses mots. */}
        <div className="dv-formules">
          <p>Brut = Loyers HC / Prix HAI &nbsp;·&nbsp; Net = (Loyers HC − charges non récupérables) / Prix HAI &nbsp;·&nbsp; Net acte en main = (Loyers HC − charges non récupérables) / (Prix HAI + frais de notaire)</p>
          <p>Le potentiel reprend les mêmes formules, sur les loyers de l&apos;immeuble loué à 100 % et un prix majoré des travaux à prévoir.</p>
        </div>
      </>} />

      {/* --------------------------------------- 7. Conditions de vente */}
      <Page titre="Conditions de la vente" picto={I.ampoule} pied={pied} enfants={<>
        <h2 className="dv-h"><Ic d={I.perso} /> Vendeur</h2>
        <table className="dv-tab cond">
          <tbody>
            <tr><td>Profil du vendeur</td><td className="r">{nc(d.vendeur.profil)}</td></tr>
            <tr><td>Motif de la vente</td><td className="r">{nc(d.vendeur.motif)}</td></tr>
          </tbody>
        </table>

        <h2 className="dv-h"><Ic d={I.coche} /> Conditions acceptées</h2>
        <table className="dv-tab cond">
          <tbody>
            <tr>
              <td>Conditions de financement</td>
              <td className="r">{d.conditions.financement ? d.conditions.financement : "n.c."}</td>
            </tr>
            <tr>
              <td>Conditions de permis de construire</td>
              <td className="r">{d.conditions.permis ? d.conditions.permis : "n.c."}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="dv-h or"><Ic d={I.ampoule} /> Notre avis</h2>
        <div className="dv-avis">
          {d.agent.photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={d.agent.photo} alt="" />
            : <span className="dv-ag-ph vide petite" />}
          <div className="dv-avis-t">
            {d.avis
              ? d.avis.split("\n").filter((p) => p.trim()).map((p, i) => <p key={i}>{p}</p>)
              : <p className="gris">Le descriptif de l&apos;immeuble n&apos;est pas encore rédigé.</p>}
          </div>
        </div>

        <div className="dv-fin-g">
          <Stat picto={I.euro} label="Prix au m²" source="avant travaux"
            valeur={d.prix.m2 > 0 ? group(d.prix.m2) : "n.c."} unite="€/m²" />
          {/* Retour #246 : « t'écris 5 k€ de travaux alors qu'il y a 4,5 k€ ».
              Arrondir au millier faisait mentir le chiffre d'un demi-millier ;
              le dixième dit la vérité sans allonger la ligne. Retour #245 : la
              clé à molette, ici aussi. */}
          <Stat picto={I.molette} label="Travaux" source="à prévoir"
            valeur={fr1(d.prix.travaux / 1000)} unite="k€" />
          <Stat picto={I.fleche} label="Loyers hc" source="potentiels"
            valeur={fr1(d.revenusTot.potentiel / 1000)} unite="k€/an" />
          <Stat picto={I.billet} label="Charges" source="non récupérables"
            valeur={fr1(d.chargesTot.nonRecup / 1000)} unite="k€/an" />
          <Stat picto={I.courbe} label="Rendement" source="brut après travaux"
            valeur={fr1(d.rendement.potentiel.brut)} unite="%" />
        </div>

        <div className="dv-prix-bar">{group(d.prix.hai)} <i>€ HAI</i></div>
        <p className="dv-note">
          *Prix TTC dont {group(d.prix.honos)} € d&apos;honoraires d&apos;agence à la charge de
          l&apos;acheteur soit {fr1(d.prix.taux)} % TTC du prix net vendeur.
        </p>
      </>} />

      {/* -------------------------------------------------------- 8. Dos */}
      <Page nu enfants={
        <div className="dv-dos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dv-dos-logo" src="/logos/fi-creme-bronze-fond-sombre.svg" alt="France Immeuble" />
          <div className="dv-dos-c">
            <span><Ic d={I.mail} />{d.agence.email}</span>
            <span><Ic d={I.tel} />{d.agence.tel}</span>
            <span><Ic d={I.globe} />{d.agence.site}</span>
          </div>
          <div className="dv-dos-m">
            {MENTIONS.map((m, i) => <p key={i}>{m}</p>)}
          </div>
        </div>
      } />
    </div>
  );
}

/** Une case chiffrée de la couverture. */
const Case = ({ label, valeur, unite }: { label: string; valeur: string; unite?: string }) => (
  <div className="dv-case">
    <span className="dv-lab">{label}</span>
    <b>{valeur} {unite && <i>{unite}</i>}</b>
  </div>
);

/** Une statistique avec son picto et sa source. */
const Stat = ({ picto, label, source, valeur, unite }: {
  picto: React.ReactNode; label: string; source: string; valeur: string; unite?: string;
}) => (
  <div className="dv-stat">
    <Ic d={picto} cls="dv-stat-ic" />
    <span className="dv-stat-l">{label}</span>
    <span className="dv-stat-s">{source}</span>
    <b>{valeur} {unite && <i>{unite}</i>}</b>
  </div>
);
