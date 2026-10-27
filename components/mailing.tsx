"use client";

/* L'écran Mailing (MAV, 27/10) : « bien cibler les types de clients et faire
 * un suivi de ce qu'on a envoyé ; ça pourrait être bon de noter notre taux de
 * réponse pour aviser ».
 *
 * En haut, ce que les campagnes ont donné, globalement puis par public ; en
 * dessous, chaque campagne avec son avancement, et son détail nominatif à la
 * demande. Une campagne se crée dans la fenêtre de salve (mêmes filtres, même
 * relecture nominative), en mode « campagne ».
 */

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FenetreSalve } from "@/components/mails/salve";
import { Pastille, type Ton } from "@/components/pastille";
import type { MessageType } from "@/lib/mails/serveur";
import type { DestinataireCampagne, LigneCampagne } from "@/lib/bo/campagnes";
import {
  annulerCampagne, chargerDestinataires, reprendreCampagne, suspendreCampagne,
} from "@/lib/bo/campagnes-actions";

const PUBLIC: Record<string, string> = { proprietaires: "Vendeurs", acquereurs: "Acquéreurs", partenaires: "Partenaires" };
const publicDe = (cible: string) =>
  cible.split(",").filter(Boolean).map((c) => PUBLIC[c] ?? c).join(" + ") || "—";

const STATUT: Record<LigneCampagne["statut"], { t: string; ton: Ton }> = {
  en_cours: { t: "En cours", ton: "bleu" },
  suspendue: { t: "En pause", ton: "orange" },
  envoyee: { t: "Terminée", ton: "vert" },
  annulee: { t: "Annulée", ton: "gris" },
};

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—");
const nb = (n: number) => n.toLocaleString("fr-FR");
const jour = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

