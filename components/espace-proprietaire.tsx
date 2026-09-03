"use client";

/**
 * L'espace vendeur, vu par le propriétaire.
 *
 * Le seul écran du produit qui ne s'adresse pas à un professionnel. Trois
 * conséquences, tenues d'un bout à l'autre :
 *
 * - **Aucun jargon.** Pas de « HAI », pas de « net vendeur » sans sa
 *   traduction, pas de « lot » quand « appartement » suffit. Un vendeur n'a
 *   pas à apprendre notre vocabulaire pour dire son prix.
 * - **Aucune case obligatoire.** Il peut poser son prix et repartir, ou
 *   déposer une pièce sans rien décider. Une page qui exige tout n'obtient rien.
 * - **Une action par bloc.** Le prix, les pièces, l'avancement : trois choses,
 *   trois blocs, et rien à chercher.
 *
 * Le montant est libre — MAV l'a tranché. On lui montre notre estimation juste
 * au-dessus, et l'écart en clair s'il s'en éloigne : informer vaut mieux
 * qu'empêcher, et un prix qu'on refuse de saisir devient un appel téléphonique.
 */

import { useState, useTransition } from "react";
import { deposerPiece, poserPrix, retirerPiece } from "@/lib/bo/espace-actions";
import { JALONS, PIECES_DEMANDEES, type Piece, type Reponse, type VueProprietaire } from "@/lib/bo/espace-modele";

const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const dateFr = (v: string) =>
  new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

