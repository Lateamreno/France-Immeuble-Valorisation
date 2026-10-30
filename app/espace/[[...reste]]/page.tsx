import { COMPTE_SITE_URL } from "@/lib/site-public";

/* Rendue à la demande, jamais figée au build : la mise en page racine lit le
   chemin dans un en-tête pour retirer le rail du BO, et une page statique n'en
   a pas — le client verrait le menu des agents. */
export const dynamic = "force-dynamic";

/**
 * L'ancien espace client du BO, fermé le 22/10 (contrat §9.7, décision MAV :
 * limiter les risques de fuite). Le compte client vit désormais sur le site
 * France Immeuble ; toute ancienne adresse mène ici, et d'ici au site.
 */
export default function EspaceFerme() {
  return (
    <main style={{ maxWidth: 520, margin: "80px auto", padding: "0 16px", fontFamily: "var(--font-body)", color: "var(--slate)", lineHeight: 1.6 }}>
      <h1 style={{ fontFamily: "var(--font-title)", fontSize: 22 }}>Votre espace a déménagé</h1>
      <p>
        Votre compte France Immeuble se trouve désormais sur notre site. Vous y retrouvez vos recherches,
        les biens qui vous ont été proposés et le suivi de vos immeubles.
      </p>
      <p><a href={COMPTE_SITE_URL} style={{ color: "var(--slate)", fontWeight: 700 }}>Accéder à mon compte</a></p>
    </main>
  );
}
