// Barème d'honoraires et son inversion : les bornes de tranche et les
// planchers, là où un barème par paliers se casse.
// Lancer : node --experimental-strip-types --import ./scripts/resolveur-reg.mjs \
//            scripts/bareme.test.mts
import { honorairesBareme, netVendeurDepuisHai, plafondTaux } from "../lib/bareme.ts";
import { resoudrePrix } from "../lib/mandat.ts";

let ko = 0;
const eq = (quoi: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log(`✗ ${quoi} → ${JSON.stringify(a)}  attendu ${JSON.stringify(b)}`); ko++; }
};

// --- Barème direct
eq("100 000 € : plancher 12 000", honorairesBareme(100_000), { honos: 12_000, taux: 12 });
eq("240 000 € : bascule plancher/taux", honorairesBareme(240_000), { honos: 12_000, taux: 5 });
eq("1 M€ : 5 %", honorairesBareme(1_000_000), { honos: 50_000, taux: 5 });
eq("5 M€ : haut de tranche 1", honorairesBareme(5_000_000), { honos: 250_000, taux: 5 });
eq("6 M€ : plancher 250 000", honorairesBareme(6_000_000), { honos: 250_000, taux: 4.17 });
eq("6,25 M€ : bascule plancher/4 %", honorairesBareme(6_250_000), { honos: 250_000, taux: 4 });
eq("8 M€ : 4 %", honorairesBareme(8_000_000), { honos: 320_000, taux: 4 });
eq("12 M€ : tranche prolongée", honorairesBareme(12_000_000), { honos: 480_000, taux: 4 });

// --- Le barème est un plafond, jamais un plancher de facturation
eq("plafond à 1 M€", plafondTaux(1_000_000), 5);
eq("plafond à 8 M€", plafondTaux(8_000_000), 4);

// --- Inversion : nv + honos doit toujours redonner le HAI, au centime
const hais = [50_000, 112_000, 252_000, 1_050_000, 5_250_000, 6_000_000, 6_500_000, 8_320_000, 12_480_000];
for (const hai of hais) {
  const r = netVendeurDepuisHai(hai);
  if (r.nv + r.honos !== hai) { console.log(`✗ inversion ${hai} : ${r.nv} + ${r.honos} = ${r.nv + r.honos}`); ko++; }
  // et le net vendeur retrouvé doit bien porter les honoraires du barème
  const b = honorairesBareme(r.nv);
  if (Math.abs(b.honos - r.honos) > 1) { console.log(`✗ aller-retour ${hai} : barème ${b.honos} ≠ ${r.honos}`); ko++; }
}
eq("5 250 000 HAI → 5 M€ net", netVendeurDepuisHai(5_250_000).nv, 5_000_000);
eq("1 050 000 HAI → 1 M€ net", netVendeurDepuisHai(1_050_000).nv, 1_000_000);
eq("112 000 HAI → 100 000 net (plancher)", netVendeurDepuisHai(112_000).nv, 100_000);

// --- Le HAI ne bouge JAMAIS quand on touche une autre case (retour #190)
const dep = resoudrePrix({ hai: 1_050_000 }, ["hai"]);
eq("saisie HAI", [dep.nv, dep.honos, dep.taux], [1_000_000, 50_000, 5]);
const h2 = resoudrePrix({ ...dep, honos: 40_000 }, ["hai", "honos"]);
eq("honos modifiés : HAI figé", h2.hai, 1_050_000);
eq("honos modifiés : net vendeur suit", h2.nv, 1_010_000);
const n2 = resoudrePrix({ ...dep, nv: 990_000 }, ["hai", "nv"]);
eq("net vendeur modifié : HAI figé", n2.hai, 1_050_000);
eq("net vendeur modifié : honos suivent", n2.honos, 60_000);
const t2 = resoudrePrix({ ...dep, taux: 4 }, ["hai", "taux"]);
eq("taux modifié : HAI figé", t2.hai, 1_050_000);
eq("taux modifié : net vendeur suit", t2.nv, 1_009_615);

console.log(ko === 0 ? "✓ barème et résolution du prix : tous les cas passent" : `${ko} ÉCHEC(S)`);
