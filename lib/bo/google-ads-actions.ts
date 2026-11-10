"use server";

import { revalidatePath } from "next/cache";
import { compteCourant, estDirection } from "@/lib/auth/comptes";
import { oublierConnexion } from "@/lib/bo/google-ads-oauth";
import { chercherZonesGoogle, oublierCacheAds } from "@/lib/bo/google-ads";
import { annuler, appliquer, poserPlafond, type Resultat } from "@/lib/bo/google-ads-ecriture";
import type { Changement } from "@/lib/bo/google-ads-changements";

async function direction(): Promise<string | null> {
  if (!(await estDirection())) throw new Error("Réservé à la direction.");
  return (await compteCourant())?.email ?? null;
}

/** « Déconnecter Google Ads » : le BO oublie le jeton (direction seule). */
export async function deconnecterGoogleAds(): Promise<void> {
  await direction();
  await oublierConnexion();
  oublierCacheAds();
  revalidatePath("/acquisition");
}

/** Une modification faite depuis la page Acquisition, journalisée « BO ». */
export async function appliquerAds(changements: Changement[]): Promise<{ ok: boolean; resultats: Resultat[]; message?: string }> {
  try {
    const par = await direction();
    const resultats = await appliquer(changements, { source: "bo", par });
    revalidatePath("/acquisition");
    return { ok: resultats.every((r) => r.ok), resultats };
  } catch (e) {
    return { ok: false, resultats: [], message: e instanceof Error ? e.message : String(e) };
  }
}

export async function annulerAds(id: number): Promise<{ ok: boolean; message?: string }> {
  try {
    const par = await direction();
    const r = await annuler(id, { source: "bo", par });
    revalidatePath("/acquisition");
    return { ok: r.ok, message: r.message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function chercherZonesAds(q: string): Promise<{ ressource: string; nom: string; type: string }[]> {
  await direction();
  return chercherZonesGoogle(q).catch(() => []);
}

export async function poserPlafondAds(euros: number | null): Promise<{ ok: boolean; message?: string }> {
  try {
    const par = await direction();
    if (euros !== null && !(Number.isFinite(euros) && euros >= 1 && euros <= 10_000)) return { ok: false, message: "Plafond entre 1 et 10 000 € par jour." };
    await poserPlafond(euros, par);
    revalidatePath("/acquisition");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
