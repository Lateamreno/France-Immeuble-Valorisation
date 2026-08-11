"use client";

// Emplacement — sous-onglets Adresse · Parcelles et PLU · Prix du secteur
// (réplique BO). Les POI/data INSEE se saisissent à la main via les liens de
// recherche pré-construits ; les valeurs de secteur alimentent estimations
// et grilles (bo_prix_secteur).
import { useState, useTransition } from "react";
import type { BienData } from "@/lib/bubble/server";
import { euros } from "@/lib/format";
import {
  addParcelle, deleteParcelle, saveSecteurDest, updateEmplacement, type EmplacementPatch,
} from "@/lib/bo/actions";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const parse = (s: string) => (s === "" ? undefined : parseFloat(s.replace(",", ".")));
const fr1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("fr-FR");

const POIS = [
  ["gare", "Gares"], ["bus", "Bus"], ["route", "Routes"], ["school", "Ecoles"], ["com", "Commerces"],
] as const;
const DEST_PREFIX: Record<string, string> = {
  Logement: "hab", Commerce: "com", Bureau: "bur", Parking: "parking", Cave: "cave",
};

function gLink(q: string, b: BienData) {
  const where = `${S(b.im.adresse_rue)} ${S(b.im.adresse_zipcode)} ${S(b.im.adresse_ville)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${q} ${where}`)}`;
}

/* ---------- Adresse ---------- */

function AdresseTab({ b }: { b: BienData }) {
  const im = b.im;
  const immeubleId = String(im._id);
  const [pending, start] = useTransition();
  const [poi, setPoi] = useState(
    Object.fromEntries(
      POIS.flatMap(([k]) => [
        [`${k}_name`, S(im[`emp_${k}_name`])],
        [`${k}_time`, S(num(im[`emp_${k}_time`]))],
        [`${k}_moyen`, S(im[`emp_${k}_moyen`]) || "à pied"],
      ]),
    ) as Record<string, string>,
  );
  const [pop, setPop] = useState(S(num(im.emp_population)));
  const [rev, setRev] = useState(S(num(im.emp_revenus)));
  const [zt, setZt] = useState(im.emp_zone_tendue === true);
  const [tension, setTension] = useState(S(im.emp_tension_locative));

  const save = () =>
    start(() => {
      const patch: Record<string, unknown> = {
        emp_population: parse(pop), emp_revenus: parse(rev),
        emp_zone_tendue: zt, emp_tension_locative: tension || undefined,
      };
      for (const [k] of POIS) {
        patch[`emp_${k}_name`] = poi[`${k}_name`] || undefined;
        patch[`emp_${k}_time`] = parse(poi[`${k}_time`]);
        patch[`emp_${k}_moyen`] = poi[`${k}_moyen`] || undefined;
      }
      return updateEmplacement(immeubleId, patch as EmplacementPatch);
    });

  return (
    <>
      <div className="fsub">Adresse</div>
      <div style={{ fontSize: 13.5, marginBottom: 10 }}>
        {[S(im.adresse_numero_rue), S(im.adresse_rue)].filter(Boolean).join(" ")}, {S(im.adresse_zipcode)} {S(im.adresse_ville)}
        {" · "}
        <a className="lnk" href={`https://www.google.com/maps/search/${encodeURIComponent(`${S(im.adresse_numero_rue)} ${S(im.adresse_rue)} ${S(im.adresse_zipcode)} ${S(im.adresse_ville)}`)}`} target="_blank" rel="noreferrer">Google Maps ↗</a>
      </div>

      <div className="fsub">A proximité</div>
      <div className="mrow" style={{ marginBottom: 8 }}>
        {POIS.map(([k, label]) => (
          <a key={k} className="mopt" href={gLink(label, b)} target="_blank" rel="noreferrer">Google-{label} ↗</a>
        ))}
      </div>
      {POIS.map(([k, label]) => (
        <div key={k} className="mrow" style={{ alignItems: "center", marginBottom: 5 }}>
          <span style={{ width: 84, fontSize: 12.5, color: "var(--gray-txt)" }}>{label}</span>
          <input className="min" style={{ width: 210 }} placeholder={`Nom (${label.toLowerCase()})`} value={poi[`${k}_name`]} onChange={(e) => setPoi({ ...poi, [`${k}_name`]: e.target.value })} />
          <input className="min" style={{ width: 52 }} placeholder="min" value={poi[`${k}_time`]} onChange={(e) => setPoi({ ...poi, [`${k}_time`]: e.target.value })} />
          <select className="min" style={{ width: 100 }} value={poi[`${k}_moyen`]} onChange={(e) => setPoi({ ...poi, [`${k}_moyen`]: e.target.value })}>
            <option>à pied</option><option>en voiture</option>
          </select>
        </div>
      ))}

      <div className="fsub" style={{ marginTop: 14 }}>Data externe</div>
      <div className="mrow" style={{ marginBottom: 8 }}>
        <a className="mopt" href={`https://www.insee.fr/fr/recherche?q=${encodeURIComponent(S(im.adresse_ville))}`} target="_blank" rel="noreferrer">INSEE - Population ↗</a>
        <a className="mopt" href={`https://www.insee.fr/fr/recherche?q=${encodeURIComponent(`revenus ${S(im.adresse_ville)}`)}`} target="_blank" rel="noreferrer">INSEE - Revenus ↗</a>
        <a className="mopt" href="https://www.service-public.fr/simulateur/calcul/zones-tendues" target="_blank" rel="noreferrer">Service Public - Zones tendues ↗</a>
        <a className="mopt" href="https://www.locservice.fr/tensiometre/" target="_blank" rel="noreferrer">LOCservice - Tensiomètre ↗</a>
      </div>
      <div className="mrow" style={{ alignItems: "center" }}>
        <label style={{ fontSize: 12 }}>Habitants INSEE <input className="min" style={{ width: 90 }} value={pop} onChange={(e) => setPop(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Revenus médian €/an <input className="min" style={{ width: 90 }} value={rev} onChange={(e) => setRev(e.target.value)} /></label>
        <button type="button" className={`mopt${zt ? " on" : ""}`} onClick={() => setZt(!zt)}>Zone tendue : {zt ? "Oui" : "Non"}</button>
        <select className="min" style={{ width: 130 }} value={tension} onChange={(e) => setTension(e.target.value)}>
          <option value="">Tension locative…</option>
          <option>Faible</option><option>Modérée</option><option>Forte</option><option>Très forte</option>
        </select>
      </div>
      <div className="wnav">
        <span className="sp" style={{ flex: 1 }} />
        <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined} onClick={save}>
          <span className="ch">›</span> Enregistrer
        </button>
      </div>
    </>
  );
}

