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
import { JALONS, PIECES_DEMANDEES, type Reponse } from "@/lib/bo/espace-modele";
import type { BienVendeur, PieceClient } from "@/lib/bo/espace-anon";

const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const dateFr = (v: string) =>
  new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

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

export function EspaceProprietaire({ immeubleId, bien, pieces }: {
  immeubleId: string;
  bien: BienVendeur | null;
  pieces: PieceClient[];
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

      <BlocPrix immeubleId={immeubleId} bien={bien} />
      <BlocPieces immeubleId={immeubleId} pieces={pieces} />
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

/* ---------- Le prix ---------- */

function BlocPrix({ immeubleId, bien }: { immeubleId: string; bien: BienVendeur | null }) {
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
        <button className="ep-go" type="button" disabled={pending || !nv}
          onClick={() => start(async () => {
            const r = await poserPrix(immeubleId, nv!, mot);
            setAvis(r);
            if (r.ok) setEnvoye(true);
          })}>
          {envoye ? "Mettre à jour mon prix" : "Valider mon prix"}
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

function BlocPieces({ immeubleId, pieces }: { immeubleId: string; pieces: PieceClient[] }) {
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
                    <a href={`/espace/piece/${f.id}`} target="_blank" rel="noreferrer">{f.nom}</a>
                    <em>{f.taille_ko ? `${Math.round(f.taille_ko)} Ko` : ""}</em>
                    <button type="button" title="Retirer"
                      onClick={() => start(async () => { setAvis(await retirerPiece(f.id, immeubleId)); })}>✕</button>
                  </span>
                ))}
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
