"use client";

/* L'éditeur avec champs de fusion (retour #108).
 *
 * MAV : « les champs de fusion seront disponibles de façon graphique sympa,
 * pas comme si on était un codeur fou ». Donc : une palette de puces rangées
 * par groupe, un clic pose le champ à l'endroit du curseur, et un aperçu
 * montre le message tel qu'il partira pour un vrai destinataire — pas un
 * exemple inventé.
 */

import { useMemo, useRef, useState } from "react";
import {
  CHAMPS, GROUPES, champParCle, champsInconnus, champsUtilises, fusionner,
  type Groupe, type Valeurs,
} from "@/lib/mails/fusion";

export function PaletteChamps({ onInserer }: { onInserer: (cle: string) => void }) {
  const [groupe, setGroupe] = useState<Groupe>("Personne");
  const [aide, setAide] = useState<string | null>(null);
  const duGroupe = CHAMPS.filter((c) => c.groupe === groupe);

  return (
    <div className="mfx">
      <div className="mfx-h">
        <span className="mfx-t">Champs de fusion</span>
        <span style={{ flex: 1 }} />
        <span className="mfx-aide">Cliquez pour insérer</span>
      </div>
      <div className="mfx-groupes">
        {GROUPES.map((g) => (
          <button key={g} type="button" className={groupe === g ? "on" : undefined}
            onClick={() => { setGroupe(g); setAide(null); }}>
            {g}
          </button>
        ))}
      </div>
      <div className="mfx-puces">
        {duGroupe.map((c) => (
          <button key={c.cle} type="button" className={`mfx-puce${c.sensible ? " sensible" : ""}`}
            onClick={() => onInserer(c.cle)}
            onMouseEnter={() => setAide(c.aide ?? null)}
            onMouseLeave={() => setAide(null)}>
            <b>{c.label}</b>
            <i>{c.exemple}</i>
          </button>
        ))}
      </div>
      {aide && <p className="mfx-note">{aide}</p>}
    </div>
  );
}

/** Rend le texte avec les `{{champs}}` en pastilles lisibles — c'est ce qui
 *  évite d'avoir l'air d'écrire du code. */
export function TexteBalise({ texte }: { texte: string }) {
  const bouts = texte.split(/(\{\{\s*[a-z_]+\s*\}\})/gi);
  return (
    <>
      {bouts.map((b, i) => {
        const m = /^\{\{\s*([a-z_]+)\s*\}\}$/i.exec(b);
        if (!m) return <span key={i}>{b}</span>;
        const champ = champParCle.get(m[1].toLowerCase());
        return champ
          ? <mark key={i} className="mfx-tag">{champ.label}</mark>
          : <mark key={i} className="mfx-tag ko" title="Champ inconnu : il partira tel quel">{m[1]}</mark>;
      })}
    </>
  );
}

export function ZoneRedaction({
  objet, corps, setObjet, setCorps, valeursApercu, nomApercu,
}: {
  objet: string;
  corps: string;
  setObjet: (v: string) => void;
  setCorps: (v: string) => void;
  /** Les valeurs d'un vrai destinataire, pour un aperçu qui ne ment pas. */
  valeursApercu?: Valeurs;
  nomApercu?: string;
}) {
  const zone = useRef<HTMLTextAreaElement>(null);
  const objetRef = useRef<HTMLInputElement>(null);
  const [cible, setCible] = useState<"corps" | "objet">("corps");
  const [apercu, setApercu] = useState(false);

  /** Pose `{{cle}}` là où était le curseur, et rend le curseur juste après. */
  const inserer = (cle: string) => {
    const jeton = `{{${cle}}}`;
    if (cible === "objet") {
      const el = objetRef.current;
      const i = el?.selectionStart ?? objet.length;
      setObjet(objet.slice(0, i) + jeton + objet.slice(el?.selectionEnd ?? i));
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(i + jeton.length, i + jeton.length); });
      return;
    }
    const el = zone.current;
    const i = el?.selectionStart ?? corps.length;
    setCorps(corps.slice(0, i) + jeton + corps.slice(el?.selectionEnd ?? i));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(i + jeton.length, i + jeton.length); });
  };

  const inconnus = useMemo(() => [...new Set([...champsInconnus(objet), ...champsInconnus(corps)])], [objet, corps]);
  const utilises = useMemo(() => [...new Set([...champsUtilises(objet), ...champsUtilises(corps)])]
    .filter((c) => champParCle.has(c)), [objet, corps]);

  const rendu = valeursApercu
    ? { objet: fusionner(objet, valeursApercu), corps: fusionner(corps, valeursApercu) }
    : null;

  return (
    <div className="mred">
      <div className="mred-champs">
        <label className="mred-l">
          <span>Objet</span>
          <input ref={objetRef} value={objet} onFocus={() => setCible("objet")}
            onChange={(e) => setObjet(e.target.value)} placeholder="Objet du message" />
        </label>

        {apercu && rendu ? (
          <div className="mred-apercu">
            <div className="mred-apercu-h">
              Aperçu {nomApercu ? <b>pour {nomApercu}</b> : null}
            </div>
            <div className="mred-apercu-o">{rendu.objet.texte || <i>(sans objet)</i>}</div>
            <div className="mred-apercu-c">{rendu.corps.texte}</div>
            {rendu.corps.manquants.length > 0 && (
              <div className="mred-manque">
                Champs vides pour ce destinataire : {rendu.corps.manquants.map((m) => champParCle.get(m)?.label ?? m).join(", ")}
              </div>
            )}
          </div>
        ) : (
          <>
            <label className="mred-l corps">
              <span>Message</span>
              <textarea ref={zone} value={corps} onFocus={() => setCible("corps")}
                onChange={(e) => setCorps(e.target.value)}
                placeholder="Écrivez ici. Insérez les champs de fusion depuis la colonne de droite." />
            </label>
            {utilises.length > 0 && (
              <div className="mred-relu"><TexteBalise texte={corps} /></div>
            )}
          </>
        )}

        <div className="mred-pied">
          {inconnus.length > 0 && (
            <span className="mred-ko">
              ⚠ Champ{inconnus.length > 1 ? "s" : ""} inconnu{inconnus.length > 1 ? "s" : ""} : {inconnus.join(", ")} — partira tel quel
            </span>
          )}
          <span style={{ flex: 1 }} />
          {valeursApercu && (
            <button type="button" className="fadd" onClick={() => setApercu(!apercu)}>
              {apercu ? "✎ Revenir au texte" : "👁 Aperçu réel"}
            </button>
          )}
        </div>
      </div>

      <PaletteChamps onInserer={inserer} />
    </div>
  );
}
