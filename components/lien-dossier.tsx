"use client";

/**
 * Le lien transfer.it d'un dossier et sa date de fin, à poser et à changer
 * depuis la fiche (MAV, 28/09 : « il faudrait un endroit où on peut mettre
 * nous-mêmes le lien, par exemple dans la partie dossier. Comme ça si je
 * change, je peux changer directement pour les envois. »)
 *
 * Objet partagé (§13) : le même bloc sert la liste des dossiers de la fiche
 * et la fin de la modale « Nouveau dossier », où il s'ouvre tout seul —
 * « à chaque modification de dossier tu demandes le nouveau lien transfer.it
 * et sa date de validité (en base c'est 89 jours) ».
 */
import { useState, useTransition } from "react";
import { majLienDossier } from "@/lib/bo/actions";
import { dateLien, expirationParDefaut, lienDuDossier, lienValide, PREAVIS_LIEN_JOURS, VALIDITE_LIEN_JOURS } from "@/lib/bo/lien-dossier";

export function LienDossier({ immeubleId, dossier, ouvert = false, compact = false, onEnregistre }: {
  immeubleId: string;
  /** Le document du dossier (au moins `_id`, `version`, et le lien s'il existe). */
  dossier: Record<string, unknown>;
  /** Formulaire déplié d'emblée : la modale de création s'en sert. */
  ouvert?: boolean;
  compact?: boolean;
  /** Prévenu quand un lien est posé : l'écran qui attendait ce lien pour
   *  envoyer se met à jour sans recharger (MAV, 28/09). */
  onEnregistre?: (lien: { url: string; expireLe?: string }) => void;
}) {
  const etat = lienDuDossier(dossier);
  const [edite, setEdite] = useState(ouvert);
  const [url, setUrl] = useState(etat?.url ?? "");
  /* Retour #442 : « il me le faut en jours ». On saisit la validité, la date
     de fin en découle, depuis aujourd'hui. */
  const [jours, setJours] = useState(VALIDITE_LIEN_JOURS);
  const fin = expirationParDefaut(new Date(), jours);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dossierId = String(dossier._id ?? "");

  const enregistrer = () =>
    start(async () => {
      setMsg(null);
      const r = await majLienDossier(immeubleId, dossierId, url, fin);
      if (!r.ok) { setMsg(r.message); return; }
      setMsg(url.trim() ? `Lien enregistré, valable jusqu'au ${dateLien(r.expireLe)}.` : "Lien retiré.");
      setEdite(false);
      if (url.trim()) onEnregistre?.({ url: url.trim(), expireLe: r.expireLe });
    });

  return (
    <div className={`ldos${compact ? " compact" : ""}`}>
      {!edite && (
        <div className="ldos-l">
          {etat ? (
            <>
              <a className={`ldos-a${etat.perime ? " perime" : etat.bientot ? " bientot" : ""}`} href={etat.url} target="_blank" rel="noreferrer"
                title={etat.url}>
                Lien transfer.it {etat.perime ? "périmé" : etat.bientot ? "à remplacer" : "✓"}
              </a>
              <span className={`ldos-d${etat.perime ? " perime" : etat.bientot ? " bientot" : ""}`}>
                {etat.expireLe
                  ? etat.perime
                    ? `expiré le ${dateLien(etat.expireLe)}`
                    : `valable jusqu'au ${dateLien(etat.expireLe)}${etat.bientot ? ` — plus que ${etat.joursRestants} j, sous la réserve de ${PREAVIS_LIEN_JOURS}` : ""}`
                  : "sans date de fin"}
              </span>
            </>
          ) : (
            <span className="ldos-d absent">Aucun lien transfer.it sur ce dossier</span>
          )}
          <button type="button" className="fadd" onClick={() => { setEdite(true); setMsg(null); }}>
            {etat ? "Changer le lien" : "Ajouter le lien"}
          </button>
          {msg && <span className="ldos-m">{msg}</span>}
        </div>
      )}
      {edite && (
        <div className="ldos-f">
          <label className="ldos-c">
            <span className="mlab">Lien transfer.it</span>
            <input className="min" type="url" placeholder="https://transfer.it/t/…" value={url}
              onChange={(e) => setUrl(e.target.value)} autoFocus />
          </label>
          <label className="ldos-c">
            <span className="mlab">Validité (jours)</span>
            <span className="ldos-j">
              <input className="min" type="number" min={1} max={365} value={jours}
                onChange={(e) => setJours(Math.max(1, Math.min(365, Number(e.target.value) || 0)))} />
              <i>→ jusqu&apos;au {dateLien(fin)}</i>
            </span>
          </label>
          <div className="ldos-b">
            <a className="asst-tr-mini" href="https://transfer.it/start" target="_blank" rel="noreferrer"
              title="Déposer le dossier, les photos et les plans sur transfer.it et récupérer le lien">
              Créer le lien sur transfer.it
            </a>
            <span className="sp" style={{ flex: 1 }} />
            <button type="button" className="fadd" onClick={() => { setEdite(false); setMsg(null); }}>Annuler</button>
            <button type="button" className="kgo" disabled={pending || (!!url.trim() && !lienValide(url))} onClick={enregistrer}>
              <span className="ch">›</span> Enregistrer
            </button>
          </div>
          <div className="asst-note">
            transfer.it garde un envoi {VALIDITE_LIEN_JOURS}&nbsp;jours : c&apos;est la validité proposée. Avec une réserve
            de {PREAVIS_LIEN_JOURS}&nbsp;jours : dès qu&apos;il reste moins de {PREAVIS_LIEN_JOURS}&nbsp;jours, le BO vous demande
            un nouveau lien avant tout envoi (le PDF, lui, est toujours joint).
          </div>
          {msg && <div className="dif-simu">{msg}</div>}
        </div>
      )}
    </div>
  );
}
