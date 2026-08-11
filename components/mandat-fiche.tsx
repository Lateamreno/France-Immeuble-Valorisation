"use client";

// Fiche mandat — réplique du BO : en-tête (type · numéro · honos · statut ·
// dates), onglets Mandants / Objet / Prix / Conditions, actions registre
// (« Attribuer un numéro » = séquence Hoguet verrouillée, infos reçues, annulation).
import { useState, useTransition } from "react";
import Link from "next/link";
import type { getMandat } from "@/lib/bubble/server";
import { dmy, euros } from "@/lib/format";
import {
  cancelMandat, mandatInfosRecues, reserveMandatNumero, updateMandat, type MandatPatch,
} from "@/lib/bo/actions";

type Data = NonNullable<Awaited<ReturnType<typeof getMandat>>>;

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
const dateInput = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : "");

const TABS = ["Mandants", "Objet", "Prix", "Conditions"] as const;

export function MandatFiche({ d }: { d: Data }) {
  const m = d.m;
  const im = d.im;
  const mandatId = String(m._id);
  const immeubleId = im ? String(im._id) : "";
  const [tab, setTab] = useState<(typeof TABS)[number]>("Mandants");
  const [pending, start] = useTransition();
  const statut = S(m.Statut);
  const numero = S(m.numero);
  const locked = m.locked === true || !!S(m.pdf_signed) || !!S(m.date_signature);

  const act = (fn: () => Promise<unknown>) => start(async () => { await fn(); });

  return (
    <div className="wiz" style={{ maxWidth: 900 }}>
      <div className="whead">
        <div className="wtitle">
          {S(m.Type) || "Vente"} {S(m.Type_exclu)}{num(m["durée_exclu_jours"]) ? ` (${m["durée_exclu_jours"]} j)` : ""} ·{" "}
          {numero ? `#${numero}` : "Pas de numéro"}
        </div>
        {im && <Link href={`/bien/${immeubleId}`} className="wclose">✕ Retour à la fiche bien</Link>}
      </div>

      <div className="mhband">
        <span className={statut === "En cours" || statut === "Vendu" ? "badge-g" : ["Annulé", "Expiré"].includes(statut) ? "badge-r" : "badge-o"}>{statut || "Attente infos"}</span>
        {euros(m.honos_ttc) && <span className="chip">{euros(m.honos_ttc)} d&apos;honoraires</span>}
        {(dmy(m.date_effet) || dmy(m.date_fin)) && <span className="chip">{dmy(m.date_effet) ?? "…"} → {dmy(m.date_fin) ?? "…"}</span>}
        {im && <span className="chip">{S(im.adresse_ville)} ({S(im.adresse_zipcode)})</span>}
        <span className="sp" style={{ flex: 1 }} />
        {!numero && <ReserveBtn mandatId={mandatId} immeubleId={immeubleId} />}
        {statut === "Attente infos" && (
          <button className="fadd" type="button" disabled={pending} onClick={() => act(() => mandatInfosRecues(mandatId, immeubleId))}>
            Infos mandat reçues
          </button>
        )}
        {!["Annulé", "Vendu"].includes(statut) && <CancelBtn mandatId={mandatId} immeubleId={immeubleId} />}
      </div>

      {locked && (
        <div className="warnbox" style={{ marginBottom: 12 }}>
          Ce mandat est signé{dmy(m.date_signature) ? ` par le vendeur le ${dmy(m.date_signature)}` : ""}, il n&apos;est plus possible de le modifier.
        </div>
      )}
      {numero && !locked && (
        <div className="warnbox" style={{ marginBottom: 12 }}>
          Numéro <b>{numero}</b> inscrit au registre des mandats — il ne peut plus être modifié ni le mandat supprimé.
        </div>
      )}

      <div className="ftabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`ftab${tab === t ? " on" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="wbody">
        {tab === "Mandants" && <MandantsTab m={m} mandatId={mandatId} immeubleId={immeubleId} locked={locked} />}
        {tab === "Objet" && <ObjetTab m={m} im={im} mandatId={mandatId} immeubleId={immeubleId} locked={locked} />}
        {tab === "Prix" && <PrixTab m={m} mandatId={mandatId} immeubleId={immeubleId} locked={locked} />}
        {tab === "Conditions" && <ConditionsTab m={m} mandatId={mandatId} immeubleId={immeubleId} locked={locked} />}
      </div>
    </div>
  );
}

