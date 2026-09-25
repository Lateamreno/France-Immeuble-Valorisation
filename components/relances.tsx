"use client";

/**
 * L'écran Relances — la relance hebdomadaire, groupée PAR CLIENT.
 *
 * MAV : « si par exemple on est en retard d'une relance sur un immeuble pour un
 * client, mais deux pour un autre client et trois pour encore un autre, on
 * clique sur ce bouton relance, il nous dit voici quels immeubles sont
 * actuellement à relancer parmi tous vos acquéreurs, et ça envoie un e-mail
 * avec tous les immeubles qu'on lui a envoyés et ça demande des réponses pour
 * chaque immeuble. Cela permettrait d'éviter d'envoyer trois e-mails le même
 * jour à un client pour trois relances d'immeubles différents. »
 *
 * D'où l'unité de travail de cet écran : LE CLIENT, jamais l'immeuble. Une
 * carte par personne, ses dossiers en attente dedans, un message qui les liste
 * tous et demande une réponse pour chacun.
 *
 * Doctrine §7.1 : l'application prépare, l'agent envoie. Le bouton « Tout
 * envoyer » est bien un envoi réel, mais il n'existe qu'après la liste, les
 * messages relisibles et une confirmation qui redit combien de personnes vont
 * recevoir quoi. Rien ne part tout seul.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  PLAFOND_RELANCES, messageRelance, objetRelance,
  type BilanRelances, type ClientRelance,
} from "@/lib/bo/relances";
import { couperRelancesLot, envoyerRelances, marquerRelances, relancesDues } from "@/lib/bo/relances-actions";
import { Modale } from "@/components/modale";
import { PuceImmeuble } from "@/components/puce-immeuble";

const jrs = (j?: number) => (j === undefined ? "date inconnue" : j >= 999 ? "jamais relancé" : `${j} j`);

export function EcranRelances({ agent }: { agent?: { id?: string; nom?: string; tel?: string } }) {
  /* Le bilan garde la fenêtre sur laquelle il a été calculé : changer de
     fenêtre le périme sans qu'on ait à le remettre à zéro pendant l'effet —
     un setState synchrone dans un effet relance un rendu pour rien. */
  const [charge, setCharge] = useState<{ f: number; b: BilanRelances } | null>(null);
  const [fenetre, setFenetre] = useState(90);
  const bilan = charge && charge.f === fenetre ? charge.b : null;
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /* Les retouches de l'agent vivent ICI et non dans chaque carte : le bouton
     « Tout envoyer » doit expédier exactement ce qui est à l'écran, dossiers
     retirés compris. Une carte qui garderait son propre état enverrait le
     message d'origine — le pire des mensonges d'interface. */
  const [retires, setRetires] = useState<Set<string>>(new Set());
  const [textes, setTextes] = useState<Record<string, string>>({});
  const [salve, setSalve] = useState(false);
  const [rapport, setRapport] = useState<string | null>(null);

  const recharger = async (f = fenetre) => setCharge({ f, b: await relancesDues(7, f) });

  useEffect(() => {
    let vivant = true;
    relancesDues(7, fenetre)
      .then((b) => { if (vivant) setCharge({ f: fenetre, b }); })
      .catch(() => { if (vivant) setErreur("La liste des relances n'a pas pu être chargée."); });
    return () => { vivant = false; };
  }, [fenetre]);

  /* Ce qui part vraiment : les clients qui gardent au moins un dossier. */
  const envois = useMemo(() => {
    if (!bilan) return [];
    return bilan.clients
      .map((c) => ({ ...c, immeubles: c.immeubles.filter((i) => !retires.has(i.propositionId)) }))
      .filter((c) => c.immeubles.length > 0)
      .map((c) => ({
        contactId: c.contactId,
        email: c.email,
        objet: objetRelance(c),
        corps: textes[c.contactId] ?? messageRelance(c, agent),
        propositionIds: c.immeubles.flatMap((i) => [i.propositionId, ...i.autresIds]),
        dossiers: c.immeubles.length,
      }));
  }, [bilan, retires, textes, agent]);

  const total = useMemo(() => envois.reduce((s, e) => s + e.dossiers, 0), [envois]);

  return (
    <div className="wrap">
      <div className="rlz-h">
        <div>
          <h1 className="rlz-t">Relances</h1>
          <p className="rlz-s">
            Un e-mail par personne, tous ses dossiers dedans. Un acquéreur à qui l&apos;on doit
            trois relances n&apos;en reçoit pas trois.
          </p>
        </div>
        <label className="rlz-fen">
          Dossiers envoyés depuis moins de
          <select value={fenetre} onChange={(e) => setFenetre(Number(e.target.value))}>
            <option value={30}>30 jours</option>
            <option value={90}>90 jours</option>
            <option value={365}>1 an</option>
            <option value={3650}>tout l&apos;historique</option>
          </select>
        </label>
      </div>

      {!bilan && !erreur && <div className="fempty">Lecture des propositions en attente…</div>}
      {erreur && <div className="fempty">{erreur}</div>}

      {bilan && (
        <>
          <div className="rlz-tuiles">
            <Tuile k="Clients à relancer" v={String(envois.length)} />
            <Tuile k="Dossiers en attente" v={String(total)} />
            <Tuile k="E-mails à envoyer" v={String(envois.length)} vert />
            <Tuile
              k="E-mails évités par le groupage"
              v={String(Math.max(0, total - envois.length))}
            />
          </div>

          {envois.length > 0 && (
            <div className="rlz-bar">
              <div>
                <b>{envois.length} personne{envois.length > 1 ? "s" : ""}</b> à relancer sur{" "}
                <b>{total} dossier{total > 1 ? "s" : ""}</b>.
                {envois.length > PLAFOND_RELANCES && (
                  <> Envoi par paquets de {PLAFOND_RELANCES} — les messages partent de votre
                  boîte, une rafale plus large la ferait brider pour la journée.</>
                )}
              </div>
              <span className="sp" style={{ flex: 1 }} />
              <button className="kgo" type="button" disabled={pending} onClick={() => setSalve(true)}>
                <span className="ch">›</span> Tout relancer ({Math.min(envois.length, PLAFOND_RELANCES)})
              </button>
            </div>
          )}

          {rapport && <div className="rlz-rapport">{rapport}</div>}

          {/* L'arriéré. On le montre plutôt que de le taire : il vaut décision,
              pas découverte au détour d'un envoi. */}
          {bilan.horsFenetre.propositions > 0 && (
            <div className="rlz-arr">
              <b>{bilan.horsFenetre.propositions.toLocaleString("fr-FR")} propositions</b> plus
              anciennes que la fenêtre, chez{" "}
              <b>{bilan.horsFenetre.clients.toLocaleString("fr-FR")} acquéreurs</b>, ne sont pas
              dans cette liste. Écrire à quelqu&apos;un pour un dossier envoyé il y a trois ans
              n&apos;est pas une relance : élargissez la fenêtre en connaissance de cause.
            </div>
          )}

          {envois.length === 0 && (
            <div className="fempty">Personne à relancer sur cette fenêtre. Rien à faire aujourd&apos;hui.</div>
          )}

          {bilan.clients.map((c) => (
            <CarteClient
              key={c.contactId} c={c} agent={agent} pending={pending}
              retires={retires}
              onRetirer={(id) => setRetires((s) => {
                const n = new Set(s);
                if (n.has(id)) n.delete(id); else n.add(id);
                return n;
              })}
              texte={textes[c.contactId]}
              onTexte={(t) => setTextes((m) => {
                if (t === null) { const n = { ...m }; delete n[c.contactId]; return n; }
                return { ...m, [c.contactId]: t };
              })}
              onMarquer={(ids) => start(async () => {
                await marquerRelances(ids);
                await recharger();
              })}
              onCouper={(ids) => start(async () => {
                await couperRelancesLot(ids, true);
                await recharger();
              })}
            />
          ))}
        </>
      )}

      {salve && (
        <ModaleSalve
          envois={envois} agent={agent} pending={pending}
          onFermer={() => setSalve(false)}
          onEnvoyer={() => start(async () => {
            setSalve(false);
            setRapport(null);
            try {
              const r = await envoyerRelances(envois, agent?.id);
              setRapport(
                `${r.envoyes} relance${r.envoyes > 1 ? "s" : ""} envoyée${r.envoyes > 1 ? "s" : ""}`
                + (r.echecs ? ` · ${r.echecs} échec${r.echecs > 1 ? "s" : ""} : ${r.journal.slice(0, 3).join(" · ")}` : "")
                + (r.restants ? ` · ${r.restants} en attente du prochain paquet` : ""),
              );
            } catch (e) {
              setRapport(e instanceof Error ? e.message : "L'envoi a échoué.");
            }
            await recharger();
          })}
        />
      )}
    </div>
  );
}

