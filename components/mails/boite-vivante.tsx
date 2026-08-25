"use client";

/* La boîte de l'agent, lue en direct sur son serveur.
 *
 * Ce qui change par rapport à la version d'avant : rien n'est recopié dans une
 * base intermédiaire. La liste, les drapeaux lu/non lu, les dossiers, tout est
 * demandé au serveur IMAP au moment de l'affichage. C'est ce qui donne la
 * synchro que MAV attend : un message lu sur le téléphone apparaît lu ici, et
 * un message lu ici apparaît lu sur le téléphone.
 *
 * Conséquence directe : il faut un bouton pour relire. Une liste servie par le
 * serveur ne se met pas à jour toute seule — on relit sur demande, et au
 * retour sur l'onglet quand la dernière lecture date d'un moment.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  basculerLu, chargerDossier, deplacerMessages, ouvrirMessage,
} from "@/lib/bo/boite-actions";
import type { Entete, MessageComplet, RoleDossier } from "@/lib/mails/client";
import type { Reponse } from "@/components/mails/redaction";

const jour = (d?: string) => {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return x.toDateString() === new Date().toDateString()
    ? x.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : x.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
};

const initiales = (nom: string) =>
  nom.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? "").join("") || "?";

/** Au-delà de cette ancienneté, revenir sur l'onglet relit la boîte. */
const FRAICHEUR_MS = 60_000;

