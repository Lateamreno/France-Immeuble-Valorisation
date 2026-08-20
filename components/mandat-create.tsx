"use client";

// Modale « Nouveau mandat » (réplique BO) : type, type de mandant, objet =
// immeuble courant, mandant, remarques → crée puis ouvre la fiche mandat.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BienData } from "@/lib/bubble/server";
import { createMandat } from "@/lib/bo/actions";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function AddMandatButton({ b }: { b: BienData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [type, setType] = useState("Vente");
  const [pers, setPers] = useState("Personne physique");
  const [prenom, setPrenom] = useState(S(b.proprietaire?.["prénom"]));
  const [nom, setNom] = useState(S(b.proprietaire?.nom));
  const [rs, setRs] = useState("");
  const [rem, setRem] = useState("");
  const immeubleId = String(b.im._id);

  const submit = () =>
    start(async () => {
      const id = await createMandat(immeubleId, String(b.im.AGENT ?? ""), {
        Type: type,
        Type_personne: pers,
        prenom_m1: pers === "Personne physique" ? prenom || undefined : undefined,
        nom_m1: pers === "Personne physique" ? nom || undefined : undefined,
        raison_sociale: pers === "Personne morale" ? rs || undefined : undefined,
        remarques: rem || undefined,
      });
      setOpen(false);
      router.push(`/bien/${immeubleId}/mandat/${id}`);
    });

  return (
    <>
      <button className="fbtn" type="button" style={{ margin: "0 auto 14px", display: "flex" }} onClick={() => setOpen(true)}>
        + Ajouter un mandat
      </button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouveau mandat<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Type de mandat</span>
              <div className="mrow">
                {["Vente", "Recherche"].map((t) => (
                  <button key={t} type="button" className={`mopt${type === t ? " on" : ""}`} onClick={() => setType(t)}>Mandat de {t.toLowerCase()}</button>
                ))}
              </div>
              <span className="mlab">Type de mandant</span>
              <div className="mrow">
                {["Personne physique", "Personne morale"].map((t) => (
                  <button key={t} type="button" className={`mopt${pers === t ? " on" : ""}`} onClick={() => setPers(t)}>{t}</button>
                ))}
              </div>
              <span className="mlab">Objet du mandat</span>
              <div style={{ fontSize: 13, color: "var(--slate)" }}>
                {[S(b.im.adresse_numero_rue), S(b.im.adresse_rue)].filter(Boolean).join(" ")}, {S(b.im.adresse_zipcode)} {S(b.im.adresse_ville)}
              </div>
              <span className="mlab">Mandant</span>
              {pers === "Personne physique" ? (
                <div className="mrow">
                  <input className="min" style={{ width: 140 }} placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
                  <input className="min" style={{ width: 160 }} placeholder="NOM" value={nom} onChange={(e) => setNom(e.target.value)} />
                </div>
              ) : (
                <input className="min" placeholder="Raison sociale" value={rs} onChange={(e) => setRs(e.target.value)} />
              )}
              <span className="mlab">Informations et remarques</span>
              <textarea className="min" rows={2} value={rem} onChange={(e) => setRem(e.target.value)} />
            </div>
            <div className="modal-f">
              <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined} onClick={submit}>
                <span className="ch">›</span> Créer le mandat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
