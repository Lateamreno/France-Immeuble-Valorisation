"use client";

/* La cloche « Réponses » du menu de gauche (MAV, 12/11 : « il faut que la
 * cloche soit sur la sidebar de gauche afin qu'elle soit toujours apparente »).
 *
 * Elle compte les réponses des acquéreurs aux dossiers que la personne
 * connectée a envoyés — e-mail, SMS, carte RCS, compte du site — et ouvre leur
 * liste. Sur chaque réponse, des gestes : traiter, noter un retour, refuser,
 * appeler, voir la proposition ; le nom ouvre la fiche contact habituelle.
 * Une réponse reste là jusqu'au clic « Traité ». Le son vient de sons.tsx. */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuestion } from "@/components/modale";
import { VignetteContact } from "@/components/vignette-contact";
import { chargerMesReponses, compterMesReponses, noterEtTraiter, refuserEtTraiter, traiterReponses } from "@/lib/bo/reponses-actions";
import type { Canal, Reponse } from "@/lib/bo/reponses";

export const CANAUX: Record<Canal, { court: string; ton: string }> = {
  email: { court: "E-mail", ton: "mail" },
  sms: { court: "SMS", ton: "sms" },
  rcs_interesse: { court: "Intéressé · RCS", ton: "oui" },
  rcs_dossier: { court: "Dossier téléchargé · RCS", ton: "rcs" },
  rcs_non: { court: "Pas intéressé · RCS", ton: "non" },
  site: { court: "Compte du site", ton: "site" },
};

