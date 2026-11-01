import { chromium, devices } from '/tmp/mshot/node_modules/playwright/index.mjs';
const b = await chromium.launch({ headless: false });
for (const [n, o] of [['desk', { viewport: { width: 1440, height: 900 } }], ['phone', { ...devices['iPhone 14'] }]]) {
  const c = await b.newContext(o), p = await c.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8770/index.html?norest&measure'); await p.waitForTimeout(2000);
  for (let y = 0; y < 30000; y += 700) { await p.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y); await p.waitForTimeout(30); }
  console.log(n, errs.slice(0, 5)); await c.close();
}
await b.close();
