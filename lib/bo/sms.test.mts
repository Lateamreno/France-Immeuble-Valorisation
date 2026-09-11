import { segments, etatSms, PLAFOND_SMS } from "./sms";
const cas: [string, number, string][] = [
  ["Bonjour, un immeuble de rapport a Nanterre, 12 lots, 9,2% brut. Dossier sur demande.", 1, "court, GSM-7 → 1 segment"],
  ["a".repeat(160), 1, "160 caracteres pile → 1 segment"],
  ["a".repeat(161), 2, "161 caracteres → 2 segments (153 par segment)"],
  ["Immeuble à Nanterre — 9,2 %", 1, "accents et tiret cadratin"],
  ["Immeuble 🏢 à vendre", 1, "un emoji → compté en UCS-2"],
  ["é".repeat(71), 1, "71 é : é EST dans l'alphabet GSM → 1 segment"],
  ["ê".repeat(71), 2, "71 ê : ê n'y est PAS → UCS-2, 2 segments de 67"],
  ["œ".repeat(80), 2, "80 œ hors GSM → 2 segments"],
  ["", 0, "message vide → aucun segment"],
];
let ko = 0;
for (const [txt, attendu, quoi] of cas) {
  const r = segments(txt);
  const ok = r === attendu;
  if (!ok) ko++;
  console.log(`${ok ? "✓" : "✗"} ${quoi} → ${r} (attendu ${attendu})`);
}
console.log("\nÉtat du pont :", JSON.stringify(etatSms(), null, 1));
console.log("Plafond par envoi :", PLAFOND_SMS);
process.exit(ko === 0 ? 0 : 1);
