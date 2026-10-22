"use server";

// Le panneau « Son compte sur le site » de la fiche contact (contrat §9.6) :
// ce que voit le client, relu dans la base du site, et un geste pour le
// redéposer. Rien ici n'écrit vers le client autrement que par le dépôt.

import { revalidatePath } from "next/cache";
import { deposerCompte, lireCompteSurLeSite, type LignesCompte } from "@/lib/bo/compte-site";

const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type VueCompte = {
  compte: string | null;
  rattacheLe?: string;
  depotLe?: string;
  erreur?: string;
  lignes: LignesCompte | null;
};

export async function voirCompteSite(contactId: string): Promise<VueCompte> {
  if (!BO_KEY) return { compte: null, lignes: null };
  const res = await fetch(`${BO_URL}/rest/v1/bo_contact?select=data&id=eq.${encodeURIComponent(contactId)}`, {
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  });
  const [c] = res.ok ? ((await res.json()) as { data: Record<string, unknown> }[]) : [];
  const compte = typeof c?.data.site_compte === "string" ? c.data.site_compte : null;
  if (!compte) return { compte: null, lignes: null };
  return {
    compte,
    rattacheLe: typeof c.data.site_compte_le === "string" ? c.data.site_compte_le : undefined,
    depotLe: typeof c.data.site_compte_depot_le === "string" ? c.data.site_compte_depot_le : undefined,
    erreur: typeof c.data.site_compte_erreur === "string" ? c.data.site_compte_erreur : undefined,
    lignes: await lireCompteSurLeSite(compte),
  };
}

export async function redeposerCompteSite(contactId: string) {
  const r = await deposerCompte(contactId);
  revalidatePath(`/contact/${contactId}`);
  return r;
}
