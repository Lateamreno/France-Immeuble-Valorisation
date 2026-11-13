import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { estMav } from "@/lib/auth/comptes";
import { SCOPES_ADS, adresseRetour, clientOAuth } from "@/lib/bo/google-ads-oauth";

export const dynamic = "force-dynamic";

/**
 * « Connecter Google Ads » (Acquisition) : envoie la direction chez Google
 * pour autoriser la LECTURE du compte. Le retour arrive sur
 * /api/google-ads/retour ; un jeton aléatoire, gardé en cookie, prouve que
 * c'est bien ce BO qui a lancé la demande.
 */
export async function GET(req: Request) {
  const origine = new URL(req.url).origin;
  if (!(await estMav())) return NextResponse.redirect(`${origine}/`);
  const client = clientOAuth();
  if (!client) return NextResponse.redirect(`${origine}/acquisition?ads=client_absent`);
  const etat = randomBytes(24).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: client.id,
    redirect_uri: adresseRetour(origine),
    response_type: "code",
    scope: SCOPES_ADS,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: etat,
  }).toString();
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("fi_ads_etat", etat, { httpOnly: true, secure: origine.startsWith("https"), sameSite: "lax", path: "/api/google-ads", maxAge: 600 });
  return res;
}
