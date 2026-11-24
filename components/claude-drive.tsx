"use client";

/**
 * « Depuis le Drive » : Claude lit le dossier du bien sur le Drive commun et
 * propose l'état locatif (MAV, 27/10). Ce composant porte la fenêtre de
 * lancement et le bandeau de suivi ; le tableau, lui, charge la proposition
 * comme des modifications en attente (lots-editor.tsx), que l'agent relit
 * puis enregistre ou annule. Rien n'est écrit sans lui.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { Modale } from "@/components/modale";
import { closDemande, lancerDriveBo, suivreDemande, type DemandeVue } from "@/lib/bo/claude-actions";

type Doc = { titre?: string; url?: string; note?: string };
/** Ce que le tableau a repris : lots complétés, lots neufs, et combien de lots par rubrique. */
type Charge = { maj: number; nouveaux: number; champs: Record<string, number> };

const ilYa = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 1 ? "à l'instant" : min < 60 ? `il y a ${min} min` : `il y a ${Math.round(min / 60)} h`;
};

export function ClaudeDrive({ immeubleId, dossier, ouvert, onFermer, onCharger }: {
  immeubleId: string;
  /** Le dossier Drive déjà retenu pour ce bien, s'il y en a un. */
  dossier?: string;
  ouvert: boolean;
  onFermer: () => void;
  /** Charge la matrice dans le tableau ; rend ce qui a été chargé. */
  onCharger: (matrice: string) => Charge;
}) {
  const [d, setD] = useState<DemandeVue | null>(null);
  const [lien, setLien] = useState(dossier ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [pending, start] = useTransition();

  const relire = useCallback(async () => {
    try { setD(await suivreDemande(immeubleId, "drive_bo")); } catch { /* le bandeau garde son état */ }
  }, [immeubleId]);

  useEffect(() => {
    let vivant = true;
    suivreDemande(immeubleId, "drive_bo").then((x) => { if (vivant) setD(x); }).catch(() => undefined);
    return () => { vivant = false; };
  }, [immeubleId]);

  /* Tant que Claude travaille, on relit toutes les quinze secondes : une tâche
     dure de une à quelques minutes. */
  const enCours = d?.statut === "envoyee" || d?.statut === "en_cours";
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => void relire(), 15_000);
    return () => clearInterval(t);
  }, [enCours, relire]);

  const lancer = () => start(async () => {
    setErreur(null);
    const r = await lancerDriveBo(immeubleId, lien).catch(() => ({ ok: false as const, message: "Le BO n'a pas répondu." }));
    if (!r.ok) { setErreur(r.message); return; }
    setD(r.demande);
    setCharge(null);
    onFermer();
  });

  const charger = () => {
    const matrice = typeof d?.resultat?.matrice === "string" ? d.resultat.matrice : "";
    if (!d || !matrice) return;
    setCharge(onCharger(matrice));
    start(async () => { await closDemande(d.id, "chargee", immeubleId); await relire(); });
  };
  const ecarter = () => d && start(async () => { await closDemande(d.id, "refusee"); await relire(); });

  const r = d?.resultat ?? {};
  const docs = (Array.isArray(r.documents) ? r.documents : []) as Doc[];
  const alertes = (Array.isArray(r.alertes) ? r.alertes : []) as string[];
  const dos = r.dossier as Doc | null | undefined;

  return (
    <>
      {charge && (
        <div className="claude-avis ok">
          <b>Proposition de Claude chargée</b> : {charge.maj} lot{charge.maj > 1 ? "s" : ""} complété{charge.maj > 1 ? "s" : ""}
          {charge.nouveaux > 0 && <>, {charge.nouveaux} nouveau{charge.nouveaux > 1 ? "x" : ""}</>}.
          {Object.keys(charge.champs).length > 0 && (
            <> Ce qui change : {Object.entries(charge.champs).sort((a, b) => b[1] - a[1])
              .map(([k, n]) => `${k} (${n} lot${n > 1 ? "s" : ""})`).join(", ")}.</>
          )}
          {" "}Les cases encadrées d&apos;or sont celles que Claude change, l&apos;ancienne valeur au survol ;
          locataires et baux se relisent dans leurs vues. Rien n&apos;est enregistré : relisez, puis Enregistrer ou Annuler.
          <button type="button" onClick={() => setCharge(null)} aria-label="Fermer">✕</button>
        </div>
      )}

      {d && enCours && (
        <div className="claude-avis">
          <span className="claude-pt" aria-hidden />
          Claude lit le dossier Drive ({ilYa(d.cree_le)}). La proposition apparaîtra ici.
          {d.session_url && <a href={d.session_url} target="_blank" rel="noreferrer">Suivre son travail</a>}
        </div>
      )}

      {d?.statut === "erreur" && (
        <div className="claude-avis ko">
          <b>Claude n&apos;a pas abouti</b> : {d.message ?? "raison inconnue"}
          {d.session_url && <a href={d.session_url} target="_blank" rel="noreferrer">Voir sa session</a>}
        </div>
      )}

      {d?.statut === "prete" && !charge && (
        <div className="claude-prop">
          <div className="claude-prop-t">
            <b>Claude propose un état locatif</b> — {String(r.lots ?? "?")} lot{Number(r.lots) > 1 ? "s" : ""} lu{Number(r.lots) > 1 ? "s" : ""}
            {dos?.url && <> dans <a href={dos.url} target="_blank" rel="noreferrer">{dos.titre || "le dossier Drive"}</a></>}
            <span className="claude-prop-q">{ilYa(d.maj_le)}</span>
          </div>
          {typeof r.resume === "string" && r.resume && <p>{r.resume}</p>}
          {alertes.length > 0 && (
            <ul className="claude-alertes">{alertes.map((a, i) => <li key={i}>{a}</li>)}</ul>
          )}
          {docs.length > 0 && (
            <details>
              <summary>{docs.length} pièce{docs.length > 1 ? "s" : ""} lue{docs.length > 1 ? "s" : ""}</summary>
              <ul>{docs.map((x, i) => (
                <li key={i}>{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.titre || x.url}</a> : x.titre}
                  {x.note && <span> — {x.note}</span>}</li>
              ))}</ul>
            </details>
          )}
          <div className="claude-prop-b">
            <button type="button" className="ltb lbl" onClick={ecarter} disabled={pending}>Écarter</button>
            <button type="button" className="kgo" onClick={charger} disabled={pending}>
              <span className="ch">›</span> Charger dans le tableau
            </button>
          </div>
        </div>
      )}

      {ouvert && (
        <Modale titre="Remplir depuis le Drive" onFermer={onFermer} className="etroit"
          pied={(
            <>
              <button type="button" className="ltb annul" onClick={onFermer}>Annuler</button>
              <button type="button" className="kgo" onClick={lancer} disabled={pending || enCours}>
                <span className="ch">›</span> {pending ? "Lancement…" : "Lancer Claude"}
              </button>
            </>
          )}>
          <p className="mhint">
            Claude ouvre le dossier du bien sur le Drive commun, lit l&apos;état locatif, les baux et les
            diagnostics, et propose les lots, les baux et les locataires. Vous relisez la proposition
            dans le tableau avant d&apos;enregistrer : il ne modifie rien lui-même.
          </p>
          <span className="mlab">Lien du dossier Drive (facultatif)</span>
          <input className="min" value={lien} onChange={(e) => setLien(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…" />
          <p className="mhint">Sans lien, Claude cherche le dossier dans « 1 - Clients » par la ville et l&apos;adresse.</p>
          {enCours && <p className="mhint">Une lecture est déjà en cours pour ce bien.</p>}
          {erreur && <p className="claude-err">{erreur}</p>}
        </Modale>
      )}
    </>
  );
}
