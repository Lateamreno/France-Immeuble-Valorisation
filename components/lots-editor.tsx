"use client";

// Tableau des lots — réplique de l'onglet État locatif > Lots du BO.
// Retours MAV du 11/08 pris en compte : sélecteur de colonnes (gauche),
// sélecteur de destinations avec compteurs qui recalcule les totaux (droite),
// unités dans les cellules, écarts %/m², en-tête sur 2 lignes sticky avec
// séparateurs gras entre groupes, barre d'outils sticky avec libellés +
// import/export, typologies filtrées par destination.
import { useMemo, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import { addLot, deleteLot, duplicateLot, updateLots, type LotPatch } from "@/lib/bo/actions";
import {
  DESTINATIONS, ETATS_LOT as ETATS, TYPES_BAIL, TYPES_DPE as DPES, TYPES_LOT,
} from "@/lib/referentiels";

/* Typologies proposées selon la destination (un bureau n'est jamais un T2). */
const TYPES_PAR_DESTINATION: Record<string, string[]> = {
  Logement: TYPES_LOT.filter((t) =>
    /^(Studio|T[1-7]|Duplex|Loft|Maison|Chambre)/.test(t)),
  Commerce: [
    "Boutique", "Local commercial", "Grande enseigne", "Espace de vente", "Show-room",
    "Agence de voyages", "Agence immobiliere", "Assurance", "Banque", "Boucherie",
    "Boulangerie", "Café", "Charcuterie", "Concession", "Epicerie", "Fromagerie",
    "Magasin d'ameublement", "Magasin de vetements", "Pharmacie", "Pizzeria",
    "Poissonnerie", "Poste", "Restaurant", "Salon de coiffure", "Supermarche", "Association",
  ],
  Bureau: ["Bureaux", "Plateau", "Local d'activites", "Show-room"],
  Logistique: ["Atelier", "Espace de stockage", "Local d'activites", "Reserve", "Sous-sol"],
  Cave: ["Cave", "Sous-sol", "Reserve"],
  Parking: ["Parking", "Box"],
  Annexe: ["WC", "Chambre", "Cave", "Box", "Autre"],
};
const typesFor = (dest: string, current?: string) => {
  const base = TYPES_PAR_DESTINATION[dest] ?? TYPES_LOT;
  const list = [...base, "Autre"];
  return current && !list.includes(current) ? [current, ...list] : list;
};

type Row = {
  id: string; isNew: boolean;
  batiment: string; etage: string; numero: string;
  Destination: string; Type_lot: string;
  surface_carrez: string; surface_sol: string;
  Type_bail: string; loyer: string; loyer_max: string;
  Etat: string; Type_dpe: string; renov_year: string;
  commentaire: string;
};

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const N = (s: string) => {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

function toRow(l: Record<string, unknown>): Row {
  return {
    id: String(l._id), isNew: false,
    batiment: S(l.batiment), etage: S(l.etage), numero: S(l.numero),
    Destination: S(l.Destination), Type_lot: S(l.Type_lot),
    surface_carrez: S(l.surface_carrez), surface_sol: S(l.surface_sol),
    Type_bail: S(l.Type_bail), loyer: S(l.loyer), loyer_max: S(l.loyer_max),
    Etat: S(l.Etat), Type_dpe: S(l.Type_dpe), renov_year: S(l.renov_year),
    commentaire: S(l.commentaire),
  };
}

function toPatch(r: Row): LotPatch {
  return {
    batiment: r.batiment || undefined,
    etage: r.etage || undefined,
    numero: N(r.numero),
    Destination: r.Destination || undefined,
    Type_lot: r.Type_lot || undefined,
    surface_carrez: N(r.surface_carrez),
    surface_sol: N(r.surface_sol),
    Type_bail: r.Type_bail || undefined,
    loyer: N(r.loyer),
    loyer_max: N(r.loyer_max),
    Etat: r.Etat || undefined,
    Type_dpe: r.Type_dpe || undefined,
    renov_year: N(r.renov_year),
    commentaire: r.commentaire || undefined,
  };
}

/* Colonnes optionnelles, comme les bascules du BO. */
const OPTIONS = [
  { key: "batiment", label: "Batiment" },
  { key: "sol", label: "Surf. utile" },
  { key: "baux", label: "Baux" },
  { key: "m2", label: "Loyers/m²" },
  { key: "commentaire", label: "Commentaire" },
] as const;
type OptKey = (typeof OPTIONS)[number]["key"];

const PLURIEL: Record<string, string> = {
  Logement: "Logements", Commerce: "Commerces", Bureau: "Bureaux",
  Logistique: "Entrepôts", Cave: "Caves", Parking: "Parkings", Annexe: "Annexes",
};

export function LotsEditor({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const initial = useMemo(() => b.lots.map(toRow), [b.lots]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [opts, setOpts] = useState<Record<OptKey, boolean>>({
    batiment: true, sol: true, baux: true, m2: true, commentaire: true,
  });
  const [destOff, setDestOff] = useState<Set<string>>(new Set());
  const [plein, setPlein] = useState(false);

  const on = (k: OptKey) => opts[k];
  const toggleOpt = (k: OptKey) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  const toggleDest = (d: string) =>
    setDestOff((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });

  /* Destinations présentes + compteurs (les totaux suivent la sélection). */
  const parDest = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of DESTINATIONS) m.set(d, 0);
    for (const r of rows) m.set(r.Destination || "Annexe", (m.get(r.Destination || "Annexe") ?? 0) + 1);
    return m;
  }, [rows]);

  const visibles = rows.filter((r) => !destOff.has(r.Destination || "Annexe"));

  const totaux = useMemo(() => {
    const carrez = visibles.reduce((s, r) => s + (N(r.surface_carrez) ?? 0), 0);
    const occ = visibles.filter((r) => (N(r.loyer) ?? 0) > 0);
    const carrezOcc = occ.reduce((s, r) => s + (N(r.surface_carrez) ?? 0), 0);
    const loyersAn = visibles.reduce((s, r) => s + (N(r.loyer) ?? 0), 0) * 12;
    const maxAn = visibles.reduce((s, r) => s + (N(r.loyer_max) ?? N(r.loyer) ?? 0), 0) * 12;
    return {
      lots: visibles.length, carrez, loyersAn, maxAn,
      // Le « % » du bandeau du BO est l'occupation FINANCIÈRE :
      // loyers actuels / loyers potentiels (vérifié : 1 206 583 / 1 253 323 ≈ 97 %).
      occupation: maxAn > 0 ? Math.round((loyersAn / maxAn) * 100) : 0,
      m2mois: carrezOcc > 0 ? loyersAn / 12 / carrezOcc : 0,
    };
  }, [visibles]);

  const edit = (id: string, field: keyof Row, value: string) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setDirty((d) => new Set(d).add(id));
  };
  const toggleSel = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const nextNumero = () =>
    String(rows.reduce((m, r) => Math.max(m, parseInt(r.numero, 10) || 0), 0) + 1);

  const addRow = () => {
    const id = `new_${Date.now()}`;
    setRows((rs) => [...rs, {
      id, isNew: true, batiment: "", etage: "", numero: nextNumero(),
      Destination: "Logement", Type_lot: "", surface_carrez: "", surface_sol: "",
      Type_bail: "Vide", loyer: "", loyer_max: "", Etat: "n.c.", Type_dpe: "n.c.",
      renov_year: "", commentaire: "",
    }]);
    setDirty((d) => new Set(d).add(id));
  };

  const save = () =>
    start(async () => {
      const news = rows.filter((r) => r.isNew && dirty.has(r.id));
      const edits = rows.filter((r) => !r.isNew && dirty.has(r.id));
      for (const r of news) await addLot(immeubleId, toPatch(r));
      if (edits.length) await updateLots(immeubleId, edits.map((r) => ({ id: r.id, patch: toPatch(r) })));
      setDirty(new Set());
    });

  const duplicate = () =>
    start(async () => {
      let n = parseInt(nextNumero(), 10);
      for (const id of sel) {
        const src = b.lots.find((l) => String(l._id) === id);
        if (src) await duplicateLot(immeubleId, src, n++);
      }
      setSel(new Set());
    });

  const remove = () => {
    if (sel.size === 0) return;
    if (!confirm(`Supprimer ${sel.size} lot(s) ? (récupérable dans la corbeille)`)) return;
    start(async () => {
      for (const id of sel) {
        if (id.startsWith("new_")) setRows((rs) => rs.filter((r) => r.id !== id));
        else await deleteLot(immeubleId, id);
      }
      setSel(new Set());
    });
  };

  /* Export CSV (mêmes colonnes que l'import du BO). */
  const COLS_CSV = [
    "batiment", "etage", "numero", "Destination", "Type_lot", "surface_carrez",
    "surface_sol", "Type_bail", "loyer", "loyer_max", "Etat", "Type_dpe",
    "renov_year", "commentaire",
  ] as const;
  const exporter = () => {
    const lignes = [COLS_CSV.join(";")];
    for (const r of visibles) lignes.push(COLS_CSV.map((c) => String(r[c] ?? "").replace(/;/g, ",")).join(";"));
    const url = URL.createObjectURL(new Blob(["﻿" + lignes.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lots-${S(b.im.adresse_ville) || "immeuble"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importer = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result ?? "").replace(/^﻿/, "");
      const lignes = txt.split(/\r?\n/).filter((l) => l.trim());
      if (lignes.length < 2) return;
      const entetes = lignes[0].split(";").map((h) => h.trim());
      const nouveaux: Row[] = [];
      for (const l of lignes.slice(1, 201)) {
        const vals = l.split(";");
        const o = Object.fromEntries(entetes.map((h, i) => [h, (vals[i] ?? "").trim()]));
        const id = `new_${Date.now()}_${nouveaux.length}`;
        nouveaux.push({
          id, isNew: true,
          batiment: o.batiment ?? "", etage: o.etage ?? "", numero: o.numero ?? "",
          Destination: o.Destination ?? "Logement", Type_lot: o.Type_lot ?? "",
          surface_carrez: o.surface_carrez ?? "", surface_sol: o.surface_sol ?? "",
          Type_bail: o.Type_bail ?? "Vide", loyer: o.loyer ?? "", loyer_max: o.loyer_max ?? "",
          Etat: o.Etat ?? "n.c.", Type_dpe: o.Type_dpe ?? "n.c.",
          renov_year: o.renov_year ?? "", commentaire: o.commentaire ?? "",
        });
      }
      setRows((rs) => [...rs, ...nouveaux]);
      setDirty((d) => { const n = new Set(d); nouveaux.forEach((r) => n.add(r.id)); return n; });
    };
    reader.readAsText(file, "utf-8");
  };

  /* €/m² et écart vs loyer de marché du secteur (comme le BO). */
  const refM2 = typeof b.secteur?.["0 - loyer_mois"] === "number" ? (b.secteur["0 - loyer_mois"] as number) : undefined;
  const m2 = (loyer: string, carrez: string) => {
    const l = N(loyer), c = N(carrez);
    return l && c && l > 0 && c > 0 ? l / c : undefined;
  };
  const ecart = (v?: number) => {
    if (v === undefined || !refM2) return null;
    const p = Math.round(((v - refM2) / refM2) * 100);
    return <span className={p >= 0 ? "pos" : "neg"}>{p >= 0 ? "+" : ""}{p} %</span>;
  };

  const nbCols =
    1 + (on("batiment") ? 2 : 0) + 3 + 1 + (on("sol") ? 1 : 0) +
    (on("baux") ? 3 : 1) + 2 + (on("m2") ? 2 : 0) + 4 + (on("commentaire") ? 1 : 0) + 1;

  return (
    <div className={plein ? "lots-full" : undefined}>
      {/* En-tête : bascules de colonnes · synthèse · bascules de destinations */}
      <div className="lhead">
        <div className="lopts">
          {OPTIONS.map((o) => (
            <button key={o.key} type="button" className={`ltog${on(o.key) ? " on" : ""}`} onClick={() => toggleOpt(o.key)}>
              <span className="sw2" />{o.label}
            </button>
          ))}
        </div>

        <div className="lsum">
          {totaux.m2mois > 0 && (
            <div className="lsum-top">
              <span className="fchip">{totaux.m2mois.toFixed(1).replace(".", ",")} €/m²/mois</span>
            </div>
          )}
          <div className="lsum-chips">
            <span className="fchip">{totaux.lots} lots</span>
            <span className="fchip">{Math.round(totaux.carrez).toLocaleString("fr-FR")} m²</span>
            <span className="fchip">{euros(totaux.loyersAn) ?? "0 €"}/an</span>
            <span className="fchip">{totaux.occupation} %</span>
            <span className="fchip gold">{euros(totaux.maxAn) ?? "0 €"}/an</span>
            <span className="fchip">
              {euros(b.im.fin_travaux) ? `${euros(b.im.fin_travaux)} de travaux` : "Pas de travaux"}
            </span>
          </div>
        </div>

        <div className="ldest">
          {DESTINATIONS.map((d) => (
            <button key={d} type="button" className={`ltog${destOff.has(d) ? "" : " on"}`} onClick={() => toggleDest(d)}>
              <span className="sw2" />
              <b>{parDest.get(d) ?? 0}</b> {PLURIEL[d] ?? d}
            </button>
          ))}
        </div>
      </div>

      <div className="ltable-wrap" style={pending ? { opacity: 0.6 } : undefined}>
        <table className="ltable v2">
          <thead>
            <tr>
              <th className="grp brd" rowSpan={2} style={{ width: 26 }} />
              <th className="grp brd" colSpan={on("batiment") ? 3 : 1}>Référence</th>
              <th className="grp brd" colSpan={2 + 1 + (on("sol") ? 1 : 0)}>Général</th>
              <th className="grp brd" colSpan={(on("baux") ? 3 : 1) + 2 + (on("m2") ? 2 : 0)}>Loyer</th>
              <th className="grp brd" colSpan={4}>Etat</th>
              <th className="grp" colSpan={(on("commentaire") ? 1 : 0) + 1}>Autres</th>
            </tr>
            <tr>
              {on("batiment") && <><th className="brd">Bat.</th><th>Etg</th></>}
              <th className={on("batiment") ? "" : "brd"}>N°</th>
              <th className="brd">Dest.</th><th>Type</th>
              <th>Carrez</th>{on("sol") && <th>Au sol</th>}
              <th className="brd">Type bail</th>
              {on("baux") && <><th>Entrée</th><th>Locataire</th></>}
              <th>HC actuel</th>{on("m2") && <th>€/m²</th>}
              <th>HC max</th>{on("m2") && <th>€/m²</th>}
              <th className="brd">Etat</th><th>Travaux</th><th>DPE</th><th>Rénov.</th>
              {on("commentaire") && <th className="brd">Commentaire</th>}
              <th className={on("commentaire") ? "" : "brd"}>Photos</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => {
              const act = m2(r.loyer, r.surface_carrez);
              const max = m2(r.loyer_max || r.loyer, r.surface_carrez);
              const tvx = b.travaux
                .filter((t) => Array.isArray(t.LOTs) && (t.LOTs as string[]).includes(r.id))
                .reduce((s, t) => s + (typeof t.montant === "number" ? t.montant : 0), 0);
              const photos = b.photos.filter((p) => p.type === "Lot").length && r.isNew ? 0 : 0;
              return (
                <tr key={r.id} style={dirty.has(r.id) ? { background: "#fffbea" } : undefined}>
                  <td className="brd"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                  {on("batiment") && (
                    <>
                      <td className="brd"><input className="lcell" value={r.batiment} onChange={(e) => edit(r.id, "batiment", e.target.value)} /></td>
                      <td><input className="lcell" value={r.etage} onChange={(e) => edit(r.id, "etage", e.target.value)} /></td>
                    </>
                  )}
                  <td className={on("batiment") ? "" : "brd"}><input className="lcell" value={r.numero} onChange={(e) => edit(r.id, "numero", e.target.value)} /></td>
                  <td className="brd">
                    <select className="lcell" value={r.Destination}
                      onChange={(e) => { edit(r.id, "Destination", e.target.value); edit(r.id, "Type_lot", ""); }}>
                      <option value="" />{DESTINATIONS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="lcell" value={r.Type_lot} onChange={(e) => edit(r.id, "Type_lot", e.target.value)}>
                      <option value="" />
                      {typesFor(r.Destination, r.Type_lot).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="na"><input className="lcell num" value={r.surface_carrez} onChange={(e) => edit(r.id, "surface_carrez", e.target.value)} /><i>m²</i></td>
                  {on("sol") && <td className="na"><input className="lcell num" value={r.surface_sol} onChange={(e) => edit(r.id, "surface_sol", e.target.value)} /><i>m²</i></td>}
                  <td className="brd">
                    <select className={`lcell${r.Type_bail === "Vide" ? " red" : ""}`} value={r.Type_bail} onChange={(e) => edit(r.id, "Type_bail", e.target.value)}>
                      <option value="" />{[...new Set([r.Type_bail, ...TYPES_BAIL])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  {on("baux") && (
                    <>
                      <td className="na">{(() => {
                        const bail = b.baux.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(r.id));
                        return bail?.date_start ? new Date(String(bail.date_start)).toLocaleDateString("fr-FR") : <span className="plus">+</span>;
                      })()}</td>
                      <td className="na">{(() => {
                        const loc = b.locataires.find((x) => Array.isArray(x.LOTs) && (x.LOTs as string[]).includes(r.id));
                        return loc ? String(loc.formatted_name ?? "") : <span className="plus">+</span>;
                      })()}</td>
                    </>
                  )}
                  <td className="na"><input className="lcell num" value={r.loyer} onChange={(e) => edit(r.id, "loyer", e.target.value)} /><i>€</i></td>
                  {on("m2") && <td className="na pc">{act ? ecart(act) ?? `${act.toFixed(1).replace(".", ",")} €` : <span className="nc">n.a.</span>}</td>}
                  <td className="na"><input className="lcell num" value={r.loyer_max} onChange={(e) => edit(r.id, "loyer_max", e.target.value)} /><i>€</i></td>
                  {on("m2") && <td className="na pc">{max ? ecart(max) ?? `${max.toFixed(1).replace(".", ",")} €` : <span className="nc">n.a.</span>}</td>}
                  <td className="brd">
                    <select className={`lcell${!r.Etat || r.Etat === "n.c." ? " vide" : ""}${r.Etat === "Travaux" ? " red" : ""}`} value={r.Etat} onChange={(e) => edit(r.id, "Etat", e.target.value)}>
                      <option value="" />{[...new Set([r.Etat, ...ETATS])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="na">{tvx > 0 ? <span className="tvx">{euros(tvx)}</span> : <span className="nc">n.a.</span>}</td>
                  <td>
                    <select className={`lcell${!r.Type_dpe || r.Type_dpe === "n.c." ? " vide" : ""}`} value={r.Type_dpe} onChange={(e) => edit(r.id, "Type_dpe", e.target.value)}>
                      <option value="" />{[...new Set([r.Type_dpe, ...DPES])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="na"><input className="lcell num" value={r.renov_year} onChange={(e) => edit(r.id, "renov_year", e.target.value)} /></td>
                  {on("commentaire") && <td className="brd"><input className="lcell" value={r.commentaire} onChange={(e) => edit(r.id, "commentaire", e.target.value)} /></td>}
                  <td className={`na${on("commentaire") ? "" : " brd"}`}>
                    <span className="phc"><svg viewBox="0 0 24 24"><path d="M3 7h4l1.5-2h7L17 7h4v13H3z" /><circle cx="12" cy="13" r="3.4" /></svg>{photos}</span>
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr><td colSpan={nbCols} className="fempty" style={{ padding: 22 }}>
                {rows.length === 0 ? "Aucun lot saisi — cliquez sur « + Ajouter »." : "Aucun lot pour les destinations sélectionnées."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barre d'outils sticky, libellés visibles, import/export */}
      <div className="ltools v2">
        <button className="ltb lbl" type="button" onClick={addRow}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg> Ajouter
        </button>
        <button className="ltb lbl" type="button" onClick={duplicate} disabled={sel.size === 0 || pending}>
          <svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg> Dupliquer
        </button>
        <button className="ltb lbl red" type="button" onClick={remove} disabled={sel.size === 0 || pending}>
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg> Supprimer
        </button>
        <span className="sp" style={{ flex: 1 }} />
        <label className="ltb lbl gold">
          <svg viewBox="0 0 24 24"><path d="M12 16V4M8 8l4-4 4 4M4 20h16" /></svg> Importer
          <input type="file" accept=".csv,text/csv" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importer(f); e.target.value = ""; }} />
        </label>
        <button className="ltb lbl" type="button" onClick={() => setPlein((v) => !v)}>
          <svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg> {plein ? "Quitter" : "Plein écran"}
        </button>
        <button className="ltb lbl gold" type="button" onClick={exporter}>
          <svg viewBox="0 0 24 24"><path d="M12 4v12M8 12l4 4 4-4M4 20h16" /></svg> Télécharger
        </button>
        <span className="sp" style={{ width: 10 }} />
        <button className="kgo" type="button" onClick={save} disabled={dirty.size === 0 || pending}
          style={pending || dirty.size === 0 ? { opacity: 0.5 } : undefined}>
          <span className="ch">›</span> Enregistrer{dirty.size > 0 ? ` (${dirty.size})` : ""}
        </button>
      </div>
    </div>
  );
}
