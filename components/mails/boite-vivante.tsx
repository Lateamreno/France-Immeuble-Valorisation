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
import { estDuSite } from "@/lib/mails/tri-fi";
import { CorpsMessage } from "@/components/mails/corps";

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

/* Les pictos de la barre d'outils. Un geste sans dessin se cherche ; un
   dessin sans mot s'interprète. On garde les deux, et une seule taille. */
const I = {
  plume: <><path d="M4 20.2 4.7 16 16.2 4.6a2 2 0 0 1 2.8 2.8L7.6 18.9zM14.6 6.4l3 3" /></>,
  repondre: <><path d="M9 7 3.5 12 9 17" /><path d="M3.5 12h9a7.5 7.5 0 0 1 7.5 7.5" /></>,
  corbeille: <><path d="M5 7h14M10 7V4.8h4V7" /><path d="m6.6 7 .8 12.2a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.4 7" /><path d="M10.4 10.6v6M13.6 10.6v6" /></>,
  alerte: <><path d="M12 3.4 20.4 18a1 1 0 0 1-.9 1.5H4.5a1 1 0 0 1-.9-1.5z" /><path d="M12 9.6v4M12 16.4h.01" /></>,
  retour: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 3.5V9h5.5" /></>,
  enveloppe: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 7 8.5 5.5L20.5 7" /></>,
  enveloppeOuverte: <><path d="M3 10.5 12 4.5l9 6V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z" /><path d="m3 10.5 9 6 9-6" /></>,
  relire: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 3.5V9h-5.5" /></>,
};

/** Un bouton de la barre : même dessin, même taille, même comportement. */
function Outil({ picto, libelle, onClick, inactif, seulPicto, tourne }: {
  picto: React.ReactNode;
  libelle: string;
  onClick: () => void;
  inactif?: boolean;
  /** Sans le mot, quand la place manque (le bouton « relire »). */
  seulPicto?: boolean;
  tourne?: boolean;
}) {
  return (
    <button
      type="button" className={`gm-out${seulPicto ? " nu" : ""}`}
      disabled={inactif} onClick={onClick} title={libelle}
    >
      <svg viewBox="0 0 24 24" aria-hidden className={tourne ? "tourne" : undefined}>{picto}</svg>
      {!seulPicto && <span>{libelle}</span>}
    </button>
  );
}

/** Au-delà de cette ancienneté, revenir sur l'onglet relit la boîte. */
const FRAICHEUR_MS = 60_000;

/* Le dossier déjà lu, gardé de côté.
 *
 * Chaque lecture ouvre une connexion au serveur : se connecter, s'annoncer,
 * lister, ouvrir le dossier, tirer les en-têtes, se déconnecter. Une à trois
 * secondes. Recommencer ça à chaque aller-retour entre « Envoyés » et
 * « Réception », alors que rien n'a bougé entre-temps, c'est faire attendre
 * pour rien.
 *
 * On garde donc ce qu'on a lu, par boîte et par dossier, pour la durée de la
 * page. Revenir sur un dossier l'affiche INSTANTANÉMENT ; si la lecture date
 * de plus d'une minute, elle est rafraîchie en fond, sans écran d'attente.
 * Le bouton « relire » et tout geste qui modifie la boîte passent outre. */
type EnCache = { entetes: Entete[]; total: number; luLe: number };
const CACHE = new Map<string, EnCache>();
/* Un message déjà ouvert ne change plus : le relire coûterait une seconde
   d'attente pour afficher exactement la même chose. */
const LUS = new Map<string, MessageComplet>();
const cle = (agentId: string, role: RoleDossier, tri?: string) =>
  `${agentId}|${role}|${tri ?? ""}`;

/** Après un envoi, un déplacement, un classement : ce qu'on avait est faux. */
export function oublierBoite(agentId?: string) {
  if (!agentId) { CACHE.clear(); LUS.clear(); return; }
  for (const k of [...CACHE.keys()]) if (k.startsWith(`${agentId}|`)) CACHE.delete(k);
  for (const k of [...LUS.keys()]) if (k.startsWith(`${agentId}|`)) LUS.delete(k);
}

