// Réduction d'une photo dans le navigateur, avant l'envoi (retour #517 :
// « c'est super long, on peut accélérer ? »).
//
// Une photo de téléphone pèse 3 à 12 Mo, une capture d'écran Retina 2 à 4 Mo :
// tout ça montait tel quel jusqu'au serveur, qui la réduisait ensuite à
// 2 200 px. Réduite ici, elle pèse quelques centaines de Ko — c'est l'envoi
// qui gagne, surtout en 4G. Le serveur garde sa propre conversion (HEIC,
// orientation, vignette) : ceci n'est qu'un raccourci, jamais une condition.

/** Le plus grand côté envoyé : un peu au-dessus de ce que garde le serveur. */
const COTE_CLIENT = 2400;

/**
 * Un HEIC que le navigateur ne sait pas décoder (tout sauf Safari), ou une
 * image illisible, part tel quel : le serveur s'en charge.
 */
export async function reduireImage(f: File): Promise<File> {
  if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(f.name)) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, COTE_CLIENT / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const ctx = c.getContext("2d");
    if (!ctx) return f;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    /* Un JPEG déjà léger peut ressortir plus lourd : on garde alors l'original. */
    if (!blob || (f.type === "image/jpeg" && blob.size >= f.size)) return f;
    return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}
