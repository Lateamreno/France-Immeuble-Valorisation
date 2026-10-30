import type { NextRequest } from "next/server";
import { getBien } from "@/lib/bubble/server";
import { jetonClaudeValide, lireDemande, majDemande } from "@/lib/bo/claude-demandes";
import { COLS_MATRICE } from "@/lib/bo/matrice";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const json = (status: number, corps: Record<string, unknown>) => Response.json(corps, { status });
const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/**
 * Ce que la tâche Claude lit en premier : la demande, telle que le BO l'a
 * enregistrée. La tâche ne se fie qu'à cette réponse, jamais au texte qui l'a
 * déclenchée (voir lib/bo/claude-demandes.ts).
 *
 * Pour « drive_bo », la réponse porte aussi l'immeuble et ses lots actuels,
 * sans aucune donnée de locataire : Claude en a besoin pour reprendre les
 * mêmes numéros de lots et signaler les écarts, pas davantage.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.BO_CLAUDE_TOKEN) return json(503, { ok: false, message: "BO_CLAUDE_TOKEN n'est pas posé côté BO." });
  if (!jetonClaudeValide(req.headers.get("authorization"))) return json(401, { ok: false, message: "Jeton refusé." });
  const { id } = await ctx.params;
  const d = await lireDemande(id);
  if (!d) return json(404, { ok: false, message: "Demande inconnue." });
  if (d.statut !== "envoyee" && d.statut !== "en_cours") {
    return json(409, { ok: false, message: `Demande déjà close (${d.statut}) : rien à faire.` });
  }
  if (d.statut === "envoyee") await majDemande(d.id, { statut: "en_cours" });

  const corps: Record<string, unknown> = {
    ok: true,
    demande: { id: d.id, action: d.action, cree_le: d.cree_le, parametres: d.parametres },
  };

  if (d.action === "drive_bo" && d.immeuble_id) {
    const b = await getBien(d.immeuble_id);
    if (!b) return json(404, { ok: false, message: "Immeuble introuvable dans le BO." });
    corps.immeuble = {
      id: d.immeuble_id,
      adresse: [S(b.im.adresse_numero_rue), S(b.im.adresse_rue)].filter(Boolean).join(" "),
      code_postal: S(b.im.adresse_zipcode),
      ville: S(b.im.adresse_ville),
      dossier_drive: S(b.im.drive_dossier) || null,
      lots: b.lots.map((l) => ({
        batiment: S(l.batiment), etage: S(l.etage), numero: S(l.numero),
        Destination: S(l.Destination), Type_lot: S(l.Type_lot),
        surface_carrez: S(l.surface_carrez), surface_sol: S(l.surface_sol),
        Type_bail: S(l.Type_bail), loyer: S(l.loyer), Type_dpe: S(l.Type_dpe),
      })),
    };
    /* Le format attendu en retour, tiré de la seule définition des colonnes :
       la tâche ne peut pas inventer une colonne que le BO ne relirait pas. */
    corps.format_matrice = COLS_MATRICE.map((c) => ({ colonne: c.cle, aide: c.aide, valeurs: c.valeurs ?? null }));
  }
  return json(200, corps);
}
