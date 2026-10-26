"use server";

// Les gestes de l'écran Diffusion sur le parc (retours #530 et #531) :
// retirer un bien de toutes ses destinations, l'y remettre, diffuser un bien
// qui ne l'est pas encore. Réservés à l'administrateur.
//
// Retirer DÉCOCHE les destinations : un simple retrait serait aussitôt
// défait par le réconciliateur, qui republie tout bien coché et prêt à chaque
// écriture sur sa fiche. Remettre recoche puis publie, là où les conditions
// sont réunies — un clic, jamais un automatisme (doctrine d'envoi du BO).
import { revalidatePath } from "next/cache";
import { estAdmin, REFUS_ADMIN } from "./admin";
import { apercuAnnonce, publierAnnonce } from "./diffusion";
import { apercuSite, cocherDestination, publierSurSite } from "./site-fi";

export async function retirerDuParc(immeubleId: string, agent?: string) {
  if (!(await estAdmin(agent))) return REFUS_ADMIN;
  const [pb, site] = [
    await cocherDestination(immeubleId, "pb", false, agent),
    await cocherDestination(immeubleId, "site", false, agent),
  ];
  revalidatePath("/diffusion");
  const ko = [pb, site].filter((r) => !r.ok) as { ok: false; message: string }[];
  return ko.length
    ? { ok: false as const, message: ko.map((r) => r.message).join(" · ") }
    : { ok: true as const, message: "Retiré de Plein Bail et du site. Il reste dans la liste, hors ligne." };
}

/** Remettre en ligne, ou diffuser pour la première fois : recoche et publie. */
export async function remettreDansLeParc(immeubleId: string, agent?: string) {
  if (!(await estAdmin(agent))) return REFUS_ADMIN;
  await cocherDestination(immeubleId, "pb", true, agent);
  await cocherDestination(immeubleId, "site", true, agent);
  const [a, s] = await Promise.all([
    apercuAnnonce(immeubleId).catch(() => null),
    apercuSite(immeubleId).catch(() => null),
  ]);
  const lignes: string[] = [];
  if (a && a.blocages.length === 0 && a.statut) {
    const r = await publierAnnonce(immeubleId);
    lignes.push(r.ok ? "Plein Bail : en ligne." : `Plein Bail : ${r.message}`);
  } else {
    lignes.push(`Plein Bail : pas publié — ${a?.blocages.map((x) => x.label).join(", ") || a?.motif || "état illisible"}.`);
  }
  if (s && s.blocages.length === 0 && s.statut) {
    const r = await publierSurSite(immeubleId, agent);
    lignes.push(r.ok ? "Site : en ligne d'ici dix minutes." : `Site : ${r.message}`);
  } else {
    lignes.push(`Site : pas publié — ${s?.blocages.map((x) => x.label).join(", ") || s?.motif || "état illisible"}.`);
  }
  revalidatePath("/diffusion");
  return { ok: true as const, message: lignes.join("\n") };
}
