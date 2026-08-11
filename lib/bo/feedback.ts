"use server";

// Mode Revue — retours de recette posés directement sur les écrans.
// Stockage dans le projet Supabase dédié (table bo_feedback + bucket bo-files).
import { revalidatePath } from "next/cache";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type Feedback = {
  id: number;
  created_at: string;
  auteur: string;
  url: string;
  page_titre: string | null;
  selecteur: string | null;
  element_texte: string | null;
  x_pct: number | null;
  y_pct: number | null;
  gravite: "bloquant" | "ecart" | "detail" | "idee";
  commentaire: string;
  capture_path: string | null;
  statut: "ouvert" | "corrige" | "ecarte";
  reponse: string | null;
};

async function sb(path: string, init?: RequestInit) {
  if (!SB_KEY) throw new Error("Stockage des retours indisponible (clé Supabase absente).");
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** Enregistre un retour (avec capture collée optionnelle). */
export async function addFeedback(fd: FormData) {
  const capture = fd.get("capture");
  let capture_path: string | null = null;

  if (capture instanceof File && capture.size > 0) {
    if (capture.size > 10 * 1024 * 1024) throw new Error("Capture trop lourde (10 Mo max).");
    capture_path = `feedback/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const up = await fetch(`${SB_URL}/storage/v1/object/bo-files/${capture_path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": capture.type || "image/png",
        "x-upsert": "true",
      },
      body: Buffer.from(await capture.arrayBuffer()),
    });
    if (!up.ok) throw new Error(`Upload capture ${up.status}`);
  }

  const num = (k: string) => {
    const v = fd.get(k);
    return v === null || v === "" ? null : Number(v);
  };
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" && v !== "" ? v : null;
  };

  await sb("bo_feedback", {
    method: "POST",
    body: JSON.stringify({
      auteur: str("auteur") ?? "MAV",
      url: str("url") ?? "/",
      page_titre: str("page_titre"),
      selecteur: str("selecteur"),
      element_texte: str("element_texte")?.slice(0, 300) ?? null,
      x_pct: num("x_pct"),
      y_pct: num("y_pct"),
      viewport_w: num("viewport_w"),
      gravite: str("gravite") ?? "ecart",
      commentaire: str("commentaire") ?? "",
      capture_path,
    }),
  });
  revalidatePath("/revue");
}

/** Liste les retours (tous, ou d'une page). */
export async function listFeedback(url?: string): Promise<Feedback[]> {
  if (!SB_KEY) return [];
  const q = new URLSearchParams({ select: "*", order: "created_at.desc", limit: "500" });
  if (url) q.append("url", `eq.${url}`);
  const res = await sb(`bo_feedback?${q}`).catch(() => null);
  return res ? ((await res.json()) as Feedback[]) : [];
}

/** Marque un retour corrigé / écarté (avec réponse). */
export async function setFeedbackStatut(
  id: number,
  statut: "ouvert" | "corrige" | "ecarte",
  reponse?: string,
) {
  await sb(`bo_feedback?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      statut,
      reponse: reponse ?? null,
      traite_at: statut === "ouvert" ? null : new Date().toISOString(),
    }),
  });
  revalidatePath("/revue");
}

/** Supprime un retour (erreur de saisie). */
export async function deleteFeedback(id: number) {
  await sb(`bo_feedback?id=eq.${id}`, { method: "DELETE" });
  revalidatePath("/revue");
}
