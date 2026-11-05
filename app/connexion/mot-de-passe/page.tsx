import { ChoixMotDePasse } from "@/components/connexion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mot de passe · France Immeuble" };

/** Où mène le lien de l'e-mail : choisir son mot de passe (première connexion ou oubli). */
export default async function PageMotDePasse({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <ChoixMotDePasse jeton={t ?? ""} />;
}
