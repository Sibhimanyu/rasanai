// Camera moves, measured on a render: what the camera does, beat by beat (lemo: "at least 4 different moves and one
// signature shot"). Grey frames from ffmpeg (320 px wide, 15 fps, no window). Per frame, block matching on the textured
// blocks (pyramid search, sub-pixel V fit) and one robust affine fit for the whole frame. The fit counts as the CAMERA
// only when it explains half the textured blocks or more and they cover the frame (5 of 9 cells, or one plane spanning
// half of it both ways, and never under 35% either way): one card sliding over a flat ground, or a line that recentres
// while it types, is a layer, not the camera. A zoom must scale both axes and a turn shear both ways, with radial
// (turning) speed growing with the distance from the centre. Two baselines: 1 frame (fast moves, to ~110% of the width a
// second) and 6 frames (slow pushes and drifts).
// Each frame is labelled, labels run into moves (0.4 s at least, median speed over the floor; a whip 0.1 s):
//   push-in / pull-out   zoom 1%/s or more            rotate     4 deg/s or more
//   pan-truck / tilt     shift 2% of the width a second or more, horizontal / vertical
//   whip                 shift 60%W/s or more, or a burst of directional motion blur where the match fails
//   handheld-drift       a wandering shift (0.4 to 2%W/s, net under half its path over 1.5 s)
//   locked               none of these
// A 2D film has no lens, but a whole-frame slide, scale or turn reads as one; that is what is counted. A cut-in (a scale
// jump across a cut) is a cut, and a heavy depth-of-field blur hides a move. Calibrated 2026-10-14 on the reference
// films by eye (references/craft.md "Camera variety" has the table).
//
//   import { measureCamera } from "./lib/camera-moves.mjs";
//   const c = await measureCamera(mp4, { beats: [{ id, start, end }] });   // beats omitted: shots between hard cuts
//   -> { moves: [{ kind, t0, t1, speed }], beats: [{ id, start, end, camera, moves }], kinds: [...], locked_share }
//   node lib/camera-moves.mjs <film.mp4>     the table, for calibration
import { spawnSync } from "node:child_process";

export const CW = 320, CH = 180, CFPS = 15;
export const CAMERA = {
  block: 16, tex: 14, // block size; a block is textured when its mean gradient is at least this
  inlier_share: 0.5, cells: 5, span: 0.5, span_min: 0.35, // the fit must explain this share of textured blocks, spread over this many of 9 cells
  zoom: 1, rot: 4, pan: 2, whip: 60, shape_corr: 0.5, axis_agree: 0.35, // thresholds: %/s, deg/s, %W/s, %W/s
  hand_lo: 0.4, hand_hi: 2, hand_window_s: 1.5, hand_net: 0.5,
  min_move_s: 0.4, min_whip_s: 0.1, gap_s: 0.4, long: 6,
  beat_share: 0.25, // a beat's camera is the move covering at least this share of it, else locked
};
export const KINDS = ["locked", "push-in", "pull-out", "pan-truck", "tilt", "rotate", "handheld-drift", "whip"];
// the render's floor: moving kinds by film length (the references: 0 to 2 under 25 s, 2 to 3 at 45 to 55 s, 4 at 87 and 157 s)
export const cameraFloor = (dur) => (dur >= 90 ? 3 : dur >= 40 ? 2 : dur >= 15 ? 1 : 0);
// a score's camera words -> a kind: the move named first ("push-in: toward the slot", "T2 focus zoom" -> push-in,
// "T0 locked: the push lands" -> locked, "arc 28 deg right" -> pan-truck); null when it names none
const WORDS = [
  ["whip", /whip|swish/], ["pull-out", /pull[- ]?(out|back)|dolly[- ]?(out|back)|zoom[- ]?out|step[s]? out|widen/],
  ["push-in", /push|dolly[- ]?in|zoom|crash|punch[- ]?in|lean[- ]?in|\bt[123]\b/], ["handheld-drift", /hand[- ]?held|drift|float|sway|shake/],
  ["rotate", /\broll|rotat|spin|dutch/], ["tilt", /tilt|crane|pedestal|boom/], ["pan-truck", /\bpan|truck|track|\barc|orbit|follow/],
  ["locked", /\block|static|\bt0\b/],
];
export function cameraKind(text) {
  const t = String(text || "").toLowerCase();
  let best = null;
  for (const [kind, re] of WORDS) { const m = t.match(re); if (m && (best == null || m.index < best.at)) best = { kind, at: m.index }; }
  return best ? best.kind : null;
}

