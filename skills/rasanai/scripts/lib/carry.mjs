// Carry at every seam, measured from the pixels (onetake: "never replace a beat, carry it: something on screen survives
// every section boundary"). For each seam (a beat boundary from the plan; with no plan, a hard cut found from frame
// differences) the frames just before and just after are compared (+-0.1 s and +-0.3 s, the best pair wins). The score is the
// share of the before-frame's foreground structure (edge pixels: type, shapes, card borders; a flat or soft-gradient ground has
// none) that reappears after, allowing a shift (up to 15% of the width) and a scale change (0.7 to 1.4): a carried object that
// moves or grows counts, and so does a match cut on a shape. The share is corrected for chance (how dense the after-frame's
// edges are), so a busy frame cannot score by luck; 0 = nothing survived, 1 = all of it did. Grey frames from ffmpeg, no window.
//
//   import { measureCarry } from "./lib/carry.mjs";
//   const { seams, cuts } = await measureCarry(mp4, { seams: [2.0, 4.1] });   // seams omitted: the hard cuts found
//   -> seams: [{ t, score, dt, scale, dx, dy, edges }]   score null = no foreground before the seam (nothing to carry)
//   node lib/carry.mjs <film.mp4> [t,t,...]     the table, for calibration
import { spawnSync } from "node:child_process";

export const CW = 320, CH = 180, CFPS = 20; // analysis frames: 320x180 grey at 20 fps (0.1 s = 2 frames)
export const CARRY = {
  edge_t: 16, // gradient (|gx|+|gy|, grey levels) above this is structure
  min_edges: 40, // fewer edge pixels in the before-frame than this: nothing on screen to carry
  radius: 0.15, // shift search, share of the width
  scales: [0.7, 0.8, 0.9, 1, 1.12, 1.25, 1.4],
  gaps: [0.1, 0.3], // seconds either side of the seam
  refine: 6, // coarse candidates refined pixel by pixel
  max_pts: 1200, // edge pixels sampled from the before-frame
  cut_min: 14, // a hard cut: mean grey change at least this ...
  cut_ratio: 3.5, // ... and this many times the change around it
  cut_gap_s: 0.5, // two cuts never closer than this
};

export function decodeGrey(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `fps=${CFPS},scale=${CW}:${CH}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${file}: ${String(r.stderr || "").trim().split("\n").pop()}`);
  const n = Math.floor(r.stdout.length / (CW * CH)), frames = [];
  for (let i = 0; i < n; i++) frames.push(r.stdout.subarray(i * CW * CH, (i + 1) * CW * CH));
  return frames;
}

// edge pixels of a 3x3-blurred frame: the blur drops halftone dots, dither and film grain (1 to 2 px texture) and keeps type and shapes
export function edgeMask(a) {
  const g = new Uint8Array(CW * CH), m = new Uint8Array(CW * CH);
  for (let y = 1; y < CH - 1; y++) for (let x = 1; x < CW - 1; x++) {
    const o = y * CW + x;
    g[o] = (a[o - CW - 1] + a[o - CW] + a[o - CW + 1] + a[o - 1] + a[o] + a[o + 1] + a[o + CW - 1] + a[o + CW] + a[o + CW + 1]) / 9;
  }
  for (let y = 2; y < CH - 2; y++) for (let x = 2; x < CW - 2; x++) {
    const o = y * CW + x;
    if (Math.abs(g[o + 1] - g[o - 1]) + Math.abs(g[o + CW] - g[o - CW]) > CARRY.edge_t) m[o] = 1;
  }
  return m;
}

// hard cuts: frame steps whose mean change is large against the steps around them (a fast move is large too, but not 3.5x its neighbours)
export function findCuts(frames) {
  const d = [0];
  for (let i = 1; i < frames.length; i++) { let s = 0, n = 0; for (let p = 0; p < frames[i].length; p += 7) { s += Math.abs(frames[i][p] - frames[i - 1][p]); n++; } d.push(s / n); }
  const cuts = [];
  for (let i = 2; i < d.length - 2; i++) {
    const near = [d[i - 2], d[i - 1], d[i + 1], d[i + 2]].sort((x, y) => x - y), ref = (near[1] + near[2]) / 2;
    if (d[i] >= CARRY.cut_min && d[i] >= CARRY.cut_ratio * Math.max(ref, 1) && d[i] >= d[i - 1] && d[i] >= d[i + 1]) {
      const t = i / CFPS;
      if (!cuts.length || t - cuts[cuts.length - 1] >= CARRY.cut_gap_s) cuts.push(Math.round(t * 100) / 100);
    }
  }
  return cuts;
}