/** « il y a 4 min », « hier 19:12 », « 08/11 ». */
export function ilYa(iso: string, maintenant = Date.now()): string {
  const d = new Date(iso);
  const s = Math.max(0, (maintenant - d.getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const jour = (x: Date) => x.toLocaleDateString("fr-FR");
  if (jour(d) === jour(new Date(maintenant))) return `aujourd'hui ${heure}`;
  if (jour(d) === jour(new Date(maintenant - 86_400_000))) return `hier ${heure}`;
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${heure}`;
}

const initiales = (nom?: string) =>
  (nom ?? "?").replace(/^(M\.|Mme|Monsieur|Madame)\s+/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase() || "?";

/** Une réponse et ses gestes : partagée par la cloche, la fiche du bien et le tableau de bord. */
export function LigneReponse({ r, onFait, compacte, sansBien }: {
  r: Reponse;
  /** Après un geste : relire la liste. */
  onFait: () => void;
  compacte?: boolean;
  /** Sur la fiche du bien, inutile de répéter le bien. */
  sansBien?: boolean;
}) {
  const { confirmer, saisir, question } = useQuestion();
  const [pending, start] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const c = CANAUX[r.canal];
  const avecTexte = r.texte && (r.canal === "email" || r.canal === "sms" || r.canal === "site");
  const prevenir = () => { window.dispatchEvent(new Event("bo:reponses")); onFait(); };
  const geste = (f: () => Promise<{ ok: boolean; message?: string } | void>) =>
    start(async () => {
      setErreur(null);
      const res = await f().catch((e) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
      if (res && !res.ok) { setErreur(res.message ?? "Échec."); return; }
      prevenir();
    });
  const lienBien = r.immeubleId ? `/bien/${r.immeubleId}?ecran=propositions` : undefined;
  return (
    <div className={`rep-l${r.traiteLe ? " traitee" : ""}${compacte ? " compacte" : ""}`}>
      <span className="rep-av" aria-hidden>{initiales(r.contact?.nom)}</span>
      <div className="rep-c">
        <div className="rep-1">
          {/* #620 : le nom ouvre la vignette contact habituelle du BO, sur place. */}
          {r.contactId && r.contact
            ? <span className="rep-nom"><VignetteContact v={{ id: r.contactId, ...r.contact }} immeuble={r.bien?.libelle} /></span>
            : <b className="rep-nom">{r.contact?.nom ?? "Contact"}</b>}
          <span className={`rep-canal ${c.ton}`}>{c.court}</span>
          <span className="rep-quand" title={new Date(r.recuLe).toLocaleString("fr-FR")}>{ilYa(r.recuLe)}</span>
        </div>
        {!sansBien && r.bien && (
          <div className="rep-bien">
            {lienBien ? <Link href={lienBien}>{r.bien.libelle}</Link> : r.bien.libelle}
            {r.bien.prix && <> · {r.bien.prix}</>}
            {r.statut && r.statut !== "Envoyée" && <> · <i>{r.statut}</i></>}
          </div>
        )}
        {avecTexte && (
          <button type="button" className={`rep-txt${ouvert ? " ouvert" : ""}`} onClick={() => setOuvert((v) => !v)}
            title={ouvert ? "Replier" : "Lire tout"}>
            « {r.texte} »
          </button>
        )}
        {!r.traiteLe && (
          <div className="rep-gestes">
            <button type="button" className="rep-b ok" disabled={pending} onClick={() => geste(() => traiterReponses([r.id], r.immeubleId))}>Traité</button>
            <button type="button" className="rep-b" disabled={pending} onClick={async () => {
              const t = await saisir(`Ce que ${r.contact?.nom ?? "l'acquéreur"} a répondu (la note va sur la proposition) :`, {
                titre: "Noter un retour", oui: "Noter et traiter", obligatoire: true, multiligne: true, placeholder: "Il veut visiter la semaine prochaine…",
              });
              if (t) geste(() => noterEtTraiter({ propositionId: r.propositionId, immeubleId: r.immeubleId, texte: t }));
            }}>Noter un retour</button>
            {r.contact?.tel && <a className="rep-b" href={`tel:${r.contact.tel.replace(/[^\d+]/g, "")}`}>Appeler {r.contact.tel}</a>}
            {lienBien && !sansBien && <Link className="rep-b" href={lienBien}>Voir la proposition</Link>}
            {r.immeubleId && r.statut === "Envoyée" && (
              <button type="button" className="rep-b danger" disabled={pending} onClick={async () => {
                const motif = await saisir("Motif du refus :", {
                  titre: "Refuser la proposition", oui: "Refuser", obligatoire: true,
                  initial: r.canal === "rcs_non" ? "Pas intéressé" : "", placeholder: "Pas intéressé, prix trop élevé…",
                });
                if (!motif) return;
                if (!(await confirmer(`Refuser la proposition de ${r.contact?.nom ?? "cet acquéreur"} ? Ses relances seront coupées.`, { titre: "Refuser", oui: "Refuser", danger: true }))) return;
                geste(() => refuserEtTraiter({ propositionId: r.propositionId, immeubleId: r.immeubleId!, motif }));
              }}>Refuser</button>
            )}
          </div>
        )}
        {erreur && <span className="rep-err" role="alert">{erreur}</span>}
      </div>
      {question}
    </div>
  );
}

const CLOCHE = <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />;

/** L'entrée du menu et son panneau. */
export function Cloche() {
  const router = useRouter();
  const params = useSearchParams();
  /* Le lien du récapitulatif par e-mail (« ?reponses=1 ») ouvre le panneau. */
  const [ouvert, setOuvert] = useState(() => params.get("reponses") === "1");
  const [total, setTotal] = useState(0);
  const [quoi, setQuoi] = useState<"a_traiter" | "toutes">("a_traiter");
  const [liste, setListe] = useState<Reponse[] | null>(null);
  const [pending, start] = useTransition();
  const panneau = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);

  const compter = useCallback(() => { compterMesReponses().then(setTotal).catch(() => undefined); }, []);
  const charger = useCallback((q: "a_traiter" | "toutes") => {
    chargerMesReponses(q).then((r) => { setListe(r.reponses); setTotal(r.total); }).catch(() => setListe([]));
  }, []);

  /* Le compte : au chargement, à chaque son de réponse, au retour sur l'onglet, et toutes les deux minutes. */
  useEffect(() => {
    compter();
    const relire = () => { compter(); if (ouvert) charger(quoi); };
    window.addEventListener("bo:reponses", relire);
    window.addEventListener("focus", compter);
    const t = setInterval(compter, 120_000);
    return () => { window.removeEventListener("bo:reponses", relire); window.removeEventListener("focus", compter); clearInterval(t); };
  }, [compter, charger, ouvert, quoi]);

  useEffect(() => { if (ouvert) charger(quoi); }, [ouvert, quoi, charger]);

  /* Échap, ou un clic hors du panneau (hors d'une fenêtre de saisie), le ferme. */
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".modal-ov")) setOuvert(false); };
    const clic = (e: MouseEvent) => {
      const cible = e.target as Node;
      if (panneau.current?.contains(cible) || bouton.current?.contains(cible)) return;
      if ((cible as Element).closest?.(".modal-ov")) return;
      setOuvert(false);
    };
    window.addEventListener("keydown", touche);
    window.addEventListener("mousedown", clic);
    return () => { window.removeEventListener("keydown", touche); window.removeEventListener("mousedown", clic); };
  }, [ouvert]);

  /* Le panneau vit hors du menu (portail) : sinon il hérite des styles des
     liens du menu et de sa pile d'affichage. Rien côté serveur. */
  const monte = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const aTraiter = (liste ?? []).filter((r) => !r.traiteLe);
  return (
    <>
      <button ref={bouton} type="button" className={`rail-cloche${ouvert ? " sel" : ""}${total > 0 ? " actif" : ""}`}
        aria-expanded={ouvert} aria-haspopup="dialog" onClick={() => setOuvert((v) => !v)}
        title={total > 0 ? `${total} réponse${total > 1 ? "s" : ""} d'acquéreur à traiter` : "Réponses des acquéreurs"}>
        <span className="sic"><svg viewBox="0 0 24 24">{CLOCHE}</svg></span>
        Réponses
        {total > 0 && <span className="rail-badge">{total > 99 ? "99+" : total}</span>}
      </button>
      {ouvert && monte && createPortal(
        <div ref={panneau} className="rep-panneau" role="dialog" aria-label="Réponses des acquéreurs">
          <div className="rep-h">
            <b>Réponses aux envois de dossier</b>
            {quoi === "a_traiter" && aTraiter.length > 1 && (
              <button type="button" className="rep-lien" disabled={pending}
                onClick={() => start(async () => { await traiterReponses(aTraiter.map((r) => r.id)); charger(quoi); window.dispatchEvent(new Event("bo:reponses")); router.refresh(); })}>
                Tout marquer traité
              </button>
            )}
            <button type="button" className="rep-x" aria-label="Fermer" onClick={() => setOuvert(false)}>×</button>
          </div>
          <div className="rep-onglets" role="tablist">
            <button type="button" role="tab" aria-selected={quoi === "a_traiter"} className={quoi === "a_traiter" ? "on" : undefined} onClick={() => setQuoi("a_traiter")}>
              À traiter{total > 0 && <span>{total}</span>}
            </button>
            <button type="button" role="tab" aria-selected={quoi === "toutes"} className={quoi === "toutes" ? "on" : undefined} onClick={() => setQuoi("toutes")}>
              Toutes (30 jours)
            </button>
          </div>
          <div className="rep-liste">
            {liste === null && <div className="rep-vide">Lecture…</div>}
            {liste && liste.length === 0 && (
              <div className="rep-vide">{quoi === "a_traiter" ? "Aucune réponse à traiter. Les réponses aux dossiers que vous envoyez arrivent ici, avec un son." : "Aucune réponse depuis trente jours."}</div>
            )}
            {liste?.map((r) => <LigneReponse key={r.id} r={r} onFait={() => { charger(quoi); router.refresh(); }} />)}
          </div>
          <p className="rep-pied">Vous recevez aussi un récapitulatif par e-mail à 8 h et à 14 h.</p>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Sur la fiche du bien, à côté de « Propositions » : les réponses encore à traiter (MAV, 12/11). */
export function PastilleReponsesBien({ immeubleId }: { immeubleId: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    const relire = () => {
      import("@/lib/bo/reponses-actions")
        .then((m) => m.chargerReponsesDuBien(immeubleId))
        .then((r) => { if (vivant) setN(r.length); })
        .catch(() => undefined);
    };
    relire();
    window.addEventListener("bo:reponses", relire);
    return () => { vivant = false; window.removeEventListener("bo:reponses", relire); };
  }, [immeubleId]);
  if (n === 0) return null;
  return <span className="rep-pastille" title={`${n} réponse${n > 1 ? "s" : ""} d'acquéreur à traiter`}>{n}</span>;
}

/** Le bloc replié ou ouvert, mémorisé sur le poste (#619 : « repliable pour pas qu'il prenne toute la place »). */
const CLE_BLOC = "fi_reponses_bloc";
const abonnesBloc = new Set<() => void>();
const lireBlocOuvert = () => { try { return localStorage.getItem(CLE_BLOC) === "ouvert"; } catch { return false; } };
function poserBlocOuvert(v: boolean) {
  try { localStorage.setItem(CLE_BLOC, v ? "ouvert" : "replie"); } catch { /* navigation privée */ }
  abonnesBloc.forEach((f) => f());
}

/** Le bloc « Réponses à traiter » du tableau de bord (MAV, 12/11). Replié par défaut. */
export function BlocReponses({ reponses, total, qui }: { reponses: Reponse[]; total: number; qui?: string }) {
  const router = useRouter();
  const ouvert = useSyncExternalStore((f) => { abonnesBloc.add(f); return () => { abonnesBloc.delete(f); }; }, lireBlocOuvert, () => false);
  if (total === 0) return null;
  const n = (f: (r: Reponse) => boolean) => reponses.filter(f).length;
  const compteurs = ([
    ["Intéressés", n((r) => r.canal === "rcs_interesse")],
    ["E-mails", n((r) => r.canal === "email")],
    ["SMS", n((r) => r.canal === "sms")],
    ["Compte du site", n((r) => r.canal === "site")],
    ["Pas intéressés", n((r) => r.canal === "rcs_non")],
  ] as [string, number][]).filter(([, v]) => v > 0);
  return (
    <section className={`rep-bloc${ouvert ? "" : " replie"}`} aria-label="Réponses à traiter">
      <button type="button" className="rep-bloc-h" aria-expanded={ouvert} onClick={() => poserBlocOuvert(!ouvert)}
        title={ouvert ? "Replier" : "Déplier"}>
        <svg className="rep-chev" viewBox="0 0 24 24" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
        <b>Réponses à traiter{qui ? ` · ${qui}` : ""}</b>
        <span className="rail-badge">{total}</span>
        <span className="rep-bloc-c">{compteurs.map(([l, v]) => <span key={l}><b>{v}</b> {l}</span>)}</span>
      </button>
      {ouvert && (
        <>
          <div className="rep-bloc-l">
            {reponses.slice(0, 6).map((r) => <LigneReponse key={r.id} r={r} compacte onFait={() => router.refresh()} />)}
          </div>
          {total > 6 && <p className="rep-pied">Et {total - 6} autre{total - 6 > 1 ? "s" : ""} : la cloche « Réponses » du menu les montre toutes.</p>}
        </>
      )}
    </section>
  );
}
