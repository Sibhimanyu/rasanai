// usage: node feel.mjs <baseUrl> <desk|phone> <label> <speed px/s> [outdir]
import { chromium, devices } from '/tmp/mshot/node_modules/playwright/index.mjs';
import { createRequire } from 'module'; const sharp = createRequire('/tmp/mshot/package.json')('sharp');
import fs from 'fs';
const [base, prof, label, speedArg, outdir = '/tmp/pacing-tools/feel'] = process.argv.slice(2);
const phone = prof === 'phone', speed = +speedArg;
fs.mkdirSync(outdir, { recursive: true });
const ctxOpts = phone ? { ...devices['iPhone 14'], deviceScaleFactor: 1 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const browser = await chromium.launch({ headless: false, args: ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'] });
// 1. calibrate: scroll positions where the Squeak timeline s is .30, .70, .99 (direct mode)
const cctx = await browser.newContext(ctxOpts), cp = await cctx.newPage();
await cp.goto(base + '/index.html?measure&norest'); await cp.waitForTimeout(2500);
const cal = await cp.evaluate(async () => {
  const el = document.querySelector('#control'), top = el.getBoundingClientRect().top + scrollY, end = top + el.offsetHeight - innerHeight;
  const sAt = async (y) => { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return window.__pace.s; };
  const find = async (target) => { let lo = top + innerHeight * .5, hi = end; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; const s = await sAt(m); if (s < target) lo = m; else hi = m; } return Math.round((lo + hi) / 2); };
  return { a: await find(.28), b: await find(.70), c: await find(.985), top, end };
});
await cctx.close();
console.error('calibration', JSON.stringify(cal));
const LOG = `(() => { window.__log = []; const f = document.querySelector('.sq-fly'), p = document.querySelector('.f-plane');
  (function loop(t) { let x = null, y = null, o = 0; if (p && f) { o = +getComputedStyle(f).opacity; if (o > 0.05) { const r = p.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; } } window.__log.push([t, scrollY, x, y]); requestAnimationFrame(loop); })(0); })()`;
async function run(name, y0, y1, dir) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage();
  await page.goto(base + '/index.html'); await page.waitForTimeout(2500);
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), dir > 0 ? y0 : y1);
  await page.waitForTimeout(2500);
  await page.evaluate(LOG);
  const cdp = await ctx.newCDPSession(page);
  const frames = []; cdp.on('Page.screencastFrame', (f) => { frames.push(Buffer.from(f.data, 'base64')); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: phone ? 390 : 720, everyNthFrame: 1 });
  const dist = (y1 - y0) * dir;
  await cdp.send('Input.synthesizeScrollGesture', { x: phone ? 195 : 720, y: phone ? 400 : 450, yDistance: -dist, speed, gestureSourceType: phone ? 'touch' : 'mouse', preventFling: true });
  await page.waitForTimeout(phone ? 9000 : 8000);
  await cdp.send('Page.stopScreencast');
  const log = await page.evaluate(() => window.__log);
  await ctx.close();
  // per-frame plane displacement (consecutive frames where it is visible in both)
  let max = 0, n = 0, sum = 0, maxScroll = 0; const big = [];
  for (let i = 1; i < log.length; i++) {
    const a = log[i - 1], b = log[i]; maxScroll = Math.max(maxScroll, Math.abs(b[1] - a[1]));
    if (a[2] != null && b[2] != null) { const d = Math.hypot(b[2] - a[2], b[3] - a[3]); n++; sum += d; if (d > max) max = d; if (d > 80) big.push(+d.toFixed(0)); }
  }
  const disp = log.filter((l, i) => i && l[2] != null && log[i - 1][2] != null).map((l, i2) => 0);
  const res = { name, frames: log.length, planeFrames: n, maxPlaneStepPx: +max.toFixed(1), meanPlaneStepPx: +(sum / Math.max(1, n)).toFixed(1), framesOver80: big.length, maxScrollPerFrame: +maxScroll.toFixed(1), shots: frames.length };
  // contact sheet of up to 12 screencast frames spread over the frames where the plane is visible
  const picks = []; const K = Math.min(12, frames.length); for (let i = 0; i < K; i++) picks.push(frames[Math.floor((i + 0.5) * frames.length / K)]);
  const W = phone ? 195 : 360, H = phone ? 332 : 225, cols = phone ? 6 : 4, rows = Math.ceil(K / cols);
  const tiles = await Promise.all(picks.map((b) => sharp(b).resize(W, H, { fit: 'fill' }).jpeg().toBuffer()));
  await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: '#fff' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * W, top: Math.floor(i / cols) * H }))).png().toFile(`${outdir}/${label}-${prof}-${name}.png`);
  fs.writeFileSync(`${outdir}/${label}-${prof}-${name}.json`, JSON.stringify({ res, log }));
  return res;
}
const out = [];
out.push(await run('go-down', cal.a, cal.b, +1));
out.push(await run('back-down', cal.b, cal.c, +1));
out.push(await run('go-up', cal.a, cal.b, -1));
out.push(await run('back-up', cal.b, cal.c, -1));
console.log(JSON.stringify({ label, prof, speed, out }, null, 1));
await browser.close();
