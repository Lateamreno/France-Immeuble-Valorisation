import { chromium } from 'playwright-core';
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [`--proxy-server=${proxy}`, '--proxy-bypass-list=localhost;127.0.0.1', '--ignore-certificate-errors'],
});
const S = '/tmp/claude-0/-home-user-France-Immeuble-Valorisation/7d6da58d-b3d8-5dce-9efe-e72bffc6604a/scratchpad';
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto('http://localhost:3000/?agent=marc-antoine', { waitUntil: 'load', timeout: 40000 });
await p.waitForTimeout(1200);
const card = p.locator('.kard', { hasText: 'TEST CLAUDE' });
await card.locator('button:has-text("Contacté")').click();
await p.waitForTimeout(3500);
const col = p.locator('.col', { hasText: 'IMMEUBLES A ESTIMER' });
console.log('dans colonne A ESTIMER:', await col.locator('.kard', { hasText: 'TEST CLAUDE' }).count());
await p.screenshot({ path: `${S}/write-dashboard2.png` });
await b.close();
console.log('done');
