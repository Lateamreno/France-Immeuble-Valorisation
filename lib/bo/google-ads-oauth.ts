// Connexion Google Ads par le compte Google de la direction (OAuth), à la
// place d'une clé de compte de service. Raison (MAV, 10/11) : l'organisation
// Google interdit la création de clés (`iam.disableServiceAccountKeyCreation`),
// et la lever demande un rôle d'administrateur qu'on n'a pas sous la main.
//
// Le geste : « Connecter Google Ads » sur la page Acquisition → Google demande
// l'autorisation → le BO garde le jeton de renouvellement, CHIFFRÉ
// (MAIL_CRYPTO_KEY), dans `fi_google_ads`. Aucun secret ne passe par la
// conversation : l'identifiant et le secret du client OAuth sont posés par MAV
// dans Vercel (GOOGLE_ADS_OAUTH_CLIENT_ID / GOOGLE_ADS_OAUTH_CLIENT_SECRET).
//
// Module serveur seulement.
import { chiffrer, chiffrementDisponible, dechiffrer } from "@/lib/mails/coffre";

const BO_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const BO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const SCOPES_ADS = "https://www.googleapis.com/auth/adwords openid email";

export function clientOAuth(): { id: string; secret: string } | null {
  const id = process.env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_ADS_OAUTH_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

export const adresseRetour = (origine: string) => `${origine}/api/google-ads/retour`;

export type Connexion = { refresh: string; email: string | null; connecteLe: string };

/** La connexion enregistrée, ou null (jamais connectée, ou plus déchiffrable). */
export async function lireConnexion(): Promise<Connexion | null> {
  if (!BO_KEY) return null;
  const r = await fetch(`${BO_URL}/rest/v1/fi_google_ads?id=eq.principal&select=refresh_chiffre,email,connecte_le`, {
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return null;
  const [l] = (await r.json().catch(() => [])) as { refresh_chiffre: string; email: string | null; connecte_le: string }[];
  const refresh = l ? dechiffrer(l.refresh_chiffre) : undefined;
  return l && refresh ? { refresh, email: l.email, connecteLe: l.connecte_le } : null;
}

export async function enregistrerConnexion(refresh: string, email: string | null, par: string | null): Promise<void> {
  if (!BO_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY absente");
  if (!chiffrementDisponible()) throw new Error("MAIL_CRYPTO_KEY absente : le BO refuse de garder le jeton en clair.");
  const r = await fetch(`${BO_URL}/rest/v1/fi_google_ads?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ id: "principal", refresh_chiffre: chiffrer(refresh), email, connecte_par: par, connecte_le: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Enregistrement de la connexion : ${r.status} ${(await r.text()).slice(0, 200)}`);
}

export async function oublierConnexion(): Promise<void> {
  if (!BO_KEY) return;
  await fetch(`${BO_URL}/rest/v1/fi_google_ads?id=eq.principal`, {
    method: "DELETE",
    headers: { apikey: BO_KEY, Authorization: `Bearer ${BO_KEY}` },
    cache: "no-store",
  });
}
