// Synchro Bubble → Supabase (tables miroir bo_*), via l'Edge Function
// `bubble-sync` déployée sur Plein Bail. Réexécutable à volonté (upsert).
//
//   node scripts/sync-bubble.mjs                    # tous les types (complet)
//   node scripts/sync-bubble.mjs immeuble suivi     # types choisis
//   SINCE=2026-08-10T00:00:00Z node scripts/…       # incrémental (Modified Date > SINCE)
//
// Variables : BUBBLE_API_TOKEN (requis), SUPABASE_ANON_KEY (facultatif,
// défaut = clé anon de Plein Bail — sert uniquement à invoquer la fonction).

const FN = "https://fkfwucqpdhbkgkouccyi.supabase.co/functions/v1/bubble-sync";
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrZnd1Y3FwZGhia2drb3VjY3lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjEzMzAsImV4cCI6MjA5OTA5NzMzMH0.u0CS6gxMVRsoMzzaExkhXbW6oCvD3at9Fj_VH2d7A_M";
const TOKEN = process.env.BUBBLE_API_TOKEN;
if (!TOKEN) {
  console.error("BUBBLE_API_TOKEN manquant.");
  process.exit(1);
}

const ALL = [
  "immeuble", "lot", "bail", "locataire", "contact", "suivi", "estimation", "mandat",
  "offre", "visite", "proposition", "recherche", "question", "download",
  "commercialisation", "dossier", "photo", "parcelle", "composant", "charge",
  "prix", "travaux", "adresse", "objectif", "user",
];
const TYPES = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const SINCE = process.env.SINCE;

for (const type of TYPES) {
  let cursor = 0;
  let total = 0;
  for (;;) {
    const r = await fetch(FN, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ token: TOKEN, type, cursor, rounds: 20, since: SINCE }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      console.error(`${type} ERREUR:`, r.status, j.error ?? "");
      break;
    }
    total += j.fetched;
    cursor = j.next_cursor;
    if (j.done) {
      console.log(`${type}: ${total} lignes ✓`);
      break;
    }
    process.stdout.write(`${type}: ${total}… `);
  }
}
