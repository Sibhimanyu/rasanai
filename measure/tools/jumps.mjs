import { chromium, devices } from '/tmp/mshot/node_modules/playwright/index.mjs';
const [base, prof] = process.argv.slice(2); const phone = prof === 'phone';
const b = await chromium.launch({ headless: false });
const ctx = await b.newContext(phone ? { ...devices['iPhone 14'], deviceScaleFactor: 1 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(base + '/index.html?pace'); await p.waitForTimeout(2500);
if (phone) await p.evaluate(() => { document.querySelector('.menu-toggle').click(); });
for (const j of ['crew', 'squeak', 'projects', 'crew']) {
  if (phone) await p.evaluate(() => { const m = document.querySelector('.menu-toggle'); if (m.getAttribute('aria-expanded') !== 'true') m.click(); });
  await p.evaluate((j) => document.querySelector('[data-jump="' + j + '"]').click(), j); await p.waitForTimeout(1500);
  const st = await p.evaluate(() => ({ y: Math.round(scrollY), s: window.__pace.s != null ? +window.__pace.s.toFixed(3) : null, lead: (document.querySelector('.crew-lead') || {}).style && document.querySelector('.crew-lead').style.opacity, step: [...document.querySelectorAll('.sq-step')].map((e) => e.style.opacity).join(','), proj: document.querySelector('#projects .proj-head') ? 'ok' : '' }));
  console.log(j, JSON.stringify(st));
}
console.log('errors', errs);
await b.close();
