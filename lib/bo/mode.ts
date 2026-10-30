"use server";

// Bascule Vente en bloc / Découpe.
//
// Le mode est rangé dans un cookie, pas dans le navigateur : la mise en page
// est rendue par le serveur, qui sort donc déjà le bon menu. Un état gardé
// côté client afficherait le menu Bloc puis le remplacerait par le menu
// Découpe sous les yeux de l'agent, à chaque chargement de page.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_MODE, estMode, type Mode } from "@/lib/decoupe";

export async function lireMode(): Promise<Mode> {
  const v = (await cookies()).get(COOKIE_MODE)?.value;
  return estMode(v) ? v : "bloc";
}

export async function changerMode(mode: Mode) {
  (await cookies()).set(COOKIE_MODE, mode, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
