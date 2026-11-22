"use server";

// Scinder un immeuble en lots à vendre (CLAUDE.md §7.11, étape 2). Le calcul
// est dans lib/bo/scission.ts ; ici, on écrit.
//
// Une fiche par unité de vente (un lot, et les caves ou parkings qui partent
// avec lui). La fiche reçoit sa propre ligne d'état locatif — copie du lot, de
// son bail et de son locataire, chacune gardant le lien vers sa ligne d'origine
// (`origine`) — et se range sous le mandat de l'immeuble : un seul mandat pour
// tous les lots (MAV, 20/11). Rien n'est commercialisé d'office.

import { revalidatePath } from "next/cache";
import { fetchAll } from "@/lib/bubble/server";
import { authActive, compteCourant } from "@/lib/auth/comptes";
import { invaliderTable } from "@/lib/bo/cache-tables";
import { mandatEnVigueur } from "@/lib/diffusion";
import {
  concerne, copiePour, docFicheLot, ficheDeLUnite, ficheLotDe, unitesDeVente,
} from "@/lib/bo/scission";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";

async function rpc(fn: string, args: Record<string, unknown>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente : écriture impossible");
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Écriture Supabase ${res.status} (${fn}) : ${(await res.text()).slice(0, 200)}`);
  invaliderTable(args.p_table);
}

const newId = () => `app_${Date.now()}x${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`;
const ID = /^[\w-]+$/;
const egal = (cle: string, value: string) => [{ key: cle, constraint_type: "equals" as const, value }];

export type ResultatScission =
  | { ok: true; creees: { id: string; libelle: string }[]; dejaFaites: number }
  | { ok: false; message: string };

/**
 * Crée la fiche de chaque unité demandée (désignée par son lot principal).
 * Une unité qui a déjà sa fiche est passée, pas dupliquée.
 */
export async function scinderLots(immeubleId: string, unites: string[]): Promise<ResultatScission> {
  if (!ID.test(immeubleId) || unites.length === 0 || unites.some((u) => !ID.test(u))) {
    return { ok: false, message: "Demande incomplète." };
  }
  const moi = await compteCourant();
  if (!moi && authActive()) return { ok: false, message: "Session expirée : reconnectez-vous." };

  const [[im], lots, baux, locataires, adresses, mandats, enfants] = await Promise.all([
    fetchAll("immeuble", egal("_id", immeubleId), 1),
    fetchAll("lot", egal("IMMEUBLE", immeubleId), 250),
    fetchAll("bail", egal("IMMEUBLE", immeubleId), 100).catch(() => []),
    fetchAll("locataire", egal("IMMEUBLE", immeubleId), 100).catch(() => []),
    fetchAll("adresse", egal("IMMEUBLE", immeubleId), 2).catch(() => []),
    fetchAll("mandat", [{ key: "IMMEUBLEs", constraint_type: "contains", value: immeubleId }], 50).catch(() => []),
    fetchAll("immeuble", egal("lot_de", immeubleId), 300).catch(() => []),
  ]);
  if (!im) return { ok: false, message: "Immeuble introuvable." };
  if (typeof im.lot_de === "string" && im.lot_de) return { ok: false, message: "Cette fiche est déjà celle d'un lot : elle ne se scinde pas." };

  const toutes = unitesDeVente(lots);
  const fiches = enfants.map(ficheLotDe);
  const mandat = mandatEnVigueur(mandats);
  /* Même règle que la vue Copropriété : le taux du mandat, 5 % à défaut. */
  const tauxMandat = Number(String(mandat?.honos_taux ?? "").replace(",", "."));
  const taux = tauxMandat > 0 ? tauxMandat : 5;
  const creees: { id: string; libelle: string }[] = [];
  let dejaFaites = 0;

  for (const uid of unites) {
    const u = toutes.find((x) => x.id === uid);
    if (!u) return { ok: false, message: "Un des lots demandés n'est plus à l'état locatif : rechargez la page." };
    if (ficheDeLUnite(u, fiches)) { dejaFaites++; continue; }

    const ficheId = newId();
    const maintenant = new Date().toISOString();
    await rpc("bo_insert_doc", {
      p_table: "bo_immeuble",
      p_id: ficheId,
      p_doc: { ...docFicheLot(im, u, taux, maintenant), ...(moi?.agent_id ? { "Created By": moi.agent_id } : {}) },
    });

    /* Les copies : d'abord les identifiants, pour traduire les renvois
       (cave → son lot, bail → ses lots et ses locataires). */
    const lotsUnite = lots.filter((l) => u.lotIds.includes(String(l._id)));
    const bauxUnite = baux.filter((b) => concerne(b, u.lotIds));
    const locsUnite = locataires.filter((l) => concerne(l, u.lotIds));
    const corr = new Map<string, string>();
    for (const d of [...lotsUnite, ...bauxUnite, ...locsUnite]) corr.set(String(d._id), newId());
    const inserer = (table: string, d: Record<string, unknown>) => rpc("bo_insert_doc", {
      p_table: table, p_id: corr.get(String(d._id)), p_doc: copiePour(d, ficheId, maintenant, corr),
    });
    await Promise.all([
      ...lotsUnite.map((l) => inserer("bo_lot", l)),
      ...bauxUnite.map((b) => inserer("bo_bail", b)),
      ...locsUnite.map((l) => inserer("bo_locataire", l)),
      ...(adresses[0] ? [rpc("bo_insert_doc", {
        p_table: "bo_adresse", p_id: newId(), p_doc: copiePour(adresses[0], ficheId, maintenant, corr),
      })] : []),
    ]);
    /* Surface, loyers et occupation de la fiche se calculent sur ses lots. */
    await rpc("bo_recompute_immeuble", { p_id: ficheId });
    creees.push({ id: ficheId, libelle: u.libelle });
    fiches.push(ficheLotDe({ _id: ficheId, lots_origine: u.lotIds, lot_libelle: u.libelle }));
  }

  /* Un seul mandat pour tous les lots : celui de l'immeuble couvre aussi ses
     fiches de lots. Le registre n'est pas touché — même numéro, même mandat. */
  if (mandat && creees.length > 0) {
    const couverts = Array.isArray(mandat.IMMEUBLEs) ? (mandat.IMMEUBLEs as unknown[]).map(String) : [immeubleId];
    await rpc("bo_patch_doc", {
      p_table: "bo_mandat", p_id: String(mandat._id),
      p_patch: { IMMEUBLEs: [...new Set([...couverts, ...creees.map((c) => c.id)])] },
    });
  }

  revalidatePath("/", "layout");
  revalidatePath(`/bien/${immeubleId}`);
  return { ok: true, creees, dejaFaites };
}
