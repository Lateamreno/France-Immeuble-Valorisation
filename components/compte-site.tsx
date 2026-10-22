"use client";

// « Son compte sur le site » (contrat §9.6, lot 4).
//
// Il n'y a plus d'espace client dans le BO (MAV, 22/10) : le client a son
// compte sur le site France Immeuble, et l'agent voit ici exactement ce qu'il
// y voit, relu dans la base du site. Mêmes lignes, mêmes champs. Le panneau
// sert sur la fiche contact (acquéreur et propriétaire) et sur l'onglet
// Propriétaire de la fiche bien.
import { useEffect, useState, useTransition } from "react";
import { dmy, euros } from "@/lib/format";
import { Pastille } from "@/components/pastille";
import { redeposerCompteSite, voirCompteSite, type VueCompte } from "@/lib/bo/compte-site-actions";

const ETAPES: Record<string, string> = {
  estimation: "En cours d'estimation", mandat: "Mandat signé", commercialisation: "En commercialisation",
  sous_offre: "Sous offre", vendu: "Vendu",
};
const ETATS: Record<string, string> = { disponible: "Disponible", sous_offre: "Sous offre", vendu: "Vendu", retire: "Retiré" };
const REPONSES: Record<string, string> = { interesse: "Intéressé", visite: "Visite demandée", pas_pour_moi: "Pas pour lui" };
const DEMANDES: Record<string, string> = { en_attente: "En attente", dossier_envoye: "Dossier envoyé", close: "Close" };

type L = Record<string, unknown>;
const t = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));
const lieu = (l: L) => [t(l.type), t(l.lots) ? `${l.lots} lots` : undefined].filter(Boolean).join(" de ") + (t(l.commune) ? ` à ${l.commune}${t(l.dept) ? ` (${l.dept})` : ""}` : "");

export function CompteSite({ contactId, titre = "Son compte sur le site" }: { contactId: string; titre?: string }) {
  const [vue, setVue] = useState<VueCompte | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let vivant = true;
    voirCompteSite(contactId).then((v) => { if (vivant) setVue(v); }).catch(() => { if (vivant) setVue({ compte: null, lignes: null }); });
    return () => { vivant = false; };
  }, [contactId]);

  const l = vue?.lignes;
  const vide = l && Object.values(l).every((x) => x.length === 0);

  return (
    <div className="espv cps" style={{ marginBottom: 14 }}>
      <div className="espv-hd">
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" /></svg>
        <b>{titre}</b>
        <span className="sp" style={{ flex: 1 }} />
        {vue?.compte && (
          <button type="button" className="espv-b" disabled={pending}
            onClick={() => start(async () => {
              const r = await redeposerCompteSite(contactId);
              setMsg(r.message);
              setVue(await voirCompteSite(contactId));
            })}>
            {pending ? "…" : "Remettre à jour"}
          </button>
        )}
      </div>

      {!vue && <p className="espv-txt">Lecture du compte…</p>}
      {vue && !vue.compte && (
        <p className="espv-txt">
          Pas de compte sur le site. Le client le crée lui-même sur le site France Immeuble ; il apparaît ici
          dès que son adresse e-mail est vérifiée.
        </p>
      )}
      {vue?.compte && (
        <p className="espv-txt">
          Compte rattaché{vue.rattacheLe ? ` le ${dmy(vue.rattacheLe)}` : ""}
          {vue.depotLe ? `, mis à jour le ${dmy(vue.depotLe)}` : ""}. Voici ce qu&apos;il y voit.
        </p>
      )}
      {vue?.erreur && <p className="espv-txt" style={{ color: "#a5341f" }}>Dernier dépôt incomplet : {vue.erreur}</p>}
      {msg && <p className="espv-txt">{msg}</p>}
      {vue?.compte && !l && <p className="espv-txt">Le site n&apos;est pas branché ici : lecture impossible.</p>}
      {vue?.compte && vide && <p className="espv-txt">Son compte est vide pour l&apos;instant.</p>}

      {l && l.compte_biens.length > 0 && (
        <div className="cps-g">
          <span className="cps-t">Ses immeubles</span>
          {l.compte_biens.map((b) => {
            const est = l.compte_estimations.filter((e) => e.bien_cle === b.cle);
            return (
              <div className="cps-l" key={String(b.cle)}>
                <span>{lieu(b)}</span>
                <Pastille ton={b.etape === "vendu" ? "vert" : b.etape === "sous_offre" ? "orange" : "bleu"}>{ETAPES[String(b.etape)] ?? String(b.etape)}</Pastille>
                {euros(b.prix) && <span className="cps-n">{euros(b.prix)}</span>}
                {b.sollicites !== null && b.sollicites !== undefined && (
                  <span className="cps-n">{String(b.sollicites)} acquéreurs sollicités · {String(b.visites ?? 0)} visites · {String(b.offres ?? 0)} offres</span>
                )}
                {est.map((e) => (
                  <span className="cps-n" key={String(e.cle)}>
                    Estimé {euros(e.valeur)}{e.prix_m2 ? ` (${euros(e.prix_m2)}/m²)` : ""}{e.rendement ? `, ${String(e.rendement).replace(".", ",")} % brut` : ""} le {dmy(e.estimee_le)}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {l && l.compte_recherches.length > 0 && (
        <div className="cps-g">
          <span className="cps-t">Ses recherches</span>
          {l.compte_recherches.map((r) => (
            <div className="cps-l" key={String(r.cle)}>
              <span>{t(r.cible) ?? "Cible non précisée"}</span>
              <span className="cps-n">
                {(r.departements as string[] | undefined)?.join(", ") || "tous départements"}
                {r.prix_min || r.prix_max ? ` · ${euros(r.prix_min) ?? "…"} à ${euros(r.prix_max) ?? "…"}` : ""}
                {r.rendement_min ? ` · ${String(r.rendement_min)} % min` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {l && l.compte_propositions.length > 0 && (
        <div className="cps-g">
          <span className="cps-t">Les biens qu&apos;on lui a proposés</span>
          {l.compte_propositions.map((p) => (
            <div className="cps-l" key={String(p.cle)}>
              <span>{lieu(p)}</span>
              <Pastille ton={p.etat === "disponible" ? "vert" : p.etat === "sous_offre" ? "orange" : "gris"}>{ETATS[String(p.etat)] ?? String(p.etat)}</Pastille>
              {euros(p.prix) && <span className="cps-n">{euros(p.prix)}</span>}
              <span className="cps-n">proposé le {dmy(p.propose_le) ?? "?"}</span>
              {t(p.reponse) && <Pastille ton={p.reponse === "pas_pour_moi" ? "gris" : "bleu"}>{REPONSES[String(p.reponse)] ?? String(p.reponse)}</Pastille>}
            </div>
          ))}
        </div>
      )}

      {l && l.compte_demandes.length > 0 && (
        <div className="cps-g">
          <span className="cps-t">Ses demandes de dossier</span>
          {l.compte_demandes.map((d) => (
            <div className="cps-l" key={String(d.cle)}>
              <span>{t(d.titre)}</span>
              <Pastille ton={d.etat === "dossier_envoye" ? "vert" : d.etat === "close" ? "gris" : "orange"}>{DEMANDES[String(d.etat)] ?? String(d.etat)}</Pastille>
              <span className="cps-n">le {dmy(d.demande_le) ?? "?"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
