import { NextResponse } from "next/server";
import { compteCourant, estMav } from "@/lib/auth/comptes";
import { adresseRetour, clientOAuth, enregistrerConnexion } from "@/lib/bo/google-ads-oauth";
import { oublierCacheAds } from "@/lib/bo/google-ads";

export const dynamic = "force-dynamic";

/** Le retour de Google après « Connecter Google Ads ». */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const origine = u.origin;
  const vers = (motif: string) => {
    const res = NextResponse.redirect(`${origine}/acquisition?ads=${encodeURIComponent(motif)}`);
    res.cookies.delete({ name: "fi_ads_etat", path: "/api/google-ads" });
    return res;
  };
  if (!(await estMav())) return NextResponse.redirect(`${origine}/`);
  if (u.searchParams.get("error")) return vers(u.searchParams.get("error") === "access_denied" ? "refuse" : "erreur_google");
  const attendu = req.headers.get("cookie")?.match(/(?:^|;\s*)fi_ads_etat=([^;]+)/)?.[1];
  if (!attendu || attendu !== u.searchParams.get("state")) return vers("etat");
  const client = clientOAuth();
  const code = u.searchParams.get("code");
  if (!client || !code) return vers("erreur_google");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: client.id, client_secret: client.secret,
      redirect_uri: adresseRetour(origine), grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { refresh_token?: string; id_token?: string; scope?: string; error?: string };
  if (!r.ok) {
    console.error("[google-ads/retour]", j.error);
    return vers("erreur_google");
  }
  if (!j.scope?.includes("auth/adwords")) return vers("portee");
  if (!j.refresh_token) return vers("sans_renouvellement");
  /* L'adresse du compte Google, lue dans le jeton d'identité que Google vient
     de nous remettre en direct (pas de vérification de signature à faire). */
  let email: string | null = null;
  try {
    email = JSON.parse(Buffer.from((j.id_token ?? "").split(".")[1] ?? "", "base64url").toString()).email ?? null;
  } catch { /* adresse facultative */ }
  try {
    const moi = await compteCourant();
    await enregistrerConnexion(j.refresh_token, email, moi?.email ?? null);
  } catch (e) {
    console.error("[google-ads/retour]", e);
    return vers("enregistrement");
  }
  oublierCacheAds();
  return vers("connecte");
}
