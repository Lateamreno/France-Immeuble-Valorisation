// Recoupement des SCI d'un département : pour chacune, ses gérants et les
// autres sociétés qu'ils dirigent. Gratuit, sans aucun envoi ; les résultats
// vont dans `fi_pm_recoupe`, que la Prospection affiche et filtre.
//
// Lancer : node --experimental-strip-types --import ./scripts/resolveur-reg.mjs \
//            scripts/recoupement.mts 92 6
//   (département, nombre minimal de locaux ; les SCI déjà recoupées sont sautées)
import { enregistrerRecoupes, recouper, type Recoupe } from "../lib/bo/recoupement.ts";

const [dep = "92", min = "6"] = process.argv.slice(2);
const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const h = { apikey: key, Authorization: `Bearer ${key}` };

const lire = async (chemin: string) => {
  const tout: Record<string, unknown>[] = [];
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${url}/rest/v1/${chemin}`, { headers: { ...h, Range: `${de}-${de + 999}` } });
    const lot = (await r.json()) as Record<string, unknown>[];
    tout.push(...lot);
    if (lot.length < 1000) return tout;
  }
};

const cibles = await lire(`fi_pm_cible?select=siren&forme=eq.SCI&locaux=gte.${min}&insee=like.${dep}*`);
const faits = new Set((await lire(`fi_pm_recoupe?select=siren&dep=eq.${dep}`)).map((r) => String(r.siren)));
const sirens = [...new Set(cibles.map((c) => String(c.siren)))].filter((s) => /^\d{9}$/.test(s) && !faits.has(s));
console.log(`${dep} : ${sirens.length} SCI à recouper (${faits.size} déjà faites)`);

const compte: Record<string, number> = {};
let tampon: Recoupe[] = [];
let n = 0;
const vider = async () => { const t = tampon; tampon = []; await enregistrerRecoupes(t); };

/* Deux à la fois : l'annuaire accepte quelques appels par seconde. */
const file = [...sirens];
await Promise.all([0, 1].map(async () => {
  for (let s = file.shift(); s; s = file.shift()) {
    const r = await recouper(s, dep).catch(() => null);
    if (!r) continue;
    compte[r.joignable] = (compte[r.joignable] ?? 0) + 1;
    tampon.push(r);
    if (tampon.length >= 25) await vider();
    if (++n % 100 === 0) console.log(n, JSON.stringify(compte));
  }
}));
await vider();
console.log("fini", n, JSON.stringify(compte));
