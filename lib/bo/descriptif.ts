/**
 * Le descriptif du bien, rédigé depuis la fiche (retour #232).
 *
 * MAV : « le descriptif, je veux que tu le fasses automatiquement avec l'état
 * locatif et l'emplacement — tu peux reprendre le descriptif du mandat, c'est
 * pas mal, en rajoutant la distance de la gare et des commerces. Par ailleurs
 * je veux qu'on puisse le modifier à la main au besoin. Quand on a modifié à
 * la main et qu'on modifie l'état locatif ou l'emplacement, qui aurait donc dû
 * modifier le descriptif entre deux dossiers, tu le précises et tu dis qu'il
 * faut modifier le descriptif ou du moins le vérifier. »
 *
 * D'où trois notions, et c'est la troisième qui fait tout le travail :
 *
 *   · le texte AUTOMATIQUE, recalculé à chaque affichage depuis l'état locatif
 *     et l'emplacement ;
 *   · le texte RETENU, celui que le dossier imprime — l'automatique tant que
 *     personne n'a pris la main ;
 *   · le texte automatique TÉMOIN, figé au moment où l'agent a pris la main.
 *     Quand l'automatique d'aujourd'hui ne ressemble plus au témoin, c'est que
 *     la fiche a bougé depuis : le texte écrit à la main parle peut-être d'un
 *     immeuble qui n'existe plus. C'est ce qu'on signale.
 *
 * Sans témoin, on ne saurait pas distinguer « la fiche a changé » de « l'agent
 * a simplement reformulé » : les deux donnent un texte différent de
 * l'automatique.
 */

import { descriptifLegal } from "@/lib/mandat";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Ce dont la rédaction a besoin — un sous-ensemble de la fiche. */
export type SourceDescriptif = {
  im: Record<string, unknown>;
  lots: Record<string, unknown>[];
  parcelles: Record<string, unknown>[];
};

/** « à 8 min à pied de la gare Saint-Jean » — la phrase d'emplacement. */
function phraseAcces(im: Record<string, unknown>): string | undefined {
  const bouts: string[] = [];
  const dire = (cle: string, quoi: string) => {
    const nom = S(im[`emp_${cle}_name`]).trim();
    const min = N(im[`emp_${cle}_time`]);
    const moyen = S(im[`emp_${cle}_moyen`]).trim() || "à pied";
    if (!nom && min === undefined) return;
    /* Le nom seul ne dit pas la distance, la durée seule ne dit pas de quoi :
       on écrit ce qu'on a, dans l'ordre qui se lit. */
    if (nom && min !== undefined) bouts.push(`${quoi} ${nom} à ${min} min ${moyen}`);
    else if (nom) bouts.push(`${quoi} ${nom}`);
    else bouts.push(`${quoi} à ${min} min ${moyen}`);
  };
  dire("gare", "des transports");
  dire("com", "des commerces");
  if (bouts.length === 0) return undefined;
  const ville = S(im.adresse_ville).trim();
  return `L'immeuble se trouve ${bouts.join(" et ")}${ville ? `, à ${ville}` : ""}.`;
}

/**
 * Le descriptif rédigé depuis la fiche. Reprend celui du mandat — la
 * désignation légale, qui dit tout du bâti et de l'occupation — et y ajoute
 * l'accès, que le mandat n'a pas à connaître mais qu'un acquéreur cherche en
 * premier.
 */
export function descriptifAuto(b: SourceDescriptif): string {
  const refs = b.parcelles.map((p) => S(p.ref_cadastre).trim()).filter(Boolean).join(", ");
  const legal = descriptifLegal(
    b.im, b.lots,
    refs || S(b.im.ref_cadastre) || undefined,
    N(b.im.ter_surface),
  );
  const acces = phraseAcces(b.im);
  return [legal, acces].filter(Boolean).join("\n\n");
}

/**
 * Le texte que le dossier imprime : celui de l'agent s'il en a écrit un, sinon
 * l'automatique. Un dossier n'a jamais de page blanche à cet endroit.
 */
export const descriptifRetenu = (b: SourceDescriptif) =>
  S(b.im.descriptif).trim() || descriptifAuto(b);

/**
 * La fiche a-t-elle bougé depuis que l'agent a pris la main ? Vrai seulement
 * s'il existe un texte manuel ET un témoin qui ne correspond plus.
 */
export function descriptifAVerifier(b: SourceDescriptif): boolean {
  const manuel = S(b.im.descriptif).trim();
  const temoin = S(b.im.descriptif_auto).trim();
  if (!manuel || !temoin) return false;
  return descriptifAuto(b).trim() !== temoin;
}
