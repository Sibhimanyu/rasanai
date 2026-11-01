import { load, series, sceneOf } from './analyze.mjs';
const [f, madT = '0.004', dispT = '0.08', minVH = '0.8'] = process.argv.slice(2);
const d = load(f), ser = series(d); const vh = d.geo.vh;
let start = null, last = null; const out = [];
const g = Object.fromEntries(d.geo.secs.map((s) => [s.n, s]));
const flush = () => { if (start != null && last - start >= +minVH * vh) { const sc = sceneOf(d, start); out.push(sc.padEnd(8) + ' y ' + Math.round(start) + '-' + Math.round(last) + '  len ' + ((last - start) / vh).toFixed(2) + 'vh  p ' + ((start - g[sc].top) / Math.max(1, g[sc].h - vh)).toFixed(3) + '-' + ((last - g[sc].top) / Math.max(1, g[sc].h - vh)).toFixed(3)); } start = null; };
for (const o of ser) { const dead = o.mad < +madT && o.disp < +dispT; if (dead) { if (start == null) start = o.y; last = o.y; } else flush(); }
flush(); console.log(out.join('\n'));
