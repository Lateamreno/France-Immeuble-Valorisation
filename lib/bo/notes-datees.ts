/**
 * Les notes internes se lisent comme un journal (MAV, 08/10/26).
 *
 * « Lorsqu'on écrit à un jour précis, tu nous mets la date à laquelle on a
 * écrit entre parenthèses » — à condition que ça ne fasse pas de fouillis
 * quand on corrige. D'où la règle, arrêtée avec lui après maquette :
 *
 *  - la date se pose UNE fois, en tête d'un NOUVEAU bloc — c'est-à-dire au
 *    premier caractère tapé après une ligne vide (ou en tout début de note) ;
 *  - elle porte les initiales de l'agent aux commandes : « (08/10/26 MAV) » ;
 *  - corriger un bloc existant ne touche pas à sa date ; un retour à la ligne
 *    simple dans un même bloc n'ajoute rien ; les notes déjà écrites ne sont
 *    pas modifiées ;
 *  - un bouton remet les blocs dans l'ordre chronologique.
 *
 * Ce que l'on ne fait PAS, et pourquoi : la date à chaque enregistrement
 * automatique (dix dates pour une idée, les notes partent toutes seules après
 * chaque frappe) et la date réécrite quand on corrige un vieux bloc (on
 * perdrait la date d'origine, qui est l'information utile).
 *
 * Tout est du texte : l'agent peut toujours effacer ou corriger une date à la
 * main. Fonctions pures, partagées par le rail et la section Notes.
 */

/** « (08/10/26 MAV) » — avec l'espace qui précède la première phrase. */
export function enTeteNote(initiales: string, d: Date = new Date()): string {
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aa = String(d.getFullYear() % 100).padStart(2, "0");
  const qui = initiales.trim();
  return `(${jj}/${mm}/${aa}${qui ? ` ${qui}` : ""}) `;
}

const DEJA_DATEE = /^\(\d\d\/\d\d\/\d\d/;

/**
 * Après une frappe : si le caractère tapé est le PREMIER d'un nouveau bloc, la
 * valeur à mettre dans le champ, avec le curseur qui va avec. Sinon `null`, et
 * le champ reste tel que l'agent l'a laissé.
 *
 * @param valeur   le texte du champ APRÈS la frappe
 * @param curseur  la position du curseur après la frappe
 * @param tape     ce que la frappe a inséré (`InputEvent.data`)
 * @param enTete   le préfixe à poser (`enTeteNote(...)`)
 */
export function daterNouveauBloc(
  valeur: string, curseur: number, tape: string | null | undefined, enTete: string,
): { valeur: string; curseur: number } | null {
  /* Un seul caractère tapé : un collage ou une saisie composée ne datent rien. */
  if (!tape || tape.includes("\n") || [...tape].length !== 1) return null;
  const debutLigne = valeur.lastIndexOf("\n", curseur - 1) + 1;
  const ligne = valeur.slice(debutLigne, curseur);
  /* Seul le tout premier caractère de la ligne déclenche : une correction au
     milieu d'une ligne, ou un collage, ne datent rien. */
  if (ligne !== tape) return null;
  const avant = valeur.slice(0, debutLigne);
  const nouveauBloc = debutLigne === 0 || /\n[ \t]*\n$/.test(avant) || /^[ \t]*\n$/.test(avant);
  if (!nouveauBloc) return null;
  if (DEJA_DATEE.test(valeur.slice(debutLigne))) return null;
  return { valeur: avant + enTete + valeur.slice(debutLigne), curseur: curseur + enTete.length };
}

/** Les blocs d'une note : des paragraphes séparés par au moins une ligne vide. */
export function blocsNote(texte: string): string[] {
  const t = texte.trim();
  return t ? t.split(/\n[ \t]*\n+/) : [];
}

/** La clé de tri d'un bloc daté (aammjj en nombre), ou null s'il ne l'est pas. */
function cleDate(bloc: string): number | null {
  const m = /^\((\d\d)\/(\d\d)\/(\d\d)/.exec(bloc);
  return m ? Number(m[3]) * 10_000 + Number(m[2]) * 100 + Number(m[1]) : null;
}

/** Vrai s'il y a quelque chose à remettre dans l'ordre. */
export function triPossible(texte: string): boolean {
  return trierBlocsNote(texte) !== texte.trim();
}

/**
 * Les blocs remis dans l'ordre chronologique, du plus ancien au plus récent.
 * Un bloc sans date est antérieur à la règle : il reste en tête, dans son
 * ordre d'origine. Deux blocs du même jour gardent leur ordre d'écriture.
 */
export function trierBlocsNote(texte: string): string {
  const blocs = blocsNote(texte);
  const ranges = blocs.map((b, i) => ({ b: b.trim(), i, k: cleDate(b.trim()) ?? -1 }));
  ranges.sort((x, y) => x.k - y.k || x.i - y.i);
  return ranges.map((r) => r.b).join("\n\n");
}