function decode(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `fps=${CFPS},scale=${CW}:${CH}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 2 ** 31 });
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${file}: ${String(r.stderr || "").trim().split("\n").pop()}`);
  const n = Math.floor(r.stdout.length / (CW * CH)), out = [];
  for (let i = 0; i < n; i++) out.push(r.stdout.subarray(i * CW * CH, (i + 1) * CW * CH));
  return out;
}
function half(src, w, h) {
  const w2 = w >> 1, h2 = h >> 1, out = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const o = 2 * y * w + 2 * x; out[y * w2 + x] = (src[o] + src[o + 1] + src[o + w] + src[o + w + 1] + 2) >> 2; }
  return out;
}
function sad(P, C, w, h, x0, y0, n, u, v, best) {
  if (x0 + u < 0 || y0 + v < 0 || x0 + u + n > w || y0 + v + n > h) return Infinity;
  let s = 0;
  for (let y = 0; y < n; y++) {
    let po = (y0 + y) * w + x0, co = (y0 + y + v) * w + x0 + u;
    for (let x = 0; x < n; x++) { const d = P[po++] - C[co++]; s += d < 0 ? -d : d; }
    if (s >= best) return s;
  }
  return s;
}
function refine(P, C, w, h, x0, y0, n, u0, v0, r) {
  let bu = u0, bv = v0, bc = sad(P, C, w, h, x0, y0, n, u0, v0, Infinity);
  for (let v = v0 - r; v <= v0 + r; v++) for (let u = u0 - r; u <= u0 + r; u++) {
    if (u === u0 && v === v0) continue;
    const c = sad(P, C, w, h, x0, y0, n, u, v, bc);
    if (c < bc) { bc = c; bu = u; bv = v; }
  }
  return { u: bu, v: bv, c: bc };
}
const pyr = (f) => { const l1 = half(f, CW, CH), l2 = half(l1, CW >> 1, CH >> 1); return { l0: f, l1, l2 }; };

