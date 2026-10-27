"use client";

/**
 * L'équipe et ses accès au BO (MAV, 27/10 : « séparer la partie admin gérée
 * par moi avec les menus permettant de créer les agents »).
 *
 * La direction ouvre un accès : l'agent reçoit un lien et choisit lui-même son
 * mot de passe — personne d'autre ne le connaît. Couper un accès le ferme tout
 * de suite, même sur un poste resté connecté.
 */
import { useState, useTransition } from "react";
import { Modale } from "@/components/modale";
import { Pastille } from "@/components/pastille";
import { changerActif, changerRole, creerAgent, inviterAgent } from "@/lib/auth/actions";
import type { Role } from "@/lib/auth/jeton";

export type LigneEquipe = {
  agentId: string;
  nom: string;
  /** L'agent est encore dans la maison (fiche agent active). */
  actifBo: boolean;
  compte: {
    id: string; email: string; role: Role; actif: boolean;
    /** Le lien d'accès est parti au moins une fois. */
    invite: boolean;
    /** Le mot de passe a été choisi : l'agent s'est déjà connecté. */
    active: boolean;
    derniere: string | null;
    moi: boolean;
  } | null;
};

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "jamais");

export function Equipe({ lignes }: { lignes: LigneEquipe[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [anciens, setAnciens] = useState(false);
  const [pending, start] = useTransition();
  const agir = (f: () => Promise<{ ok: boolean; message: string }>) => start(async () => {
    setMsg(null);
    const r = await f().catch(() => ({ ok: false, message: "Le BO n'a pas répondu." }));
    setMsg({ ok: r.ok, t: r.message });
  });

  const visibles = lignes.filter((l) => anciens || l.compte || l.actifBo);

  return (
    <section className="eqp">
      <div className="eqp-h">
        <h2 className="fsub">L&apos;équipe et ses accès</h2>
        <button type="button" className="kgo" onClick={() => setNouveau(true)}><span className="ch">›</span> Nouvel agent</button>
      </div>
      <p className="rgl-aide">
        Chacun a son mot de passe, qu&apos;il choisit lui-même depuis le lien reçu par e-mail. La{" "}
        <b>direction</b> voit et règle tout ; un <b>agent</b>{" "}travaille sur tous les dossiers, mais ne
        transfère que les siens, n&apos;annule que ses propres mandats, n&apos;exporte rien et soumet les récits
        de vente à votre relecture.
      </p>
      <div className="eqp-table">
        <table>
          <thead>
            <tr><th>Agent</th><th>Accès</th><th>Rôle</th><th>Dernière connexion</th><th /></tr>
          </thead>
          <tbody>
            {visibles.map((l) => {
              const c = l.compte;
              return (
                <tr key={l.agentId} className={!l.actifBo && !c ? "eqp-ancien" : undefined}>
                  <td><b>{l.nom}</b>{c && <span className="eqp-mail">{c.email}</span>}</td>
                  <td>
                    {!c ? <Pastille ton="gris">Pas d&apos;accès</Pastille>
                      : !c.actif ? <Pastille ton="rouge">Coupé</Pastille>
                      : c.active ? <Pastille ton="vert">Actif</Pastille>
                      : c.invite ? <Pastille ton="orange" titre="Le lien a été envoyé ; le mot de passe n'est pas encore choisi">Invité</Pastille>
                      : <Pastille ton="gris" titre="Le compte existe ; aucun lien n'est encore parti">À inviter</Pastille>}
                  </td>
                  <td>
                    {c ? (
                      <select value={c.role} disabled={pending || c.moi}
                        title={c.moi ? "Vous ne changez pas votre propre rôle" : undefined}
                        onChange={(e) => agir(() => changerRole(c.id, e.target.value as Role))}>
                        <option value="direction">Direction</option>
                        <option value="agent">Agent</option>
                      </select>
                    ) : "—"}
                  </td>
                  <td>{c ? date(c.derniere) : "—"}</td>
                  <td className="eqp-a">
                    {!c && l.actifBo && (
                      <button type="button" className="fadd" disabled={pending} onClick={() => agir(() => inviterAgent(l.agentId))}>Ouvrir l&apos;accès</button>
                    )}
                    {c && c.actif && (
                      <button type="button" className="fadd" disabled={pending} onClick={() => agir(() => inviterAgent(l.agentId))}
                        title="Envoie un lien pour choisir (ou rechoisir) son mot de passe">
                        {c.active ? "Renvoyer un lien" : c.invite ? "Renvoyer l'invitation" : "Envoyer l'invitation"}
                      </button>
                    )}
                    {c && !c.moi && (
                      <button type="button" className={`fadd${c.actif ? " eqp-couper" : ""}`} disabled={pending}
                        onClick={() => agir(() => changerActif(c.id, !c.actif))}>
                        {c.actif ? "Couper l'accès" : "Rétablir"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <label className="eqp-anciens">
        <input type="checkbox" checked={anciens} onChange={(e) => setAnciens(e.target.checked)} /> Montrer les anciens agents
      </label>
      {msg && <div className={`vs-msg${msg.ok ? "" : " ko"}`}>{msg.t}</div>}

      {nouveau && <NouvelAgent onFermer={() => setNouveau(false)} onFait={(t) => { setNouveau(false); setMsg({ ok: true, t }); }} />}
    </section>
  );
}

function NouvelAgent({ onFermer, onFait }: { onFermer: () => void; onFait: (message: string) => void }) {
  const [v, setV] = useState({ prenom: "", nom: "", email: "", portable: "", poste: "", role: "agent" as Role });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const champ = (k: keyof typeof v, label: string, type = "text") => (
    <>
      <span className="mlab">{label}</span>
      <input className="min" type={type} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </>
  );
  const creer = () => start(async () => {
    setErr(null);
    const r = await creerAgent(v).catch(() => ({ ok: false, message: "Le BO n'a pas répondu." }));
    if (r.ok) onFait(r.message); else setErr(r.message);
  });
  return (
    <Modale titre="Nouvel agent" onFermer={onFermer} className="etroit" fermeDehors={false}
      pied={(
        <>
          <button type="button" className="ltb annul" onClick={onFermer}>Annuler</button>
          <button type="button" className="kgo" disabled={pending || !v.prenom.trim() || !v.nom.trim() || !v.email.trim()} onClick={creer}>
            <span className="ch">›</span> {pending ? "Création…" : "Créer et inviter"}
          </button>
        </>
      )}>
      {champ("prenom", "Prénom")}
      {champ("nom", "Nom")}
      {champ("email", "E-mail professionnel", "email")}
      {champ("portable", "Portable (facultatif)", "tel")}
      {champ("poste", "Poste (facultatif)")}
      <span className="mlab">Rôle</span>
      <select className="min" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })}>
        <option value="agent">Agent</option>
        <option value="direction">Direction</option>
      </select>
      <p className="mhint">L&apos;agent reçoit un e-mail avec un lien pour choisir son mot de passe. Le lien vaut une heure.</p>
      {err && <p className="claude-err">{err}</p>}
    </Modale>
  );
}
