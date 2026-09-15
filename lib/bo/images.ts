import "server-only";
import sharp from "sharp";

// Normalisation des photos avant dépôt dans le bucket (retour #95).
//
// Deux exigences de MAV :
//  1. on doit pouvoir déposer n'importe quoi, y compris des HEIC sortis d'un
//     iPhone ;
//  2. le redimensionnement doit **convertir** en même temps, pour qu'aucun
//     HEIC ne se retrouve dans un PDF (Chromium ne sait pas les décoder).
//
// Conséquence : tout ce qui entre ressort en JPEG. Il n'y a jamais de HEIC
// dans le bucket, donc jamais dans un dossier de vente.

/** Le plus grand côté d'une photo stockée. Au-delà, on ne gagne rien à
 *  l'écran et le PDF gonfle pour rien. */
const COTE_MAX = 2200;
/** Vignette : ce que la grille et l'état locatif affichent. */
const COTE_VIGNETTE = 600;

export type ImageWeb = {
  /** Le JPEG plein format (2200 px max). */
  pleine: Buffer;
  /** Le JPEG de vignette (600 px max). */
  vignette: Buffer;
  largeur: number;
  hauteur: number;
  /** Vrai si le fichier d'origine était un HEIC/HEIF converti ici. */
  converti: boolean;
};

const EXT_HEIC = /\.(heic|heif)$/i;

export const estHeic = (nom: string, mime: string) =>
  /^image\/(heic|heif)/i.test(mime) || EXT_HEIC.test(nom);

/**
 * Décode le fichier reçu et en sort deux JPEG.
 *
 * sharp gère seul les JPEG/PNG/WebP/AVIF. Pour le HEIC des iPhones (codec
 * HEVC), les binaires officiels de libvips ne sont pas compilés avec le
 * décodeur : on repasse alors par `heic-convert`, qui embarque libheif en
 * WebAssembly et n'a donc besoin d'aucune dépendance système.
 */
export async function versWeb(fichier: File): Promise<ImageWeb> {
  const brut = Buffer.from(await fichier.arrayBuffer());
  const heic = estHeic(fichier.name, fichier.type);

  // Attention : sur un HEIC d'iPhone, `sharp.metadata()` répond sans broncher
  // (« format: heif ») et c'est seulement au décodage que libvips lâche
  // « Support for this compression ». Le test des métadonnées ne prouve donc
  // rien — on envoie tous les HEIC au décodeur WebAssembly, point.
  const source = heic ? Buffer.from(await decoderHeic(brut)) : brut;

  // `rotate()` sans argument applique l'orientation EXIF : sans lui, les
  // photos prises en portrait ressortent couchées.
  const base = sharp(source, { failOn: "none" }).rotate();

  const jpeg = (cote: number) =>
    base
      .clone()
      .resize({ width: cote, height: cote, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: cote === COTE_MAX ? 82 : 72, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

  let pleine: { data: Buffer; info: { width: number; height: number } };
  let vignette: { data: Buffer };
  try {
    [pleine, vignette] = await Promise.all([jpeg(COTE_MAX), jpeg(COTE_VIGNETTE)]);
  } catch (e) {
    throw new Error(erreurLisible(fichier.name, e));
  }

  return {
    pleine: pleine.data,
    vignette: vignette.data,
    largeur: pleine.info.width,
    hauteur: pleine.info.height,
    converti: heic,
  };
}

async function decoderHeic(brut: Buffer): Promise<Uint8Array> {
  // Import différé : le décodeur WebAssembly pèse quelques mégaoctets, inutile
  // de le charger sur les dépôts de JPEG (l'immense majorité).
  const { default: convert } = await import("heic-convert");
  try {
    return await convert({ buffer: brut, format: "JPEG", quality: 0.92 });
  } catch (e) {
    throw new Error(`HEIC illisible (${e instanceof Error ? e.message.slice(0, 100) : String(e)})`);
  }
}

function erreurLisible(nom: string, e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return `Image « ${nom} » illisible (${m.slice(0, 120)})`;
}
