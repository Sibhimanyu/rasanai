// usage: node pacemap.mjs <data.json> <scene> <madCeil> <dispCeil> [options as key=value]
// Derives the knots [x0,t0,...] that spread the scene's timeline over its scroll so that no stretch exceeds the ceilings,
// and pulls long dead stretches in. The data must have been measured with the identity map for this scene.
import { load, sceneOf } from './analyze.mjs';
export function derive(d, scene, o) {
  const vh = d.geo.vh, g = Object.fromEntries(d.geo.secs.map((s) => [s.n, s]));
  const sc = g[scene];
  const nameOf = { control: 'squeak', download: 'end', hero: 'hero', flight: 'flight', crew: 'crew', projects: 'projects' };
  const pre = o.prefix ?? 0, y0 = (o.y0 ?? sc.top) + pre, y1 = o.y1 ?? (sc.top + sc.h - vh);
  const rows = d.rows.filter((r) => r.y >= y0 && r.y <= y1).sort((a, b) => a.y - b.y);
  const BIN = Math.round(vh * (o.bin ?? 0.05)), nb = Math.ceil((y1 - y0) / BIN);
  const mad = new Float64Array(nb), dsp = new Float64Array(nb), len = new Float64Array(nb).fill(0);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], dy = r.y - rows[i - 1].y; if (dy <= 0 || dy > 40) continue;
    const b = Math.min(nb - 1, Math.floor((r.y - y0) / BIN));
    mad[b] += r.mad; let mx = 0; for (const k of ['crew', 'plane', 'device', 'letters']) mx = Math.max(mx, (r.disp && r.disp[k]) || 0);
    // ordinary page scroll (an element simply scrolling with the page, exactly 1 px per px) is not motion of the scene
    const ratio = mx / dy; dsp[b] += ratio > 0.97 && ratio < 1.03 ? 0 : mx; len[b] += dy;
  }
  const dens = (arr, per) => arr.map((v, i) => (len[i] ? (v / len[i]) * per : 0));
  let dm = dens(mad, 100), dd = dens(dsp, 1);
  const sm = (a) => a.map((v, i) => 0.25 * (a[i - 1] ?? v) + 0.5 * v + 0.25 * (a[i + 1] ?? v));
  dm = sm(dm); dd = sm(dd);
  const Bm = o.madCeil, Bd = o.dispCeil, tgt = o.target ?? 0.88;
  // need[i]: how many times longer than now this bin must be so that both metrics sit at the target share of their ceiling
  const need = dm.map((v, i) => Math.max(v / (Bm * tgt), dd[i] / (Bd * tgt)));
  let k = need.map((v) => Math.max(1, v));
  // dead stretches: contiguous bins well below the floor are pulled in to at most holdMax * vh
  const Fm = o.floorMad ?? Bm * 0.07, Fd = o.floorDisp ?? 0.05, holdMax = (o.holdMax ?? 1.0) * vh, holdMin = (o.holdMin ?? 0.6) * vh;
  const dead = dm.map((v, i) => v < Fm && dd[i] < Fd);
  const kd = new Float64Array(nb).fill(1);
  for (let i = 0; i < nb;) { if (!dead[i]) { i++; continue; } let j = i; while (j < nb && dead[j]) j++; const L = (j - i) * BIN; if (L > holdMax * 1.3) { const f = holdMax / L; for (let q = i; q < j; q++) kd[q] = f; } i = j; }
  if (o.noCompress) kd.fill(1);
  // lengths, then smooth the factor (log space) and re-assert the need so the smoothing never lets a peak back through
  let f = k.map((v, i) => v * kd[i]);
  for (let it = 0; it < 6; it++) {
    const lg = f.map(Math.log), s2 = lg.map((v, i) => (lg[i - 2] ?? v) * 0.1 + (lg[i - 1] ?? v) * 0.2 + v * 0.4 + (lg[i + 1] ?? v) * 0.2 + (lg[i + 2] ?? v) * 0.1);
    f = s2.map((v, i) => Math.max(Math.exp(v), need[i] * kd[i] * 1.0 > Math.exp(v) ? need[i] : 0, Math.exp(v)));
    f = f.map((v, i) => Math.max(v, need[i]));
  }
  // cumulative new length against old position
  const cumNew = [0], cumOld = [0];
  for (let i = 0; i < nb; i++) { const oldL = i === nb - 1 ? (y1 - y0) - BIN * (nb - 1) : BIN; cumOld.push(cumOld[i] + oldL); cumNew.push(cumNew[i] + oldL * f[i]); }
  const total = cumNew[nb] + pre, oldTotal = cumOld[nb] + pre;
  let pts = cumNew.map((c, i) => [(c + pre) / total, (cumOld[i] + pre) / oldTotal]);
  if (pre) pts.unshift([0, 0]);
  // greedy knot reduction with the same monotone cubic the page uses
  const tol = o.tol ?? 0.0002; let keep = [0, pts.length - 1];
  const ev = (ks, x) => { const K = []; ks.forEach((q) => K.push(pts[q][0], pts[q][1])); return pchipEval(K, x); };
  for (;;) {
    let worst = -1, we = 0; const K = []; keep.forEach((q) => K.push(pts[q][0], pts[q][1])); const fn = pchipFn(K);
    for (let i = 0; i < pts.length; i++) { const e = Math.abs(fn(pts[i][0]) - pts[i][1]); if (e > we) { we = e; worst = i; } }
    if (we <= tol || keep.length > (o.maxKnots ?? 70)) break; keep.push(worst); keep.sort((a, b) => a - b);
  }
  const knots = []; keep.forEach((q) => knots.push(+pts[q][0].toFixed(4), +pts[q][1].toFixed(4)));
  return { pts, f, BIN, y0, y1, knots, newPx: total, oldPx: oldTotal, vh, newVH: total / vh, oldVH: oldTotal / vh, scale: total / oldTotal, need, dm, dd, deadPx: kd.reduce((a, v) => a + (v < 1 ? BIN * (1 - v) : 0), 0) };
}
// the same monotone cubic as home.js
function pchipFn(K) {
  const n = K.length / 2, xs = [], ys = [], dl = [], m = [];
  for (let i = 0; i < n; i++) { xs.push(K[2 * i]); ys.push(K[2 * i + 1]); }
  for (let i = 0; i < n - 1; i++) dl.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = dl[0]; m[n - 1] = dl[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = dl[i - 1] * dl[i] <= 0 ? 0 : 2 * dl[i - 1] * dl[i] / (dl[i - 1] + dl[i]);
  for (let i = 0; i < n - 1; i++) { if (dl[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / dl[i], b = m[i + 1] / dl[i], q = a * a + b * b; if (q > 9) { const t = 3 / Math.sqrt(q); m[i] = t * a * dl[i]; m[i + 1] = t * b * dl[i]; } }
  return (x) => { if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1]; let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; } const h = xs[hi] - xs[lo], t = (x - xs[lo]) / h, t2 = t * t, t3 = t2 * t; return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi]; };
}
function pchipEval(K, x) { return pchipFn(K)(x); }
export { pchipFn };
if ((process.argv[1] || '').endsWith('pacemap.mjs')) {
  const [f, scene, mc, dc, ...rest] = process.argv.slice(2);
  const o = { madCeil: +mc, dispCeil: +dc }; rest.forEach((kv) => { const [k, v] = kv.split('='); o[k] = isNaN(+v) ? v : +v; });
  const r = derive(load(f), scene, o);
  console.log(scene, 'old', r.oldVH.toFixed(1) + 'vh', 'new', r.newVH.toFixed(1) + 'vh', 'x' + r.scale.toFixed(2), 'knots', r.knots.length / 2, 'deadSaved', (r.deadPx / r.vh).toFixed(1) + 'vh');
  console.log(JSON.stringify(r.knots));
}
