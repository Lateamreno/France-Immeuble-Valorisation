// Synchro Bubble → Supabase (tables miroir bo_*), via l'Edge Function
// `bubble-sync` déployée sur france-immeuble-bo. Réexécutable à volonté (upsert).
// NB : une synchro AUTOMATIQUE tourne déjà toutes les heures dans Supabase
// (pg_cron « bo-sync-horaire ») — ce script sert aux resyncs manuels/complets.
//
//   node scripts/sync-bubble.mjs                    # tous les types (complet)
//   node scripts/sync-bubble.mjs immeuble suivi     # types choisis
//   SINCE=2026-08-10T00:00:00Z node scripts/…       # incrémental (Modified Date > SINCE)
//
// Variables : BUBBLE_API_TOKEN (requis), SUPABASE_ANON_KEY (facultatif,
// défaut = clé anon du projet BO france-immeuble-bo — sert uniquement à invoquer la fonction).

const FN = "https://sojtmhdrzmdbtqborxsi.supabase.co/functions/v1/bubble-sync";
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvanRtaGRyem1kYnRxYm9yeHNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDI2NjAsImV4cCI6MjEwMTk3ODY2MH0.9HuHbGSYxPJmU9QpoM97Evgv8F8ZDzcMtAy8IvA9BuM";
const TOKEN = process.env.BUBBLE_API_TOKEN;
if (!TOKEN) {
  console.error("BUBBLE_API_TOKEN manquant.");
  process.exit(1);
}

const ALL = [
  "immeuble", "lot", "bail", "locataire", "contact", "suivi", "estimation", "mandat",
  "offre", "visite", "proposition", "recherche", "question", "download",
  "commercialisation", "dossier", "photo", "parcelle", "composant", "charge",
  "prix", "prix_secteur", "travaux", "adresse", "objectif", "user", "agentfi",
  "mail", "annonce", "match", "vente", "contre_offre", "mandat_envoye", "indice",
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