// B's edge map and how dense it is around each pixel (a 21 px box): what a point lands on by luck, so a busy frame cannot score
function field(mask) {
  const ii = new Int32Array((CW + 1) * (CH + 1));
  for (let y = 0; y < CH; y++) { let row = 0; for (let x = 0; x < CW; x++) { row += mask[y * CW + x]; ii[(y + 1) * (CW + 1) + x + 1] = ii[y * (CW + 1) + x + 1] + row; } }
  const ld = new Float32Array(CW * CH), R = 10;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const x0 = Math.max(0, x - R), x1 = Math.min(CW, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(CH, y + R + 1);
    ld[y * CW + x] = (ii[y1 * (CW + 1) + x1] - ii[y0 * (CW + 1) + x1] - ii[y1 * (CW + 1) + x0] + ii[y0 * (CW + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  }
  return { mask, ld };
}
// (hits - hits expected by luck) / (points - hits expected by luck) for A's points P moved by scale s about the centre and shift (dx, dy)
function at(P, f, s, dx, dy) {
  let hit = 0, exp = 0;
  for (let i = 0; i < P.length; i += 2) {
    const x = Math.round((P[i] - CW / 2) * s + CW / 2 + dx), y = Math.round((P[i + 1] - CH / 2) * s + CH / 2 + dy);
    if (x >= 0 && x < CW && y >= 0 && y < CH) { hit += f.mask[y * CW + x]; exp += f.ld[y * CW + x]; }
  }
  const m = P.length / 2;
  return (hit - exp) / (m - exp);
}

// share of A's edge pixels that land on B's edges under the best shift and scale, corrected for chance. Two passes: a coarse
// search against B dilated by 1 px (a step of 3 px), then the best few refined pixel by pixel against B itself, so type matches
// type only where the letters coincide, not wherever one line of text sits near another.
export function carryScore(ea, eb) {
  const pts = [];
  for (let y = 2; y < CH - 2; y++) for (let x = 2; x < CW - 2; x++) if (ea[y * CW + x]) pts.push(x, y);
  const n = pts.length / 2;
  if (n < CARRY.min_edges) return null;
  const stride = Math.max(1, Math.floor(n / CARRY.max_pts)), P = [];
  for (let i = 0; i < n; i += stride) P.push(pts[2 * i], pts[2 * i + 1]);
  const db = new Uint8Array(CW * CH);
  for (let y = 1; y < CH - 1; y++) for (let x = 1; x < CW - 1; x++) {
    const o = y * CW + x;
    if (eb[o] || eb[o - 1] || eb[o + 1] || eb[o - CW] || eb[o + CW]) db[o] = 1;
  }
  const coarse = field(db), exact = field(eb);
  const rx = Math.round(CARRY.radius * CW), ry = Math.round(CARRY.radius * CH), step = 3; // the same share of each side
  const top = [], all = [];
  for (const s of CARRY.scales) for (let dy = -ry; dy <= ry; dy += step) for (let dx = -rx; dx <= rx; dx += step) {
    const sc = at(P, coarse, s, dx, dy); all.push({ sc, s, dx, dy });
    if (top.length < CARRY.refine || sc > top[top.length - 1].sc) { top.push({ sc, s, dx, dy }); top.sort((p, q) => q.sc - p.sc); top.length = Math.min(top.length, CARRY.refine); }
  }
  let best = { score: 0, scale: 1, dx: 0, dy: 0 }, at0 = top[0];
  for (const c of top) for (const ds of [0.96, 1, 1.04]) for (let ey = -2; ey <= 2; ey++) for (let ex = -2; ex <= 2; ex++) {
    const sc = at(P, exact, c.s * ds, c.dx + ex, c.dy + ey);
    if (sc > best.score) { best = { score: sc, scale: Math.round(c.s * ds * 100) / 100, dx: c.dx + ex, dy: c.dy + ey }; at0 = c; }
  }
  // a real carry is a sharp peak: one transform fits far better than the rest. A match that many transforms share (type landing
  // on other type, a texture) is a plateau, not a carry, so the score is the peak's height over the 99th percentile of the search
  // away from the peak (its own neighbours, within 6 px and one scale step, fit well too and do not count against it)
  const far = all.filter((x) => Math.abs(x.dx - at0.dx) > 6 || Math.abs(x.dy - at0.dy) > 6 || Math.abs(Math.log(x.s / at0.s)) > 0.15).map((x) => x.sc).sort((p, q) => p - q);
  const plateau = far.length ? Math.max(0, far[Math.floor(far.length * 0.99)]) : 0;
  // structure that stays where it was (a card, a line of type, a frame device) is unambiguous whatever the plateau: the pixels coincide
  let still = 0;
  for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) still = Math.max(still, at(P, exact, 1, ex, ey));
  return { score: Math.round(Math.max(0, best.score - plateau, still) * 1000) / 1000, fit: Math.round(Math.max(best.score, still) * 1000) / 1000, scale: best.scale, dx: best.dx, dy: best.dy, edges: n };
}

export async function measureCarry(file, { seams = null, frames = null } = {}) {
  frames = frames || decodeGrey(file);
  const cuts = findCuts(frames);
  const times = seams && seams.length ? seams : cuts;
  const masks = new Map();
  const mask = (i) => { i = Math.min(frames.length - 1, Math.max(0, i)); if (!masks.has(i)) masks.set(i, edgeMask(frames[i])); return masks.get(i); };
  const out = [];
  for (const t of times) {
    if (t * CFPS < 1 || t * CFPS > frames.length - 2) continue;
    let best = null;
    for (const g of CARRY.gaps) {
      const ia = Math.round((t - g) * CFPS), ib = Math.round((t + g) * CFPS);
      if (ia < 0 || ib >= frames.length) continue;
      const r = carryScore(mask(ia), mask(ib));
      if (r && (!best || r.score > best.score)) best = { ...r, dt: g };
    }
    out.push(best ? { t: Math.round(t * 100) / 100, ...best } : { t: Math.round(t * 100) / 100, score: null });
  }
  return { seams: out, cuts, frames: frames.length, duration: frames.length / CFPS };
}

if (process.argv[1] && process.argv[1].endsWith("carry.mjs")) {
  const [file, list] = process.argv.slice(2);
  const r = await measureCarry(file, { seams: list ? list.split(",").map(Number) : null });
  for (const s of r.seams) console.log(`${String(s.t).padStart(6)} s  ${s.score == null ? "  n/a (nothing before the seam)" : `${s.score.toFixed(2)}  ±${s.dt} s  scale ${s.scale}  shift ${s.dx},${s.dy}  edges ${s.edges}`}`);
}
