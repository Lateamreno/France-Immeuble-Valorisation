import { listOperations } from "@/lib/bubble/server";
import { DecoupeDashboard } from "@/components/decoupe";

export const dynamic = "force-dynamic";

export default async function DecoupePage() {
  const operations = await listOperations().catch(() => []);
  return <DecoupeDashboard operations={operations} />;
}
