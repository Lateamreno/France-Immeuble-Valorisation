"use server";

/* L'étude de découpe (MAV, 15/11/26) : ce que l'agent règle — références
 * écartées, rendements types, forfaits des annexes — est gardé sur la fiche,
 * dans `etude_decoupe`. Le calcul, lui, se refait à chaque ouverture. */

import { compteCourant } from "@/lib/auth/comptes";
import { AJUSTEMENT_MAX, AJUSTEMENTS, type AjustementsLot, type ReglagesEtude } from "@/lib/bo/etude-decoupe";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const nettoyer = (r: ReglagesEtude): ReglagesEtude => {
  const motifs = (o: Record<string, string>) => Object.fromEntries(
    Object.entries(o ?? {}).filter(([k]) => typeof k === "string" && k.length < 80).slice(0, 2000)
      .map(([k, v]) => [k, String(v ?? "").slice(0, 60)]),
  );
  const nombres = (o: Record<string, number>) => Object.fromEntries(
    Object.entries(o ?? {}).filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 10_000_000),
  );
  return {
    ventesExclues: motifs(r.ventesExclues),
    immeublesExclus: motifs(r.immeublesExclus),
    reprises: (r.reprises ?? []).filter((x) => typeof x === "string").slice(0, 2000),
    rendements: nombres(r.rendements),
    forfaits: nombres(r.forfaits as Record<string, number>),
    lots: Object.fromEntries(Object.entries(r.lots ?? {}).filter(([k]) => k.length < 80).slice(0, 500).map(([k, a]) => {
      const propre: AjustementsLot = {};
      for (const { cle } of AJUSTEMENTS) {
        const v = a?.[cle];
        if (typeof v === "number" && Number.isFinite(v) && v !== 0) propre[cle] = Math.max(-AJUSTEMENT_MAX, Math.min(AJUSTEMENT_MAX, v));
      }
      if (typeof a?.note === "string" && a.note.trim()) propre.note = a.note.trim().slice(0, 120);
      return [k, propre];
    }).filter(([, a]) => Object.keys(a as object).length > 0)),
  };
};

/** Enregistre les réglages de l'étude sur la fiche de l'immeuble. */
export async function enregistrerReglagesEtude(immeubleId: string, reglages: ReglagesEtude): Promise<{ ok: boolean }> {
  if (!SB_KEY || !/^[\w-]+$/.test(immeubleId)) return { ok: false };
  if (!(await compteCourant()) && process.env.BO_AUTH?.trim().toLowerCase() === "on") return { ok: false };
  const r = await fetch(`${SB_URL}/rest/v1/rpc/bo_patch_doc`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_table: "bo_immeuble", p_id: immeubleId, p_patch: { etude_decoupe: nettoyer(reglages) } }),
    cache: "no-store",
  }).catch(() => null);
  return { ok: !!r?.ok };
}
