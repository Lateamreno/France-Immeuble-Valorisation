import { redirect } from "next/navigation";
import { compteCourant } from "@/lib/auth/comptes";
import { Connexion } from "@/components/connexion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion · France Immeuble" };

/** La porte du BO (MAV, 27/10 : « que chacun ait son mot de passe »). */
export default async function PageConnexion({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  if (await compteCourant()) redirect("/");
  const { suite } = await searchParams;
  return <Connexion suite={suite} />;
}