function SaveBar({ onSave, disabled }: { onSave: () => void; disabled: boolean }) {
  return (
    <div className="wnav">
      <span className="sp" style={{ flex: 1 }} />
      <button className="kgo" type="button" disabled={disabled} style={disabled ? { opacity: 0.5 } : undefined} onClick={onSave}>
        <span className="ch">›</span> Enregistrer
      </button>
    </div>
  );
}

function MandantsTab({ m, mandatId, immeubleId, locked }: { m: Record<string, unknown>; mandatId: string; immeubleId: string; locked: boolean }) {
  const [pending, start] = useTransition();
  const pm = S(m.Type_personne) === "Personne morale";
  const [q1, setQ1] = useState(S(m["qualité_m1"]) || "M.");
  const [p1, setP1] = useState(S(m["prénom_m1"]));
  const [n1, setN1] = useState(S(m.nom_m1));
  const [d1, setD1] = useState(dateInput(m.date_naissance_m1));
  const [p2, setP2] = useState(S(m["prénom_m2"]));
  const [n2, setN2] = useState(S(m.nom_m2));
  const [d2, setD2] = useState(dateInput(m.date_naissance_m2));
  const [rs, setRs] = useState(S(m.raison_sociale));
  const [siren, setSiren] = useState(S(m.siren));

  const save = () =>
    start(() =>
      updateMandat(mandatId, immeubleId, {
        "qualité_m1": q1, "prénom_m1": p1 || undefined, nom_m1: n1 || undefined,
        date_naissance_m1: d1 ? new Date(d1).toISOString() : undefined,
        "prénom_m2": p2 || undefined, nom_m2: n2 || undefined,
        date_naissance_m2: d2 ? new Date(d2).toISOString() : undefined,
        raison_sociale: rs || undefined, siren: siren || undefined,
      } as MandatPatch),
    );

  return (
    <>
      <div className="fsub">{pm ? "Personne morale" : "Mandant 1"}</div>
      {pm ? (
        <div className="mrow">
          <input className="min" style={{ width: 240 }} placeholder="Raison sociale" value={rs} onChange={(e) => setRs(e.target.value)} disabled={locked} />
          <input className="min" style={{ width: 140 }} placeholder="SIREN" value={siren} onChange={(e) => setSiren(e.target.value)} disabled={locked} />
        </div>
      ) : (
        <div className="mrow" style={{ alignItems: "center" }}>
          <select className="min" style={{ width: 70 }} value={q1} onChange={(e) => setQ1(e.target.value)} disabled={locked}><option>M.</option><option>Mme</option></select>
          <input className="min" style={{ width: 130 }} placeholder="Prénom" value={p1} onChange={(e) => setP1(e.target.value)} disabled={locked} />
          <input className="min" style={{ width: 150 }} placeholder="NOM" value={n1} onChange={(e) => setN1(e.target.value)} disabled={locked} />
          <label style={{ fontSize: 12 }}>Né(e) le <input className="min" type="date" value={d1} onChange={(e) => setD1(e.target.value)} disabled={locked} /></label>
        </div>
      )}
      {!pm && (
        <>
          <div className="fsub" style={{ marginTop: 14 }}>Mandant 2 (facultatif)</div>
          <div className="mrow" style={{ alignItems: "center" }}>
            <input className="min" style={{ width: 130 }} placeholder="Prénom" value={p2} onChange={(e) => setP2(e.target.value)} disabled={locked} />
            <input className="min" style={{ width: 150 }} placeholder="NOM" value={n2} onChange={(e) => setN2(e.target.value)} disabled={locked} />
            <label style={{ fontSize: 12 }}>Né(e) le <input className="min" type="date" value={d2} onChange={(e) => setD2(e.target.value)} disabled={locked} /></label>
          </div>
        </>
      )}
      {!locked && <SaveBar onSave={save} disabled={pending} />}
    </>
  );
}

