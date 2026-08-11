// Version imprimable du dossier complet (→ PDF via impression navigateur).
// Structure du PDF du BO : page de garde chiffrée, emplacement, état
// technique, état locatif lot par lot. Les prix sont figés dans le dossier ;
// les tableaux reflètent l'état courant de la fiche.
import Link from "next/link";
import { getBien } from "@/lib/bubble/server";
import { euros } from "@/lib/format";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const fr1 = (x: number) => x.toFixed(1).replace(".", ",");

export default async function ImprimerDossier({
  params,
}: {
  params: Promise<{ id: string; did: string }>;
}) {
  const { id, did } = await params;
  const b = await getBien(id).catch(() => null);
  const d = b?.dossiers.find((x) => String(x._id) === did);
  if (!b || !d) {
    return (
      <div style={{ padding: 40 }}>
        Dossier introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }

  const hai = num(d.prix_hai) ?? 0;
  const surface = num(d.surface) ?? 0;
  const travaux = num(d.travaux) ?? 0;
  const loyersAn = num(d.loyer_hc_an) ?? 0;
  const loyersMaxAn = num(d.loyer_hc_an_max) ?? 0;
  const date = S(d.date ?? d["Created Date"]).slice(0, 10).split("-").reverse().join("/");
  const nbHab = b.lots.filter((l) => l.Destination === "Logement").length;

  return (
    <div className="print-page">
      <div className="noprint pbar">
        <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
        <span>Imprimer cette page (Ctrl/Cmd + P) puis « Enregistrer au format PDF »</span>
      </div>

      <header className="phead">
        <div className="brand">FRANCE IMMEUBLE</div>
        <h1>DOSSIER COMPLET</h1>
        <div className="addr">{S(d.ville)} ({S(d.zipcode)}) · Investissement locatif</div>
        <div className="pdate">V{S(d.version)} — généré le {date} · {d.public === true ? "Public" : "Privé"}</div>
      </header>

      <section className="pprice">
        <div className="lab">Prix honoraires inclus</div>
        <div className="big">{euros(hai)}</div>
        <div className="sub">
          {surface > 0 ? `${Math.round(hai / surface).toLocaleString("fr-FR")} €/m² · ` : ""}
          Rendement brut {hai > 0 && loyersAn > 0 ? `${fr1((loyersAn / hai) * 100)} %` : "—"}
          {loyersMaxAn > loyersAn && hai > 0 ? ` – ${fr1((loyersMaxAn / (hai + travaux)) * 100)} %` : ""}
          {travaux > 0 ? ` · + ${euros(travaux)} de travaux` : ""}
        </div>
      </section>

      <section>
        <h2>Synthèse</h2>
        <table className="ptable">
          <tbody>
            <tr><td>Surface Carrez</td><td>{Math.round(surface)} m²</td></tr>
            <tr><td>Lots</td><td>{b.lots.length}{nbHab ? ` dont ${nbHab} logements` : ""}</td></tr>
            <tr><td>Occupation</td><td>{S(d.occupation)} %</td></tr>
            <tr><td>Loyers actuels</td><td>{euros(loyersAn)}/an HC</td></tr>
            <tr><td>Loyers potentiels</td><td>{euros(loyersMaxAn)}/an HC</td></tr>
            {num(b.im.year_constru) && <tr><td>Construction</td><td>{S(b.im.year_constru)}</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Emplacement</h2>
        <table className="ptable">
          <tbody>
            <tr><td>Adresse</td><td>{[S(b.im.adresse_numero_rue), S(b.im.adresse_rue)].filter(Boolean).join(" ")}, {S(b.im.adresse_zipcode)} {S(b.im.adresse_ville)}</td></tr>
            {S(b.im.emp_gare_name) && <tr><td>Trains</td><td>{S(b.im.emp_gare_name)} — {S(b.im.emp_gare_time)} min {S(b.im.emp_gare_moyen)}</td></tr>}
            {S(b.im.emp_bus_name) && <tr><td>Bus</td><td>{S(b.im.emp_bus_name)} — {S(b.im.emp_bus_time)} min {S(b.im.emp_bus_moyen)}</td></tr>}
            {S(b.im.emp_route_name) && <tr><td>Axes routiers</td><td>{S(b.im.emp_route_name)}</td></tr>}
            {S(b.im.emp_school_name) && <tr><td>Écoles</td><td>{S(b.im.emp_school_name)}</td></tr>}
            {S(b.im.emp_com_name) && <tr><td>Commerces</td><td>{S(b.im.emp_com_name)}</td></tr>}
            {num(b.im.emp_population) && <tr><td>Habitants (INSEE)</td><td>{(b.im.emp_population as number).toLocaleString("fr-FR")}</td></tr>}
            {num(b.im.emp_revenus) && <tr><td>Revenus médian (INSEE)</td><td>{euros(b.im.emp_revenus)}/an</td></tr>}
            {S(b.im.emp_tension_locative) && <tr><td>Tension locative (LOCservice)</td><td>{S(b.im.emp_tension_locative)}</td></tr>}
          </tbody>
        </table>
      </section>

      {(b.composants.length > 0 || b.travaux.length > 0) && (
        <section>
          <h2>État technique</h2>
          {b.composants.length > 0 && (
            <table className="ptable">
              <tbody>
                {b.composants.map((c) => (
                  <tr key={String(c._id)}>
                    <td>{S(c.Type_composant)}</td>
                    <td>{[S(c["Type_matériau"]), S(c.Etat), num(c.renov_year) ? `rénové ${c.renov_year}` : ""].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {b.travaux.length > 0 && (
            <>
              <h2 style={{ fontSize: 13.5 }}>Travaux à prévoir ({euros(travaux) ?? "0 €"})</h2>
              <table className="ptable">
                <tbody>
                  {b.travaux.map((t) => (
                    <tr key={String(t._id)}>
                      <td>{S(t.description) || "Travaux"}</td>
                      <td>{[S(t.Urgence) ? `Urgence ${S(t.Urgence).toLowerCase()}` : "", t.YN_devis === true ? "devis reçu" : "", euros(t.montant) ?? ""].filter(Boolean).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      <section>
        <h2>État locatif</h2>
        <table className="ptable" style={{ fontSize: 12.5 }}>
          <thead>
            <tr style={{ fontWeight: 700 }}>
              <td>n°</td><td>Type</td><td>Carrez</td><td>DPE</td><td>État</td><td>Bail</td><td>HC/mois</td><td>Potentiel</td>
            </tr>
          </thead>
          <tbody>
            {b.lots.map((l) => (
              <tr key={String(l._id)}>
                <td>{S(l.numero)}</td>
                <td style={{ fontWeight: 400 }}>{S(l.Type_lot) || S(l.Destination)}</td>
                <td style={{ fontWeight: 400 }}>{num(l.surface_carrez) ? `${l.surface_carrez} m²` : "—"}</td>
                <td style={{ fontWeight: 400 }}>{S(l.Type_dpe) || "n.c."}</td>
                <td style={{ fontWeight: 400 }}>{S(l.Etat) || "n.c."}</td>
                <td style={{ fontWeight: 400 }}>{S(l.Type_bail) || "n.c."}</td>
                <td style={{ fontWeight: 400 }}>{euros(l.loyer) ?? "—"}</td>
                <td style={{ fontWeight: 400 }}>{euros(l.loyer_max) ?? "—"}</td>
              </tr>
            ))}
            <tr>
              <td>Total</td><td /><td>{Math.round(surface)} m²</td><td /><td /><td />
              <td>{euros(Math.round(loyersAn / 12))}/mois</td>
              <td>{euros(loyersAn)}/an</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 10.5, color: "var(--gray-lt)", marginTop: 4 }}>
          * Potentiel estimé à partir des loyers du secteur, de l&apos;encadrement des loyers et des indices de révision.
        </div>
      </section>

      <footer className="pfoot">
        <span>France Immeuble — spécialiste de l&apos;immeuble de rapport</span>
        <span>V{S(d.version)} · {date} · Document {d.public === true ? "public" : "confidentiel"}</span>
      </footer>
    </div>
  );
}
