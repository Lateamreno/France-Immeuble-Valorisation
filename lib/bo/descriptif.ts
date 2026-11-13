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

import { descriptifLegal } from "../mandat";

const S = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const N = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Ce dont la rédaction a besoin — un sous-ensemble de la fiche. */
export type SourceDescriptif = {
  im: Record<string, unknown>;
  lots: Record<string, unknown>[];
  parcelles: Record<string, unknown>[];
};

/**
 * « L'immeuble est à 5 min à pied du métro et à 3 min à pied des commerces. »
 * — la phrase d'emplacement.
 *
 * Retour #622 : « L'immeuble se trouve des transports Val d'Argenteuil à
 * 25 min à pied et des commerces Centre Commercial … » ne se lisait pas. MAV :
 * « pas obligé de dire le nom de la gare, juste il est à x min à pied de la
 * gare et à x min à pied des commerces ». Les noms restent sur la fiche
 * (Emplacement) ; le texte ne garde que les distances. Quand la gare est loin
 * (un quart d'heure ou plus) ou absente, l'arrêt de bus le plus proche est
 * cité d'abord : c'est lui qu'on prendra.
 */
function quelTransport(nom: string, departement: string): string {
  if (/\btram/i.test(nom)) return "du tramway";
  if (/\bRER\b/.test(nom)) return "du RER";
  if (/m[ée]tro|^M\s?\d|station de m/i.test(nom)) return "du métro";
  if (/\bgare\b|\bTER\b|\bSNCF\b/i.test(nom)) return "de la gare";
  return departement === "75" ? "du métro" : "de la gare";
}

function phraseAcces(im: Record<string, unknown>): string | undefined {
  const lire = (cle: string) => ({
    nom: S(im[`emp_${cle}_name`]).trim(),
    min: N(im[`emp_${cle}_time`]),
    moyen: S(im[`emp_${cle}_moyen`]).trim() || "à pied",
  });
  const dire = (x: { nom: string; min?: number; moyen: string }, de: string) =>
    x.min !== undefined ? `à ${x.min} min ${x.moyen} ${de}` : x.nom ? `proche ${de}` : undefined;
  const dpt = S(im.adresse_dpt).trim() || S(im.adresse_zipcode).slice(0, 2);
  const gare = lire("gare"), bus = lire("bus"), com = lire("com");
  const garePresente = !!gare.nom || gare.min !== undefined;
  const bouts = [
    (!garePresente || (gare.min ?? 0) >= 15) ? dire(bus, "d'un arrêt de bus") : undefined,
    garePresente ? dire(gare, quelTransport(gare.nom, dpt)) : undefined,
    dire(com, "des commerces"),
  ].filter((x): x is string => !!x);
  if (bouts.length === 0) return undefined;
  /* « proche du » après « est » : « L'immeuble est proche du métro ». */
  return `L'immeuble est ${bouts.length > 1 ? `${bouts.slice(0, -1).join(", ")} et ${bouts[bouts.length - 1]}` : bouts[0]}.`;
}

/**
 * Le descriptif rédigé depuis la fiche. Reprend celui du mandat — la
 * désignation légale, qui dit tout du bâti et de l'occupation — et y ajoute
 * l'accès, que le mandat n'a pas à connaître mais qu'un acquéreur cherche en
 * premier.
 */
export function descriptifAuto(b: SourceDescriptif): string {
  const refs = b.parcelles.map((p) => S(p.ref_cadastre).trim()).filter(Boolean).join(", ");
  /* Retour #323 : ce texte-là part dans les annonces et dans les dossiers
     envoyés aux acquéreurs. Il n'y donne donc ni l'adresse exacte ni le
     cadastre — la doctrine maison est que l'adresse se communique, mais ne se
     publie pas. La désignation complète reste dans le mandat. */
  const legal = descriptifLegal(
    b.im, b.lots,
    refs || S(b.im.ref_cadastre) || undefined,
    N(b.im.ter_surface),
    true,
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
