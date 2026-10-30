// Reclasse les recoupements déjà faits, d'après les liens gardés en base :
// aucun appel à l'annuaire. À relancer quand la règle de `classer` change.
// Lancer : node --experimental-strip-types --import ./scripts/resolveur-reg.mjs \
//            scripts/reclasser-recoupements.mts
import { classer, enregistrerRecoupes, type Recoupe } from "../lib/bo/recoupement.ts";

const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const h = { apikey: key, Authorization: `Bearer ${key}` };
const changes: Recoupe[] = [];
const compte: Record<string, number> = {};
for (let de = 0; ; de += 1000) {
  const r = await fetch(`${url}/rest/v1/fi_pm_recoupe?select=siren,dep,joignable,liens&order=siren`, { headers: { ...h, Range: `${de}-${de + 999}` } });
  const lot = (await r.json()) as Recoupe[];
  for (const x of lot) {
    if (x.joignable === "introuvable") { compte.introuvable = (compte.introuvable ?? 0) + 1; continue; }
    const j = classer(x.liens);
    compte[j] = (compte[j] ?? 0) + 1;
    if (j !== x.joignable) changes.push({ ...x, joignable: j });
  }
  if (lot.length < 1000) break;
}
for (let i = 0; i < changes.length; i += 200) await enregistrerRecoupes(changes.slice(i, i + 200));
console.log("reclassés", changes.length, JSON.stringify(compte));
