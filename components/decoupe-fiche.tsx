"use client";

// La découpe vue depuis la fiche immeuble.
//
// Règle d'architecture actée : la fiche reste UNIQUE. Elle ne se dédouble pas
// selon le mode — elle gagne une section, et seulement si une opération est
// ouverte sur cet immeuble. Propriétaire, emplacement, état locatif, photos :
// tout reste partagé et saisi une seule fois.
import Link from "next/link";
import { useState, useTransition } from "react";
import type { OperationDecoupe } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import { PHASES, STATUTS_OPERATION, avancement, phase } from "@/lib/decoupe";
import { cloturerOperation, majOperation, ouvrirOperation } from "@/lib/bo/actions";

/** Bouton d'ouverture, quand l'immeuble n'est pas encore en découpe. */
export function PasserEnDecoupe({ immeubleId, valeurBloc }: { immeubleId: string; valeurBloc?: number }) {
  const [confirme, setConfirme] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="fadd" onClick={() => setConfirme(true)}>Passer en découpe</button>
      {confirme && (
        <div className="modal-ov">
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Passer en découpe<button type="button" onClick={() => setConfirme(false)}>✕</button></div>
            <div className="modal-b">
              <p style={{ fontSize: 13, margin: "0 0 10px" }}>
                Une opération de découpe sera ouverte sur cet immeuble, en phase 1 (Urbanisme).
              </p>
              <div className="warnbox" style={{ marginTop: 0 }}>
                L&apos;immeuble ne bouge pas : ni son statut de vente, ni ses lots, ni ses photos.
                La fiche gagne simplement une section « Découpe ». Vous pourrez continuer à le
                suivre en vente en bloc en parallèle — c&apos;est même ce qui permet de comparer
                les deux valeurs.
              </div>
            </div>
            <div className="modal-f">
              <button type="button" className="fadd" onClick={() => setConfirme(false)}>Annuler</button>
              <button
                type="button" className="savebar-go" disabled={pending}
                onClick={() => start(async () => { await ouvrirOperation(immeubleId, valeurBloc); setConfirme(false); })}
              >
                {pending ? "Ouverture…" : "Ouvrir l'opération"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** La section « Découpe » du contenu de la fiche. */
export function SectionDecoupe({ o, immeubleId }: { o: OperationDecoupe; immeubleId: string }) {
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(o.notes ?? "");
  const [bloc, setBloc] = useState(o.valeurBloc ? String(o.valeurBloc) : "");
  const [dec, setDec] = useState(o.valeurDecoupe ? String(o.valeurDecoupe) : "");
  const p = phase(o.phase);
  const nb = (s: string) => {
    const v = parseFloat(s.replace(/[^\d.,-]/g, "").replace(",", "."));
    return Number.isFinite(v) ? v : undefined;
  };
  const modifie =
    notes !== (o.notes ?? "") ||
    nb(bloc) !== o.valeurBloc ||
    nb(dec) !== o.valeurDecoupe;
  const ecart =
    nb(bloc) && nb(dec) ? Math.round(((nb(dec)! - nb(bloc)!) / nb(bloc)!) * 100) : undefined;

  return (
    <>
      <div className="fsub">Opération de découpe</div>

      <div className="dec-fiche-h">
        <span className="st">{o.statut}</span>
        <span className="ph">Phase {p.n}/{PHASES.length} · {p.label}</span>
        <span className="jauge"><i style={{ width: `${avancement(o.phase)}%` }} /></span>
      </div>
      <div className="dec-fiche-d">{p.detail}</div>

      <div className="fsub">Où en est l&apos;opération</div>
      <div className="dec-phs">
        {PHASES.map((x) => (
          <button
            key={x.n} type="button" disabled={pending} title={x.detail}
            className={`ph${x.n === p.n ? " on" : ""}${x.n < p.n ? " faite" : ""}`}
            onClick={() => start(() => majOperation(immeubleId, o.id, { phase: x.n }))}
          >
            <b>{x.n}</b> {x.label}
          </button>
        ))}
      </div>

      <div className="fsub">Statut</div>
      <div className="dec-phs">
        {STATUTS_OPERATION.map((s) => (
          <button
            key={s} type="button" disabled={pending}
            className={`ph${o.statut === s ? " on" : ""}`}
            onClick={() => start(() => majOperation(immeubleId, o.id, { statut: s }))}
          >{s}</button>
        ))}
      </div>

      <div className="fsub">Bloc contre découpe</div>
      <div className="dec-vals">
        <label><span>Valeur en bloc</span>
          <span className="u"><input inputMode="decimal" value={bloc} onChange={(e) => setBloc(e.target.value)} /><i>€</i></span>
        </label>
        <label><span>Valeur en découpe</span>
          <span className="u"><input inputMode="decimal" value={dec} onChange={(e) => setDec(e.target.value)} /><i>€</i></span>
        </label>
        <div className="ec">
          <span>Écart</span>
          <b className={ecart !== undefined ? (ecart > 0 ? "vert" : "rouge") : undefined}>
            {ecart !== undefined ? `${ecart > 0 ? "+" : ""}${ecart} %` : "—"}
          </b>
          {ecart !== undefined && <i>{euros(nb(dec)! - nb(bloc)!)}</i>}
        </div>
      </div>

      <div className="fsub">Notes internes</div>
      <textarea className="min" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="mrow" style={{ marginTop: 12, alignItems: "center" }}>
        <Link className="fadd" href="/decoupe">Voir le dashboard découpe</Link>
        <span style={{ flex: 1 }} />
        <button
          type="button" className="fadd"
          onClick={() => {
            if (!confirm("Clôturer l'opération de découpe ? La ligne reste dans l'historique.")) return;
            start(() => cloturerOperation(immeubleId, o.id));
          }}
        >Clôturer</button>
        {modifie && (
          <button
            type="button" className="savebar-go" disabled={pending}
            onClick={() => start(() => majOperation(immeubleId, o.id, {
              notes, valeur_bloc: nb(bloc), valeur_decoupe: nb(dec),
            }))}
          >{pending ? "Enregistrement…" : "Enregistrer"}</button>
        )}
      </div>
    </>
  );
}
