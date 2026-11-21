// Constructibilité lue par l'IA (MAV, 20/11/26). Télécharger un règlement de
// plusieurs centaines de pages puis le faire lire prend une à deux minutes :
// d'où une route à part, avec du temps, plutôt qu'une action serveur.
// La lecture est gardée sur la fiche (`plu_ia`) ; les quatre cases du PLU ne
// sont pas touchées — c'est l'agent qui reprend les valeurs.
import { NextRequest } from "next/server";
import { fetchAll } from "@/lib/bubble/server";
import { authActive, compteCourant } from "@/lib/auth/comptes";
import { revalidatePath } from "next/cache";
import { garderLecture, lirePlu } from "@/lib/bo/plu-serveur";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const refus = (status: number, message: string) => Response.json({ ok: false, message }, { status });

export async function POST(req: NextRequest) {
  const moi = await compteCourant();
  if (!moi && authActive()) return refus(401, "Session expirée : reconnectez-vous.");
  const corps = (await req.json().catch(() => null)) as { immeuble?: unknown; par?: unknown } | null;
  const id = typeof corps?.immeuble === "string" ? corps.immeuble : "";
  if (!/^[\w-]+$/.test(id)) return refus(400, "Immeuble inconnu.");
  const [im] = await fetchAll("immeuble", [{ key: "_id", constraint_type: "equals", value: id }], 1).catch(() => []);
  if (!im) return refus(404, "Immeuble introuvable.");
  if (im.en_copropriete === true) return refus(422, "Un bien en copropriété ne renseigne pas de constructibilité.");
  const [adresse] = await fetchAll("adresse", [{ key: "IMMEUBLE", constraint_type: "equals", value: id }], 1).catch(() => []);
  const geo = adresse?.geo as { lat?: unknown; lng?: unknown } | undefined;
  if (typeof geo?.lat !== "number" || typeof geo?.lng !== "number") {
    return refus(422, "L'adresse du bien n'est pas localisée : renseignez-la d'abord dans l'onglet Emplacement.");
  }
  const commune = [im.adresse_zipcode, im.adresse_ville].filter((v) => typeof v === "string" && v).join(" ");
  /* Le nom affiché vient de l'écran : c'est une étiquette, pas un droit. */
  const par = typeof corps?.par === "string" ? corps.par.slice(0, 60) : undefined;
  const r = await lirePlu({ lat: geo.lat, lon: geo.lng, commune, par });
  if (!r.ok) return refus(200, r.message);
  await garderLecture(id, r.lecture);
  revalidatePath(`/bien/${id}`);
  return Response.json({ ok: true, lecture: r.lecture });
}
