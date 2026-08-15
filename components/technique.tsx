"use client";

// État technique — sous-onglets Composants · Travaux (réplique BO).
// Composants = cartes type/matériau/état ; travaux rattachés à des lots
// OU à des composants du bâti, groupés par urgence.
import { useRef, useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { Picto } from "@/components/pictos";
import { euros } from "@/lib/format";
import {
  addComposant, addTravaux, deleteComposant, deleteTravaux, updateComposant, updateTechnique, updateTravaux,
} from "@/lib/bo/actions";
import { BarreEnregistrer } from "@/components/barre-enregistrer";

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

/* ---------- Composants ---------- */

/* Tous les immeubles ont une façade, une toiture, des fenêtres et un mode de
   chauffage : ces quatre-là sont toujours affichés, prêts à remplir, sans
   qu'il faille les créer (#91). Ils n'entrent en base qu'une fois renseignés. */
const COMPOSANTS_STANDARD = ["Chauffage", "Façade", "Fenêtres", "Toiture"] as const;

/** Vignette « Année de construction » / « État général », rouge tant que vide. */
function VignetteBati({
  icone, libelle, enfants, vide,
}: {
  icone: React.ReactNode; libelle: string; enfants: React.ReactNode; vide: boolean;
}) {
  return (
    <div className={`vbat${vide ? " requis" : ""}`}>
      <span className="vbat-ic"><svg viewBox="0 0 24 24">{icone}</svg></span>
      <span className="vbat-c">
        <b>{libelle}</b>
        {enfants}
      </span>
    </div>
  );
}

/** Une ligne de composant : matériau et état saisis sur place. */
function LigneComposant({
  b, type, composant,
}: {
  b: BienData; type: string; composant?: Record<string, unknown>;
}) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const [materiau, setMateriau] = useState(S(composant?.["Type_matériau"]));
  const [etat, setEtat] = useState(S(composant?.Etat));

  const enBase = useRef("");
  const courant = JSON.stringify({ materiau, etat });
  if (!enBase.current) enBase.current = courant;
  const modifie = courant !== enBase.current;

  const tvx = b.travaux
    .filter((t) => composant && Array.isArray(t.COMPOSANTs) && (t.COMPOSANTs as string[]).includes(String(composant._id)))
    .reduce((s, t) => s + (num(t.montant) ?? 0), 0);

  const enregistrer = () =>
    start(async () => {
      const patch = { Type_materiau: materiau || undefined, Etat: etat || undefined };
      if (composant) await updateComposant(immeubleId, String(composant._id), patch);
      else await addComposant(immeubleId, { Type_composant: type, ...patch });
      enBase.current = courant;
    });

  const choix = MATERIAUX[type] ?? [];
  const standard = (COMPOSANTS_STANDARD as readonly string[]).includes(type);

  return (
    <>
      <div className="cmp">
        <span className="cmp-ic"><svg viewBox="0 0 24 24"><path d="M12 2.6 21 7v10l-9 4.4L3 17V7z" /><path d="m3 7 9 4.4L21 7M12 11.4V21.4" /></svg></span>
        <span className="cmp-c">
          <b>
            {type}
            <span className="tiret">—</span>
            <select className={`min${materiau ? "" : " requis"}`} value={materiau} onChange={(e) => setMateriau(e.target.value)}>
              <option value="">Matériau à préciser</option>
              {[...new Set([materiau, ...choix, "Autre"])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
            </select>
          </b>
          <span className={`cmp-tvx${tvx > 0 ? " on" : ""}`}>
            <svg viewBox="0 0 24 24"><path d="M13 3 4 12l3.5 3.5L14 9M11 12l6 6M14 15l4 4" /></svg>
            {tvx > 0 ? `${euros(tvx)} de travaux` : "Pas de travaux"}
          </span>
        </span>
        <select className={`min etat${etat ? "" : " requis"}`} value={etat} onChange={(e) => setEtat(e.target.value)}>
          <option value="">Etat à préciser</option>
          {[...new Set([etat, ...ETATS_COMPOSANT])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
        </select>
        {standard ? (
          <span className="chg-lock" title="Composant permanent : il se remplit, il ne se supprime pas">
            <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </span>
        ) : (
          <button
            className="chg-x" type="button" title="Supprimer le composant"
            onClick={() => {
              if (!composant) return;
              if (!confirm("Supprimer ce composant ? (récupérable dans la corbeille)")) return;
              start(() => deleteComposant(immeubleId, String(composant._id)));
            }}
          >
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
          </button>
        )}
      </div>
      <BarreEnregistrer modifie={modifie} pending={pending} onEnregistrer={enregistrer} />
    </>
  );
}

function ComposantsTab({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [pending, start] = useTransition();
  const [annee, setAnnee] = useState(S(num(b.im.year_constru)));
  const [etat, setEtat] = useState(S(b.im.Etat));

  const enBase = useRef("");
  const courant = JSON.stringify({ annee, etat });
  if (!enBase.current) enBase.current = courant;
  const modifie = courant !== enBase.current;

  const parType = (t: string) => b.composants.find((c) => String(c.Type_composant ?? "") === t);
  const enPlus = b.composants.filter(
    (c) => !(COMPOSANTS_STANDARD as readonly string[]).includes(String(c.Type_composant ?? "")),
  );

  return (
    <div style={pending ? { opacity: 0.6 } : undefined}>
      <div className="blor">
        <div className="blor-t">
          <svg viewBox="0 0 24 24"><path d="M12 2.6 21 7v10l-9 4.4L3 17V7z" /><path d="m3 7 9 4.4L21 7M12 11.4V21.4" /></svg>
          Composants
        </div>
      </div>
      <div className="blor-add"><AddComposantButton b={b} /></div>

      <div className="vbat-row">
        <VignetteBati
          icone={<><path d="M4 20h16M6 20v-9l6-4 6 4v9" /><path d="M9 20v-5h6v5M8 6.5V4M12 5V3M16 6.5V4" /></>}
          libelle="Année de construction" vide={!annee}
          enfants={<input className={`min${annee ? "" : " requis"}`} value={annee} onChange={(e) => setAnnee(e.target.value)} />}
        />
        <VignetteBati
          icone={<><path d="M3 12h4l2-5 3 10 2.5-7 1.5 2h5" /></>}
          libelle="Etat général" vide={!etat}
          enfants={
            <select className={`min${etat ? "" : " requis"}`} value={etat} onChange={(e) => setEtat(e.target.value)}>
              <option value="" />{[...new Set([etat, ...ETATS_GENERAL])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}
            </select>
          }
        />
      </div>
      <BarreEnregistrer
        modifie={modifie} pending={pending}
        onEnregistrer={() =>
          start(async () => {
            await updateTechnique(immeubleId, { year_constru: parse(annee), Etat: etat || undefined });
            enBase.current = courant;
          })
        }
      />

      {COMPOSANTS_STANDARD.map((t) => (
        <LigneComposant key={t} b={b} type={t} composant={parType(t)} />
      ))}
      {enPlus.map((c) => (
        <LigneComposant key={String(c._id)} b={b} type={S(c.Type_composant)} composant={c} />
      ))}
    </div>
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
        <div className="modal-ov">
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
              <LigneTravaux key={String(t._id)} t={t} immeubleId={immeubleId} objet={objet(t)}
                onDelete={() => {
                  if (!confirm("Supprimer ces travaux ? (récupérable dans la corbeille)")) return;
                  start(() => deleteTravaux(immeubleId, String(t._id)));
                }} />
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
              <LigneTravaux key={String(t._id)} t={t} immeubleId={immeubleId} objet={objet(t)}
                onDelete={() => {
                  if (!confirm("Supprimer ces travaux ?")) return;
                  start(() => deleteTravaux(immeubleId, String(t._id)));
                }} />
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
        <div className="modal-ov">
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

/** Ligne de travaux éditable : description et montant se corrigent sur
 *  place, et le tableau des lots reflète le nouveau montant (retour #61). */
function LigneTravaux({
  t, immeubleId, objet, onDelete,
}: {
  t: Record<string, unknown>;
  immeubleId: string;
  objet: string;
  onDelete: () => void;
}) {
  const id = String(t._id);
  const [desc, setDesc] = useState(S(t.description));
  const [montant, setMontant] = useState(typeof t.montant === "number" ? String(t.montant) : "");
  const [pending, start] = useTransition();

  const sauver = () => {
    const v = parseFloat(montant.replace(/[^\d.,]/g, "").replace(",", "."));
    const patch: Record<string, unknown> = {};
    if (desc !== S(t.description)) patch.description = desc;
    if (Number.isFinite(v) && v !== t.montant) patch.montant = v;
    if (Object.keys(patch).length > 0) start(() => updateTravaux(immeubleId, id, patch));
  };

  return (
    <div className="chrow" style={pending ? { opacity: 0.6 } : undefined}>
      <span className="t">{objet || "Travaux"}</span>
      <input className="min" style={{ flex: 1, minWidth: 120 }} placeholder="Description…"
        value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={sauver}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      {t.YN_devis === true && <span className="badge-o">Devis</span>}
      <span className="v" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        <input className="min" style={{ width: 84, textAlign: "right" }} placeholder="n.c."
          value={montant} onChange={(e) => setMontant(e.target.value)} onBlur={sauver}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        €
      </span>
      <button className="xdel" type="button" title="Supprimer" onClick={onDelete}>✕</button>
    </div>
  );
}

export const ONGLETS_TECHNIQUE = [
  { key: "composants", label: "Composants" },
  { key: "travaux", label: "Travaux" },
] as const;

export function TechniqueTabs({ b, tab: pilote, onTab }: {
  b: BienData;
  /** Onglet piloté depuis le rail (retour #12) ; sinon état interne. */
  tab?: string;
  onTab?: (t: string) => void;
}) {
  const [interne, setInterne] = useState("composants");
  const tab = pilote ?? interne;
  const setTab = (t: string) => { setInterne(t); onTab?.(t); };
  return (
    <>
      <div className="ftabs">
        <button type="button" className={`ftab${tab === "composants" ? " on" : ""}`} onClick={() => setTab("composants")}>
          <Picto nom="composants" className="ftab-ic" />Composants{b.composants.length > 0 && <span className="n">{b.composants.length}</span>}
        </button>
        <button type="button" className={`ftab${tab === "travaux" ? " on" : ""}`} onClick={() => setTab("travaux")}>
          <Picto nom="travaux" className="ftab-ic" />Travaux{b.travaux.length > 0 && <span className="n">{b.travaux.length}</span>}
        </button>
      </div>
      {tab === "composants" && <ComposantsTab b={b} />}
      {tab === "travaux" && <TravauxTab b={b} />}
    </>
  );
}
