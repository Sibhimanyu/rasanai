import { load, series } from './analyze.mjs';
const [prof, bf, af, madC, dispC] = process.argv.slice(2);
const phone = prof === 'phone';
function ranges(d, projTrack) {
  const vh = d.geo.vh, g = Object.fromEntries(d.geo.secs.map((s) => [s.n, s]));
  return {
    hero: [0, g.flight.top],
    flight: [g.flight.top, g.crew.top],
    crew: [g.crew.top + vh, g.crew.top + g.crew.h - vh],
    squeak: [g.squeak.top, g.squeak.top + g.squeak.h - vh],
    projects: [g.projects.top, phone ? g.projects.top + (projTrack - 0.5) * vh : g.projects.top + g.projects.h - vh],
    end: [g.end.top, g.end.top + g.end.h - vh],
  };
}
const out = {};
for (const [lab, f, pt] of [['before', bf, 1.5], ['after', af, +process.env.MTRACK || 2.2]]) {
  const d = load(f), ser = series(d), R = ranges(d, pt); out[lab] = { total: d.geo.total, vh: d.geo.vh, scenes: {} };
  for (const [n, [a, b]] of Object.entries(R)) {
    const s = ser.filter((o) => o.y >= a && o.y <= b); let mm = 0, md = 0, ym = 0, yd = 0, dead = 0, run = 0, maxRun = 0;
    for (const o of s) { if (o.mad > mm) { mm = o.mad; ym = o.y; } if (o.disp > md && !(o.disp > .97 && o.disp < 1.03 && o.mad < .002)) { md = o.disp; yd = o.y; } if (o.mad < +madC * 0.07 && o.disp < 0.05) { run++; maxRun = Math.max(maxRun, run); } else run = 0; }
    out[lab].scenes[n] = { lenVH: +((b - a) / d.geo.vh).toFixed(1), peakMad: +mm.toFixed(3), peakDisp: +md.toFixed(2), longestDeadVH: +(maxRun * 6 / d.geo.vh * (phone ? 4 / 6 : 1)).toFixed(2) };
  }
}
console.log(prof, 'total px', out.before.total, '->', out.after.total, ' (', (out.before.total / out.before.vh).toFixed(1), '->', (out.after.total / out.after.vh).toFixed(1), 'vh)');
for (const n of Object.keys(out.before.scenes)) { const b = out.before.scenes[n], a = out.after.scenes[n]; console.log(n.padEnd(9), 'len', b.lenVH, '->', a.lenVH, 'vh | peak image change', b.peakMad, '->', a.peakMad, '| peak element speed', b.peakDisp, '->', a.peakDisp, '| longest dead', b.longestDeadVH, '->', a.longestDeadVH, 'vh'); }
