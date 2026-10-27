"use client";

/* Suivi de la vente (MAV, 27/10, retour #549) : les jalons, les parties — dont
 * les notaires de chacun —, et les e-mails échangés avec elles, à l'envoi
 * comme à la réception. Le moteur est dans lib/bo/vente.ts ; les e-mails sont
 * cherchés à l'ouverture de la section, dans la boîte de l'agent du bien.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { ContactPicker } from "@/components/contact-picker";
import { BarreEnregistrer } from "@/components/barre-enregistrer";
import { Pastille } from "@/components/pastille";
import type { DonneesVente, Echange, Partie, RolePartie } from "@/lib/bo/vente";
import type { MessageComplet } from "@/lib/mails/client";
import {
  chargerEchanges, chargerVente, choisirNotaire, enregistrerJalons, ouvrirEchange,
} from "@/lib/bo/vente-actions";

const LIBELLE: Record<RolePartie, string> = {
  vendeur: "Vendeur", acquereur: "Acquéreur",
  notaire_vendeur: "Notaire du vendeur", notaire_acquereur: "Notaire de l'acquéreur",
};
const jour = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : undefined);
const dateInput = (iso?: string) => (iso ? iso.slice(0, 10) : "");
const euros = (n?: number) => (n ? `${Math.round(n).toLocaleString("fr-FR")} €` : undefined);

export function SuiviVente({ immeubleId }: { immeubleId: string }) {
  const [d, setD] = useState<DonneesVente | null | undefined>(undefined);
  const [tour, setTour] = useState(0);
  useEffect(() => {
    let vivant = true;
    chargerVente(immeubleId).then((v) => { if (vivant) setD(v); }).catch(() => { if (vivant) setD(null); });
    return () => { vivant = false; };
  }, [immeubleId, tour]);
  const recharger = () => setTour((t) => t + 1);

  if (d === undefined) return <div className="fempty">Chargement du suivi de la vente…</div>;
  if (d === null) return <div className="fempty">Le suivi de la vente n&apos;a pas pu être lu.</div>;
  if (!d.ouverte) {
    return (
      <div className="fempty">
        Le suivi de la vente s&apos;ouvre à la signature du mandat, et se complète quand une offre est acceptée.
      </div>
    );
  }
  return (
    <div className="sv2">
      <Jalons d={d} immeubleId={immeubleId} onFait={recharger} />
      <Parties d={d} immeubleId={immeubleId} onFait={recharger} />
      <Echanges d={d} immeubleId={immeubleId} />
    </div>
  );
}

/* ------------------------------------------------------------- Les jalons */

