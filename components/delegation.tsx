"use client";

/**
 * Délégations de mandat (MAV, 10/11) : « dans l'onglet mandat on puisse
 * ajouter les délégations et que ça compte donc comme un mandat. On indique
 * juste la date de signature, les honos et le pourcentage de partage d'honos
 * puis on ajoute le mandat en PDF. »
 *
 * Un bouton à côté de « + Ajouter un mandat », une fenêtre de quatre cases.
 * La même fenêtre corrige une délégation déjà enregistrée (le PDF n'est alors
 * redemandé que pour le remplacer).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modale } from "@/components/modale";
import { Champ } from "@/components/champ";
import { ajouterDelegation, modifierDelegation } from "@/lib/bo/actions";
import { euros, group } from "@/lib/format";
import { ancreDelegation, refusPrixDelegation, resoudreDelegation, type CaseDelegation, type PrixDelegation } from "@/lib/bo/delegation-prix";

type Doc = Record<string, unknown>;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);

/** La part de France Immeuble, en euros : honoraires × partage. */
export function partFi(m: Doc): number | undefined {
  const h = num(m.honos_ttc), p = num(m.partage_honos_pct);
  return Number.isFinite(h) && Number.isFinite(p) ? Math.round((h * p) / 100) : undefined;
}

export const estDelegation = (m: Doc) => m.delegation === true || String(m.Type ?? "") === "Délégation";

