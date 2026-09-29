"use client";

/**
 * Une salve de relances qui se conduit toute seule, se suit de partout, et
 * survit à la fermeture de la page.
 *
 * MAV, 29/09 : « j'ai appuyé sur Envoyer mais rien ne se passe » ; « on doit
 * pouvoir fermer la fenêtre, faire autre chose, et voir où en est la relance » ;
 * puis, après une salve coupée à 144 sur 189 quand iOS a suspendu l'onglet :
 * « il faut qu'on puisse fermer la page une fois la commande lancée ».
 *
 * La salve vit donc EN BASE (lib/bo/relances-file.ts), pas dans le navigateur.
 * Ce fichier n'est que sa vitrine :
 *   • `lancer` inscrit la salve et la fait démarrer ;
 *   • tant qu'une page du BO est ouverte, elle fait tourner l'automate en
 *     boucle (un tour de quelques secondes à quarante secondes, selon la page)
 *     et relit l'état ; page fermée ou onglet suspendu, le cron Vercel prend
 *     la suite chaque minute ;
 *   • la pastille en bas de l'écran lit l'état au montage — elle réapparaît
 *     donc après un rechargement ou un retour depuis une autre application —
 *     et un tap l'ouvre sur le détail et « Arrêter ».
 * Une seule salve à la fois.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { EtatSalve } from "@/lib/bo/relances-file";
import {
  arreterSalveRelances, derniereSalveRelances, lancerSalveRelances, tournerSalveRelances,
} from "@/lib/bo/relances-actions";
import { PLAFOND_RELANCES } from "@/lib/bo/relances";

export type EnvoiRelance = {
  contactId: string; email: string; objet: string; corps: string; propositionIds: string[]; immeubleIds?: string[];
};
export type EnvoiSmsRelance = {
  contactId?: string; tel?: string; immeubleId: string; libelle: string; propositionIds: string[]; texte?: string;
};
export type ProgresSalve = EtatSalve;

type Lancement = {
  titre: string;
  mails: EnvoiRelance[];
  sms: EnvoiSmsRelance[];
  agent?: { id?: string; nom?: string };
  chemins?: string[];
  immeubleId?: string;
  /** Appelé à la fin, si l'écran qui a lancé existe encore. */
  apres?: () => Promise<void> | void;
};

type Contexte = {
  salve: ProgresSalve | null;
  /** Vrai si la salve est inscrite ; sinon le message dit pourquoi. */
  lancer: (l: Lancement) => Promise<{ ok: boolean; message?: string }>;
  arreter: () => void;
  effacer: () => void;
  /** Le budget d'un tour depuis cette page : long sur les pages qui le
   *  permettent (fiche du bien, Relances), court ailleurs. */
  budget: (ms: number) => void;
};

const Ctx = createContext<Contexte | null>(null);

/* Un tour court partout par défaut : il tient sous la durée minimale d'une
   fonction Vercel, quelle que soit la page. Les pages qui ont soixante
   secondes montent le budget. */
const BUDGET_COURT = 8_000;
const RELECTURE_MS = 4_000;

