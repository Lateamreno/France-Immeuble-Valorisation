"use client";

/**
 * L'immeuble du vendeur, vu par lui.
 *
 * Un des deux seuls écrans du produit qui ne s'adressent pas à un
 * professionnel. Trois partis pris, tenus d'un bout à l'autre :
 *
 * - **Aucun jargon.** Pas de « HAI » sans sa traduction, pas de « lot » quand
 *   « appartement » suffirait. Un vendeur n'a pas à apprendre notre
 *   vocabulaire pour dire son prix.
 * - **Aucune case obligatoire.** Il peut poser son prix et repartir, ou
 *   déposer une pièce sans rien décider.
 * - **Une action par bloc.** Le prix, les pièces, l'avancement.
 *
 * Le montant est libre — arbitrage de MAV. On lui montre notre estimation
 * juste au-dessus et l'écart en clair s'il s'en éloigne : informer vaut mieux
 * qu'empêcher, et un prix qu'on refuse de saisir devient un appel téléphonique.
 */

import { useState, useTransition } from "react";
import { deposerPiece } from "@/lib/bo/espace-depot";
import { poserPrix, retirerPiece } from "@/lib/bo/espace-client-actions";
import { JALONS, PIECES_DEMANDEES, type Reponse, type SecteurImmeuble } from "@/lib/bo/espace-modele";
import type { BienVendeur, PieceClient } from "@/lib/bo/espace-anon";
/* Les formules du BO, et elles seules : le propriétaire lit le même loyer au
   m² et le même rendement que l'agent sur son écran Prix. */
import { ecart, rendements, type Colonne } from "@/lib/bo/rendements";

const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const dateFr = (v: string) =>
  new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
const fr1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("fr-FR");
const entier = (x: number) => Math.round(x).toLocaleString("fr-FR");

