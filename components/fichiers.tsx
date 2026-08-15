"use client";

// Coffre documentaire de la fiche (upload + liste). Les photos ont leur
// propre écran depuis le retour #95 : voir components/photos.tsx.
import { useRef, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { dmy } from "@/lib/format";
import { deleteDocument, uploadDocument } from "@/lib/bo/actions";

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
