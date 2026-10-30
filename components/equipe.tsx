"use client";

/**
 * L'équipe et ses accès au BO (MAV, 27/10 : « séparer la partie admin gérée
 * par moi avec les menus permettant de créer les agents »).
 *
 * La direction ouvre un accès de trois façons, dans la fenêtre « Mot de passe » :
 * elle définit un premier mot de passe et le transmet (MAV, 27/10 : les liens
 * se perdaient), elle copie un lien à passer par SMS, ou elle l'envoie par
 * e-mail. Chacun change ensuite le sien quand il veut. Couper un accès le
 * ferme tout de suite, même sur un poste resté connecté.
 */
import { useState, useTransition } from "react";
import { Modale } from "@/components/modale";
import { Pastille } from "@/components/pastille";
import { Copier } from "@/components/copier";
import { changerActif, changerRole, creerAgent, inviterAgent, lienAgent, poserMotDePasse } from "@/lib/auth/actions";
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
  const [acces, setAcces] = useState<LigneEquipe | null>(null);
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
        Chacun a son mot de passe : vous en définissez un premier (ou vous lui faites choisir le sien par un
        lien), et il le change quand il veut. La{" "}
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
                    {(c ? c.actif : l.actifBo) && (
                      <button type="button" className="fadd" disabled={pending} onClick={() => { setMsg(null); setAcces(l); }}
                        title="Définir son mot de passe, copier un lien ou l'envoyer par e-mail">
                        {c ? "Mot de passe" : "Ouvrir l'accès"}
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

      {acces && <Acces ligne={acces} onFermer={() => setAcces(null)} onFait={(t) => { setAcces(null); setMsg({ ok: true, t }); }} />}
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

/** Un mot de passe lisible à dicter : sans 0/O ni 1/l/I, en trois groupes. */
function proposer(): string {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const v = crypto.getRandomValues(new Uint32Array(12));
  const t = Array.from(v, (x) => a[x % a.length]).join("");
  return `${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}`;
}

function Acces({ ligne, onFermer, onFait }: { ligne: LigneEquipe; onFermer: () => void; onFait: (message: string) => void }) {
  const [mdp, setMdp] = useState("");
  const [lien, setLien] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lancer = (f: () => Promise<{ ok: boolean; message: string; lien?: string }>, fin: boolean) => start(async () => {
    setErr(null); setInfo(null);
    const r = await f().catch(() => ({ ok: false, message: "Le BO n'a pas répondu.", lien: undefined }));
    if (!r.ok) setErr(r.message);
    else if (r.lien) { setLien(r.lien); setInfo(r.message); }
    else if (fin) onFait(r.message);
  });
  return (
    <Modale titre={`Accès de ${ligne.nom}`} onFermer={onFermer} className="etroit" fermeDehors={false}
      pied={<button type="button" className="ltb annul" onClick={onFermer}>Fermer</button>}>
      <span className="mlab">Définir son mot de passe</span>
      <div className="eqp-mdp">
        <input className="min" type="text" value={mdp} autoComplete="off" spellCheck={false}
          placeholder="Dix caractères au moins" onChange={(e) => setMdp(e.target.value)} />
        <button type="button" className="fadd" onClick={() => setMdp(proposer())}>Proposer</button>
        <Copier valeur={mdp} titre="Copier le mot de passe" />
      </div>
      <button type="button" className="kgo" disabled={pending || mdp.length < 10}
        onClick={() => lancer(() => poserMotDePasse(ligne.agentId, mdp), true)}>
        <span className="ch">›</span> Enregistrer ce mot de passe
      </button>
      <p className="mhint">Transmettez-le de vive voix ou par SMS. Il le changera quand il veut, dans « Mon mot de passe » en bas du menu.</p>

      <span className="mlab">Ou lui faire choisir le sien</span>
      <div className="eqp-mdp">
        <button type="button" className="fadd" disabled={pending} onClick={() => lancer(() => lienAgent(ligne.agentId), false)}>Fabriquer un lien</button>
        <button type="button" className="fadd" disabled={pending} onClick={() => lancer(() => inviterAgent(ligne.agentId), true)}>Envoyer par e-mail</button>
      </div>
      {lien && (
        <div className="eqp-mdp">
          <input className="min" type="text" readOnly value={lien} onFocus={(e) => e.target.select()} />
          <Copier valeur={lien} titre="Copier le lien">Copier le lien</Copier>
        </div>
      )}
      {info && <p className="mhint">{info}</p>}
      {err && <p className="claude-err">{err}</p>}
    </Modale>
  );
}