// textured blocks of a frame: [x0, y0] (blocks on the frame's border ring are skipped: the search runs off the edge)
function textured(f) {
  const B = CAMERA.block, out = [];
  for (let y0 = B; y0 + 2 * B <= CH; y0 += B) for (let x0 = B; x0 + 2 * B <= CW; x0 += B) {
    let g = 0;
    for (let y = y0 + 1; y < y0 + B - 1; y += 2) for (let x = x0 + 1; x < x0 + B - 1; x += 2) { const o = y * CW + x; g += Math.abs(f[o + 1] - f[o - 1]) + Math.abs(f[o + CW] - f[o - CW]); }
    if (g / ((B / 2 - 1) ** 2) >= CAMERA.tex) out.push([x0, y0]);
  }
  return out;
}
// the motion of each textured block from frame A to frame B: [cx, cy, u, v] (centre relative to the frame centre), sub-pixel
function vectors(A, Bp, blocks) {
  const B = CAMERA.block, out = [];
  for (const [x0, y0] of blocks) {
    const qx = (x0 >> 2), qy = (y0 >> 2), qn = B >> 2;
    let best = { u: 0, v: 0, c: sad(A.l2, Bp.l2, CW >> 2, CH >> 2, qx, qy, qn, 0, 0, Infinity) };
    for (let v = -6; v <= 6; v++) for (let u = -6; u <= 6; u++) { const c = sad(A.l2, Bp.l2, CW >> 2, CH >> 2, qx, qy, qn, u, v, best.c); if (c < best.c) best = { u, v, c }; }
    const r1 = refine(A.l1, Bp.l1, CW >> 1, CH >> 1, x0 >> 1, y0 >> 1, B >> 1, best.u * 2, best.v * 2, 1);
    const c = refine(A.l0, Bp.l0, CW, CH, x0, y0, B, r1.u * 2, r1.v * 2, 1);
    let fu = c.u, fv = c.v;
    const cl = sad(A.l0, Bp.l0, CW, CH, x0, y0, B, c.u - 1, c.v, Infinity), cr = sad(A.l0, Bp.l0, CW, CH, x0, y0, B, c.u + 1, c.v, Infinity);
    const cu = sad(A.l0, Bp.l0, CW, CH, x0, y0, B, c.u, c.v - 1, Infinity), cd = sad(A.l0, Bp.l0, CW, CH, x0, y0, B, c.u, c.v + 1, Infinity);
    let sl = Math.max(cl, cr) - c.c;
    if (isFinite(sl) && sl > 0) fu += Math.max(-0.5, Math.min(0.5, (cl - cr) / (2 * sl)));
    sl = Math.max(cu, cd) - c.c;
    if (isFinite(sl) && sl > 0) fv += Math.max(-0.5, Math.min(0.5, (cu - cd) / (2 * sl)));
    // a block nothing matches (it appeared, faded or changed) says nothing about the camera
    if (c.c > B * B * 12) continue;
    out.push([x0 + B / 2 - CW / 2, y0 + B / 2 - CH / 2, fu, fv]);
  }
  return out;
}
// robust affine fit (a perspective card or a 3D plane is close to affine over a frame step); null when it does not
// explain the frame. Its zoom is the divergence, its turn the curl; shear (a plane tilting in depth) is not a camera kind.
function solve3(M, r) {
  const [a, b, c, d, e, f, g, h, i] = M, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-9) return null;
  return [(r[0] * (e * i - f * h) - b * (r[1] * i - f * r[2]) + c * (r[1] * h - e * r[2])) / det, (a * (r[1] * i - f * r[2]) - r[0] * (d * i - f * g) + c * (d * r[2] - r[1] * g)) / det, (a * (e * r[2] - r[1] * h) - b * (d * r[2] - r[1] * g) + r[0] * (d * h - e * g)) / det];
}
function fit(pts, tol) {
  if (pts.length < 12) return null;
  let use = pts, m = null;
  for (let it = 0; it < 4; it++) {
    let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, n = use.length, xu = 0, yu = 0, su = 0, xv = 0, yv = 0, sv = 0;
    for (const [x, y, u, v] of use) { sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y; xu += x * u; yu += y * u; su += u; xv += x * v; yv += y * v; sv += v; }
    const M = [sxx, sxy, sx, sxy, syy, sy, sx, sy, n];
    const pu = solve3(M, [xu, yu, su]), pv = solve3(M, [xv, yv, sv]);
    if (!pu || !pv) return null;
    m = { a: pu[0], b: pu[1], tx: pu[2], c: pv[0], d: pv[1], ty: pv[2] };
    const next = pts.filter(([x, y, u, v]) => Math.hypot(u - (m.a * x + m.b * y + m.tx), v - (m.c * x + m.d * y + m.ty)) < tol);
    if (next.length < 8) return null;
    use = next;
  }
  if (use.length / pts.length < CAMERA.inlier_share) return null;
  // spread: the inliers cover the frame (5 of 9 cells), or one big plane (a card, a screen, a field) spanning most of it
  const cells = new Set(use.map(([x, y]) => Math.min(2, Math.floor((x / CW + 0.5) * 3)) * 3 + Math.min(2, Math.floor((y / CH + 0.5) * 3))));
  const xs = use.map((p) => p[0]), ys = use.map((p) => p[1]);
  const spanX = (Math.max(...xs) - Math.min(...xs) + CAMERA.block) / CW, spanY = (Math.max(...ys) - Math.min(...ys) + CAMERA.block) / CH;
  if (spanX < CAMERA.span_min || spanY < CAMERA.span_min) return null; // one line of type (recentring as it types) is never the camera
  if (cells.size < CAMERA.cells && !(spanX >= CAMERA.span && spanY >= CAMERA.span)) return null;
  // a zoom or a turn must be the field's own shape: radial (turning) speed grows with the distance from the centre on
  // blocks all round the frame. Type that recentres while it types, a ring of icons, a fan of cards fake a divergence.
  const corr = (f) => { const v = use.map(([x, y, u, w]) => [Math.hypot(x, y), f(x, y, u - m.tx, w - m.ty)]).filter(([r]) => r > 8); if (v.length < 12) return 0; const n = v.length, mr = v.reduce((a, b) => a + b[0], 0) / n, mv = v.reduce((a, b) => a + b[1], 0) / n; let sxy = 0, sxx = 0, syy = 0; for (const [r, q] of v) { sxy += (r - mr) * (q - mv); sxx += (r - mr) ** 2; syy += (q - mv) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0; };
  const s = (m.a + m.d) / 2, r = (m.c - m.b) / 2;
  // ... and both axes agree: a zoom scales x AND y (du/dx and dv/dy, same sign), a turn shears both ways (-du/dy and
  // dv/dx). A line that recentres under a still logo is a shear on one axis only.
  const agree = (p, q) => Math.sign(p) === Math.sign(q) && Math.min(Math.abs(p), Math.abs(q)) >= CAMERA.axis_agree * Math.max(Math.abs(p), Math.abs(q));
  const zoomAxes = agree(m.a, m.d), rotAxes = agree(-m.b, m.c);
  const zoomOk = zoomAxes && Math.abs(corr((x, y, u, v) => (x * u + y * v) / Math.hypot(x, y)) * Math.sign(s || 1)) >= CAMERA.shape_corr;
  const rotOk = rotAxes && Math.abs(corr((x, y, u, v) => (x * v - y * u) / Math.hypot(x, y)) * Math.sign(r || 1)) >= CAMERA.shape_corr;
  return { s: zoomOk ? s : 0, r: rotOk ? r : 0, tx: m.tx, ty: m.ty };
}
// directional blur: share of horizontal gradient in the frame (a horizontal whip blurs it away)
function gradRatio(f) {
  let gx = 0, gy = 0;
  for (let y = 2; y < CH - 2; y += 2) for (let x = 2; x < CW - 2; x += 2) { const o = y * CW + x; gx += Math.abs(f[o + 1] - f[o - 1]); gy += Math.abs(f[o + CW] - f[o - CW]); }
  return { gx, gy, g: (gx + gy) / ((CW / 2) * (CH / 2)) };
}
const median = (a) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const r2 = (x) => Math.round(x * 100) / 100;

// per frame: { t, ok, pan, tilt (%W/s), zoom (%/s), rot (deg/s), cut }
export function frameMotion(frames) {
  const P = frames.map(pyr), out = [];
  const L = CAMERA.long;
  for (let i = 0; i < frames.length; i++) {
    const row = { t: i / CFPS, ok: false, pan: 0, tilt: 0, zoom: 0, rot: 0, cut: false, gr: gradRatio(frames[i]) };
    if (i === 0) { out.push(row); continue; }
    const blocks = textured(frames[i - 1]);
    const short = fit(vectors(P[i - 1], P[i], blocks), 0.6);
    let m = short, dt = 1 / CFPS;
    if (short) {
      const fast = Math.hypot(short.tx, short.ty) / CW * CFPS * 100;
      if (fast < 15 && i >= L) {
        const lb = textured(frames[i - L]);
        const long = fit(vectors(P[i - L], P[i], lb), 1.0);
        if (long) { m = long; dt = L / CFPS; }
      }
    }
    if (m) Object.assign(row, { ok: true, pan: (m.tx / CW / dt) * 100, tilt: (m.ty / CW / dt) * 100, zoom: (m.s / dt) * 100, rot: (Math.atan(m.r) * 180 / Math.PI) / dt });
    // a hard cut: the mean change spikes against its neighbours
    let d = 0, n = 0;
    for (let p = 0; p < frames[i].length; p += 7) { d += Math.abs(frames[i][p] - frames[i - 1][p]); n++; }
    row.ad = d / n;
    if (process.env.CAMDBG) console.error(r2(row.t), row.ok ? `pan ${r2(row.pan)} tilt ${r2(row.tilt)} zoom ${r2(row.zoom)} rot ${r2(row.rot)} dt ${r2(dt)}` : `no fit (${blocks.length} blocks)`);
    out.push(row);
  }
  for (let i = 2; i < out.length - 2; i++) {
    const nb = [out[i - 2].ad, out[i - 1].ad, out[i + 1].ad, out[i + 2].ad].sort((x, y) => x - y), ref = (nb[1] + nb[2]) / 2;
    if (out[i].ad >= 14 && out[i].ad >= 3.5 * Math.max(ref, 1) && out[i].ad >= out[i - 1].ad && out[i].ad >= out[i + 1].ad) out[i].cut = true;
  }
  return out;
}

// label each frame, then runs of one label become moves
export function classify(rows) {
  const C = CAMERA, n = rows.length;
  // a 0.33 s median smooths block noise without eating a whip
  const k = 2, sm = rows.map((r, i) => {
    if (!r.ok) return null;
    const win = rows.slice(Math.max(0, i - k), i + k + 1).filter((x) => x.ok && !x.cut);
    return { pan: median(win.map((x) => x.pan)), tilt: median(win.map((x) => x.tilt)), zoom: median(win.map((x) => x.zoom)), rot: median(win.map((x) => x.rot)) };
  });
  const lab = sm.map((m, i) => {
    if (rows[i].cut) return "cut";
    if (!m) return null;
    const sp = Math.hypot(m.pan, m.tilt), raw = Math.hypot(rows[i].pan, rows[i].tilt);
    if (raw >= C.whip && sp >= C.whip * 0.5) return "whip";
    // which effect dominates at the frame's edge: zoom (%/s of half the width), rotation (deg/s at the corner), shift
    const zEdge = Math.abs(m.zoom) / 2, rEdge = Math.abs(m.rot) * Math.PI / 180 * 0.5 * 100;
    if (Math.abs(m.zoom) >= C.zoom && zEdge >= sp * 0.5 && zEdge >= rEdge) return m.zoom > 0 ? "push-in" : "pull-out";
    if (Math.abs(m.rot) >= C.rot && rEdge >= sp * 0.5) return "rotate";
    if (sp >= C.pan) return Math.abs(m.pan) >= Math.abs(m.tilt) ? "pan-truck" : "tilt";
    return "locked";
  });
  // whip by blur: a frame whose gradient collapses on one axis between two settled frames (the match fails there)
  for (let i = 3; i < n - 3; i++) {
    if (lab[i] && lab[i] !== "locked" && lab[i] !== null) continue;
    const ctx = [rows[i - 3], rows[i + 3]].map((r) => r.gr), me = rows[i].gr;
    const base = (ctx[0].g + ctx[1].g) / 2;
    const dirNow = me.gx / Math.max(1, me.gy), dirCtx = median(ctx.map((g) => g.gx / Math.max(1, g.gy)));
    if (base > 4 && me.g < 0.6 * base && (dirNow < dirCtx / 2.5 || dirNow > dirCtx * 2.5) && rows[i].ad > 10 && !rows[i].ok) lab[i] = "whip";
  }
  // handheld drift: frames labelled locked whose shift wanders (path speed in range, net small) over 1.5 s
  const W = Math.round(C.hand_window_s * CFPS);
  const hand = new Array(n).fill(false);
  for (let i = 0; i + W <= n; i++) {
    const seg = rows.slice(i, i + W);
    if (!seg.every((r, j) => r.ok && lab[i + j] === "locked")) continue;
    let px = 0, py = 0, path = 0;
    for (const r of seg) { px += r.pan; py += r.tilt; path += Math.hypot(r.pan, r.tilt); }
    const speed = path / W, net = Math.hypot(px, py) / Math.max(1e-6, path);
    if (speed >= C.hand_lo && speed <= C.hand_hi && net < C.hand_net) for (let j = i; j < i + W; j++) hand[j] = true;
  }
  for (let i = 0; i < n; i++) if (hand[i]) lab[i] = "handheld-drift";
  // runs (a gap of null or a short other label inside a run is bridged)
  const moves = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    const len = (cur.i1 - cur.i0 + 1) / CFPS;
    if (cur.kind !== "locked" && len + 1e-9 >= (cur.kind === "whip" ? C.min_whip_s : C.min_move_s)) {
      const seg = rows.slice(cur.i0, cur.i1 + 1).filter((r) => r.ok);
      const v = cur.kind === "push-in" || cur.kind === "pull-out" ? median(seg.map((r) => Math.abs(r.zoom))) : cur.kind === "rotate" ? median(seg.map((r) => Math.abs(r.rot))) : median(seg.map((r) => Math.hypot(r.pan, r.tilt)));
      const floor = { "push-in": C.zoom, "pull-out": C.zoom, rotate: C.rot, "pan-truck": C.pan, tilt: C.pan }[cur.kind];
      if (floor && !(v >= floor)) { cur = null; return; } // flickered over the line on a few frames: not a move
      moves.push({ kind: cur.kind, t0: r2(cur.i0 / CFPS), t1: r2((cur.i1 + 1) / CFPS), speed: v == null ? null : r2(v), unit: cur.kind === "rotate" ? "deg/s" : cur.kind === "push-in" || cur.kind === "pull-out" ? "%/s" : "%W/s" });
    }
    cur = null;
  };
  const gap = Math.round(C.gap_s * CFPS);
  for (let i = 0; i < n; i++) {
    const l = lab[i];
    if (l === "cut") { close(); continue; }
    if (cur && l === cur.kind) { cur.i1 = i; continue; }
    if (cur && (l == null || l !== cur.kind)) {
      // bridge a short interruption when the same move resumes within the gap
      let j = i; while (j < n && j - i < gap && lab[j] !== cur.kind && lab[j] !== "cut") j++;
      if (j < n && lab[j] === cur.kind && j - i < gap) { cur.i1 = j; i = j; continue; }
      close();
    }
    if (l && l !== "cut") cur = { kind: l, i0: i, i1: i };
  }
  close();
  return { moves, labels: lab };
}

