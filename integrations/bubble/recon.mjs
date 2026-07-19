// Reconnaissance de la base Bubble France Immeuble (lecture seule).
//
// Usage :
//   export BUBBLE_APP_URL='https://ton-app.bubbleapps.io'
//   export BUBBLE_API_TOKEN='...'          # facultatif si data types publics
//   export BUBBLE_ENV='live'               # ou 'test'
//   node integrations/bubble/recon.mjs operation immeuble lot prestataire
//
// Pour chaque data type passé en argument : compte les lignes, affiche la liste
// des champs détectés et un échantillon anonymisé (1 ligne). Bubble n'expose pas
// d'endpoint « liste des data types » — il faut donc nommer les types à sonder.

import { fetchPage, apiRoot } from "./bubbleClient.mjs";
import { loadConfig, KNOWN_TYPES } from "./config.mjs";

// Vérifie l'environnement avant tout (message clair si BUBBLE_APP_URL manque).
loadConfig({ requireToken: false });

// Types passés en argument, sinon les types connus par défaut.
const types = process.argv.slice(2);
if (types.length === 0) {
  types.push(...KNOWN_TYPES);
  console.log(
    `Aucun data type fourni → types connus par défaut : ${KNOWN_TYPES.join(", ")}\n` +
      `(passe-les en argument pour en sonder d'autres : node integrations/bubble/recon.mjs immeuble proprietaire lot ...)\n`,
  );
}

function fieldsOf(rows) {
  const set = new Set();
  for (const row of rows) for (const k of Object.keys(row)) set.add(k);
  return [...set].sort();
}

console.log(`API root : ${apiRoot()}\n`);

let anyError = false;

for (const type of types) {
  try {
    // 1 seule ligne pour l'échantillon, mais Bubble renvoie "remaining" = total-1.
    const page = await fetchPage(type, { limit: 1 });
    const total = page.count + page.remaining;
    console.log(`■ ${type}`);
    console.log(`  lignes (estimé) : ${total}`);
    if (page.results.length > 0) {
      console.log(`  champs : ${fieldsOf(page.results).join(", ")}`);
      console.log(`  échantillon :`);
      console.log(
        JSON.stringify(page.results[0], null, 2)
          .split("\n")
          .map((l) => "    " + l)
          .join("\n"),
      );
    } else {
      console.log("  (aucune ligne)");
    }
    console.log("");
  } catch (err) {
    anyError = true;
    console.log(`■ ${type}`);
    console.log(`  ⚠️  ${err.message}\n`);
  }
}

process.exit(anyError ? 1 : 0);
