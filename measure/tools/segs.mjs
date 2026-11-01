import { load } from './analyze.mjs';
import { derive } from './pacemap.mjs';
const [f, scene, mc, dc, ...rest] = process.argv.slice(2);
const o = { madCeil: +mc, dispCeil: +dc }; rest.forEach((kv) => { const [k, v] = kv.split('='); o[k] = isNaN(+v) ? v : +v; });
const d = load(f), r = derive(d, scene, o);
const { f: fac, BIN, vh } = r; let i = 0; const out = [];
while (i < fac.length) { if (fac[i] < 1.25) { i++; continue; } let j = i, sum = 0, mx = 0, mm = 0, dd = 0; while (j < fac.length && fac[j] >= 1.25) { sum += fac[j] * BIN; mx = Math.max(mx, fac[j]); mm = Math.max(mm, r.dm[j]); dd = Math.max(dd, r.dd[j]); j++; }
  out.push(`old ${((r.y0 + i * BIN)).toFixed(0)}..${(r.y0 + j * BIN).toFixed(0)} (${((j - i) * BIN / vh).toFixed(2)}vh -> ${(sum / vh).toFixed(2)}vh) maxf ${mx.toFixed(2)} peakMad ${mm.toFixed(3)} peakDisp ${dd.toFixed(2)}`); i = j; }
console.log(out.join('\n'));
