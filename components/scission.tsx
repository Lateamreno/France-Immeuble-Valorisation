"use client";

/**
 * Vendre les lots à part (CLAUDE.md §7.11, étape 2 — MAV, 20/11 : « un bouton
 * sur chaque lot de l'état locatif pour me demander si je veux déclencher le
 * lot à part, et un bouton pour tout déclencher »).
 *
 * Sur la vue Copropriété de l'état locatif : une ligne par chose à vendre (un
 * lot, et les caves ou parkings qui partent avec lui), son prix honoraires
 * inclus, et soit le bouton, soit la fiche déjà créée. Rien n'est commercialisé
 * d'office : la fiche d'un lot naît « OK pour vendre », l'agent la lance.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { useQuestion } from "@/components/modale";
import { scinderLots } from "@/lib/bo/scission-actions";
import { aSavoirAvant, ficheDeLUnite, reglementAuCoffre, unitesDeVente, type Unite } from "@/lib/bo/scission";

const euros = (n?: number) => (n ? `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} €` : "");

export function VenteParLot({ b }: { b: BienData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ton: "ok" | "non"; texte: string } | null>(null);
  const { confirmer, question } = useQuestion();

  const unites = unitesDeVente(b.lots);
  if (unites.length === 0) return null;
  const aFaire = unites.filter((u) => !ficheDeLUnite(u, b.lotsEnVente));
  const reglement = reglementAuCoffre(b.documents);
  const sousMandat = b.mandats.some((m) => String(m.Statut ?? "") !== "Annulé");

  const scinder = async (cibles: Unite[]) => {
    const un = cibles.length === 1;
    const remarques = cibles.flatMap(aSavoirAvant);
    const ok = await confirmer(
      <>
        <p>
          {un
            ? <>Créer la fiche de vente de <b>{cibles[0].libelle}</b> ?</>
            : <>Créer une fiche de vente pour chacun des <b>{cibles.length} lots</b> qui n&apos;en ont pas encore ?</>}
        </p>
        <p>
          {un ? "La fiche reprend" : "Chaque fiche reprend"} l&apos;adresse, le propriétaire, l&apos;agent, la ligne d&apos;état locatif, le bail
          et le locataire. {sousMandat ? "Le mandat de l'immeuble la couvre. " : ""}Elle naît « OK pour vendre » : rien n&apos;est
          envoyé ni publié tant que vous ne le lancez pas. L&apos;immeuble reste proposé en bloc.
        </p>
        {!reglement && <p><b>Le règlement de copropriété n&apos;est pas au coffre.</b> Vous pouvez scinder quand même ; pensez à l&apos;y déposer.</p>}
        {remarques.length > 0 && <p>{remarques.slice(0, 4).join(" ")}{remarques.length > 4 ? " …" : ""}</p>}
      </>,
      { titre: un ? "Mettre ce lot en vente à part" : "Mettre tous les lots en vente à part", oui: un ? "Créer la fiche" : `Créer les ${cibles.length} fiches` },
    );
    if (!ok) return;
    setMessage(null);
    start(async () => {
      const r = await scinderLots(String(b.im._id), cibles.map((u) => u.id)).catch((e: unknown) => ({
        ok: false as const, message: e instanceof Error ? e.message : "La création a échoué.",
      }));
      if (!r.ok) { setMessage({ ton: "non", texte: r.message }); return; }
      setMessage({
        ton: "ok",
        texte: r.creees.length === 1 ? `Fiche créée : ${r.creees[0].libelle}.`
          : r.creees.length > 1 ? `${r.creees.length} fiches créées.` : "Ces lots avaient déjà leur fiche.",
      });
      router.refresh();
    });
  };

  return (
    <div className="vpl">
      {question}
      <div className="vpl-tete">
        <div>
          <b>Vendre les lots à part</b>
          <p>
            Chaque lot mis en vente reçoit sa propre fiche, rattachée à cet immeuble : propositions, visites, offres et dossier
            s&apos;y font comme pour un immeuble. Une cave ou un parking « vendu avec » un lot part avec lui.
          </p>
        </div>
        {aFaire.length > 1 && (
          <button type="button" className="fadd" disabled={pending} onClick={() => scinder(aFaire)}>
            Mettre tous les lots en vente ({aFaire.length})
          </button>
        )}
      </div>
      {!reglement && (
        <p className="vpl-rappel">Le règlement de copropriété n&apos;est pas encore au coffre de l&apos;immeuble (Documents) : à déposer avant de vendre.</p>
      )}
      {message && <p className={`vpl-msg ${message.ton}`}>{message.texte}</p>}
      <ul className="vpl-liste">
        {unites.map((u) => {
          const fiche = ficheDeLUnite(u, b.lotsEnVente);
          return (
            <li key={u.id} className={fiche ? "fait" : ""}>
              <span className="l">{u.libelle}</span>
              <span className="o">{u.loue ? `loué ${euros(u.loyer)} / mois` : "libre"}</span>
              <span className="p">{u.prixHai ? `${euros(u.prixHai)} HAI` : <i>sans prix retenu</i>}</span>
              {fiche ? (
                <span className="a">
                  <span className="vpl-etat">{fiche.statut.replace(/^\d+\s*-\s*/, "")}</span>
                  <Link className="mopt" href={`/bien/${fiche.id}`}>Ouvrir la fiche ›</Link>
                </span>
              ) : (
                <span className="a">
                  <button type="button" className="mopt" disabled={pending} onClick={() => scinder([u])}>
                    Mettre en vente à part
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {pending && <p className="vpl-msg">Création en cours…</p>}
    </div>
  );
}

/** En tête de la fiche : d'où vient ce lot, ou combien de lots l'immeuble vend à part. */
export function LienLots({ b }: { b: BienData }) {
  if (b.immeubleParent) {
    return (
      <div className="lien-lots">
        {typeof b.im.lot_libelle === "string" && <b title={b.im.lot_libelle}>{b.im.lot_libelle}</b>}
        <Link href={`/bien/${b.immeubleParent.id}?ecran=locatif&sous=copro`} title={b.immeubleParent.adresse}>
          ‹ Lot de l&apos;immeuble
        </Link>
      </div>
    );
  }
  const actives = b.lotsEnVente.filter((f) => !f.archivee);
  if (actives.length === 0) return null;
  return (
    <div className="lien-lots">
      <Link href={`/bien/${String(b.im._id)}?ecran=locatif&sous=copro`}>
        {actives.length === 1 ? "1 lot en vente à part" : `${actives.length} lots en vente à part`} ›
      </Link>
    </div>
  );
}
