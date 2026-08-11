"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import type { KBloc, KCard, KCol } from "@/lib/data/dashboard";
import { reactiver, setStatut } from "@/lib/bo/actions";

const COL_IC: Record<KCol["icon"], React.ReactNode> = {
  form: <path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1.6 3v2.4h5V7h-5zm7 .4v1.6h5.8V7.4h-5.8zM5.6 11.6v1.6h12.2v-1.6H5.6zm0 3.6V17h12.2v-1.8H5.6z" />,
  building: <path d="M5 2h11a1 1 0 0 1 1 1v18h3v2H4v-2h1V3a1 1 0 0 1 0-1zm2.5 3v2h2V5h-2zm4 0v2h2V5h-2zm-4 3.6v2h2v-2h-2zm4 0v2h2v-2h-2zm-4 3.6v2h2v-2h-2zm4 0v2h2v-2h-2zm-2 3.8V21h4v-5h-4z" />,
  flame: <><path d="M12 3c1 3-3 4.5-3 8a3 3 0 0 0 6 0c0-1.5-.8-2.5-.8-2.5S17 10 17 13a5 5 0 0 1-10 0c0-4.5 4-6 5-10z" /></>,
  pdf: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></>,
  spread: <><path d="M12 3v7M12 10l-6 8M12 10l6 8" /><circle cx="12" cy="3" r="1.6" /><circle cx="6" cy="19" r="1.6" /><circle cx="18" cy="19" r="1.6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" /></>,
  tool: <><path d="M13 3 4 12l3.5 3.5L14 9M11 12l6 6M14 15l4 4" /></>,
  bank: <><path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18" /></>,
  flag: <><path d="M5 3v18M5 4h12l-2.5 3.5L17 11H5" /></>,
};

const BLOC_IC: Record<KBloc["icon"], React.ReactNode> = {
  in: <><path d="M14 4h6v16h-6M3 12h11M10 8l4 4-4 4" /></>,
  megaphone: <><path d="M3 10v4l4 .8V9.2zM7 9l11-5v16l-11-5" /><path d="M8 15l1 5h3l-.8-4.6" /></>,
  flag: <><path d="M4 21V4" /><path d="M4 5c3-2 6 1 9 0s5-1 7 0v9c-2-1-4-1-7 0s-6 2-9 0" /></>,
};