function ObjetTab({ m, im, mandatId, immeubleId, locked }: { m: Record<string, unknown>; im: Record<string, unknown> | null; mandatId: string; immeubleId: string; locked: boolean }) {
  const [pending, start] = useTransition();
  const [occ, setOcc] = useState(m.occuped_yn === true);
  const [cad, setCad] = useState(S(m.ref_cadastre));
  const [st, setSt] = useState(S(m.surface_terrain));
  const [sb, setSb] = useState(S(m.surface_bati));
  const [desc, setDesc] = useState(S(m.description));

  const save = () =>
    start(() =>
      updateMandat(mandatId, immeubleId, {
        occuped_yn: occ, ref_cadastre: cad || undefined,
        surface_terrain: parse(st), surface_bati: parse(sb),
        description: desc || undefined,
      }),
    );

  return (
    <>
      <div className="fsub">Occupation</div>
      <div className="mrow">
        <button type="button" className={`mopt${occ ? " on" : ""}`} onClick={() => !locked && setOcc(true)}>Vendu occupé</button>
        <button type="button" className={`mopt${!occ ? " on" : ""}`} onClick={() => !locked && setOcc(false)}>Vendu libre</button>
      </div>
      <div className="fsub" style={{ marginTop: 14 }}>Bien</div>
      {im && (
        <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 8 }}>
          {[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}, {S(im.adresse_zipcode)} {S(im.adresse_ville)}
        </div>
      )}
      <div className="mrow" style={{ alignItems: "center" }}>
        <input className="min" style={{ width: 180 }} placeholder="Réf. cadastrale" value={cad} onChange={(e) => setCad(e.target.value)} disabled={locked} />
        <label style={{ fontSize: 12 }}>Terrain m² <input className="min" style={{ width: 80 }} value={st} onChange={(e) => setSt(e.target.value)} disabled={locked} /></label>
        <label style={{ fontSize: 12 }}>Bâti m² <input className="min" style={{ width: 80 }} value={sb} onChange={(e) => setSb(e.target.value)} disabled={locked} /></label>
      </div>
      <span className="mlab">Descriptif</span>
      <textarea className="min" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={locked} />
      {!locked && <SaveBar onSave={save} disabled={pending} />}
    </>
  );
}

function PrixTab({ m, mandatId, immeubleId, locked }: { m: Record<string, unknown>; mandatId: string; immeubleId: string; locked: boolean }) {
  const [pending, start] = useTransition();
  const [nv, setNv] = useState(S(num(m.prix_nv)));
  const [taux, setTaux] = useState(S(num(m.honos_taux) ?? 5));
  const [charge, setCharge] = useState(S(m.Charge_hono) || "Vendeur");
  const vNv = parse(nv) ?? 0;
  const vTaux = parse(taux) ?? 5;
  const honos = Math.round(vNv * (vTaux / 100));

  const save = () =>
    start(() =>
      updateMandat(mandatId, immeubleId, { prix_nv: vNv || undefined, honos_taux: vTaux, Charge_hono: charge }),
    );

  return (
    <>
      <div className="fsub">Prix</div>
      <div className="mrow" style={{ alignItems: "center" }}>
        <label style={{ fontSize: 12 }}>Net vendeur <input className="min" style={{ width: 110 }} value={nv} onChange={(e) => setNv(e.target.value)} disabled={locked} /></label>
        <label style={{ fontSize: 12 }}>Honoraires % <input className="min" style={{ width: 60 }} value={taux} onChange={(e) => setTaux(e.target.value)} disabled={locked} /></label>
        {vNv > 0 && (
          <span style={{ fontSize: 13 }}>
            Honoraires <b>{euros(honos)}</b> → Prix HAI <b className="nmoney">{euros(vNv + honos)}</b>
          </span>
        )}
      </div>
      <div className="fsub" style={{ marginTop: 14 }}>Charge des honoraires</div>
      <div className="mrow">
        {["Vendeur", "Acheteur"].map((c) => (
          <button key={c} type="button" className={`mopt${charge === c ? " on" : ""}`} onClick={() => !locked && setCharge(c)}>{c}</button>
        ))}
      </div>
      {charge === "Acheteur" && (
        <div className="warnbox">
          Doctrine préemption : sur tout lot susceptible de préemption (loi 75, Pinel),
          les honoraires restent charge <b>vendeur</b> et le prix notifié = net vendeur non majoré.
        </div>
      )}
      {!locked && <SaveBar onSave={save} disabled={pending} />}
    </>
  );
}