export function Mailing({ campagnes, modeles, direction, relais, agent }: {
  campagnes: LigneCampagne[];
  modeles: MessageType[];
  direction: boolean;
  relais: boolean;
  agent: { id: string; nom: string; email?: string; telephone?: string };
}) {
  const router = useRouter();
  const [nouvelle, setNouvelle] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();

  const totaux = useMemo(() => {
    const envoyes = campagnes.reduce((s, c) => s + c.envoyes, 0);
    const reponses = campagnes.reduce((s, c) => s + c.reponses, 0);
    const desabo = campagnes.reduce((s, c) => s + c.desabonnes, 0);
    const enFile = campagnes.reduce((s, c) => s + c.enFile, 0);
    return { envoyes, reponses, desabo, enFile };
  }, [campagnes]);

  /* Le taux de réponse par public : c'est la question « qui répond ? » qui
     guide la campagne suivante. */
  const parPublic = useMemo(() => {
    const m = new Map<string, { campagnes: number; envoyes: number; reponses: number; desabo: number }>();
    for (const c of campagnes) {
      const k = publicDe(c.cible);
      const v = m.get(k) ?? { campagnes: 0, envoyes: 0, reponses: 0, desabo: 0 };
      v.campagnes += 1; v.envoyes += c.envoyes; v.reponses += c.reponses; v.desabo += c.desabonnes;
      m.set(k, v);
    }
    return [...m.entries()].sort((a, b) => b[1].envoyes - a[1].envoyes);
  }, [campagnes]);

  const agir = (f: () => Promise<{ ok: boolean; message: string }>) => start(async () => {
    setMsg(null);
    const r = await f().catch(() => ({ ok: false, message: "Le BO n'a pas répondu." }));
    setMsg({ ok: r.ok, t: r.message });
    router.refresh();
  });

  return (
    <div className="lst-page mlg">
      <div className="mlg-h">
        <h1 className="lst-title">Mailing</h1>
        <span className="sp" style={{ flex: 1 }} />
        {direction && (
          <button type="button" className="kgo" disabled={!relais} onClick={() => setNouvelle(true)}
            title={relais ? undefined : "La route d'envoi en masse (SendGrid) n'est pas configurée"}>
            <span className="ch">›</span> Nouvelle campagne
          </button>
        )}
      </div>
      <p className="rgl-aide">
        Des e-mails commerciaux à un public choisi : tous les clients, les vendeurs d&apos;un secteur, les
        acquéreurs notés A… La campagne part au fil de l&apos;eau par le relais d&apos;envoi en masse, sous
        le plafond du jour ; les réponses reviennent dans la boîte de l&apos;expéditeur et se comptent ici.
      </p>

      <div className="mlg-kpi">
        <div><span>Campagnes</span><b>{nb(campagnes.length)}</b></div>
        <div><span>E-mails envoyés</span><b>{nb(totaux.envoyes)}</b>{totaux.enFile > 0 && <i>{nb(totaux.enFile)} en file</i>}</div>
        <div><span>Taux de réponse</span><b>{pct(totaux.reponses, totaux.envoyes)}</b><i>{nb(totaux.reponses)} réponse{totaux.reponses > 1 ? "s" : ""}</i></div>
        <div><span>Désinscriptions</span><b>{nb(totaux.desabo)}</b><i>{pct(totaux.desabo, totaux.envoyes)}</i></div>
      </div>

      {parPublic.length > 0 && (
        <>
          <h2 className="fsub">Qui répond</h2>
          <div className="eqp-table">
            <table>
              <thead><tr><th>Public</th><th className="r">Campagnes</th><th className="r">Envoyés</th><th className="r">Réponses</th><th className="r">Taux</th><th className="r">Désinscrits</th></tr></thead>
              <tbody>
                {parPublic.map(([k, v]) => (
                  <tr key={k}>
                    <td><b>{k}</b></td><td className="r">{v.campagnes}</td><td className="r">{nb(v.envoyes)}</td>
                    <td className="r">{nb(v.reponses)}</td><td className="r"><b>{pct(v.reponses, v.envoyes)}</b></td>
                    <td className="r">{nb(v.desabo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="fsub">Campagnes</h2>
      {msg && <div className={`vs-msg${msg.ok ? "" : " ko"}`}>{msg.t}</div>}
      {campagnes.length === 0 ? (
        <div className="fempty">
          Aucune campagne pour l&apos;instant.
          {direction ? " « Nouvelle campagne » choisit le public, le message, et la programme." : ""}
        </div>
      ) : (
        <div className="eqp-table">
          <table className="mlg-t">
            <thead>
              <tr><th>Date</th><th>Campagne</th><th>Public</th><th>Avancement</th><th className="r">Réponses</th><th className="r">Désinscrits</th><th /></tr>
            </thead>
            <tbody>
              {campagnes.map((c) => {
                const ouvert = ouverte === c.id;
                const fait = c.envoyes + c.echecs;
                return (
                  <Fragment key={c.id}>
                    <tr className={ouvert ? "on" : undefined}>
                      <td className="mlg-d">{jour(c.creeLe)}</td>
                      <td>
                        <button type="button" className="mlg-nom" onClick={() => setOuverte(ouvert ? null : c.id)}>
                          <b>{c.libelle}</b>
                          {c.objet && c.objet !== c.libelle && <span>{c.objet}</span>}
                        </button>
                      </td>
                      <td><span className="mlg-pub">{publicDe(c.cible)}</span>{c.resume && <span className="mlg-res" title={c.resume}>{c.resume}</span>}</td>
                      <td>
                        <span className="mlg-av">
                          <Pastille ton={STATUT[c.statut].ton}>{STATUT[c.statut].t}</Pastille>
                          <span>{nb(fait)} / {nb(c.total)}</span>
                        </span>
                        {c.statut !== "envoyee" && c.total > 0 && (
                          <span className="mlg-bar"><i style={{ width: `${Math.round((fait / c.total) * 100)}%` }} /></span>
                        )}
                        {c.echecs > 0 && <span className="mlg-ko">{nb(c.echecs)} échec{c.echecs > 1 ? "s" : ""}</span>}
                      </td>
                      <td className="r"><b>{nb(c.reponses)}</b><span className="mlg-pct">{pct(c.reponses, c.envoyes)}</span></td>
                      <td className="r">{nb(c.desabonnes)}</td>
                      <td className="eqp-a">
                        {direction && c.statut === "en_cours" && (
                          <button type="button" className="fadd" disabled={pending} onClick={() => agir(() => suspendreCampagne(c.id))}>Pause</button>
                        )}
                        {direction && c.statut === "suspendue" && (
                          <button type="button" className="fadd" disabled={pending} onClick={() => agir(() => reprendreCampagne(c.id))}>Reprendre</button>
                        )}
                        {direction && (c.statut === "en_cours" || c.statut === "suspendue") && (
                          <button type="button" className="fadd eqp-couper" disabled={pending}
                            onClick={() => agir(() => annulerCampagne(c.id))}>Arrêter</button>
                        )}
                      </td>
                    </tr>
                    {ouvert && (
                      <tr className="mlg-det-l"><td colSpan={7}><Detail c={c} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {nouvelle && (
        <FenetreSalve campagne agent={agent} modeles={modeles} onClose={() => setNouvelle(false)}
          onProgramme={() => router.refresh()} />
      )}
    </div>
  );
}

type Filtre = "tous" | "reponses" | "echecs" | "desabo" | "file";

function Detail({ c }: { c: LigneCampagne }) {
  const [liste, setListe] = useState<DestinataireCampagne[] | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  useEffect(() => {
    let vivant = true;
    chargerDestinataires(c.id)
      .then((l) => { if (vivant) setListe(l); })
      .catch(() => { if (vivant) setListe([]); });
    return () => { vivant = false; };
  }, [c.id]);
  const vus = (liste ?? []).filter((d) =>
    filtre === "reponses" ? !!d.reponse
      : filtre === "echecs" ? d.statut === "echec"
      : filtre === "desabo" ? !!d.desabonne
      : filtre === "file" ? d.statut === "a_envoyer"
      : true);
  const n = (f: Filtre) => (liste ?? []).filter((d) =>
    f === "reponses" ? !!d.reponse : f === "echecs" ? d.statut === "echec" : f === "desabo" ? !!d.desabonne
      : f === "file" ? d.statut === "a_envoyer" : true).length;
  return (
    <div className="mlg-det">
      <div className="mlg-msg">
        <span className="mlab">Objet</span>
        <b>{c.objet}</b>
        <span className="mlab">Message (avant fusion)</span>
        <pre>{c.corps}</pre>
        {c.agent && <span className="mhint">Expéditeur : {c.agent} — les réponses arrivent dans sa boîte.</span>}
      </div>
      <div className="mlg-dest">
        <div className="seg">
          {([["tous", "Tous"], ["reponses", "Ont répondu"], ["echecs", "Échecs"], ["desabo", "Désinscrits"], ["file", "En file"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={filtre === k ? "on" : undefined} onClick={() => setFiltre(k)}>
              {l} <i>{liste ? n(k) : "…"}</i>
            </button>
          ))}
        </div>
        {!liste ? <div className="fempty">Chargement…</div> : vus.length === 0 ? <div className="fempty">Personne ici.</div> : (
          <div className="mlg-dest-l">
            {vus.slice(0, 300).map((d) => (
              <div key={d.email} className="mlg-dl">
                <span className="nm">{d.contactId ? <a href={`/contact/${d.contactId}`}>{d.nom || d.email}</a> : (d.nom || d.email)}</span>
                <span className="em">{d.email}</span>
                <span className="st">
                  {d.reponse ? <Pastille ton="vert" titre={d.reponse.objet}>A répondu le {jour(d.reponse.le)}</Pastille>
                    : d.desabonne ? <Pastille ton="gris">Désinscrit le {jour(d.desabonne)}</Pastille>
                    : d.statut === "echec" ? <Pastille ton="rouge" titre={d.erreur}>Échec</Pastille>
                    : d.statut === "a_envoyer" ? <Pastille ton="bleu">En file</Pastille>
                    : d.statut === "retire" ? <Pastille ton="gris">Retiré</Pastille>
                    : <span className="mhint">Envoyé le {jour(d.envoyeLe)}</span>}
                </span>
              </div>
            ))}
            {vus.length > 300 && <div className="mhint">… et {vus.length - 300} autres.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
