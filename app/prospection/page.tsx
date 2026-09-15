import { Prospection } from "@/components/prospection";

export const dynamic = "force-dynamic";
/* L'export avec sièges sociaux interroge l'annuaire des entreprises société
   par société : il lui faut plus que les quinze secondes par défaut. */
export const maxDuration = 60;

/**
 * Prospection en dur.
 *
 * Les Recherches sont la demande qui vient à nous ; ceci est l'offre qu'on va
 * chercher. La base ne contient que des immeubles détenus par une société et
 * pas en copropriété — la cible de la découpe, et rien d'autre.
 */
export default function ProspectionPage() {
  return (
    <div className="lst-page">
      <h1 className="lst-title">Prospection</h1>
      <p className="lst-sous">
        356 082 immeubles détenus par une société et <b>pas en copropriété</b>, sur toute la France —
        bailleurs sociaux et personnes publiques écartés. Sources publiques : fichier des locaux
        des personnes morales (DGFiP, millésime 2024) et registre national d&apos;immatriculation
        des copropriétés (ANAH).
      </p>
      <Prospection />
    </div>
  );
}
