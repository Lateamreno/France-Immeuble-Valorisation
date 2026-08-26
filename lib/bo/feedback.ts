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
  /** Coin haut-gauche de la zone si w_pct/h_pct sont renseignés,
   *  centre de l'épingle sinon (retours antérieurs au tracé rectangulaire). */
  x_pct: number | null;
  y_pct: number | null;
  w_pct: number | null;
  h_pct: number | null;
  gravite: "bloquant" | "ecart" | "detail" | "idee";
  commentaire: string;
  capture_path: string | null;
  /** Toutes les captures du retour ; `capture_path` est la première. */
  captures: string[] | null;
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

/** Dépose une capture dans le coffre et rend son chemin. */
async function deposerCapture(f: File): Promise<string> {
  if (f.size > 10 * 1024 * 1024) throw new Error(`« ${f.name || "capture"} » dépasse 10 Mo.`);
  const ext = (f.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
  const chemin = `feedback/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await fetch(`${SB_URL}/storage/v1/object/bo-files/${chemin}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": f.type || "image/png",
      "x-upsert": "true",
    },
    body: Buffer.from(await f.arrayBuffer()),
  });
  if (!up.ok) throw new Error(`Upload capture ${up.status}`);
  return chemin;
}

/**
 * Enregistre un retour, avec autant de captures qu'il en faut.
 *
 * Une seule était acceptée, et MAV en avait souvent plusieurs à montrer pour
 * un même écart — il devait alors ouvrir deux retours pour une seule remarque.
 * `capture_path` reste renseigné avec la première : les 62 retours déjà
 * enregistrés continuent de s'afficher sans reprise.
 */
export async function addFeedback(fd: FormData) {
  const fichiers = fd.getAll("capture").filter((c): c is File => c instanceof File && c.size > 0);
  // Déposées ensemble : trois captures ne doivent pas coûter trois attentes.
  const captures = await Promise.all(fichiers.map(deposerCapture));
  const capture_path = captures[0] ?? null;

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
      w_pct: num("w_pct"),
      h_pct: num("h_pct"),
      viewport_w: num("viewport_w"),
      gravite: str("gravite") ?? "ecart",
      commentaire: str("commentaire") ?? "",
      capture_path,
      captures: captures.length ? captures : null,
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

/**
 * Corrige un retour déjà posé (retour #140).
 *
 * MAV : « dans les retours je veux une option avec un crayon pour modifier le
 * texte ou ajouter une image ». Un retour se précise après coup — on se relit,
 * on retrouve la capture qui manquait. Les captures s'AJOUTENT : celles déjà
 * déposées ne sont jamais remplacées à l'aveugle.
 */
export async function modifierFeedback(fd: FormData) {
  const id = Number(fd.get("id"));
  if (!Number.isFinite(id)) throw new Error("Retour introuvable.");

  const commentaire = String(fd.get("commentaire") ?? "").trim();
  const gravite = String(fd.get("gravite") ?? "");
  const fichiers = fd.getAll("capture").filter((c): c is File => c instanceof File && c.size > 0);
  const neuves = await Promise.all(fichiers.map(deposerCapture));

  const patch: Record<string, unknown> = {};
  if (commentaire) patch.commentaire = commentaire;
  if (["bloquant", "ecart", "detail", "idee"].includes(gravite)) patch.gravite = gravite;

  if (neuves.length) {
    const res = await sb(`bo_feedback?id=eq.${id}&select=captures,capture_path`).catch(() => null);
    const rows = res ? ((await res.json()) as { captures: string[] | null; capture_path: string | null }[]) : [];
    const avant = rows[0]?.captures ?? (rows[0]?.capture_path ? [rows[0].capture_path] : []);
    const toutes = [...avant, ...neuves];
    patch.captures = toutes;
    patch.capture_path = toutes[0];
  }

  if (!Object.keys(patch).length) return;
  await sb(`bo_feedback?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  revalidatePath("/revue");
}

/** Supprime un retour (erreur de saisie). */
export async function deleteFeedback(id: number) {
  await sb(`bo_feedback?id=eq.${id}`, { method: "DELETE" });
  revalidatePath("/revue");
}
