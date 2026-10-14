// Carry at every seam, measured from the pixels (onetake: "never replace a beat, carry it: something on screen survives
// every section boundary"). For each seam (a beat boundary from the plan; with no plan, a hard cut found from frame
// differences) the frames just before and just after are compared (+-0.1 s and +-0.3 s, the best pair wins). The score is the
// share of the before-frame's foreground structure (edge pixels: type, shapes, card borders; a flat or soft-gradient ground has
// none) that reappears after, allowing a shift (up to 15% of the width) and a scale change (0.7 to 1.4): a carried object that
// moves or grows counts, and so does a match cut on a shape. The share is corrected for chance (how dense the after-frame's
// edges are), so a busy frame cannot score by luck; 0 = nothing survived, 1 = all of it did. Grey frames from ffmpeg, no window.
// A CUT-IN on the same object (the same shape much bigger or smaller than 0.7 to 1.4, as craft.md promises) is credited by a second
// pass, run only when the near-scale score is under far_skip: scales 0.2 to 5, the before-frame's centroid placed anywhere, A's points
// found in B and B's found in A. It counts only when it is verified three ways: the edge match is well over chance (a lower bound,
// each point on its own pixel, enough of them), its edge score is at least far_edge, and the grey picture where the edges matched
// correlates (NCC) at least far_ncc with the other frame; its score is then max(edge share, 0.6 x NCC). On the reference films and
// ours, the unverified far matches were mostly type landing on type (a logo on "One inbox"); the verified ones are real zooms.
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
  far_scales: [0.2, 0.23, 0.27, 0.31, 0.36, 0.42, 0.48, 0.55, 0.63, 1.6, 1.85, 2.1, 2.45, 2.8, 3.25, 3.75, 4.3, 5], // a cut-in on the same object: much bigger or smaller (the second pass)
  far_pts: 300, // edge pixels sampled from the before-frame in that pass
  far_skip: 0.4, // a near-scale score this high needs no second pass
  far_min_share: 0.12, // at least this share of the before-frame's points must land inside the frame, each on its own pixel
  far_min_pts: 150, // ... and at least this many
  far_ncc: 0.5, // ... and the grey picture under it must correlate at least this well with the other frame (a real cut-in 0.5 to 0.97, unrelated cuts 0.45 and below)
  far_edge: 0.12, // ... and its edge score (over chance, as a lower bound) at least this
  far_z: 3, // the match is scored this many standard deviations above chance
  far_step: 4, // its search: where the before-frame's centroid lands, every 4 px over the whole frame
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

const dilate = (eb) => {
  const db = new Uint8Array(CW * CH);
  for (let y = 1; y < CH - 1; y++) for (let x = 1; x < CW - 1; x++) {
    const o = y * CW + x;
    if (eb[o] || eb[o - 1] || eb[o + 1] || eb[o - CW] || eb[o + CW]) db[o] = 1;
  }
  return db;
};

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

// the same, with the scale taken about A's centroid g and the shift = where that centroid lands: the form the far-scale pass searches
const stamp = new Uint32Array(CW * CH);
let stampN = 0;
function atG(P, f, g, s, dx, dy) { // pixels count once (a shrunk frame piles its points onto a few pixels, which would score as a match by luck); points that
  let hit = 0, exp = 0, m = 0; // leave the frame are not counted (a cut-in shows one part of the before-frame, the rest is out of shot), but too few left is no match
  stampN++;
  for (let i = 0; i < P.length; i += 2) {
    const x = Math.round((P[i] - g[0]) * s + g[0] + dx), y = Math.round((P[i + 1] - g[1]) * s + g[1] + dy);
    if (x >= 0 && x < CW && y >= 0 && y < CH) { const o = y * CW + x; if (stamp[o] === stampN) continue; stamp[o] = stampN; m++; hit += f.mask[o]; exp += f.ld[o]; }
  }
  if (!(m >= CARRY.far_min_share * P.length / 2 && m >= CARRY.far_min_pts && m > exp)) return 0;
  // the best of tens of thousands of transforms: a few points can hit by luck, so the score is a lower bound (neighbouring edge pixels are not independent: 4x the variance)
  return (hit - exp - CARRY.far_z * Math.sqrt(4 * exp * (1 - exp / m))) / (m - exp);
}

