"use client";

// État technique — sous-onglets Composants · Travaux (réplique BO).
// Composants = cartes type/matériau/état ; travaux rattachés à des lots
// OU à des composants du bâti, groupés par urgence.
import { useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import {
  addComposant, addTravaux, deleteComposant, deleteTravaux, updateTechnique,
} from "@/lib/bo/actions";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));

import { ETATS_BATI, MATERIAUX, TYPES_COMPOSANT, URGENCES as URGENCES_REF } from "@/lib/referentiels";

const ETATS_COMPOSANT = ETATS_BATI;
const ETATS_GENERAL = ETATS_BATI;
const URGENCES = [
  ["Haute", "Travaux très urgents"],
  ["Moyenne", "Travaux moyennement urgents"],
  ["Basse", "Travaux peu urgents"],
] as const;

function lotLabel(l: Record<string, unknown>) {
  return [`Lot ${l.numero ?? "?"}`, l.Type_lot].filter(Boolean).join(" · ");
}

/* ---------- En-tête (année + état général) ---------- */

function EnTete({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const [annee, setAnnee] = useState(S(num(b.im.year_constru)));
  const [etat, setEtat] = useState(S(b.im.Etat));
  return (
    <div className="lband2">
      <label style={{ fontSize: 12.5 }}>Année de construction{" "}
        <input className="min" style={{ width: 70 }} value={annee} onChange={(e) => setAnnee(e.target.value)} />
      </label>
      <label style={{ fontSize: 12.5 }}>État général{" "}
        <select className="min" style={{ width: 130 }} value={etat} onChange={(e) => setEtat(e.target.value)}>
          <option value="" />{[...new Set([etat, ...ETATS_GENERAL])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
      <span className="sp" style={{ flex: 1 }} />
      <button className="fadd" type="button" disabled={pending}
        onClick={() => start(() => updateTechnique(immeubleId, { year_constru: parse(annee), Etat: etat || undefined }))}>
        Enregistrer
      </button>
    </div>
  );
}

/* ---------- Composants ---------- */

function ComposantsTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const travauxOf = (cid: string) =>
    b.travaux
      .filter((t) => Array.isArray(t.COMPOSANTs) && (t.COMPOSANTs as string[]).includes(cid))
      .reduce((s, t) => s + (num(t.montant) ?? 0), 0);

  return (
    <>
      <div className="lband2">
        <span className="dst">{b.composants.length} composant{b.composants.length > 1 ? "s" : ""}</span>
        <span className="sp" style={{ flex: 1 }} />
        <AddComposantButton b={b} />
      </div>
      {b.composants.length === 0 && <div className="fempty">Aucun composant saisi.</div>}
      <div className="wgrid" style={pending ? { opacity: 0.6 } : undefined}>
        {b.composants.map((c) => {
          const tvx = travauxOf(String(c._id));
          return (
            <div key={String(c._id)} className="wcard" style={{ position: "relative" }}>
              <button className="xdel" type="button" title="Supprimer le composant" style={{ position: "absolute", top: 6, right: 6 }}
                onClick={() => {
                  if (!confirm("Supprimer ce composant ? (récupérable dans la corbeille)")) return;
                  start(() => deleteComposant(immeubleId, String(c._id)));
                }}>✕</button>
              <div className="h">{S(c.Type_composant)}{S(c.type_composant_autre) ? ` — ${S(c.type_composant_autre)}` : ""}</div>
              <div className="v">{S(c["Type_matériau"]) || "Matériau à préciser"}</div>
              <div className="v" style={{ color: c.Etat === "Travaux" ? "var(--red)" : undefined }}>
                {S(c.Etat) || "Etat à préciser"}
                {num(c.renov_year) ? ` · rénové en ${c.renov_year}` : ""}
              </div>
              {tvx > 0 && <div className="v" style={{ color: "var(--red)", fontWeight: 700 }}>Travaux {euros(tvx)}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function AddComposantButton({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [type, setType] = useState("Façade");
  const [typeAutre, setTypeAutre] = useState("");
  const [mat, setMat] = useState("");
  const [matAutre, setMatAutre] = useState("");
  const [etat, setEtat] = useState("n.c.");
  const [renov, setRenov] = useState("");
  const [desc, setDesc] = useState("");
  const mats = MATERIAUX[type] ?? ["Autre"];

  const submit = () =>
    start(async () => {
      await addComposant(immeubleId, {
        Type_composant: type,
        type_composant_autre: type === "Autre" ? typeAutre || undefined : undefined,
        Type_materiau: mat || undefined,
        type_materiau_autre: mat === "Autre" ? matAutre || undefined : undefined,
        Etat: etat || undefined,
        renov_year: parse(renov),
        renov_txt: desc || undefined,
      });
      setOpen(false);
    });

  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>+ Ajouter un composant</button>
      {open && (
        <div className="modal-ov" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouveau composant<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Type</span>
              <div className="mrow">
                {TYPES_COMPOSANT.map((t) => (
                  <button key={t} type="button" className={`mopt${type === t ? " on" : ""}`} onClick={() => { setType(t); setMat(""); }}>{t}</button>
                ))}
              </div>
              {type === "Autre" && <input className="min" style={{ marginTop: 6 }} placeholder="Précisez le type" value={typeAutre} onChange={(e) => setTypeAutre(e.target.value)} />}
              <span className="mlab">Matériau</span>
              <div className="mrow">
                {mats.map((m) => (
                  <button key={m} type="button" className={`mopt${mat === m ? " on" : ""}`} onClick={() => setMat(mat === m ? "" : m)}>{m}</button>
                ))}
              </div>
              {mat === "Autre" && <input className="min" style={{ marginTop: 6 }} placeholder="Précisez le matériau" value={matAutre} onChange={(e) => setMatAutre(e.target.value)} />}
              <span className="mlab">État</span>
              <div className="mrow">
                {ETATS_COMPOSANT.map((s) => (
                  <button key={s} type="button" className={`mopt${etat === s ? " on" : ""}`} onClick={() => setEtat(s)}>{s}</button>
                ))}
              </div>
              <div className="mrow" style={{ marginTop: 8, alignItems: "center" }}>
                <label style={{ fontSize: 12 }}>Année rénov. <input className="min" style={{ width: 70 }} value={renov} onChange={(e) => setRenov(e.target.value)} /></label>
                <input className="min" style={{ flex: 1 }} placeholder="Description de la rénovation" value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
            </div>
            <div className="modal-f">
              <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined} onClick={submit}>
                <span className="ch">›</span> Créer le composant
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Travaux ---------- */

function TravauxTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const isLots = (t: Record<string, unknown>) => Array.isArray(t.LOTs) && (t.LOTs as unknown[]).length > 0;
  const totalLots = b.travaux.filter(isLots).reduce((s, t) => s + (num(t.montant) ?? 0), 0);
  const totalBati = b.travaux.filter((t) => !isLots(t)).reduce((s, t) => s + (num(t.montant) ?? 0), 0);

  const objet = (t: Record<string, unknown>) => {
    if (isLots(t)) {
      return (t.LOTs as string[])
        .map((id) => b.lots.find((l) => l._id === id))
        .filter(Boolean)
        .map((l) => `Lot ${l!.numero ?? "?"}`)
        .join(", ");
    }
    if (Array.isArray(t.COMPOSANTs)) {
      return (t.COMPOSANTs as string[])
        .map((id) => b.composants.find((c) => c._id === id))
        .filter(Boolean)
        .map((c) => S(c!.Type_composant))
        .join(", ");
    }
    return "";
  };

  return (
    <div style={pending ? { opacity: 0.6 } : undefined}>
      <div className="lband2">
        <span className="dst">{euros(totalLots) ?? "0 €"} sur les lots · {euros(totalBati) ?? "0 €"} sur le bâti</span>
        <span className="sp" style={{ flex: 1 }} />
        <AddTravauxButton b={b} />
      </div>
      {b.travaux.length === 0 && <div className="fempty">Aucuns travaux saisis.</div>}
      {URGENCES.map(([code, label]) => {
        const rows = b.travaux.filter((t) => S(t.Urgence) === code);
        if (rows.length === 0) return null;
        return (
          <div key={code}>
            <div className="fsub" style={{ color: code === "Haute" ? "var(--red)" : undefined }}>{label}</div>
            {rows.map((t) => (
              <div key={String(t._id)} className="chrow">
                <span className="t">{objet(t) || "Travaux"}</span>
                <span className="c">{S(t.description)}</span>
                {t.YN_devis === true && <span className="badge-o">Devis</span>}
                <span className="sp" style={{ flex: 1 }} />
                <span className="v">{euros(t.montant) ?? "n.c."}</span>
                <button className="xdel" type="button" title="Supprimer"
                  onClick={() => {
                    if (!confirm("Supprimer ces travaux ? (récupérable dans la corbeille)")) return;
                    start(() => deleteTravaux(immeubleId, String(t._id)));
                  }}>✕</button>
              </div>
            ))}
          </div>
        );
      })}
      {(() => {
        const sans = b.travaux.filter((t) => !URGENCES.some(([c]) => c === S(t.Urgence)));
        if (sans.length === 0) return null;
        return (
          <div>
            <div className="fsub">Sans urgence renseignée</div>
            {sans.map((t) => (
              <div key={String(t._id)} className="chrow">
                <span className="t">{objet(t) || "Travaux"}</span>
                <span className="c">{S(t.description)}</span>
                <span className="sp" style={{ flex: 1 }} />
                <span className="v">{euros(t.montant) ?? "n.c."}</span>
                <button className="xdel" type="button" onClick={() => {
                  if (!confirm("Supprimer ces travaux ?")) return;
                  start(() => deleteTravaux(immeubleId, String(t._id)));
                }}>✕</button>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

function AddTravauxButton({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [lotIds, setLotIds] = useState<string[]>([]);
  const [compIds, setCompIds] = useState<string[]>([]);
  const [desc, setDesc] = useState("");
  const [montant, setMontant] = useState("");
  const [urgence, setUrgence] = useState<"Haute" | "Moyenne" | "Basse">("Moyenne");
  const [devis, setDevis] = useState(false);
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const submit = () =>
    start(async () => {
      await addTravaux(immeubleId, {
        lotIds, composantIds: compIds,
        description: desc || undefined, montant: parse(montant),
        urgence, devis,
      });
      setOpen(false);
    });

  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>+ Ajouter des travaux</button>
      {open && (
        <div className="modal-ov" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouveaux travaux<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Objet des travaux — lots</span>
              <div className="mrow">
                {b.lots.length === 0 && <span style={{ fontSize: 12, color: "var(--gray-lt)" }}>Aucun lot.</span>}
                {b.lots.map((l) => (
                  <button key={String(l._id)} type="button" className={`mopt${lotIds.includes(String(l._id)) ? " on" : ""}`} onClick={() => toggle(lotIds, setLotIds, String(l._id))}>
                    {lotLabel(l)}
                  </button>
                ))}
              </div>
              <span className="mlab">— ou composants du bâti</span>
              <div className="mrow">
                {b.composants.length === 0 && <span style={{ fontSize: 12, color: "var(--gray-lt)" }}>Aucun composant.</span>}
                {b.composants.map((c) => (
                  <button key={String(c._id)} type="button" className={`mopt${compIds.includes(String(c._id)) ? " on" : ""}`} onClick={() => toggle(compIds, setCompIds, String(c._id))}>
                    {S(c.Type_composant)}
                  </button>
                ))}
              </div>
              <span className="mlab">Description</span>
              <input className="min" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="ex. Peinture et remise en état" />
              <span className="mlab">Estimer les travaux</span>
              <div className="mrow" style={{ alignItems: "center" }}>
                <input className="min" style={{ width: 110 }} placeholder="Montant €" value={montant} onChange={(e) => setMontant(e.target.value)} />
                {(["Haute", "Moyenne", "Basse"] as const).map((u) => (
                  <button key={u} type="button" className={`mopt${urgence === u ? " on" : ""}`} onClick={() => setUrgence(u)}>{u}</button>
                ))}
                <button type="button" className={`mopt${devis ? " on" : ""}`} onClick={() => setDevis(!devis)}>Devis : {devis ? "Oui" : "Non"}</button>
              </div>
            </div>
            <div className="modal-f">
              <button
                className="kgo" type="button"
                disabled={pending || (lotIds.length === 0 && compIds.length === 0)}
                style={pending || (lotIds.length === 0 && compIds.length === 0) ? { opacity: 0.5 } : undefined}
                onClick={submit}
              ><span className="ch">›</span> Créer les travaux</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Conteneur ---------- */

export function TechniqueTabs({ b }: { b: BienData }) {
  const [tab, setTab] = useState<"composants" | "travaux">("composants");
  return (
    <>
      <EnTete b={b} />
      <div className="ftabs">
        <button type="button" className={`ftab${tab === "composants" ? " on" : ""}`} onClick={() => setTab("composants")}>
          Composants{b.composants.length > 0 && <span className="n">{b.composants.length}</span>}
        </button>
        <button type="button" className={`ftab${tab === "travaux" ? " on" : ""}`} onClick={() => setTab("travaux")}>
          Travaux{b.travaux.length > 0 && <span className="n">{b.travaux.length}</span>}
        </button>
      </div>
      {tab === "composants" && <ComposantsTab b={b} />}
      {tab === "travaux" && <TravauxTab b={b} />}
    </>
  );
}
