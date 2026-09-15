import { listOperations } from "@/lib/bubble/server";
import { DecoupeDashboard } from "@/components/decoupe";

export const dynamic = "force-dynamic";

// La liste complète reprend le même écran, clôturées comprises : deux vues du
// même objet ne justifient pas deux composants.
export default async function OperationsPage() {
  const operations = await listOperations().catch(() => []);
  return <DecoupeDashboard operations={operations} toutes />;
}
