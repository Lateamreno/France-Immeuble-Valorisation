import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

// Données lues à la requête (RLS Supabase), jamais prérendu au build.
export const dynamic = "force-dynamic";

type ListingRow = {
  id: string;
  titre: string | null;
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  nb_lots: number | null;
  status: string | null;
  category: string | null;
};

async function getListings(): Promise<{ rows: ListingRow[]; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("listings")
      .select("id, titre, adresse, ville, code_postal, nb_lots, status, category")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as ListingRow[], error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}

export default async function ImmeublesPage() {
  const { rows, error } = await getListings();

  return (
    <>
      <PageHeader
        title="Immeubles & lots"
        subtitle="Les biens en opération, lus depuis la table listings de Plein Bail. Un immeuble = un listing ; ses lots et l'état locatif vivent dans listing_lots."
        milestone="M2"
      />

      {error && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          Lecture Supabase indisponible ({error}). Vérifie les variables
          d&apos;environnement et la RLS.
        </div>
      )}

      {!error && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700">
          <p className="text-sm font-medium">Aucun immeuble visible</p>
          <p className="mt-1 text-sm text-slate-500">
            Normal à ce stade : Plein Bail ne contient que des annonces de test,
            et la RLS peut masquer les non publiées.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3 font-medium">Bien</th>
                <th className="px-4 py-3 font-medium">Ville</th>
                <th className="px-4 py-3 font-medium">Lots</th>
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {r.titre || r.adresse || "Sans titre"}
                    </div>
                    {r.category && (
                      <div className="text-xs text-slate-500">{r.category}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {[r.code_postal, r.ville].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {r.nb_lots ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {r.status || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