function Card({ c, mock }: { c: KCard; mock?: boolean }) {
  const [pending, startTransition] = useTransition();
  const onAction = () => {
    if (mock || pending || !c.action) return;
    startTransition(async () => {
      if (c.action!.kind === "green") await reactiver(c.id);
      else if (c.action!.next) await setStatut(c.id, c.action!.next);
    });
  };
  const top = (
    <>
        <div className={`kthumb${c.photoUrl ? " has-photo" : ""}`}>
          {c.photoUrl ? (
            <Image src={c.photoUrl} alt="" width={164} height={152} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : c.photo ? (
            <svg viewBox="0 0 24 24">{COL_IC.building}</svg>
          ) : (
            <svg viewBox="0 0 24 24">{COL_IC.form}</svg>
          )}
          {c.rv && <span className="rv">{c.rvText ?? "RV"}</span>}
        </div>
        <div className="kbody">
          <div className="krow1">
            <span className="kt">{c.ville}</span>
            <span className="kcontact">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c.7-4 3.6-5.6 6.5-5.6s5.8 1.6 6.5 5.6" /></svg>
              {c.contact}
            </span>
          </div>

          {c.statusMandat && (
            <div className="kstatus">
              <svg viewBox="0 0 24 24"><path d="M5 8h14v12H5z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
              {c.statusMandat}
            </div>
          )}

          {(c.date || c.note || c.estimation) && !c.wait && (
            <div className="krow2">
              {c.date && <span className="kdate">{c.date}</span>}
              {c.estimation && (
                <span className="knote">
                  <span className="nic"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg></span>
                  Estimation
                </span>
              )}
              {c.note && (
                <span className="knote">
                  {c.note === "Formulaire" && (
                    <span className="nic"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></svg></span>
                  )}
                  {c.note}
                </span>
              )}
              {c.chevron && (
                <span className="kchev"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></span>
              )}
            </div>
          )}

          {c.wait && (
            <div className={`kwait${c.wait.late === false ? " soon" : ""}`}>
              <span className="d">{c.wait.from}</span>
              <span className="mid">
                <span className="lbl">{c.wait.motif}</span>
                <span className="ar">▾</span>
              </span>
              <span className="d">{c.wait.to}</span>
            </div>
          )}

          {(c.adresse || c.prix || c.fee) && (
            <div className="krow3">
              {c.adresse && <span className="kaddr">{c.adresse}</span>}
              {c.fee && <span className="kfee">{c.fee}</span>}
              {c.prix && <span className="kprice" style={!c.fee ? { marginLeft: "auto" } : undefined}>{c.prix}</span>}
            </div>
          )}
        </div>
    </>
  );
  return (
    <div className={`kard${c.wait ? " alert" : ""}`}>
      {mock ? (
        <div className="kard-top" style={{ display: "flex" }}>{top}</div>
      ) : (
        <Link href={`/bien/${c.id}`} className="kard-top" style={{ display: "flex" }}>{top}</Link>
      )}

      <div className="kact">
        <button className="kbtn" type="button" aria-label="Autres actions">
          <svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></svg>
        </button>
        {c.history && (
          <button className="kbtn" type="button" aria-label="Historique">
            <svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 1 1-1 5" /><path d="M4 4v5h5" /><path d="M12 8v4l3 2" /></svg>
          </button>
        )}
        {c.redIcons && (
          <>
            <button className="kbtn redic" type="button" aria-label="Mandat manquant">
              <svg viewBox="0 0 24 24"><path d="M5 8h14v12H5z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
            </button>
            <button className="kbtn redic" type="button" aria-label="Dossier PDF manquant">
              <svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></svg>
            </button>
            <button className="kbtn redic" type="button" aria-label="Contacts manquants">
              <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.6 14.2c2.4.2 4.2 1.6 4.6 4.3" /></svg>
            </button>
            <button className="kbtn" type="button" aria-label="Verrouillé">
              <svg viewBox="0 0 24 24"><rect x="6" y="10" width="12" height="10" rx="2" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></svg>
            </button>
          </>
        )}
        <span className="sp" />
        <button className="kbtn msg" type="button" aria-label="Messages">
          <svg viewBox="0 0 24 24"><path d="M8.4 3h9.2A3.4 3.4 0 0 1 21 6.4v4.4a3.4 3.4 0 0 1-3.4 3.4h-.6v2.5c0 .5-.6.8-1 .5l-3.6-3H8.4A3.4 3.4 0 0 1 5 10.8V6.4A3.4 3.4 0 0 1 8.4 3z" /><path d="M3.2 8.6v4.6a4.2 4.2 0 0 0 4.2 4.2h.6v1.4c0 .5.6.8 1 .4l1.2-1H7.4a4.9 4.9 0 0 1-4.2-4.9V8.6z" /></svg>
        </button>
        {c.counts && (
          <>
            <span className="kcount"><svg viewBox="0 0 24 24"><path d="M21 4 3 11l7 3 3 7z" /></svg>{c.counts.prop}</span>
            <span className="kcount"><svg viewBox="0 0 24 24"><path d="M4 15l2-6h12l2 6" /><rect x="3" y="15" width="18" height="4" rx="1.5" /><circle cx="7.5" cy="19" r="1.4" /><circle cx="16.5" cy="19" r="1.4" /></svg>{c.counts.vis}</span>
            <span className="kcount"><svg viewBox="0 0 24 24"><path d="M13 3 4 12l3.5 3.5L14 9M11 12l6 6M14 15l4 4" /></svg>{c.counts.off}</span>
          </>
        )}
        {c.action && (
          <button
            className={`kgo${c.action.kind === "green" ? " green" : ""}`}
            type="button"
            disabled={pending}
            style={pending ? { opacity: 0.5 } : undefined}
            onClick={onAction}
          >
            {c.action.kind === "green" ? (
              <svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 1 1-1 5" /><path d="M4 4v5h5" /></svg>
            ) : (
              <span className="ch">›</span>
            )}
            {c.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

function Bloc({ b, mock }: { b: KBloc; mock?: boolean }) {
  const [open, setOpen] = useState(b.openDefault);
  return (
    <section className="bloc">
      <div className="bloc-band" onClick={() => setOpen((v) => !v)} role="button" aria-expanded={open}>
        <span className="bic"><svg viewBox="0 0 24 24">{BLOC_IC[b.icon]}</svg></span>
        <h2>{b.titre}</h2>
        <span className="sp" />
        {b.ventes && (
          <>
            <span style={{ fontSize: 12.5, color: "var(--slate-2)", fontWeight: 700 }}>{b.ventes.left}</span>
            <span className="karrow">→</span>
            <span className="kchip">{b.ventes.right}</span>
          </>
        )}
        {b.nred > 0 && <span className="nred">{b.nred}</span>}
        <span className="nsq">{b.nsq}</span>
      </div>
      {open && b.ventes && (
        <div className="vbar">
          <span className="g" style={{ width: `${b.ventes.pctGreen}%` }} />
          <span className="r" />
        </div>
      )}
      {open && (
        <div className="cols">
          {b.cols.map((col) => (
            <div className="col" key={col.key}>
              <div className="col-head">
                <span className="cic"><svg viewBox="0 0 24 24">{COL_IC[col.icon]}</svg></span>
                <span className="t">{col.titre}</span>
                {col.fee && <span className="kchip">{col.fee}</span>}
                <span className="n">{col.count}</span>
              </div>
              <div className="col-body">
                {col.cards.map((c) => (
                  <Card key={c.id} c={c} mock={mock} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function DashboardBlocs({ blocs, mock }: { blocs: KBloc[]; mock?: boolean }) {
  return (
    <div className="wrap">
      {blocs.map((b) => (
        <Bloc key={b.key} b={b} mock={mock} />
      ))}
    </div>
  );
}