// beats: the plan's, else the shots between hard cuts; each beat's camera is the move covering most of it (25% at least)
export function beatsOf(moves, rows, beats) {
  const dur = rows.length / CFPS;
  let list = beats && beats.length ? beats.map((b) => ({ id: String(b.id), start: Number(b.start), end: Number(b.end) })) : null;
  if (!list) {
    const cuts = rows.filter((r) => r.cut).map((r) => r.t);
    const edges = [0, ...cuts, dur];
    list = [];
    for (let k = 0; k + 1 < edges.length; k++) if (edges[k + 1] - edges[k] >= 0.3) list.push({ id: `shot ${list.length + 1}`, start: r2(edges[k]), end: r2(edges[k + 1]) });
  }
  return list.map((b) => {
    const len = Math.max(1e-6, Math.min(b.end, dur) - b.start);
    const cover = {};
    for (const m of moves) { const o = Math.min(m.t1, b.end) - Math.max(m.t0, b.start); if (o > 0) cover[m.kind] = (cover[m.kind] || 0) + o; }
    const top = Object.entries(cover).sort((x, y) => y[1] - x[1])[0];
    const camera = top && (top[1] / len >= CAMERA.beat_share || top[0] === "whip") ? top[0] : "locked";
    return { ...b, camera, moves: Object.keys(cover) };
  });
}