function FenetreDelegation({ immeubleId, m, onFermer }: { immeubleId: string; m?: Doc; onFermer: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [date, setDate] = useState(() => (typeof m?.date_signature === "string" ? m.date_signature.slice(0, 10) : new Date().toISOString().slice(0, 10)));
  /* MAV (10/11) : le prix comme dans les mandats — quatre cases liées, le
     taux en % du net vendeur, les honoraires TTC. */
  const lu = (v: unknown) => (Number.isFinite(num(v)) && num(v) > 0 ? num(v) : undefined);
  const [prix, setPrix] = useState<PrixDelegation>(() => ({ nv: lu(m?.prix_nv), hai: lu(m?.prix_hai), taux: lu(m?.honos_taux), honos: lu(m?.honos_ttc) }));
  const [pilotes, setPilotes] = useState<CaseDelegation[]>([]);
  const saisir = (c: CaseDelegation) => (v: string) => {
    const n = Number(v.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
    const suite = [...pilotes.filter((x) => x !== c), c];
    setPilotes(suite);
    setPrix(resoudreDelegation({ ...prix, [c]: Number.isFinite(n) && n > 0 ? n : undefined }, suite));
  };
  const ancre = ancreDelegation(pilotes);
  const pilote = (c: CaseDelegation) => pilotes.length > 0 && (c === pilotes[pilotes.length - 1] || c === ancre);
  const refusPrix = refusPrixDelegation(prix);
  const [partage, setPartage] = useState(() => (Number.isFinite(num(m?.partage_honos_pct)) ? String(num(m?.partage_honos_pct)) : "50"));
  const [fichier, setFichier] = useState<File | null>(null);

  const h = prix.honos ?? 0;
  const p = Number(partage.replace(",", "."));
  const partageInvalide = partage.trim() !== "" && !(p > 0 && p <= 100);
  const part = h > 0 && p > 0 && p <= 100 ? Math.round((h * p) / 100) : undefined;

  const enregistrer = () => {
    setErreur(null);
    const fd = new FormData();
    fd.set("date", date);
    fd.set("nv", String(prix.nv ?? ""));
    fd.set("hai", String(prix.hai ?? ""));
    fd.set("taux", String(prix.taux ?? ""));
    fd.set("honos", String(prix.honos ?? ""));
    fd.set("partage", partage);
    if (fichier) fd.set("file", fichier);
    start(async () => {
      const r = m
        ? await modifierDelegation(String(m._id), immeubleId, fd)
        : await ajouterDelegation(immeubleId, fd);
      if (!r.ok) { setErreur(r.message); return; }
      router.refresh();
      onFermer();
    });
  };

  return (
    <Modale
      titre={m ? `Délégation de mandat${m.numero ? ` n° ${String(m.numero)}` : ""}` : "Ajouter une délégation de mandat"}
      onFermer={onFermer}
      largeur={780}
      pied={(
        <>
          <button type="button" className="fbtn" onClick={onFermer}>Annuler</button>
          <button type="button" className="kgo" disabled={pending || partageInvalide || !!refusPrix || (!m && !fichier)} onClick={enregistrer}>
            <span className="ch">›</span> {pending ? "Enregistrement…" : m ? "Enregistrer" : "Ajouter la délégation"}
          </button>
        </>
      )}
    >
      <div className="dlg-grille">
        <Champ libelle="Date de signature" obligatoire>
          <input className="mi" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Champ>
        <div className="dlg-prix">
          <span className="dlg-prix-t">Prix et honoraires <i>· le taux est un pourcentage du net vendeur, honoraires TTC</i></span>
          <div className="mdt-prix">
            <CaseDlg label="Prix HAI" unite="€" v={prix.hai} pilote={pilote("hai")} onChange={saisir("hai")} fort />
            <span className="op sep">dont</span>
            <CaseDlg label="Net vendeur" unite="€" v={prix.nv} pilote={pilote("nv")} onChange={saisir("nv")} />
            <span className="op">+</span>
            <CaseDlg label="Honoraires TTC" unite="€" v={prix.honos} pilote={pilote("honos")} onChange={saisir("honos")} />
            <span className="op sep">soit</span>
            <CaseDlg label="Taux du net vendeur" unite="%" v={prix.taux} pilote={pilote("taux")} onChange={saisir("taux")} decimal />
          </div>
          {pilotes.length > 0 && refusPrix && <i className="chp-e">{refusPrix}</i>}
        </div>
        <Champ libelle="Partage des honoraires (%)" obligatoire
          erreur={partageInvalide ? "Un pourcentage entre 1 et 100." : undefined}
          aide={part !== undefined ? `Soit ${euros(part)} pour France Immeuble.` : "La part qui revient à France Immeuble, en %."}>
          <input className="mi" inputMode="decimal" value={partage} onChange={(e) => setPartage(e.target.value)} />
        </Champ>
        <Champ libelle={m ? "Remplacer le PDF de la délégation" : "La délégation signée (PDF)"} obligatoire={!m} large>
          {/* #610 (MAV, 10/11) : « un bouton pour ajouter le pdf, on sait pas ce
              qu'il faut faire » — le champ fichier brut ressemblait à une case
              vide. Un vrai bouton, puis le nom du fichier choisi. */}
          <label className={`dlg-pdf${fichier ? " choisi" : ""}`}>
            <input type="file" accept="application/pdf" hidden onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2.5L17.5 8H14V4.5zM12 11v4.2l1.6-1.6 1.1 1.1L11.3 18l-3.4-3.3 1.1-1.1 1.5 1.6V11H12z" /></svg>
            {fichier ? <><b>{fichier.name}</b><span>Changer</span></> : <b>{m ? "Choisir le nouveau PDF" : "Ajouter le PDF signé"}</b>}
          </label>
        </Champ>
      </div>
      <p className="dlg-note">
        {m
          ? "Le numéro au registre ne change pas."
          : "La délégation compte comme un mandat signé : elle prend le prochain numéro du registre des mandats, définitivement."}
      </p>
      {erreur && <div className="dif-simu">{erreur}</div>}
    </Modale>
  );
}

/** Une case de prix, au dessin de l'onglet Prix des mandats (`mdt-cp`). */
function CaseDlg({ label, unite, v, pilote, onChange, fort, decimal }: {
  label: string; unite: string; v?: number; pilote: boolean; onChange: (s: string) => void; fort?: boolean; decimal?: boolean;
}) {
  const [brut, setBrut] = useState<string | null>(null);
  const affiche = brut ?? (v === undefined ? "" : decimal ? String(v).replace(".", ",") : group(v));
  return (
    <label className={`mdt-cp${pilote ? " pilote" : ""}${fort ? " fort" : ""}`}>
      <span className="l">{label}{pilote && <i title="Case saisie : elle pilote les autres">saisi</i>}</span>
      <span className="in">
        <input value={affiche} inputMode="decimal"
          onChange={(e) => { setBrut(e.target.value); onChange(e.target.value); }}
          onBlur={() => setBrut(null)} />
        <i>{unite}</i>
      </span>
    </label>
  );
}

/** Le bouton de l'onglet Mandats. */
export function AjouterDelegation({ immeubleId }: { immeubleId: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="fbtn" type="button" onClick={() => setOuvert(true)}>+ Ajouter une délégation</button>
      {ouvert && <FenetreDelegation immeubleId={immeubleId} onFermer={() => setOuvert(false)} />}
    </>
  );
}

/** « Modifier » sur la ligne d'une délégation. */
export function ModifierDelegation({ immeubleId, m }: { immeubleId: string; m: Doc }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button className="fbtn" type="button" onClick={() => setOuvert(true)}>Modifier</button>
      {ouvert && <FenetreDelegation immeubleId={immeubleId} m={m} onFermer={() => setOuvert(false)} />}
    </>
  );
}
