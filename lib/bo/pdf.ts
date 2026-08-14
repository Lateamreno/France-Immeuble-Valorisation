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

/** Imprime une URL de l'application en PDF A4, fonds compris. */
export async function pdfDepuisUrl(url: string, cookie?: string): Promise<Buffer> {
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
    const pdf = await p.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await b.close();
  }
}
