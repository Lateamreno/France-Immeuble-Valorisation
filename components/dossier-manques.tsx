"use client";

/* La liste « ce qui semble incomplet », en tête de la page Dossiers (#182).
 *
 * Le BO d'origine affichait la même liste, mais chaque bouton envoyait sur une
 * autre page : on partait remplir une case, on revenait, on repartait. MAV :
 * « ce serait bien que ce soit des menus déroulants qui permettent directement
 * de remplir ce qu'on a oublié — et que ça modifie dans les pages concernées
 * du bien, bien entendu. »
 *
 * D'où ce compromis : ce qui tient en une case se remplit ici et part vers la
 * fiche ; ce qui demande un tableau (l'état locatif, les photos) garde son
 * bouton, parce qu'un menu déroulant n'y suffirait pas.
 */

import { useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { manquesDossier, type Manque } from "@/lib/bo/completude";
import { reporterCadastre, updateEmplacement, type EmplacementPatch } from "@/lib/bo/actions";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const parse = (s: string) => {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

export function ManquesDossier({ b, onAller }: {
  b: BienData;
  /** Ouvre la section de la fiche qui porte le sujet. */
  onAller: (section: string) => void;
}) {
  const manques = manquesDossier({
    im: b.im, lots: b.lots, parcelles: b.parcelles, photos: b.photos,
    secteur: b.secteur, estimations: b.estimations,
  });
  const [ouvert, setOuvert] = useState<string | null>(null);

  if (manques.length === 0) {
    return (
      <div className="dmq-ok">
        ✓ La fiche est complète : le dossier sortira avec tout ce qu&apos;il faut.
      </div>
    );
  }

  return (
    <div className="dmq">
      {manques.map((m) => (
        <LigneManque
          key={m.cle} m={m} b={b}
          ouvert={ouvert === m.cle}
          onOuvrir={() => setOuvert(ouvert === m.cle ? null : m.cle)}
          onAller={() => onAller(m.section)}
        />
      ))}
    </div>
  );
}

function LigneManque({ m, b, ouvert, onOuvrir, onAller }: {
  m: Manque; b: BienData; ouvert: boolean;
  onOuvrir: () => void; onAller: () => void;
}) {
  const immeubleId = String(b.im._id);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [fait, setFait] = useState(false);

  const remplis = m.champs.filter((c) => (vals[c.cle] ?? "").trim() !== "");

  const enregistrer = () =>
    start(async () => {
      /* Chaque champ retourne à sa place : l'emplacement sur l'immeuble, la
         parcelle dans les parcelles. La fiche est la destination, pas cette
         liste — c'est ce que MAV demande. */
      const emp: Record<string, unknown> = {};
      for (const c of remplis) {
        const v = vals[c.cle].trim();
        if (c.cle === "ref_cadastre") continue;
        if (c.unite === "min" || c.unite === "m²") emp[c.cle] = parse(v);
        else emp[c.cle] = v;
      }
      const cad = remplis.find((c) => c.cle === "ref_cadastre");
      if (cad) {
        await reporterCadastre(immeubleId, vals.ref_cadastre.trim(), parse(vals.ter_surface ?? ""));
        delete emp.ter_surface;
      }
      if (Object.keys(emp).length) await updateEmplacement(immeubleId, emp as EmplacementPatch);
      setFait(true);
    });

  return (
    <div className={`dmq-l${m.bloquant ? " bloq" : ""}${fait ? " ok" : ""}`}>
      <div className="dmq-h">
        <span className="dmq-ic">{fait ? "✓" : m.bloquant ? "!" : "⚠"}</span>
        <span className="dmq-t">
          {fait ? "Enregistré — la fiche est à jour." : m.titre}
          {m.detail && !fait && <i>{m.detail}</i>}
        </span>
        {m.champs.length > 0 && !fait && (
          <button type="button" className="fadd" onClick={onOuvrir}>
            {ouvert ? "Replier" : "Compléter ici"}
          </button>
        )}
        <button type="button" className="kgo" onClick={onAller}>
          <span className="ch">›</span> Ouvrir la page
        </button>
      </div>

      {ouvert && !fait && (
        <div className="dmq-f">
          {m.champs.map((c) => (
            <label key={c.cle} className="dmq-c">
              <span>{c.label}</span>
              {c.options ? (
                <select value={vals[c.cle] ?? ""} onChange={(e) => setVals({ ...vals, [c.cle]: e.target.value })}>
                  <option value="">À renseigner</option>
                  {c.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  value={vals[c.cle] ?? ""} placeholder={S(c.valeur)}
                  onChange={(e) => setVals({ ...vals, [c.cle]: e.target.value })}
                />
              )}
              {c.unite && <i>{c.unite}</i>}
            </label>
          ))}
          <button
            type="button" className="savebar-go"
            disabled={pending || remplis.length === 0}
            style={pending || remplis.length === 0 ? { opacity: 0.5 } : undefined}
            onClick={enregistrer}
          >{pending ? "Enregistrement…" : "❯ Enregistrer"}</button>
        </div>
      )}
    </div>
  );
}
