"use server";

import { revalidatePath } from "next/cache";
import { estDirection } from "@/lib/auth/comptes";
import { oublierConnexion } from "@/lib/bo/google-ads-oauth";
import { oublierCacheAds } from "@/lib/bo/google-ads";

/** « Déconnecter Google Ads » : le BO oublie le jeton (direction seule). */
export async function deconnecterGoogleAds(): Promise<void> {
  if (!(await estDirection())) throw new Error("Réservé à la direction.");
  await oublierConnexion();
  oublierCacheAds();
  revalidatePath("/acquisition");
}
