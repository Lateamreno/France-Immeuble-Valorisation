// Étude de découpe (MAV, 15/11/26) : les ventes DVF autour d'un immeuble, les
// années de construction BDNB, et les réglages gardés sur sa fiche. Le premier
// appel sur une commune lit ses fichiers DVF (quelques Mo) : d'où une route à
// part, avec du temps, plutôt qu'une action serveur.
import { NextRequest } from "next/server";
import { fetchAll } from "@/lib/bubble/server";
import { donneesEtude } from "@/lib/bo/etude-decoupe-serveur";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("immeuble") ?? "";
  if (!/^[\w-]+$/.test(id)) return Response.json({ ok: false, raison: "Immeuble inconnu." }, { status: 400 });
  const [im] = await fetchAll("immeuble", [{ key: "_id", constraint_type: "equals", value: id }], 1).catch(() => []);
  if (!im) return Response.json({ ok: false, raison: "Immeuble introuvable." }, { status: 404 });
  const [adresse] = await fetchAll("adresse", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 1).catch(() => []);
  try {
    return Response.json(await donneesEtude(im, adresse));
  } catch (e) {
    return Response.json({ ok: false, raison: `L'étude n'a pas pu être calculée (${e instanceof Error ? e.message : "erreur"}).` }, { status: 500 });
  }
}
