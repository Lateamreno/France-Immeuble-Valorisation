"use client";

// Commercialisation — visites (programmer, REX, annulation) et offres
// (saisie, acceptation/refus, compromis → vendu), réplique du BO.
import { useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { dmy, euros } from "@/lib/format";
import { addOffre, addVisite, setOffreStatut, setVisiteStatut } from "@/lib/bo/actions";

const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/* ---------- Visites ---------- */

export function AddVisiteButton({ b }: { b: BienData }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [heure, setHeure] = useState("14:00");
  const [visiteur, setVisiteur] = useState("");
  const [comment, setComment] = useState("");
  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>+ Programmer une visite</button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Programmer une visite<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <div className="mrow" style={{ alignItems: "center" }}>
                <label style={{ fontSize: 12 }}>Date <input className="min" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Heure <input className="min" type="time" value={heure} onChange={(e) => setHeure(e.target.value)} /></label>
              </div>
              <span className="mlab">Visiteur</span>
              <input className="min" placeholder="Nom du visiteur / acquéreur" value={visiteur} onChange={(e) => setVisiteur(e.target.value)} />
              <span className="mlab">Commentaire interne</span>
              <textarea className="min" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="modal-f">
              <button
                className="kgo" type="button" disabled={pending || !date}
                style={pending || !date ? { opacity: 0.5 } : undefined}
                onClick={() =>
                  start(async () => {
                    await addVisite(String(b.im._id), String(b.im.AGENT ?? ""), {
                      date: `${date}T${heure || "14:00"}:00`,
                      visiteur: visiteur || undefined,
                      commentaire_interne: comment || undefined,
                      source: "BO",
                    });
                    setOpen(false);
                  })
                }
              ><span className="ch">›</span> Programmer la visite</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function VisiteActions({ b, v }: { b: BienData; v: Record<string, unknown> }) {
  const [pending, start] = useTransition();
  const immeubleId = String(b.im._id);
  const id = String(v._id);
  const st = S(v.Statut);
  if (["Effectuée", "Annulée"].includes(st)) return null;
  return (
    <span className="mrow" style={{ gap: 4 }}>
      <button
        className="fadd" type="button" disabled={pending}
        onClick={() => {
          const rex = prompt("Retour d'expérience (REX) de la visite ?") ?? "";
          start(() => setVisiteStatut(immeubleId, id, "Effectuée", { rex_fi: rex || undefined }));
        }}
      >Effectuée</button>
      <button
        className="fadd" type="button" disabled={pending} style={{ color: "var(--red)", borderColor: "#e6b3b3" }}
        onClick={() => {
          const motif = prompt("Motif de l'annulation ?");
          if (motif === null) return;
          start(() => setVisiteStatut(immeubleId, id, "Annulée", { motif_annulation: motif || undefined }));
        }}
      >Annuler</button>
    </span>
  );
}

/* ---------- Offres ---------- */

export function AddOffreButton({ b }: { b: BienData }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [acheteur, setAcheteur] = useState("");
  const [nv, setNv] = useState("");
  const [honos, setHonos] = useState("");
  const [expiration, setExpiration] = useState("");
  const [comment, setComment] = useState("");
  const vNv = parse(nv) ?? 0;
  const vHonos = parse(honos);
  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>+ Ajouter une offre</button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouvelle offre<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Acheteur</span>
              <input className="min" placeholder="Nom de l'acquéreur" value={acheteur} onChange={(e) => setAcheteur(e.target.value)} />
              <span className="mlab">Montant</span>
              <div className="mrow" style={{ alignItems: "center" }}>
                <label style={{ fontSize: 12 }}>Net vendeur € <input className="min" style={{ width: 110 }} value={nv} onChange={(e) => setNv(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Honoraires HT € <input className="min" style={{ width: 100 }} value={honos} onChange={(e) => setHonos(e.target.value)} /></label>
                {vNv > 0 && vHonos !== undefined && (
                  <span style={{ fontSize: 12.5 }}>= <b>{euros(vNv + Math.round(vHonos * 1.2))} HAI</b> (TTC)</span>
                )}
              </div>
              <div className="mrow" style={{ marginTop: 8, alignItems: "center" }}>
                <label style={{ fontSize: 12 }}>Expire le <input className="min" type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} /></label>
              </div>
              <span className="mlab">Commentaire</span>
              <textarea className="min" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="modal-f">
              <button
                className="kgo" type="button" disabled={pending || vNv <= 0}
                style={pending || vNv <= 0 ? { opacity: 0.5 } : undefined}
                onClick={() =>
                  start(async () => {
                    await addOffre(String(b.im._id), {
                      acheteur: acheteur || undefined,
                      prix_nv: vNv,
                      honos_ht: vHonos,
                      date_expiration: expiration || undefined,
                      commentaire: comment || undefined,
                      source: "BO",
                    });
                    setOpen(false);
                  })
                }
              ><span className="ch">›</span> Ajouter l&apos;offre</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OffreActions({ b, o }: { b: BienData; o: Record<string, unknown> }) {
  const [pending, start] = useTransition();
  const immeubleId = String(b.im._id);
  const id = String(o._id);
  const st = S(o.Statut);
  if (["Refusée", "Vendu"].includes(st)) return null;
  return (
    <span className="mrow" style={{ gap: 4 }}>
      {["En cours", "Contre offre"].includes(st) && (
        <>
          <button className="fadd" type="button" disabled={pending} onClick={() => start(() => setOffreStatut(immeubleId, id, "Acceptée"))}>Accepter</button>
          <button
            className="fadd" type="button" disabled={pending} style={{ color: "var(--red)", borderColor: "#e6b3b3" }}
            onClick={() => {
              const motif = prompt("Motif du refus ?");
              if (motif === null) return;
              start(() => setOffreStatut(immeubleId, id, "Refusée", { motif_refus: motif || undefined }));
            }}
          >Refuser</button>
        </>
      )}
      {st === "Acceptée" && (
        <button
          className="fadd" type="button" disabled={pending}
          onClick={() => {
            const date = prompt("Date du compromis (AAAA-MM-JJ) ?");
            if (!date) return;
            start(() => setOffreStatut(immeubleId, id, "Compromis programmé", { date_compromis: date }));
          }}
        >Programmer le compromis</button>
      )}
      {st === "Compromis programmé" && (
        <button className="fadd" type="button" disabled={pending} onClick={() => start(() => setOffreStatut(immeubleId, id, "Compromis signé"))}>Compromis signé</button>
      )}
      {["Compromis signé", "Vente prévue"].includes(st) && (
        <button className="fadd" type="button" disabled={pending} onClick={() => start(() => setOffreStatut(immeubleId, id, "Vendu"))}>Vendu ✓</button>
      )}
    </span>
  );
}
