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
import {
  LIGNE_TAXE_FONCIERE, manquesDossier, type LienSource, type Manque,
} from "@/lib/bo/completude";
import {
  addCharge, reporterCadastre, updateBien, updateCharge, updateContact, updateEmplacement,
  type EmplacementPatch,
} from "@/lib/bo/actions";
import { copierTexte } from "@/components/copier";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const parse = (s: string) => {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

/* Ces clés ne sont PAS des colonnes d'emplacement : elles ont chacune leur
   destination, traitée à part dans `enregistrer`. Sans cette liste, elles
   partaient dans le patch de l'immeuble et disparaissaient sans bruit. */
const HORS_EMPLACEMENT = new Set([
  "ref_cadastre", "profil_vendeur", "Motif_vente", "year_constru", "taxe_fonciere",
]);

/**
 * Le lien qui va chercher l'information (retour #204).
 *
 * Certaines sources n'ont pas de recherche par URL — le cadastre, l'ADEME :
 * on copie l'adresse au presse-papier au moment du clic, il n'y a plus qu'à
 * coller dans leur formulaire.
 */
function LienAller({ l }: { l: LienSource }) {
  const [copie, setCopie] = useState(false);
  return (
    <a
      className="dmq-lien" href={l.href} target="_blank" rel="noreferrer"
      title={l.copier ? `Ouvre ${l.label} — « ${l.copier} » est copié, il n'y a qu'à coller` : `Ouvrir ${l.label}`}
      onClick={() => {
        if (!l.copier) return;
        void copierTexte(l.copier);
        setCopie(true);
        setTimeout(() => setCopie(false), 2500);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M10 14 20 4M15 4h5v5" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
      </svg>
      {copie ? "adresse copiée" : l.label}
    </a>
  );
}

export function ManquesDossier({ b, onAller }: {
  b: BienData;
  /** Ouvre la section de la fiche qui porte le sujet. */
  onAller: (section: string) => void;
}) {
  const manques = manquesDossier({
    im: b.im, lots: b.lots, parcelles: b.parcelles, photos: b.photos,
    secteur: b.secteur, estimations: b.estimations,
    charges: b.charges, composants: b.composants, proprietaire: b.proprietaire,
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
         parcelle dans les parcelles, le profil sur la fiche du propriétaire,
         la taxe foncière dans les charges. La fiche est la destination, pas
         cette liste — c'est ce que MAV demande. */
      const emp: Record<string, unknown> = {};
      for (const c of remplis) {
        const v = vals[c.cle].trim();
        if (HORS_EMPLACEMENT.has(c.cle)) continue;
        if (c.unite === "min" || c.unite === "m²") emp[c.cle] = parse(v);
        else emp[c.cle] = v;
      }

      const cad = remplis.find((c) => c.cle === "ref_cadastre");
      if (cad) {
        await reporterCadastre(immeubleId, vals.ref_cadastre.trim(), parse(vals.ter_surface ?? ""));
        delete emp.ter_surface;
      }

      /* Le profil vit sur la fiche du propriétaire (#204) : c'est une
         caractéristique de la personne, pas de l'immeuble. */
      const prof = vals.profil_vendeur?.trim();
      const proprioId = S(b.proprietaire?._id);
      if (prof && proprioId) await updateContact(proprioId, { profil: prof });

      const motif = vals.Motif_vente?.trim();
      const annee = parse(vals.year_constru ?? "");
      if (motif || annee !== undefined) {
        await updateBien(immeubleId, {
          ...(motif ? { Motif_vente: motif } : {}),
          ...(annee !== undefined ? { year_constru: annee } : {}),
        });
      }

      /* La taxe foncière est une LIGNE DE CHARGE, pas un champ de l'immeuble :
         on modifie celle qui existe, sinon on la crée — comme le fait l'onglet
         État locatif, pour que les deux écrans écrivent au même endroit. */
      const tf = parse(vals.taxe_fonciere ?? "");
      if (tf !== undefined) {
        const ligne = b.charges.find((c) => S(c.Type_charge) === LIGNE_TAXE_FONCIERE);
        if (ligne) await updateCharge(immeubleId, String(ligne._id), { total_an: tf });
        else await addCharge(immeubleId, { Type_charge: LIGNE_TAXE_FONCIERE, total_an: tf });
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
        {/* Une rubrique qui ne se saisit pas ici garde quand même son lien :
            le DPE se cherche à l'ADEME même si la lettre se choisit dans le
            tableau des lots (retour #204). */}
        {m.lien && !fait && <LienAller l={m.lien} />}
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
          {/* Retour #204 : « laisse toujours une ligne par chose à remplir et
              tu mets toujours l'info et le lien qui correspond ». Chaque case
              a donc son lien à côté d'elle, pas un lien pour tout le bloc :
              c'est en butant sur UNE case qu'on a besoin de la source. */}
          {m.champs.map((c) => (
            <div key={c.cle} className="dmq-ligne">
              <label className="dmq-c">
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
              {c.lien && <LienAller l={c.lien} />}
            </div>
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