export function SalveRelancesProvider({ children }: { children: React.ReactNode }) {
  const [salve, setSalve] = useState<ProgresSalve | null>(null);
  const budgetRef = useRef(BUDGET_COURT);
  const apresRef = useRef<Lancement["apres"]>(undefined);
  const enTour = useRef(false);
  const idRef = useRef<string | null>(null);

  /* Un tour de l'automate depuis cette page, puis relecture. Une seule main
     à la fois par page ; le verrou serveur fait le reste. */
  const tour = useCallback(async () => {
    const id = idRef.current;
    if (!id || enTour.current) return;
    enTour.current = true;
    try {
      const e = await tournerSalveRelances(id, budgetRef.current);
      if (e) setSalve(e);
      if (e && !e.enCours) {
        idRef.current = null;
        const f = apresRef.current; apresRef.current = undefined;
        try { await f?.(); } catch { /* l'écran d'origine n'est plus là */ }
      }
    } catch {
      /* Réseau coupé, onglet suspendu : le cron continue, on relira. */
    } finally {
      enTour.current = false;
    }
  }, []);

  /* Au montage : y a-t-il une salve en cours (ou finie à l'instant) ? C'est
     ce qui fait réapparaître la pastille après un rechargement. */
  useEffect(() => {
    let vivant = true;
    derniereSalveRelances().then((e) => {
      if (!vivant || !e) return;
      setSalve(e);
      if (e.enCours) { idRef.current = e.id; void tour(); }
    }).catch(() => undefined);
    return () => { vivant = false; };
  }, [tour]);

  /* Tant qu'une salve est en cours : un tour dès que le précédent finit, et
     une relecture régulière (si c'est le cron qui travaille). */
  const enCours = !!salve?.enCours;
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => {
      if (enTour.current) return;
      void tour();
    }, RELECTURE_MS);
    return () => clearInterval(t);
  }, [enCours, tour]);

  const lancer = async (l: Lancement) => {
    const r = await lancerSalveRelances({
      titre: l.titre, agentId: l.agent?.id, agentNom: l.agent?.nom, immeubleId: l.immeubleId,
      mails: l.mails, sms: l.sms, chemins: l.chemins,
    });
    if (!r.ok) { if (r.etat) { setSalve(r.etat); idRef.current = r.etat.id; } return { ok: false, message: r.message }; }
    apresRef.current = l.apres;
    idRef.current = r.etat.id;
    setSalve(r.etat);
    void tour();
    return { ok: true };
  };

  const arreter = () => {
    const id = idRef.current ?? salve?.id;
    if (!id) return;
    void arreterSalveRelances(id).then((e) => { if (e) setSalve(e); if (e && !e.enCours) idRef.current = null; }).catch(() => undefined);
  };
  const effacer = () => { if (!salve?.enCours) setSalve(null); };
  const budget = useCallback((ms: number) => { budgetRef.current = ms; }, []);

  return <Ctx.Provider value={{ salve, lancer, arreter, effacer, budget }}>{children}</Ctx.Provider>;
}

export function useSalveRelances(): Contexte {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSalveRelances : SalveRelancesProvider absent de la coquille.");
  return c;
}

/** À poser sur une page qui laisse soixante secondes à ses actions : les
 *  tours y sont longs, et la salve avance vite tant qu'on y reste. */
export function useBudgetSalveLong() {
  const { budget } = useSalveRelances();
  useEffect(() => { budget(40_000); return () => budget(BUDGET_COURT); }, [budget]);
}

const heureDe = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const pct = (n: number, t: number) => (t > 0 ? Math.round((n / t) * 100) : 0);

