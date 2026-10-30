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
import { redeposerCompteSite, repondreAuClient, voirCompteSite, type VueCompte } from "@/lib/bo/compte-site-actions";

const ETAPES: Record<string, string> = {
  estimation: "En cours d'estimation", mandat: "Mandat signé", commercialisation: "En commercialisation",
  sous_offre: "Sous offre", vendu: "Vendu",
};
const ETATS: Record<string, string> = { disponible: "Disponible", sous_offre: "Sous offre", vendu: "Vendu", retire: "Retiré" };
const REPONSES: Record<string, string> = { interesse: "Intéressé", visite: "Visite demandée", pas_pour_moi: "Pas pour lui" };
const DEMANDES: Record<string, string> = { en_attente: "En attente", dossier_envoye: "Dossier envoyé", close: "Close" };
const OFFRES: Record<string, string> = {
  en_cours: "En cours", contre_offre: "Contre-offre", acceptee: "Acceptée", refusee: "Refusée", compromis: "Compromis", vendu: "Vendue",
};
const PIECES: Record<string, string> = {
  titre: "Titre de propriété", baux: "Bail", diagnostics: "Diagnostic", taxe: "Taxe foncière",
  charges: "Charges / travaux", plans: "Plan", photos: "Photo", autre: "Pièce",
};

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
  const [reponse, setReponse] = useState("");
  /* Les conversations, la plus récente d'abord ; « » = en ouvrir une. */
  const conversations = [...new Map((vue?.messages ?? []).map((m) => [m.conversation, m])).keys()]
    .map((c) => {
      const ms = (vue?.messages ?? []).filter((m) => m.conversation === c);
      return { id: c, titre: ms.find((m) => m.titre)?.titre ?? "Sans titre", ms, dernier: ms[ms.length - 1]?.le ?? "" };
    })
    .sort((a, b) => b.dernier.localeCompare(a.dernier));
  const [choisie, setChoisie] = useState<string | null>(null);
  const cible = choisie ?? conversations[0]?.id ?? "";
  const [titreNeuf, setTitreNeuf] = useState("");
  const envoyer = () => start(async () => {
    const r = await repondreAuClient(contactId, reponse, cible ? { conversation: cible } : { titre: titreNeuf });
    setMsg(r.message);
    if (r.ok) { setReponse(""); setTitreNeuf(""); setVue(await voirCompteSite(contactId)); }
  });

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
            const docs = (l.compte_documents ?? []).filter((d) => d.bien_cle === b.cle);
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
                {/* Lot 5 : les pièces qu'il a déposées ; elles sont au coffre de l'immeuble. */}
                {/* V2 (30/10) : les offres que l'agent lui a transmises. */}
                {(l.compte_offres ?? []).filter((o) => o.bien_cle === b.cle).map((o) => (
                  <span className="cps-n" key={String(o.cle)}>
                    Offre de {t(o.acquereur) ?? "?"} reçue le {dmy(o.recue_le) ?? "?"} — {euros(o.prix_hai) ?? "?"} HAI,{" "}
                    {euros(o.net_vendeur) ?? "?"} net vendeur, {euros(o.honoraires) ?? "?"}{" "}d&apos;honoraires
                    {o.valable_jusqu_au ? `, valable jusqu'au ${dmy(o.valable_jusqu_au)}` : o.valable_jours ? `, valable ${String(o.valable_jours)} jours` : ""}
                    {" · "}{OFFRES[String(o.statut)] ?? String(o.statut)}{o.document ? " · document joint" : ""}
                  </span>
                ))}
                {docs.map((d) => (
                  <span className="cps-n" key={String(d.cle)}>
                    {PIECES[String(d.categorie)] ?? "Pièce"} déposée le {dmy(d.recu_le) ?? "?"} — {t(d.nom)}
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

      {/* La messagerie (V2, 30/10) : le fil tel que le client le lit, et la
          réponse de l'agent. Envoyer, c'est la validation humaine. */}
      {vue?.compte && (
        <div className="cps-g">
          <span className="cps-t">Messages</span>
          {conversations.length === 0 && <span className="cps-n">Aucun message pour l&apos;instant.</span>}
          {conversations.map((c) => (
            <div key={c.id} className={`cps-conv${c.id === cible ? " on" : ""}`}>
              <button type="button" className="cps-conv-t" onClick={() => setChoisie(c.id)} title="Répondre dans cette conversation">
                {c.titre} <i>· {c.ms.length} message{c.ms.length > 1 ? "s" : ""}</i>
              </button>
              <div className="cps-fil">
                {c.ms.map((m) => (
                  <div key={m.id} className={`cps-msg ${m.de}`}>
                    <span className="cps-msg-h">{m.de === "agent" ? m.auteur ?? "France Immeuble" : "Le client"} · {dmy(m.le) ?? ""}</span>
                    <span className="cps-msg-t">{m.texte}</span>
                    {m.pieces.length > 0 && <span className="cps-msg-h">Pièces jointes : {m.pieces.join(", ")} (au coffre)</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="cps-cible">
            <select className="min" value={cible} onChange={(e) => setChoisie(e.target.value)}>
              {conversations.map((c) => <option key={c.id} value={c.id}>Répondre dans « {c.titre} »</option>)}
              <option value="">Nouvelle conversation…</option>
            </select>
            {!cible && <input className="min" placeholder="Titre de la conversation" value={titreNeuf} onChange={(e) => setTitreNeuf(e.target.value)} />}
          </div>
          <div className="cps-rep">
            <textarea className="min" rows={2} placeholder="Votre réponse, qu'il lira sur son compte…" value={reponse}
              onChange={(e) => setReponse(e.target.value)} />
            <button type="button" className="espv-b" disabled={pending || !reponse.trim() || (!cible && !titreNeuf.trim())} onClick={envoyer}>
              {pending ? "…" : "Envoyer sur son compte"}
            </button>
          </div>
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
