import { redirect } from "next/navigation";
import { ChangerMotDePasse } from "@/components/connexion";
import { compteCourant } from "@/lib/auth/comptes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon mot de passe · France Immeuble" };

/** Chacun change le sien quand il veut, y compris celui posé par la direction (MAV, 27/10). */
export default async function PageMonMotDePasse() {
  const c = await compteCourant();
  if (!c) redirect("/connexion?suite=%2Fmot-de-passe");
  return (
    <div className="lst-page">
      <h1 className="lst-title">Mon mot de passe</h1>
      <p className="rgl-aide">Connecté en tant que {c.email}.</p>
      <ChangerMotDePasse />
    </div>
  );
}
