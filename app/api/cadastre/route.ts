// Parcelle(s) cadastrale(s) sous un point, via l'API Carto de l'IGN.
//
// L'agent saisissait la référence à la main en allant la chercher sur le
// cadastre. Le point d'adresse est déjà géocodé : l'IGN sait dire quelle
// parcelle le contient, avec sa section, son numéro et sa contenance. On se
// contente de proposer — c'est l'agent qui ajoute (même doctrine que les POI).
import { NextRequest } from "next/server";

export const revalidate = 604800;

type Prop = {
  section?: string; numero?: string; com_abs?: string;
  contenance?: number; idu?: string; nom_com?: string; code_insee?: string;
};

/** `000 AE 3` : la forme la plus courante dans le BO. */
function reference(p: Prop) {
  const prefixe = (p.com_abs ?? "000").padStart(3, "0");
  const numero = String(parseInt(p.numero ?? "0", 10) || p.numero || "");
  return [prefixe, p.section, numero].filter(Boolean).join(" ");
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const lat = parseFloat(q.get("lat") ?? "");
  const lon = parseFloat(q.get("lon") ?? "");
  if (!isFinite(lat) || !isFinite(lon)) {
    return Response.json({ error: "lat et lon attendus" }, { status: 400 });
  }

  const geom = JSON.stringify({ type: "Point", coordinates: [lon, lat] });
  const url = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}`;
  const r = await fetch(url, { next: { revalidate: 604800 } }).catch(() => null);
  if (!r?.ok) return Response.json({ parcelles: [] });

  const data = (await r.json().catch(() => null)) as { features?: { properties: Prop }[] } | null;
  const parcelles = (data?.features ?? []).slice(0, 5).map(({ properties: p }) => ({
    ref: reference(p),
    superficie: typeof p.contenance === "number" ? p.contenance : undefined,
    idu: p.idu,
    commune: p.nom_com,
  }));
  return Response.json({ parcelles });
}
