import Link from "next/link";
import { BienFiche } from "@/components/bien-fiche";
import { getBien, getOperation, getPrixSecteur } from "@/lib/bubble/server";
import { mailConfigure } from "@/lib/bo/mail";

export const dynamic = "force-dynamic";
// L'estimation se fait maintenant depuis la fiche : la fabrication du dossier
// PDF passe donc par cette route, et le navigateur met quelques secondes à
// démarrer à froid (retour #125).
export const maxDuration = 60;

export default async function BienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data = null;
  let err: string | null = null;
  try {
    data = await getBien(id);
  } catch (e) {
    err = e instanceof Error ? e.message : "erreur";
  }
  // L'opération de découpe, s'il y en a une : elle ajoute une section au rail.
  // Le prix du secteur voyage avec la fiche : l'estimation s'ouvre DANS la
  // page, il faut donc qu'il soit déjà là quand on clique (retour #125).
  const [operation, secteur] = data
    ? await Promise.all([getOperation(id).catch(() => null), getPrixSecteur(id).catch(() => null)])
    : [null, null];

  if (!data) {
    return (
      <div className="wrap">
        <div className="fempty" style={{ paddingTop: 60 }}>
          {err
            ? `Lecture des données indisponible (${err}).`
            : "Immeuble introuvable — ou aucune source de données configurée (SUPABASE_SERVICE_ROLE_KEY / BUBBLE_API_TOKEN) : en mode démonstration, les fiches ne sont pas accessibles."}
          <div style={{ marginTop: 14 }}>
            <Link href="/" className="fbtn">← Retour au dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BienFiche b={data} operation={operation} secteur={secteur} envoiActif={mailConfigure()} />
  );
}
