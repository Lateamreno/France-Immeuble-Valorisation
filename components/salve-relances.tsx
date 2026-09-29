"use client";

/**
 * Une salve de relances qui se conduit toute seule, se suit de partout, et
 * survit à la fermeture de sa fenêtre.
 *
 * MAV, 29/09 : « j'ai appuyé sur Envoyer mais rien ne se passe » ; « pour la
 * limite je ne veux pas avoir à la gérer moi-même » ; « on doit pouvoir
 * fermer la fenêtre, faire autre chose, et voir où en est la relance ».
 *
 * Deux défauts derrière le premier constat : le bouton se contentait de se
 * griser, et l'envoi entier partait dans UN appel serveur, que Vercel coupe à
 * soixante secondes — sur Argenteuil, dix-huit e-mails sont partis avant la
 * coupure, sans que l'écran le montre.
 *
 * D'où cette forme :
 *   • la salve vit dans un contexte posé sur toute l'application, pas dans la
 *     fenêtre qui l'a lancée : on ferme la fenêtre, on change de page, elle
 *     continue, et une pastille en bas de l'écran dit où elle en est ;
 *   • l'envoi part par petits paquets, un appel serveur par paquet, et le
 *     compteur avance à chaque paquet — « 42 / 226 e-mails envoyés », avec
 *     une barre ;
 *   • par le relais SendGrid (« option SendGrid », MAV) : 226 e-mails en
 *     quelques minutes, sans toucher à la boîte OVH. Si le relais n'est pas
 *     configuré, la boîte de l'agent prend le relais avec son plafond horaire
 *     (`PLAFOND_RELANCES`), tenu ici — la salve attend, compte à rebours, et
 *     repart seule ;
 *   • « Arrêter » coupe proprement : ce qui est parti reste marqué relancé,
 *     ce qui n'est pas parti reste à relancer.
 *
 * C'est le navigateur qui conduit : l'onglet doit rester ouvert. Une seule
 * salve à la fois.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  envoyerRelances, ouvrirSalveRelances, relancesDerniereHeure, voieRelancesGroupees,
} from "@/lib/bo/relances-actions";
import { relancerParSms } from "@/lib/bo/propositions-actions";
import { PLAFOND_RELANCES } from "@/lib/bo/relances";

export type EnvoiRelance = {
  contactId: string; email: string; objet: string; corps: string; propositionIds: string[]; immeubleIds?: string[];
};
export type EnvoiSmsRelance = {
  contactId?: string; tel?: string; immeubleId: string; libelle: string; propositionIds: string[]; texte?: string;
};

export type ProgresSalve = {
  titre: string;
  voie: "masse" | "boite";
  mails: { fait: number; total: number; echecs: number };
  sms: { fait: number; total: number; echecs: number };
  enCours: boolean;
  /** L'heure (ms) à laquelle la salve repartira : la boîte a atteint son plafond. */
  repriseA?: number;
  journal: string[];
  message?: string;
  termine?: boolean;
  arrete?: boolean;
  /** Le moment de la fin, pour que la pastille s'efface d'elle-même. */
  finieA?: number;
};

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
  /** Faux si une salve tourne déjà : une seule à la fois. */
  lancer: (l: Lancement) => boolean;
  arreter: () => void;
  effacer: () => void;
};

const Ctx = createContext<Contexte | null>(null);

/* Douze e-mails par appel sur le relais (rapide), six par la boîte (le PDF
   joint et la poignée de main SMTP pèsent) ; loin de la coupure à soixante
   secondes. Les SMS partent par vingt-cinq, MailingVox répond vite. */