/** « 1 250 000 » depuis n'importe quelle frappe : espaces, points, virgules. */
const lireMontant = (s: string) => {
  const n = parseFloat(s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const ecrireMontant = (s: string) => {
  const c = s.replace(/\D/g, "").slice(0, 10);
  return c ? Number(c).toLocaleString("fr-FR") : "";
};

export function EspaceProprietaire({
  jeton, vue, pieces, prixPose, motPose,
}: {
  jeton: string;
  vue: VueProprietaire;
  pieces: Piece[];
  prixPose?: number;
  motPose?: string;
}) {
  return (
    <main className="ep-wrap">
      <header className="ep-hd">
        <span className="ep-marque">FRANCE IMMEUBLE</span>
        <h1>{vue.adresse || "Votre immeuble"}</h1>
        <p className="ep-sous">
          {vue.ville}
          {vue.nbLots > 0 && ` · ${vue.nbLots} lot${vue.nbLots > 1 ? "s" : ""}`}
          {vue.surface ? ` · ${vue.surface.toLocaleString("fr-FR")} m²` : ""}
        </p>
      </header>

      <BlocPrix jeton={jeton} vue={vue} prixPose={prixPose} motPose={motPose} />
      <BlocPieces jeton={jeton} pieces={pieces} />
      <BlocAvancement vue={vue} />

      <footer className="ep-pied">
        <p>
          {vue.agentNom ? <>Votre conseiller : <b>{vue.agentNom}</b>{vue.agentTel ? ` · ${vue.agentTel}` : ""}</> : "France Immeuble · 01.72.87.52.22"}
        </p>
        <p className="ep-fine">
          Cette page vous est personnelle. Ne la transférez qu&apos;aux personnes que vous
          souhaitez associer à la vente.
        </p>
      </footer>
    </main>
  );
}

/* ---------- Le prix ---------- */

function BlocPrix({ jeton, vue, prixPose, motPose }: {
  jeton: string; vue: VueProprietaire; prixPose?: number; motPose?: string;
}) {
  const [pending, start] = useTransition();
  const depart = prixPose ?? vue.estimationNv;
  const [texte, setTexte] = useState(depart ? depart.toLocaleString("fr-FR") : "");
  const [mot, setMot] = useState(motPose ?? "");
  const [avis, setAvis] = useState<Reponse | null>(null);
  const [envoye, setEnvoye] = useState(prixPose !== undefined);

  const nv = lireMontant(texte);
  const hai = nv ? Math.round(nv * (1 + vue.tauxHonos / 100)) : undefined;
  const ref = vue.estimationNv;
  const ecart = nv && ref && ref > 0 ? Math.round(((nv - ref) / ref) * 100) : undefined;

  /* La molette n'est pas une borne : elle sert à approcher vite, la case
     reste libre. Elle couvre 30 % de part et d'autre de notre estimation. */
  const bas = ref ? Math.round(ref * 0.7) : 0;
  const haut = ref ? Math.round(ref * 1.3) : 0;

  const envoyer = () => {
    if (!nv) { setAvis({ ok: false, message: "Indiquez un montant." }); return; }
    start(async () => {
      const r = await poserPrix(jeton, nv, mot);
      setAvis(r);
      if (r.ok) setEnvoye(true);
    });
  };

  return (
    <section className="ep-bloc">
      <h2>Le prix que vous souhaitez</h2>
      {ref !== undefined && (
        <p className="ep-intro">
          Nous avons estimé votre immeuble à <b>{euros(ref)}</b>{" "}pour vous, honoraires
          d&apos;agence en sus{vue.estimationHai ? <> — soit {euros(vue.estimationHai)} affichés à la vente</> : null}.
          À vous de dire le montant que vous voulez percevoir.
        </p>
      )}

      <div className="ep-prix">
        <label className="ep-lab" htmlFor="ep-montant">Ce que vous voulez percevoir</label>
        <div className="ep-saisie">
          <input
            id="ep-montant" inputMode="numeric" value={texte}
            onChange={(e) => { setTexte(ecrireMontant(e.target.value)); setAvis(null); }}
            placeholder="0"
          />
          <span>€</span>
        </div>
        {ref !== undefined && (
          <input
            className="ep-molette" type="range" min={bas} max={haut} step={5000}
            value={Math.min(haut, Math.max(bas, nv ?? ref))}
            onChange={(e) => { setTexte(Number(e.target.value).toLocaleString("fr-FR")); setAvis(null); }}
            aria-label="Faire varier le montant"
          />
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
      <textarea
        id="ep-mot" className="ep-zone" rows={3} value={mot}
        onChange={(e) => setMot(e.target.value)}
        placeholder="Une contrainte de calendrier, un point à discuter…"
      />

      <div className="ep-actions">
        <button className="ep-go" type="button" onClick={envoyer} disabled={pending || !nv}>
          {envoye ? "Mettre à jour mon prix" : "Valider mon prix"}
        </button>
        {avis && <span className={`ep-avis${avis.ok ? " ok" : " ko"}`}>{avis.message}</span>}
      </div>
      {envoye && !avis && (
        <p className="ep-rappel">
          Vous nous avez indiqué {prixPose ? euros(prixPose) : ""}. Vous pouvez le modifier
          tant que le mandat n&apos;est pas signé.
        </p>
      )}
    </section>
  );
}

/* ---------- Les pièces ---------- */

function BlocPieces({ jeton, pieces }: { jeton: string; pieces: Piece[] }) {
  const [pending, start] = useTransition();
  const [avis, setAvis] = useState<Reponse | null>(null);

  const deposer = (categorie: string, file: File) =>
    start(async () => {
      const fd = new FormData();
      fd.set("file", file);
      setAvis(await deposerPiece(jeton, categorie, fd));
    });

  const parCategorie = (cle: string) => pieces.filter((p) => p.categorie === cle);

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
          const dedans = parCategorie(p.cle);
          return (
            <li key={p.cle} className={dedans.length ? "fait" : ""}>
              <div className="ep-pt">
                <b>{p.label}</b>
                <i>{p.aide}</i>
              </div>
              <div className="ep-pf">
                {dedans.map((f) => (
                  <span className="ep-fich" key={f.id}>
                    <a href={`/proprietaire/${jeton}/piece/${f.id}`} target="_blank" rel="noreferrer">{f.nom}</a>
                    <em>{f.taille_ko ? `${Math.round(f.taille_ko)} Ko` : ""}</em>
                    <button type="button" title="Retirer"
                      onClick={() => start(async () => { setAvis(await retirerPiece(jeton, f.id)); })}>✕</button>
                  </span>
                ))}
                <label className="ep-depot">
                  <input type="file" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) deposer(p.cle, f);
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

function BlocAvancement({ vue }: { vue: VueProprietaire }) {
  return (
    <section className="ep-bloc">
      <h2>Où en est la vente</h2>
      <ol className="ep-frise">
        {JALONS.map((j, i) => (
          <li key={j.cle} className={i < vue.jalon ? "passe" : i === vue.jalon ? "ici" : ""}>
            <span className="ep-pt-rond" aria-hidden />
            <b>{j.label}</b>
            <i>{j.detail}</i>
            {j.cle === "mandat" && vue.mandatSigneLe && <em>Signé le {dateFr(vue.mandatSigneLe)}</em>}
          </li>
        ))}
      </ol>

      {(vue.acquereursContactes > 0 || vue.visitesEffectuees > 0 || vue.offreEnCours) && (
        <div className="ep-chiffres">
          {vue.acquereursContactes > 0 && (
            <span><b>{vue.acquereursContactes.toLocaleString("fr-FR")}</b> acquéreurs sollicités</span>
          )}
          {vue.visitesEffectuees > 0 && (
            <span><b>{vue.visitesEffectuees}</b> visite{vue.visitesEffectuees > 1 ? "s" : ""} effectuée{vue.visitesEffectuees > 1 ? "s" : ""}</span>
          )}
          {vue.offreEnCours && <span className="ep-offre">Une offre est en cours d&apos;examen</span>}
        </div>
      )}
      <p className="ep-fine">
        Le détail des candidats et des échanges reste confidentiel jusqu&apos;à ce qu&apos;une
        offre vous soit formellement présentée.
      </p>
    </section>
  );
}