// A cut-in on the same object: the same shape much bigger or smaller (beyond 0.7 to 1.4; a hard cut from a wide shot of a composer to
// its close-up). A second pass over the far scales, the before-frame's centroid placed anywhere in the frame (step 4 px), a thinner
// sample of its points; the best few refined pixel by pixel; the score is the peak over the 99th percentile of the other transforms.
function blur3(a) {
  const g = new Float32Array(CW * CH);
  for (let y = 1; y < CH - 1; y++) for (let x = 1; x < CW - 1; x++) {
    const o = y * CW + x;
    g[o] = (a[o - CW - 1] + a[o - CW] + a[o - CW + 1] + a[o - 1] + a[o] + a[o + 1] + a[o + CW - 1] + a[o + CW] + a[o + CW + 1]) / 9;
  }
  return g;
}
// normalised cross-correlation of A's grey pixels inside its foreground's box with B's under the transform (scale s about g, g landing at tx,ty): does the picture agree, not only the edges
function nccAt(ga, gb, box, g, s, tx, ty) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const bx = Math.round((x - g[0]) * s + tx), by = Math.round((y - g[1]) * s + ty);
    if (bx < 2 || bx >= CW - 2 || by < 2 || by >= CH - 2) continue;
    const a = ga[y * CW + x], b = gb[by * CW + bx];
    n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
  }
  if (n < 400) return 0;
  const va = saa - sa * sa / n, vb = sbb - sb * sb / n;
  return va > 1 && vb > 1 ? (sab - sa * sb / n) / Math.sqrt(va * vb) : 0;
}
function farScore(ea, eb, ga, gb) {
  const pts = [];
  for (let y = 2; y < CH - 2; y++) for (let x = 2; x < CW - 2; x++) if (ea[y * CW + x]) pts.push(x, y);
  if (pts.length / 2 < CARRY.min_edges) return null;
  const st = Math.max(1, Math.floor(pts.length / 2 / CARRY.max_pts)), P = [];
  for (let i = 0; i < pts.length / 2; i += st) P.push(pts[2 * i], pts[2 * i + 1]);
  const coarse = field(dilate(eb)), exact = field(eb);
  const g = [0, 0], n = P.length / 2;
  for (let i = 0; i < P.length; i += 2) { g[0] += P[i]; g[1] += P[i + 1]; }
  g[0] /= n; g[1] /= n;
  const stride = Math.max(1, Math.floor(n / CARRY.far_pts)), sub = [];
  for (let i = 0; i < n; i += stride) sub.push(P[2 * i], P[2 * i + 1]);
  const all = [], top = [];
  for (const s of CARRY.far_scales) for (let ty = 0; ty < CH; ty += CARRY.far_step) for (let tx = 0; tx < CW; tx += CARRY.far_step) {
    const sc = atG(sub, coarse, g, s, tx - g[0], ty - g[1]); all.push({ sc, s, tx, ty });
    if (top.length < CARRY.refine || sc > top[top.length - 1].sc) { top.push({ sc, s, tx, ty }); top.sort((p, q) => q.sc - p.sc); top.length = Math.min(top.length, CARRY.refine); }
  }
  let best = { score: 0, scale: 1, tx: 0, ty: 0 }, at0 = top[0];
  for (const c of top) for (const ds of [0.9, 0.95, 1, 1.05, 1.1]) for (let ey = -4; ey <= 4; ey++) for (let ex = -4; ex <= 4; ex++) {
    const sc = atG(P, exact, g, c.s * ds, c.tx + ex - g[0], c.ty + ey - g[1]);
    if (sc > best.score) { best = { score: sc, scale: Math.round(c.s * ds * 100) / 100, tx: c.tx + ex, ty: c.ty + ey }; at0 = c; }
  }
  if (!at0) return null;
  const far = all.filter((x) => Math.abs(x.tx - at0.tx) > 10 || Math.abs(x.ty - at0.ty) > 10 || Math.abs(Math.log(x.s / at0.s)) > 0.25).map((x) => x.sc).sort((p, q) => p - q);
  const plateau = far.length ? Math.max(0, far[Math.floor(far.length * 0.99)]) : 0;
  // the picture is compared where the edges matched (the box of A's points that hit B's edges, padded): a cut-in matches one object, not the whole wide shot
  let box = [CW, CH, 0, 0];
  for (let i = 0; i < P.length; i += 2) {
    const x = Math.round((P[i] - g[0]) * best.scale + best.tx), y = Math.round((P[i + 1] - g[1]) * best.scale + best.ty);
    if (x < 0 || x >= CW || y < 0 || y >= CH || !exact.mask[y * CW + x]) continue;
    box[0] = Math.min(box[0], P[i]); box[1] = Math.min(box[1], P[i + 1]); box[2] = Math.max(box[2], P[i]); box[3] = Math.max(box[3], P[i + 1]);
  }
  box = [Math.max(2, box[0] - 3), Math.max(2, box[1] - 3), Math.min(CW - 3, box[2] + 3), Math.min(CH - 3, box[3] + 3)];
  const ncc = ga && gb ? nccAt(blur3(ga), blur3(gb), box, g, best.scale, best.tx, best.ty) : null;
  return { score: Math.max(0, best.score - plateau), fit: best.score, ncc, scale: best.scale, dx: Math.round(best.tx - g[0]), dy: Math.round(best.ty - g[1]) };
}

