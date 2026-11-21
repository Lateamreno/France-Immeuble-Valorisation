// Charge les loyers PAR TYPOLOGIE de la « Carte des loyers » du ministère dans
// bo_loyers_commune (#608) : appartements de 1 ou 2 pièces, de 3 pièces ou
// plus, et maisons — à côté de l'indicateur tous appartements (seed-loyers.mjs).
//
//   node scripts/seed-loyers-typologies.mjs [millesime]
//
// N'écrit QUE les colonnes de typologie d'une commune déjà présente : une
// commune absente du fichier tous appartements n'est pas créée ici.
// Mêmes fichiers que le ministère publie chaque décembre : latin-1, point-virgule,
// virgule décimale.

const MILLESIME = process.argv[2] ?? "2025";
const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY absente");
  process.exit(1);
}

const TYPOLOGIES = [
  { suffixe: "t12", motif: /1 ou 2 pi[eè]ces/i, fichier: /pred-app12/i },
  { suffixe: "t3", motif: /3 pi[eè]ces ou plus/i, fichier: /pred-app3/i },
  { suffixe: "maison", motif: /maison/i, fichier: /pred-mai/i },
];

async function ressources() {
  const r = await fetch(
    `https://www.data.gouv.fr/api/1/datasets/?q=${encodeURIComponent(`carte des loyers ${MILLESIME}`)}&page_size=5`,
  );
  const { data = [] } = await r.json();
  const jeu = data.find((j) => j.title.includes(MILLESIME));
  if (!jeu) throw new Error(`aucun jeu « carte des loyers » ${MILLESIME}`);
  return (jeu.resources ?? []).filter((x) => x.format === "csv");
}

const nombre = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

async function lire(url) {
  const csv = new TextDecoder("latin1").decode(await (await fetch(url)).arrayBuffer());
  const lignes = csv.split(/\r?\n/).filter((l) => l.trim());
  const entetes = lignes[0].split(";").map((h) => h.replace(/"/g, ""));
  const col = (nom) => entetes.indexOf(nom);
  const [iInsee, iLoyer, iBas, iHaut] = ["INSEE_C", "loypredm2", "lwr.IPm2", "upr.IPm2"].map(col);
  if (iInsee < 0 || iLoyer < 0) throw new Error(`colonnes inattendues : ${entetes.join(", ")}`);
  const out = new Map();
  for (const l of lignes.slice(1)) {
    const c = l.split(";").map((x) => x.replace(/^"|"$/g, ""));
    const loyer = nombre(c[iLoyer]);
    if (c[iInsee] && loyer !== null) out.set(c[iInsee], { loyer, bas: nombre(c[iBas]), haut: nombre(c[iHaut]) });
  }
  return out;
}

async function main() {
  const res = await ressources();
  const parCommune = new Map();
  for (const t of TYPOLOGIES) {
    const r = res.find((x) => t.fichier.test(x.url) || t.motif.test(x.title));
    if (!r) throw new Error(`fichier ${t.suffixe} introuvable`);
    console.log(`${t.suffixe} : ${r.url}`);
    for (const [insee, v] of await lire(r.url)) {
      const ligne = parCommune.get(insee) ?? { code_insee: insee };
      ligne[`loyer_m2_${t.suffixe}`] = v.loyer;
      ligne[`bas_${t.suffixe}`] = v.bas;
      ligne[`haut_${t.suffixe}`] = v.haut;
      parCommune.set(insee, ligne);
    }
  }
  /* Seulement les communes déjà connues : la clé `loyer_m2` est obligatoire. */
  const connues = new Set();
  for (let depart = 0; ; depart += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/bo_loyers_commune?select=code_insee&order=code_insee&offset=${depart}&limit=1000`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    const page = await r.json();
    page.forEach((x) => connues.add(x.code_insee));
    if (page.length < 1000) break;
  }
  const rows = [...parCommune.values()].filter((r) => connues.has(r.code_insee));
  const completes = rows.map((r) => {
    const o = { code_insee: r.code_insee };
    for (const t of TYPOLOGIES) for (const k of [`loyer_m2_${t.suffixe}`, `bas_${t.suffixe}`, `haut_${t.suffixe}`]) o[k] = r[k] ?? null;
    return o;
  });
  console.log(`${completes.length} communes à compléter`);
  const PAQUET = 1000;
  for (let i = 0; i < completes.length; i += PAQUET) {
    const lot = completes.slice(i, i + PAQUET);
    const r = await fetch(`${SB_URL}/rest/v1/rpc/bo_loyers_typologies_maj`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_lignes: lot }),
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
    process.stdout.write(`\r${Math.min(i + PAQUET, completes.length)}/${completes.length}`);
  }
  console.log("\nterminé");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
