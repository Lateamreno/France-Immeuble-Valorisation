"use client";

/**
 * Une salve de relances qui se conduit toute seule, avec sa progression.
 *
 * MAV, 29/09 : « j'ai appuyé sur Envoyer mais rien ne se passe » — et : « pour
 * la limite de 150 je ne veux pas avoir à la gérer moi-même : tu envoies les
 * 150, tu attends un certain temps, et tu envoies le reste tout seul en
 * m'indiquant bien le nombre ».
 *
 * Deux défauts derrière le premier constat. Le bouton se contentait de se
 * griser pendant l'envoi, sans rien dire. Et l'envoi entier partait dans UN
 * appel au serveur, que Vercel coupe au bout de soixante secondes : sur
 * Argenteuil, dix-huit e-mails sont partis avant la coupure, et l'écran n'a
 * rien montré.
 *
 * D'où cette forme :
 *   • l'envoi part par petits paquets, un appel serveur par paquet, et le
 *     compteur avance à chaque paquet — « 42 / 226 e-mails envoyés » ;
 *   • le plafond de la boîte (`PLAFOND_RELANCES` par heure glissante, la
 *     boîte de MAV est chez OVH qui limite à l'heure) est tenu ICI : quand il
 *     est atteint, la salve attend l'heure qui libère la fenêtre, l'écran
 *     compte à rebours, puis elle repart sans qu'on touche à rien ;
 *   • la fenêtre se lit dans la base (les propositions marquées relancées dans
 *     l'heure), pas en mémoire : fermer la page et revenir ne fait pas
 *     repartir à zéro ;
 *   • « Arrêter » coupe proprement : ce qui est parti reste marqué relancé,
 *     ce qui n'est pas parti reste à relancer.
 *
 * La page doit rester ouverte pendant l'envoi : c'est le navigateur qui
 * conduit. On le dit à l'écran.
 */
import { useEffect, useRef, useState } from "react";
import { envoyerRelances, relancesDerniereHeure } from "@/lib/bo/relances-actions";
import { relancerParSms } from "@/lib/bo/propositions-actions";
import { PLAFOND_RELANCES } from "@/lib/bo/relances";

export type EnvoiRelance = {
  contactId: string; email: string; objet: string; corps: string; propositionIds: string[]; immeubleIds?: string[];
};
export type EnvoiSmsRelance = {
  contactId?: string; tel?: string; immeubleId: string; libelle: string; propositionIds: string[]; texte?: string;
};

export type ProgresSalve = {
  mails: { fait: number; total: number; echecs: number };
  sms: { fait: number; total: number; echecs: number };
  enCours: boolean;
  /** L'heure (ms) à laquelle la salve repartira : la boîte a atteint son plafond. */
  repriseA?: number;
  journal: string[];
  message?: string;
  termine?: boolean;
  arrete?: boolean;
};

/* Six e-mails par appel : avec le PDF joint, un appel tient en une dizaine de
   secondes, loin de la coupure. Les SMS partent par vingt-cinq, MailingVox
   répond vite. */
const LOT_MAILS = 6;
const LOT_SMS = 25;
const HEURE = 3_600_000;
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useSalveRelances(agent?: { id?: string; nom?: string }, chemins: string[] = []) {
  const [progres, setProgres] = useState<ProgresSalve | null>(null);
  const actif = useRef(false);
  /* Quitter l'écran arrête la salve : le paquet en cours finit côté serveur,
     rien d'autre ne part. */
  useEffect(() => () => { actif.current = false; }, []);

  const arreter = () => { actif.current = false; };

  const lancer = async (mails: EnvoiRelance[], sms: EnvoiSmsRelance[], apres?: () => Promise<void> | void) => {
    actif.current = true;
    const p: ProgresSalve = {
      mails: { fait: 0, total: mails.length, echecs: 0 },
      sms: { fait: 0, total: sms.length, echecs: 0 },
      enCours: true, journal: [],
    };
    const maj = () => setProgres({ ...p, mails: { ...p.mails }, sms: { ...p.sms }, journal: [...p.journal] });
    maj();
    try {
      let fenetre = mails.length ? await relancesDerniereHeure() : { n: 0, premiere: null as string | null };
      for (let i = 0; i < mails.length && actif.current;) {
        const lot = mails.slice(i, i + LOT_MAILS);
        if (fenetre.n + lot.length > PLAFOND_RELANCES && fenetre.premiere) {
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
        const r = await envoyerRelances(lot, agent?.id, undefined, chemins);
        i += lot.length;
        p.mails.fait += r.envoyes;
        p.mails.echecs += r.echecs;
        p.journal.push(...r.journal);
        fenetre.n += r.envoyes;
        if (!fenetre.premiere && r.envoyes) fenetre.premiere = new Date().toISOString();
        maj();
      }
      for (let i = 0; i < sms.length && actif.current; i += LOT_SMS) {
        const s = await relancerParSms(sms.slice(i, i + LOT_SMS), agent?.nom, chemins);
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
    actif.current = false;
    maj();
    await apres?.();
  };

  return { progres, lancer, arreter, effacer: () => setProgres(null) };
}

const heureDe = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** La ligne de progression, à poser dans la fenêtre ou l'écran qui envoie. */
export function ProgresSalveRelances({ p, onArreter }: { p: ProgresSalve; onArreter?: () => void }) {
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
  const ton = p.enCours ? " encours" : p.message ? " rouge-b" : p.termine ? " ok" : "";
  return (
    <div className={`asst-prog salve-prog${ton}`}>
      <svg viewBox="0 0 24 24" aria-hidden><path d="M3 7.5 12 13l9-5.5" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
      {p.mails.total > 0 && (
        <span><b>{p.mails.fait} / {p.mails.total}</b> e-mail{p.mails.total > 1 ? "s" : ""} envoyé{p.mails.total > 1 ? "s" : ""}
          {p.mails.echecs > 0 && <span className="rouge"> · {p.mails.echecs} en échec</span>}</span>
      )}
      {p.sms.total > 0 && (
        <span><b>{p.sms.fait} / {p.sms.total}</b> SMS envoyé{p.sms.total > 1 ? "s" : ""}
          {p.sms.echecs > 0 && <span className="rouge"> · {p.sms.echecs} en échec</span>}</span>
      )}
      {p.enCours && <i className="asst-spin" aria-hidden />}
      {p.repriseA && (
        <span className="salve-attente">
          La boîte a atteint {PLAFOND_RELANCES} e-mails dans l&apos;heure : la suite part toute seule à {heureDe(p.repriseA)}
          {minutes > 0 ? ` (dans ${minutes} min)` : ""}. Gardez cette page ouverte.
        </span>
      )}
      {p.enCours && !p.repriseA && <span className="salve-attente">Envoi en cours, gardez cette page ouverte.</span>}
      {p.message && <span className="rouge">· {p.message}</span>}
      {p.termine && <span>· terminé</span>}
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
