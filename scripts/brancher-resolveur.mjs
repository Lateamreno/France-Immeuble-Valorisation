/* Branche le résolveur d'extensions des tests. Voir resolveur-tests.mjs. */
import { register } from "node:module";
register("./resolveur-tests.mjs", import.meta.url);
