// Synchro Bubble → tables miroir bo_* (upsert idempotent).
// POST { token, type, cursor?, rounds?, since? }
//
// Source de la fonction déployée sur le projet Supabase du BO (sojtmhdrzmdbtqborxsi),
// gardée ici pour qu'elle soit relue et versionnée. Déploiement : outil MCP
// Supabase `deploy_edge_function` (ou `supabase functions deploy bubble-sync`).
//
// Version 5 (16/10/26) — ne plus écraser ce que le BO a écrit.
// `bo_run_sync()` redemande à Bubble tout ce qui a bougé depuis le document le
// plus récent de la table, moins une heure. Un document que le BO vient de
// compléter dans le miroir (taxe foncière saisie, lot modifié…) et que Bubble
// n'a PAS retouché revenait donc toutes les heures dans sa version Bubble, et
// la saisie disparaissait : c'est ce qui a effacé deux fois la taxe foncière
// de Deuil-la-Barre (16/10). On ne remplace un document que si Bubble l'a
// réellement modifié depuis la dernière synchro.
//
// Version 6 (20/10/26) — garder les clés que Bubble ne connaît pas.
// Le BO écrit sur les documents Bubble des champs qui n'existent que chez lui :
// `pb_*` (diffusion Plein Bail), `mandants`, `avenants`, `societes`,
// `PROPRIETAIREs`, `SOCIETE_PROPRIETAIRE`… Quand Bubble retouchait ensuite le
// même document, la version Bubble remplaçait le document ENTIER et ces clés
// disparaissaient. Désormais, sur un document que le BO a déjà touché
// (`app_modified` présent), les clés absentes du document Bubble sont
// conservées ; les clés communes prennent la valeur Bubble. Le prix à payer :
// un champ VIDÉ côté Bubble (donc absent de l'export) garde sa valeur d'avant
// sur ces documents-là — rare, et le BO est devenu l'outil de saisie.
import { createClient } from "jsr:@supabase/supabase-js@2";

const TYPES = new Set([
  "immeuble","lot","bail","locataire","contact","suivi","estimation","mandat",
  "offre","visite","proposition","recherche","question","download",
  "commercialisation","dossier","photo","parcelle","composant","charge",
  "prix","prix_secteur","travaux","adresse","objectif","user","agentfi",
  "mail","annonce","match","vente","contre_offre","mandat_envoye","indice",
]);

const BASE = "https://vente.france-immeuble.fr/api/1.1/obj";

type Connu = {
  bubble_modified: string | null;
  data: Record<string, unknown> | null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  const token = String(body.token ?? "");
  const type = String(body.type ?? "");
  let cursor = Number(body.cursor ?? 0);
  const rounds = Math.min(Number(body.rounds ?? 20), 60);
  const since = typeof body.since === "string" ? body.since : undefined;
  if (!token || !TYPES.has(type)) return new Response("bad token/type", { status: 400 });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let fetched = 0;
  let ignores = 0;
  let fusions = 0;
  let remaining = 1;
  for (let r = 0; r < rounds && remaining > 0; r++) {
    const p = new URLSearchParams({ limit: "100", cursor: String(cursor) });
    if (since) {
      p.set("constraints", JSON.stringify([{ key: "Modified Date", constraint_type: "greater than", value: since }]));
    }
    const res = await fetch(`${BASE}/${type}?${p}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return new Response(JSON.stringify({ error: `bubble ${res.status}` }), { status: 502 });
    const j = await res.json();
    const rows = (j.response?.results ?? []) as Record<string, unknown>[];
    remaining = j.response?.remaining ?? 0;
    if (rows.length === 0) { remaining = 0; break; }

    /* Ce que le miroir connaît déjà de ces documents : la date Bubble de la
       dernière synchro, et le document lui-même — sa date d'écriture BO et ses
       clés propres au BO. */
    const ids = rows.map((d) => String(d._id));
    const { data: connus, error: eLecture } = await supa
      .from(`bo_${type}`)
      .select("id, bubble_modified, data")
      .in("id", ids);
    if (eLecture) return new Response(JSON.stringify({ error: eLecture.message }), { status: 500 });
    const parId = new Map<string, Connu>(
      (connus ?? []).map((c) => [String(c.id), { bubble_modified: c.bubble_modified, data: c.data } as Connu]),
    );
    const appModifiedDe = (c?: Connu) => {
      const v = c?.data?.app_modified;
      return typeof v === "string" ? Date.parse(v) : NaN;
    };

    const up = rows
      .filter((d) => {
        const connu = parId.get(String(d._id));
        if (!connu) return true;
        const modif = typeof d["Modified Date"] === "string" ? Date.parse(d["Modified Date"] as string) : NaN;
        const deja = connu.bubble_modified ? Date.parse(connu.bubble_modified) : NaN;
        /* Bubble n'a rien changé depuis la dernière synchro : on garde la
           version du miroir, qui peut porter une saisie du BO. */
        if (Number.isFinite(modif) && Number.isFinite(deja) && modif <= deja) { ignores += 1; return false; }
        /* Bubble a bougé, mais le BO a écrit plus récemment encore : le BO
           garde la main, Bubble n'étant pas resynchronisé dans l'autre sens. */
        const app = appModifiedDe(connu);
        if (Number.isFinite(app) && Number.isFinite(modif) && app > modif) { ignores += 1; return false; }
        return true;
      })
      .map((d) => {
        const connu = parId.get(String(d._id));
        /* Document déjà touché par le BO : ses clés que Bubble ignore survivent
           à la mise à jour (v6). Les clés communes prennent la valeur Bubble. */
        const garde = connu?.data && Number.isFinite(appModifiedDe(connu)) ? connu.data : null;
        if (garde) fusions += 1;
        return {
          id: String(d._id),
          data: garde ? { ...garde, ...d } : d,
          bubble_created: typeof d["Created Date"] === "string" ? d["Created Date"] : null,
          bubble_modified: typeof d["Modified Date"] === "string" ? d["Modified Date"] : null,
          synced_at: new Date().toISOString(),
        };
      });
    if (up.length > 0) {
      const { error } = await supa.from(`bo_${type}`).upsert(up, { onConflict: "id" });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    cursor += rows.length;
    fetched += rows.length;
  }

  const done = remaining <= 0;
  await supa.from("bo_sync_state").upsert({
    type,
    last_cursor: done && !since ? 0 : cursor,
    total_synced: fetched,
    done,
    updated_at: new Date().toISOString(),
  }, { onConflict: "type" });

  return new Response(JSON.stringify({ type, next_cursor: cursor, fetched, ignores, fusions, remaining, done }), {
    headers: { "Content-Type": "application/json" },
  });
});
