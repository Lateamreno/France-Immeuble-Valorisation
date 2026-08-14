// Code INSEE d'une commune, à partir de son nom et de son code postal.
//
// Il ouvre le tensiomètre LOCservice sur la bonne ville (#76), qui range ses
// pages par code INSEE : tensiometre-33063.html pour Bordeaux. La route
// /api/geo fait déjà cette recherche, mais elle exige des coordonnées et
// interroge une dizaine de sources ; ici on ne veut qu'un code.
import { NextRequest } from "next/server";

export const revalidate = 604800;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ville = (q.get("ville") ?? "").trim();
  const cp = (q.get("cp") ?? "").trim();
  if (!ville && !cp) return Response.json({ error: "ville ou code postal attendu" }, { status: 400 });

  const url =
    `https://geo.api.gouv.fr/communes?${cp ? `codePostal=${encodeURIComponent(cp)}` : `nom=${encodeURIComponent(ville)}`}` +
    "&fields=nom,code&limit=20";
  const r = await fetch(url, { next: { revalidate: 604800 } }).catch(() => null);
  if (!r?.ok) return Response.json({ code: null });

  const communes = (await r.json()) as { nom: string; code: string }[];
  // Un code postal peut couvrir plusieurs communes : on préfère celle dont le
  // nom correspond, sans accents ni tirets, et on retombe sur la première.
  const norm = (x: string) =>
    x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const c = communes.find((x) => norm(x.nom) === norm(ville)) ?? communes[0];
  return Response.json({ code: c?.code ?? null, nom: c?.nom ?? null });
}
