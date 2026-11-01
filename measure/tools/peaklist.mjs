import { load, series, sceneOf } from './analyze.mjs';
const [f, key = 'mad', thr = '0.1', scene] = process.argv.slice(2);
const d = load(f), ser = series(d);
// local maxima above thr, merged within 0.4vh
const res = []; let cur = null;
for (const o of ser) {
  if (scene && sceneOf(d, o.y) !== scene) continue;
  if (o[key] >= +thr) { if (cur && o.y - cur.last < d.geo.vh * 0.4) { cur.last = o.y; cur.end = o.y; if (o[key] > cur.v) { cur.v = o[key]; cur.y = o.y; cur.s = o.s; } } else { cur = { y: o.y, v: o[key], s: o.s, start: o.y, end: o.y, last: o.y, sc: sceneOf(d, o.y) }; res.push(cur); } }
}
const g = Object.fromEntries(d.geo.secs.map((s) => [s.n, s]));
for (const r of res) { const sc = g[r.sc]; const p = (r.y - sc.top) / Math.max(1, sc.h - d.geo.vh); console.log(r.sc.padEnd(8), 'y', Math.round(r.y), 'p', p.toFixed(3), key, r.v.toFixed(3), 's', r.s == null ? '' : r.s.toFixed(3), 'width', Math.round(r.end - r.start)); }
