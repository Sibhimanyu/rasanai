import { chromium, devices } from '/tmp/mshot/node_modules/playwright/index.mjs';
const [base, prof] = process.argv.slice(2);
const phone = prof === 'phone';
const ctxOpts = phone ? { ...devices['iPhone 14'], deviceScaleFactor: 1 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const b = await chromium.launch({ headless: false });
const ctx = await b.newContext(ctxOpts), page = await ctx.newPage();
await page.goto(base + '/index.html?pace'); await page.waitForTimeout(2500);
await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
const info = await page.evaluate(() => { const el = document.querySelector('#flow'), top = el.getBoundingClientRect().top + scrollY; return { top, span: el.offsetHeight - innerHeight, vh: innerHeight }; });
const cdp = await ctx.newCDPSession(page);
const state = () => page.evaluate(() => { const cards = [...document.querySelectorAll('.crew-label')].map((c) => +c.style.opacity || 0); return { y: Math.round(scrollY), maxCard: Math.max(...cards), which: cards.indexOf(Math.max(...cards)) }; });
const rests = await page.evaluate(() => window.__pace.rests()); console.log('rests', JSON.stringify(rests));
const start = rests[1] + (phone ? 0 : 0);
for (const D of [500, 1100, 2000, 3600, -700, -1600]) {
  await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), start); await page.waitForTimeout(2200);
  await cdp.send('Input.synthesizeScrollGesture', { x: phone ? 195 : 720, y: phone ? 450 : 450, yDistance: -D, speed: phone ? 2500 : 3000, gestureSourceType: phone ? 'touch' : 'mouse' });
  await page.waitForTimeout(600); const mid = await state();
  await page.waitForTimeout(4200); const end = await state();
  await page.waitForTimeout(800); const end2 = await state();
  console.log('flick', D, 'start', Math.round(start), '| 600ms', JSON.stringify(mid), '| settled', JSON.stringify(end), 'stable', end2.y === end.y);
}
await b.close();
