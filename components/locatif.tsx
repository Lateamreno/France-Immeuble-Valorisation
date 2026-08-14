"use client";

// État locatif — sous-onglets Lots · Baux · Locataires · Charges (réplique BO)
// avec bandeau de synthèse par destination.
import { useMemo, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { Picto } from "@/components/pictos";
import { dmy, euros } from "@/lib/format";
import { LotsEditor } from "@/components/lots-editor";
import {
  addBail, addCharge, addLocataire,
  deleteBail, deleteCharge, deleteLocataire,
} from "@/lib/bo/actions";

import { TAXES, TYPES_BAIL as TYPES_BAIL_ALL, TYPES_CHARGE } from "@/lib/referentiels";

// Un bail ne peut pas être « Vide » / « n.c. » (ce sont des états de lot).
const TYPES_BAIL = TYPES_BAIL_ALL.filter((t) => t !== "Vide" && t !== "n.c.");
const STATUTS_BAIL = [
  { key: "en_cours", label: "Bail en cours" },
  { key: "impayes", label: "Impayés" },
  { key: "preavis", label: "Préavis déposé" },
  { key: "expulsion", label: "Expulsion en cours" },
] as const;

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));

function lotLabel(l: Record<string, unknown>) {
  return [`Lot ${l.numero ?? "?"}`, l.Type_lot].filter(Boolean).join(" · ");
}

/* ---------- Baux ---------- */

function BauxTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const n = (f: string) => b.baux.filter((x) => x[f] === true).length;
  const lotsOf = (bail: Record<string, unknown>) =>
    (Array.isArray(bail.LOTs) ? (bail.LOTs as string[]) : [])
      .map((id) => b.lots.find((l) => l._id === id))
      .filter(Boolean)
      .map((l) => `Lot ${l!.numero ?? "?"}`)
      .join(", ");
  const locsOf = (bail: Record<string, unknown>) =>
    (Array.isArray(bail.LOCATAIREs) ? (bail.LOCATAIREs as string[]) : [])
      .map((id) => b.locataires.find((l) => l._id === id))
      .filter(Boolean)
      .map((l) => String(l!.formatted_name ?? ""))
      .join(", ");

  return (
    <>
      <div className="lband2">
        <span className="dst">{n("activ")} actifs · {n("impayes")} impayés · {n("expulsion")} expulsions · {n("preavis")} préavis</span>
        <span className="sp" style={{ flex: 1 }} />
        <AddBailButton b={b} />
      </div>
      {b.baux.length === 0 ? (
        <div className="fempty">Aucun bail saisi — les baux de l&apos;état locatif n&apos;existent pour l&apos;instant que sur les lots.</div>
      ) : (
        <div className="ltable-wrap" style={pending ? { opacity: 0.6 } : undefined}>
          <table className="ltable">
            <thead>
              <tr>
                <th>Lots</th><th>Locataires</th><th>Type</th><th>Loyer initial</th>
                <th>Loyer révisé</th><th>Début</th><th>Fin</th><th>Échéance</th><th>Statut</th><th />
              </tr>
            </thead>
            <tbody>
              {b.baux.map((bl) => (
                <tr key={String(bl._id)}>
                  <td>{lotsOf(bl)}</td>
                  <td>{locsOf(bl)}</td>
                  <td>{String(bl.Type_bail ?? "")}</td>
                  <td>{euros(bl.loyer_init) ?? ""}</td>
                  <td>{euros(bl.loyer_revised) ?? ""}</td>
                  <td>{dmy(bl.date_start) ?? ""}</td>
                  <td>{dmy(bl.date_end) ?? ""}</td>
                  <td>{dmy(bl.date_next_echeance) ?? ""}</td>
                  <td>
                    {bl.expulsion === true ? <span className="badge-r">Expulsion</span>
                      : bl.impayes === true ? <span className="badge-r">Impayés</span>
                      : bl.preavis === true ? <span className="badge-o">Préavis</span>
                      : bl.activ === true ? <span className="badge-g">En cours</span> : null}
                  </td>
                  <td>
                    <button
                      className="xdel" type="button" title="Supprimer le bail"
                      onClick={() => {
                        if (!confirm("Supprimer ce bail ? (récupérable dans la corbeille)")) return;
                        start(() => deleteBail(immeubleId, String(bl._id)));
                      }}
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AddBailButton({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [lotIds, setLotIds] = useState<string[]>([]);
  const [locIds, setLocIds] = useState<string[]>([]);
  const [typeBail, setTypeBail] = useState("Nu");
  const [pm, setPm] = useState(false);
  const [loyer, setLoyer] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [irlInit, setIrlInit] = useState("");
  const [irlAct, setIrlAct] = useState("");
  const [statut, setStatut] = useState<(typeof STATUTS_BAIL)[number]["key"]>("en_cours");
  const [comment, setComment] = useState("");

  const revise = (() => {
    const l = parse(loyer), i0 = parse(irlInit), i1 = parse(irlAct);
    return l && i0 && i1 && i0 > 0 ? Math.round((l * i1) / i0) : undefined;
  })();
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const submit = () =>
    start(async () => {
      await addBail(immeubleId, {
        lotIds, locataireIds: locIds, Type_bail: typeBail, bailleur_pm: pm,
        loyer_init: parse(loyer), date_start: debut || undefined, date_end: fin || undefined,
        indice_init: parse(irlInit), indice_actuel: parse(irlAct),
        statut, commentaire: comment || undefined,
      });
      setOpen(false);
    });

  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>+ Ajouter un bail</button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouveau bail<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Locataires</span>
              <div className="mrow">
                {b.locataires.length === 0 && <span style={{ fontSize: 12, color: "var(--gray-lt)" }}>Aucun locataire — créez-le d&apos;abord dans l&apos;onglet Locataires.</span>}
                {b.locataires.map((l) => (
                  <button key={String(l._id)} type="button" className={`mopt${locIds.includes(String(l._id)) ? " on" : ""}`} onClick={() => toggle(locIds, setLocIds, String(l._id))}>
                    {String(l.formatted_name ?? "?")}
                  </button>
                ))}
              </div>
              <span className="mlab">Lots concernés</span>
              <div className="mrow">
                {b.lots.map((l) => (
                  <button key={String(l._id)} type="button" className={`mopt${lotIds.includes(String(l._id)) ? " on" : ""}`} onClick={() => toggle(lotIds, setLotIds, String(l._id))}>
                    {lotLabel(l)}
                  </button>
                ))}
              </div>
              <span className="mlab">Conditions du bail</span>
              <div className="mrow" style={{ alignItems: "center", marginBottom: 6 }}>
                <button type="button" className={`mopt${pm ? " on" : ""}`} onClick={() => setPm(!pm)}>Bailleur personne morale</button>
                <select className="min" style={{ width: 130 }} value={typeBail} onChange={(e) => setTypeBail(e.target.value)}>
                  {TYPES_BAIL.map((t) => <option key={t}>{t}</option>)}
                </select>
                <input className="min" style={{ width: 110 }} placeholder="Loyer initial €" value={loyer} onChange={(e) => setLoyer(e.target.value)} />
              </div>
              <div className="mrow">
                <label style={{ fontSize: 12 }}>Début <input className="min" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Fin <input className="min" type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></label>
              </div>
              <span className="mlab">Indice IRL</span>
              <div className="mrow" style={{ alignItems: "center" }}>
                <input className="min" style={{ width: 110 }} placeholder="Valeur initiale" value={irlInit} onChange={(e) => setIrlInit(e.target.value)} />
                <input className="min" style={{ width: 110 }} placeholder="Valeur actuelle" value={irlAct} onChange={(e) => setIrlAct(e.target.value)} />
                {revise !== undefined && <span style={{ fontSize: 12.5 }}>Loyer révisé théorique : <b>{euros(revise)}</b></span>}
              </div>
              <span className="mlab">Statut</span>
              <div className="mrow">
                {STATUTS_BAIL.map((s) => (
                  <button key={s.key} type="button" className={`mopt${statut === s.key ? " on" : ""}`} onClick={() => setStatut(s.key)}>{s.label}</button>
                ))}
              </div>
              <span className="mlab">Commentaire</span>
              <textarea className="min" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="modal-f">
              <button className="kgo" type="button" disabled={pending || lotIds.length === 0} style={pending || lotIds.length === 0 ? { opacity: 0.5 } : undefined} onClick={submit}>
                <span className="ch">›</span> Créer le bail
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Locataires ---------- */

function LocatairesTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const pp = b.locataires.filter((l) => l.pm !== true).length;
  const pm = b.locataires.length - pp;
  const lotsOf = (loc: Record<string, unknown>) =>
    (Array.isArray(loc.LOTs) ? (loc.LOTs as string[]) : [])
      .map((id) => b.lots.find((l) => l._id === id))
      .filter(Boolean)
      .map((l) => `Lot ${l!.numero ?? "?"}`)
      .join(", ");
  return (
    <>
      <div className="lband2">
        <span className="dst">{pp} personne{pp > 1 ? "s" : ""} physique{pp > 1 ? "s" : ""} · {pm} personne{pm > 1 ? "s" : ""} morale{pm > 1 ? "s" : ""}</span>
        <span className="sp" style={{ flex: 1 }} />
        <AddLocataireButton b={b} />
      </div>
      {b.locataires.length === 0 ? (
        <div className="fempty">Aucun locataire saisi.</div>
      ) : (
        <div className="ltable-wrap" style={pending ? { opacity: 0.6 } : undefined}>
          <table className="ltable">
            <thead>
              <tr><th>Nom</th><th>Type</th><th>Téléphone</th><th>E-mail</th><th>Lots</th><th>Commentaire</th><th /></tr>
            </thead>
            <tbody>
              {b.locataires.map((l) => (
                <tr key={String(l._id)}>
                  <td><b>{String(l.formatted_name ?? "")}</b></td>
                  <td>{l.pm === true ? "Personne morale" : "Personne physique"}</td>
                  <td>{String(l.formatted_phone ?? l.phone ?? "")}</td>
                  <td>{String(l.email ?? "")}</td>
                  <td>{lotsOf(l)}</td>
                  <td>{String(l.commentaire ?? "")}</td>
                  <td>
                    <button
                      className="xdel" type="button" title="Supprimer le locataire"
                      onClick={() => {
                        if (!confirm("Supprimer ce locataire ? (récupérable dans la corbeille)")) return;
                        start(() => deleteLocataire(immeubleId, String(l._id)));
                      }}
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--gray-lt)", marginTop: 8 }}>
        RGPD : les noms des locataires restent internes au BO, jamais exposés côté public.
      </div>
    </>
  );
}

function AddLocataireButton({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [pm, setPm] = useState(false);
  const [civ, setCiv] = useState("M.");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lotIds, setLotIds] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const ok = pm ? nom.trim() !== "" : nom.trim() !== "";

  const submit = () =>
    start(async () => {
      await addLocataire(immeubleId, {
        pm,
        pm_nom: pm ? nom : undefined,
        pp_civilite: pm ? undefined : civ,
        pp_prenom: pm ? undefined : prenom || undefined,
        pp_nom: pm ? undefined : nom,
        phone: phone || undefined,
        email: email || undefined,
        lotIds,
        commentaire: comment || undefined,
      });
      setOpen(false);
    });

  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>+ Ajouter un locataire</button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouveau locataire<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Coordonnées</span>
              <div className="mrow" style={{ alignItems: "center" }}>
                <button type="button" className={`mopt${pm ? " on" : ""}`} onClick={() => setPm(!pm)}>Personne morale</button>
                {!pm && (
                  <select className="min" style={{ width: 70 }} value={civ} onChange={(e) => setCiv(e.target.value)}>
                    <option>M.</option><option>Mme</option>
                  </select>
                )}
                {!pm && <input className="min" style={{ width: 120 }} placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />}
                <input className="min" style={{ width: 150 }} placeholder={pm ? "Raison sociale" : "NOM"} value={nom} onChange={(e) => setNom(e.target.value)} />
              </div>
              <div className="mrow" style={{ marginTop: 6 }}>
                <input className="min" style={{ width: 190 }} placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="min" style={{ width: 140 }} placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <span className="mlab">Lots</span>
              <div className="mrow">
                {b.lots.map((l) => (
                  <button
                    key={String(l._id)} type="button"
                    className={`mopt${lotIds.includes(String(l._id)) ? " on" : ""}`}
                    onClick={() => setLotIds(lotIds.includes(String(l._id)) ? lotIds.filter((x) => x !== String(l._id)) : [...lotIds, String(l._id)])}
                  >
                    {lotLabel(l)}
                  </button>
                ))}
              </div>
              <span className="mlab">Commentaire</span>
              <textarea className="min" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="modal-f">
              <button className="kgo" type="button" disabled={pending || !ok} style={pending || !ok ? { opacity: 0.5 } : undefined} onClick={submit}>
                <span className="ch">›</span> Créer le locataire
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Charges ---------- */

function ChargesTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const taxes = b.charges.filter((c) => TAXES.has(String(c.Type_charge ?? "")));
  const autres = b.charges.filter((c) => !TAXES.has(String(c.Type_charge ?? "")));
  const total = (rows: Record<string, unknown>[]) =>
    rows.reduce((s, c) => s + (num(c.total_an) ?? 0), 0);

  const Row = ({ c }: { c: Record<string, unknown> }) => (
    <div className="chrow">
      <span className="t">{String(c.Type_charge ?? "")}{c.type_autre ? ` — ${c.type_autre}` : ""}</span>
      {c.commentaire ? <span className="c">{String(c.commentaire)}</span> : null}
      <span className="sp" style={{ flex: 1 }} />
      <span className="v">{euros(c.total_an) ?? "n.c."}{num(c.total_an) !== undefined ? "/an" : ""}</span>
      {num(c.non_recup_an) !== undefined && num(c.non_recup_an)! > 0 && (
        <span className="nr">− {euros(c.non_recup_an)}/an</span>
      )}
      <button
        className="xdel" type="button" title="Supprimer la charge"
        onClick={() => {
          if (!confirm("Supprimer cette charge ? (récupérable dans la corbeille)")) return;
          start(() => deleteCharge(immeubleId, String(c._id)));
        }}
      >✕</button>
    </div>
  );

  return (
    <div style={pending ? { opacity: 0.6 } : undefined}>
      <div className="lband2">
        <span className="dst">
          {euros(b.im.fin_charges_total) ?? euros(total(b.charges)) ?? "0 €"}/an de charges
          {num(b.im.fin_charges_non_recup) !== undefined && <> · dont {euros(b.im.fin_charges_non_recup)}/an non récupérables</>}
        </span>
        <span className="sp" style={{ flex: 1 }} />
        <AddChargeButton b={b} />
      </div>
      <div className="fsub">Taxes et impôts</div>
      {taxes.length === 0 ? <div className="fempty">Aucune taxe saisie.</div> : taxes.map((c) => <Row key={String(c._id)} c={c} />)}
      <div className="fsub" style={{ marginTop: 14 }}>Charges</div>
      {autres.length === 0 ? <div className="fempty">Aucune charge saisie.</div> : autres.map((c) => <Row key={String(c._id)} c={c} />)}
    </div>
  );
}

function AddChargeButton({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [type, setType] = useState("Taxe Foncière");
  const [autre, setAutre] = useState("");
  const [totalAn, setTotalAn] = useState("");
  const [recup, setRecup] = useState("");
  const [comment, setComment] = useState("");
  const t = parse(totalAn), r = parse(recup);

  const submit = () =>
    start(async () => {
      await addCharge(immeubleId, {
        Type_charge: type,
        type_autre: type === "Autre" ? autre || undefined : undefined,
        total_an: t,
        recup_an: r,
        non_recup_an: t !== undefined ? t - (r ?? 0) : undefined,
        commentaire: comment || undefined,
      });
      setOpen(false);
    });

  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>+ Ajouter une charge</button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouvelle charge<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <span className="mlab">Type de charge</span>
              <div className="mrow">
                {TYPES_CHARGE.map((tc) => (
                  <button key={tc} type="button" className={`mopt${type === tc ? " on" : ""}`} onClick={() => setType(tc)}>{tc}</button>
                ))}
              </div>
              {type === "Autre" && (
                <input className="min" style={{ marginTop: 6 }} placeholder="Précisez le type" value={autre} onChange={(e) => setAutre(e.target.value)} />
              )}
              <span className="mlab">Montants</span>
              <div className="mrow" style={{ alignItems: "center" }}>
                <input className="min" style={{ width: 120 }} placeholder="Total €/an" value={totalAn} onChange={(e) => setTotalAn(e.target.value)} />
                <input className="min" style={{ width: 150 }} placeholder="dont récupérable €/an" value={recup} onChange={(e) => setRecup(e.target.value)} />
                {t !== undefined && <span style={{ fontSize: 12.5 }}>non récupérable : <b>{euros(t - (r ?? 0))}/an</b></span>}
              </div>
              <span className="mlab">Commentaire</span>
              <textarea className="min" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="modal-f">
              <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined} onClick={submit}>
                <span className="ch">›</span> Créer la charge
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Conteneur à sous-onglets ---------- */

export const ONGLETS_LOCATIF = [
  { key: "lots", label: "Lots" },
  { key: "baux", label: "Baux" },
  { key: "locataires", label: "Locataires" },
  { key: "charges", label: "Charges" },
] as const;

export function LocatifTabs({ b, tab: pilote, onTab }: {
  b: BienData;
  /** Onglet piloté depuis le rail (retour #12) ; sinon état interne. */
  tab?: string;
  onTab?: (t: string) => void;
}) {
  const [interne, setInterne] = useState("lots");
  const tab = pilote ?? interne;
  const setTab = (t: string) => { setInterne(t); onTab?.(t); };
  const tabs = [
    { key: "lots", label: "Lots", n: b.lots.length },
    { key: "baux", label: "Baux", n: b.baux.length },
    { key: "locataires", label: "Locataires", n: b.locataires.length },
    { key: "charges", label: "Charges", n: b.charges.length },
  ] as const;
  return (
    <>
      <div className="ftabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={`ftab${tab === t.key ? " on" : ""}`} onClick={() => setTab(t.key)}>
            <Picto nom={t.key} className="ftab-ic" />{t.label}{t.n > 0 ? <span className="n">{t.n}</span> : null}
          </button>
        ))}
      </div>
      {tab === "lots" && <LotsEditor key={`${String(b.im.app_modified ?? "")}-${b.lots.length}`} b={b} />}
      {tab === "baux" && <BauxTab b={b} />}
      {tab === "locataires" && <LocatairesTab b={b} />}
      {tab === "charges" && <ChargesTab b={b} />}
    </>
  );
}
