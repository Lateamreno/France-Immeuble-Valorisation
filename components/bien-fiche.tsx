"use client";

import { useState } from "react";
import Image from "next/image";
import type { BienData } from "@/lib/bubble/server";
import { dmy, euros, keur } from "@/lib/format";

type SectionKey =
  | "suivi" | "proprietaire" | "emplacement" | "locatif" | "technique"
  | "prix" | "photos" | "estimations" | "mandats" | "dossiers" | "tous-docs"
  | "acheteurs" | "notes";

const I = {
  suivi: <><path d="M4 9a8 8 0 1 1-1 5" /><path d="M4 4v5h5" /><path d="M12 8v4l3 2" /></>,
  user: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  key: <><circle cx="8" cy="14" r="4" /><path d="M11 11 20 2M16 6l2.5 2.5M13 9l2 2" /></>,
  tech: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="4.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 10.5V17M12 7.2v.2" /></>,
  cam: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8 7l1.5-3h5L16 7" /><circle cx="12" cy="13" r="3.4" /></>,
  folder: <><path d="M3 6h6l2 2.5h10V20H3z" /></>,
  calc: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 12h.1M12 12h.1M15 12h.1M9 16h.1M12 16h.1M15 16h.1" /></>,
  brief: <><path d="M5 8h14v12H5z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  pdf: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.6 14.2c2.4.2 4.2 1.6 4.6 4.3" /></>,
  note: <><path d="M4 4h16v12l-4 4H4z" /><path d="M16 20v-4h4" /></>,
  phone: <><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 8 9 5 9-5" /></>,
};

function Row({ children }: { children: React.ReactNode }) {
  return <div className="frow">{children}</div>;
}