// share of A's edge pixels that land on B's edges under the best shift and scale, corrected for chance. Two passes: a coarse
// search against B dilated by 1 px (a step of 3 px), then the best few refined pixel by pixel against B itself, so type matches
// type only where the letters coincide, not wherever one line of text sits near another.
export function carryScore(ea, eb, ga = null, gb = null) {
  const pts = [];
  for (let y = 2; y < CH - 2; y++) for (let x = 2; x < CW - 2; x++) if (ea[y * CW + x]) pts.push(x, y);
  const n = pts.length / 2;
  if (n < CARRY.min_edges) return null;
  const stride = Math.max(1, Math.floor(n / CARRY.max_pts)), P = [];
  for (let i = 0; i < n; i += stride) P.push(pts[2 * i], pts[2 * i + 1]);
  const coarse = field(dilate(eb)), exact = field(eb);
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
  const near = { score: Math.max(0, best.score - plateau, still), fit: Math.max(best.score, still), scale: best.scale, dx: best.dx, dy: best.dy };
  let farR = null; // already carried at a near scale: no second pass
  if (near.score < CARRY.far_skip) {
    const f1 = farScore(ea, eb, ga, gb), f2 = farScore(eb, ea, gb, ga); // the same object much bigger or smaller: A's points found in B, or B's found in A (a cut-in shows only part of the wide shot)
    if (f2) f2.scale = Math.round(100 / f2.scale) / 100;
    // an edge match at some far scale is easy to find (type lands on type); it counts only when the grey picture there agrees too (NCC)
    // and a verified match is scored by that agreement too (the edges of a cut-in are a small share of a wide shot's foreground): max(edge share, 0.6 x NCC)
    farR = [f1, f2].filter((f) => f && f.ncc != null && f.ncc >= CARRY.far_ncc && f.score >= CARRY.far_edge).map((f) => ({ ...f, score: Math.max(f.score, 0.6 * f.ncc) })).sort((p, q) => q.score - p.score)[0] || null;
  }
  const pick = farR && farR.score > near.score ? farR : near;
  return { ncc: pick.ncc == null ? undefined : Math.round(pick.ncc * 100) / 100, score: Math.round(pick.score * 1000) / 1000, fit: Math.round(pick.fit * 1000) / 1000, scale: pick.scale, dx: pick.dx, dy: pick.dy, edges: n };
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
      const r = carryScore(mask(ia), mask(ib), frames[ia], frames[ib]);
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
