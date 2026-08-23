"use client";

// Diffusion Plein Bail — l'écran.
//
// Deux vues, un seul vocabulaire : la section de la fiche montre l'état d'UNE
// annonce et permet d'agir dessus ; le module de la barre latérale montre le
// parc entier et ce qu'il rapporte.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { dmy, euros } from "@/lib/format";
import { LIBELLE_STATUT, type Blocage, type ChargeUtile } from "@/lib/diffusion";
import {
  apercuAnnonce, audienceAnnonce, deposerBrouillon, publierAnnonce, retirerAnnonce,
  type Apercu, type Audience,
} from "@/lib/bo/diffusion";

/* ------------------------------------------------ Section de la fiche bien */

export function SectionDiffusion({
  immeubleId, etat,
}: {
  immeubleId: string;
  etat: {
    publiee: boolean; url?: string; statutEnLigne?: string; publieLe?: string;
    aResynchroniser: boolean; derniereSynchro?: string; derniereErreur?: string;
  };
}) {
  const [a, setA] = useState<Apercu | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [avis, setAvis] = useState<string[]>([]);
  const [aud, setAud] = useState<Audience | null>(null);
  const [detail, setDetail] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    apercuAnnonce(immeubleId).then(setA).catch(() => setA(null));
  }, [immeubleId]);

  const publier = () =>
    start(async () => {
      setMsg(null);
      setAvis([]);
      const r = await publierAnnonce(immeubleId);
      if (r.ok) {
        const p = r.photos;
        setMsg(
          `Annonce publiée — ${r.lots ?? 0} lots` +
            (p ? `, ${p.copiees} photo${p.copiees > 1 ? "s" : ""} copiée${p.copiees > 1 ? "s" : ""}` : "") +
            (p && p.ignorees ? `, ${p.ignorees} ignorée${p.ignorees > 1 ? "s" : ""}` : "") +
            ".",
        );
        /* Ce que Plein Bail n'a pas compris. Il ne devine jamais : il laisse
           le champ vide et le dit ici. Ne pas l'afficher, c'est publier une
           annonce amputée sans le savoir. */
        setAvis(r.avertissements ?? []);
      } else {
        setMsg(r.message);
      }
      setA(await apercuAnnonce(immeubleId));
    });

  /* Sonder l'audience suppose une annonce déposée chez eux. Quand il n'y en a
     pas, on propose de déposer un BROUILLON : invisible de tous, y compris des
     autres agences. C'est ce qui permet de mesurer avant d'avoir un mandat
     signé, donc avant d'avoir le droit de publier — la distinction n'est pas
     cosmétique, et la confirmation le dit en toutes lettres. */
  const sonder = () =>
    start(async () => {
      setMsg(null);
      let r = await audienceAnnonce(immeubleId);
      if (!r.ok && r.sansAnnonce) {
        const ok = confirm(
          "Aucune annonce n'est déposée chez Plein Bail.\n\n" +
            "Déposer un BROUILLON pour mesurer l'audience ? Un brouillon n'est visible de " +
            "personne — ni du public, ni des autres agences. Rien n'est publié.",
        );
        if (!ok) return;
        const d = await deposerBrouillon(immeubleId);
        if (!d.ok) {
          setMsg(d.message);
          return;
        }
        r = await audienceAnnonce(immeubleId);
        setA(await apercuAnnonce(immeubleId));
      }
      if (r.ok) setAud(r.a);
      else setMsg(r.message);
    });

  const retirer = () =>
    start(async () => {
      if (!confirm("Retirer l'annonce de Plein Bail ?")) return;
      const r = await retirerAnnonce(immeubleId, "Retrait manuel depuis le BO");
      setMsg(r.ok ? "Annonce retirée." : r.message);
      setA(await apercuAnnonce(immeubleId));
    });

  if (!a) return <div className="fempty">Lecture de l&apos;état de diffusion…</div>;

  const pret = a.blocages.length === 0 && !!a.statut;

  return (
    <div className="dif">
      <div className="dif-tete">
        <div className="t">
          <b>Plein Bail</b>
          <span>La marketplace des immeubles de rapport</span>
        </div>
        <span className={`dif-pastille ${etat.publiee ? (etat.statutEnLigne ?? "online") : "hors"}`}>
          {etat.publiee
            ? LIBELLE_STATUT[(etat.statutEnLigne ?? "online") as keyof typeof LIBELLE_STATUT] ?? etat.statutEnLigne
            : "Non publiée"}
        </span>
        {etat.url && (
          <a className="dif-lien" href={etat.url} target="_blank" rel="noreferrer">Voir l&apos;annonce ↗</a>
        )}
      </div>

      {!a.configuree && (
        <div className="dif-simu">
          <b>Mode simulation</b>
          Le pont vers Plein Bail n&apos;est pas encore branché. Tout est calculé et vérifiable ici,
          rien n&apos;est envoyé. Il manque l&apos;adresse de la fonction et le jeton d&apos;agence.
        </div>
      )}

      {/* --- Ce qui empêche, ou ce qui est prêt --- */}
      {a.blocages.length > 0 ? (
        <div className="dif-bloc ko">
          <b>{a.blocages.length} condition{a.blocages.length > 1 ? "s" : ""} non remplie{a.blocages.length > 1 ? "s" : ""}</b>
          <ul>
            {a.blocages.map((x: Blocage) => (
              <li key={x.cle}>{x.label}{x.ou ? <i> — {x.ou}</i> : null}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="dif-bloc ok">
          <b>Prêt à publier</b>
          {a.motif}
        </div>
      )}

      {/* --- L'écart en attente --- */}
      {etat.publiee && a.ecart && (
        <div className="dif-bloc att">
          <b>La fiche a changé depuis la dernière publication</b>
          L&apos;annonce en ligne ne reflète plus l&apos;état actuel du bien. Elle se remettra à jour
          toute seule, ou tout de suite si vous republiez.
        </div>
      )}
      {etat.derniereErreur && (
        <div className="dif-bloc ko"><b>Dernière tentative en échec</b>{etat.derniereErreur}</div>
      )}

      {/* --- Ce qui n'empêche pas, mais mérite un regard --- */}
      {a.alertes.length > 0 && (
        <div className="dif-bloc att">
          <b>À vérifier avant de publier</b>
          <ul>
            {a.alertes.map((x) => (
              <li key={x.cle}>{x.texte}</li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Ce qui part --- */}
      {a.charge && (
        <>
          <div className="dif-resume">
            <Cellule k="Titre" v={String(a.charge.bien.titre ?? "—")} large />
            <Cellule k="Prix affiché" v={euros(a.charge.prix.prix_eur) ?? "—"} />
            <Cellule k="Honoraires" v={a.charge.prix.honoraires_charge === "vendeur" ? "Charge vendeur" : "Charge acquéreur"} />
            <Cellule k="Mandat" v={a.charge.prix.mandat_numero ? `n° ${a.charge.prix.mandat_numero}` : "—"} />
            <Cellule k="Lots" v={String(a.charge.lots.length)} />
            <Cellule k="Photos" v={String(a.charge.photos.length)} />
            <Cellule
              k="Documents"
              v={String(a.charge.documents?.length ?? 0)}
              d={a.charge.documentsRetenus?.length ? `${a.charge.documentsRetenus.length} gardés au BO` : undefined}
            />
            <Cellule k="Adresse publiée" v="Ville et quartier" d="L'adresse exacte n'est jamais publique" />
            <Cellule
              k="Contact"
              v={String(a.charge.contact.nom ?? "—")}
              d={String(a.charge.contact.email ?? "")}
              large
            />
          </div>

          {/* L'annonce telle qu'elle s'affichera : c'est la seule vérification
              qui vaille avant de publier. Un tableau de champs ne montre pas
              qu'une photo est de travers ou qu'un descriptif tombe mal. */}
          <ApercuAnnonce charge={a.charge} />

          {/* Un document qu'on ne publie pas sans dire pourquoi passe pour un
              oubli. Le coffre du BO n'a qu'un libellé libre : on ne transmet
              que ce qu'on reconnaît sans ambiguïté, et jamais une pièce
              nominative — rien ici ne caviarde un PDF. */}
          {a.charge.documentsRetenus?.length ? (
            <details className="dif-docs">
              <summary>
                {a.charge.documentsRetenus.length} document
                {a.charge.documentsRetenus.length > 1 ? "s" : ""} du coffre ne part
                {a.charge.documentsRetenus.length > 1 ? "ent" : ""} pas
              </summary>
              <ul>
                {a.charge.documentsRetenus.map((d, i) => (
                  <li key={i}>
                    <b>{d.nom}</b> — {d.motif}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <button type="button" className="dif-plus" onClick={() => setDetail((v) => !v)}>
            {detail ? "Masquer" : "Voir"} les données brutes envoyées
          </button>
          {detail && (
            <pre className="dif-json">{JSON.stringify(a.charge, null, 2)}</pre>
          )}
        </>
      )}

      <div className="dif-actions">
        <button className="dif-go" type="button" disabled={!pret || pending} onClick={publier}>
          <span className="ch">›</span>{" "}
          {pending ? "Envoi…" : etat.publiee ? "Republier maintenant" : "Publier sur Plein Bail"}
        </button>
        {etat.publiee && (
          <button className="dif-x" type="button" disabled={pending} onClick={retirer}>
            Retirer l&apos;annonce
          </button>
        )}
        <button className="dif-x" type="button" disabled={pending || !a.configuree} onClick={sonder}>
          Sonder l&apos;audience
        </button>
        <span style={{ flex: 1 }} />
        {etat.derniereSynchro && (
          <span className="dif-note">Dernière synchronisation {dmy(etat.derniereSynchro)}</span>
        )}
      </div>

      {/* L'audience : combien d'acquéreurs inscrits reçoivent ce bien à ce
          prix. C'est le chiffre qui change un rendez-vous de mandat — et il
          vient du moteur qui fera partir les alertes, donc ce qu'on montre au
          vendeur est ce qui se passera. */}
      {aud && (
        <div className="dif-aud">
          {aud.acheteurs === null ? (
            <b>{aud.plancher ?? "Moins de 5 acquéreurs"}</b>
          ) : (
            <b>
              {aud.acheteurs} acquéreur{aud.acheteurs > 1 ? "s" : ""} inscrit
              {aud.acheteurs > 1 ? "s" : ""} correspondent à ce bien
            </b>
          )}
          <span>
            {aud.alertes !== null && aud.alertes > 0
              ? `Dont ${aud.alertes} avec une alerte active : ils le recevront par mail dès la mise en ligne. `
              : ""}
            {aud.prix ? `Mesuré au prix de ${euros(aud.prix)}. ` : ""}
            Changez le prix, republiez, resondez : vous avez la courbe.
          </span>
        </div>
      )}
      {msg && <div className="dif-msg">{msg}</div>}
      {avis.length > 0 && (
        <div className="dif-avis">
          <b>Plein Bail n&apos;a pas reconnu {avis.length === 1 ? "une valeur" : `${avis.length} valeurs`}</b>
          <ul>
            {avis.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          <span>
            Le champ concerné reste vide plutôt que d&apos;afficher une information fausse. L&apos;annonce
            est en ligne : corrigez la fiche puis republiez.
          </span>
        </div>
      )}

      <div className="dif-pied">
        Aucun nom de locataire n&apos;est transmis : seule la nature du preneur part, physique ou morale.
        L&apos;annonce se retire d&apos;elle-même à la fin du mandat, et se met à jour dès que l&apos;état
        locatif, les photos, les travaux, les charges ou le prix changent.
      </div>
    </div>
  );
}

/* ------------------------------------------------ L'annonce, telle qu'elle sera

   Une maquette, pas un iframe : l'annonce n'existe pas encore côté Plein Bail
   au moment où l'on veut la relire. On rejoue donc la même mise en page à
   partir de la charge utile — même hiérarchie, mêmes chiffres, mêmes calculs
   dérivés. Ce qu'on vérifie ici, c'est ce qu'un acquéreur verra. */

const CLASSES_DPE = ["A", "B", "C", "D", "E", "F", "G"];

function ApercuAnnonce({ charge }: { charge: ChargeUtile }) {
  const [ouvert, setOuvert] = useState(true);
  const [photo, setPhoto] = useState(0);

  const prix = Number(charge.prix.prix_eur) || 0;
  /* La surface totale ne s'envoie plus : Plein Bail la recalcule depuis les
     lots. On applique donc la même règle qu'eux, pour montrer le chiffre qui
     sera réellement affiché — et non celui que le BO croit juste. */
  const surface = charge.lots.reduce((s, l) => s + (l.surface_carrez ?? l.surface_m2 ?? 0), 0);
  /* Deux rendements, et ils ne disent pas la même chose.

     L'ACTUEL, sur les loyers en place : c'est ce qu'un acquéreur encaisse
     dès demain. Sur un immeuble à moitié vide, ou sous loi de 48, il est
     bas — et c'est justement l'intérêt du dossier.

     Le POTENTIEL, sur les loyers de marché de tous les lots, rapporté au
     prix TRAVAUX COMPRIS : c'est la promesse. C'est la formule que MAV
     écrit lui-même dans ses descriptifs, et sans elle l'annonce d'un
     immeuble à repositionner n'a aucun sens. */
  const loyerAn = charge.lots.reduce((s, l) => s + (l.loyer_mensuel_hc ?? 0), 0) * 12;
  const loyerPotentielAn =
    charge.lots.reduce((s, l) => s + (l.loyer_marche_estime ?? l.loyer_mensuel_hc ?? 0), 0) * 12;
  const travaux = Number(charge.travaux.travaux_estimation_eur) || 0;
  const rendement = prix > 0 && loyerAn > 0 ? (loyerAn / prix) * 100 : undefined;
  const rendementPotentiel =
    prix > 0 && loyerPotentielAn > 0 ? (loyerPotentielAn / (prix + travaux)) * 100 : undefined;
  /* On ne montre le potentiel que s'il apporte quelque chose : sur un
     immeuble déjà au prix du marché, deux chiffres identiques ne font que
     du bruit. */
  const potentielUtile =
    rendementPotentiel !== undefined && rendement !== undefined
      ? rendementPotentiel - rendement > 0.2
      : rendementPotentiel !== undefined;
  const prixM2 = prix > 0 && surface > 0 ? prix / surface : undefined;
  const loues = charge.lots.filter((l) => l.statut === "occupe").length;

  // Plein Bail déduit l'amplitude DPE des lots : on montre la même chose.
  const dpes = charge.lots.map((l) => l.dpe_lot).filter((d): d is string => !!d && CLASSES_DPE.includes(d));
  const rang = (d: string) => CLASSES_DPE.indexOf(d);
  const dpeMin = dpes.length ? dpes.reduce((a, b) => (rang(b) < rang(a) ? b : a)) : undefined;
  const dpeMax = dpes.length ? dpes.reduce((a, b) => (rang(b) > rang(a) ? b : a)) : undefined;

  const tfTotal = euros(charge.charges.taxe_fonciere_eur) ?? "—";
  const recup = euros(charge.charges.taxe_fonciere_recuperable_eur);
  const tfRecup = recup ? `dont ${recup} récupérables` : undefined;

  /* L'adresse exacte n'est JAMAIS publique : elle est transmise à Plein Bail
     pour la géolocalisation, mais l'annonce n'affiche que la ville et le
     quartier. Règle posée par MAV le 21/08, sans exception. */
  const adresse = `${charge.bien.ville} (${String(charge.bien.code_postal ?? "").slice(0, 2)})`;

  /* Attention : `charge.bien.description` est typé `unknown`. Un
     `unknown && <div/>` produit une expression `unknown`, que React refuse
     comme enfant. D'où la conversion en texte AVANT le JSX. */
  const description = charge.bien.description ? String(charge.bien.description) : "";
  const titre = String(charge.bien.titre ?? "");

  return (
    <div className="anp-wrap">
      <button type="button" className="anp-bascule" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}>
        {ouvert ? "▾" : "▸"} Aperçu de l&apos;annonce telle qu&apos;elle s&apos;affichera
      </button>

      {ouvert && (
        <div className="anp">
          <div className="anp-marque">
            <b>plein bail</b>
            <span>Aperçu — l&apos;annonce n&apos;est pas encore en ligne</span>
          </div>

          {/* Galerie */}
          <div className="anp-gal">
            {charge.photos.length > 0 ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="grande" src={charge.photos[photo]?.url} alt="" />
                {charge.photos.length > 1 && (
                  <div className="vign">
                    {charge.photos.slice(0, 8).map((p, i) => (
                      <button
                        key={p.empreinte} type="button"
                        className={i === photo ? "on" : undefined}
                        onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="" />
                      </button>
                    ))}
                    {charge.photos.length > 8 && <span className="reste">+{charge.photos.length - 8}</span>}
                  </div>
                )}
              </>
            ) : (
              <div className="vide">Aucune photo — l&apos;annonce partirait sans visuel</div>
            )}
          </div>

          <div className="anp-corps">
            <div className="anp-tete">
              <h3>{titre}</h3>
              <div className="anp-adr">{adresse}</div>
              <div className="anp-prix">
                <b>{euros(prix) ?? "—"}</b>
                <span>
                  {charge.prix.honoraires_charge === "vendeur"
                    ? "honoraires charge vendeur"
                    : "honoraires charge acquéreur inclus"}
                  {prixM2 ? ` · ${Math.round(prixM2).toLocaleString("fr-FR")} €/m²` : ""}
                </span>
              </div>
            </div>

            {/* Les chiffres que regarde un investisseur, dans son ordre à lui. */}
            <div className="anp-kpi">
              <Kpi
                k="Rendement actuel"
                v={rendement ? `${rendement.toFixed(2).replace(".", ",")} %` : "—"}
                d="sur les loyers en place"
                fort
              />
              {potentielUtile && (
                <Kpi
                  k="Rendement potentiel"
                  v={rendementPotentiel ? `${rendementPotentiel.toFixed(2).replace(".", ",")} %` : "—"}
                  d={travaux > 0 ? "tout reloué, travaux compris" : "tout reloué"}
                  fort
                />
              )}
              <Kpi
                k="Loyers annuels HC"
                v={euros(loyerAn) ?? "—"}
                d={potentielUtile ? `${euros(loyerPotentielAn) ?? "—"} en potentiel` : undefined}
              />
              <Kpi k="Surface" v={surface ? `${Math.round(surface)} m²` : "—"} />
              <Kpi k="Lots" v={`${charge.lots.length}`} d={`${loues} loué${loues > 1 ? "s" : ""}`} />
              <Kpi k="Taxe foncière" v={tfTotal} d={tfRecup} />
              <Kpi
                k="DPE"
                v={dpeMin && dpeMax ? (dpeMin === dpeMax ? dpeMin : `${dpeMin} à ${dpeMax}`) : "—"}
                d={dpes.length ? `${dpes.length} lot${dpes.length > 1 ? "s" : ""} renseigné${dpes.length > 1 ? "s" : ""}` : "non renseigné"}
              />
            </div>

            {description !== "" && (
              <div className="anp-desc">
                <h4>Descriptif</h4>
                <p>{description}</p>
              </div>
            )}

            {/* L'état locatif lot par lot : ce qu'aucun flux annonceur ne montre. */}
            {charge.lots.length > 0 && (
              <div className="anp-lots">
                <h4>État locatif détaillé</h4>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Lot</th><th>Étage</th><th>Surface</th><th>Situation</th>
                        <th>Bail</th><th className="n">Loyer HC</th><th>DPE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {charge.lots.map((l, i) => (
                        <tr key={i}>
                          <td>{l.designation}</td>
                          <td>{l.etage ?? "—"}</td>
                          <td>{l.surface_carrez ?? l.surface_m2 ? `${Math.round(l.surface_carrez ?? l.surface_m2 ?? 0)} m²` : "—"}</td>
                          <td>
                            <span className={`anp-st ${l.statut}`}>{l.statut === "occupe" ? "Loué" : "Libre"}</span>
                            {l.locataire_nature && <i> · {l.locataire_nature === "personne_morale" ? "personne morale" : "particulier"}</i>}
                          </td>
                          <td>{l.type_bail ?? "—"}</td>
                          <td className="n">{l.loyer_mensuel_hc ? `${Math.round(l.loyer_mensuel_hc).toLocaleString("fr-FR")} €` : "—"}</td>
                          <td>{l.dpe_lot ? <span className={`anp-dpe d${l.dpe_lot}`}>{l.dpe_lot}</span> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="anp-rgpd">
                  Aucun nom de locataire n&apos;apparaît : seule la nature du preneur est publiée.
                </div>
              </div>
            )}

            {Array.isArray(charge.travaux.detail) && (charge.travaux.detail as { description: string; montant?: number; urgence?: string }[]).length > 0 && (
              <div className="anp-tvx">
                <h4>Travaux à prévoir · {euros(charge.travaux.travaux_estimation_eur) ?? "—"}</h4>
                <ul>
                  {(charge.travaux.detail as { description: string; montant?: number; urgence?: string }[]).map((t, i) => (
                    <li key={i}>
                      {t.description}
                      {t.montant ? <b> {Math.round(t.montant).toLocaleString("fr-FR")} €</b> : null}
                      {t.urgence ? <i> · urgence {t.urgence.toLowerCase()}</i> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Le contact : l'agent du dossier, pas le standard. */}
            <div className="anp-contact">
              <div className="av">{String(charge.contact.initiales ?? "FI")}</div>
              <div className="qui">
                <b>{String(charge.contact.nom ?? "France Immeuble")}</b>
                <span>{String(charge.contact.poste ?? "")} · France Immeuble</span>
                <span className="coord">
                  {String(charge.contact.telephone ?? "")} · {String(charge.contact.email ?? "")}
                </span>
              </div>
              <span className="mandat">
                {charge.prix.mandat_numero ? `Mandat n° ${charge.prix.mandat_numero}` : "Mandat non numéroté"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ k, v, d, fort }: { k: string; v: string; d?: string; fort?: boolean }) {
  return (
    <div className={`anp-kpi-c${fort ? " fort" : ""}`}>
      <span className="k">{k}</span>
      <b>{v}</b>
      {d && <span className="d">{d}</span>}
    </div>
  );
}

function Cellule({ k, v, d, large }: { k: string; v: string; d?: string; large?: boolean }) {
  return (
    <div className={`dif-c${large ? " lg" : ""}`}>
      <span className="k">{k}</span>
      <b>{v}</b>
      {d && <span className="d">{d}</span>}
    </div>
  );
}

/* ------------------------------------------------- Module de la barre latérale */

export type LigneDiffusion = {
  immeubleId: string;
  ville: string;
  adresse: string;
  prix?: number;
  statut?: string;
  url?: string;
  publieLe?: string;
  ecart: boolean;
  erreur?: string;
  retombees?: { vues?: number; contacts: number; telephones: number; favoris: number; offres: number };
};

export function ParcDiffusion({
  lignes, configuree, vuesDisponibles,
}: {
  lignes: LigneDiffusion[];
  configuree: boolean;
  vuesDisponibles: boolean;
}) {
  const enLigne = lignes.filter((l) => l.statut === "online" || l.statut === "sous_offre");
  const somme = (f: (l: LigneDiffusion) => number) => lignes.reduce((s, l) => s + f(l), 0);

  return (
    <div className="dif-parc">
      <div className="dif-parc-h">
        <span className="t">Diffusion Plein Bail</span>
        <span className="s">
          {enLigne.length} annonce{enLigne.length > 1 ? "s" : ""} en ligne sur {lignes.length} publiée
          {lignes.length > 1 ? "s" : ""}
        </span>
      </div>

      {!configuree && (
        <div className="dif-simu">
          <b>Mode simulation</b>
          Le pont n&apos;est pas branché : les publications sont calculées mais pas envoyées, et
          les retombées ne peuvent pas être relevées.
        </div>
      )}

      <div className="dif-tuiles">
        <Tuile k="En ligne" v={String(enLigne.length)} />
        <Tuile k="Valeur diffusée" v={euros(somme((l) => l.prix ?? 0)) ?? "—"} />
        <Tuile k="Demandes de contact" v={String(somme((l) => l.retombees?.contacts ?? 0))} />
        <Tuile k="Téléphones révélés" v={String(somme((l) => l.retombees?.telephones ?? 0))} />
        <Tuile k="Mises en favori" v={String(somme((l) => l.retombees?.favoris ?? 0))} />
        <Tuile k="Offres reçues" v={String(somme((l) => l.retombees?.offres ?? 0))} vert />
      </div>

      {!vuesDisponibles && (
        <div className="dif-note-vues">
          Le nombre de vues et de clics n&apos;est pas encore compté par Plein Bail — aucune table
          ne les enregistre aujourd&apos;hui. Les chiffres ci-dessus sont les signaux réellement
          disponibles, et ce sont les plus utiles : une demande de contact vaut mille affichages.
        </div>
      )}

      {lignes.length === 0 ? (
        <div className="fempty" style={{ padding: 40 }}>
          Aucune annonce publiée. Le bouton se trouve sur la fiche de chaque immeuble,
          entrée « Diffusion », dès qu&apos;un mandat signé autorise la publication.
        </div>
      ) : (
        <div className="dif-liste">
          {lignes.map((l) => (
            <div key={l.immeubleId} className="dif-l">
              <div className="id">
                <Link href={`/bien/${l.immeubleId}`}>{l.ville}</Link>
                <span>{l.adresse}</span>
              </div>
              <span className={`dif-pastille ${l.statut ?? "hors"}`}>
                {LIBELLE_STATUT[(l.statut ?? "suspended") as keyof typeof LIBELLE_STATUT] ?? l.statut}
              </span>
              <span className="px">{euros(l.prix) ?? "—"}</span>
              <span className="rt">
                {l.retombees ? (
                  <>
                    <i title="Demandes de contact">✉ {l.retombees.contacts}</i>
                    <i title="Téléphones révélés">☎ {l.retombees.telephones}</i>
                    <i title="Mises en favori">★ {l.retombees.favoris}</i>
                    <i title="Offres reçues">€ {l.retombees.offres}</i>
                  </>
                ) : (
                  <i className="vide">retombées indisponibles</i>
                )}
              </span>
              {l.ecart && <span className="dif-att" title="La fiche a changé depuis la publication">à republier</span>}
              {l.erreur && <span className="dif-err" title={l.erreur}>erreur</span>}
              {l.url && <a className="dif-lien" href={l.url} target="_blank" rel="noreferrer">↗</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tuile({ k, v, vert }: { k: string; v: string; vert?: boolean }) {
  return (
    <div className="dif-tuile">
      <span className="k">{k}</span>
      <b className={vert ? "vert" : undefined}>{v}</b>
    </div>
  );
}
