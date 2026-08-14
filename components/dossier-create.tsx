"use client";

// Modale « Nouveau dossier » — stepper Immeuble → Prix → PDF (réplique BO).
// Chaque génération crée une version (V1, V2…) figée dans bo_dossier.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { BienData } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import { createDossier } from "@/lib/bo/actions";

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function AddDossierButton({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [createdId, setCreatedId] = useState<string | null>(null);

  const agg = useMemo(() => {
    const lots = b.lots;
    const surface = lots.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
    const occ = lots.filter((l) => (num(l.loyer) ?? 0) > 0).length;
    const loyersAn = lots.reduce((s, l) => s + (num(l.loyer) ?? 0), 0) * 12;
    const loyersMaxAn = lots.reduce((s, l) => s + (num(l.loyer_max) ?? num(l.loyer) ?? 0), 0) * 12;
    const dests = [...new Set(lots.map((l) => String(l.Destination ?? "")).filter(Boolean))];
    const main = dests
      .map((d) => ({ d, n: lots.filter((l) => l.Destination === d).length }))
      .sort((a, c) => c.n - a.n)[0]?.d;
    return {
      surface,
      occupation: lots.length ? Math.round((occ / lots.length) * 100) : 0,
      loyersAn, loyersMaxAn, dests, main,
      travaux: num(b.im.fin_travaux) ?? 0,
    };
  }, [b]);

  const prochaine = b.dossiers.reduce((m, d) => Math.max(m, Number(d.version ?? 0)), 0) + 1;
  /* Une fois le dossier créé, la fiche se recharge et « prochaine » avance
     d'un cran : on fige le numéro attribué pour que l'écran de confirmation
     annonce la version réellement enregistrée, pas la suivante. */
  const [attribuee, setAttribuee] = useState<number | null>(null);
  const version = attribuee ?? prochaine;
  const [hai, setHai] = useState(S(num(b.im.prix_hai)));
  const [pct, setPct] = useState("5");
  const [pub, setPub] = useState(false);
  const vHai = parse(hai) ?? 0;
  const vPct = parse(pct) ?? 5;
  const nv = vHai > 0 ? Math.round(vHai / (1 + vPct / 100)) : 0;

  const generer = () =>
    start(async () => {
      const id = await createDossier(immeubleId, String(b.im.AGENT ?? ""), {
        version: prochaine,
        prix_hai: vHai,
        honos_pct: vPct,
        isPublic: pub,
        snapshot: {
          surface: agg.surface, occupation: agg.occupation,
          loyer_hc_an: agg.loyersAn, loyer_hc_an_max: agg.loyersMaxAn,
          travaux: agg.travaux,
          ville: S(b.im.adresse_ville) || undefined,
          zipcode: S(b.im.adresse_zipcode) || undefined,
          destination_principale: agg.main,
          destinations: agg.dests,
        },
      });
      setAttribuee(prochaine);
      setCreatedId(id);
      setStep(2);
    });

  const close = () => { setOpen(false); setStep(0); setCreatedId(null); };

  return (
    <>
      <button className="fbtn" type="button" style={{ margin: "0 auto 14px", display: "flex" }}
        onClick={() => { setAttribuee(null); setCreatedId(null); setStep(0); setOpen(true); }}>
        + Nouveau dossier
      </button>
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouveau dossier — V{version}<button type="button" onClick={close}>✕</button></div>
            <div className="modal-b">
              <div className="wsteps" style={{ marginBottom: 12 }}>
                {["Immeuble", "Prix", "PDF"].map((s, i) => (
                  <span key={s} className={`wstep${i === step ? " on" : ""}${i < step ? " done" : ""}`} style={{ cursor: "default" }}>
                    <span className="n">{i + 1}</span>{s}
                  </span>
                ))}
              </div>

              {step === 0 && (
                <>
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                    <b>{b.lots.length}</b> lots · <b>{Math.round(agg.surface)} m²</b> · occupation <b>{agg.occupation} %</b><br />
                    Loyers <b>{euros(agg.loyersAn)}/an</b> (potentiel {euros(agg.loyersMaxAn)}/an) · travaux <b>{euros(agg.travaux) ?? "0 €"}</b>
                  </div>
                  <div className="warnbox">Pensez à relire l&apos;état locatif et l&apos;état technique avant de générer le dossier.</div>
                </>
              )}

              {step === 1 && (
                <>
                  <span className="mlab">Prix HAI</span>
                  <input className="min" style={{ width: 130 }} value={hai} onChange={(e) => setHai(e.target.value)} />
                  <span className="mlab">Honoraires %</span>
                  <input className="min" style={{ width: 70 }} value={pct} onChange={(e) => setPct(e.target.value)} />
                  {vHai > 0 && (
                    <div style={{ fontSize: 13, marginTop: 8 }}>
                      Net vendeur <b>{euros(nv)}</b> + honoraires <b>{euros(vHai - nv)}</b> = <b>{euros(vHai)} HAI</b><br />
                      Rendement brut <b>{agg.loyersAn > 0 ? `${((agg.loyersAn / vHai) * 100).toFixed(1).replace(".", ",")} %` : "—"}</b>
                      {" · "}potentiel <b>{agg.loyersMaxAn > 0 ? `${((agg.loyersMaxAn / (vHai + agg.travaux)) * 100).toFixed(1).replace(".", ",")} %` : "—"}</b>
                    </div>
                  )}
                  <div className="mrow" style={{ marginTop: 10 }}>
                    <button type="button" className={`mopt${!pub ? " on" : ""}`} onClick={() => setPub(false)}>Privé</button>
                    <button type="button" className={`mopt${pub ? " on" : ""}`} onClick={() => setPub(true)}>Public</button>
                  </div>
                </>
              )}

              {step === 2 && createdId && (
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  Dossier <b>V{version}</b> généré ✓<br />
                  <Link className="lnk" href={`/bien/${immeubleId}/dossier/${createdId}/imprimer`} target="_blank">
                    Ouvrir la version imprimable (PDF)
                  </Link>
                </div>
              )}
            </div>
            <div className="modal-f">
              {step === 1 && <button className="kgo" type="button" onClick={() => setStep(0)}>‹ Précédent</button>}
              <span style={{ flex: 1 }} />
              {step === 0 && <button className="kgo" type="button" onClick={() => setStep(1)}><span className="ch">›</span> Suivant</button>}
              {step === 1 && (
                <button className="kgo" type="button" disabled={pending || vHai <= 0} style={pending || vHai <= 0 ? { opacity: 0.5 } : undefined} onClick={generer}>
                  <span className="ch">+</span> Générer le dossier PDF
                </button>
              )}
              {step === 2 && <button className="kgo" type="button" onClick={close}>Fermer</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
