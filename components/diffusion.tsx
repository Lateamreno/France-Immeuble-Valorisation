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
import { BadgeDpe } from "@/components/pictos";
import { useQuestion } from "@/components/modale";
import {
  apercuAnnonce, audienceAnnonce, deposerBrouillon, publierAnnonce, retirerAnnonce,
  type Apercu, type Audience, type Branchement,
} from "@/lib/bo/diffusion";
import {
  apercuSite, cocherDestination, deposerOffmarket, publierParcSurSite, publierSurSite, retirerDuSite,
  type ApercuSite,
} from "@/lib/bo/site-fi";
import { agentCourantSlug } from "@/lib/bo/agent-courant";

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
  const [s, setS] = useState<ApercuSite | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [avis, setAvis] = useState<string[]>([]);
  const [aud, setAud] = useState<Audience | null>(null);
  const [detail, setDetail] = useState(false);
  const [pending, start] = useTransition();
  const { confirmer, question } = useQuestion();

  const relire = async () => {
    const [x, y] = await Promise.all([
      apercuAnnonce(immeubleId).catch(() => null),
      apercuSite(immeubleId).catch(() => null),
    ]);
    setA(x);
    setS(y);
  };

  useEffect(() => {
    apercuAnnonce(immeubleId).then(setA).catch(() => setA(null));
    apercuSite(immeubleId).then(setS).catch(() => setS(null));
  }, [immeubleId]);

  /* Une seule décision, deux destinations (contrat §3) : la case dit où, le
     bouton dit quand. Chaque destination part si elle est cochée ET prête ;
     l'une peut réussir quand l'autre refuse, et le message dit les deux. */
  const pretPb = !!a && a.coche && a.blocages.length === 0 && !!a.statut;
  const pretSite = !!s && s.etat.coche && s.blocages.length === 0 && !!s.statut;

  const publier = () =>
    start(async () => {
      setMsg(null);
      setAvis([]);
      const lignes: string[] = [];
      if (pretPb) {
        const r = await publierAnnonce(immeubleId);
        if (r.ok) {
          const p = r.photos;
          lignes.push(
            `Plein Bail : annonce publiée, ${r.lots ?? 0} lots` +
              (p ? `, ${p.copiees} photo${p.copiees > 1 ? "s" : ""} copiée${p.copiees > 1 ? "s" : ""}` : "") +
              (p && p.ignorees ? `, ${p.ignorees} ignorée${p.ignorees > 1 ? "s" : ""}` : "") +
              ".",
          );
          /* Ce que Plein Bail n'a pas compris. Il ne devine jamais : il laisse
             le champ vide et le dit ici. Ne pas l'afficher, c'est publier une
             annonce amputée sans le savoir. */
          setAvis(r.avertissements ?? []);
        } else {
          lignes.push(`Plein Bail : ${r.message}`);
        }
      }
      if (pretSite) {
        const r = await publierSurSite(immeubleId, agentCourantSlug() ?? undefined);
        lignes.push(
          r.ok
            ? `Site France Immeuble : ${r.statut === "sous_offre" ? "affiché sous offre" : "en vente"}, ${r.photos} photo${r.photos > 1 ? "s" : ""}. En ligne d'ici dix minutes.`
            : `Site France Immeuble : ${r.message}`,
        );
      }
      setMsg(lignes.join("\n"));
      await relire();
    });

  /* Décocher une destination où le bien est en ligne l'en retire aussitôt :
     on le demande avant, en disant ce qui va se passer. */
  const cocher = async (destination: "pb" | "site", coche: boolean) => {
    const enLigne = destination === "pb"
      ? etat.publiee && etat.statutEnLigne !== "suspended"
      : !!s?.etat.publie;
    if (!coche && enLigne) {
      const ok = await confirmer(
        destination === "pb"
          ? "Décocher Plein Bail retire l'annonce de Plein Bail maintenant."
          : "Décocher le site retire le bien du site France Immeuble maintenant.",
        { danger: true, oui: "Décocher et retirer" },
      );
      if (!ok) return;
    }
    start(async () => {
      const r = await cocherDestination(immeubleId, destination, coche, agentCourantSlug() ?? undefined);
      if (!r.ok) setMsg(r.message);
      await relire();
    });
  };

  const retirerSite = async () => {
    if (!(await confirmer("Retirer le bien du site France Immeuble ?", { danger: true, oui: "Retirer du site" }))) return;
    start(async () => {
      const r = await retirerDuSite(immeubleId, "Retrait manuel depuis le BO", agentCourantSlug() ?? undefined);
      setMsg(r.ok ? "Bien retiré du site." : r.message);
      await relire();
    });
  };

  /* Sonder l'audience suppose une annonce déposée chez eux. Quand il n'y en a
     pas, on propose de déposer un BROUILLON : invisible de tous, y compris des
     autres agences. C'est ce qui permet de mesurer avant d'avoir un mandat
     signé, donc avant d'avoir le droit de publier — la distinction n'est pas
     cosmétique, et la confirmation le dit en toutes lettres. */
  /* Une question ne se pose PAS dans une transition : React retient l'écran
     tant que l'action asynchrone court, et la fenêtre n'apparaîtrait jamais
     (trouvé le 25/09 sur ce bouton). On lit d'abord, on demande, puis on
     lance la transition pour ce qui écrit. */
  const [lecture, setLecture] = useState(false);
  const sonder = async () => {
    setMsg(null);
    setLecture(true);
    const r = await audienceAnnonce(immeubleId).finally(() => setLecture(false));
    if (!r.ok && r.sansAnnonce) {
      const ok = await confirmer(
        "Aucune annonce n'est déposée chez Plein Bail.\n\n" +
          "Déposer un BROUILLON pour mesurer l'audience ? Un brouillon n'est visible de " +
          "personne — ni du public, ni des autres agences. Rien n'est publié.",
        { oui: "Déposer un brouillon" },
      );
      if (!ok) return;
      start(async () => {
        const d = await deposerBrouillon(immeubleId);
        if (!d.ok) {
          setMsg(d.message);
          return;
        }
        const r2 = await audienceAnnonce(immeubleId);
        setA(await apercuAnnonce(immeubleId));
        if (r2.ok) setAud(r2.a);
        else setMsg(r2.message);
      });
      return;
    }
    if (r.ok) setAud(r.a);
    else setMsg(r.message);
  };

  const retirer = async () => {
    if (!(await confirmer("Retirer l'annonce de Plein Bail ?", { danger: true, oui: "Retirer l'annonce" }))) return;
    start(async () => {
      const r = await retirerAnnonce(immeubleId, "Retrait manuel depuis le BO");
      setMsg(r.ok ? "Annonce retirée." : r.message);
      setA(await apercuAnnonce(immeubleId));
    });
  };

  if (!a) return <div className="fempty">Lecture de l&apos;état de diffusion…</div>;

  const pret = pretPb || pretSite;
  const dejaEnLigne = (etat.publiee && etat.statutEnLigne !== "suspended") || !!s?.etat.publie;
  const libelleBouton = pending
    ? "Envoi…"
    : dejaEnLigne
      ? "Republier maintenant"
      : pretPb && pretSite
        ? "Publier sur Plein Bail et le site"
        : pretSite
          ? "Publier sur le site"
          : "Publier sur Plein Bail";

  return (
    <div className="dif">
      {/* --- Les destinations : deux cases, cochées par défaut (contrat §3) --- */}
      <div className="dif-dest">
        <Destination
          titre="Plein Bail"
          sous="La marketplace des immeubles de rapport"
          coche={a.coche}
          pastille={etat.publiee ? (etat.statutEnLigne ?? "online") : "hors"}
          libelle={etat.publiee
            ? LIBELLE_STATUT[(etat.statutEnLigne ?? "online") as keyof typeof LIBELLE_STATUT] ?? etat.statutEnLigne ?? ""
            : "Non publiée"}
          lien={etat.url}
          texteLien="Voir l'annonce ↗"
          note={!a.coche ? "Case décochée : rien ne part sur Plein Bail." : !a.statut ? a.motif : undefined}
          aRepublier={etat.publiee && a.ecart}
          disabled={pending}
          onCocher={(v) => cocher("pb", v)}
        />
        <Destination
          titre="Site France Immeuble"
          sous="La vitrine de l'agence"
          coche={s?.etat.coche ?? true}
          pastille={s?.etat.publie ? (s.etat.statut === "sous_offre" ? "sous_offre" : "online") : "hors"}
          libelle={s?.etat.publie ? (s.etat.statut === "sous_offre" ? "Sous offre" : "En vente") : "Non publié"}
          lien={s?.etat.publie ? s.url : undefined}
          texteLien="Voir la page ↗"
          note={
            !s ? "Lecture…"
              : !s.configuree ? "Le site n'est pas branché : il manque les variables SITE_FI_SUPABASE_* dans Vercel."
              : !s.etat.coche ? "Case décochée : rien ne part sur le site."
              : !s.statut ? s.motif
              : undefined
          }
          erreur={s?.etat.derniereErreur}
          aRepublier={!!s?.etat.publie && !!s?.ecart}
          disabled={pending || !s}
          onCocher={(v) => cocher("site", v)}
        />
      </div>

      <div className="dif-tete">
        <div className="t">
          <b>Ce qui part</b>
          <span>Le même contenu sur les deux destinations ; le site ne reçoit ni l&apos;adresse ni le détail des lots</span>
        </div>
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

          <button type="button" className="dif-plus" onClick={() => setDetail((v) => !v)}>
            {detail ? "Masquer" : "Voir"} les données brutes envoyées
          </button>
          {detail && (
            <pre className="dif-json">
              {JSON.stringify({ plein_bail: a.charge, site_france_immeuble: s?.ligne ?? null }, null, 2)}
            </pre>
          )}
        </>
      )}

      <div className="dif-actions">
        <button className="dif-go" type="button" disabled={!pret || pending} onClick={publier}>
          <span className="ch">›</span> {libelleBouton}
        </button>
        {etat.publiee && etat.statutEnLigne !== "suspended" && (
          <button className="dif-x" type="button" disabled={pending} onClick={retirer}>
            Retirer de Plein Bail
          </button>
        )}
        {s?.etat.publie && (
          <button className="dif-x" type="button" disabled={pending} onClick={retirerSite}>
            Retirer du site
          </button>
        )}
        <button className="dif-x" type="button" disabled={pending || lecture || !a.configuree} onClick={sonder}>
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
      {question}
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
                          <td><BadgeDpe lettre={l.dpe_lot} /></td>
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

