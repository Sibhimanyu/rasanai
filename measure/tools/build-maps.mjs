// usage: node build-maps.mjs <desk|phone> <data.json> [madCeil dispCeil]  -> prints JSON of tables and heights
import { load } from './analyze.mjs';
import { derive } from './pacemap.mjs';
import fs from 'fs';
const [prof, file, mc, dc, outf] = process.argv.slice(2);
const phone = prof === 'phone', d = load(file), vh = d.geo.vh;
const g = Object.fromEntries(d.geo.secs.map((s) => [s.n, s]));
const base = { madCeil: +(mc || (phone ? 0.22 : 0.09)), dispCeil: +(dc || 1.2), holdMax: phone ? 1.0 : 1.2, target: +(process.env.TARGET || 0.88) };
const round = (v) => Math.round(v * 20) / 20;
const res = {};
// hero + flight share the scroll of the band: derive once over the hero's track, then split
const hero = derive(d, 'hero', { ...base });
const F0 = g.flight.top, oldH = hero.oldPx;
const pts = hero.pts, tot = hero.newPx;
const toKnots = (P, tol = 0.0002) => {
  let keep = [0, P.length - 1];
  const fn = () => { const K = []; keep.forEach((q) => K.push(P[q][0], P[q][1])); return K; };
  return { fn, keep, P };
};
import { pchipFn } from './pacemap.mjs';
function reduce(P, tol = 0.0002, maxK = 60) {
  let keep = [0, P.length - 1];
  for (;;) {
    const K = []; keep.forEach((q) => K.push(P[q][0], P[q][1])); const f = pchipFn(K);
    let w = -1, we = 0; for (let i = 0; i < P.length; i++) { const e = Math.abs(f(P[i][0]) - P[i][1]); if (e > we) { we = e; w = i; } }
    if (we <= tol || keep.length >= maxK) break; keep.push(w); keep.sort((a, b) => a - b);
  }
  const out = []; keep.forEach((q) => out.push(+P[q][0].toFixed(4), +P[q][1].toFixed(4))); return out;
}
res.hero = { knots: reduce(pts), heightVH: round(tot / vh + 1), oldVH: oldH / vh + 1 };
// the point where the flight band starts, in new scroll (from the cumulative map)
let YF0 = null; for (const p of pts) { if (p[1] * oldH >= F0 - 1e-6) { YF0 = p[0] * tot; break; } }
const fp = pts.filter((p) => p[1] * oldH >= F0 - 1e-6).map((p) => [(p[0] * tot - YF0) / (tot - YF0), (p[1] * oldH - F0) / (oldH - F0)]);
fp[0] = [0, 0];
res.flight = { knots: reduce(fp), heightVH: round((tot - YF0) / vh + 1), oldVH: g.flight.h / vh };
const one = (name, scene, o) => { const r = derive(d, scene, { ...base, ...o }); res[name] = { knots: r.knots, heightVH: round(r.newPx / vh + 1), oldVH: r.oldPx / vh + 1, dead: +(r.deadPx / vh).toFixed(2) }; };
one('crew', 'crew', { prefix: vh });
one('control', 'squeak', {});
if (phone) one('projects', 'projects', { y1: g.projects.top + 1.5 * vh }); else one('projects', 'projects', {});
one('download', 'end', {});
if (phone) { res.projects.trackVH = +(res.projects.heightVH - 1).toFixed(2); res.projects.heightVH = undefined; }
console.log(JSON.stringify(res, null, 1));
if (outf) fs.writeFileSync(outf, JSON.stringify(res));
