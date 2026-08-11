// Version imprimable de l'estimation (→ PDF via impression navigateur).
// Reproduit la structure du PDF d'estimation du BO : page de garde chiffrée,
// synthèse locative, secteur, prix, analyse.
import Link from "next/link";
import { getEstimation } from "@/lib/bubble/server";
import { euros } from "@/lib/format";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const fr1 = (x: number) => x.toFixed(1).replace(".", ",");

export default async function ImprimerEstimation({
  params,
}: {
  params: Promise<{ id: string; eid: string }>;
}) {
  const { id, eid } = await params;
  const e = await getEstimation(eid);
  if (!e || e.IMMEUBLE !== id) {
    return (
      <div style={{ padding: 40 }}>
        Estimation introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }

  const hai = num(e.prix_hai) ?? 0;
  const loyers = num(e.imm_loyer_hc_tot) ?? 0;
  const loyersMax = num(e.imm_loyer_hc_max_tot) ?? 0;
  const charges = num(e.charges_tot_non_recup) ?? 0;
  const travaux = num(e.travaux_tot) ?? 0;
  const carrez = num(e.imm_carrez_tot_tot) ?? 0;
  const nv = Math.round(hai / 1.05);
  const date = S(e["Created Date"]).slice(0, 10).split("-").reverse().join("/");

  return (
    <div className="print-page">
      <div className="noprint pbar">
        <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
        <span>Imprimer cette page (Ctrl/Cmd + P) puis « Enregistrer au format PDF »</span>
      </div>

      <header className="phead">
        <div className="brand">FRANCE IMMEUBLE</div>
        <h1>{S(e.titre) || "Estimation"}</h1>
        <div className="addr">
          {[S(e["adresse_numéro_rue"]), S(e.adresse_rue)].filter(Boolean).join(" ")} ·{" "}
          {S(e.adresse_zipcode)} {S(e.adresse_ville)}
        </div>
        <div className="pdate">Établie le {date}</div>
      </header>

      <section className="pprice">
        <div className="lab">Valeur estimée honoraires inclus</div>
        <div className="big">{euros(hai)}</div>
        <div className="sub">soit un net vendeur de {euros(nv)} (honoraires 5,0 % charge vendeur)</div>
      </section>

      <section>
        <h2>Synthèse de l&apos;immeuble</h2>
        <table className="ptable">
          <tbody>
            <tr><td>Nombre de lots</td><td>{S(e.imm_nb_lots_tot)} ({[num(e.imm_nb_lots_hab) ? `${e.imm_nb_lots_hab} logements` : "", num(e.imm_nb_lots_com) ? `${e.imm_nb_lots_com} commerces` : ""].filter(Boolean).join(", ") || "—"})</td></tr>
            <tr><td>Surface Carrez totale</td><td>{Math.round(carrez)} m²</td></tr>
            <tr><td>Occupation</td><td>{S(e.imm_occupation)} %</td></tr>
            <tr><td>Loyers actuels</td><td>{euros(loyers)}/an hors charges</td></tr>
            <tr><td>Loyers potentiels</td><td>{euros(loyersMax)}/an hors charges</td></tr>
            <tr><td>Charges non récupérables</td><td>{charges > 0 ? `${euros(charges)}/an` : "n.c."}</td></tr>
            <tr><td>Travaux à prévoir</td><td>{euros(travaux) ?? "0 €"}</td></tr>
            {S(e.emp_gare_name) && <tr><td>Gare</td><td>{S(e.emp_gare_name)} — {S(e["emp_gare_durée"])} min</td></tr>}
            {S(e.emp_com_name) && <tr><td>Commerces</td><td>{S(e.emp_com_name)} — {S(e["emp_com_durée"])} min</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Marché du secteur</h2>
        <table className="ptable">
          <tbody>
            <tr><td>Loyer du secteur</td><td>{S(e.ref_loyer_all) || "n.c."} €/m²/mois</td></tr>
            <tr><td>Prix du secteur</td><td>{num(e.ref_prix_all) ? `${Math.round(num(e.ref_prix_all)!).toLocaleString("fr-FR")} €/m²` : "n.c."}</td></tr>
            <tr><td>Rendement du secteur</td><td>{S(e.ref_renta_all) || "n.c."} %</td></tr>
            <tr><td>Prix au m² retenu</td><td>{carrez > 0 ? `${Math.round(hai / carrez).toLocaleString("fr-FR")} €/m²` : "—"}</td></tr>
            <tr><td>Rendement brut au prix estimé</td><td>{hai > 0 ? `${fr1((loyers / hai) * 100)} %` : "—"}{hai > 0 && loyersMax > loyers ? ` (potentiel ${fr1((loyersMax / (hai + travaux)) * 100)} %)` : ""}</td></tr>
          </tbody>
        </table>
      </section>

      {S(e.analyse) && (
        <section>
          <h2>Notre analyse</h2>
          <p className="panalyse">{S(e.analyse)}</p>
        </section>
      )}

      <footer className="pfoot">
        <span>France Immeuble — spécialiste de l&apos;immeuble de rapport</span>
        <span>Estimation indicative, ne vaut pas expertise. Honoraires charge vendeur.</span>
      </footer>
    </div>
  );
}