/** Une destination de diffusion : sa case, son état en ligne, son lien. */
function Destination({
  titre, sous, coche, pastille, libelle, lien, texteLien, note, erreur, aRepublier, disabled, onCocher,
}: {
  titre: string;
  sous: string;
  coche: boolean;
  pastille: string;
  libelle: string;
  lien?: string;
  texteLien: string;
  note?: string;
  erreur?: string;
  aRepublier?: boolean;
  disabled?: boolean;
  onCocher: (v: boolean) => void;
}) {
  return (
    <div className={`dif-dest-c${coche ? "" : " off"}`}>
      <label className="h">
        <input type="checkbox" checked={coche} disabled={disabled} onChange={(e) => onCocher(e.target.checked)} />
        <span className="t">{titre}<small>{sous}</small></span>
        <span className={`dif-pastille ${pastille}`}>{libelle}</span>
      </label>
      {(lien || aRepublier) && (
        <div className="l">
          {aRepublier && <span className="dif-att" title="La fiche a changé depuis la publication">à republier</span>}
          {lien && <a className="dif-lien" href={lien} target="_blank" rel="noreferrer">{texteLien}</a>}
        </div>
      )}
      {note && <div className="n">{note}</div>}
      {erreur && <div className="e">Dernier dépôt en échec : {erreur}</div>}
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
  /** Retour #456 : « je veux les photos de chaque bien, les renta et prix au
   *  m² affichés, et un lien vers l'annonce ». */
  photo?: string;
  renta?: number;
  prixM2?: number;
  /** Le bien sur le site France Immeuble (contrat §3). */
  siteStatut?: "en_vente" | "sous_offre";
  siteUrl?: string;
  siteErreur?: string;
};

export function ParcDiffusion({
  lignes, configuree, vuesDisponibles, branchement,
}: {
  lignes: LigneDiffusion[];
  configuree: boolean;
  vuesDisponibles: boolean;
  /** Résultat du test de branchement, joué à l'ouverture de l'écran. */
  branchement?: Branchement;
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

      {/* Le test de branchement. Il ne lit ni n'écrit rien du catalogue — c'est
          un « retombees » à liste vide — mais il tranche en une ligne entre un
          jeton absent, un jeton refusé et une adresse qui ne répond pas l'API.
          Sans lui, ces trois pannes se ressemblent toutes : « ça ne marche pas ». */}
      {branchement && (
        <div className={`dif-test${branchement.ok ? " ok" : ""}`}>
          <b>{branchement.ok ? "Pont Plein Bail branché" : "Pont Plein Bail — test échoué"}</b>
          <span>{branchement.message}</span>
          {branchement.url && <code>{branchement.url}</code>}
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
              <Link href={`/bien/${l.immeubleId}`} className="dif-ph" aria-hidden tabIndex={-1}>
                {l.photo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={l.photo} alt="" />
                  : <span className="vide" />}
              </Link>
              <div className="id">
                <Link href={`/bien/${l.immeubleId}`}>{l.ville}</Link>
                <span>{l.adresse}</span>
              </div>
              <span className="dif-deux">
                <span className={`dif-pastille ${l.statut ?? "hors"}`} title="Plein Bail">
                  PB · {l.statut ? LIBELLE_STATUT[l.statut as keyof typeof LIBELLE_STATUT] ?? l.statut : "Non publiée"}
                </span>
                <span
                  className={`dif-pastille ${l.siteStatut === "sous_offre" ? "sous_offre" : l.siteStatut ? "online" : "hors"}`}
                  title={l.siteErreur ? `Site France Immeuble · dernier dépôt en échec : ${l.siteErreur}` : "Site France Immeuble"}
                >
                  Site · {l.siteStatut === "sous_offre" ? "Sous offre" : l.siteStatut ? "En vente" : "Non publié"}
                </span>
              </span>
              <span className="px">
                {euros(l.prix) ?? "—"}
                <small>
                  {l.prixM2 !== undefined ? `${Math.round(l.prixM2).toLocaleString("fr-FR")} €/m²` : "— €/m²"}
                  {" · "}
                  {l.renta !== undefined ? `${l.renta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "— %"}
                </small>
              </span>
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
              {l.url && <a className="dif-lien" href={l.url} target="_blank" rel="noreferrer">Voir l&apos;annonce ↗</a>}
              {l.siteUrl && <a className="dif-lien" href={l.siteUrl} target="_blank" rel="noreferrer">Voir la page ↗</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------- Le site France Immeuble */

/**
 * Le pont vers le site, vu du parc : est-il branché, que reste-t-il à y
 * publier, et que dit le compteur off-market que le site affichera.
 */
export function PanneauSite({
  test, aReprendre, offmarket,
}: {
  test: { ok: boolean; message: string };
  /** Biens en ligne sur Plein Bail et pas encore sur le site. */
  aReprendre: number;
  offmarket: { commune: string; dept: string; arrondissement: string | null; nombre: number }[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const { confirmer, question } = useQuestion();
  const total = offmarket.reduce((s, l) => s + l.nombre, 0);

  const reprendre = async () => {
    const ok = await confirmer(
      `Publier sur le site les ${aReprendre} bien${aReprendre > 1 ? "s" : ""} déjà en ligne sur Plein Bail ?\n\n` +
        "Chacun part avec les mêmes informations que sur Plein Bail, sans l'adresse. Un bien dont la case « Site » est décochée est laissé de côté.",
      { oui: "Publier sur le site" },
    );
    if (!ok) return;
    start(async () => {
      const r = await publierParcSurSite(agentCourantSlug() ?? undefined);
      setMsg(
        r.ok
          ? `${r.publies} bien${r.publies > 1 ? "s" : ""} publié${r.publies > 1 ? "s" : ""} sur le site.` +
              (r.refus.length ? `\n${r.refus.length} refusé${r.refus.length > 1 ? "s" : ""} : ${r.refus.map((x) => x.message).join(" · ")}` : "")
          : r.message,
      );
    });
  };

  const deposer = () =>
    start(async () => {
      const r = await deposerOffmarket();
      setMsg(r.ok ? `Compteur déposé : ${r.biens} bien${r.biens > 1 ? "s" : ""} dans ${r.communes} commune${r.communes > 1 ? "s" : ""}.` : r.message);
    });

  return (
    <div className="dif-site">
      <div className="dif-parc-h">
        <span className="t">Site France Immeuble</span>
        <span className="s">Le BO dépose, le site affiche : il ne lit jamais le BO</span>
      </div>
      <div className={`dif-test${test.ok ? " ok" : ""}`}>
        <b>{test.ok ? "Pont vers le site branché" : "Pont vers le site — test échoué"}</b>
        <span>{test.message}</span>
      </div>
      <div className="dif-site-l">
        <div>
          <b>{aReprendre}</b> bien{aReprendre > 1 ? "s" : ""} en ligne sur Plein Bail, pas encore sur le site.
        </div>
        <button className="fadd" type="button" disabled={pending || !test.ok || aReprendre === 0} onClick={reprendre}>
          Publier sur le site
        </button>
      </div>
      <div className="dif-site-l">
        <div>
          <b>{total}</b> immeuble{total > 1 ? "s" : ""} off-market, dans {offmarket.length} commune{offmarket.length > 1 ? "s" : ""}.
          Le compteur part sur le site à 9 h et à 19 h.
          {offmarket.length > 0 && (
            <span className="dif-om">
              {offmarket.map((l) => (
                <i key={`${l.dept}${l.commune}${l.arrondissement ?? ""}`}>
                  {l.arrondissement ? `${l.commune} ${l.arrondissement}` : l.commune} ({l.dept}) · {l.nombre}
                </i>
              ))}
            </span>
          )}
        </div>
        <button className="fadd" type="button" disabled={pending || !test.ok} onClick={deposer}>
          Déposer maintenant
        </button>
      </div>
      {msg && <div className="dif-msg">{msg}</div>}
      {question}
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