export async function measureCamera(file, { beats = null } = {}) {
  const frames = decode(file);
  if (frames.length < 8) throw new Error(`${file} has ${frames.length} frames`);
  const rows = frameMotion(frames);
  const { moves } = classify(rows);
  const bs = beatsOf(moves, rows, beats);
  const kinds = [...new Set([...moves.map((m) => m.kind), ...bs.map((b) => b.camera)])].sort((a, b) => KINDS.indexOf(a) - KINDS.indexOf(b));
  const moving = kinds.filter((k) => k !== "locked");
  const lockedShare = bs.length ? bs.filter((b) => b.camera === "locked").length / bs.length : 1;
  // the signature candidate: the biggest move (longest x fastest, a whip counts as one)
  const sig = moves.slice().sort((a, b) => (b.t1 - b.t0) * (b.speed || 1) - (a.t1 - a.t0) * (a.speed || 1))[0] || null;
  return { duration_s: r2(frames.length / CFPS), moves, beats: bs, kinds, moving_kinds: moving.length, locked_share: r2(lockedShare), signature: sig, measured_share: r2(rows.filter((r) => r.ok).length / rows.length) };
}

if (process.argv[1] && process.argv[1].endsWith("camera-moves.mjs")) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node lib/camera-moves.mjs <film.mp4>"); process.exit(1); }
  const c = await measureCamera(file);
  console.log(`${c.duration_s} s · kinds ${c.kinds.join(", ")} · ${c.moving_kinds} moving · locked beats ${Math.round(c.locked_share * 100)}% · fit on ${Math.round(c.measured_share * 100)}% of frames`);
  for (const m of c.moves) console.log(`  ${m.t0}-${m.t1} s  ${m.kind}  ${m.speed} ${m.unit}`);
}
