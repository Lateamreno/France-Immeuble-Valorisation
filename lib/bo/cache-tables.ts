/**
 * Décrocher le cache d'une table du miroir après une écriture.
 *
 * La lecture garde chaque page du miroir cinq minutes sous l'étiquette de sa
 * table (`lirePage`, lib/bubble/server.ts). Une écriture qui ne décroche pas
 * l'étiquette laisse l'écran sur l'ancienne version : l'agent clique, la base
 * change, rien ne bouge à l'écran, et il croit que ça n'a pas marché. C'est ce
 * qui est arrivé à la cloche des relances (MAV, 16/11 : « ça n'a pas l'air de
 * marcher ») : la coupure était bien écrite, la carte restait verte.
 *
 * Le chemin principal (`rpc` de lib/bo/actions.ts) le faisait déjà ; les
 * modules qui écrivent par leur propre chemin passent désormais ici.
 * Ce fichier n'est pas « use server » : c'est un utilitaire, pas une action.
 */
import { revalidateTag, updateTag } from "next/cache";

export function invaliderTable(table: unknown) {
  if (typeof table !== "string" || !/^bo_\w+$/.test(table)) return;
  try {
    revalidateTag(table, { expire: 0 });
  } catch {
    /* Hors requête (script, tâche différée) : rien à purger d'ici. */
  }
  try {
    updateTag(table);
  } catch {
    /* Hors action serveur (webhook, cron) : la purge ci-dessus suffit. */
  }
}
