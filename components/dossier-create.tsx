"use client";

// Modale « Nouveau dossier » — stepper Immeuble → Prix → PDF (réplique BO).
// Chaque génération crée une version (V1, V2…) figée dans bo_dossier.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { BienData } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import { apercuPdfDossier, createDossier, genererPdfDossier } from "@/lib/bo/actions";
import { bloquants, manquesDossier } from "@/lib/bo/completude";
import { descriptifAVerifier } from "@/lib/bo/descriptif";

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
  /* Retour #238 : le prix et le taux ne se saisissent plus ici, ils se lisent
     sur la fiche. Le dossier est un tirage, pas une saisie. */
  const hai = S(num(b.im.prix_hai));
  const pct = S(num(b.im.prix_Charge_honos) ?? 5);
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

  /* Retour #302 — « dès que je change un truc dans l'état locatif, les charges
     ou autre (en général sur la fiche bien) qui aurait modifié le descriptif
     automatique, il faut que tu m'empêches de générer un nouveau dossier et
     que tu me dises de régénérer le texte en fonction du dossier actuel. »
     Le signalement existait déjà, mais seulement comme un bandeau sur l'onglet
     Descriptif : rien n'empêchait de tirer un dossier de vingt pages dont la
     première page raconte l'immeuble d'avant. C'est le pire cas — le document
     part chez l'acquéreur et se contredit lui-même page après page. */
  const descPerime = descriptifAVerifier({ im: b.im, lots: b.lots, parcelles: b.parcelles });
  const bloque = manquants.length > 0 || descPerime;

  return (
    <>
      <button
        className="fbtn" type="button" style={{ margin: "0 auto 14px", display: "flex" }}
        disabled={bloque}
        title={manquants.length > 0
          ? `Il manque ${manquants.length} information${manquants.length > 1 ? "s" : ""} : ${manquants.map((x) => x.titre).join(" · ")}`
          : descPerime
          ? "Le descriptif ne correspond plus à la fiche : reprenez-le avant de générer."
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
      {descPerime && manquants.length === 0 && (
        <p className="dos-bloque">
          La fiche a changé depuis que le descriptif a été écrit : le dossier raconterait
          l&apos;immeuble d&apos;avant. <b>Reprenez le texte</b> — Description et prix ›
          Descriptif — puis revenez générer.{" "}
          <Link className="dos-lien" href={`/bien/${immeubleId}?ecran=prix&sous=descriptif`}>
            → Aller au descriptif
          </Link>
        </p>
      )}
      {open && (
        <div className="modal-ov">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Nouveau dossier — V{version}<button type="button" onClick={close}>✕</button></div>
            <div className="modal-b">
              {/* Retour #321 — « comme c'est pas immédiat on a l'impression
                  qu'il y a un bug et on est tenté de faire un deuxième dossier
                  alors qu'il n'y a pas lieu. »

                  Un dossier, c'est vingt pages, six cartes Google et un PDF :
                  dix à trente secondes. Le seul signe qu'il se passait quelque
                  chose était le libellé d'un bouton grisé, en bas de la modale,
                  là où l'œil n'est plus une fois qu'on a cliqué. D'où un
                  bandeau qui occupe le haut de l'écran, dit à quelle étape on
                  est, et demande explicitement de ne pas relancer. */}
              {pending && (
                <div className="dos-encours" role="status" aria-live="polite">
                  <span className="dos-encours-r" aria-hidden="true" />
                  <div>
                    <b>
                      {createdId
                        ? `Dossier V${version} enregistré — fabrication du PDF…`
                        : vu
                        ? "Enregistrement du dossier…"
                        : "Fabrication de l'aperçu…"}
                    </b>
                    <span>
                      Une vingtaine de pages, les cartes et le PDF : comptez quelques
                      secondes. Ne relancez pas, cela créerait un dossier en double.
                    </span>
                  </div>
                </div>
              )}
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

                  {/* Retour #238 — « attention, ici il faut pas du tout qu'on
                      puisse modifier le prix ni les honoraires. C'est vraiment
                      du pur génératif. » Le dossier reprend le prix de la
                      fiche, un point c'est tout : deux endroits pour saisir un
                      prix, c'est deux prix qui finissent par diverger. Il se
                      change là où il vit, sur Description et prix. */}
                  <div className="dos-fige">
                    <div>
                      <span>Prix HAI</span>
                      <b>{euros(vHai) ?? "—"}</b>
                    </div>
                    <div>
                      <span>Honoraires</span>
                      <b>{vPct.toString().replace(".", ",")} % TTC</b>
                    </div>
                    <span className="fine">
                      Repris de la fiche — ils se modifient sur <b>Description et prix</b>.
                    </span>
                  </div>
                  {vHai > 0 && (
                    <div style={{ fontSize: 13, marginTop: 8 }}>
                      Net vendeur <b>{euros(nv)}</b> + honoraires <b>{euros(vHai - nv)}</b> = <b>{euros(vHai)} HAI</b><br />
                      Rendement brut <b>{agg.loyersAn > 0 ? `${((agg.loyersAn / vHai) * 100).toFixed(1).replace(".", ",")} %` : "—"}</b>
                      {" · "}potentiel <b>{agg.loyersMaxAn > 0 ? `${((agg.loyersMaxAn / (vHai + agg.travaux)) * 100).toFixed(1).replace(".", ",")} %` : "—"}</b>
                    </div>
                  )}

                  {/* L'historique des prix, déroulable. Ses lignes se
                      reprenaient d'un clic pour remplir la case au-dessus ;
                      depuis #238 il n'y a plus de case à remplir, il ne reste
                      donc que la lecture — savoir d'où vient le prix affiché. */}
                  {histo.length > 0 && (
                    <>
                      <button type="button" className="hest-plus" style={{ marginTop: 12 }}
                        onClick={() => setVoirHisto(!voirHisto)}>
                        {voirHisto ? "Masquer l'historique des prix" : `Historique des prix (${histo.length})`}
                      </button>
                      {voirHisto && (
                        <div className="dos-histo">
                          {histo.map((p) => (
                            <div key={S(p._id)} className="dos-histo-l lecture">
                              <b>{euros(num(p.in_prix_hai)) ?? "—"}</b>
                              <span>
                                {S(p.in_Motif) || "Prix"}
                                {p["Created Date"] ? ` · ${new Date(S(p["Created Date"])).toLocaleDateString("fr-FR")}` : ""}
                                {num(p.out_prix_m2) ? ` · ${Math.round(num(p.out_prix_m2)!)} €/m²` : ""}
                                {num(p.out_rba) ? ` · ${num(p.out_rba)!.toFixed(1).replace(".", ",")} %` : ""}
                              </span>
                            </div>
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
                    {/* Retour #321 : enregistrer prend quelques secondes. Sans
                        libellé qui bouge, le bouton grisé passe pour un bug et
                        l'agent reclique — d'où les doublons de dossiers. */}
                    <span className="ch">+</span>{" "}
                    {pending && vu ? "Enregistrement…" : `Enregistrer la version V${prochaine}`}
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
