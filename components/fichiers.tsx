"use client";

// Fichiers de la fiche : modale « Nouvelle photo » (type Extérieur /
// Parties communes / Lot) et coffre documentaire (upload + liste).
import { useRef, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { dmy } from "@/lib/format";
import { deleteDocument, deletePhoto, uploadDocument, uploadPhoto } from "@/lib/bo/actions";

// « Carte » : captures de situation importées depuis l'onglet Emplacement.
const TYPES_PHOTO = ["Extérieur", "Parties communes", "Lot", "Carte"];

export function AddPhotoButton({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const [lotId, setLotId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () =>
    start(async () => {
      setErr(null);
      const f = fileRef.current?.files?.[0];
      if (!f || !type) return;
      try {
        const fd = new FormData();
        fd.set("file", f);
        await uploadPhoto(immeubleId, type, type === "Lot" && lotId ? lotId : null, fd);
        setOpen(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <>
      <button className="fbtn" type="button" style={{ margin: "0 auto 14px", display: "flex" }} onClick={() => setOpen(true)}>
        + Ajouter une photo
      </button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouvelle photo<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Type de document</span>
              <div className="mrow">
                {TYPES_PHOTO.map((t) => (
                  <button key={t} type="button" className={`mopt${type === t ? " on" : ""}`} onClick={() => setType(t)}>{t}</button>
                ))}
              </div>
              {type === "Lot" && (
                <>
                  <span className="mlab">Lot concerné</span>
                  <select className="min" value={lotId} onChange={(e) => setLotId(e.target.value)}>
                    <option value="">Sélectionnez un lot…</option>
                    {b.lots.map((l) => (
                      <option key={String(l._id)} value={String(l._id)}>Lot {String(l.numero ?? "?")} · {String(l.Type_lot ?? "")}</option>
                    ))}
                  </select>
                </>
              )}
              <span className="mlab">{type ? "Fichier image" : "Sélectionnez d'abord un type"}</span>
              <input ref={fileRef} className="min" type="file" accept="image/*" disabled={!type} />
              {err && <div className="warnbox" style={{ color: "var(--red)", borderColor: "var(--red)" }}>{err}</div>}
            </div>
            <div className="modal-f">
              <button className="kgo" type="button" disabled={pending || !type} style={pending || !type ? { opacity: 0.5 } : undefined} onClick={submit}>
                <span className="ch">›</span> {pending ? "Envoi…" : "Ajouter la photo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DeletePhotoButton({ b, photoId }: { b: BienData; photoId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="xdel" type="button" title="Supprimer la photo" disabled={pending}
      style={{ position: "absolute", top: 4, right: 4, background: "rgba(255,255,255,.85)" }}
      onClick={() => {
        if (!confirm("Supprimer cette photo ? (récupérable dans la corbeille)")) return;
        start(() => deletePhoto(String(b.im._id), photoId));
      }}
    >✕</button>
  );
}

export function DocumentsCoffre({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = () =>
    start(async () => {
      setErr(null);
      const f = fileRef.current?.files?.[0];
      if (!f) return;
      try {
        const fd = new FormData();
        fd.set("file", f);
        await uploadDocument(immeubleId, label.trim(), fd);
        setLabel("");
        if (fileRef.current) fileRef.current.value = "";
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <>
      <div className="fsub">Coffre documentaire</div>
      {b.documents.length === 0 && <div className="fempty">Aucun document déposé depuis le nouveau BO.</div>}
      {b.documents.map((d) => (
        <div key={String(d._id)} className="chrow">
          <span className="t">{String(d.name ?? d.file_name ?? "Document")}</span>
          <span className="c">{dmy(d["Created Date"])}{typeof d.size_kB === "number" ? ` · ${Math.round((d.size_kB as number) / 102.4) / 10} Mo` : ""}</span>
          <span className="sp" style={{ flex: 1 }} />
          <a className="fadd" href={`/api/photo?s=${encodeURIComponent(String(d.path ?? ""))}`} target="_blank" rel="noreferrer">Ouvrir</a>
          <button
            className="xdel" type="button" title="Retirer le document" disabled={pending}
            onClick={() => {
              if (!confirm("Retirer ce document ? (récupérable dans la corbeille)")) return;
              start(() => deleteDocument(immeubleId, String(d._id)));
            }}
          >✕</button>
        </div>
      ))}
      <div className="mrow" style={{ alignItems: "center", marginTop: 10 }}>
        <input className="min" style={{ width: 200 }} placeholder="Libellé (ex. Taxe foncière 2025)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input ref={fileRef} className="min" type="file" style={{ flex: 1 }} />
        <button className="fadd" type="button" disabled={pending} onClick={submit}>
          {pending ? "Envoi…" : "+ Ajouter un document"}
        </button>
      </div>
      {err && <div className="warnbox" style={{ color: "var(--red)", borderColor: "var(--red)" }}>{err}</div>}
      <div style={{ fontSize: 11.5, color: "var(--gray-lt)", marginTop: 8 }}>
        RGPD : caviarder les baux avant tout partage externe — le coffre est privé (accès service uniquement).
      </div>
    </>
  );
}