export function BoiteVivante({
  agentId, role, adresse, tri, onNouveau, onRepondre, onRafraichi,
}: {
  agentId: string;
  role: RoleDossier;
  /** L'adresse de la boîte, affichée en clair : on doit savoir laquelle on lit. */
  adresse: string;
  /** Partage de la réception en deux vues (retour #130) : le courrier humain
   *  d'un côté, ce que le site envoie de l'autre. Rien n'est déplacé sur le
   *  serveur — sinon ça disparaîtrait aussi du téléphone. */
  tri?: "humain" | "site";
  /** Ouvre la fenêtre de rédaction : le bouton est dans la barre d'outils. */
  onNouveau: () => void;
  onRepondre: (m: MessageComplet, reponse: Reponse) => void;
  /** Prévient le parent des compteurs, pour la colonne de gauche. */
  onRafraichi?: (role: RoleDossier, total: number, nonLus: number) => void;
}) {
  /* Ce qu'on a déjà lu s'affiche tout de suite : pas d'écran d'attente pour
     revenir sur un dossier qu'on vient de quitter. */
  const dejaLu = CACHE.get(cle(agentId, role, tri));
  const [entetes, setEntetes] = useState<Entete[]>(dejaLu?.entetes ?? []);
  const [total, setTotal] = useState(dejaLu?.total ?? 0);
  const [q, setQ] = useState("");
  const [choisis, setChoisis] = useState<Set<number>>(new Set());
  const [ouvert, setOuvert] = useState<MessageComplet | null>(null);
  /** L'en-tête du message qu'on est en train d'ouvrir. */
  const [enAttente, setEnAttente] = useState<Entete | null>(null);
  const [chargement, setChargement] = useState(!dejaLu);
  const [erreur, setErreur] = useState<string | null>(null);
  const [luLe, setLuLe] = useState<number>(dejaLu?.luLe ?? 0);
  const [pending, start] = useTransition();
  /* Garde le rôle de la lecture en cours : une réponse arrivée en retard, pour
     un dossier qu'on a quitté, ne doit pas écraser la liste affichée. */
  const attendu = useRef<RoleDossier>(role);
  /** Les préchargements en vol, pour ne pas les lancer deux fois. */
  const enCours = useRef<Set<string>>(new Set());

  /** La lecture elle-même. Ne touche à l'état que dans la réponse. */
  const lire = useCallback(() => {
    attendu.current = role;
    return chargerDossier(agentId, role)
      .then((r) => {
        if (attendu.current !== role) return;
        if (!r.ok) { setErreur(r.erreur); setEntetes([]); return; }
        /* Les plus récents en tête, et on trie sur la date plutôt que de se
           fier à l'ordre du serveur : selon le fournisseur, l'ordre des
           numéros de message n'est pas celui de la réception. */
        setErreur(null);
        const gardes = tri
          ? r.page.messages.filter((m) => estDuSite(m) === (tri === "site"))
          : r.page.messages;
        const ranges = [...gardes].sort(
          (a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")),
        );
        const compte = tri ? gardes.length : r.page.total;
        const quand = Date.now();
        setEntetes(ranges);
        setTotal(compte);
        setLuLe(quand);
        CACHE.set(cle(agentId, role, tri), { entetes: ranges, total: compte, luLe: quand });
        onRafraichi?.(role, compte,
          tri ? gardes.filter((m) => !m.lu).length : r.page.nonLus);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => { if (attendu.current === role) setChargement(false); });
  }, [agentId, role, tri, onRafraichi]);

  /** Le bouton : il annonce la lecture avant de la lancer. */
  const relire = useCallback(() => {
    setChargement(true);
    setErreur(null);
    void lire();
  }, [lire]);

  /* Au montage : on ne relit QUE si on n'a rien, ou si ce qu'on a est vieux.
     Dans ce dernier cas la lecture se fait en fond — la liste déjà connue
     reste à l'écran, elle se remplace quand la nouvelle arrive. */
  useEffect(() => {
    const garde = CACHE.get(cle(agentId, role, tri));
    if (garde && Date.now() - garde.luLe < FRAICHEUR_MS) return;
    void lire();
  }, [agentId, role, tri, lire]);

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
  /* Sur quoi porte une action : ce qui est coché, ou à défaut le message
     affiché — c'est ce qu'on attend d'un client mail. */
  const cibles = choisis.size > 0 ? [...choisis] : ouvert ? [ouvert.uid] : [];

  /* Précharger au survol. Entre le moment où le curseur se pose sur une ligne
     et celui où le doigt clique, il s'écoule le temps qu'il faut pour aller
     chercher le message : autant le prendre. */
  const survoler = (e: Entete) => {
    const k = `${agentId}|${role}|${e.uid}`;
    if (LUS.has(k) || enCours.current.has(k)) return;
    enCours.current.add(k);
    /* `false` : le survol ne marque PAS le message lu. Passer la souris n'est
       pas lire — ce serait un bug d'affichage sur le téléphone de l'agent. */
    ouvrirMessage(agentId, role, e.uid, false)
      .then((r) => { if (r.ok && r.message) LUS.set(k, r.message); })
      .catch(() => undefined)
      .finally(() => enCours.current.delete(k));
  };

  const cocher = (uid: number) =>
    setChoisis((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });

  const ouvrir = (e: Entete) => {
    /* Ce qu'on a déjà lu s'affiche sans attendre. Sinon, on montre tout de
       suite l'en-tête connu : le clic doit répondre, même si le corps met une
       seconde à venir. */
    const k = `${agentId}|${role}|${e.uid}`;
    const connu = LUS.get(k);
    if (connu) {
      setOuvert(connu);
      setEnAttente(null);
      /* Préchargé sans le marquer lu : c'est l'ouverture qui pose le drapeau,
         sur le serveur donc aussi sur le téléphone. */
      if (!e.lu) {
        void basculerLu(agentId, role, [e.uid], true).catch(() => undefined);
        setEntetes((l) => {
          const maj = l.map((x) => (x.uid === e.uid ? { ...x, lu: true } : x));
          const garde = CACHE.get(cle(agentId, role, tri));
          if (garde) CACHE.set(cle(agentId, role, tri), { ...garde, entetes: maj });
          return maj;
        });
      }
      return;
    }
    setOuvert(null);
    setEnAttente(e);
    start(async () => {
      setErreur(null);
      const r = await ouvrirMessage(agentId, role, e.uid);
      setEnAttente(null);
      if (!r.ok) { setErreur(r.erreur); return; }
      if (r.message) LUS.set(k, r.message);
      setOuvert(r.message);
      /* Le serveur vient de le marquer lu : la liste doit le montrer tout de
         suite, sans attendre la prochaine relecture. */
      if (r.message && !e.lu) {
        setEntetes((l) => {
          const maj = l.map((x) => (x.uid === e.uid ? { ...x, lu: true } : x));
          const garde = CACHE.get(cle(agentId, role, tri));
          if (garde) CACHE.set(cle(agentId, role, tri), { ...garde, entetes: maj });
          return maj;
        });
      }
    });
  };

  const deplacer = (vers: RoleDossier) =>
    start(async () => {
      const uids = cibles;
      if (!uids.length) return;
      try {
        await deplacerMessages(agentId, role, uids, vers);
        /* Deux dossiers changent : celui d'où ça part et celui où ça arrive.
           On jette tout ce qu'on gardait plutôt que de deviner. */
        oublierBoite(agentId);
        setChoisis(new Set());
        if (ouvert && uids.includes(ouvert.uid)) setOuvert(null);
        relire();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    });

  const marquer = (lu: boolean) =>
    start(async () => {
      const uids = cibles;
      if (!uids.length) return;
      try {
        await basculerLu(agentId, role, uids, lu);
        setEntetes((l) => {
          const maj = l.map((x) => (uids.includes(x.uid) ? { ...x, lu } : x));
          const garde = CACHE.get(cle(agentId, role, tri));
          if (garde) CACHE.set(cle(agentId, role, tri), { ...garde, entetes: maj });
          return maj;
        });
        setChoisis(new Set());
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <>
      {/* Barre d'outils permanente : elle couvre la liste ET la lecture, comme
          un ruban. Dans la seule colonne de liste, six boutons ne tiennent pas. */}
      <div className="gm-bar">
        <label className="gm-tous" title="Tout sélectionner">
          <input type="checkbox" checked={tousCoches}
            onChange={() => setChoisis(tousCoches ? new Set() : new Set(liste.map((m) => m.uid)))} />
        </label>

        <Outil picto={I.plume} libelle="Nouveau" onClick={onNouveau} />
        <Outil picto={I.repondre} libelle="Répondre"
          inactif={!ouvert || pending}
          onClick={() => ouvert && onRepondre(ouvert, {
            role, uid: ouvert.uid, messageId: ouvert.messageId, references: ouvert.references,
          })} />
        <span className="gm-sepv" />
        <Outil picto={I.corbeille} libelle="Supprimer"
          inactif={!cibles.length || pending || role === "corbeille"}
          onClick={() => deplacer("corbeille")} />
        <Outil picto={I.alerte} libelle="Indésirable"
          inactif={!cibles.length || pending || role === "indesirables"}
          onClick={() => deplacer("indesirables")} />
        {(role === "corbeille" || role === "indesirables") && (
          <Outil picto={I.retour} libelle="Restaurer"
            inactif={!cibles.length || pending}
            onClick={() => deplacer("reception")} />
        )}
        <span className="gm-sepv" />
        <Outil picto={I.enveloppeOuverte} libelle="Lu"
          inactif={!cibles.length || pending} onClick={() => marquer(true)} />
        <Outil picto={I.enveloppe} libelle="Non lu"
          inactif={!cibles.length || pending} onClick={() => marquer(false)} />

        <span style={{ flex: 1 }} />

        <div className="gm-rech">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>
          <input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="gm-cpt">
          {choisis.size > 0
            ? `${choisis.size} sélectionné${choisis.size > 1 ? "s" : ""}`
            : `${liste.length}${total > entetes.length ? ` / ${total}` : ""}`}
        </span>
        {/* Ici le picto circulaire est le bon : on relit vraiment. */}
        <Outil picto={I.relire} libelle="Relire" seulPicto
          tourne={chargement} inactif={chargement || pending} onClick={relire} />
      </div>

      <section className="gm-liste">
        <div className="gm-boitedit">
          <span>
            {tri === "site"
              ? "Ce que le site envoie : formulaires, nouvelles recherches, questions."
              : tri === "humain"
                ? "Courrier reçu, hors messages du site."
                : adresse}
          </span>
          {luLe > 0 && <i>relue à {new Date(luLe).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</i>}
        </div>

        {erreur && <div className="dif-avis" style={{ margin: 10 }}>{erreur}</div>}

        <div className="gm-rows">
          {liste.map((m) => (
            <div key={m.uid}
              className={`gm-row${ouvert?.uid === m.uid || enAttente?.uid === m.uid ? " on" : ""}${m.lu ? "" : " neuf"}`}
              onClick={() => ouvrir(m)}
              onMouseEnter={() => survoler(m)}>
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
        {/* Le clic doit répondre : on montre l'en-tête déjà connu pendant que
            le corps arrive, plutôt qu'un écran figé. */}
        {enAttente ? (
          <>
            <div className="gm-lh">
              <h2>{enAttente.objet}</h2>
              <div className="gm-lmeta">
                <span className="gm-av">{initiales(enAttente.deNom || enAttente.de)}</span>
                <div>
                  <b>{enAttente.deNom || enAttente.de}</b>
                  <span>{enAttente.de}</span>
                </div>
                <span style={{ flex: 1 }} />
                <span className="gm-date">{jour(enAttente.date)}</span>
              </div>
            </div>
            <div className="fempty">Ouverture du message…</div>
          </>
        ) : ouvert ? (
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
            <CorpsMessage texte={ouvert.corps} html={ouvert.corpsHtml} />
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
