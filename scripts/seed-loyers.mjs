// Charge la « Carte des loyers » du ministère dans bo_loyers_commune.
//
//   node scripts/seed-loyers.mjs [millesime]
//
// À relancer à chaque nouveau millésime (publication annuelle, en décembre).
// Le fichier source est en latin-1 et sépare par des points-virgules, avec la
// virgule comme séparateur décimal — d'où le décodage explicite.

const MILLESIME = process.argv[2] ?? "2025";
const SB_URL = process.env.SUPABASE_URL ?? "https://sojtmhdrzmdbtqborxsi.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY absente");
  process.exit(1);
}

/** Retrouve l'URL du CSV « appartement » du millésime demandé sur data.gouv. */
async function urlCsv() {
  const r = await fetch(
    `https://www.data.gouv.fr/api/1/datasets/?q=${encodeURIComponent(`carte des loyers ${MILLESIME}`)}&page_size=5`,
  );
  const { data = [] } = await r.json();
  for (const jeu of data) {
    if (!jeu.title.includes(MILLESIME)) continue;
    const res = (jeu.resources ?? []).find(
      (x) => x.format === "csv" && /appartement/i.test(x.title) && !/pièces/i.test(x.title),
    );
    if (res) return res.url;
  }
  throw new Error(`aucun CSV appartement pour ${MILLESIME}`);
}

const nombre = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

async function main() {
  const url = await urlCsv();
  console.log("source :", url);
  const csv = new TextDecoder("latin1").decode(await (await fetch(url)).arrayBuffer());

  const lignes = csv.split(/\r?\n/).filter((l) => l.trim());
  const entetes = lignes[0].split(";").map((h) => h.replace(/"/g, ""));
  const col = (nom) => entetes.indexOf(nom);
  const [iInsee, iLib, iDep, iLoyer, iBas, iHaut, iType] =
    ["INSEE_C", "LIBGEO", "DEP", "loypredm2", "lwr.IPm2", "upr.IPm2", "TYPPRED"].map(col);
  if (iInsee < 0 || iLoyer < 0) throw new Error(`colonnes inattendues : ${entetes.join(", ")}`);

  const rows = [];
  for (const l of lignes.slice(1)) {
    const c = l.split(";").map((x) => x.replace(/^"|"$/g, ""));
    const loyer = nombre(c[iLoyer]);
    if (!c[iInsee] || loyer === null) continue;
    rows.push({
      code_insee: c[iInsee],
      libelle: c[iLib] ?? null,
      departement: c[iDep] ?? null,
      loyer_m2: loyer,
      borne_basse: nombre(c[iBas]),
      borne_haute: nombre(c[iHaut]),
      finesse: c[iType] ?? null,
      millesime: Number(MILLESIME),
    });
  }
  console.log(`${rows.length} communes à charger`);

  const PAQUET = 1000;
  for (let i = 0; i < rows.length; i += PAQUET) {
    const lot = rows.slice(i, i + PAQUET);
    const res = await fetch(`${SB_URL}/rest/v1/bo_loyers_commune?on_conflict=code_insee`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(lot),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    process.stdout.write(`\r${Math.min(i + PAQUET, rows.length)}/${rows.length}`);
  }
  console.log("\nterminé");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