/** La ligne de progression, avec sa barre, à poser dans la fenêtre ou l'écran qui envoie. */
export function ProgresSalveRelances({ p, onArreter, compact }: { p: ProgresSalve; onArreter?: () => void; compact?: boolean }) {
  /* L'heure courante vit dans l'état : la lire pendant le rendu serait impur,
     et le compte à rebours doit avancer sans qu'on touche à rien. */
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const attend = !!p.repriseA;
  useEffect(() => {
    if (!attend) return;
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, [attend]);
  const reste = p.repriseA ? Math.max(0, p.repriseA - maintenant) : 0;
  const minutes = Math.ceil(reste / 60_000);
  const total = p.mails.total + p.sms.total;
  const fait = p.mails.fait + p.mails.echecs + p.sms.fait + p.sms.echecs;
  const echecs = p.mails.echecs + p.sms.echecs;
  const reussis = p.mails.fait + p.sms.fait;
  /* Une salve finie sans rien de parti n'est pas un succès, même « terminée ». */
  const ton = p.enCours ? " encours" : p.message || (p.termine && reussis === 0 && echecs > 0) ? " rouge-b" : p.termine ? " ok" : "";
  return (
    <div className={`asst-prog salve-prog${ton}${compact ? " compact" : ""}`}>
      <svg viewBox="0 0 24 24" aria-hidden><path d="M3 7.5 12 13l9-5.5" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
      {!compact && <b className="salve-titre">{p.titre}</b>}
      {p.mails.total > 0 && (
        <span><b>{p.mails.fait} / {p.mails.total}</b> e-mail{p.mails.total > 1 ? "s" : ""} envoyé{p.mails.total > 1 ? "s" : ""}
          {p.mails.echecs > 0 && <span className="rouge"> · {p.mails.echecs} en échec</span>}</span>
      )}
      {p.sms.total > 0 && (
        <span><b>{p.sms.fait} / {p.sms.total}</b> SMS envoyé{p.sms.total > 1 ? "s" : ""}
          {p.sms.echecs > 0 && <span className="rouge"> · {p.sms.echecs} en échec</span>}</span>
      )}
      {p.enCours && <i className="asst-spin" aria-hidden />}
      <div className="salve-barre" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={fait}>
        <i style={{ width: `${pct(fait, total)}%` }} />
      </div>
      {p.repriseA && (
        <span className="salve-attente">
          La boîte a atteint {PLAFOND_RELANCES} e-mails dans l&apos;heure : la suite part toute seule à {heureDe(p.repriseA)}
          {minutes > 0 ? ` (dans ${minutes} min)` : ""}.
        </span>
      )}
      {p.enCours && !p.repriseA && !compact && (
        <span className="salve-attente">
          {p.voie === "masse" ? "Envoi par le relais SendGrid, sous votre adresse agence." : "Envoi depuis votre boîte."}
          {" "}L&apos;envoi se fait sur le serveur : vous pouvez fermer cette fenêtre, changer de page ou d&apos;application,
          il continue. La pastille en bas de l&apos;écran le suit.
        </span>
      )}
      {p.message && <span className="rouge">· {p.message}</span>}
      {p.termine && <span>· terminé{echecs > 0 ? `, ${echecs} en échec` : ""}</span>}
      {p.arrete && <span>· arrêté — ce qui est parti est marqué relancé, le reste attend</span>}
      {p.recap && <span className="salve-attente">{p.recap}</span>}
      {p.enCours && onArreter && <button type="button" className="fadd" onClick={onArreter}>Arrêter</button>}
      {!p.enCours && p.journal.length > 0 && (
        <details className="salve-journal">
          <summary>{p.journal.length} détail{p.journal.length > 1 ? "s" : ""}</summary>
          <ul>{p.journal.slice(-40).map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/**
 * La pastille : en bas de l'écran, sur toutes les pages, tant qu'une salve
 * tourne — et encore un moment après sa fin, pour lire le bilan. Un tap
 * l'ouvre sur le détail.
 */
export function PastilleSalve() {
  const { salve, arreter, effacer } = useSalveRelances();
  const [ouverte, setOuverte] = useState(false);
  /* La pastille d'une salve finie s'efface seule, sauf si on l'a ouverte. */
  const finie = !!salve && !salve.enCours;
  useEffect(() => {
    if (!finie || ouverte) return;
    const t = setTimeout(effacer, 90_000);
    return () => clearTimeout(t);
  }, [finie, ouverte, effacer]);
  if (!salve) return null;
  const total = salve.mails.total + salve.sms.total;
  const fait = salve.mails.fait + salve.mails.echecs + salve.sms.fait + salve.sms.echecs;
  const rate = !salve.enCours && (salve.message || (salve.mails.fait + salve.sms.fait === 0 && salve.mails.echecs + salve.sms.echecs > 0));
  return (
    <>
      <button type="button" className={`salve-pastille${salve.enCours ? " encours" : rate ? " rouge" : ""}`}
        onClick={() => setOuverte((o) => !o)} aria-expanded={ouverte}
        title={ouverte ? "Replier" : "Voir l'avancement"}>
        {salve.enCours ? <i className="asst-spin" aria-hidden /> : null}
        <span className="salve-pastille-t">{salve.titre}</span>
        <b>{fait} / {total}</b>
        <span className="salve-barre mini"><i style={{ width: `${pct(fait, total)}%` }} /></span>
      </button>
      {ouverte && (
        <div className="salve-panneau">
          <ProgresSalveRelances p={salve} onArreter={arreter} />
          <div className="salve-panneau-pied">
            <button type="button" className="fadd" onClick={() => setOuverte(false)}>Replier</button>
            {!salve.enCours && <button type="button" className="fadd" onClick={() => { setOuverte(false); effacer(); }}>Effacer</button>}
          </div>
        </div>
      )}
    </>
  );
}