function ConditionsTab({ m, mandatId, immeubleId, locked }: { m: Record<string, unknown>; mandatId: string; immeubleId: string; locked: boolean }) {
  const [pending, start] = useTransition();
  const [debut, setDebut] = useState(dateInput(m.date_effet));
  const [duree, setDuree] = useState(S(num(m["durée_tot_month"]) ?? 12));
  const [exclu, setExclu] = useState(S(m.Type_exclu) || "Semi-exclusif");
  const [dExclu, setDExclu] = useState(S(num(m["durée_exclu_jours"]) ?? 14));
  const [irrevoc, setIrrevoc] = useState(S(num(m["durée_irrevoc_days"]) ?? 14));
  const fin = (() => {
    if (!debut || !parse(duree)) return undefined;
    const d = new Date(debut);
    d.setMonth(d.getMonth() + (parse(duree) ?? 12));
    return d;
  })();

  const save = () =>
    start(() =>
      updateMandat(mandatId, immeubleId, {
        date_effet: debut ? new Date(debut).toISOString() : undefined,
        "durée_tot_month": parse(duree),
        Type_exclu: exclu,
        "durée_exclu_jours": parse(dExclu),
        "durée_irrevoc_days": parse(irrevoc),
      }),
    );

  return (
    <>
      <div className="fsub">Durées</div>
      <div className="mrow" style={{ alignItems: "center" }}>
        <label style={{ fontSize: 12 }}>Début <input className="min" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} disabled={locked} /></label>
        <label style={{ fontSize: 12 }}>Durée totale (mois) <input className="min" style={{ width: 60 }} value={duree} onChange={(e) => setDuree(e.target.value)} disabled={locked} /></label>
        {fin && <span style={{ fontSize: 12.5 }}>→ fin le <b>{fin.toLocaleDateString("fr-FR")}</b></span>}
      </div>
      <div className="fsub" style={{ marginTop: 14 }}>Exclusivité</div>
      <div className="mrow" style={{ alignItems: "center" }}>
        {["Simple", "Semi-exclusif", "Exclusif"].map((t) => (
          <button key={t} type="button" className={`mopt${exclu === t ? " on" : ""}`} onClick={() => !locked && setExclu(t)}>{t}</button>
        ))}
        <label style={{ fontSize: 12 }}>Durée exclu (j) <input className="min" style={{ width: 60 }} value={dExclu} onChange={(e) => setDExclu(e.target.value)} disabled={locked} /></label>
        <label style={{ fontSize: 12 }}>Irrévocabilité (j) <input className="min" style={{ width: 60 }} value={irrevoc} onChange={(e) => setIrrevoc(e.target.value)} disabled={locked} /></label>
      </div>
      {!locked && <SaveBar onSave={save} disabled={pending} />}
    </>
  );
}

function ReserveBtn({ mandatId, immeubleId }: { mandatId: string; immeubleId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>Attribuer un numéro</button>
      {open && (
        <div className="modal-ov" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Réserver un numéro<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Une fois le numéro réservé, il ne sera <b>plus possible de supprimer le mandat</b> ni
              de modifier le numéro. Le prochain numéro du registre sera attribué automatiquement
              (séquence sans trou, registre loi Hoguet).
            </div>
            <div className="modal-f">
              <button
                className="kgo" type="button" disabled={pending}
                onClick={() => start(async () => { await reserveMandatNumero(mandatId, immeubleId); setOpen(false); })}
              >
                <span className="ch">›</span> Réserver le numéro
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CancelBtn({ mandatId, immeubleId }: { mandatId: string; immeubleId: string }) {
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <button className="fadd" type="button" style={{ color: "var(--red)", borderColor: "#e6b3b3" }} onClick={() => setOpen(true)}>
        Annuler le mandat
      </button>
      {open && (
        <div className="modal-ov" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Annuler le mandat<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Motif de l&apos;annulation</span>
              <input className="min" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. Vendeur ne souhaite plus vendre" />
            </div>
            <div className="modal-f">
              <button
                className="kgo" type="button" disabled={pending || !motif.trim()}
                style={pending || !motif.trim() ? { opacity: 0.5 } : undefined}
                onClick={() => start(async () => { await cancelMandat(mandatId, immeubleId, motif); setOpen(false); })}
              >
                <span className="ch">›</span> Confirmer l&apos;annulation
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
