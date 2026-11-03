import { ReponseClient } from "@/components/reponse-client";
import { propositionPourReponse, signatureValide } from "@/lib/bo/reponse-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Votre réponse · France Immeuble", robots: { index: false } };

/** Le lien « Intéressé / Pas intéressé » des e-mails (MAV, 02/11). Ouvrir la
 *  page ne change rien — les messageries suivent les liens pour les vérifier,
 *  un « Pas intéressé » ne doit pas partir tout seul : c'est le bouton qui
 *  répond. */
export default async function PageReponse({ searchParams }: { searchParams: Promise<{ p?: string; r?: string; s?: string }> }) {
  const { p = "", r = "", s = "" } = await searchParams;
  const valide = signatureValide(p, r, s);
  const prop = valide ? await propositionPourReponse(p).catch(() => null) : null;
  return <ReponseClient p={p} r={r === "non" ? "non" : "oui"} s={s} titre={prop?.titre} reconnu={valide && !!prop} />;
}
