"use client";

// État locatif — sous-onglets Lots · Baux · Locataires · Charges (réplique BO)
// avec bandeau de synthèse par destination.
import { useMemo, useRef, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { Picto } from "@/components/pictos";
import { dmy, euros } from "@/lib/format";
import { LotsEditor } from "@/components/lots-editor";
import {
  addBail, addCharge, addLocataire,
  deleteBail, deleteCharge, deleteLocataire, updateCharge,
} from "@/lib/bo/actions";
import { BarreEnregistrer } from "@/components/barre-enregistrer";

import { TAXES, TYPES_BAIL as TYPES_BAIL_ALL, TYPES_CHARGE } from "@/lib/referentiels";

// Un bail ne peut pas être « Vide » / « n.c. » (ce sont des états de lot).
const TYPES_BAIL = TYPES_BAIL_ALL.filter((t) => t !== "Vide" && t !== "n.c.");
const STATUTS_BAIL = [
  { key: "en_cours", label: "Bail en cours" },
  { key: "impayes", label: "Impayés" },
  { key: "preavis", label: "Préavis déposé" },
  { key: "expulsion", label: "Expulsion en cours" },
] as const;

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
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

/* La taxe foncière figure sur tous les immeubles : plutôt que d'obliger à la
   créer, sa ligne est toujours là, vide, et se remplit à la volée (#89). */
const LIGNE_TF = "Taxe Foncière";

/**
 * Le pictogramme de chaque nature de charge (retour #257).
 *
 * MAV : « trouve un picto qui correspond à chaque charge que tu as
 * pré-indiquée, car là c'est le même picto entre taxe foncière et eau ». Une
 * colonne où tout se ressemble ne se lit pas : on relit le libellé à chaque
 * ligne, et le picto ne sert plus à rien.
 */
const IC_CHARGE: Record<string, React.ReactNode> = {
  "Taxe Foncière": <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 10v10h12V10" /><path d="M12 12.5v5M10.3 13.6h3M10.3 16.2h3" /></>,
  "Taxe Bureau": <><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="M8 7.5h2.5M13.5 7.5H16M8 11h2.5M13.5 11H16M10 20v-4.5h4V20" /></>,
  "Cotisation Foncière des Entreprises": <><rect x="3" y="7.5" width="18" height="12" rx="2" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 12.5h18" /></>,
  CRL: <><path d="M6 3.5h8L18 8v12.5H6z" /><path d="M13.5 3.6V8H18M9 12h6M9 15.5h6M9 19h3.5" /></>,
  Poubelles: <><path d="M5 7h14M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /><path d="M10 10.5v6M14 10.5v6" /></>,
  Ménage: <><path d="M12 3v9" /><path d="M7.5 12h9l1.5 8.5h-12z" /><path d="M10 12v8.5M14 12v8.5" /></>,
  Internet: <><path d="M2.6 9.2a14 14 0 0 1 18.8 0M5.8 12.6a9.4 9.4 0 0 1 12.4 0M9 16a4.8 4.8 0 0 1 6 0" /><circle cx="12" cy="19.4" r="1.1" /></>,
  Gaz: <><path d="M12 3s5 4.6 5 9.4a5 5 0 0 1-10 0C7 9.6 9.5 7.6 12 3z" /><path d="M12 20a2.6 2.6 0 0 1-2.6-2.6c0-1.7 2.6-3.6 2.6-3.6s2.6 1.9 2.6 3.6A2.6 2.6 0 0 1 12 20z" /></>,
  Fuel: <><path d="M5 8.5h9V20H5z" /><path d="M5 8.5 8 5h9l-3 3.5" /><path d="M17 11h2.5v6a1.8 1.8 0 0 1-3.6 0V8" /></>,
  Entretien: <><path d="M14.5 3.6a4.6 4.6 0 0 0 5.6 6.1L21 9l-9.7 9.7a2.4 2.4 0 0 1-3.4-3.4L17.6 5.6z" /><circle cx="6.4" cy="17.6" r="1" /></>,
  Electricité: <><path d="M13.4 2.5 5 13.6h6L10.6 21.5 19 10.4h-6z" /></>,
  Eau: <><path d="M12 3.2c3.4 4 5.6 6.8 5.6 9.6a5.6 5.6 0 1 1-11.2 0c0-2.8 2.2-5.6 5.6-9.6z" /><path d="M9.4 13.6a2.6 2.6 0 0 0 2.6 2.6" /></>,
  Assurance: <><path d="M12 3.2 19.5 6v6.2c0 4.2-3 7.2-7.5 8.6-4.5-1.4-7.5-4.4-7.5-8.6V6z" /><path d="m8.8 12.2 2.3 2.3 4.1-4.6" /></>,
  Ascenseur: <><rect x="4.5" y="3.5" width="15" height="17" rx="1.5" /><path d="M12 3.5v17" /><path d="m8.2 10.5 1.6-2 1.6 2M8.2 13.5l1.6 2 1.6-2" /></>,
  Autre: <><circle cx="12" cy="12" r="9" /><path d="M8.6 12h.01M12 12h.01M15.4 12h.01" /></>,
};

const pictoCharge = (type: string) => IC_CHARGE[type] ?? IC_CHARGE.Autre;

/** Ligne de charge du BO : libellé, détail, montant non récupérable. */
function LigneCharge({
  type, titre, detail, montant, onOuvrir, onSupprimer,
}: {
  /** Nature, pour le pictogramme (retour #257). */
  type: string;
  titre: React.ReactNode; detail?: React.ReactNode; montant?: React.ReactNode;
  /** Ouvre la fenêtre de modification ; absent = ligne non modifiable. */
  onOuvrir?: () => void;
  /** Absent = ligne standard, non supprimable (cadenas). */
  onSupprimer?: () => void;
}) {
  return (
    <div className="chg">
      <span className="chg-ic"><svg viewBox="0 0 24 24">{pictoCharge(type)}</svg></span>
      <span className="chg-c">
        {/* Le titre ouvre la fenêtre (retour #257) : les montants se saisissent
            sur la ligne, tout le reste — nature, commentaire — s'y règle. */}
        {onOuvrir
          ? <button type="button" className="chg-t" onClick={onOuvrir} title="Modifier cette charge">{titre}</button>
          : <b>{titre}</b>}
        {detail && <i>{detail}</i>}
      </span>
      <span className="chg-v">{montant}</span>
      {onSupprimer ? (
        <button className="chg-x" type="button" title="Supprimer la charge" onClick={onSupprimer}>
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
        </button>
      ) : (
        <span className="chg-lock" title="Ligne permanente : elle ne se supprime pas">
          <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        </span>
      )}
    </div>
  );
}

/** Les deux montants d'une charge, saisis sur la ligne (retour #257). */
function SaisieMontants({
  total, recup, onTotal, onRecup,
}: {
  total: string; recup: string;
  onTotal: (v: string) => void; onRecup: (v: string) => void;
}) {
  return (
    <span className="chg-saisie">
      <input className={`min${total ? "" : " requis"}`} placeholder="Total" value={total}
        onChange={(e) => onTotal(e.target.value)} /> €/an
      <span className="tiret">−</span>
      <input className="min" placeholder="Récupérable" value={recup}
        onChange={(e) => onRecup(e.target.value)} /> €/an récupérables
    </span>
  );
}

/**
 * La fenêtre d'une charge — la même pour la créer et pour la modifier
 * (retour #257).
 *
 * MAV : « une fois qu'une charge est créée je veux qu'on puisse cliquer dessus
 * pour la modifier ou ajouter un commentaire — donc on retrouve la même modale
 * que la création, déjà remplie ». Deux fenêtres pour un même objet finissent
 * toujours par diverger ; c'est la même, elle sait juste si elle a un
 * antécédent.
 */
function ModaleCharge({ b, charge, onFermer }: {
  b: BienData;
  /** Absent = création. */
  charge?: Record<string, unknown>;
  onFermer: () => void;
}) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const [type, setType] = useState(S(charge?.Type_charge) || "Taxe Foncière");
  const [autre, setAutre] = useState(S(charge?.type_autre));
  const [totalAn, setTotalAn] = useState(S(num(charge?.total_an)));
  const [recup, setRecup] = useState(S(num(charge?.recup_an)));
  const [comment, setComment] = useState(S(charge?.commentaire));
  const t = parse(totalAn), r = parse(recup);
  const nonRecup = t !== undefined ? t - (r ?? 0) : undefined;

  const submit = () =>
    start(async () => {
      const montants = {
        total_an: totalAn.trim() === "" ? null : t,
        recup_an: recup.trim() === "" ? null : r,
        non_recup_an: nonRecup ?? null,
      };
      if (charge) {
        await updateCharge(immeubleId, String(charge._id), {
          Type_charge: type,
          type_autre: type === "Autre" ? (autre || null) : null,
          ...montants,
          commentaire: comment || null,
        });
      } else {
        await addCharge(immeubleId, {
          Type_charge: type,
          type_autre: type === "Autre" ? autre || undefined : undefined,
          total_an: t, recup_an: r, non_recup_an: nonRecup,
          commentaire: comment || undefined,
        });
      }
      onFermer();
    });

  return (
    <div className="modal-ov" onClick={onFermer}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          {charge ? "Modifier la charge" : "Nouvelle charge"}
          <button type="button" onClick={onFermer}>✕</button>
        </div>
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
          {/* Retour #256 : chaque case dit ce qu'elle attend, et porte son
              unité. « Total €/an » en gris dans la case disparaissait dès la
              première frappe — on ne savait plus laquelle était laquelle. */}
          <span className="mlab">Montants</span>
          <div className="chg-mnt">
            <label>
              <span>Montant total</span>
              <span className="u">
                <input value={totalAn} inputMode="decimal" onChange={(e) => setTotalAn(e.target.value)} />
                <i>€/an</i>
              </span>
            </label>
            <label>
              <span>Montant récupérable</span>
              <span className="u">
                <input value={recup} inputMode="decimal" onChange={(e) => setRecup(e.target.value)} />
                <i>€/an</i>
              </span>
            </label>
            {/* Une charge entièrement récupérable pèse zéro sur le vendeur :
                il faut l'écrire. `euros` ne rend rien en dessous de 1 €, d'où
                le « /an » orphelin d'avant (retour #256). */}
            {nonRecup !== undefined && (
              <span className="chg-nr">non récupérable<b>{euros(nonRecup) ?? "0 €"}/an</b></span>
            )}
          </div>
          <span className="mlab">Commentaire</span>
          <textarea className="min" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <div className="modal-f">
          <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined} onClick={submit}>
            <span className="ch">›</span> {charge ? "Enregistrer la charge" : "Créer la charge"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Une ligne de l'onglet Charges : sa nature, sa charge en base si elle existe. */
type LigneCharges = { cle: string; charge?: Record<string, unknown>; type: string };
type MontantsCharge = { total: string; recup: string };

/**
 * Une ligne de charge avec ses deux montants saisissables.
 *
 * Déclarée ICI, au niveau du module, et pas dans le corps de `ChargesTab` :
 * un composant défini pendant le rendu est une NOUVELLE fonction à chaque
 * rendu, donc React démonte et remonte l'ancien à chaque frappe. Vérifié au
 * navigateur avant de la sortir : taper « 1234 » laissait « 1 » dans la case
 * et le curseur nulle part.
 */
function LigneChargeSaisie({
  charge, type, valeur, onValeur, onOuvrir, onSupprimer,
}: {
  charge?: Record<string, unknown>; type: string;
  valeur: MontantsCharge; onValeur: (v: MontantsCharge) => void;
  onOuvrir?: () => void; onSupprimer?: () => void;
}) {
  const t = parse(valeur.total), r = parse(valeur.recup);
  const nr = t !== undefined ? t - (r ?? 0) : undefined;
  return (
    <LigneCharge
      type={type}
      titre={`${type}${charge?.type_autre ? ` — ${String(charge.type_autre)}` : ""}`}
      detail={
        <>
          <SaisieMontants
            total={valeur.total} recup={valeur.recup}
            onTotal={(x) => onValeur({ ...valeur, total: x })}
            onRecup={(x) => onValeur({ ...valeur, recup: x })}
          />
          {charge?.commentaire ? <span className="chg-com">{String(charge.commentaire)}</span> : null}
        </>
      }
      montant={nr !== undefined ? <>{euros(nr) ?? "0 €"}<i>/an</i></> : <span className="nc">n.c.</span>}
      onOuvrir={onOuvrir}
      onSupprimer={onSupprimer}
    />
  );
}

/**
 * L'onglet Charges.
 *
 * Les deux montants de chaque ligne se saisissent sur la ligne, comme la taxe
 * foncière (retour #257) — et l'onglet n'a qu'UNE barre d'enregistrement, qui
 * les envoie tous. Une barre par ligne se serait superposée aux autres au même
 * endroit de l'écran : c'est le défaut qui a coûté les retours #264 et #265
 * sur les composants.
 */
function ChargesTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const [ouverte, setOuverte] = useState<Record<string, unknown> | null>(null);
  const [creation, setCreation] = useState(false);

  const taxes = b.charges.filter((c) => TAXES.has(String(c.Type_charge ?? "")) && String(c.Type_charge ?? "") !== LIGNE_TF);
  const autres = b.charges.filter((c) => !TAXES.has(String(c.Type_charge ?? "")));
  const tf = b.charges.find((c) => String(c.Type_charge ?? "") === LIGNE_TF);

  /* La taxe foncière figure sur tous les immeubles : sa ligne est là même
     sans charge en base (#89), sous une clé qui dit qu'elle reste à créer. */
  const lignes = [
    { cle: tf ? String(tf._id) : "tf", charge: tf, type: LIGNE_TF },
    ...taxes.map((c) => ({ cle: String(c._id), charge: c, type: String(c.Type_charge ?? "") })),
    ...autres.map((c) => ({ cle: String(c._id), charge: c, type: String(c.Type_charge ?? "") })),
  ];

  type Montants = MontantsCharge;
  const depart = () =>
    Object.fromEntries(lignes.map(({ cle, charge }) => [
      cle, { total: S(num(charge?.total_an)), recup: S(num(charge?.recup_an)) } as Montants,
    ]));
  const [saisie, setSaisie] = useState<Record<string, Montants>>(depart);
  const maj = (cle: string, v: Montants) => setSaisie((m) => ({ ...m, [cle]: v }));

  const enBase = useRef("");
  const courant = JSON.stringify(saisie);
  if (!enBase.current) enBase.current = courant;
  const modifie = courant !== enBase.current;

  const enregistrer = () =>
    start(async () => {
      const avant = JSON.parse(enBase.current) as Record<string, Montants>;
      for (const { cle, charge, type } of lignes) {
        const v = saisie[cle];
        const a = avant[cle];
        if (!v || (a && a.total === v.total && a.recup === v.recup)) continue;
        const t = parse(v.total), r = parse(v.recup);
        const nr = t !== undefined ? t - (r ?? 0) : undefined;
        if (charge) {
          await updateCharge(immeubleId, String(charge._id), {
            total_an: v.total.trim() === "" ? null : t,
            recup_an: v.recup.trim() === "" ? null : r,
            non_recup_an: nr ?? null,
          });
        } else if (t !== undefined || r !== undefined) {
          await addCharge(immeubleId, { Type_charge: type, total_an: t, recup_an: r, non_recup_an: nr });
        }
      }
      enBase.current = JSON.stringify(saisie);
    });

  const annuler = () => setSaisie(JSON.parse(enBase.current) as Record<string, Montants>);

  const total = b.charges.reduce((s, c) => s + (num(c.total_an) ?? 0), 0);
  const nonRecup = b.charges.reduce((s, c) => s + (num(c.non_recup_an) ?? 0), 0);

  const rendreLigne = ({ cle, charge, type }: LigneCharges) => (
    <LigneChargeSaisie
      key={cle} charge={charge} type={type}
      valeur={saisie[cle] ?? { total: "", recup: "" }}
      onValeur={(v) => maj(cle, v)}
      onOuvrir={charge ? () => setOuverte(charge) : undefined}
      onSupprimer={charge && type !== LIGNE_TF ? () => {
        if (!confirm("Supprimer cette charge ? (récupérable dans la corbeille)")) return;
        start(() => deleteCharge(immeubleId, String(charge._id)));
      } : undefined}
    />
  );

  return (
    <div style={pending ? { opacity: 0.6 } : undefined}>
      <div className="blor">
        <div className="blor-t">
          <svg viewBox="0 0 24 24"><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19M6 14.5h4" /></svg>
          Charges
        </div>
        <div className="blor-chips">
          <span className={`fchip${total ? "" : " off"}`}>
            <b>{euros(b.im.fin_charges_total) ?? euros(total) ?? "0 €"}</b> /an
          </span>
          <span className={`fchip${nonRecup ? "" : " off"}`}>
            dont <b>{euros(b.im.fin_charges_non_recup) ?? euros(nonRecup) ?? "0 €"}</b> non récupérables
          </span>
        </div>
      </div>
      <div className="blor-add">
        <button className="fadd" type="button" onClick={() => setCreation(true)}>+ Ajouter une charge</button>
      </div>

      <div className="fsub">Taxes et impôts</div>
      {lignes.filter((l) => TAXES.has(l.type)).map(rendreLigne)}

      <div className="fsub" style={{ marginTop: 16 }}>Charges</div>
      {autres.length === 0
        ? <div className="fempty">Aucune charge saisie.</div>
        : lignes.filter((l) => !TAXES.has(l.type)).map(rendreLigne)}

      <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={enregistrer} onAnnuler={annuler} />

      {creation && <ModaleCharge b={b} onFermer={() => setCreation(false)} />}
      {ouverte && <ModaleCharge b={b} charge={ouverte} onFermer={() => setOuverte(null)} />}
    </div>
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
