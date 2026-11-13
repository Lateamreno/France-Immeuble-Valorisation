"use server";

import {
  creerEtLancer, derniereDemande, lireDemande, majDemande, retenirDossierDrive, type ActionClaude, type StatutDemande,
} from "@/lib/bo/claude-demandes";

/** Ce que l'écran voit d'une demande : jamais ses paramètres bruts. */
export type DemandeVue = {
  id: string;
  statut: StatutDemande;
  cree_le: string;
  maj_le: string;
  session_url: string | null;
  message: string | null;
  resultat: Record<string, unknown> | null;
};

const vue = (d: Awaited<ReturnType<typeof lireDemande>>): DemandeVue | null => d && {
  id: d.id, statut: d.statut, cree_le: d.cree_le, maj_le: d.maj_le,
  session_url: d.session_url, message: d.message, resultat: d.resultat,
};

/**
 * « Remplir depuis le Drive » : Claude lit le dossier du bien et propose
 * l'état locatif (lots, baux, locataires). Le lien du dossier est facultatif ;
 * sans lui, Claude le cherche dans « 1 - Clients » par la ville et l'adresse.
 */
export async function lancerDriveBo(
  immeubleId: string, lien: string, agent?: string,
): Promise<{ ok: true; demande: DemandeVue } | { ok: false; message: string }> {
  const l = lien.trim();
  if (l && !/^https:\/\/drive\.google\.com\//.test(l)) {
    return { ok: false, message: "Le lien doit être celui d'un dossier Google Drive (https://drive.google.com/…)." };
  }
  /* Le message part en clair : en production, Next masque le texte d'une
     erreur levée par une action serveur, et l'agent ne saurait pas pourquoi. */
  try {
    const d = await creerEtLancer({
      action: "drive_bo", immeubleId, agent, parametres: l ? { dossier_drive: l } : {},
    });
    return { ok: true, demande: vue(d)! };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Lancement impossible." };
  }
}

/** La dernière demande d'une action sur l'immeuble, pour l'afficher et la suivre. */
export async function suivreDemande(immeubleId: string, action: ActionClaude): Promise<DemandeVue | null> {
  return vue(await derniereDemande(immeubleId, action));
}

/**
 * L'agent a chargé la proposition dans l'écran (« chargee ») ou l'a écartée
 * (« refusee »). Charger n'enregistre rien : les lignes arrivent comme des
 * modifications en attente, que l'agent enregistre ou annule.
 */
export async function closDemande(id: string, statut: "chargee" | "refusee", immeubleId?: string) {
  const d = await lireDemande(id);
  if (!d || d.statut !== "prete") return;
  await majDemande(id, { statut });
  const url = (d.resultat?.dossier as { url?: unknown } | null)?.url;
  if (statut === "chargee" && immeubleId && typeof url === "string") await retenirDossierDrive(immeubleId, url);
}
