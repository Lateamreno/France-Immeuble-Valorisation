// Configuration & validation d'environnement pour la lecture Bubble.
// Aucune valeur en dur : tout vient de l'environnement.

// Data types Bubble connus à ce stade (repérés dans l'app France Immeuble).
// À compléter au fil de la reconnaissance — Bubble n'expose pas la liste des types.
export const KNOWN_TYPES = ["immeuble", "proprietaire"];

/**
 * Vérifie la présence des variables requises et renvoie la config.
 * Lance une erreur explicite (sans jamais afficher la valeur du token).
 */
export function loadConfig({ requireToken = false } = {}) {
  const missing = [];
  const appUrl = process.env.BUBBLE_APP_URL;
  const token = process.env.BUBBLE_API_TOKEN;

  if (!appUrl) missing.push("BUBBLE_APP_URL");
  if (requireToken && !token) missing.push("BUBBLE_API_TOKEN");

  if (missing.length) {
    throw new Error(
      `Variable(s) d'environnement manquante(s) : ${missing.join(", ")}.\n` +
        `À définir soit dans l'environnement Claude Code (pour que la recon tourne ici),\n` +
        `soit dans le runtime Vercel (pour l'app déployée). Voir integrations/bubble/README.md.`,
    );
  }

  return {
    appUrl: appUrl?.replace(/\/+$/, ""),
    hasToken: Boolean(token),
    env: (process.env.BUBBLE_ENV || "live").toLowerCase(),
  };
}
