import "server-only";
import { headers } from "next/headers";

/**
 * L'adresse du BO à mettre dans un lien envoyé par e-mail.
 *
 * En production, toujours l'adresse principale, jamais celle de la requête :
 * celui qui clique peut travailler sur l'adresse figée d'un déploiement
 * (…-xxxx-lateamrenos-projects.vercel.app), et le lien enverrait son
 * destinataire sur cette ancienne version — où sa session, en plus, ne vaut
 * pas pour l'adresse principale.
 */
export async function adresseBo(): Promise<string> {
  const prod = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined;
  if (prod) return `https://${prod}`;
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  return `${proto}://${hote}`;
}
