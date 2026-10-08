"use server";

// L'écran Recherches part avec ses premières cartes et vient chercher le
// reste ici (perf n° 3, 24/09). Même lecture, même cache que la page.

import { listRecherchesBO } from "@/lib/bubble/server";

export async function chargerToutesRecherches() {
  return listRecherchesBO();
}
