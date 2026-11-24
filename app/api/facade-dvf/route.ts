// La façade d'une vente DVF (MAV, 15/11/26 : « photo de l'immeuble extérieur
// pour voir si c'est le même standing »). Street View, À L'ÉCRAN SEULEMENT :
// Google interdit de reprendre ces images dans un dossier ou une annonce.
//
// Chaque façade est demandée une fois à Google puis gardée dans le seau du BO
// (`dvf-facades/`) : une image Street View est facturée, on ne la paie qu'une
// fois. Sans vue de rue, on le note aussi pour ne pas redemander.
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLE = () => process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

const servir = (bytes: ArrayBuffer | Uint8Array<ArrayBuffer>, type = "image/jpeg") =>
  new Response(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=2592000, immutable" },
  });
const absente = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=86400" } });

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return absente();
  if (!SB_KEY) return absente();
  const nom = `${lat.toFixed(5)}_${lon.toFixed(5)}`;
  const chemin = `dvf-facades/${nom}.jpg`;
  const vide = `dvf-facades/${nom}.aucune`;
  const auth = { Authorization: `Bearer ${SB_KEY}` };

  const deja = await fetch(`${SB_URL}/storage/v1/object/bo-files/${chemin}`, { headers: auth, cache: "no-store" }).catch(() => null);
  if (deja?.ok) return servir(await deja.arrayBuffer());
  const sansVue = await fetch(`${SB_URL}/storage/v1/object/bo-files/${vide}`, { headers: auth, cache: "no-store" }).catch(() => null);
  if (sansVue?.ok) return absente();

  const cle = CLE();
  if (!cle) return absente();
  const lieu = `${lat},${lon}`;
  /* L'appel « metadata » est gratuit : il dit si une prise de vue existe. */
  const meta = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lieu}&radius=40&key=${cle}`, { cache: "no-store" })
    .then((r) => r.json() as Promise<{ status?: string }>).catch(() => null);
  const deposer = (p: string, corps: Uint8Array<ArrayBuffer>, type: string) =>
    fetch(`${SB_URL}/storage/v1/object/bo-files/${p}`, {
      method: "POST", headers: { ...auth, "Content-Type": type, "x-upsert": "true" }, body: corps,
    }).catch(() => null);
  if (meta?.status !== "OK") {
    if (meta?.status === "ZERO_RESULTS") await deposer(vide, new Uint8Array([0]), "application/octet-stream");
    return absente();
  }
  const r = await fetch(
    `https://maps.googleapis.com/maps/api/streetview?location=${lieu}&radius=40&size=480x320&fov=75&pitch=12&return_error_code=true&key=${cle}`,
    { cache: "no-store" },
  ).catch(() => null);
  if (!r?.ok) return absente();
  const jpeg = new Uint8Array(await r.arrayBuffer()) as Uint8Array<ArrayBuffer>;
  await deposer(chemin, jpeg, "image/jpeg");
  return servir(jpeg);
}