function Jalons({ d, immeubleId, onFait }: { d: DonneesVente; immeubleId: string; onFait: () => void }) {
  const o = d.offre;
  const [compromis, setCompromis] = useState(dateInput(o?.dateCompromis));
  const [acte, setActe] = useState(dateInput(o?.dateActe));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const modifie = !!o && (compromis !== dateInput(o.dateCompromis) || acte !== dateInput(o.dateActe));
  const vendu = o?.statut === "Vendu";
  const etapes = [
    { t: "Mandat signé", fait: !!d.mandat, detail: d.mandat ? [d.mandat.numero && `n° ${d.mandat.numero}`, jour(d.mandat.signeLe)].filter(Boolean).join(" · ") : "—" },
    { t: "Offre acceptée", fait: !!o, detail: o ? [euros(o.prixHai), jour(o.date)].filter(Boolean).join(" · ") : "En attente d'une offre" },
    { t: "Compromis", fait: !!o?.dateCompromis && new Date(o.dateCompromis) <= new Date(), detail: o?.dateCompromis ? jour(o.dateCompromis) : "À programmer" },
    { t: "Acte authentique", fait: !!o?.dateActe && new Date(o.dateActe) <= new Date(), detail: o?.dateActe ? jour(o.dateActe) : "À programmer" },
    { t: "Vendu", fait: vendu, detail: vendu ? "Honoraires dus à l'acte" : "—" },
  ];
  return (
    <section>
      <h3 className="fsub">Où en est la vente</h3>
      <ol className="sv2-frise">
        {etapes.map((e, i) => (
          <li key={e.t} className={e.fait ? "fait" : etapes.slice(0, i).every((x) => x.fait) ? "cours" : undefined}>
            <b>{e.t}</b><span>{e.detail}</span>
          </li>
        ))}
      </ol>
      {o && (
        <div className="sv2-dates">
          <label>
            <span>Date du compromis</span>
            <input type="date" className="min" value={compromis} onChange={(e) => setCompromis(e.target.value)} />
          </label>
          <label>
            <span>Date de l&apos;acte authentique</span>
            <input type="date" className="min" value={acte} onChange={(e) => setActe(e.target.value)} />
          </label>
          <span className="mhint">Offre « {o.statut} »{o.acheteurNom ? ` de ${o.acheteurNom}` : ""}. Ces dates alimentent le tableau de bord et le récit de vente.</span>
          {msg && <span className="mhint">{msg}</span>}
        </div>
      )}
      {o && (
        <BarreEnregistrer modifie={modifie} pending={pending}
          onAnnuler={() => { setCompromis(dateInput(o.dateCompromis)); setActe(dateInput(o.dateActe)); }}
          onEnregistrer={() => start(async () => {
            const r = await enregistrerJalons(immeubleId, o.id, {
              dateCompromis: compromis !== dateInput(o.dateCompromis) ? compromis || null : undefined,
              dateActe: acte !== dateInput(o.dateActe) ? acte || null : undefined,
            }).catch(() => ({ ok: false, message: "Le BO n'a pas répondu." }));
            setMsg(r.message);
            if (r.ok) onFait();
          })} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------ Les parties */

function CartePartie({ p }: { p: Partie }) {
  return (
    <div className="sv2-p">
      <span className="sv2-role">{LIBELLE[p.role]}</span>
      <b>{p.contactId ? <a href={`/contact/${p.contactId}`}>{p.nom}</a> : p.nom}</b>
      {p.societe && p.societe !== p.nom && <span>{p.societe}</span>}
      {p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span className="mhint">Pas d&apos;e-mail : ses échanges ne peuvent pas être retrouvés.</span>}
      {p.tel && <a href={`tel:${p.tel.replace(/[^\d+]/g, "")}`}>{p.tel}</a>}
    </div>
  );
}

function Parties({ d, immeubleId, onFait }: { d: DonneesVente; immeubleId: string; onFait: () => void }) {
  const [choix, setChoix] = useState<"vendeur" | "acquereur" | null>(null);
  const [pending, start] = useTransition();
  const de = (r: RolePartie) => d.parties.filter((p) => p.role === r);
  const notaire = (cote: "vendeur" | "acquereur") => {
    const p = de(cote === "vendeur" ? "notaire_vendeur" : "notaire_acquereur")[0];
    return (
      <div className={`sv2-p${p ? "" : " vide"}`}>
        <span className="sv2-role">{cote === "vendeur" ? "Notaire du vendeur" : "Notaire de l'acquéreur"}</span>
        {p ? (
          <>
            <b>{p.contactId ? <a href={`/contact/${p.contactId}`}>{p.nom}</a> : p.nom}</b>
            {p.societe && p.societe !== p.nom && <span>{p.societe}</span>}
            {p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span className="mhint">Pas d&apos;e-mail sur sa fiche.</span>}
            {p.tel && <a href={`tel:${p.tel.replace(/[^\d+]/g, "")}`}>{p.tel}</a>}
            <span className="sv2-act">
              <button type="button" className="fadd" disabled={pending} onClick={() => setChoix(cote)}>Changer</button>
              <button type="button" className="fadd" disabled={pending}
                onClick={() => start(async () => { await choisirNotaire(immeubleId, cote, null); onFait(); })}>Retirer</button>
            </span>
          </>
        ) : (
          <button type="button" className="fadd" disabled={pending} onClick={() => setChoix(cote)}>+ Choisir le notaire</button>
        )}
      </div>
    );
  };
  return (
    <section>
      <h3 className="fsub">Les parties</h3>
      <div className="sv2-parties">
        <div className="sv2-col">
          {de("vendeur").length ? de("vendeur").map((p, i) => <CartePartie key={`v${i}`} p={p} />)
            : <div className="sv2-p vide"><span className="sv2-role">Vendeur</span><span className="mhint">Aucun propriétaire sur la fiche.</span></div>}
          {notaire("vendeur")}
        </div>
        <div className="sv2-col">
          {de("acquereur").length ? de("acquereur").map((p, i) => <CartePartie key={`a${i}`} p={p} />)
            : <div className="sv2-p vide"><span className="sv2-role">Acquéreur</span><span className="mhint">Il apparaît dès qu&apos;une offre est acceptée.</span></div>}
          {notaire("acquereur")}
        </div>
      </div>
      {choix && (
        <ContactPicker
          titre={choix === "vendeur" ? "Le notaire du vendeur" : "Le notaire de l'acquéreur"}
          libelleValider="Choisir ce notaire"
          onAnnuler={() => setChoix(null)}
          onValider={(c) => start(async () => {
            await choisirNotaire(immeubleId, choix, c.id);
            setChoix(null);
            onFait();
          })}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------ Les échanges */

type FiltreEch = "tous" | "notaires" | "vendeurs" | "acquereurs";

function Echanges({ d, immeubleId }: { d: DonneesVente; immeubleId: string }) {
  const [r, setR] = useState<Awaited<ReturnType<typeof chargerEchanges>> | null>(null);
  const [filtre, setFiltre] = useState<FiltreEch>("tous");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageComplet | { erreur: string } | null>(null);
  const [tour, setTour] = useState(0);
  const cles = d.parties.map((p) => p.email).filter(Boolean).join(",");
  useEffect(() => {
    let vivant = true;
    chargerEchanges(immeubleId)
      .then((x) => { if (vivant) setR(x); })
      .catch(() => { if (vivant) setR({ ok: false, erreur: "Le BO n'a pas répondu." }); });
    return () => { vivant = false; };
  }, [immeubleId, cles, tour]);

  const liste = useMemo(() => {
    if (!r?.ok) return [];
    return r.echanges.filter((e) => filtre === "tous" || e.avec.some((a) =>
      filtre === "notaires" ? a.role.startsWith("notaire") : filtre === "vendeurs" ? a.role === "vendeur" : a.role === "acquereur"));
  }, [r, filtre]);

  const ouvrir = (e: Echange) => {
    const k = `${e.dossier}:${e.uid}`;
    if (ouvert === k) { setOuvert(null); return; }
    setOuvert(k); setMessage(null);
    ouvrirEchange(immeubleId, e.dossier, e.uid)
      .then((x) => setMessage(x.ok ? x.message : { erreur: x.erreur }))
      .catch(() => setMessage({ erreur: "Le BO n'a pas répondu." }));
  };

  const sansEmail = d.parties.filter((p) => !p.email);
  return (
    <section>
      <div className="sv2-eh">
        <h3 className="fsub">Les échanges</h3>
        <span className="sp" style={{ flex: 1 }} />
        <div className="seg">
          {([["tous", "Tous"], ["notaires", "Notaires"], ["vendeurs", "Vendeurs"], ["acquereurs", "Acquéreurs"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={filtre === k ? "on" : undefined} onClick={() => setFiltre(k)}>{l}</button>
          ))}
        </div>
        <button type="button" className="fadd" onClick={() => { setR(null); setTour((t) => t + 1); }}>Actualiser</button>
      </div>
      <p className="mhint">
        Les e-mails reçus de ces adresses et ceux qui leur ont été envoyés, depuis la signature du mandat
        {r?.ok && r.boite ? <>, dans la boîte <b>{r.boite}</b></> : ""}.
        {sansEmail.length > 0 && ` ${sansEmail.map((p) => p.nom).join(", ")} : pas d'adresse, rien à chercher.`}
      </p>
      {!r ? <div className="fempty">Recherche dans la boîte e-mail…</div>
        : !r.ok ? <div className="dif-avis">{r.erreur}</div>
        : liste.length === 0 ? <div className="fempty">Aucun échange trouvé avec ces adresses.</div>
        : (
          <div className="sv2-ech">
            {liste.map((e) => {
              const k = `${e.dossier}:${e.uid}`;
              return (
                <div key={k} className={`sv2-m${ouvert === k ? " on" : ""}`}>
                  <button type="button" className="sv2-ml" onClick={() => ouvrir(e)}>
                    <span className={`sv2-dir ${e.dossier}`} title={e.dossier === "reception" ? "Reçu" : "Envoyé"}>
                      {e.dossier === "reception" ? "↙" : "↗"}
                    </span>
                    <span className="sv2-dt">{jour(e.date)}</span>
                    <span className="sv2-avec">
                      {e.avec.map((a) => <Pastille key={a.role + a.nom} ton={a.role.startsWith("notaire") ? "bleu" : "gris"}>{LIBELLE[a.role]}</Pastille>)}
                    </span>
                    <span className="sv2-obj"><b>{e.objet}</b><i>{e.extrait}</i></span>
                    {e.pj > 0 && <span className="sv2-pj" title={`${e.pj} pièce${e.pj > 1 ? "s" : ""} jointe${e.pj > 1 ? "s" : ""}`}>📎 {e.pj}</span>}
                  </button>
                  {ouvert === k && (
                    <div className="sv2-corps">
                      {!message ? <span className="mhint">Ouverture…</span>
                        : "erreur" in message ? <span className="dif-avis">{message.erreur}</span>
                        : (
                          <>
                            <span className="mhint">
                              De {message.deNom ? `${message.deNom} <${message.de}>` : message.de} · à {message.pour.join(", ")}
                            </span>
                            <pre>{message.corps}</pre>
                            {message.pieces.length > 0 && (
                              <span className="mhint">Pièces jointes : {message.pieces.map((p) => p.nom).join(", ")} — à ouvrir depuis Mails.</span>
                            )}
                          </>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </section>
  );
}