export function BoiteVivante({ agentId, role, adresse, onRepondre, onRafraichi }: {
  agentId: string;
  role: RoleDossier;
  /** L'adresse de la boîte, affichée en clair : on doit savoir laquelle on lit. */
  adresse: string;
  onRepondre: (m: MessageComplet, reponse: Reponse) => void;
  /** Prévient le parent des compteurs, pour la colonne de gauche. */
  onRafraichi?: (role: RoleDossier, total: number, nonLus: number) => void;
}) {
  const [entetes, setEntetes] = useState<Entete[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [choisis, setChoisis] = useState<Set<number>>(new Set());
  const [ouvert, setOuvert] = useState<MessageComplet | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [luLe, setLuLe] = useState<number>(0);
  const [pending, start] = useTransition();
  /* Garde le rôle de la lecture en cours : une réponse arrivée en retard, pour
     un dossier qu'on a quitté, ne doit pas écraser la liste affichée. */
  const attendu = useRef<RoleDossier>(role);

  /** La lecture elle-même. Ne touche à l'état que dans la réponse. */
  const lire = useCallback(() => {
    attendu.current = role;
    return chargerDossier(agentId, role)
      .then((r) => {
        if (attendu.current !== role) return;
        if (!r.ok) { setErreur(r.erreur); setEntetes([]); return; }
        /* Les plus récents en tête : le serveur les rend dans l'ordre des
           numéros, c'est-à-dire du plus ancien au plus récent. */
        setErreur(null);
        setEntetes([...r.page.messages].reverse());
        setTotal(r.page.total);
        setLuLe(Date.now());
        onRafraichi?.(role, r.page.total, r.page.nonLus);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => { if (attendu.current === role) setChargement(false); });
  }, [agentId, role, onRafraichi]);

  /** Le bouton : il annonce la lecture avant de la lancer. */
  const relire = useCallback(() => {
    setChargement(true);
    setErreur(null);
    void lire();
  }, [lire]);

  /* Une seule lecture au montage : l'écran remonte ce composant à chaque
     changement de dossier (clé de rendu), la sélection et le message ouvert
     repartent donc de zéro sans qu'on ait à les remettre à la main. */
  useEffect(() => { void lire(); }, [lire]);

  /* Revenir sur l'onglet après avoir consulté son téléphone, c'est exactement
     le moment où la liste est périmée. */
  useEffect(() => {
    const auRetour = () => {
      if (document.visibilityState === "visible" && Date.now() - luLe > FRAICHEUR_MS) relire();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => document.removeEventListener("visibilitychange", auRetour);
  }, [luLe, relire]);

  const qq = q.trim().toLowerCase();
  const liste = qq
    ? entetes.filter((m) => `${m.objet} ${m.deNom ?? ""} ${m.de} ${m.extrait}`.toLowerCase().includes(qq))
    : entetes;
  const tousCoches = liste.length > 0 && liste.every((m) => choisis.has(m.uid));

  const cocher = (uid: number) =>
    setChoisis((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });

  const ouvrir = (e: Entete) =>
    start(async () => {
      setErreur(null);
      const r = await ouvrirMessage(agentId, role, e.uid);
      if (!r.ok) { setErreur(r.erreur); return; }
      setOuvert(r.message);
      /* Le serveur vient de le marquer lu : la liste doit le montrer tout de
         suite, sans attendre la prochaine relecture. */
      if (r.message && !e.lu) {
        setEntetes((l) => l.map((x) => (x.uid === e.uid ? { ...x, lu: true } : x)));
      }
    });

  const deplacer = (vers: RoleDossier) =>
    start(async () => {
      const uids = [...choisis];
      if (!uids.length) return;
      try {
        await deplacerMessages(agentId, role, uids, vers);
        setChoisis(new Set());
        if (ouvert && uids.includes(ouvert.uid)) setOuvert(null);
        relire();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    });

  const marquer = (lu: boolean) =>
    start(async () => {
      const uids = [...choisis];
      if (!uids.length) return;
      try {
        await basculerLu(agentId, role, uids, lu);
        setEntetes((l) => l.map((x) => (uids.includes(x.uid) ? { ...x, lu } : x)));
        setChoisis(new Set());
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <>
      <section className="gm-liste">
        <div className="gm-bar">
          <label className="gm-tous" title="Tout sélectionner">
            <input type="checkbox" checked={tousCoches}
              onChange={() => setChoisis(tousCoches ? new Set() : new Set(liste.map((m) => m.uid)))} />
          </label>
          {choisis.size > 0 ? (
            <>
              <b className="gm-nsel">{choisis.size} sélectionné{choisis.size > 1 ? "s" : ""}</b>
              <span style={{ flex: 1 }} />
              <button type="button" className="gm-act" disabled={pending} onClick={() => marquer(true)}>Lu</button>
              <button type="button" className="gm-act" disabled={pending} onClick={() => marquer(false)}>Non lu</button>
              {role !== "corbeille" && (
                <button type="button" className="gm-act" disabled={pending} onClick={() => deplacer("corbeille")}>
                  Supprimer
                </button>
              )}
              {role !== "indesirables" && (
                <button type="button" className="gm-act" disabled={pending} onClick={() => deplacer("indesirables")}>
                  Indésirable
                </button>
              )}
              {(role === "corbeille" || role === "indesirables") && (
                <button type="button" className="gm-act" disabled={pending} onClick={() => deplacer("reception")}>
                  Restaurer
                </button>
              )}
            </>
          ) : (
            <>
              <div className="gm-rech">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
                <input placeholder="Rechercher dans cette boîte…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <span className="gm-cpt">{liste.length}{total > entetes.length ? ` / ${total}` : ""}</span>
              {/* Ici le picto circulaire est le bon : on relit vraiment. */}
              <button type="button" className="gm-refresh" title="Relire la boîte"
                disabled={chargement || pending} onClick={relire}>
                <svg viewBox="0 0 24 24" className={chargement ? "tourne" : undefined}>
                  <path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3.5V9h-5.5" />
                </svg>
              </button>
            </>
          )}
        </div>

        <div className="gm-boitedit">
          <span>{adresse}</span>
          {luLe > 0 && <i>relue à {new Date(luLe).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</i>}
        </div>

        {erreur && <div className="dif-avis" style={{ margin: 10 }}>{erreur}</div>}

        <div className="gm-rows">
          {liste.map((m) => (
            <div key={m.uid}
              className={`gm-row${ouvert?.uid === m.uid ? " on" : ""}${m.lu ? "" : " neuf"}`}
              onClick={() => ouvrir(m)}>
              <label className="gm-ck" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={choisis.has(m.uid)} onChange={() => cocher(m.uid)} />
              </label>
              <span className="gm-av">{initiales(m.deNom || m.de)}</span>
              <div className="gm-mid">
                <div className="gm-l1">
                  <span className="gm-qui">{m.deNom || m.de || "—"}</span>
                  <span style={{ flex: 1 }} />
                  {m.repondu && <span className="gm-rep" title="Répondu">↩</span>}
                  {m.pj > 0 && <span className="gm-pj" title={`${m.pj} pièce(s) jointe(s)`}>📎</span>}
                  <span className="gm-date">{jour(m.date)}</span>
                </div>
                <div className="gm-l2">
                  <b>{m.objet}</b>
                  <span> — {m.extrait}</span>
                </div>
              </div>
            </div>
          ))}
          {liste.length === 0 && !chargement && !erreur && (
            <div className="fempty">
              {qq ? "Aucun message ne correspond." : "Aucun message dans cette boîte."}
            </div>
          )}
          {chargement && liste.length === 0 && <div className="fempty">Lecture de la boîte…</div>}
        </div>
      </section>

      <section className="gm-lecture">
        {ouvert ? (
          <>
            <div className="gm-lh">
              <h2>{ouvert.objet}</h2>
              <div className="gm-lmeta">
                <span className="gm-av">{initiales(ouvert.deNom || ouvert.de)}</span>
                <div>
                  <b>{ouvert.deNom || ouvert.de}</b>
                  <span>{ouvert.de}{ouvert.pour.length ? ` → ${ouvert.pour.join(", ")}` : ""}</span>
                </div>
                <span style={{ flex: 1 }} />
                <span className="gm-date">{jour(ouvert.date)}</span>
              </div>
              <div className="gm-lliens">
                {ouvert.pieces.length > 0 && (
                  <span className="gm-pjs">
                    {ouvert.pieces.map((p) => (
                      <i key={p.nom}>📎 {p.nom} ({Math.max(1, Math.round(p.taille / 1024))} Ko)</i>
                    ))}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <button type="button" className="fadd"
                  onClick={() => onRepondre(ouvert, {
                    role, uid: ouvert.uid,
                    messageId: ouvert.messageId,
                    references: ouvert.references,
                  })}>
                  ↩ Répondre
                </button>
              </div>
            </div>
            <pre className="gm-corps">{ouvert.corps}</pre>
          </>
        ) : (
          <div className="fempty">
            Sélectionnez un message.
            <br />
            <Link href="/mails/reglages">Régler ma boîte</Link>
          </div>
        )}
      </section>
    </>
  );
}
