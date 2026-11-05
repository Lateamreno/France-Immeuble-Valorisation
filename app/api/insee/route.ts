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

  /* Deux façons de chercher : par code postal, puis par nom. La seconde
     rattrape les échecs passagers de l'API comme les codes postaux absents
     de la fiche. */
  const demandes = [
    cp && `codePostal=${encodeURIComponent(cp)}`,
    ville && `nom=${encodeURIComponent(ville)}`,
  ].filter(Boolean) as string[];

  let communes: { nom: string; code: string }[] = [];
  for (const q of demandes) {
    const r = await fetch(`https://geo.api.gouv.fr/communes?${q}&fields=nom,code&limit=20`, {
      next: { revalidate: 604800 },
    }).catch(() => null);
    if (r?.ok) {
      communes = (await r.json().catch(() => [])) as { nom: string; code: string }[];
      if (communes.length) break;
    }
  }
  if (communes.length === 0) return Response.json({ code: null });
  // Un code postal peut couvrir plusieurs communes : on préfère celle dont le
  // nom correspond, sans accents ni tirets, et on retombe sur la première.
  const norm = (x: string) =>
    x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const c = communes.find((x) => norm(x.nom) === norm(ville)) ?? communes[0];
  return Response.json({ code: c?.code ?? null, nom: c?.nom ?? null });
}
