"use client";

/* Écran Questions — reprise du BO (retour #118).
 *
 * Ce sont les demandes reçues depuis le site. Chacune se termine de trois
 * façons : on crée le contact, on appelle ou on écrit, on clôture. Les trois
 * gestes sont donc sur la carte, pas cachés derrière une fiche. */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { QuestionCard } from "@/lib/bubble/server";
import { cloturerQuestion, creerContactDepuisQuestion, rouvrirQuestion } from "@/lib/bo/actions";

const TAILLES = [10, 25, 50, 100];

export function EcranQuestions({
  rows, agentId,
}: {
  rows: QuestionCard[];
  agentId: string;
}) {
  const [vue, setVue] = useState<"en_cours" | "cloturees">("en_cours");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [taille, setTaille] = useState(10);
  const [aCloturer, setACloturer] = useState<QuestionCard | null>(null);
  const [aCreer, setACreer] = useState<QuestionCard | null>(null);
  const [pending, start] = useTransition();

  const compte = (v: "en_cours" | "cloturees") =>
    rows.filter((r) => (v === "cloturees") === r.clos).length;

  const filtrees = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.clos !== (vue === "cloturees")) return false;
      if (!qq) return true;
      return [r.message, r.email, r.telephone, r.contact?.nom, r.immeuble?.libelle, r.source]
        .filter(Boolean).join(" ").toLowerCase().includes(qq);
    });
  }, [rows, vue, q]);

  const pages = Math.max(1, Math.ceil(filtrees.length / taille));
  const cur = Math.min(page, pages);
  const tranche = filtrees.slice((cur - 1) * taille, cur * taille);

  return (
    <div className="lstx">
      <div className="lstx-top">
        <h1 className="lstx-titre">Questions</h1>
        <div className="lst-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
          <input placeholder="Recherchez une question, un nom, un e-mail…" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <div className="lstx-sw" role="group" aria-label="Vue">
          {([["en_cours", "En cours"], ["cloturees", "Clôturées"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={vue === k ? "on" : undefined}
              onClick={() => { setVue(k); setPage(1); }}>
              {l}{compte(k) > 0 && <span className="n">{compte(k)}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="lst-col-simple">
        {tranche.map((r) => (
          <div className={`qc${r.clos ? " clos" : ""}`} key={r.id}>
            <div className="qc-gauche">
              <span className="qc-bulle">
                <svg viewBox="0 0 24 24"><path d="M12 3C6.8 3 2.6 6.3 2.6 10.4c0 2.3 1.3 4.4 3.4 5.7-.2 1.3-.9 2.5-1.9 3.4 1.9 0 3.7-.7 5-1.9.9.2 1.8.3 2.9.3 5.2 0 9.4-3.3 9.4-7.5S17.2 3 12 3z" /></svg>
              </span>
              <span className="lav" style={r.agentCouleur ? { background: r.agentCouleur } : undefined}>{r.agent}</span>
            </div>

            <div className="qc-corps">
              <div className="qc-cadre">
                <div className="qc-tete">
                  <span>
                    Question du <b>{r.quand}</b> <i>({r.source})</i>
                  </span>
                  <span style={{ flex: 1 }} />
                  {r.contact ? (
                    <Link className="qc-ct" href={`/contact/${r.contact.id}`}>
                      <svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
                      {r.contact.nom}
                      {r.contact.note && <b className={`note n${r.contact.note}`}>{r.contact.note}</b>}
                    </Link>
                  ) : (
                    <span className="qc-nc">⊘ Pas de contact</span>
                  )}
                </div>
                {r.projet && <div className="qc-projet">{r.projet}</div>}
                <p className="qc-msg">{r.message || <i>Sans message.</i>}</p>
                <div className="qc-coord">
                  {r.telephone && <span>☎ {r.telephone}</span>}
                  {r.email && <span>✉ {r.email}</span>}
                </div>
              </div>

              <div className="qc-actions">
                {!r.contact ? (
                  <button type="button" className="qc-creer" disabled={pending} onClick={() => setACreer(r)}>
                    ⚠ Créer un contact
                  </button>
                ) : (
                  <span className="qc-fait">✓ Contact rattaché</span>
                )}
                {r.immeuble ? (
                  <Link className="qc-im" href={`/bien/${r.immeuble.id}`}>{r.immeuble.libelle}</Link>
                ) : (
                  <span className="qc-im vide">⊘ Pas d&apos;immeuble</span>
                )}
                <span style={{ flex: 1 }} />
                {r.telephone && (
                  <a className="qc-b" href={`tel:${r.telephone.replace(/[^\d+]/g, "")}`}>☎ Appeler</a>
                )}
                {r.email && (
                  <a className="qc-b" href={`mailto:${r.email}`}>✉ Envoyer un mail</a>
                )}
                {r.clos ? (
                  <button type="button" className="qc-b" disabled={pending}
                    onClick={() => start(() => rouvrirQuestion(r.id).then(() => undefined))}>
                    ↺ Rouvrir
                  </button>
                ) : (
                  <button type="button" className="qc-clot" disabled={pending} onClick={() => setACloturer(r)}>
                    › Clôturer
                  </button>
                )}
              </div>
              {r.clos && r.remarques && <div className="qc-rem">Clôturée : {r.remarques}</div>}
            </div>
          </div>
        ))}

        {tranche.length === 0 && <div className="fempty">Aucune question.</div>}

        <div className="lst-pager">
          <span className="lst-res">{filtrees.length} résultat{filtrees.length > 1 ? "s" : ""}</span>
          <span className="sp" style={{ flex: 1 }} />
          <button className="pgb" type="button" disabled={cur <= 1} onClick={() => setPage(1)}>«</button>
          <button className="pgb" type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>‹</button>
          <span className="pgn">Page {cur} / {pages}</span>
          <button className="pgb" type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>›</button>
          <button className="pgb" type="button" disabled={cur >= pages} onClick={() => setPage(pages)}>»</button>
          <span className="sp" style={{ flex: 1 }} />
          <select className="pgs" value={taille} onChange={(e) => { setTaille(Number(e.target.value)); setPage(1); }}>
            {TAILLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="pgl">éléments par page</span>
        </div>
      </div>

      {aCloturer && (
        <Cloture q={aCloturer} agentId={agentId} onClose={() => setACloturer(null)} />
      )}
      {aCreer && (
        <Creation q={aCreer} agentId={agentId} onClose={() => setACreer(null)} />
      )}
    </div>
  );
}

function Cloture({ q, agentId, onClose }: { q: QuestionCard; agentId: string; onClose: () => void }) {
  const [texte, setTexte] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><b>Clôturer la question</b><button type="button" onClick={onClose}>✕</button></div>
        <div className="modal-b">
          <p className="rc-com" style={{ marginTop: 0 }}>{q.message}</p>
          <label className="vit-l" style={{ marginTop: 12 }}>
            <span>Ce qui a été fait</span>
            <textarea rows={4} value={texte} onChange={(e) => setTexte(e.target.value)}
              placeholder="Rappelé, estimation envoyée, sans suite…" />
          </label>
        </div>
        <div className="modal-f">
          <span style={{ flex: 1 }} />
          <button type="button" className="savebar-go" disabled={pending}
            onClick={() => start(async () => { await cloturerQuestion(q.id, texte, agentId); onClose(); })}>
            <span className="ch">›</span> Clôturer
          </button>
        </div>
      </div>
    </div>
  );
}

function Creation({ q, agentId, onClose }: { q: QuestionCard; agentId: string; onClose: () => void }) {
  /* Le formulaire arrive pré-rempli avec ce que la question porte : le nom
     manque presque toujours, c'est la seule chose à saisir. */
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><b>Créer le contact</b><button type="button" onClick={onClose}>✕</button></div>
        <div className="modal-b">
          <div className="vit-duo">
            <label className="vit-l"><span>Prénom</span>
              <input value={prenom} onChange={(e) => setPrenom(e.target.value)} /></label>
            <label className="vit-l"><span>Nom</span>
              <input value={nom} onChange={(e) => setNom(e.target.value)} autoFocus /></label>
          </div>
          <div className="rc-det" style={{ marginTop: 14 }}>
            <b>E-mail</b><span>{q.email ?? "—"}</span>
            <b>Téléphone</b><span>{q.telephone ?? "—"}</span>
          </div>
          <p className="vit-note" style={{ marginTop: 12 }}>
            La question rejoint l&apos;historique de suivi du contact. Elle reste ouverte : créer la
            fiche n&apos;est pas y répondre.
          </p>
          {err && <div className="dif-avis" style={{ marginTop: 10 }}>{err}</div>}
        </div>
        <div className="modal-f">
          <span style={{ flex: 1 }} />
          <button type="button" className="savebar-go" disabled={pending || !nom.trim()}
            onClick={() => start(async () => {
              try {
                await creerContactDepuisQuestion({
                  questionId: q.id, agentId,
                  nom: nom.trim(), prenom: prenom.trim() || undefined,
                  email: q.email, telephone: q.telephone, message: q.message,
                });
                onClose();
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            })}>
            <span className="ch">›</span> Créer et rattacher
          </button>
        </div>
      </div>
    </div>
  );
}
