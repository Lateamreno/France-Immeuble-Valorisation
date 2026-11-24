// Repères de marché d'une commune (loyer d'annonce, prix de vente réel).
//
// Le premier appel sur une commune lit le fichier DVF (quelques Mo) et garde
// le résultat en base : les suivants répondent immédiatement.
import { NextRequest } from "next/server";
import { reperesCommune } from "@/lib/bo/reperes";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const insee = (q.get("insee") ?? "").trim();
  if (!insee) return Response.json({ error: "code INSEE attendu" }, { status: 400 });
  const reperes = await reperesCommune(insee, q.get("destination") ?? "Logement");
  return Response.json(reperes);
}
