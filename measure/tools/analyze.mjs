// usage: node analyze.mjs <json> [--json out]
import fs from 'fs';
export function load(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
export function series(d) {
  const vh = d.geo.vh, W = Math.round(vh * 0.1);   // smoothing window = 10% of a viewport height
  const rows = d.rows.slice().sort((a, b) => a.y - b.y).filter((r, i, a) => !i || r.y !== a[i - 1].y);
  const out = [];
  let lo = 1, hi = 0, sm = 0, sc = 0, sd = {};
  const keys = ['crew', 'plane', 'device', 'letters'];
  const px = (i) => rows[i].y - rows[i - 1].y;
  // trailing window sums over rows with y in (y-W, y]
  const q = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], dy = r.y - rows[i - 1].y;
    if (dy <= 0 || dy > 40) { q.length = 0; continue; }   // segment jump
    q.push({ y: r.y, dy, mad: r.mad, chg: r.chg, disp: r.disp });
    while (q.length && q[0].y <= r.y - W) q.shift();
    const tot = q.reduce((a, b) => a + b.dy, 0);
    if (tot < W * 0.6) continue;
    const o = { y: r.y, mad: q.reduce((a, b) => a + b.mad, 0) / tot * 100, chg: q.reduce((a, b) => a + b.chg, 0) / tot * 100, s: r.s };
    let mx = 0;
    for (const k of keys) { o[k] = q.reduce((a, b) => a + (b.disp[k] || 0), 0) / tot; if (o[k] > mx) mx = o[k]; }
    o.disp = mx;
    out.push(o);
  }
  return out;
}
export function sceneOf(d, y) {
  const g = Object.fromEntries(d.geo.secs.map((s) => [s.n, s]));
  if (y < g.flight.top) return 'hero';
  if (y < g.crew.top) return 'flight';
  if (y < g.squeak.top) return 'crew';
  if (y < g.projects.top) return 'squeak';
  if (y < g.faq.top) return 'projects';
  if (y < g.end.top) return 'faq';
  return 'end';
}
export function peaks(d, ser, key, n = 3) {
  const by = {};
  for (const o of ser) { const sc = sceneOf(d, o.y); (by[sc] ||= []).push(o); }
  const res = {};
  for (const [sc, arr] of Object.entries(by)) {
    const picked = [], sorted = arr.slice().sort((a, b) => b[key] - a[key]);
    for (const o of sorted) { if (picked.every((p) => Math.abs(p.y - o.y) > d.geo.vh * 0.5)) picked.push(o); if (picked.length >= n) break; }
    res[sc] = picked.map((o) => ({ y: o.y, v: +o[key].toFixed(3), s: o.s != null ? +o.s.toFixed(3) : undefined }));
  }
  return res;
}
if ((process.argv[1] || '').endsWith('analyze.mjs')) {
  const d = load(process.argv[2]), ser = series(d);
  console.log('geo', JSON.stringify(d.geo.secs.map((s) => [s.n, Math.round(s.top), Math.round(s.h)])), 'vh', d.geo.vh);
  for (const key of ['mad', 'disp']) { console.log('PEAKS', key); const p = peaks(d, ser, key); for (const [k, v] of Object.entries(p)) console.log(' ', k, JSON.stringify(v)); }
  const vals = ser.map((o) => o.mad).sort((a, b) => a - b); const pc = (p) => vals[Math.floor(p * vals.length)].toFixed(3);
  console.log('mad percentiles p10', pc(.1), 'p50', pc(.5), 'p90', pc(.9), 'p99', pc(.99), 'max', vals.at(-1).toFixed(3));
}
