// usage: node measure.mjs <baseUrl> <desk|phone> <out.json> [stepPx]
import { chromium, devices } from '/tmp/mshot/node_modules/playwright/index.mjs';
import { createRequire } from 'module';
const sharp = createRequire('/tmp/mshot/package.json')('sharp');
import fs from 'fs';
const [base, prof, out, stepArg] = process.argv.slice(2);
const phone = prof === 'phone';
const STEP = +(stepArg || (phone ? 4 : 6));
const ctxOpts = phone ? { ...devices['iPhone 14'], deviceScaleFactor: 1 } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const GW = phone ? 78 : 144, GH = phone ? 169 : 90;
const browser = await chromium.launch({ headless: false, args: ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'] });

const TRACK = `(() => {
  const groups = { crew: '.crew-node, .cf, .fc', plane: '.f-plane', device: '.sq-device', letters: '.beat-char', hero: '.hero .fc, .cf' };
  window.__tr = function () {
    const vw = innerWidth, vh = innerHeight, res = {};
    for (const [g, sel] of Object.entries(groups)) {
      const arr = [];
      document.querySelectorAll(sel).forEach((el) => {
        let n = el, ok = true;
        for (let i = 0; i < 7 && n && n !== document.body; i++, n = n.parentElement) {
          const st = n.style; if (st.visibility === 'hidden' || st.opacity === '0' || (st.display === 'none')) { ok = false; break; }
        }
        if (!ok) return;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) return;
        const key = el.__k || (el.__k = ++window.__kc);
        arr.push([key, r.left, r.top, r.right, r.bottom]);
      });
      res[g] = arr;
    }
    return res;
  };
  window.__kc = 0;
})()`;

async function worker(y0, y1, label, warmFrom) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.goto(base + '/index.html?norest&measure', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: '*{scroll-behavior:auto!important}' });
  await page.evaluate(TRACK);
  if (warmFrom != null) await page.evaluate(async ([a, b]) => { for (let y = a; y < b; y += 80) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); } }, [warmFrom, y0]);
  const rows = [];
  let prevG = null, prevT = null;
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // warm: pass over the start of the segment region slowly so measured spots are taken
  for (let y = y0; y <= y1; y += STEP) {
    const info = await page.evaluate(async (y) => {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { y: scrollY, tr: window.__tr(), pace: window.__pace || {} };
    }, y);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    const g = await sharp(buf).resize(GW, GH, { fit: 'fill' }).greyscale().raw().toBuffer();
    let mad = 0, chg = 0;
    if (prevG) {
      for (let i = 0; i < g.length; i++) { const d = Math.abs(g[i] - prevG[i]); if (d > 3) mad += d - 3; if (d > 14) chg++; }   // 3 levels of dead zone: jpeg flips flat areas by a level or two
      mad /= g.length * 255; chg /= g.length;
    }
    // element displacement vs previous step
    const disp = {};
    if (prevT) {
      for (const k of Object.keys(info.tr)) {
        const pm = new Map(prevT[k].map((a) => [a[0], a]));
        let mx = 0;
        for (const a of info.tr[k]) { const b = pm.get(a[0]); if (!b) continue; const d = Math.max(Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]), Math.abs(a[4] - b[4])); if (d > mx) mx = d; }
        disp[k] = mx;
      }
    }
    rows.push({ y: info.y, mad, chg, disp, s: info.pace.s, s0: info.pace.s0 });
    prevG = g; prevT = info.tr;
  }
  await ctx.close();
  console.error(label, 'done', rows.length);
  return rows;
}

// geometry
const ctx0 = await browser.newContext(ctxOpts); const p0 = await ctx0.newPage();
await p0.goto(base + '/index.html?norest&measure', { waitUntil: 'load' }); await p0.waitForTimeout(2500);
const geo = await p0.evaluate(() => {
  const top = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : null; };
  const h = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().height : null; };
  return { total: document.documentElement.scrollHeight, vh: innerHeight, vw: innerWidth, cls: document.documentElement.className,
    secs: [['hero', '.hero.track'], ['flight', '.shot-band'], ['crew', '#flow'], ['squeak', '#control'], ['projects', '#projects'], ['faq', '#questions'], ['end', '#download']].map(([n, s]) => ({ n, top: top(s), h: h(s) })) };
});
await ctx0.close();
console.error(JSON.stringify(geo));
const sq = geo.secs.find((s) => s.n === 'squeak'), faq = geo.secs.find((s) => s.n === 'faq');
const maxY = geo.total - geo.vh;
const sqStart = Math.max(0, sq.top - geo.vh), sqEnd = Math.min(maxY, sq.top + sq.h);
const crew = geo.secs.find((s) => s.n === 'crew'), cMid = Math.round((crew.top + sqStart) / 2);
const jobs = [worker(0, crew.top, 'A0'), worker(crew.top, cMid, 'A1'), worker(cMid, sqStart, 'A2'), worker(sqStart, Math.round((sqStart + sqEnd) / 2), 'B1'), worker(Math.round((sqStart + sqEnd) / 2), sqEnd, 'B2', sqStart), worker(sqEnd, maxY, 'C')];
const parts = await Promise.all(jobs);
const rows = [].concat(...parts);
fs.writeFileSync(out, JSON.stringify({ geo, step: STEP, rows }));
await browser.close();
