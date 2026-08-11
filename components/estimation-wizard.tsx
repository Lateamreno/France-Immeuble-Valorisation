"use client";

// Wizard « Nouvelle estimation » — réplique des 6 étapes du BO :
// Immeuble → Secteur → Prix → Analyse → PDF → Envoi.
// Le prix est figé à la génération (bo_estimation + bo_prix), comme dans le BO.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BienData } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import { createEstimation, setEstimationStatut, type EstimationPayload } from "@/lib/bo/actions";

const STEPS = ["Immeuble", "Secteur", "Prix", "Analyse", "PDF", "Envoi"] as const;
import { CIBLES } from "@/lib/referentiels";
const SCORES = ["1", "2", "3", "4", "5"];

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const fr1 = (x: number) => x.toFixed(1).replace(".", ",");

export function EstimationWizard({ b, secteur }: { b: BienData; secteur: Record<string, unknown> | null }) {
  const router = useRouter();
  const im = b.im;
  const immeubleId = String(im._id);
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [estId, setEstId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* --- état : Immeuble --- */
  const [gareName, setGareName] = useState(S(im.emp_gare_name));
  const [gareTime, setGareTime] = useState(S(im.emp_gare_time));
  const [comName, setComName] = useState(S(im.emp_com_name));
  const [comTime, setComTime] = useState(S(im.emp_com_time));
  const chTf0 = b.charges
    .filter((c) => String(c.Type_charge ?? "").startsWith("Taxe"))
    .reduce((s, c) => s + (num(c.non_recup_an) ?? num(c.total_an) ?? 0), 0);
  const chAut0 = b.charges
    .filter((c) => !String(c.Type_charge ?? "").startsWith("Taxe"))
    .reduce((s, c) => s + (num(c.non_recup_an) ?? num(c.total_an) ?? 0), 0);
  const [chTf, setChTf] = useState(chTf0 ? String(chTf0) : "");
  const [chAutres, setChAutres] = useState(chAut0 ? String(chAut0) : "");
  const tvxBati0 = b.travaux
    .filter((t) => Array.isArray(t.COMPOSANTs) && (t.COMPOSANTs as unknown[]).length > 0)
    .reduce((s, t) => s + (num(t.montant) ?? 0), 0);
  const tvxLots0 = b.travaux
    .filter((t) => Array.isArray(t.LOTs) && (t.LOTs as unknown[]).length > 0)
    .reduce((s, t) => s + (num(t.montant) ?? 0), 0);
  const [tvxBati, setTvxBati] = useState(tvxBati0 ? String(tvxBati0) : "");
  const [tvxLots, setTvxLots] = useState(tvxLots0 ? String(tvxLots0) : "");

  /* --- état : Secteur --- */
  const sect = secteur ?? {};
  const [refLoyer, setRefLoyer] = useState(S(num(sect["0 - loyer_mois"]) ?? num(sect.hab_loyer_retenu)));
  const [refPrix, setRefPrix] = useState(S(num(sect["0 - prix"]) ?? num(sect.hab_prix_retenu)));
  const [refRenta, setRefRenta] = useState(S(num(sect["0 - renta _%"]) ?? num(sect.hab_renta_retenu)));

  /* --- agrégats lots --- */
  const agg = useMemo(() => {
    const lots = b.lots;
    const by = (d: string) => lots.filter((l) => String(l.Destination ?? "") === d).length;
    const carrez = lots.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
    const occ = lots.filter((l) => (num(l.loyer) ?? 0) > 0);
    const carrezOcc = occ.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
    const loyersAn = lots.reduce((s, l) => s + (num(l.loyer) ?? 0), 0) * 12;
    const loyersMaxAn = lots.reduce((s, l) => s + (num(l.loyer_max) ?? num(l.loyer) ?? 0), 0) * 12;
    return {
      tot: lots.length, hab: by("Logement"), com: by("Commerce"), bur: by("Bureau"),
      carrez, carrezOcc, loyersAn, loyersMaxAn,
      occupation: lots.length ? Math.round((occ.length / lots.length) * 100) : 0,
      destinations: [...new Set(lots.map((l) => String(l.Destination ?? "")).filter(Boolean))],
    };
  }, [b.lots]);

  /* --- calculs de l'étape Prix --- */
  const travauxTot = (parse(tvxBati) ?? 0) + (parse(tvxLots) ?? 0);
  const chargesTot = (parse(chTf) ?? 0) + (parse(chAutres) ?? 0);
  const rRenta = parse(refRenta) ?? 0;
  const rPrix = parse(refPrix) ?? 0;
  const pRendement = rRenta > 0 ? agg.loyersAn / (rRenta / 100) : 0;
  const pRendementMax = rRenta > 0 ? agg.loyersMaxAn / (rRenta / 100) : 0;
  const pM2 = agg.carrez * rPrix;
  const pM2Max = agg.carrez * rPrix + travauxTot;
  const candidates = [pRendement, pRendementMax, pM2, pM2Max].filter((x) => x > 0);
  const pAuto = candidates.length
    ? Math.round(candidates.reduce((s, x) => s + x, 0) / candidates.length / 1000) * 1000
    : 0;

  const [haiStr, setHaiStr] = useState("");
  const [honosPct, setHonosPct] = useState("5");
  const hai = parse(haiStr) ?? pAuto;
  const pct = parse(honosPct) ?? 5;
  const nv = pct >= 0 ? Math.round(hai / (1 + pct / 100)) : hai;
  const honos = hai - nv;
  const haiTravaux = hai + travauxTot;
  const pcv = (x: number) => `${fr1(x * 100)} %`;
  const gap = (v: number, ref: number) => (ref > 0 ? Math.round(((v - ref) / ref) * 100) : 0);

  /* --- état : Analyse / PDF --- */
  const [scoreEmp, setScoreEmp] = useState("4");
  const [scoreLot, setScoreLot] = useState("4");
  const [scoreBati, setScoreBati] = useState("4");
  const [cibles, setCibles] = useState<string[]>(["Investisseur"]);
  const [analyse, setAnalyse] = useState("");
  const [titre, setTitre] = useState(`Estimation ${S(im.adresse_ville)}`.trim());

  const generer = () =>
    start(async () => {
      setError(null);
      try {
        const payload: EstimationPayload = {
          titre,
          adresse: {
            rue: S(im.adresse_rue) || undefined,
            numero_rue: S(im.adresse_numero_rue) || undefined,
            ville: S(im.adresse_ville) || undefined,
            zipcode: S(im.adresse_zipcode) || undefined,
            departement: S(im.adresse_departement ?? im.adresse_dpt) || undefined,
          },
          imm: {
            nb_lots_tot: agg.tot, nb_lots_hab: agg.hab, nb_lots_com: agg.com, nb_lots_bur: agg.bur,
            carrez_tot: agg.carrez, carrez_occ: agg.carrezOcc, occupation: agg.occupation,
            loyer_hc_tot: agg.loyersAn, loyer_hc_max_tot: agg.loyersMaxAn,
            destinations: agg.destinations,
          },
          emp: {
            gare_name: gareName || undefined, gare_time: parse(gareTime),
            com_name: comName || undefined, com_time: parse(comTime),
          },
          charges: { tf_non_recup: parse(chTf), autres_non_recup: parse(chAutres) },
          travaux: { bati: parse(tvxBati), lots: parse(tvxLots) },
          ref: { loyer: parse(refLoyer), prix: parse(refPrix), renta: parse(refRenta) },
          prix: { hai, honos_pct: pct },
          scores: { emp: scoreEmp, lot: scoreLot, bati: scoreBati },
          cibles,
          analyse: analyse || undefined,
          photo: typeof im.photo_main_compressed === "string" ? im.photo_main_compressed : undefined,
        };
        const id = await createEstimation(immeubleId, String(im.AGENT ?? ""), payload);
        setEstId(id);
        setStep(5);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

  const marquer = (statut: "3 - Envoyée" | "4 - Interne") =>
    start(async () => {
      if (!estId) return;
      await setEstimationStatut(immeubleId, estId, statut);
      router.push(`/bien/${immeubleId}`);
    });

  const Nav = ({ nextLabel }: { nextLabel?: string }) => (
    <div className="wnav">
      {step > 0 && step < 5 && (
        <button className="kgo" type="button" onClick={() => setStep(step - 1)}>‹ Précédent</button>
      )}
      <span className="sp" style={{ flex: 1 }} />
      {step < 4 && (
        <button className="kgo" type="button" onClick={() => setStep(step + 1)}>
          <span className="ch">›</span> {nextLabel ?? "Suivant"}
        </button>
      )}
    </div>
  );

  return (
    <div className="wiz">
      <div className="whead">
        <div className="wtitle">Nouvelle estimation — {S(im.adresse_ville)} ({S(im.adresse_zipcode)})</div>
        <Link href={`/bien/${immeubleId}`} className="wclose">✕ Fermer</Link>
      </div>
      <div className="wsteps">
        {STEPS.map((s, i) => (
          <button
            key={s} type="button"
            className={`wstep${i === step ? " on" : ""}${i < step ? " done" : ""}`}
            onClick={() => { if (i < 4 && !estId) setStep(i); }}
          >
            <span className="n">{i + 1}</span>{s}
          </button>
        ))}
      </div>

      <div className="wbody">
        {step === 0 && (
          <>
            <div className="fsub">Données de l&apos;immeuble</div>
            <div className="wgrid">
              <div className="wcard">
                <div className="h">Adresse</div>
                <div className="v">{[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}<br />{S(im.adresse_zipcode)} {S(im.adresse_ville)}</div>
              </div>
              <div className="wcard">
                <div className="h">Points d&apos;intérêt</div>
                <div className="mrow" style={{ alignItems: "center", marginBottom: 4 }}>
                  <input className="min" style={{ width: 150 }} placeholder="Nom de la gare" value={gareName} onChange={(e) => setGareName(e.target.value)} />
                  <input className="min" style={{ width: 60 }} placeholder="min" value={gareTime} onChange={(e) => setGareTime(e.target.value)} /> min
                </div>
                <div className="mrow" style={{ alignItems: "center" }}>
                  <input className="min" style={{ width: 150 }} placeholder="Nom des commerces" value={comName} onChange={(e) => setComName(e.target.value)} />
                  <input className="min" style={{ width: 60 }} placeholder="min" value={comTime} onChange={(e) => setComTime(e.target.value)} /> min
                </div>
              </div>
              <div className="wcard">
                <div className="h">Charges non récupérables (€/an)</div>
                <div className="mrow" style={{ alignItems: "center" }}>
                  <label style={{ fontSize: 12 }}>Taxe foncière <input className="min" style={{ width: 90 }} value={chTf} onChange={(e) => setChTf(e.target.value)} /></label>
                  <label style={{ fontSize: 12 }}>Autres charges <input className="min" style={{ width: 90 }} value={chAutres} onChange={(e) => setChAutres(e.target.value)} /></label>
                </div>
                <div className="v" style={{ marginTop: 6 }}>Charges totales : <b>{euros(chargesTot) ?? "0 €"}/an</b></div>
              </div>
              <div className="wcard">
                <div className="h">Travaux</div>
                <div className="mrow" style={{ alignItems: "center" }}>
                  <label style={{ fontSize: 12 }}>sur le bâti <input className="min" style={{ width: 90 }} value={tvxBati} onChange={(e) => setTvxBati(e.target.value)} /></label>
                  <label style={{ fontSize: 12 }}>sur les lots <input className="min" style={{ width: 90 }} value={tvxLots} onChange={(e) => setTvxLots(e.target.value)} /></label>
                </div>
                <div className="v" style={{ marginTop: 6 }}>Travaux totaux : <b>{euros(travauxTot) ?? "0 €"}</b></div>
              </div>
            </div>
            <div className="fsub" style={{ marginTop: 16 }}>État locatif</div>
            <div className="ltable-wrap">
              <table className="ltable">
                <thead><tr><th>Destination</th><th>Lots</th><th>Occupés</th><th>Surface</th><th>Loyer</th><th>Potentiel</th></tr></thead>
                <tbody>
                  {agg.destinations.map((d) => {
                    const ls = b.lots.filter((l) => String(l.Destination ?? "") === d);
                    const occ = ls.filter((l) => (num(l.loyer) ?? 0) > 0).length;
                    const surf = ls.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
                    const loy = ls.reduce((s, l) => s + (num(l.loyer) ?? 0), 0) * 12;
                    const max = ls.reduce((s, l) => s + (num(l.loyer_max) ?? num(l.loyer) ?? 0), 0) * 12;
                    return (
                      <tr key={d}>
                        <td><b>{d}</b></td><td>{ls.length}</td><td>{occ}</td>
                        <td>{Math.round(surf)} m²</td><td>{euros(loy)}/an</td><td>{euros(max)}/an</td>
                      </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 700 }}>
                    <td>Total</td><td>{agg.tot}</td><td>{agg.occupation} %</td>
                    <td>{Math.round(agg.carrez)} m²</td><td>{euros(agg.loyersAn)}/an</td><td>{euros(agg.loyersMaxAn)}/an</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Nav />
          </>
        )}

        {step === 1 && (
          <>
            <div className="fsub">Valeurs du secteur retenues</div>
            <div className="wgrid">
              <div className="wcard">
                <div className="h">Loyer global (€/m²/mois)</div>
                <input className="min" value={refLoyer} onChange={(e) => setRefLoyer(e.target.value)} />
              </div>
              <div className="wcard">
                <div className="h">Prix global (€/m²)</div>
                <input className="min" value={refPrix} onChange={(e) => setRefPrix(e.target.value)} />
              </div>
              <div className="wcard">
                <div className="h">Rendement global (%)</div>
                <input className="min" value={refRenta} onChange={(e) => setRefRenta(e.target.value)} />
              </div>
            </div>
            {secteur ? (
              <div style={{ fontSize: 12, color: "var(--gray-txt)", marginTop: 10 }}>
                Pré-rempli depuis le relevé « Prix du secteur » du {S(sect["0 - date"]).slice(0, 10) || "—"} (onglet Emplacement).
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--gray-txt)", marginTop: 10 }}>
                Aucun relevé de secteur pour cet immeuble — saisissez les valeurs à la main.
              </div>
            )}
            <div className="fsub" style={{ marginTop: 16 }}>Sources</div>
            <div className="mrow">
              {[
                ["Seloger", `https://www.seloger.com/prix-de-l-immo/vente/${S(im.adresse_zipcode)}.htm`],
                ["Notaires", "https://www.immobilier.notaires.fr/fr/prix-immobilier"],
                ["Notaires Paris", "https://paris.notaires.fr/fr/outils/prix-immobiliers"],
                ["LocalCommercial", "https://www.localcommercial.net"],
              ].map(([l, href]) => (
                <a key={l} className="mopt" href={href} target="_blank" rel="noreferrer">{l} ↗</a>
              ))}
            </div>
            <Nav />
          </>
        )}

        {step === 2 && (
          <>
            <div className="fsub">Estimation selon le secteur</div>
            <div className="wgrid">
              {[
                ["Rendement", `${refRenta || "—"} %`, pRendement],
                ["Rendement max", `${refRenta || "—"} %`, pRendementMax],
                ["Prix au m²", `${refPrix || "—"} €/m²`, pM2],
                ["Prix au m² max", "avec travaux", pM2Max],
              ].map(([label, src, val]) => (
                <div key={label as string} className="wcard">
                  <div className="h">{label as string} <span style={{ fontWeight: 400, color: "var(--gray-lt)" }}>({src as string})</span></div>
                  <div className="big">{euros(val as number) ?? "—"}</div>
                </div>
              ))}
            </div>
            <div className="wcard gold" style={{ marginTop: 10 }}>
              <div className="h">Prix automatique (moyenne)</div>
              <div className="big">{euros(pAuto) ?? "—"}</div>
            </div>

            <div className="fsub" style={{ marginTop: 16 }}>Prix estimé</div>
            <div className="mrow" style={{ alignItems: "center" }}>
              <label style={{ fontSize: 12.5 }}>Prix HAI <input className="min" style={{ width: 120 }} placeholder={String(pAuto)} value={haiStr} onChange={(e) => setHaiStr(e.target.value)} /></label>
              <label style={{ fontSize: 12.5 }}>Honoraires % <input className="min" style={{ width: 60 }} value={honosPct} onChange={(e) => setHonosPct(e.target.value)} /></label>
              <span style={{ fontSize: 13 }}>
                Net vendeur <b>{euros(nv)}</b> + Honoraires <b>{euros(honos)}</b> ({fr1(pct)} %) = <b className="nmoney">{euros(hai)} HAI</b>
              </span>
            </div>

            <div className="fsub" style={{ marginTop: 16 }}>Comparateur</div>
            <div className="ltable-wrap">
              <table className="ltable">
                <thead><tr><th /><th>Actuel</th><th>Potentiel (avec travaux)</th></tr></thead>
                <tbody>
                  <tr>
                    <td><b>Loyer au m²</b></td>
                    <td>{agg.carrezOcc > 0 ? `${fr1(agg.loyersAn / 12 / agg.carrezOcc)} €/m²` : "—"}{parse(refLoyer) ? ` (${gap(agg.loyersAn / 12 / (agg.carrezOcc || 1), parse(refLoyer)!) >= 0 ? "+" : ""}${gap(agg.loyersAn / 12 / (agg.carrezOcc || 1), parse(refLoyer)!)} %)` : ""}</td>
                    <td>{agg.carrez > 0 ? `${fr1(agg.loyersMaxAn / 12 / agg.carrez)} €/m²` : "—"}{parse(refLoyer) ? ` (${gap(agg.loyersMaxAn / 12 / (agg.carrez || 1), parse(refLoyer)!) >= 0 ? "+" : ""}${gap(agg.loyersMaxAn / 12 / (agg.carrez || 1), parse(refLoyer)!)} %)` : ""}</td>
                  </tr>
                  <tr>
                    <td><b>Prix au m²</b></td>
                    <td>{agg.carrez > 0 ? `${Math.round(hai / agg.carrez).toLocaleString("fr-FR")} €/m²` : "—"}{rPrix ? ` (${gap(hai / (agg.carrez || 1), rPrix) >= 0 ? "+" : ""}${gap(hai / (agg.carrez || 1), rPrix)} %)` : ""}</td>
                    <td>{agg.carrez > 0 ? `${Math.round(haiTravaux / agg.carrez).toLocaleString("fr-FR")} €/m²` : "—"}</td>
                  </tr>
                  <tr><td><b>Rendement brut</b></td><td>{hai > 0 ? pcv(agg.loyersAn / hai) : "—"}</td><td>{haiTravaux > 0 ? pcv(agg.loyersMaxAn / haiTravaux) : "—"}</td></tr>
                  <tr><td><b>Rendement net</b></td><td>{hai > 0 ? pcv((agg.loyersAn - chargesTot) / hai) : "—"}</td><td>{haiTravaux > 0 ? pcv((agg.loyersMaxAn - chargesTot) / haiTravaux) : "—"}</td></tr>
                  <tr><td><b>Acte en main</b></td><td>{hai > 0 ? pcv((agg.loyersAn - chargesTot) / (hai * 1.075)) : "—"}</td><td>{haiTravaux > 0 ? pcv((agg.loyersMaxAn - chargesTot) / (haiTravaux * 1.075)) : "—"}</td></tr>
                </tbody>
              </table>
            </div>
            <Nav />
          </>
        )}

        {step === 3 && (
          <>
            <div className="fsub">Fondamentaux</div>
            <div className="wgrid">
              {([["Emplacement", scoreEmp, setScoreEmp], ["Lots", scoreLot, setScoreLot], ["Bâti", scoreBati, setScoreBati]] as const).map(([label, val, set]) => (
                <div key={label} className="wcard">
                  <div className="h">{label}</div>
                  <div className="mrow">
                    {SCORES.map((s) => (
                      <button key={s} type="button" className={`mopt${val === s ? " on" : ""}`} onClick={() => set(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="fsub" style={{ marginTop: 16 }}>Cibles</div>
            <div className="mrow">
              {CIBLES.map((c) => (
                <button key={c} type="button" className={`mopt${cibles.includes(c) ? " on" : ""}`} onClick={() => setCibles(cibles.includes(c) ? cibles.filter((x) => x !== c) : [...cibles, c])}>{c}</button>
              ))}
            </div>
            <div className="fsub" style={{ marginTop: 16 }}>Analyse</div>
            <textarea className="min" rows={7} maxLength={900} value={analyse} onChange={(e) => setAnalyse(e.target.value)}
              placeholder="Analyse du bien, références comparables, justification du prix…" />
            <div style={{ fontSize: 11.5, color: "var(--gray-lt)", textAlign: "right" }}>{analyse.length}/900 caractères</div>
            <Nav />
          </>
        )}

        {step === 4 && (
          <>
            <div className="fsub">Génération</div>
            <span className="mlab">Titre de l&apos;estimation</span>
            <input className="min" style={{ maxWidth: 360 }} value={titre} onChange={(e) => setTitre(e.target.value)} />
            <span className="mlab">Agent à afficher</span>
            <input className="min" style={{ maxWidth: 200 }} readOnly value={b.agentInitials} />
            <div className="warnbox">
              Vous ne pourrez plus modifier les informations après avoir généré l&apos;estimation.
            </div>
            {error && <div className="warnbox" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>}
            <div className="wnav">
              <button className="kgo" type="button" onClick={() => setStep(3)}>‹ Précédent</button>
              <span className="sp" style={{ flex: 1 }} />
              <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined} onClick={generer}>
                <span className="ch">+</span> Générer l&apos;estimation
              </button>
            </div>
          </>
        )}

        {step === 5 && estId && (
          <>
            <div className="fsub">Estimation générée ✓</div>
            <div className="wcard gold">
              <div className="h">{titre}</div>
              <div className="big">{euros(hai)} HAI</div>
              <div className="v">Net vendeur {euros(nv)} + honoraires {euros(honos)} ({fr1(pct)} %)</div>
            </div>
            <div className="mrow" style={{ marginTop: 14 }}>
              <Link className="kgo" href={`/bien/${immeubleId}/estimation/${estId}/imprimer`} target="_blank">
                <span className="ch">›</span> Voir la version imprimable (PDF)
              </Link>
            </div>
            <div className="fsub" style={{ marginTop: 18 }}>Envoi au propriétaire</div>
            <div style={{ fontSize: 12.5, color: "var(--gray-txt)", marginBottom: 8 }}>
              Doctrine : l&apos;envoi reste manuel — l&apos;app prépare, l&apos;agent envoie depuis sa boîte.
            </div>
            {b.proprietaire && S(b.proprietaire.email) && (
              <a
                className="kgo"
                style={{ display: "inline-flex", marginBottom: 10 }}
                href={`mailto:${S(b.proprietaire.email)}?subject=${encodeURIComponent(`Estimation de votre immeuble à ${S(im.adresse_ville)}`)}&body=${encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint l'estimation de votre immeuble situé ${[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")} à ${S(im.adresse_ville)}.\n\nNous estimons le bien à ${euros(hai)} honoraires d'agence inclus.\n\nBien cordialement,\n${b.agentInitials} — France Immeuble`)}`}
              >
                <span className="ch">›</span> Préparer l&apos;e-mail ({S(b.proprietaire.email)})
              </a>
            )}
            <div className="mrow">
              <button className="kgo green" type="button" disabled={pending} onClick={() => marquer("3 - Envoyée")}>Marquer envoyée</button>
              <button className="kgo" type="button" disabled={pending} onClick={() => marquer("4 - Interne")}>Estimation interne</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
