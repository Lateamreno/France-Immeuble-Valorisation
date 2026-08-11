"use client";

// Tableau des lots éditable — réplique de l'onglet État locatif > Lots du BO
// (ajouter / dupliquer / supprimer / enregistrer, agrégats recalculés côté base).
import { useMemo, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import { addLot, deleteLot, duplicateLot, updateLots, type LotPatch } from "@/lib/bo/actions";

const DESTINATIONS = ["Logement", "Commerce", "Bureau", "Logistique", "Cave", "Parking", "Annexe", "Autre"];
const TYPES_LOT = [
  "Studio", "T1", "T2", "T3", "T4", "T5", "T6", "T7",
  "Duplex Studio", "Duplex T1", "Duplex T2", "Duplex T3", "Duplex T4",
  "Maison", "Boutique", "Bureaux", "Atelier", "Entrepôt", "Cave", "Box", "Parking", "Autre",
];
const TYPES_BAIL = ["Nu", "Meuble", "Airbnb", "3/6/9", "Précaire", "Loi 48", "Loi 89", "Civil", "COP", "Ferme", "Tourisme", "n.c.", "Vide"];
const ETATS = ["Neuf", "Renove", "Bon etat", "Etat d'usage", "Travaux", "n.c."];
const DPES = ["n.c.", "A", "B", "C", "D", "E", "F", "G"];

type Row = {
  id: string;
  isNew: boolean;
  numero: string;
  Destination: string;
  Type_lot: string;
  surface_carrez: string;
  surface_sol: string;
  Type_bail: string;
  loyer: string;
  loyer_max: string;
  Etat: string;
  Type_dpe: string;
  commentaire: string;
};

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function toRow(l: Record<string, unknown>): Row {
  return {
    id: String(l._id),
    isNew: false,
    numero: S(l.numero),
    Destination: S(l.Destination),
    Type_lot: S(l.Type_lot),
    surface_carrez: S(l.surface_carrez),
    surface_sol: S(l.surface_sol),
    Type_bail: S(l.Type_bail),
    loyer: S(l.loyer),
    loyer_max: S(l.loyer_max),
    Etat: S(l.Etat),
    Type_dpe: S(l.Type_dpe),
    commentaire: S(l.commentaire),
  };
}

function toPatch(r: Row): LotPatch {
  const num = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
  return {
    numero: num(r.numero) as number | undefined,
    Destination: r.Destination || undefined,
    Type_lot: r.Type_lot || undefined,
    surface_carrez: num(r.surface_carrez),
    surface_sol: num(r.surface_sol),
    Type_bail: r.Type_bail || undefined,
    loyer: num(r.loyer),
    loyer_max: num(r.loyer_max),
    Etat: r.Etat || undefined,
    Type_dpe: r.Type_dpe || undefined,
    commentaire: r.commentaire || undefined,
  };
}

export function LotsEditor({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const initial = useMemo(() => b.lots.map(toRow), [b.lots]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const edit = (id: string, field: keyof Row, value: string) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setDirty((d) => new Set(d).add(id));
  };
  const toggleSel = (id: string) => {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const nextNumero = () =>
    String(rows.reduce((m, r) => Math.max(m, parseInt(r.numero, 10) || 0), 0) + 1);

  const addRow = () => {
    const id = `new_${Date.now()}`;
    setRows((rs) => [
      ...rs,
      { id, isNew: true, numero: nextNumero(), Destination: "Logement", Type_lot: "", surface_carrez: "", surface_sol: "", Type_bail: "Vide", loyer: "", loyer_max: "", Etat: "n.c.", Type_dpe: "n.c.", commentaire: "" },
    ]);
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

  const eurM2 = (loyer: string, carrez: string) => {
    const l = parseFloat(loyer), c = parseFloat(carrez);
    return l > 0 && c > 0 ? `${(l / c).toFixed(1)} €` : "";
  };

  return (
    <>
      <div className="ltable-wrap" style={pending ? { opacity: 0.6 } : undefined}>
        <table className="ltable">
          <thead>
            <tr>
              <th className="grp" rowSpan={2} style={{ width: 26 }} />
              <th className="grp" colSpan={3}>Référence</th>
              <th className="grp" colSpan={3}>Général</th>
              <th className="grp" colSpan={4}>Loyer</th>
              <th className="grp" colSpan={2}>Etat</th>
              <th className="grp" colSpan={2}>Autres</th>
            </tr>
            <tr>
              <th>N°</th><th>Dest.</th><th>Type</th>
              <th>Carrez</th><th>Au sol</th><th>Type bail</th>
              <th>HC actuel</th><th>€/m²</th><th>HC max</th><th>€/m²</th>
              <th>Etat</th><th>DPE</th>
              <th>Commentaire</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={dirty.has(r.id) ? { background: "#fffbea" } : undefined}>
                <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                <td><input className="lcell" style={{ width: 34 }} value={r.numero} onChange={(e) => edit(r.id, "numero", e.target.value)} /></td>
                <td>
                  <select className="lcell" style={{ minWidth: 92 }} value={r.Destination} onChange={(e) => edit(r.id, "Destination", e.target.value)}>
                    <option value="" />{DESTINATIONS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td>
                  <select className="lcell" style={{ minWidth: 84 }} value={r.Type_lot} onChange={(e) => edit(r.id, "Type_lot", e.target.value)}>
                    <option value="" />{[...new Set([r.Type_lot, ...TYPES_LOT])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td><input className="lcell" style={{ width: 52 }} value={r.surface_carrez} onChange={(e) => edit(r.id, "surface_carrez", e.target.value)} /></td>
                <td><input className="lcell" style={{ width: 52 }} value={r.surface_sol} onChange={(e) => edit(r.id, "surface_sol", e.target.value)} /></td>
                <td>
                  <select className={`lcell${r.Type_bail === "Vide" ? " red" : ""}`} style={{ minWidth: 74 }} value={r.Type_bail} onChange={(e) => edit(r.id, "Type_bail", e.target.value)}>
                    <option value="" />{[...new Set([r.Type_bail, ...TYPES_BAIL])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td><input className="lcell" style={{ width: 62 }} value={r.loyer} onChange={(e) => edit(r.id, "loyer", e.target.value)} /></td>
                <td className="na">{eurM2(r.loyer, r.surface_carrez)}</td>
                <td><input className="lcell" style={{ width: 62 }} value={r.loyer_max} onChange={(e) => edit(r.id, "loyer_max", e.target.value)} /></td>
                <td className="na">{eurM2(r.loyer_max, r.surface_carrez)}</td>
                <td>
                  <select className={`lcell${r.Etat === "Travaux" ? " red" : ""}`} style={{ minWidth: 92 }} value={r.Etat} onChange={(e) => edit(r.id, "Etat", e.target.value)}>
                    <option value="" />{[...new Set([r.Etat, ...ETATS])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td>
                  <select className="lcell" style={{ width: 54 }} value={r.Type_dpe} onChange={(e) => edit(r.id, "Type_dpe", e.target.value)}>
                    <option value="" />{[...new Set([r.Type_dpe, ...DPES])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td><input className="lcell" style={{ width: 170 }} value={r.commentaire} onChange={(e) => edit(r.id, "commentaire", e.target.value)} /></td>
                <td>{r.isNew && <span className="badge-o" style={{ fontSize: 10 }}>nouveau</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="fempty">Aucun lot saisi — cliquez sur « + Ajouter ».</div>}
      </div>

      <div className="ltools">
        <button className="ltb" type="button" onClick={addRow} title="Ajouter un lot">+</button>
        <button className="ltb" type="button" onClick={duplicate} disabled={sel.size === 0 || pending} title="Dupliquer la sélection">
          <svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
        </button>
        <button className="ltb red" type="button" onClick={remove} disabled={sel.size === 0 || pending} title="Supprimer la sélection">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
        </button>
        <span className="sp" style={{ flex: 1 }} />
        <button
          className="kgo"
          type="button"
          onClick={save}
          disabled={dirty.size === 0 || pending}
          style={pending || dirty.size === 0 ? { opacity: 0.5 } : undefined}
        >
          <span className="ch">›</span> Enregistrer{dirty.size > 0 ? ` (${dirty.size})` : ""}
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--gray-lt)", marginTop: 8 }}>
        Loyers actuels : {euros(b.im.fin_loyers_an)}/an · max {euros(b.im.fin_loyers_an_max)}/an — agrégats recalculés à l&apos;enregistrement.
      </div>
    </>
  );
}
