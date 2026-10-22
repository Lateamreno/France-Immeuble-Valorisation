// L'état locatif en version imprimable — et source du PDF joint aux e-mails
// de commercialisation (retour #359, option C retenue par MAV).
//
// MAV : « on va surement générer automatiquement dans l'état locatif actuel
// mais qu'on pourra aussi peut être faire de façon excel ». C'est la branche
// automatique : le tableau des lots tel que la fiche le connaît, donc toujours
// à jour, sans ressaisie.
//
// GARDE-FOU §8.3 — RGPD locataires, risque n°1 du projet. Ce document PART
// CHEZ DES ACQUÉREURS. Aucun nom de locataire, aucune coordonnée, aucune
// référence de bail nominative n'y figure : seulement la NATURE du preneur
// (personne physique ou morale), le loyer et les dates. C'est exactement la
// même frontière que celle tenue vers Plein Bail dans lib/diffusion.ts.
import Link from "next/link";
import { getBien } from "@/lib/bubble/server";
import { BarreImpression } from "@/components/barre-impression";
import { situationLot } from "@/lib/referentiels";

export const dynamic = "force-dynamic";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/* Un loyer de ZÉRO est une absence de loyer, pas un loyer nul : sur une cave
   rattachée à un appartement, « 0 € » se lit comme un prix cassé. Même
   raisonnement que les surfaces à zéro côté Plein Bail. */
const eur = (v: unknown) => {
  const n = N(v);
  return n === undefined || n === 0 ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`;
};
/* Sauf sur les totaux, où un zéro est un vrai résultat de somme. */
const eurTotal = (v: unknown) => `${Math.round(N(v) ?? 0).toLocaleString("fr-FR")} €`;
const m2 = (v: unknown) => {
  const n = N(v);
  return n === undefined || n <= 0 ? "—" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m²`;
};

export default async function ImprimerEtatLocatif({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nu?: string }>;
}) {
  const { id } = await params;
  const { nu } = await searchParams;
  const b = await getBien(id).catch(() => null);
  if (!b) {
    return (
      <div style={{ padding: 40 }}>
        Immeuble introuvable. <Link href={`/bien/${id}`}>← Retour à la fiche</Link>
      </div>
    );
  }

  const lots = [...b.lots].sort((x, y) => {
    const nx = Number(x.numero), ny = Number(y.numero);
    if (Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
    return S(x.numero).localeCompare(S(y.numero), "fr", { numeric: true });
  });

  const totalCarrez = lots.reduce((s, l) => s + (N(l.surface_carrez) ?? 0), 0);
  const loyerMois = lots.reduce((s, l) => s + (N(l.loyer) ?? 0), 0);
  const loyerMaxMois = lots.reduce((s, l) => s + (N(l.loyer_max) ?? N(l.loyer) ?? 0), 0);
  /* Trois situations, pas deux. « Rattaché à un lot » — une cave ou un parking
     qui suit son appartement — n'est ni loué ni vacant : le compter parmi les
     occupés gonfle le taux d'occupation, le compter parmi les libres fait
     croire à de la vacance à relouer. Sur le 55 rue Volant, douze lots sur
     vingt-neuf sont dans ce cas. */
  const sit = lots.map((l) => situationLot(l.Type_bail));
  const occupes = sit.filter((x) => x === "loue").length;
  const libres = sit.filter((x) => x === "libre").length;
  const rattaches = sit.filter((x) => x === "rattache").length;

  return (
    <>
      {nu !== "1" && <BarreImpression retour={`/bien/${id}`}>État locatif</BarreImpression>}
      <div className="el-page">
        <header className="el-h">
          <div>
            <h1>État locatif</h1>
            <p className="el-adr">
              {b.adresse ? `${b.adresse} — ` : ""}{b.ville}
            </p>
          </div>
          <div className="el-marque">
            <b>France Immeuble</b>
            <span>Édité le {new Date().toLocaleDateString("fr-FR")}</span>
          </div>
        </header>

        <div className="el-synth">
          <div><b>{lots.length}</b><span>lots</span></div>
          <div><b>{occupes}</b><span>loués</span></div>
          <div><b>{libres}</b><span>libres</span></div>
          {rattaches > 0 && <div><b>{rattaches}</b><span>rattachés à un lot</span></div>}
          <div><b>{m2(totalCarrez)}</b><span>surface Carrez</span></div>
          <div><b>{eurTotal(loyerMois * 12)}</b><span>loyers annuels HC</span></div>
          {loyerMaxMois > loyerMois && (
            <div><b>{eurTotal(loyerMaxMois * 12)}</b><span>au potentiel</span></div>
          )}
        </div>

        <table className="el-t">
          <thead>
            <tr>
              <th>Lot</th>
              <th>Destination</th>
              <th>Type</th>
              <th>Étage</th>
              <th className="n">Carrez</th>
              <th>État</th>
              <th>Bail</th>
              <th>Preneur</th>
              <th className="n">Loyer HC / mois</th>
              <th className="n">Loyer de marché</th>
              <th>DPE</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l, i) => {
              const bail = S(l.Type_bail);
              const situation = situationLot(l.Type_bail);
              const loue = situation === "loue";
              return (
                <tr key={S(l._id) || i} className={loue ? undefined : "libre"}>
                  <td>{S(l.numero) || "—"}</td>
                  <td>{S(l.Destination) || "—"}</td>
                  <td>{S(l.Type_lot) || "—"}</td>
                  <td>{S(l.etage) || "—"}</td>
                  <td className="n">{m2(l.surface_carrez)}</td>
                  <td>{S(l.Etat) || "—"}</td>
                  <td>{loue ? (bail || "Bail") : situation === "rattache" ? "Rattaché" : "Libre"}</td>
                  {/* RGPD : la NATURE du preneur, jamais son nom. */}
                  <td>{loue ? (S(l.locataire_nature) === "personne_morale" ? "Personne morale" : "Personne physique") : "—"}</td>
                  <td className="n">{loue ? eur(l.loyer) : "—"}</td>
                  <td className="n">{eur(l.loyer_max ?? l.loyer)}</td>
                  <td>{S(l.Type_dpe) || "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total — {lots.length} lots</td>
              <td className="n">{m2(totalCarrez)}</td>
              <td colSpan={3} />
              <td className="n">{eurTotal(loyerMois)}</td>
              <td className="n">{eurTotal(loyerMaxMois)}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        <p className="el-pied">
          Document établi par France Immeuble à partir de l&apos;état locatif communiqué par le
          vendeur. Les noms et coordonnées des locataires ne sont pas communiqués à ce stade ;
          les baux, caviardés, sont consultables sur demande dans le cadre d&apos;une offre.
          {" "}Loyers hors charges. Surfaces Carrez : les caves, parkings et annexes se comptent
          au lot et n&apos;entrent pas dans le total.
        </p>
      </div>
    </>
  );
}
