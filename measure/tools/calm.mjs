import { chromium } from '/tmp/mshot/node_modules/playwright/index.mjs';
const b = await chromium.launch({ headless: false });
for (const [n, o] of [['calm-desk', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }], ['calm-phone', { viewport: { width: 390, height: 664 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true }]]) {
  const c = await b.newContext(o), p = await c.newPage(), errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('http://localhost:8770/index.html'); await p.waitForTimeout(2000);
  for (let y = 0; y < 40000; y += 1500) { await p.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y); await p.waitForTimeout(40); }
  console.log(n, await p.evaluate(() => ({ cls: document.documentElement.className, h: document.documentElement.scrollHeight, crewReady: !!document.querySelector('.crew-ready'), hostReady: !!document.querySelector('.host-ready'), styled: document.querySelectorAll('[style]').length })), errs);
  await c.close();
}
await b.close();