/** La confirmation avant la salve : qui, combien, et par quelle boîte. */
function ModaleSalve({ envois, agent, pending, onFermer, onEnvoyer }: {
  envois: { email: string; dossiers: number }[];
  agent?: { nom?: string };
  pending: boolean;
  onFermer: () => void;
  onEnvoyer: () => void;
}) {
  const lot = envois.slice(0, PLAFOND_RELANCES);
  const dossiers = lot.reduce((s, e) => s + e.dossiers, 0);
  return (
    <Modale
      titre={`Envoyer ${lot.length} relance${lot.length > 1 ? "s" : ""}`}
      onFermer={onFermer}
      largeur={560}
      pied={
        <>
          <button className="fadd" type="button" onClick={onFermer}>Annuler</button>
          <span className="sp" style={{ flex: 1 }} />
          <button className="kgo" type="button" disabled={pending} onClick={onEnvoyer}>
            <span className="ch">›</span> Envoyer maintenant
          </button>
        </>
      }
    >
      <div className="asst-note">
        <b>{lot.length} message{lot.length > 1 ? "s" : ""}</b>, un par personne, couvrant{" "}
        <b>{dossiers} dossier{dossiers > 1 ? "s" : ""}</b>. Ils partent de la boîte
        de {agent?.nom ?? "l'agent"}, un à un, et chaque proposition n&apos;est marquée
        relancée que si son message est bien parti.
        {envois.length > lot.length && (
          <> Les {envois.length - lot.length} restantes attendront un second clic.</>
        )}
      </div>
      <span className="mlab">Destinataires</span>
      <div className="rlz-dest">
        {lot.slice(0, 12).map((e) => (
          <span key={e.email}>{e.email} <i>{e.dossiers}</i></span>
        ))}
        {lot.length > 12 && <span className="pl">et {lot.length - 12} autres…</span>}
      </div>
    </Modale>
  );
}