export function BienFiche({ b }: { b: BienData }) {
  const [sect, setSect] = useState<SectionKey>("suivi");
  const im = b.im;
  const ok = (k: string) => im[k] === true;

  const sections: {
    key: SectionKey; label: string; icon: React.ReactNode;
    indicator?: React.ReactNode; sub?: boolean;
  }[] = [
    { key: "suivi", label: "Suivi", icon: I.suivi, indicator: <span className="ncount">{b.suivis.length}</span> },
    { key: "proprietaire", label: "Propriétaire", icon: I.user, indicator: ok("ok_proprio") ? <span className="okv">✓</span> : <span className="warn3" /> },
    { key: "emplacement", label: "Emplacement", icon: I.pin, indicator: ok("ok_emplacement") ? <span className="okv">✓</span> : <span className="warn3" /> },
    { key: "locatif", label: "Etat locatif", icon: I.key, indicator: ok("ok_locatif") ? <span className="okv">✓</span> : <span className="warn3" /> },
    { key: "technique", label: "Etat technique", icon: I.tech, indicator: ok("ok_composants") ? <span className="okv">✓</span> : <span className="warn3" /> },
    { key: "prix", label: "Description et prix", icon: I.info, indicator: ok("ok_prix") && ok("ok_descriptif") ? <span className="okv">✓</span> : <span className="warn3" /> },
    { key: "photos", label: "Photos", icon: I.cam, indicator: ok("ok_photos") ? <span className="okv">✓</span> : <span className="ncount">{b.photos.length}</span> },
  ];

  const docSub: typeof sections = [
    { key: "estimations", label: "Estimations", icon: I.calc, sub: true, indicator: <span className="right"><span className="nmoney">{euros(im.prix_hai_estim as number | undefined) ?? ""}</span><span className="ncount">{b.estimations.length}</span></span> },
    { key: "mandats", label: "Mandats", icon: I.brief, sub: true, indicator: <span className="ncount">{b.mandats.length}</span> },
    { key: "dossiers", label: "Dossiers", icon: I.pdf, sub: true, indicator: <span className="ncount">{b.dossiers.length}</span> },
    { key: "tous-docs", label: "Tous les documents", icon: I.folder, sub: true, indicator: <span className="ncount">{b.estimations.length + b.dossiers.length + b.mandats.length}</span> },
  ];

  return (
    <div className="fiche">
      <div className="fiche-main">
        <div className="fiche-inner">
          {sect === "suivi" && <SuiviSection b={b} />}
          {sect === "proprietaire" && <ProprioSection b={b} />}
          {sect === "emplacement" && <EmplacementSection b={b} />}
          {sect === "locatif" && <LocatifSection b={b} />}
          {sect === "technique" && <TechniqueSection b={b} />}
          {sect === "prix" && <PrixSection b={b} />}
          {sect === "photos" && <PhotosSection b={b} />}
          {sect === "estimations" && <EstimationsSection b={b} />}
          {sect === "mandats" && <MandatsSection b={b} />}
          {(sect === "dossiers" || sect === "tous-docs") && <DossiersSection b={b} />}
          {sect === "acheteurs" && <AcheteursSection b={b} />}
          {sect === "notes" && (
            <>
              <SectTitle icon={I.note} title="Notes" />
              <div className="fempty">Notes internes — à répliquer (saisie) dans une prochaine itération.</div>
            </>
          )}
        </div>
      </div>

      <aside className="brail">
        <div className="brail-head">
          <div className="bthumb">
            {b.photoUrl && <Image src={b.photoUrl} alt="" width={128} height={128} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            <span className="rv">{b.agentInitials}</span>
          </div>
          <div className="bh">
            <div className="bt">{b.ville}</div>
            <div><span className="bst">{b.statut}</span></div>
            {b.prix && <div className="bp">{b.prix}</div>}
          </div>
        </div>
        {b.standby && b.standby !== "Traité" && (
          <div className="brail-prog">
            <span className="line" />
            <span className="pill">{b.suivis[0]?.motif ?? b.standby}</span>
            <span className="line" />
            <span className="ic">ⓘ</span>
          </div>
        )}
        <nav>
          {sections.map((s) => (
            <button key={s.key} type="button" className={`srow2${sect === s.key ? " on" : ""}`} onClick={() => setSect(s.key)}>
              <span className="sic2"><svg viewBox="0 0 24 24">{s.icon}</svg></span>
              {s.label}
              <span className="right">{s.indicator}</span>
            </button>
          ))}
          <div className="srow2" style={{ cursor: "default" }}>
            <span className="sic2"><svg viewBox="0 0 24 24">{I.folder}</svg></span>
            Documents
          </div>
          {docSub.map((s) => (
            <button key={s.key} type="button" className={`srow2 sub${sect === s.key ? " on" : ""}`} onClick={() => setSect(s.key)}>
              <span className="sic2"><svg viewBox="0 0 24 24">{s.icon}</svg></span>
              {s.label}
              <span className="right">{s.indicator}</span>
            </button>
          ))}
          <button type="button" className={`srow2${sect === "acheteurs" ? " on" : ""}`} onClick={() => setSect("acheteurs")}>
            <span className="sic2"><svg viewBox="0 0 24 24">{I.users}</svg></span>
            Acheteurs
            <span className="right"><span className="ncount">{b.propositions.total}</span></span>
          </button>
          <button type="button" className={`srow2${sect === "notes" ? " on" : ""}`} onClick={() => setSect("notes")}>
            <span className="sic2"><svg viewBox="0 0 24 24">{I.note}</svg></span>
            Notes
          </button>
        </nav>
        <div className="brail-foot">
          <button className="kbtn" type="button" aria-label="Autres actions">
            <svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></svg>
          </button>
          <span className="sp" />
          <button className="kgo green" type="button">
            <svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 1 1-1 5" /><path d="M4 4v5h5" /></svg>
            Réactiver
          </button>
        </div>
      </aside>
    </div>
  );
}

function SectTitle({ icon, title, chips }: { icon: React.ReactNode; title: string; chips?: React.ReactNode }) {
  return (
    <div className="sect-title">
      <div className="t"><svg viewBox="0 0 24 24">{icon}</svg>{title}</div>
      {chips && <div className="chips">{chips}</div>}
    </div>
  );
}

function SuiviSection({ b }: { b: BienData }) {
  const im = b.im;
  return (
    <>
      <SectTitle icon={I.suivi} title="Suivi" />
      <div className="fcards">
        <div className="fcard">
          <span className="fic"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></svg></span>
          <div><div className="k">Création</div><div className="v">{dmy(im["Created Date"])}</div></div>
        </div>
        <div className="fcard">
          <span className="fic"><svg viewBox="0 0 24 24">{I.user}</svg></span>
          <div><div className="k">Suivi</div><div className="v">{b.agentInitials}</div></div>
        </div>
        <div className="fcard">
          <span className="fic"><svg viewBox="0 0 24 24"><path d="M4 20l4-1L20 7l-3-3L5 16z" /></svg></span>
          <div><div className="k">Dernière modification</div><div className="v">{dmy(im["Modified Date"])}</div></div>
        </div>
      </div>

      <div className="fh2">Source de l&apos;immeuble</div>
      <div className="fcards" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="fcard">
          <span className="fic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" /></svg></span>
          <div><div className="k">Source</div><div className="v">{String(im.source ?? "—")}</div></div>
        </div>
        <div className="fcard off">
          <span className="fic"><svg viewBox="0 0 24 24">{I.user}</svg></span>
          <div><div className="k">Apporteur</div><div className="v">Non</div></div>
        </div>
      </div>

      <div className="fh2">Historique des échanges ({b.suivis.length})</div>
      <button className="fbtn" type="button" style={{ marginBottom: 12 }}>+ Ajouter un suivi</button>
      {b.suivis.map((s, i) => (
        <div className="hitem" key={i}>
          <div className="hav">
            <span className="ava">{b.agentInitials}</span>
            {s.canal && (
              <span className={`canal${s.canal === "E-mail" ? " mail" : ""}`}>
                <svg viewBox="0 0 24 24">{s.canal === "E-mail" ? I.mail : I.phone}</svg>
              </span>
            )}
          </div>
          <div className="hb">
            {s.motif && s.relance ? (
              <div className="hfrise">
                <span className="d">{s.date}</span>
                <span className="mid"><span className="lbl">{s.motif}</span></span>
                <span className="d">{s.relance}</span>
                <span className="warn-ic">ⓘ</span>
              </div>
            ) : (
              <div className="hd">{s.date}</div>
            )}
            {s.notes && <div className="htext">{s.notes}</div>}
          </div>
        </div>
      ))}
      {b.suivis.length === 0 && <div className="fempty">Aucun échange enregistré.</div>}
    </>
  );
}

function ProprioSection({ b }: { b: BienData }) {
  const c = b.proprietaire;
  return (
    <>
      <SectTitle icon={I.user} title="Propriétaire" />
      {c ? (
        <Row>
          <span className="fic" style={{ width: 26, height: 26, color: "var(--slate-2)" }}><svg viewBox="0 0 24 24" style={{ width: "100%", height: "100%", stroke: "currentColor", fill: "none", strokeWidth: 1.8 }}>{I.user}</svg></span>
          <div className="grow">
            <div className="t">{String(c["prénom"] ?? "")} {String(c.nom ?? "")}</div>
            <div className="s">{String(c.portable_formatted ?? c.portable ?? "")} · {String(c.email ?? "")}</div>
          </div>
          {typeof b.im.Motif_vente === "string" && <span className="badge-o">Motif : {String(b.im.Motif_vente)}</span>}
        </Row>
      ) : (
        <div className="fempty">Aucun propriétaire lié.</div>
      )}

      <div className="fh2">Immeubles appartenant au même propriétaire</div>
      {b.autresBiens.length === 0 && <div className="fempty">Aucun autre immeuble.</div>}
      {b.autresBiens.map((a) => (
        <a href={`/bien/${a.id}`} key={a.id}>
          <Row>
            <div className="grow"><div className="t">{a.label}</div></div>
            <span className="badge-o">{a.statut}</span>
          </Row>
        </a>
      ))}
    </>
  );
}

function EmplacementSection({ b }: { b: BienData }) {
  const im = b.im;
  const emp: [string, unknown, unknown, unknown][] = [
    ["Gare", im.emp_gare_name, im.emp_gare_time, im.emp_gare_moyen],
    ["Bus", im.emp_bus_name, im.emp_bus_time, im.emp_bus_moyen],
    ["Routes", im.emp_route_name, im.emp_route_time, im.emp_route_moyen],
    ["Ecoles", im.emp_school_name, im.emp_school_time, im.emp_school_moyen],
    ["Commerces", im.emp_com_name, im.emp_com_time, im.emp_com_moyen],
  ];
  return (
    <>
      <SectTitle icon={I.pin} title="Emplacement" />
      <Row>
        <div className="grow">
          <div className="t">{String(im.adresse ?? `${b.adresse}, ${b.ville}`)}</div>
          <div className="s">Zone PLU : {String(im.plu_zone ?? "n.c.")} ({String(im.plu_Type_zone ?? "n.c.")})</div>
        </div>
      </Row>
      <div className="fh2">A proximité</div>
      {emp.filter(([, n]) => n).map(([label, name, time, moyen]) => (
        <Row key={label}>
          <div className="grow"><div className="t">{label}</div><div className="s">{String(name)}</div></div>
          <span className="badge-o">{String(time ?? "?")} min {String(moyen ?? "")}</span>
        </Row>
      ))}
      <div className="fh2">Statistiques de la commune</div>
      <div className="fcards">
        <div className="fcard"><div><div className="k">Habitants (INSEE)</div><div className="v">{typeof im.emp_population === "number" ? im.emp_population.toLocaleString("fr-FR") : "n.c."}</div></div></div>
        <div className="fcard"><div><div className="k">Revenus médian (INSEE)</div><div className="v">{euros(im.emp_revenus) ?? "n.c."}/an</div></div></div>
        <div className="fcard"><div><div className="k">Zone tendue</div><div className="v">{String(im.emp_zone_tendue ?? "n.c.")}</div></div></div>
      </div>
    </>
  );
}

function LocatifSection({ b }: { b: BienData }) {
  const im = b.im;
  const lots = b.lots;
  const pct = (a?: unknown, m?: unknown) =>
    typeof a === "number" && typeof m === "number" && a > 0 && m > a
      ? `+${Math.round(((m - a) / a) * 100)} %`
      : undefined;
  return (
    <>
      <SectTitle
        icon={I.key}
        title="Etat locatif"
        chips={
          <>
            <span className="fchip">{lots.length} lots</span>
            {typeof im.surface_carrez === "number" && im.surface_carrez > 0 && <span className="fchip">{Math.round(im.surface_carrez as number)} m²</span>}
            {euros(im.fin_loyers_an) && <span className="fchip">{euros(im.fin_loyers_an)}/an</span>}
            {typeof im.occupation_lots === "number" && <span className="fchip">{Math.round(im.occupation_lots as number)} %</span>}
            {euros(im.fin_loyers_an_max) && <span className="fchip gold">{euros(im.fin_loyers_an_max)}/an</span>}
            {euros(im.fin_travaux) && <span className="fchip">{euros(im.fin_travaux)}</span>}
          </>
        }
      />
      <div className="ltable-wrap">
        <table className="ltable">
          <thead>
            <tr>
              <th className="grp" colSpan={3}>Référence</th>
              <th className="grp" colSpan={3}>Général</th>
              <th className="grp" colSpan={4}>Loyer</th>
              <th className="grp" colSpan={2}>Etat</th>
              <th className="grp" colSpan={2}>Autres</th>
            </tr>
            <tr>
              <th>N°</th><th>Dest.</th><th>Type</th>
              <th>Carrez</th><th>Au sol</th><th>Type bail</th>
              <th>HC actuel</th><th>€/m²</th><th>HC max</th><th>€/m²</th>
              <th>Etat</th><th>Travaux</th>
              <th>DPE</th><th>Commentaire</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => {
              const bail = String(l.Type_bail ?? "n.c.");
              const p1 = pct(l.loyer, l.loyer_max);
              return (
                <tr key={l._id as string}>
                  <td>{String(l.numero ?? "")}</td>
                  <td>{String(l.Destination ?? "")}</td>
                  <td>{String(l.Type_lot ?? "")}</td>
                  <td>{String(l.surface_carrez ?? "")} m²</td>
                  <td>{String(l.surface_sol ?? "")} m²</td>
                  <td className={bail === "Vide" ? "red" : undefined}>{bail}</td>
                  <td>{euros(l.loyer) ?? <span className="na">n.a.</span>}</td>
                  <td>{typeof l.loyer_vol_mois === "number" ? `${l.loyer_vol_mois} €` : <span className="na">n.a.</span>}</td>
                  <td>{euros(l.loyer_max) ?? <span className="na">n.a.</span>}</td>
                  <td>{p1 ? <span className="pct">{p1}</span> : <span className="na">—</span>}</td>
                  <td className={String(l.Etat ?? "") === "Travaux" ? "red" : undefined}>{String(l.Etat ?? "n.c.")}</td>
                  <td>{typeof l.travaux_m2 === "number" && l.travaux_m2 > 0 ? euros((l.travaux_m2 as number) * Number(l.surface_carrez ?? 0)) : <span className="na">n.a.</span>}</td>
                  <td><span className="na">n.c.</span></td>
                  <td style={{ whiteSpace: "normal", maxWidth: 180 }}>{""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lots.length === 0 && <div className="fempty">Aucun lot saisi.</div>}
    </>
  );
}

function TechniqueSection({ b }: { b: BienData }) {
  return (
    <>
      <SectTitle icon={I.tech} title="Etat technique" chips={<><span className="fchip">Construit en {String(b.im.year_constru ?? "n.c.")}</span></>} />
      <div className="fh2">Composants</div>
      {b.composants.length === 0 && <div className="fempty">Aucun composant saisi.</div>}
      {b.composants.map((c) => (
        <Row key={c._id as string}>
          <div className="grow">
            <div className="t">{String(c.Type_composant ?? "?")}</div>
            <div className="s">{String(c["Type_matériau"] ?? "Matériau à préciser")}</div>
          </div>
          <span className="badge-o">{String(c.Etat ?? "Etat à préciser")}</span>
        </Row>
      ))}
      <div className="fh2">Travaux</div>
      {b.travaux.length === 0 && <div className="fempty">Aucuns travaux saisis.</div>}
      {b.travaux.map((t) => (
        <Row key={t._id as string}>
          <div className="grow"><div className="t">{String(t.description ?? "Travaux")}</div></div>
          <span className="money">{euros(t.montant)}</span>
        </Row>
      ))}
    </>
  );
}

function PrixSection({ b }: { b: BienData }) {
  const im = b.im;
  return (
    <>
      <SectTitle icon={I.info} title="Description et prix" chips={<span className="fchip gold">{euros(im.prix_hai)} HAI</span>} />
      <div className="fcards">
        <div className="fcard"><div><div className="k">Net vendeur</div><div className="v">{euros(im.prix_nv) ?? "n.c."}</div></div></div>
        <div className="fcard"><div><div className="k">Honoraires TTC</div><div className="v">{euros(im.prix_honos_ttc) ?? "n.c."} · charge {String(im.prix_Charge_honos ?? "n.c.")}</div></div></div>
        <div className="fcard"><div><div className="k">Prix HAI</div><div className="v">{euros(im.prix_hai) ?? "n.c."} ({String(im.prix_hai_m2 ?? "?")} €/m²)</div></div></div>
        <div className="fcard"><div><div className="k">Rendement brut</div><div className="v">{String(im.fin_renta_ba ?? "?")} % actuel · {String(im.fin_renta_bm ?? "?")} % potentiel</div></div></div>
        <div className="fcard"><div><div className="k">Loyers</div><div className="v">{euros(im.fin_loyers_an)}/an · max {euros(im.fin_loyers_an_max)}/an</div></div></div>
        <div className="fcard"><div><div className="k">Charges</div><div className="v">{euros(im.fin_charges_total) ?? "n.c."}/an</div></div></div>
      </div>
      <div className="fh2">Descriptif</div>
      <div className="frow" style={{ display: "block", whiteSpace: "pre-line", fontSize: 13, color: "var(--slate-2)" }}>
        {String(im.descriptif ?? "Aucun descriptif.")}
      </div>
    </>
  );
}

function PhotosSection({ b }: { b: BienData }) {
  return (
    <>
      <SectTitle icon={I.cam} title="Photos" chips={<span className="fchip">{b.photos.length} photos</span>} />
      <div className="fphotos">
        {b.photos.map((p) => (
          <div className="ph" key={p.id}>
            {p.url && <Image src={p.url} alt="" width={320} height={240} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
        ))}
      </div>
      {b.photos.length === 0 && <div className="fempty">Aucune photo.</div>}
    </>
  );
}

function EstimationsSection({ b }: { b: BienData }) {
  return (
    <>
      <SectTitle icon={I.calc} title="Estimations" chips={<span className="fchip gold">{euros(b.im.prix_hai_estim) ?? euros(b.im.prix_hai)} HAI</span>} />
      <button className="fbtn" type="button" style={{ margin: "0 auto 14px", display: "flex" }}>+ Estimer</button>
      {b.estimations.map((e) => {
        const st = String(e.Statut ?? "").replace(/^\d+ - /, "");
        return (
          <Row key={e._id as string}>
            <div className="grow">
              <div className="t">{String(e.titre ?? "Estimation")}</div>
              <div className="s">{dmy(e["Created Date"])}</div>
            </div>
            <span className={st === "Envoyée" ? "badge-g" : st === "PDF manquant" ? "badge-r" : "badge-o"}>{st}</span>
          </Row>
        );
      })}
      {b.estimations.length === 0 && <div className="fempty">Aucune estimation.</div>}
    </>
  );
}

function MandatsSection({ b }: { b: BienData }) {
  return (
    <>
      <SectTitle icon={I.brief} title="Mandats" />
      <button className="fbtn" type="button" style={{ margin: "0 auto 14px", display: "flex" }}>+ Ajouter un mandat</button>
      {b.mandats.map((m) => {
        const st = String(m.Statut ?? "");
        return (
          <Row key={m._id as string}>
            <div className="grow">
              <div className="t">{String(m.Type ?? "Vente")} {String(m.Type_exclu ?? "")} {m.numero ? `· #${m.numero}` : "· Pas de numéro"}</div>
              <div className="s">{dmy(m.date_effet)} → {dmy(m.date_fin)} · honos {euros(m.honos_ttc) ?? "n.c."}</div>
            </div>
            <span className={st === "En cours" ? "badge-g" : ["Expiré", "Annulé"].includes(st) ? "badge-r" : "badge-o"}>{st}</span>
            {typeof m.pdf_signed === "string" && m.pdf_signed && (
              <a className="fbtn" href={(m.pdf_signed as string).replace(/^\/\//, "https://")} target="_blank" rel="noreferrer">PDF</a>
            )}
          </Row>
        );
      })}
      {b.mandats.length === 0 && <div className="fempty">Aucun mandat.</div>}
    </>
  );
}

function DossiersSection({ b }: { b: BienData }) {
  return (
    <>
      <SectTitle icon={I.pdf} title="Dossiers" />
      <button className="fbtn" type="button" style={{ margin: "0 auto 14px", display: "flex" }}>+ Créer un nouveau dossier</button>
      {b.dossiers.map((d, i) => (
        <Row key={d._id as string}>
          <div className="grow">
            <div className="t">Dossier V{String(d.version ?? "?")} {i === 0 && <span className="badge-g">Dernière version</span>}</div>
            <div className="s">{dmy(d["Created Date"])} · {euros(d.prix_hai)} HAI · {d.public ? "Public" : "Privé"}</div>
          </div>
          {typeof d.pdf === "string" && d.pdf && (
            <a className="fbtn" href={(d.pdf as string).replace(/^\/\//, "https://")} target="_blank" rel="noreferrer">PDF</a>
          )}
        </Row>
      ))}
      {b.dossiers.length === 0 && <div className="fempty">Aucun dossier.</div>}
    </>
  );
}

function AcheteursSection({ b }: { b: BienData }) {
  return (
    <>
      <SectTitle icon={I.users} title="Acheteurs" chips={<><span className="fchip">{b.propositions.total} propositions</span><span className="fchip">{b.visites.length} visites</span><span className="fchip">{b.offres.length} offres</span></>} />
      <div className="fh2">Dernières propositions</div>
      {b.propositions.rows.map((p) => (
        <Row key={p._id as string}>
          <div className="grow">
            <div className="t">{String(p.mail_adresse ?? "Proposition")}</div>
            <div className="s">Envoyée le {dmy(p.date_envoi)} · {String(p.Source_proposition ?? "")}</div>
          </div>
          <span className="badge-o">{String(p.Statut ?? "")}</span>
        </Row>
      ))}
      {b.propositions.rows.length === 0 && <div className="fempty">Aucune proposition.</div>}
      <div className="fh2">Visites</div>
      {b.visites.map((v) => (
        <Row key={v._id as string}>
          <div className="grow"><div className="t">Visite du {dmy(v.date)}</div><div className="s">{String(v.rex_fi ?? "")}</div></div>
          <span className={String(v.Statut) === "Effectuée" ? "badge-g" : "badge-o"}>{String(v.Statut ?? "")}</span>
        </Row>
      ))}
      {b.visites.length === 0 && <div className="fempty">Aucune visite.</div>}
      <div className="fh2">Offres</div>
      {b.offres.map((o) => (
        <Row key={o._id as string}>
          <div className="grow">
            <div className="t">Offre du {dmy(o.date)}</div>
            <div className="s">{euros(o.prix_nv)} + {keur(o.honos_ttc)} honos = {euros(o.prix_hai)} HAI</div>
          </div>
          <span className={["Acceptée", "Vendu"].includes(String(o.Statut)) ? "badge-g" : String(o.Statut) === "Refusée" ? "badge-r" : "badge-o"}>{String(o.Statut ?? "")}</span>
        </Row>
      ))}
      {b.offres.length === 0 && <div className="fempty">Aucune offre.</div>}
    </>
  );
}