const lireMontant = (s: string) => {
  const n = parseFloat(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const ecrireMontant = (s: string) => {
  const c = s.replace(/\D/g, "").slice(0, 10);
  return c ? Number(c).toLocaleString("fr-FR") : "";
};

function jalonDuStatut(statut: string): number {
  const n = parseInt(statut, 10);
  if (!Number.isFinite(n)) return 0;
  if (n >= 10) return 5;
  if (n >= 8) return 4;
  if (n === 7) return 3;
  if (n >= 5) return 2;
  if (n >= 4) return 1;
  return 0;
}

export function EspaceProprietaire({ immeubleId, bien, pieces, secteur = null, apercu = false }: {
  immeubleId: string;
  bien: BienVendeur | null;
  pieces: PieceClient[];
  /** MAV, 25/09 : les repères du secteur, le tableau Actuel / Potentiel et
   *  les comparables — ce que rend `ec_secteur_immeuble`, ou l'aperçu du BO.
   *  `null` quand la fonction n'a rien rendu (session sans cet immeuble, ou
   *  fonction pas encore en base) : les blocs le disent, sans casser la page. */
  secteur?: SecteurImmeuble | null;
  /** #382 bis — l'aperçu du BO : même écran, mais rien ne s'écrit. Les gestes
   *  d'écriture (arrêter son prix, déposer ou retirer une pièce) sont remplacés
   *  par leur libellé « (désactivé dans l'aperçu) ». */
  apercu?: boolean;
}) {
  return (
    <main className="ep-wrap">
      <header className="ep-hd">
        <span className="ep-marque">FRANCE IMMEUBLE</span>
        <h1>{bien?.adresse || "Votre immeuble"}</h1>
        <p className="ep-sous">
          {bien?.ville}
          {bien && bien.nbLots > 0 ? ` · ${bien.nbLots} lot${bien.nbLots > 1 ? "s" : ""}` : ""}
          {bien?.surface ? ` · ${Math.round(bien.surface).toLocaleString("fr-FR")} m²` : ""}
        </p>
      </header>

      {/* MAV, 25/09 : « il faut qu'ils aient les données secteur EN PREMIER
          avec les liens pour vérifier », puis le tableau face au secteur, puis
          des biens comparables — avant le prix, pour qu'ils le posent en
          connaissance de cause. */}
      <BlocSecteur secteur={secteur} bien={bien} />
      <BlocFaceAuSecteur secteur={secteur} bien={bien} />
      <BlocComparables secteur={secteur} />

      <BlocPrix immeubleId={immeubleId} bien={bien} apercu={apercu} />
      <BlocPieces immeubleId={immeubleId} pieces={pieces} apercu={apercu} />
      <BlocAvancement bien={bien} />

      <footer className="ep-pied">
        <p>France Immeuble · 01.72.87.52.22</p>
        <p className="ep-fine">
          Les informations de cette page vous sont réservées. Elles ne comportent aucune
          donnée nominative concernant les occupants de l&apos;immeuble.
        </p>
      </footer>
    </main>
  );
}

/* ---------- Le secteur (MAV, 25/09) ---------- */

/**
 * Les trois repères de la commune, leur date de vérification, et les liens
 * publics pour les contrôler soi-même. Rien n'est affiché qui n'ait été
 * confirmé par un agent : le message d'attente le dit en clair.
 */
function BlocSecteur({ secteur, bien }: { secteur: SecteurImmeuble | null; bien: BienVendeur | null }) {
  const s = secteur?.secteur ?? null;
  const ville = s?.ville || bien?.ville || "votre commune";
  return (
    <section className="ep-bloc">
      <h2>Le secteur</h2>
      {s ? (
        <>
          <p className="ep-intro">
            Les repères de {ville}, d&apos;après les ventes enregistrées par les notaires et
            les loyers observés
            {s.verifieLe ? <>, vérifiés par votre conseiller le {dateFr(s.verifieLe)}</> : null}
            {s.annee && !s.verifieLe ? <> ({s.annee})</> : null}.
            Ils servent de point de comparaison, pas de prix : chaque immeuble a le sien.
          </p>
          <div className="ep-sect">
            <div className="ep-sect-c">
              <i>Loyer moyen</i>
              <b>{fr1(s.loyerM2)} €</b>
              <em>par m² et par mois</em>
            </div>
            <div className="ep-sect-c">
              <i>Prix de vente</i>
              <b>{entier(s.prixM2)} €</b>
              <em>par m²</em>
            </div>
            <div className="ep-sect-c">
              <i>Rendement brut</i>
              <b>{s.renta !== null ? `${fr1(s.renta)} %` : "—"}</b>
              <em>loyer annuel rapporté au prix</em>
            </div>
          </div>
          <div className="ep-liens">
            <a href={s.liens.dvf} target="_blank" rel="noreferrer">Vérifier sur DVF ↗</a>
            <a href={s.liens.loyers} target="_blank" rel="noreferrer">Vérifier les loyers ↗</a>
            <a href={s.liens.notaires} target="_blank" rel="noreferrer">Prix des notaires ↗</a>
          </div>
          <p className="ep-fine">
            DVF est la base publique des ventes signées chez les notaires ; la carte des loyers
            est publiée par le ministère du Logement. Sur DVF, cherchez {ville} sur la carte.
          </p>
        </>
      ) : (
        <p className="ep-intro">
          Les repères du secteur seront affichés dès qu&apos;ils auront été vérifiés par
          votre conseiller.
        </p>
      )}
    </section>
  );
}

/**
 * L'immeuble face au secteur : Actuel (les loyers d'aujourd'hui) et Potentiel
 * (tout reloué, travaux faits) — loyer au m², prix au m², rendement brut, et
 * l'écart en % contre le secteur quand il est confirmé. Le calcul est celui
 * de `rendements()`, partagé avec l'écran Prix du BO ; les couleurs disent la
 * même chose qu'au BO : au-dessus du secteur, c'est bon pour un loyer et
 * cher pour un prix.
 */
function BlocFaceAuSecteur({ secteur, bien }: { secteur: SecteurImmeuble | null; bien: BienVendeur | null }) {
  const im = secteur?.immeuble;
  const s = secteur?.secteur ?? null;
  if (!im) return null;
  const hai = im.prixHai ?? bien?.prixAffiche ?? 0;
  const r = rendements(hai, {
    loyers: im.loyersAn, loyersMax: im.loyersMaxAn, charges: im.charges, travaux: im.travaux,
    surface: im.surface, surfaceOccupee: im.surfaceOccupee,
  });
  const refs: RefsFace = s ? { loyerM2: s.loyerM2, prixM2: s.prixM2, brut: s.renta ?? undefined } : null;

  return (
    <section className="ep-bloc">
      <h2>Votre immeuble face au secteur</h2>
      <p className="ep-intro">
        <b>Actuel</b>, c&apos;est votre immeuble tel qu&apos;il est loué aujourd&apos;hui.{" "}
        <b>Potentiel</b>, c&apos;est une fois tout reloué au loyer de marché
        {im.travaux > 0 ? <> et les travaux faits ({euros(im.travaux)} ajoutés au prix)</> : null}.
        {refs ? " Le pourcentage dit l'écart avec le secteur." : ""}
      </p>
      <div className="ep-tab-wrap">
        <table className="ep-tab">
          <thead><tr><th /><th>Actuel</th><th>Potentiel</th></tr></thead>
          <tbody>
            <LigneFace label="Loyer au m²" cle="loyerM2" unite="€/m²/mois" sens={1} dec={1} r={r} refs={refs} />
            <LigneFace label="Prix au m²" cle="prixM2" unite="€/m²" sens={-1} dec={0} r={r} refs={refs} />
            <LigneFace label="Rendement brut" cle="brut" unite="%" sens={1} dec={1} r={r} refs={refs} />
          </tbody>
        </table>
      </div>
      {hai <= 0 && (
        <p className="ep-fine">Le prix au m² et le rendement apparaîtront dès qu&apos;un prix de vente sera posé.</p>
      )}
      {!refs && (
        <p className="ep-fine">L&apos;écart avec le secteur s&apos;affichera une fois les repères vérifiés.</p>
      )}
    </section>
  );
}

/** Les repères du secteur, rangés sous les clés de la colonne qu'ils jugent. */
type ColFace = Pick<Colonne, "loyerM2" | "prixM2" | "brut">;
type RefsFace = ColFace | null;

/** Une case du tableau : la valeur, et l'écart au secteur quand il existe. */
function CelluleFace({ v, unite, reference, sens, dec }: {
  v?: number; unite: string; reference?: number;
  /** 1 : plus haut vaut mieux. −1 : plus haut est plus cher. */
  sens: 1 | -1; dec: 0 | 1;
}) {
  if (v === undefined) return <td><span className="ep-nc">n.c.</span></td>;
  const pct = ecart(v, reference);
  const ton = pct === undefined ? "" : pct * sens >= 0 ? " ok" : " ko";
  return (
    <td>
      <b>{dec ? fr1(v) : entier(v)} {unite}</b>
      {pct !== undefined && <em className={`ep-pct${ton}`}>{pct > 0 ? "+" : ""}{pct} %</em>}
    </td>
  );
}

function LigneFace({ label, cle, unite, sens, dec, r, refs }: {
  label: string; cle: keyof ColFace; unite: string; sens: 1 | -1; dec: 0 | 1;
  r: ReturnType<typeof rendements>; refs: RefsFace;
}) {
  const reference = refs?.[cle];
  return (
    <tr>
      <th>{label}</th>
      <CelluleFace v={r.actuel[cle]} unite={unite} reference={reference} sens={sens} dec={dec} />
      <CelluleFace v={r.potentiel[cle]} unite={unite} reference={reference} sens={sens} dec={dec} />
    </tr>
  );
}

/**
 * Des immeubles comparables — vendus par France Immeuble cette année ou l'an
 * dernier, ou à vendre — dans le même département et de même nature. Sans
 * adresse : la ville, la taille, le prix au m² et le rendement suffisent à se
 * situer, et un immeuble à vendre a un propriétaire qui n'a pas à être
 * reconnu (§8.3).
 */
function BlocComparables({ secteur }: { secteur: SecteurImmeuble | null }) {
  const liste = secteur?.comparables ?? [];
  if (liste.length === 0) return null;
  return (
    <section className="ep-bloc">
      <h2>Des biens comparables</h2>
      <p className="ep-intro">
        Des immeubles de même nature, dans votre département, que nous avons vendus ou que
        nous vendons en ce moment. Les adresses ne sont pas indiquées.
      </p>
      <ul className="ep-comp">
        {liste.map((c, i) => (
          <li key={i} className={c.statut}>
            <span className={`ep-comp-tag ${c.statut}`}>
              {c.statut === "vendu"
                ? `Vendu par France Immeuble${c.annee ? ` en ${c.annee}` : ""}`
                : "À vendre"}
            </span>
            <b>{c.ville || "Commune non précisée"}</b>
            <i>
              {c.nbLots ? `${c.nbLots} lot${c.nbLots > 1 ? "s" : ""} · ` : ""}
              {entier(c.surface)} m²
            </i>
            <span className="ep-comp-ch">
              <span><b>{entier(c.prixM2)} €</b><em>par m²</em></span>
              {c.renta !== null && <span><b>{fr1(c.renta)} %</b><em>rendement brut</em></span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Le prix ---------- */

function BlocPrix({ immeubleId, bien, apercu }: {
  immeubleId: string; bien: BienVendeur | null; apercu: boolean;
}) {
  const [pending, start] = useTransition();
  const ref = bien?.prixNv ?? undefined;
  const taux = bien?.prixNv && bien?.honos && bien.prixNv > 0
    ? Math.round((bien.honos / bien.prixNv) * 1000) / 10 : 5;

  const depart = bien?.prixDemande ?? ref;
  const [texte, setTexte] = useState(depart != null ? depart.toLocaleString("fr-FR") : "");
  const [mot, setMot] = useState(bien?.motDemande ?? "");
  const [avis, setAvis] = useState<Reponse | null>(null);
  const [envoye, setEnvoye] = useState(bien?.prixDemande != null);

  const nv = lireMontant(texte);
  const hai = nv ? Math.round(nv * (1 + taux / 100)) : undefined;
  const ecart = nv && ref && ref > 0 ? Math.round(((nv - ref) / ref) * 100) : undefined;

  /* La molette n'est pas une borne : elle sert à approcher vite, la case
     reste libre. Elle couvre 30 % de part et d'autre de notre estimation. */
  const bas = ref ? Math.round(ref * 0.7) : 0;
  const haut = ref ? Math.round(ref * 1.3) : 0;

  return (
    <section className="ep-bloc">
      <h2>Le prix que vous souhaitez</h2>
      {ref !== undefined && (
        <p className="ep-intro">
          Nous avons estimé votre immeuble à <b>{euros(ref)}</b>{" "}pour vous, honoraires
          d&apos;agence en sus
          {bien?.prixAffiche ? <> — soit {euros(bien.prixAffiche)} affichés à la vente</> : null}.
          À vous de dire le montant que vous voulez percevoir.
        </p>
      )}

      <div className="ep-prix">
        <label className="ep-lab" htmlFor="ep-montant">Ce que vous voulez percevoir</label>
        <div className="ep-saisie">
          <input id="ep-montant" inputMode="numeric" value={texte}
            onChange={(e) => { setTexte(ecrireMontant(e.target.value)); setAvis(null); }}
            placeholder="0" />
          <span>€</span>
        </div>
        {ref !== undefined && (
          <input className="ep-molette" type="range" min={bas} max={haut} step={5000}
            value={Math.min(haut, Math.max(bas, nv ?? ref))}
            onChange={(e) => { setTexte(Number(e.target.value).toLocaleString("fr-FR")); setAvis(null); }}
            aria-label="Faire varier le montant" />
        )}
        {hai !== undefined && (
          <p className="ep-hai">
            Prix affiché à la vente : <b>{euros(hai)}</b>, honoraires d&apos;agence compris.
          </p>
        )}
        {ecart !== undefined && Math.abs(ecart) >= 5 && (
          <p className={`ep-ecart${ecart > 0 ? " haut" : " bas"}`}>
            {ecart > 0
              ? `Soit ${ecart} % au-dessus de notre estimation. C'est votre droit — nous en parlerons ensemble, en gardant en tête qu'un prix trop haut allonge le délai de vente.`
              : `Soit ${Math.abs(ecart)} % en dessous de notre estimation. Vous pouvez sans doute viser plus haut : parlons-en avant de vous engager.`}
          </p>
        )}
      </div>

      <label className="ep-lab" htmlFor="ep-mot">Un mot à votre conseiller (facultatif)</label>
      <textarea id="ep-mot" className="ep-zone" rows={3} value={mot}
        onChange={(e) => setMot(e.target.value)}
        placeholder="Une contrainte de calendrier, un point à discuter…" />

      <div className="ep-actions">
        {/* #382 bis — dans l'aperçu, la case et la molette restent vivantes
            (l'agent voit ce que fait l'écran), seul l'envoi est coupé. */}
        <button className="ep-go" type="button" disabled={apercu || pending || !nv}
          onClick={() => start(async () => {
            if (apercu) return;
            const r = await poserPrix(immeubleId, nv!, mot);
            setAvis(r);
            if (r.ok) setEnvoye(true);
          })}>
          {envoye ? "Mettre à jour mon prix" : "Valider mon prix"}
          {apercu ? " (désactivé dans l'aperçu)" : ""}
        </button>
        {avis && <span className={`ep-avis${avis.ok ? " ok" : " ko"}`}>{avis.message}</span>}
      </div>
      {envoye && !avis && bien?.prixDemande != null && (
        <p className="ep-rappel">
          Vous nous avez indiqué {euros(bien.prixDemande)}. Vous pouvez le modifier tant
          que le mandat n&apos;est pas signé.
        </p>
      )}
    </section>
  );
}

/* ---------- Les pièces ---------- */

function BlocPieces({ immeubleId, pieces, apercu }: {
  immeubleId: string; pieces: PieceClient[]; apercu: boolean;
}) {
  const [pending, start] = useTransition();
  const [avis, setAvis] = useState<Reponse | null>(null);

  return (
    <section className="ep-bloc">
      <h2>Vos documents</h2>
      <p className="ep-intro">
        Plus nous avons de pièces tôt, plus la vente va vite : un acquéreur qui attend
        un diagnostic est un acquéreur qui réfléchit. Déposez ce que vous avez, même
        incomplet — nous vous dirons ce qui manque.
      </p>

      <ul className="ep-pieces">
        {PIECES_DEMANDEES.map((p) => {
          const dedans = pieces.filter((f) => f.categorie === p.cle);
          return (
            <li key={p.cle} className={dedans.length ? "fait" : ""}>
              <div className="ep-pt"><b>{p.label}</b><i>{p.aide}</i></div>
              <div className="ep-pf">
                {dedans.map((f) => (
                  <span className="ep-fich" key={f.id}>
                    {/* #382 bis — le fichier se sert par la session du client ;
                        dans l'aperçu il n'y en a pas, le nom reste un nom. */}
                    {apercu
                      ? <a aria-disabled="true" title="Lecture désactivée dans l'aperçu">{f.nom}</a>
                      : <a href={`/espace/piece/${f.id}`} target="_blank" rel="noreferrer">{f.nom}</a>}
                    <em>{f.taille_ko ? `${Math.round(f.taille_ko)} Ko` : ""}</em>
                    {!apercu && (
                      <button type="button" title="Retirer"
                        onClick={() => start(async () => { setAvis(await retirerPiece(f.id, immeubleId)); })}>✕</button>
                    )}
                  </span>
                ))}
                {apercu ? (
                  <span className="ep-depot apercu">
                    {dedans.length ? "Ajouter un autre fichier" : "Déposer un fichier"} (désactivé dans l&apos;aperçu)
                  </span>
                ) : (
                  <label className="ep-depot">
                    <input type="file" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) start(async () => {
                        const fd = new FormData();
                        fd.set("file", f);
                        setAvis(await deposerPiece(immeubleId, p.cle, fd));
                      });
                      e.target.value = "";
                    }} />
                    {dedans.length ? "Ajouter un autre fichier" : "Déposer un fichier"}
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {pending && <p className="ep-rappel">Dépôt en cours…</p>}
      {avis && <p className={`ep-avis${avis.ok ? " ok" : " ko"}`}>{avis.message}</p>}
      <p className="ep-fine">
        Vos documents ne sont visibles que de vous et de votre conseiller. Ils ne sont
        jamais publiés, et les baux sont anonymisés avant toute présentation à un acquéreur.
      </p>
    </section>
  );
}

/* ---------- L'avancement ---------- */

function BlocAvancement({ bien }: { bien: BienVendeur | null }) {
  const jalon = jalonDuStatut(bien?.statut ?? "");
  return (
    <section className="ep-bloc">
      <h2>Où en est la vente</h2>
      <ol className="ep-frise">
        {JALONS.map((j, i) => (
          <li key={j.cle} className={i < jalon ? "passe" : i === jalon ? "ici" : ""}>
            <span className="ep-pt-rond" aria-hidden />
            <b>{j.label}</b>
            <i>{j.detail}</i>
            {j.cle === "mandat" && bien?.mandatSigneLe && <em>Signé le {dateFr(bien.mandatSigneLe)}</em>}
          </li>
        ))}
      </ol>

      {bien && (bien.acquereurs > 0 || bien.visites > 0 || bien.offreEnCours) && (
        <div className="ep-chiffres">
          {bien.acquereurs > 0 && (
            <span><b>{bien.acquereurs.toLocaleString("fr-FR")}</b> acquéreurs sollicités</span>
          )}
          {bien.visites > 0 && (
            <span><b>{bien.visites}</b> visite{bien.visites > 1 ? "s" : ""} effectuée{bien.visites > 1 ? "s" : ""}</span>
          )}
          {bien.offreEnCours && <span className="ep-offre">Une offre est en cours d&apos;examen</span>}
        </div>
      )}
      <p className="ep-fine">
        Le détail des candidats et des échanges reste confidentiel jusqu&apos;à ce qu&apos;une
        offre vous soit formellement présentée.
      </p>
    </section>
  );
}
