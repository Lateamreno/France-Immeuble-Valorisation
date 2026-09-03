/**
 * Le pont entre les deux portes d'entrée.
 *
 * MAV a voulu garder les deux : le lien secret, pour un propriétaire qui refuse
 * de créer un mot de passe, et le compte, pour celui qui revient. Le risque
 * évident est d'avoir alors deux dossiers pour un même immeuble — un prix posé
 * par le lien, un autre par le compte, et l'agent qui arbitre entre les deux.
 *
 * On l'évite en n'ayant qu'UN espace par immeuble : le compte s'y raccroche.
 * S'il n'y en a pas encore, on en crée un silencieusement — le client connecté
 * a déjà prouvé qui il est, il n'a pas besoin qu'un agent lui ouvre une porte
 * qu'il vient de franchir.
 */

import "server-only";
import { creerEspace, espaceDuBien } from "@/lib/bo/espace-proprietaire";
import type { Espace } from "@/lib/bo/espace-modele";

export async function espaceOuJeton(immeubleId: string, contactId: string): Promise<Espace> {
  const existant = await espaceDuBien(immeubleId);
  if (existant && !existant.revoque) return existant;

  await creerEspace({ immeubleId, contactId, agent: "espace client" });
  const cree = await espaceDuBien(immeubleId);
  if (!cree) throw new Error("Espace du bien introuvable après création");
  return cree;
}
