import { jetonClaudeValide, lireDemande, majDemande } from "@/lib/bo/claude-demandes";
import { lireMatrice } from "@/lib/bo/matrice";

export const dynamic = "force-dynamic";

const json = (status: number, corps: Record<string, unknown>) => Response.json(corps, { status });

/**
 * Là où la tâche Claude rend son travail. Elle ne sait que ranger une
 * proposition dans la demande : aucune fiche n'est touchée ici. C'est l'agent
 * qui, dans le BO, charge la proposition, la relit et l'enregistre.
 *
 * Corps attendu :
 *   { demande, statut: "prete" | "erreur", message?, resultat? }
 * Pour « drive_bo », `resultat` porte :
 *   matrice   — le CSV au format de la matrice d'import (lib/bo/matrice.ts) ;
 *   dossier   — { titre, url } du dossier Drive lu ;
 *   documents — [{ titre, url, note }] les pièces lues ;
 *   alertes   — [texte] les écarts et doutes à vérifier ;
 *   resume    — deux ou trois phrases.
 */
export async function POST(req: Request) {
  if (!process.env.BO_CLAUDE_TOKEN) return json(503, { ok: false, message: "BO_CLAUDE_TOKEN n'est pas posé côté BO." });
  if (!jetonClaudeValide(req.headers.get("authorization"))) return json(401, { ok: false, message: "Jeton refusé." });

  const brut = await req.text();
  if (brut.length > 400_000) return json(413, { ok: false, message: "Retour trop long (400 Ko au plus)." });
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(brut);
  } catch {
    return json(422, { ok: false, message: "Corps illisible : JSON attendu." });
  }
  const d = await lireDemande(String(c.demande ?? ""));
  if (!d) return json(404, { ok: false, message: "Demande inconnue." });
  if (d.statut !== "envoyee" && d.statut !== "en_cours") {
    return json(409, { ok: false, message: `Demande déjà close (${d.statut}).` });
  }

  const message = typeof c.message === "string" ? c.message.slice(0, 2000) : null;
  if (c.statut === "erreur") {
    await majDemande(d.id, { statut: "erreur", message: message ?? "Claude n'a pas pu finir." });
    return json(200, { ok: true });
  }
  if (c.statut !== "prete") return json(422, { ok: false, message: "statut : « prete » ou « erreur »." });

  const r = (c.resultat && typeof c.resultat === "object" ? c.resultat : {}) as Record<string, unknown>;
  if (d.action === "drive_bo") {
    const matrice = typeof r.matrice === "string" ? r.matrice : "";
    const lignes = lireMatrice(matrice);
    /* Une proposition vide n'est pas une proposition : on le dit à Claude tout
       de suite, il peut corriger son fichier dans la même session. */
    if (lignes.length === 0) {
      return json(422, { ok: false, message: "La matrice ne contient aucun lot lisible : en-tête exact et une ligne par lot attendus." });
    }
    const textes = (v: unknown, max: number) =>
      (Array.isArray(v) ? v : []).slice(0, max).map((x) => (typeof x === "string" ? x.slice(0, 500) : x));
    const resultat = {
      matrice,
      lots: lignes.length,
      dossier: r.dossier ?? null,
      documents: textes(r.documents, 60),
      alertes: textes(r.alertes, 40),
      resume: typeof r.resume === "string" ? r.resume.slice(0, 1500) : "",
    };
    await majDemande(d.id, { statut: "prete", resultat, message });
    return json(200, { ok: true, lots: lignes.length });
  }

  await majDemande(d.id, { statut: "prete", resultat: r, message });
  return json(200, { ok: true });
}
