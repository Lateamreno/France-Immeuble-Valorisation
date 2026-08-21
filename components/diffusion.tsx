"use client";

// Diffusion Plein Bail — l'écran.
//
// Deux vues, un seul vocabulaire : la section de la fiche montre l'état d'UNE
// annonce et permet d'agir dessus ; le module de la barre latérale montre le
// parc entier et ce qu'il rapporte.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { dmy, euros } from "@/lib/format";
import { LIBELLE_STATUT, type Blocage } from "@/lib/diffusion";
import { apercuAnnonce, publierAnnonce, retirerAnnonce, type Apercu } from "@/lib/bo/diffusion";

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
  const [detail, setDetail] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    apercuAnnonce(immeubleId).then(setA).catch(() => setA(null));
  }, [immeubleId]);

  const publier = () =>
    start(async () => {
      setMsg(null);
      const r = await publierAnnonce(immeubleId);
      setMsg(r.ok ? "Annonce publiée." : r.message);
      setA(await apercuAnnonce(immeubleId));
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
              k="Adresse"
              v={a.charge.bien.affichage_adresse === "exacte" ? "Exacte" : "Ville et quartier"}
              d={a.charge.bien.affichage_adresse === "exacte" ? undefined : "Immeuble occupé"}
            />
            <Cellule
              k="Contact"
              v={String(a.charge.contact.nom ?? "—")}
              d={String(a.charge.contact.email ?? "")}
              large
            />
          </div>

          <button type="button" className="dif-plus" onClick={() => setDetail((v) => !v)}>
            {detail ? "Masquer" : "Voir"} ce qui sera envoyé
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
        <span style={{ flex: 1 }} />
        {etat.derniereSynchro && (
          <span className="dif-note">Dernière synchronisation {dmy(etat.derniereSynchro)}</span>
        )}
      </div>
      {msg && <div className="dif-msg">{msg}</div>}

      <div className="dif-pied">
        Aucun nom de locataire n&apos;est transmis : seule la nature du preneur part, physique ou morale.
        L&apos;annonce se retire d&apos;elle-même à la fin du mandat, et se met à jour dès que l&apos;état
        locatif, les photos, les travaux, les charges ou le prix changent.
      </div>
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