const LOT_RELAIS = 12;
const LOT_BOITE = 6;
const LOT_SMS = 25;
const HEURE = 3_600_000;
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function SalveRelancesProvider({ children }: { children: React.ReactNode }) {
  const [salve, setSalve] = useState<ProgresSalve | null>(null);
  const actif = useRef(false);

  const arreter = () => { actif.current = false; };
  const effacer = () => { if (!actif.current) setSalve(null); };

  const lancer = (l: Lancement): boolean => {
    if (actif.current) return false;
    actif.current = true;
    void conduire(l);
    return true;
  };

  const conduire = async (l: Lancement) => {
    const p: ProgresSalve = {
      titre: l.titre, voie: "boite",
      mails: { fait: 0, total: l.mails.length, echecs: 0 },
      sms: { fait: 0, total: l.sms.length, echecs: 0 },
      enCours: true, journal: [],
    };
    const maj = () => setSalve({ ...p, mails: { ...p.mails }, sms: { ...p.sms }, journal: [...p.journal] });
    maj();
    try {
      if (l.mails.length) {
        const route = await voieRelancesGroupees(l.agent?.id);
        p.voie = route.voie; maj();
        const relais = route.voie === "masse";
        const lotTaille = relais ? LOT_RELAIS : LOT_BOITE;
        /* La ligne de salve : le journal des salves la montre en direct et le
           plafond du jour la compte. */
        const salveId = relais
          ? await ouvrirSalveRelances({
            titre: l.titre, total: l.mails.length, objet: l.mails[0].objet, corps: l.mails[0].corps,
            agentId: l.agent?.id, immeubleId: l.immeubleId,
          })
          : "";
        let fenetre = relais ? { n: 0, premiere: null as string | null } : await relancesDerniereHeure();
        for (let i = 0; i < l.mails.length && actif.current;) {
          const lot = l.mails.slice(i, i + lotTaille);
          if (!relais && fenetre.n + lot.length > PLAFOND_RELANCES && fenetre.premiere) {
            /* La fenêtre glissante se libère une heure après son premier envoi ;
               quinze secondes de marge, puis on relit la base plutôt que de
               deviner. */
            const reprise = new Date(fenetre.premiere).getTime() + HEURE + 15_000;
            p.repriseA = reprise; maj();
            while (actif.current && Date.now() < reprise) await dormir(1000);
            p.repriseA = undefined; maj();
            if (!actif.current) break;
            fenetre = await relancesDerniereHeure();
            continue;
          }
          const r = await envoyerRelances(lot, l.agent?.id, undefined, l.chemins ?? [], {
            voie: relais ? "masse" : "boite", salveId: salveId || undefined,
            avant: { envoyes: p.mails.fait, echecs: p.mails.echecs },
          });
          i += lot.length;
          p.mails.fait += r.envoyes;
          p.mails.echecs += r.echecs;
          p.journal.push(...r.journal);
          fenetre.n += r.envoyes;
          if (!fenetre.premiere && r.envoyes) fenetre.premiere = new Date().toISOString();
          maj();
        }
      }
      for (let i = 0; i < l.sms.length && actif.current; i += LOT_SMS) {
        const s = await relancerParSms(l.sms.slice(i, i + LOT_SMS), l.agent?.nom, l.chemins ?? []);
        p.sms.fait += s.envoyes;
        p.sms.echecs += s.echecs;
        p.journal.push(...s.journal);
        maj();
      }
    } catch (e) {
      p.message = e instanceof Error ? e.message : "L'envoi a échoué.";
    }
    p.enCours = false;
    p.termine = actif.current && !p.message;
    p.arrete = !actif.current;
    p.finieA = Date.now();
    actif.current = false;
    maj();
    try { await l.apres?.(); } catch { /* l'écran d'origine n'est plus là */ }
  };

  return <Ctx.Provider value={{ salve, lancer, arreter, effacer }}>{children}</Ctx.Provider>;
}

export function useSalveRelances(): Contexte {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSalveRelances : SalveRelancesProvider absent de la coquille.");
  return c;
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
          {minutes > 0 ? ` (dans ${minutes} min)` : ""}. Gardez l&apos;application ouverte.
        </span>
      )}
      {p.enCours && !p.repriseA && !compact && (
        <span className="salve-attente">
          {p.voie === "masse" ? "Envoi par le relais SendGrid, sous votre adresse agence." : "Envoi depuis votre boîte."}
          {" "}Vous pouvez fermer cette fenêtre : la pastille en bas de l&apos;écran suit l&apos;envoi. Gardez l&apos;application ouverte.
        </span>
      )}
      {p.message && <span className="rouge">· {p.message}</span>}
      {p.termine && <span>· terminé{echecs > 0 ? `, ${echecs} en échec` : ""}</span>}
      {p.arrete && <span>· arrêté — ce qui est parti est marqué relancé, le reste attend</span>}
      {p.enCours && onArreter && <button type="button" className="fadd" onClick={onArreter}>Arrêter</button>}
      {!p.enCours && p.journal.length > 0 && (
        <details className="salve-journal">
          <summary>{p.journal.length} détail{p.journal.length > 1 ? "s" : ""}</summary>
          <ul>{p.journal.slice(0, 40).map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/**
 * La pastille : en bas de l'écran, sur toutes les pages, tant qu'une salve
 * tourne — et encore une minute après sa fin, pour lire le bilan. Un tap
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
  return (
    <>
      <button type="button" className={`salve-pastille${salve.enCours ? " encours" : salve.message || (salve.mails.fait + salve.sms.fait === 0 && salve.mails.echecs + salve.sms.echecs > 0) ? " rouge" : ""}`}
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