/* ---------- Parcelles & PLU ---------- */

function ParcellesTab({ b }: { b: BienData }) {
  const im = b.im;
  const immeubleId = String(im._id);
  const [pending, start] = useTransition();
  const [ref, setRef] = useState("");
  const [sup, setSup] = useState("");
  const [fac, setFac] = useState("");
  const [zone, setZone] = useState(S(im.plu_zone));
  const [typeZone, setTypeZone] = useState(S(im.plu_Type_zone));
  const [hauteur, setHauteur] = useState(S(num(im.plu_hauteur)));
  const [emprise, setEmprise] = useState(S(num(im.plu_emprise)));

  return (
    <>
      <div className="fsub">Parcelles</div>
      <div className="mrow" style={{ marginBottom: 8 }}>
        <a className="mopt" href={`https://cadastre.gouv.fr/scpc/rechercherPlan.do`} target="_blank" rel="noreferrer">Cadastre ↗</a>
        <a className="mopt" href={`https://www.geoportail.gouv.fr/carte`} target="_blank" rel="noreferrer">Géoportail ↗</a>
        <a className="mopt" href={gLink("cadastre parcelle", b)} target="_blank" rel="noreferrer">Google ↗</a>
      </div>
      {b.parcelles.map((p) => (
        <div key={String(p._id)} className="chrow">
          <span className="t">Parcelle {S(p.ref_cadastre)}</span>
          {num(p.superficie) !== undefined && <span className="c">{p.superficie as number} m²</span>}
          {num(p.facade) !== undefined && <span className="c">façade {p.facade as number} m</span>}
          <span className="sp" style={{ flex: 1 }} />
          <button className="xdel" type="button" title="Retirer la parcelle"
            onClick={() => {
              if (!confirm("Retirer cette parcelle ?")) return;
              start(() => deleteParcelle(immeubleId, String(p._id)));
            }}>✕</button>
        </div>
      ))}
      <div className="mrow" style={{ alignItems: "center", marginTop: 6 }}>
        <input className="min" style={{ width: 110 }} placeholder="Réf. (ex. H25)" value={ref} onChange={(e) => setRef(e.target.value)} />
        <input className="min" style={{ width: 100 }} placeholder="Superficie m²" value={sup} onChange={(e) => setSup(e.target.value)} />
        <input className="min" style={{ width: 90 }} placeholder="Façade m" value={fac} onChange={(e) => setFac(e.target.value)} />
        <button
          className="fadd" type="button" disabled={pending || !ref.trim()}
          onClick={() =>
            start(async () => {
              await addParcelle(immeubleId, { ref_cadastre: ref.trim(), superficie: parse(sup), facade: parse(fac) });
              setRef(""); setSup(""); setFac("");
            })
          }
        >+ Ajouter une parcelle</button>
      </div>

      <div className="fsub" style={{ marginTop: 18 }}>Plan Local d&apos;Urbanisme (PLU)</div>
      <div className="mrow" style={{ alignItems: "center" }}>
        <label style={{ fontSize: 12 }}>Zone <input className="min" style={{ width: 90 }} value={zone} onChange={(e) => setZone(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Type de zone <input className="min" style={{ width: 150 }} value={typeZone} onChange={(e) => setTypeZone(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Hauteur max (m) <input className="min" style={{ width: 70 }} value={hauteur} onChange={(e) => setHauteur(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Emprise max (%) <input className="min" style={{ width: 70 }} value={emprise} onChange={(e) => setEmprise(e.target.value)} /></label>
      </div>
      <div className="wnav">
        <span className="sp" style={{ flex: 1 }} />
        <button className="kgo" type="button" disabled={pending} style={pending ? { opacity: 0.5 } : undefined}
          onClick={() =>
            start(() =>
              updateEmplacement(immeubleId, {
                plu_zone: zone || undefined, plu_Type_zone: typeZone || undefined,
                plu_hauteur: parse(hauteur), plu_emprise: parse(emprise),
              }),
            )
          }
        ><span className="ch">›</span> Enregistrer</button>
      </div>
    </>
  );
}

/* ---------- Prix du secteur ---------- */

function SecteurTab({ b }: { b: BienData }) {
  const im = b.im;
  const sect = b.secteur ?? {};
  const lots = b.lots;
  const carrez = lots.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
  const carrezOcc = lots.reduce((s, l) => s + ((num(l.loyer) ?? 0) > 0 ? num(l.surface_carrez) ?? 0 : 0), 0);
  const loyersAn = lots.reduce((s, l) => s + (num(l.loyer) ?? 0), 0) * 12;
  const loyersMaxAn = lots.reduce((s, l) => s + (num(l.loyer_max) ?? num(l.loyer) ?? 0), 0) * 12;
  const travaux = num(im.fin_travaux) ?? 0;
  const hai = num(im.prix_hai) ?? 0;

  const refLoyer = num(sect["0 - loyer_mois"]);
  const refPrix = num(sect["0 - prix"]);
  const refRenta = num(sect["0 - renta _%"]);

  const gap = (v?: number, ref?: number) =>
    v !== undefined && ref !== undefined && ref > 0
      ? ` (${v >= ref ? "+" : "−"}${Math.abs(Math.round(((v - ref) / ref) * 100))} %)`
      : "";

  const dests = [...new Set(lots.map((l) => String(l.Destination ?? "")).filter((d) => d))];
  const poids = dests.map((d) => ({
    dest: d,
    carrez: lots.filter((l) => String(l.Destination ?? "") === d).reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0),
  }));

  const lm2Act = carrezOcc > 0 ? loyersAn / 12 / carrezOcc : undefined;
  const lm2Max = carrez > 0 ? loyersMaxAn / 12 / carrez : undefined;
  const pm2Act = carrez > 0 && hai > 0 ? hai / carrez : undefined;
  const pm2Max = carrez > 0 && hai > 0 ? (hai + travaux) / carrez : undefined;

  return (
    <>
      {S(sect["0 - date"]) && (
        <div style={{ fontSize: 12, color: "var(--gray-txt)", marginBottom: 8 }}>
          Mis à jour le {S(sect["0 - date"]).slice(0, 10).split("-").reverse().join("/")}
        </div>
      )}
      <div className="fsub">Immeuble entier</div>
      <div className="ltable-wrap">
        <table className="ltable">
          <thead><tr><th /><th>Secteur</th><th>Actuel</th><th>Potentiel</th></tr></thead>
          <tbody>
            <tr>
              <td><b>Loyer (€/m²/mois)</b></td>
              <td>{refLoyer !== undefined ? fr1(refLoyer) : "n.c."}</td>
              <td>{lm2Act !== undefined ? fr1(lm2Act) + gap(lm2Act, refLoyer) : "—"}</td>
              <td>{lm2Max !== undefined ? fr1(lm2Max) + gap(lm2Max, refLoyer) : "—"}</td>
            </tr>
            <tr>
              <td><b>Loyer annuel</b></td>
              <td>{refLoyer !== undefined && carrez > 0 ? `${Math.round((refLoyer * carrez * 12) / 1000)} k€/an` : "n.c."}</td>
              <td>{loyersAn > 0 ? `${Math.round(loyersAn / 1000)} k€/an` : "—"}</td>
              <td>{loyersMaxAn > 0 ? `${Math.round(loyersMaxAn / 1000)} k€/an` : "—"}</td>
            </tr>
            <tr>
              <td><b>Prix (€/m²)</b></td>
              <td>{refPrix !== undefined ? Math.round(refPrix).toLocaleString("fr-FR") : "n.c."}</td>
              <td>{pm2Act !== undefined ? Math.round(pm2Act).toLocaleString("fr-FR") + gap(pm2Act, refPrix) : "—"}</td>
              <td>{pm2Max !== undefined ? Math.round(pm2Max).toLocaleString("fr-FR") : "—"}</td>
            </tr>
            <tr>
              <td><b>Rendement</b></td>
              <td>{refRenta !== undefined ? `${fr1(refRenta)} %` : "n.c."}</td>
              <td>{hai > 0 && loyersAn > 0 ? `${fr1((loyersAn / hai) * 100)} %` : "—"}</td>
              <td>{hai > 0 && loyersMaxAn > 0 ? `${fr1((loyersMaxAn / (hai + travaux)) * 100)} %` : "—"}</td>
            </tr>
            <tr>
              <td><b>Valeur</b></td>
              <td>{refPrix !== undefined && carrez > 0 ? euros(Math.round(refPrix * carrez)) : "n.c."}</td>
              <td>{hai > 0 ? euros(hai) : "—"}</td>
              <td>{hai > 0 ? euros(hai + travaux) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="fsub" style={{ marginTop: 16 }}>Détail par destination</div>
      {dests.length === 0 && <div className="fempty">Saisissez d&apos;abord des lots pour ventiler le secteur par destination.</div>}
      {dests.map((d) => {
        const prefix = DEST_PREFIX[d] ?? "autre";
        const ls = lots.filter((l) => String(l.Destination ?? "") === d);
        const surf = ls.reduce((s, l) => s + (num(l.surface_carrez) ?? 0), 0);
        return (
          <div key={d} className="chrow">
            <span className="t">{d}s</span>
            <span className="c">{Math.round(surf)} m² carrez</span>
            <span className="c">
              {num(sect[`${prefix}_loyer_retenu`]) !== undefined ? `${fr1(num(sect[`${prefix}_loyer_retenu`])!)} €/m²/mois` : "loyer n.c."}
              {" · "}
              {num(sect[`${prefix}_prix_retenu`]) !== undefined ? `${Math.round(num(sect[`${prefix}_prix_retenu`])!).toLocaleString("fr-FR")} €/m²` : "prix n.c."}
              {" · "}
              {num(sect[`${prefix}_renta_retenu`]) !== undefined ? `${fr1(num(sect[`${prefix}_renta_retenu`])!)} %` : "renta n.c."}
            </span>
            <span className="sp" style={{ flex: 1 }} />
            <EditSecteurBtn b={b} dest={d} poids={poids} />
          </div>
        );
      })}
    </>
  );
}

function EditSecteurBtn({ b, dest, poids }: { b: BienData; dest: string; poids: { dest: string; carrez: number }[] }) {
  const immeubleId = String(b.im._id);
  const sect = b.secteur ?? {};
  const prefix = DEST_PREFIX[dest] ?? "autre";
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [loyer, setLoyer] = useState(S(num(sect[`${prefix}_loyer_retenu`])));
  const [prix, setPrix] = useState(S(num(sect[`${prefix}_prix_retenu`])));
  const [renta, setRenta] = useState(S(num(sect[`${prefix}_renta_retenu`])));
  const [comment, setComment] = useState(S(sect[`${prefix}_commentaire`]));
  const links: [string, string][] = dest === "Commerce"
    ? [["LocalCommercial.net", "https://www.localcommercial.net"], ["UnEmplacement", "https://www.unemplacement.com"]]
    : [["Seloger", `https://www.seloger.com/prix-de-l-immo/vente/${S(b.im.adresse_zipcode)}.htm`], ["Notaires", "https://www.immobilier.notaires.fr/fr/prix-immobilier"]];

  return (
    <>
      <button className="fadd" type="button" onClick={() => setOpen(true)}>Modifier</button>
      {open && (
        <div className="modal-ov" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">Modifier les valeurs du secteur — {dest}s<button type="button" onClick={() => setOpen(false)}>✕</button></div>
            <div className="modal-b">
              <div className="mrow" style={{ marginBottom: 8 }}>
                {links.map(([l, href]) => <a key={l} className="mopt" href={href} target="_blank" rel="noreferrer">{l} ↗</a>)}
              </div>
              <span className="mlab">Loyer du secteur ({dest === "Commerce" ? "€/m²/an ÷ 12 → saisir en €/m²/mois" : "€/m²/mois"})</span>
              <input className="min" value={loyer} onChange={(e) => setLoyer(e.target.value)} />
              <span className="mlab">Prix du secteur (€/m²)</span>
              <input className="min" value={prix} onChange={(e) => setPrix(e.target.value)} />
              <span className="mlab">Rendement du secteur (%)</span>
              <input className="min" value={renta} onChange={(e) => setRenta(e.target.value)} />
              <span className="mlab">Commentaire</span>
              <textarea className="min" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="modal-f">
              <button
                className="kgo" type="button" disabled={pending}
                style={pending ? { opacity: 0.5 } : undefined}
                onClick={() =>
                  start(async () => {
                    await saveSecteurDest(
                      immeubleId,
                      b.secteur ? String(b.secteur._id ?? "") || null : null,
                      dest,
                      { loyer: parse(loyer), prix: parse(prix), renta: parse(renta), commentaire: comment || undefined },
                      poids,
                    );
                    setOpen(false);
                  })
                }
              ><span className="ch">›</span> Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Conteneur ---------- */

export function EmplacementTabs({ b }: { b: BienData }) {
  const [tab, setTab] = useState<"adresse" | "parcelles" | "secteur">("adresse");
  return (
    <>
      <div className="ftabs">
        {([["adresse", "Adresse"], ["parcelles", "Parcelles et PLU"], ["secteur", "Prix du secteur"]] as const).map(([k, l]) => (
          <button key={k} type="button" className={`ftab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "adresse" && <AdresseTab b={b} />}
      {tab === "parcelles" && <ParcellesTab b={b} />}
      {tab === "secteur" && <SecteurTab b={b} />}
    </>
  );
}
