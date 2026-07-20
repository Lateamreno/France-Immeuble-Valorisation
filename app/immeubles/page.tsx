import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";

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
    <div className="content panel">
      <PageHeader
        title="Immeubles & lots"
        subtitle="Les biens en opération, lus depuis la table listings de Plein Bail. Un immeuble = un listing ; ses lots et l'état locatif vivent dans listing_lots."
        milestone="M2"
      />

      {error && (
        <div className="empty" style={{ color: "var(--gold-lum)", borderColor: "var(--gold-line)" }}>
          Lecture Supabase indisponible ({error}).
        </div>
      )}

      {!error && rows.length === 0 && (
        <div className="empty">
          <p style={{ fontWeight: 600, color: "var(--sub)", margin: 0 }}>Aucun immeuble visible</p>
          <p style={{ marginTop: 6, fontSize: 13 }}>
            Normal à ce stade : Plein Bail ne contient que des annonces de test,
            et la RLS peut masquer les non publiées.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card">
          <table className="lots">
            <thead>
              <tr><th>Bien</th><th>Ville</th><th>Lots</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="lotn">
                      <span className="ic">
                        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6}><path d="M3 21h18M5 21V8l7-4 7 4v13"/></svg>
                      </span>
                      <b>{r.titre || r.adresse || "Sans titre"}</b>
                    </span>
                  </td>
                  <td className="num">{[r.code_postal, r.ville].filter(Boolean).join(" ") || "—"}</td>
                  <td className="num">{r.nb_lots ?? 0}</td>
                  <td><span className="stt occ"><i /> {r.status || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