function Tuile({ k, v, vert }: { k: string; v: string; vert?: boolean }) {
  return (
    <div className={`rlz-tuile${vert ? " vert" : ""}`}>
      <b>{v}</b>
      <span>{k}</span>
    </div>
  );
}

function CarteClient({
  c, agent, pending, retires, onRetirer, texte, onTexte, onMarquer, onCouper,
}: {
  c: ClientRelance;
  agent?: { nom?: string; tel?: string };
  pending: boolean;
  retires: Set<string>;
  onRetirer: (propositionId: string) => void;
  texte?: string;
  onTexte: (t: string | null) => void;
  onMarquer: (ids: string[]) => void;
  onCouper: (propositionIds: string[]) => void;
}) {
  /* Le message est PROPOSÉ, pas imposé : l'agent le retouche avant d'envoyer.
     Il se recompose si l'on retire un dossier du lot. */
  const retenus = useMemo(
    () => ({ ...c, immeubles: c.immeubles.filter((i) => !retires.has(i.propositionId)) }),
    [c, retires],
  );
  const message = texte ?? messageRelance(retenus, agent);
  const objet = objetRelance(retenus);
  /* On marque AUSSI les lignes jumelles du même immeuble : sans ça, le dossier
     revient dès la semaine suivante par sa doublure, et l'agent croit à un
     bug. */
  const ids = retenus.immeubles.flatMap((i) => [i.propositionId, ...i.autresIds]);
  const [ouvert, setOuvert] = useState(false);

  if (retenus.immeubles.length === 0) return null;

  return (
    <div className="rlz-c">
      <div className="rlz-c-h">
        <span className="rlz-av">{initiales(c.nom)}</span>
        <div className="rlz-c-id">
          <a href={`/contact/${c.contactId}`} target="_blank" rel="noreferrer">{c.nom} ↗</a>
          <span>{c.email}</span>
        </div>
        <span className={`rlz-age${c.joursMax >= 30 ? " chaud" : ""}`}>
          {retenus.immeubles.length} dossier{retenus.immeubles.length > 1 ? "s" : ""} · le plus ancien {jrs(c.joursMax)}
        </span>
        <button type="button" className="fadd" onClick={() => setOuvert(!ouvert)}>
          {ouvert ? "Masquer le message" : "Voir le message"}
        </button>
      </div>

      <div className="rlz-lignes">
        {c.immeubles.map((i) => {
          const off = retires.has(i.propositionId);
          return (
            <div key={i.propositionId} className={`rlz-l${off ? " off" : ""}`}>
              <PuceImmeuble nouvelOnglet id={i.immeubleId} libelle={i.libelle} petit plat />
              {i.prix && <span className="rlz-prix">{i.prix}</span>}
              <span className="rlz-j">{jrs(i.jours)}</span>
              <span className="sp" style={{ flex: 1 }} />
              <button type="button" className="rlz-x"
                title={off ? "Remettre dans cet envoi" : "Retirer de cet envoi (sans couper les relances)"}
                onClick={() => onRetirer(i.propositionId)}>{off ? "remettre" : "retirer"}</button>
              <button type="button" className="rlz-x rouge" disabled={pending}
                title="Ne plus jamais relancer cette personne sur ce dossier"
                onClick={() => onCouper([i.propositionId, ...i.autresIds])}>couper</button>
            </div>
          );
        })}
      </div>

      {ouvert && (
        <div className="rlz-msg">
          <span className="mlab">Objet</span>
          <input className="min" readOnly value={objet} />
          <span className="mlab">Message</span>
          <textarea className="min" rows={12} value={message} onChange={(e) => onTexte(e.target.value)} />
          <div className="mrow">
            <button type="button" className="fadd" onClick={() => onTexte(null)}>
              Revenir au message proposé
            </button>
            <button type="button" className="fadd" onClick={() => navigator.clipboard?.writeText(message)}>
              Copier le message
            </button>
          </div>
        </div>
      )}

      <div className="rlz-c-f">
        <a className="fadd"
          href={`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(message)}`}>
          Ouvrir dans le client mail
        </a>
        <span className="sp" style={{ flex: 1 }} />
        <button className="kgo" type="button" disabled={pending} onClick={() => onMarquer(ids)}>
          <span className="ch">›</span> Marquer relancé ({retenus.immeubles.length})
        </button>
      </div>
    </div>
  );
}

function initiales(nom: string) {
  return nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? "").join("") || "?";
}
