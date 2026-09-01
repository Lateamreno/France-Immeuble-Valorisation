"use client";

// Modale « Nouveau dossier » — stepper Immeuble → Prix → PDF (réplique BO).
// Chaque génération crée une version (V1, V2…) figée dans bo_dossier.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { BienData } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import { apercuPdfDossier, createDossier, genererPdfDossier } from "@/lib/bo/actions";
import { bloquants, manquesDossier } from "@/lib/bo/completude";

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function AddDossierButton({ b }: { b: BienData }) {
  const immeubleId = String(b.im._id);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [voirHisto, setVoirHisto] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; ko: number } | null>(null);
  const [errPdf, setErrPdf] = useState<string | null>(null);
  /* L'historique des prix de l'immeuble, le plus récent en tête. */
  const histo: Record<string, unknown>[] = b.prixHisto ?? [];
  const [pending, start] = useTransition();
  const [createdId, setCreatedId] = useState<string | null>(null);
  /** L'aperçu a été fabriqué : c'est ce qui ouvre l'enregistrement (#219). */
  const [vu, setVu] = useState(false);

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
  const vHai = parse(hai) ?? 0;
  const vPct = parse(pct) ?? 5;
  const nv = vHai > 0 ? Math.round(vHai / (1 + vPct / 100)) : 0;

  /* Retour #219 — « j'aimerais que, quand on génère un nouveau dossier, il
     soit demandé de le télécharger pour le vérifier avant de l'enregistrer.
     C'est seulement quand on l'enregistre que la dernière version du dossier
     est réellement créée. Sinon, dès qu'on modifie quoi que ce soit, on a une
     infinité de dossiers déjà générés. »

     Deux temps, donc : l'aperçu ne crée rien, l'enregistrement crée tout. Un
     brouillon relu trois fois ne laisse plus trois versions derrière lui. */
  const apercu = () =>
    start(async () => {
      setErrPdf(null);
      const r = await apercuPdfDossier(immeubleId, { hai: vHai, pct: vPct, version: prochaine });
      setPdf(r.ok ? { url: r.url, ko: r.ko } : null);
      setVu(r.ok);
      if (!r.ok) setErrPdf(r.message);
    });

  const generer = () =>
    start(async () => {
      const id = await createDossier(immeubleId, String(b.im.AGENT ?? ""), {
        version: prochaine,
        prix_hai: vHai,
        honos_pct: vPct,
        isPublic: false,
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
      /* #184 — « il faut que ça génère directement le PDF ». On l'enchaîne :
         l'agent n'a plus qu'à l'ouvrir ou à le joindre. */
      const r = await genererPdfDossier(immeubleId, id);
      setPdf(r.ok ? { url: r.url, ko: r.ko } : null);
      if (!r.ok) setErrPdf(r.message);
    });

  const close = () => {
    setOpen(false); setStep(0); setCreatedId(null); setPdf(null); setErrPdf(null); setVu(false);
  };
  /** Toute retouche du prix périme l'aperçu : il ne montre plus ce qu'on a. */
  const retoucher = (fn: () => void) => { fn(); setVu(false); setPdf(null); };

  /* Retour #204 — « ne laisse pas l'agent générer le dossier tant que toutes
     les informations contenues dans le dossier ne sont pas remplies […] voilà,
     empêche d'envoyer s'il n'y a pas toutes les infos ». Le bouton se ferme
     donc tant qu'il reste un manque bloquant, et il dit lequel : un bouton
     grisé sans motif est une impasse. La liste juste au-dessus porte les
     champs et les liens pour les combler. */
  const manquants = bloquants(manquesDossier({
    im: b.im, lots: b.lots, parcelles: b.parcelles, photos: b.photos,
    secteur: b.secteur, estimations: b.estimations,
    charges: b.charges, composants: b.composants, proprietaire: b.proprietaire,
  }));

  return (
    <>
      <button
        className="fbtn" type="button" style={{ margin: "0 auto 14px", display: "flex" }}
        disabled={manquants.length > 0}
        title={manquants.length > 0
          ? `Il manque ${manquants.length} information${manquants.length > 1 ? "s" : ""} : ${manquants.map((x) => x.titre).join(" · ")}`
          : undefined}
        onClick={() => { setAttribuee(null); setCreatedId(null); setStep(0); setOpen(true); }}>
        + Nouveau dossier
      </button>
      {/* Un bouton grisé sans motif est une impasse : on dit ce qui manque, et
          les lignes rouges juste au-dessus portent de quoi le combler. */}
      {manquants.length > 0 && (
        <p className="dos-bloque">
          Le dossier ne peut pas être généré tant que ces points ne sont pas réglés —
          voyez les lignes en rouge ci-dessus : <b>{manquants.map((x) => x.titre).join(" · ")}</b>
        </p>
      )}
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouveau dossier — V{version}<button type="button" onClick={close}>✕</button></div>
            <div className="modal-b">
              {/* #182 — « tu peux reprendre la modale en une seule page ». Le
                  stepper Immeuble → Prix → PDF faisait trois écrans pour deux
                  chiffres : tout tient sur une page, les données de l'immeuble
                  en chips, le prix en dessous. */}
              {!createdId ? (
                <>
                  <div className="dos-chips">
                    <span className="fchip">{b.lots.length} lots</span>
                    <span className="fchip">{Math.round(agg.surface)} m²</span>
                    <span className="fchip">Occupation {agg.occupation} %</span>
                    <span className="fchip">{euros(agg.loyersAn)}/an</span>
                    <span className="fchip">Potentiel {euros(agg.loyersMaxAn)}/an</span>
                    <span className="fchip">Travaux {euros(agg.travaux) ?? "0 €"}</span>
                    {agg.dests.map((d) => <span key={d} className="fchip">{d}</span>)}
                  </div>

                  <div className="mrow" style={{ alignItems: "flex-end", gap: 14, marginTop: 12 }}>
                    <label className="dmq-c">
                      <span>Prix HAI</span>
                      <input value={hai} onChange={(e) => retoucher(() => setHai(e.target.value))} />
                    </label>
                    <label className="dmq-c">
                      <span>Honoraires %</span>
                      <input style={{ minWidth: 80 }} value={pct}
                        onChange={(e) => retoucher(() => setPct(e.target.value))} />
                    </label>
                  </div>
                  {vHai > 0 && (
                    <div style={{ fontSize: 13, marginTop: 8 }}>
                      Net vendeur <b>{euros(nv)}</b> + honoraires <b>{euros(vHai - nv)}</b> = <b>{euros(vHai)} HAI</b><br />
                      Rendement brut <b>{agg.loyersAn > 0 ? `${((agg.loyersAn / vHai) * 100).toFixed(1).replace(".", ",")} %` : "—"}</b>
                      {" · "}potentiel <b>{agg.loyersMaxAn > 0 ? `${((agg.loyersMaxAn / (vHai + agg.travaux)) * 100).toFixed(1).replace(".", ",")} %` : "—"}</b>
                    </div>
                  )}

                  {/* L'historique des prix, déroulable : chaque ligne se
                      reprend d'un clic — c'est le geste le plus fréquent,
                      « on remet le prix du mandat ». */}
                  {histo.length > 0 && (
                    <>
                      <button type="button" className="hest-plus" style={{ marginTop: 12 }}
                        onClick={() => setVoirHisto(!voirHisto)}>
                        {voirHisto ? "Masquer l'historique des prix" : `Historique des prix (${histo.length})`}
                      </button>
                      {voirHisto && (
                        <div className="dos-histo">
                          {histo.map((p) => (
                            <button
                              key={S(p._id)} type="button" className="dos-histo-l"
                              title="Reprendre ce prix"
                              onClick={() => {
                                setHai(S(num(p.in_prix_hai)));
                                const t = num(p["out_honos_taux_%"]);
                                if (t) setPct(String(Math.round(t * 10) / 10));
                              }}
                            >
                              <b>{euros(num(p.in_prix_hai)) ?? "—"}</b>
                              <span>
                                {S(p.in_Motif) || "Prix"}
                                {p["Created Date"] ? ` · ${new Date(S(p["Created Date"])).toLocaleDateString("fr-FR")}` : ""}
                                {num(p.out_prix_m2) ? ` · ${Math.round(num(p.out_prix_m2)!)} €/m²` : ""}
                                {num(p.out_rba) ? ` · ${num(p.out_rba)!.toFixed(1).replace(".", ",")} %` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* L'aperçu (#219) : on le relit, puis on enregistre. Tant
                      qu'on n'a pas enregistré, aucune version n'existe. */}
                  {pdf && vu ? (
                    <div className="dos-apercu">
                      <b>Aperçu prêt — relisez-le avant d&apos;enregistrer.</b>
                      <a className="lnk" href={pdf.url} target="_blank" rel="noreferrer">
                        Ouvrir le PDF ({pdf.ko} ko)
                      </a>
                      <Link className="lnk" target="_blank"
                        href={`/bien/${immeubleId}/dossier/apercu?hai=${vHai}&pct=${vPct}&v=${prochaine}`}>
                        Ouvrir la version imprimable
                      </Link>
                      <span className="fine">
                        Rien n&apos;est enregistré pour l&apos;instant : la version V{prochaine} ne
                        sera créée qu&apos;au moment où vous l&apos;enregistrerez.
                      </span>
                    </div>
                  ) : errPdf ? (
                    <div className="warnbox" style={{ marginTop: 12, color: "var(--red)", borderColor: "var(--red)" }}>
                      Aperçu impossible : {errPdf}
                    </div>
                  ) : (
                    <div className="warnbox" style={{ marginTop: 12 }}>
                      Pensez à relire l&apos;état locatif et l&apos;état technique avant de générer le dossier.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  Dossier <b>V{version}</b> généré ✓<br />
                  {pdf ? (
                    <a className="lnk" href={pdf.url} target="_blank" rel="noreferrer">
                      Ouvrir le PDF ({pdf.ko} ko)
                    </a>
                  ) : errPdf ? (
                    <span style={{ color: "var(--red)" }}>PDF impossible : {errPdf}</span>
                  ) : (
                    <span style={{ color: "var(--gray-lt)" }}>Fabrication du PDF…</span>
                  )}
                  <br />
                  <Link className="lnk" href={`/bien/${immeubleId}/dossier/${createdId}/imprimer`} target="_blank">
                    Ouvrir la version imprimable
                  </Link>
                </div>
              )}
            </div>
            <div className="modal-f">
              <span style={{ flex: 1 }} />
              {!createdId ? (
                <>
                  <button className="fadd" type="button" disabled={pending || vHai <= 0}
                    style={{ marginRight: 8 }} onClick={apercu}>
                    {pending && !vu ? "Fabrication…" : vu ? "Refaire l'aperçu" : "Voir l'aperçu"}
                  </button>
                  <button className="kgo" type="button" disabled={pending || vHai <= 0 || !vu}
                    style={pending || vHai <= 0 || !vu ? { opacity: 0.5 } : undefined}
                    title={vu ? undefined : "Fabriquez d'abord l'aperçu et relisez-le."}
                    onClick={generer}>
                    <span className="ch">+</span> Enregistrer la version V{prochaine}
                  </button>
                </>
              ) : (
                <button className="kgo" type="button" onClick={close}>Fermer</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
