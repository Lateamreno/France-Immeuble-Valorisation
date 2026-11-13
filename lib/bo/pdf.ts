// Fabrication du PDF du dossier d'estimation.
//
// Le dossier est une page HTML A4 (voir components/dossier-estimation.tsx) :
// on la fait imprimer par un Chromium sans écran, exactement comme le BO
// actuel dont le PDF est un « Print To PDF ». Deux environnements :
//   • en local / conteneur : le Chromium déjà installé (PLAYWRIGHT_BROWSERS_PATH
//     ou CHROMIUM_PATH) ;
//   • sur Vercel : le binaire fourni par @sparticuz/chromium, prévu pour les
//     fonctions serverless.
import puppeteer from "puppeteer-core";

/** Chemin du navigateur selon l'environnement d'exécution. */
async function navigateur() {
  const local = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
  const { existsSync } = await import("node:fs");
  if (existsSync(local)) {
    return { executablePath: local, args: ["--no-sandbox", "--disable-dev-shm-usage"], headless: true as const };
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true as const,
  };
}

/** Photographie un fragment HTML (sert à coller les deux cartes en une seule
 *  image, comme la capture d'écran que faisait l'agent à la main). */
export async function pngDepuisHtml(html: string, largeur: number, hauteur: number): Promise<Buffer> {
  const opts = await navigateur();
  const b = await puppeteer.launch(opts);
  try {
    const p = await b.newPage();
    await p.setViewport({ width: largeur, height: hauteur, deviceScaleFactor: 2 });
    await p.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const png = await p.screenshot({ type: "png" });
    return Buffer.from(png);
  } finally {
    await b.close();
  }
}

/**
 * Le plafond d'un PDF du BO (MAV, 10/11 : « le dossier complet de Paris 1 est
 * super lourd, 7 Mo ; on peut pas faire en sorte que ça ne dépasse jamais
 * 2 Mo ? »). Le poids venait des images PNG, que Chrome imprime telles
 * quelles : la photo de l'agent (1 024 px pour 2 cm imprimés) et le plan
 * cadastral (1 800 px, 3,5 Mo). Les photos, elles, étaient déjà des JPEG.
 */
export const PDF_MAX_OCTETS = 2 * 1024 * 1024;

/* Chaque passe réécrit les images à la taille où elles sont IMPRIMÉES
   (`echelle` × leur largeur à l'écran, 96 px par pouce : 2 ≈ 190 dpi), en
   JPEG de `qualite`. Une image transparente (logo) reste en PNG, réduite. */
const PASSES: [echelle: number, qualite: number][] = [[2, 0.82], [1.6, 0.72], [1.25, 0.62], [1, 0.5], [0.8, 0.42]];

/** Imprime une URL de l'application en PDF A4, fonds compris, sous `maxOctets`. */
export async function pdfDepuisUrl(url: string, cookie?: string, maxOctets = PDF_MAX_OCTETS): Promise<Buffer> {
  const opts = await navigateur();
  const b = await puppeteer.launch(opts);
  try {
    const p = await b.newPage();
    if (cookie) await p.setExtraHTTPHeaders({ cookie });
    await p.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    // Les photos passent par notre relais : on attend qu'elles soient toutes
    // décodées, sinon le PDF part avec des cadres vides.
    await p.evaluate(async () => {
      await Promise.all(
        [...document.images].filter((i) => !i.complete).map((i) =>
          new Promise((ok) => { i.onload = i.onerror = () => ok(null); })),
      );
    });
    const imprimer = async () => Buffer.from(await p.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    }));
    let meilleur: Buffer | null = null;
    for (const [echelle, qualite] of PASSES) {
      await p.evaluate(recompresserImages, echelle, qualite);
      const pdf = await imprimer();
      if (!meilleur || pdf.length < meilleur.length) meilleur = pdf;
      if (pdf.length <= maxOctets) break;
    }
    return meilleur!;
  } finally {
    await b.close();
  }
}

/* Exécutée DANS la page imprimée : redessine chaque image à sa taille
   d'impression. Une même source garde le même résultat (la photo de l'agent,
   imprimée deux fois, n'est embarquée qu'une fois). */
async function recompresserImages(echelle: number, qualite: number) {
  const cache = new Map<string, string>();
  for (const img of [...document.images]) {
    const r = img.getBoundingClientRect();
    if (!img.complete || img.naturalWidth === 0 || r.width === 0 || r.height === 0) continue;
    /* La taille utile : la boîte imprimée × échelle, sans jamais agrandir.
       Avec `object-fit: cover`, c'est le plus grand des deux rapports. */
    const ratio = Math.min(1, Math.max((r.width * echelle) / img.naturalWidth, (r.height * echelle) / img.naturalHeight));
    const l = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const cle = `${img.currentSrc || img.src}|${l}x${h}`;
    let sortie = cache.get(cle);
    if (!sortie) {
      const c = document.createElement("canvas");
      c.width = l; c.height = h;
      const x = c.getContext("2d");
      if (!x) continue;
      x.drawImage(img, 0, 0, l, h);
      let transparente = false;
      try {
        const d = x.getImageData(0, 0, l, h).data;
        for (let k = 3; k < d.length; k += 4 * 31) if (d[k] < 250) { transparente = true; break; }
      } catch {
        continue; // image d'un autre site : on ne peut pas la relire, on la laisse
      }
      if (transparente) {
        sortie = c.toDataURL("image/png");
      } else {
        /* Un fond blanc sous le JPEG : il n'a pas de transparence. */
        x.globalCompositeOperation = "destination-over";
        x.fillStyle = "#fff";
        x.fillRect(0, 0, l, h);
        sortie = c.toDataURL("image/jpeg", qualite);
      }
      cache.set(cle, sortie);
    }
    if (img.src === sortie) continue;
    await new Promise((ok) => {
      img.onload = img.onerror = () => ok(null);
      img.removeAttribute("srcset");
      img.src = sortie!;
    });
  }
}
